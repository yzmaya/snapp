// ============================================================
// SNAPP · Edge Function: send-photo-email
// Actualiza los datos del submission y envía el correo con la
// foto SNAPP (adjunta + enlace) vía SMTP de DreamHost.
// ============================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? 'smtp.dreamhost.com'
const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') ?? '465')
const SMTP_USER = Deno.env.get('SMTP_USER')! // snapp@mayam.lat
const SMTP_PASS = Deno.env.get('SMTP_PASS')!
const SMTP_FROM = Deno.env.get('SMTP_FROM') ?? SMTP_USER
const SMTP_FROM_NAME = Deno.env.get('SMTP_FROM_NAME') ?? 'SNAPP'

// Copia oculta: si está definido, cada correo al invitado lleva un BCC a esta
// dirección (para verificar entregas). Vaciar para desactivar.
const EMAIL_BCC = Deno.env.get('EMAIL_BCC') ?? ''

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  )
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

function buildHtml(name: string, imageUrl: string) {
  // Mensaje pre-cargado para el botón de WhatsApp (incluye el enlace a la foto)
  const waText = encodeURIComponent(
    `¡Mira mi foto SNAPP! ✨ ${imageUrl}`,
  )
  const waHref = `https://wa.me/?text=${waText}`
  return `<!doctype html>
<html lang='es'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'></head>
<body style='margin:0;background:#0a1a3f;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#eaf1ff;'>
  <table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#0a1a3f;padding:32px 16px;'>
    <tr><td align='center'>
      <table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='max-width:520px;background:#0d234f;border-radius:20px;overflow:hidden;border:1px solid rgba(122,166,245,.22);'>
        <tr><td style='padding:28px 28px 8px;text-align:center;'>
          <div style='font-size:12px;letter-spacing:.28em;color:#7aa6f5;font-weight:700;text-transform:uppercase;'>Activación fotográfica con IA</div>
          <div style='font-size:34px;font-weight:900;font-style:italic;color:#fff;letter-spacing:.06em;margin-top:6px;'>SNAPP</div>
        </td></tr>
        <tr><td style='padding:12px 28px 4px;'>
          <p style='font-size:18px;margin:0 0 6px;color:#fff;'>¡Hola ${esc(name)}! 👋</p>
          <p style='font-size:15px;line-height:1.6;color:#b8c7e6;margin:0;'>
            Esperamos que te haya gustado esta activación, ¡te compartimos tu foto!
          </p>
        </td></tr>
        <tr><td style='padding:20px 28px;'>
          <img src='${imageUrl}' alt='Tu foto SNAPP' width='100%' style='display:block;width:100%;border-radius:14px;' />
        </td></tr>
        <tr><td style='padding:0 28px 28px;text-align:center;'>
          <a href='${imageUrl}' style='display:inline-block;background:#2d6cdf;color:#fff;text-decoration:none;font-weight:800;padding:14px 24px;border-radius:14px;font-size:16px;margin:0 4px 10px;'>Ver / descargar mi foto</a>
          <a href='${waHref}' style='display:inline-block;background:#25d366;color:#0a1a3f;text-decoration:none;font-weight:800;padding:14px 24px;border-radius:14px;font-size:16px;margin:0 4px 10px;'>Compartir por WhatsApp</a>
          <p style='font-size:12px;color:#8ea2c9;margin:12px 0 0;'>También la encuentras adjunta a este correo.</p>
        </td></tr>
      </table>
      <p style='font-size:11px;color:#8ea2c9;margin:18px 0 0;'>SNAPP · Powered by MYM</p>
    </td></tr>
  </table>
</body></html>`
}

