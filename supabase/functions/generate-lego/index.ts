// ============================================================
// SNAPP · Edge Function: generate-lego
// Lee la configuración del PROYECTO ACTIVO (título, prompt, modelo, logos)
// y genera la imagen con proveedores conmutables + fallback.
//   Modelos (model_key del proyecto):
//     nano-banana-2   → AI Studio · gemini-3.1-flash-image
//     nano-banana-pro → AI Studio · gemini-3-pro-image
//     vertex          → Vertex AI · gemini-3.1-flash-image
//   Respaldo: OpenAI gpt-image-1 (sin logo)
// ============================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ENABLE_OPENAI_FALLBACK =
  (Deno.env.get('ENABLE_OPENAI_FALLBACK') ?? 'true').toLowerCase() !== 'false'
const TIMEOUT_MS = Number(Deno.env.get('IMAGE_PROVIDER_TIMEOUT_MS') ?? '90000')

// Modelos por defecto (configurables)
const MODEL_FLASH = Deno.env.get('GOOGLE_AI_MODEL') ?? 'gemini-3.1-flash-image'
const MODEL_PRO = Deno.env.get('GOOGLE_PRO_MODEL') ?? 'gemini-3-pro-image'
const MODEL_VERTEX = Deno.env.get('GOOGLE_VERTEX_MODEL') ?? 'gemini-3.1-flash-image'
const OPENAI_IMAGE_MODEL = Deno.env.get('OPENAI_IMAGE_MODEL') ?? 'gpt-image-1'

const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY') ?? ''
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? ''
const VERTEX_PROJECT_ID = Deno.env.get('VERTEX_PROJECT_ID') ?? ''
const VERTEX_LOCATION = Deno.env.get('VERTEX_LOCATION') ?? 'global'
const GOOGLE_SERVICE_ACCOUNT_JSON = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') ?? ''

// Prompt por defecto si no hay proyecto activo configurado
const DEFAULT_PROMPT =
  'Toma todas las referencias visuales, estéticas y de vestimenta de esta foto, ' +
  'y conviértelo en un personaje de LEGO. Estilo minifigura de LEGO, alta calidad.'

const LOGO_INSTRUCTION =
  ' Además, integra el logotipo que te proporciono en la esquina superior derecha ' +
  'de la imagen, de forma nítida, proporcionada y sin distorsionarlo. Usa la versión ' +
  'en blanco del logo si esa zona queda con fondo oscuro, o la versión a color si el ' +
  'fondo es claro.'

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
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk)
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(bin)
}
const extFromMime = (mime: string) =>
  mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
