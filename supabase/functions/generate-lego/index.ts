// ============================================================
// SNAPP · Edge Function: generate-lego
// Genera la versión LEGO de la foto con proveedores conmutables:
//   Principal:  Google (Nano Banana 2 = gemini-3.1-flash-image)
//               backend AI Studio  ↔  Vertex AI  (por env, sin tocar código)
//   Respaldo:   OpenAI (gpt-image-1) si Google falla o tarda demasiado
//
// 1) Guarda la foto original en Storage (bucket privado 'originals')
// 2) Genera el LEGO con el proveedor principal (con fallback)
// 3) Guarda la imagen generada en Storage (bucket público 'generated')
// 4) Registra el submission en la base de datos
// ============================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ---------- Configuración de proveedores (todo por env) ----------
// IMAGE_PROVIDER: 'google' (default) | 'openai'   → proveedor principal
// GOOGLE_BACKEND: 'aistudio' (default) | 'vertex' → backend de Google
// ENABLE_OPENAI_FALLBACK: 'true' (default) | 'false'
// IMAGE_PROVIDER_TIMEOUT_MS: ms antes de abortar el principal y pasar al respaldo
const IMAGE_PROVIDER = (Deno.env.get('IMAGE_PROVIDER') ?? 'google').toLowerCase()
const GOOGLE_BACKEND = (Deno.env.get('GOOGLE_BACKEND') ?? 'aistudio').toLowerCase()
const ENABLE_OPENAI_FALLBACK =
  (Deno.env.get('ENABLE_OPENAI_FALLBACK') ?? 'true').toLowerCase() !== 'false'
const TIMEOUT_MS = Number(Deno.env.get('IMAGE_PROVIDER_TIMEOUT_MS') ?? '90000')

// Modelos (Nano Banana 2 por defecto; configurables)
const GOOGLE_AI_MODEL = Deno.env.get('GOOGLE_AI_MODEL') ?? 'gemini-3.1-flash-image'
const GOOGLE_VERTEX_MODEL =
  Deno.env.get('GOOGLE_VERTEX_MODEL') ?? 'gemini-3.1-flash-image'
const OPENAI_IMAGE_MODEL = Deno.env.get('OPENAI_IMAGE_MODEL') ?? 'gpt-image-1'

// Nombre del evento/campaña para segmentar métricas (override por body.eventName)
const EVENT_NAME = Deno.env.get('EVENT_NAME') ?? 'demo'

// Modelo concreto según el proveedor que ganó (para métricas)
const modelForProvider = (p: string) =>
  p === 'openai'
    ? OPENAI_IMAGE_MODEL
    : p === 'google:vertex'
      ? GOOGLE_VERTEX_MODEL
      : GOOGLE_AI_MODEL

// Credenciales
const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY') ?? ''
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? ''
// Vertex
const VERTEX_PROJECT_ID = Deno.env.get('VERTEX_PROJECT_ID') ?? ''
const VERTEX_LOCATION = Deno.env.get('VERTEX_LOCATION') ?? 'global'
const GOOGLE_SERVICE_ACCOUNT_JSON =
  Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') ?? ''

const PROMPT =
  'Toma todas las referencias visuales, estéticas y de vestimenta de esta foto, ' +
  'y conviértelo en un personaje de LEGO. Si hay varias personas, conviértelas ' +
  'a todas en personajes de LEGO, conservando sus rasgos, colores de ropa y ' +
  'peinados de forma reconocible. Estilo minifigura de LEGO, alta calidad.'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

// ---------- Utilidades ----------
type Img = { bytes: Uint8Array; mime: string }

function decodeDataUrl(input: string): Img {
  let mime = 'image/jpeg'
  let b64 = input
  const m = input.match(/^data:([^;]+);base64,(.*)$/s)
  if (m) {
    mime = m[1]
    b64 = m[2]
  }
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, mime }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

const extFromMime = (mime: string) =>
  mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'