// Correo brandeado del evento Summer Supplier Summit 2026 (identidad ENR).
function buildHtmlSss(name: string, imageUrl: string, qrUrl: string) {
  const waText = encodeURIComponent(`¡Mira mi foto del Summer Supplier Summit 2026! ✨ ${imageUrl}`)
  const waHref = `https://wa.me/?text=${waText}`
  const qrBlock = qrUrl
    ? `<tr><td style='padding:8px 28px 4px;text-align:center;'>
         <div style='background:#f4f6f9;border:1px solid rgba(30,79,160,.16);border-radius:16px;padding:18px;'>
           <p style='margin:0 0 12px;color:#16181d;font-weight:800;font-size:15px;'>Conoce el directorio completo de la Esfera</p>
           <img src='${qrUrl}' alt='Directorio de la Esfera Nacional' width='168' height='168' style='display:block;margin:0 auto;border-radius:10px;background:#fff;' />
           <p style='margin:12px 0 0;color:#414b59;font-size:13px;'>Escanea el código para ver nuestras diferentes soluciones.</p>
         </div>
       </td></tr>`
    : ''
  return `<!doctype html>
<html lang='es'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'></head>
<body style='margin:0;background:#eef1f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16181d;'>
  <div style='height:6px;background:#e1251d;'></div>
  <table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#eef1f5;padding:28px 16px;'>
    <tr><td align='center'>
      <table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='max-width:540px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid rgba(30,79,160,.14);'>
        <tr><td style='padding:24px 28px 6px;'>
          <table role='presentation' width='100%'><tr>
            <td style='vertical-align:middle;'>
              <div style='display:inline-block;border:2.5px solid #e1251d;border-radius:50%;width:52px;height:52px;text-align:center;line-height:1;'>
                <div style='color:#e1251d;font-weight:900;font-size:19px;letter-spacing:.02em;margin-top:12px;'>ENR</div>
              </div>
            </td>
            <td style='vertical-align:middle;text-align:right;'>
              <div style='font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#6d7889;font-weight:700;'>Summer Supplier Summit</div>
              <div style='font-size:20px;font-weight:900;color:#e1251d;'>2026</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style='padding:8px 28px 4px;'>
          <p style='font-size:18px;margin:0 0 6px;color:#16181d;'>¡Hola ${esc(name)}! 👋</p>
          <p style='font-size:15px;line-height:1.6;color:#414b59;margin:0;'>
            Gracias por participar en el <strong>Summer Supplier Summit 2026</strong>. ¡Aquí tienes tu foto!
          </p>
        </td></tr>
        <tr><td style='padding:18px 28px;'>
          <img src='${imageUrl}' alt='Tu foto del Summer Supplier Summit' width='100%' style='display:block;width:100%;border-radius:14px;' />
        </td></tr>
        <tr><td style='padding:0 28px 8px;text-align:center;'>
          <a href='${imageUrl}' style='display:inline-block;background:#e1251d;color:#fff;text-decoration:none;font-weight:800;padding:14px 24px;border-radius:12px;font-size:16px;margin:0 4px 10px;'>Ver / descargar mi foto</a>
          <a href='${waHref}' style='display:inline-block;background:#1e4fa0;color:#fff;text-decoration:none;font-weight:800;padding:14px 24px;border-radius:12px;font-size:16px;margin:0 4px 10px;'>Compartir por WhatsApp</a>
        </td></tr>
        <tr><td style='padding:6px 28px 8px;'>
          <div style='background:#fff5f4;border:1px solid rgba(225,37,29,.3);border-left:4px solid #e1251d;border-radius:12px;padding:14px 16px;'>
            <p style='margin:0;color:#414b59;font-size:14px;line-height:1.6;'>
              La <strong style='color:#16181d;'>Esfera Nacional de Publicidad y Marketing</strong> te enviará
              información de valor y casos de éxito para sumar a tu negocio o al de tus conocidos.
            </p>
          </div>
        </td></tr>
        ${qrBlock}
        <tr><td style='padding:16px 28px 26px;text-align:center;border-top:1px solid #eef1f5;'>
          <p style='font-size:12px;color:#6d7889;margin:8px 0 2px;'>Proyecto patrocinado por</p>
          <div style='font-size:18px;font-weight:900;letter-spacing:.06em;color:#16181d;'>MAYAM</div>
          <p style='font-size:12px;color:#6d7889;margin:2px 0 6px;'>Soluciones con Inteligencia Artificial</p>
          <a href='https://mayam.lat' style='color:#1e4fa0;font-weight:700;font-size:13px;text-decoration:none;'>https://mayam.lat</a>
        </td></tr>
      </table>
      <p style='font-size:11px;color:#6d7889;margin:16px 0 0;'>Summer Supplier Summit 2026 · Esfera Nacional de Publicidad y Marketing</p>
    </td></tr>
  </table>
</body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  let submissionId: string | undefined

  try {
    const body = await req.json()
    submissionId = body.submissionId
    const { name, email, phone } = body
    if (!submissionId) return json({ error: 'Falta submissionId.' }, 400)
    if (!name || !String(name).trim())
      return json({ error: 'Falta el nombre.' }, 400)
    if (!email || !EMAIL_RE.test(String(email).trim()))
      return json({ error: 'Correo inválido.' }, 400)

    // Recupera el submission
    const { data: sub, error: subErr } = await supabase
      .from('submissions')
      .select('id, generated_path, generated_url, project_id')
      .eq('id', submissionId)
      .single()
    if (subErr || !sub)
      return json({ error: 'No se encontró la foto (submission).' }, 404)

    // Proyecto: define el tema/identidad del correo (y el QR del evento).
    let project: { theme?: string; qr_path?: string | null } | null = null
    if (sub.project_id) {
      const { data: p } = await supabase
        .from('projects')
        .select('theme, qr_path')
        .eq('id', sub.project_id)
        .maybeSingle()
      project = p
    }
    const qrUrl =
      project?.theme === 'sss' && project?.qr_path
        ? supabase.storage.from('frames').getPublicUrl(project.qr_path).data.publicUrl
        : ''

    // Descarga la imagen generada para adjuntarla.
    // Si pesa demasiado (p. ej. imágenes con marco), se omite el adjunto y el
    // correo sale igual con el enlace para ver/descargar (evita que falle todo).
    const MAX_ATTACH_BYTES = 6 * 1024 * 1024
    let attachmentB64 = ''
    let attachmentMime = 'image/png'
    if (sub.generated_path) {
      const dl = await supabase.storage
        .from('generated')
        .download(sub.generated_path)
      if (dl.data) {
        const buf = new Uint8Array(await dl.data.arrayBuffer())
        if (buf.length <= MAX_ATTACH_BYTES) {
          attachmentB64 = bytesToBase64(buf)
          attachmentMime = dl.data.type || attachmentMime
        } else {
          console.warn(`Adjunto omitido: ${buf.length} bytes > límite`)
        }
      }
    }

    // Actualiza datos del submission
    await supabase
      .from('submissions')
      .update({
        name: String(name).trim(),
        email: String(email).trim(),
        phone: phone ? String(phone).trim() : null,
      })
      .eq('id', submissionId)

    // Envía el correo por SMTP (DreamHost)
    const client = new SMTPClient({
      connection: {
        hostname: SMTP_HOST,
        port: SMTP_PORT,
        tls: SMTP_PORT === 465, // 465 = TLS implícito; 587 = STARTTLS
        auth: { username: SMTP_USER, password: SMTP_PASS },
      },
    })

    const ext = attachmentMime.includes('jpeg') ? 'jpg' : 'png'
    const isSss = project?.theme === 'sss'
    const html = isSss
      ? buildHtmlSss(String(name).trim(), sub.generated_url, qrUrl)
      : buildHtml(String(name).trim(), sub.generated_url)
    const subject = isSss
      ? '¡Tu foto del Summer Supplier Summit 2026! 📸'
      : '¡Tu foto SNAPP está lista! 📸'

    // El correo va al invitado; opcionalmente con copia oculta (BCC).
    const recipient = String(email).trim()

    const emailStart = Date.now()
    await client.send({
      from: `${SMTP_FROM_NAME} <${SMTP_FROM}>`,
      to: recipient,
      ...(EMAIL_BCC ? { bcc: EMAIL_BCC } : {}),
      subject,
      html,
      content: `Hola ${name}! Esperamos que te haya gustado esta activación, te compartimos tu foto: ${sub.generated_url}`,
      attachments: attachmentB64
        ? [
            {
              filename: `snapp.${ext}`,
              content: attachmentB64,
              encoding: 'base64',
              contentType: attachmentMime,
            },
          ]
        : [],
    })
    await client.close()
    const emailMs = Date.now() - emailStart

    // Marca como enviado (con latencia de envío)
    await supabase
      .from('submissions')
      .update({
        status: 'sent',
        email_sent: true,
        email_sent_at: new Date().toISOString(),
        email_ms: emailMs,
      })
      .eq('id', submissionId)

    return json({ ok: true })
  } catch (err) {
    console.error('send-photo-email error:', err)
    // Marca error (sin romper si falla)
    try {
      if (submissionId) {
        await supabase
          .from('submissions')
          .update({ error_message: String((err as Error)?.message ?? err) })
          .eq('id', submissionId)
      }
    } catch (_) {}
    return json(
      {
        error:
          'No se pudo enviar el correo. ' +
          String((err as Error)?.message ?? err),
      },
      500,
    )
  }
})