function base64UrlFromString(s: string) {
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
function base64UrlFromBytes(bytes: Uint8Array) {
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}: timeout tras ${ms}ms`)), ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

// ---------- Configuración de generación (por proyecto) ----------
type GenCfg = {
  prompt: string
  backend: 'aistudio' | 'vertex'
  model: string
  logos: Img[] // 0..2 logos a incluir en la consulta
}

function resolveModel(modelKey: string): { backend: 'aistudio' | 'vertex'; model: string } {
  switch (modelKey) {
    case 'nano-banana-pro':
      return { backend: 'aistudio', model: MODEL_PRO }
    case 'vertex':
      return { backend: 'vertex', model: MODEL_VERTEX }
    case 'nano-banana-2':
    default:
      return { backend: 'aistudio', model: MODEL_FLASH }
  }
}

// ---------- Respuesta Gemini ----------
function extractGeminiImage(data: any): Img {
  const parts = data?.candidates?.[0]?.content?.parts ?? []
  for (const part of parts) {
    const inline = part?.inlineData ?? part?.inline_data
    if (inline?.data)
      return { bytes: b64ToBytes(inline.data), mime: inline.mimeType ?? inline.mime_type ?? 'image/png' }
  }
  throw new Error('Gemini no devolvió imagen. ' + JSON.stringify(data).slice(0, 400))
}

function geminiBody(cfg: GenCfg, photo: Img) {
  const parts: any[] = [
    { text: cfg.prompt },
    { inline_data: { mime_type: photo.mime, data: bytesToBase64(photo.bytes) } },
  ]
  for (const logo of cfg.logos)
    parts.push({ inline_data: { mime_type: logo.mime, data: bytesToBase64(logo.bytes) } })
  return {
    contents: [{ parts }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  }
}

// ---------- Proveedores ----------
async function genAIStudio(cfg: GenCfg, photo: Img, signal: AbortSignal): Promise<Img> {
  if (!GOOGLE_AI_API_KEY) throw new Error('Falta GOOGLE_AI_API_KEY')
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' + cfg.model + ':generateContent'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GOOGLE_AI_API_KEY },
    body: JSON.stringify(geminiBody(cfg, photo)),
    signal,
  })
  if (!res.ok) throw new Error(`AI Studio ${res.status}: ${(await res.text()).slice(0, 400)}`)
  return extractGeminiImage(await res.json())
}

async function getVertexAccessToken(): Promise<string> {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON')
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
    base64UrlFromString(JSON.stringify(header)) + '.' + base64UrlFromString(JSON.stringify(claim))
  const pemBody = String(sa.private_key)
    .replaceAll('-----BEGIN PRIVATE KEY-----', '')
    .replaceAll('-----END PRIVATE KEY-----', '')
    .replaceAll('\n', '')
    .replaceAll('\r', '')
    .trim()
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
  )
  const jwt = unsigned + '.' + base64UrlFromBytes(sig)
  const tokRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt,
  })
  if (!tokRes.ok) throw new Error(`Vertex OAuth ${tokRes.status}: ${(await tokRes.text()).slice(0, 300)}`)
  const tok = await tokRes.json()
  if (!tok.access_token) throw new Error('Vertex OAuth sin access_token')
  return tok.access_token
}

async function genVertex(cfg: GenCfg, photo: Img, signal: AbortSignal): Promise<Img> {
  if (!VERTEX_PROJECT_ID) throw new Error('Falta VERTEX_PROJECT_ID')
  const token = await getVertexAccessToken()
  const host =
    VERTEX_LOCATION === 'global'
      ? 'https://aiplatform.googleapis.com'
      : `https://${VERTEX_LOCATION}-aiplatform.googleapis.com`
  const url =
    `${host}/v1/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}` +
    `/publishers/google/models/${cfg.model}:generateContent`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(geminiBody(cfg, photo)),
    signal,
  })
  if (!res.ok) throw new Error(`Vertex ${res.status}: ${(await res.text()).slice(0, 400)}`)
  return extractGeminiImage(await res.json())
}