function base64UrlFromString(s: string): string {
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
function base64UrlFromBytes(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

// Aborta una promesa si tarda más de ms (para el fallback por latencia)
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label}: timeout tras ${ms}ms`)),
      ms,
    )
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

// ---------- Parseo de respuesta Gemini (AI Studio y Vertex comparten formato) ----------
function extractGeminiImage(data: any): Img {
  const parts = data?.candidates?.[0]?.content?.parts ?? []
  for (const part of parts) {
    const inline = part?.inlineData ?? part?.inline_data
    if (inline?.data) {
      const b64 = inline.data
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return { bytes, mime: inline.mimeType ?? inline.mime_type ?? 'image/png' }
    }
  }
  throw new Error(
    'Gemini no devolvió imagen. Respuesta: ' + JSON.stringify(data).slice(0, 400),
  )
}

function geminiBody(img: Img) {
  return {
    contents: [
      {
        parts: [
          { text: PROMPT },
          {
            inline_data: {
              mime_type: img.mime,
              data: bytesToBase64(img.bytes),
            },
          },
        ],
      },
    ],
    // Estos modelos NO soportan salida solo-imagen: hay que pedir TEXT + IMAGE.
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  }
}

// ---------- Proveedor: Google AI Studio ----------
async function genAIStudio(img: Img, signal: AbortSignal): Promise<Img> {
  if (!GOOGLE_AI_API_KEY) throw new Error('Falta GOOGLE_AI_API_KEY')
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    GOOGLE_AI_MODEL +
    ':generateContent'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GOOGLE_AI_API_KEY,
    },
    body: JSON.stringify(geminiBody(img)),
    signal,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`AI Studio ${res.status}: ${txt.slice(0, 400)}`)
  }
  return extractGeminiImage(await res.json())
}

// ---------- Proveedor: Vertex AI ----------
// Token OAuth a partir de la service account (JWT RS256 → oauth2)
async function getVertexAccessToken(): Promise<string> {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON)
    throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON')
  const sa = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON)

  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }
  const unsigned =
    base64UrlFromString(JSON.stringify(header)) +
    '.' +
    base64UrlFromString(JSON.stringify(claim))

  // Importa la private key (PEM PKCS8) y firma
  const pemBody = String(sa.private_key)
    .replaceAll('-----BEGIN PRIVATE KEY-----', '')
    .replaceAll('-----END PRIVATE KEY-----', '')
    .replaceAll('\n', '')
    .replaceAll('\r', '')
    .trim()
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(unsigned),
    ),
  )
  const jwt = unsigned + '.' + base64UrlFromBytes(sig)

  const tokRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:
      'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt,
  })
  if (!tokRes.ok) {
    const txt = await tokRes.text()
    throw new Error(`Vertex OAuth ${tokRes.status}: ${txt.slice(0, 300)}`)
  }
  const tok = await tokRes.json()
  if (!tok.access_token) throw new Error('Vertex OAuth sin access_token')
  return tok.access_token
}

async function genVertex(img: Img, signal: AbortSignal): Promise<Img> {
  if (!VERTEX_PROJECT_ID) throw new Error('Falta VERTEX_PROJECT_ID')
  const token = await getVertexAccessToken()
  const host =
    VERTEX_LOCATION === 'global'
      ? 'https://aiplatform.googleapis.com'
      : `https://${VERTEX_LOCATION}-aiplatform.googleapis.com`
  const url =
    `${host}/v1/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}` +
    `/publishers/google/models/${GOOGLE_VERTEX_MODEL}:generateContent`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(geminiBody(img)),
    signal,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Vertex ${res.status}: ${txt.slice(0, 400)}`)
  }
  return extractGeminiImage(await res.json())
}

// ---------- Proveedor: OpenAI (respaldo) ----------
async function genOpenAI(img: Img, signal: AbortSignal): Promise<Img> {
  if (!OPENAI_API_KEY) throw new Error('Falta OPENAI_API_KEY')
  const form = new FormData()
  form.append('model', OPENAI_IMAGE_MODEL)
  form.append('prompt', PROMPT)
  form.append('size', '1024x1536')
  form.append('n', '1')
  form.append('input_fidelity', 'high')
  form.append(
    'image',
    new Blob([img.bytes], { type: img.mime }),
    `photo.${extFromMime(img.mime)}`,
  )
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
    signal,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 400)}`)
  }
  const data = await res.json()
  const b64 = data?.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI no devolvió imagen.')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, mime: 'image/png' }
}

// ---------- Orquestador con fallback ----------
const providerTrail: string[] = []