async function genOpenAI(cfg: GenCfg, photo: Img, signal: AbortSignal): Promise<Img> {
  if (!OPENAI_API_KEY) throw new Error('Falta OPENAI_API_KEY')
  const form = new FormData()
  form.append('model', OPENAI_IMAGE_MODEL)
  form.append('prompt', cfg.prompt)
  form.append('size', '1024x1536')
  form.append('n', '1')
  form.append('input_fidelity', 'high')
  form.append('image', new Blob([photo.bytes], { type: photo.mime }), `photo.${extFromMime(photo.mime)}`)
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
    signal,
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 400)}`)
  const data = await res.json()
  const b64 = data?.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI no devolvió imagen.')
  return { bytes: b64ToBytes(b64), mime: 'image/png' }
}

// ---------- Orquestador ----------
const providerTrail: string[] = []

async function generate(cfg: GenCfg, photo: Img): Promise<{ img: Img; provider: string; model: string; fallbackUsed: boolean }> {
  providerTrail.length = 0
  const chain: Array<{ label: string; model: string; fn: (c: GenCfg, p: Img, s: AbortSignal) => Promise<Img> }> = []
  if (cfg.backend === 'vertex') chain.push({ label: 'google:vertex', model: cfg.model, fn: genVertex })
  else chain.push({ label: 'google:aistudio', model: cfg.model, fn: genAIStudio })
  if (ENABLE_OPENAI_FALLBACK && OPENAI_API_KEY)
    chain.push({ label: 'openai', model: OPENAI_IMAGE_MODEL, fn: genOpenAI })

  let lastErr: unknown = new Error('No hay proveedor configurado')
  let attempts = 0
  for (const step of chain) {
    attempts++
    const ctrl = new AbortController()
    try {
      const out = await withTimeout(step.fn(cfg, photo, ctrl.signal), TIMEOUT_MS, step.label)
      providerTrail.push(`${step.label}: OK`)
      return { img: out, provider: step.label, model: step.model, fallbackUsed: attempts > 1 }
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
    const { imageBase64, debug, capturedAt } = await req.json()
    if (!imageBase64 || typeof imageBase64 !== 'string')
      return json({ error: 'Falta imageBase64.' }, 400)

    // ---- Proyecto activo ----
    const { data: project } = await supabase
      .from('projects')
      .select('id, title, prompt, model_key, use_logo, logo_white_path, logo_color_path')
      .eq('is_active', true)
      .maybeSingle()

    const modelSel = resolveModel(project?.model_key ?? 'nano-banana-2')
    let prompt = project?.prompt || DEFAULT_PROMPT

    // ---- Logos (si el proyecto los usa) ----
    const logos: Img[] = []
    if (project?.use_logo) {
      for (const path of [project.logo_white_path, project.logo_color_path]) {
        if (!path) continue
        const dl = await supabase.storage.from('logos').download(path)
        if (dl.data) {
          const buf = new Uint8Array(await dl.data.arrayBuffer())
          logos.push({ bytes: buf, mime: dl.data.type || 'image/png' })
        }
      }
      if (logos.length) prompt += LOGO_INSTRUCTION
    }

    const cfg: GenCfg = { prompt, backend: modelSel.backend, model: modelSel.model, logos }

    // 1) Subir original
    const original = decodeDataUrl(imageBase64)
    const id = crypto.randomUUID()
    const originalPath = `${id}.${extFromMime(original.mime)}`
    const up1 = await supabase.storage
      .from('originals')
      .upload(originalPath, original.bytes, { contentType: original.mime, upsert: true })
    if (up1.error) throw new Error(`Storage (original): ${up1.error.message}`)

    // 2) Generar
    const genStart = Date.now()
    const { img: generated, provider, model, fallbackUsed } = await generate(cfg, original)
    const generationMs = Date.now() - genStart

    // 3) Subir generada
    const generatedPath = `${id}.${extFromMime(generated.mime)}`
    const up2 = await supabase.storage
      .from('generated')
      .upload(generatedPath, generated.bytes, { contentType: generated.mime, upsert: true })
    if (up2.error) throw new Error(`Storage (generada): ${up2.error.message}`)

    const { data: pub } = supabase.storage.from('generated').getPublicUrl(generatedPath)
    const generatedUrl = pub.publicUrl

    // 4) Registrar submission
    const { data: row, error: dbErr } = await supabase
      .from('submissions')
      .insert({
        id,
        original_path: originalPath,
        generated_path: generatedPath,
        generated_url: generatedUrl,
        provider,
        model,
        fallback_used: fallbackUsed,
        provider_trail: providerTrail,
        generation_ms: generationMs,
        original_bytes: original.bytes.length,
        generated_bytes: generated.bytes.length,
        user_agent: req.headers.get('user-agent') ?? null,
        captured_at:
          capturedAt && !Number.isNaN(Date.parse(capturedAt))
            ? new Date(capturedAt).toISOString()
            : new Date().toISOString(),
        event_name: project?.title ?? 'demo',
        project_id: project?.id ?? null,
        project_title: project?.title ?? null,
        status: 'generated',
      })
      .select('id')
      .single()
    if (dbErr) throw new Error(`DB: ${dbErr.message}`)

    return json({
      submissionId: row.id,
      generatedUrl,
      provider,
      model,
      generationMs,
      fallbackUsed,
      ...(debug ? { providerTrail } : {}),
    })
  } catch (err) {
    console.error('generate-lego error:', err)
    return json({ error: String((err as Error)?.message ?? err) }, 500)
  }
})