async function generateLego(
  img: Img,
): Promise<{ img: Img; provider: string; fallbackUsed: boolean }> {
  providerTrail.length = 0
  // Arma la cadena de intentos: principal primero, respaldo después.
  const chain: Array<{ label: string; fn: (i: Img, s: AbortSignal) => Promise<Img> }> = []

  if (IMAGE_PROVIDER === 'openai') {
    chain.push({ label: 'openai', fn: genOpenAI })
  } else {
    if (GOOGLE_BACKEND === 'vertex') {
      chain.push({ label: 'google:vertex', fn: genVertex })
    } else {
      chain.push({ label: 'google:aistudio', fn: genAIStudio })
    }
    if (ENABLE_OPENAI_FALLBACK && OPENAI_API_KEY) {
      chain.push({ label: 'openai', fn: genOpenAI })
    }
  }

  let lastErr: unknown = new Error('No hay proveedor de imágenes configurado')
  let attempts = 0
  for (const step of chain) {
    attempts++
    const ctrl = new AbortController()
    try {
      const out = await withTimeout(
        step.fn(img, ctrl.signal),
        TIMEOUT_MS,
        step.label,
      )
      providerTrail.push(`${step.label}: OK`)
      // fallback usado = el que respondió no fue el primer intento
      return { img: out, provider: step.label, fallbackUsed: attempts > 1 }
    } catch (err) {
      const msg = String((err as Error)?.message ?? err)
      console.error(`Proveedor ${step.label} falló:`, msg)
      providerTrail.push(`${step.label}: ERROR ${msg}`)
      ctrl.abort()
      lastErr = err
    }
  }
  throw lastErr
}

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

  try {
    const { imageBase64, debug, capturedAt, eventName } = await req.json()
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return json({ error: 'Falta imageBase64.' }, 400)
    }

    // Métricas de contexto
    const userAgent = req.headers.get('user-agent') ?? null
    const event = (eventName && String(eventName).trim()) || EVENT_NAME
    const captured =
      capturedAt && !Number.isNaN(Date.parse(capturedAt))
        ? new Date(capturedAt).toISOString()
        : new Date().toISOString()

    // 1) Subir original
    const original = decodeDataUrl(imageBase64)
    const id = crypto.randomUUID()
    const originalPath = `${id}.${extFromMime(original.mime)}`
    const up1 = await supabase.storage
      .from('originals')
      .upload(originalPath, original.bytes, {
        contentType: original.mime,
        upsert: true,
      })
    if (up1.error) throw new Error(`Storage (original): ${up1.error.message}`)

    // 2) Generar LEGO (principal + fallback) — midiendo latencia
    const genStart = Date.now()
    const { img: generated, provider, fallbackUsed } =
      await generateLego(original)
    const generationMs = Date.now() - genStart

    // 3) Subir generada
    const generatedPath = `${id}.${extFromMime(generated.mime)}`
    const up2 = await supabase.storage
      .from('generated')
      .upload(generatedPath, generated.bytes, {
        contentType: generated.mime,
        upsert: true,
      })
    if (up2.error) throw new Error(`Storage (generada): ${up2.error.message}`)

    const { data: pub } = supabase.storage
      .from('generated')
      .getPublicUrl(generatedPath)
    const generatedUrl = pub.publicUrl

    // 4) Registrar submission con métricas
    const { data: row, error: dbErr } = await supabase
      .from('submissions')
      .insert({
        id,
        original_path: originalPath,
        generated_path: generatedPath,
        generated_url: generatedUrl,
        provider,
        model: modelForProvider(provider),
        fallback_used: fallbackUsed,
        provider_trail: providerTrail,
        generation_ms: generationMs,
        original_bytes: original.bytes.length,
        generated_bytes: generated.bytes.length,
        user_agent: userAgent,
        event_name: event,
        captured_at: captured,
        status: 'generated',
      })
      .select('id')
      .single()
    if (dbErr) throw new Error(`DB: ${dbErr.message}`)

    return json({
      submissionId: row.id,
      generatedUrl,
      provider,
      generationMs,
      fallbackUsed,
      ...(debug ? { providerTrail } : {}),
    })
  } catch (err) {
    console.error('generate-lego error:', err)
    return json({ error: String((err as Error)?.message ?? err) }, 500)
  }
})
