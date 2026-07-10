// ============================================================
// SNAPP · Helper local de impresión para Canon SELPHY (macOS/CUPS)
// ------------------------------------------------------------
// Pequeño servidor HTTP (sin dependencias) que corre en la Mac del
// evento. Detecta la impresora SELPHY vía CUPS e imprime la foto.
//
// Endpoints:
//   GET  /status  → { connected: bool, printer: string|null, detail }
//   POST /print   → body { imageUrl } | { imageBase64 }  → imprime
//
// Uso:   node print-helper/server.mjs
// Config (opcional, por variables de entorno):
//   PORT            (default 47801)
//   SELPHY_MATCH    substring del nombre de impresora (default "selphy")
//   PRINT_OPTIONS   opciones de lp separadas por coma (default "fit-to-page")
//   ALLOW_ORIGIN    CORS (default "*")
// ============================================================
import { createServer } from 'node:http'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const execp = promisify(exec)

const PORT = Number(process.env.PORT || 47801)
const MATCH = (process.env.SELPHY_MATCH || 'selphy').toLowerCase()
const PRINT_OPTIONS = (process.env.PRINT_OPTIONS || 'fit-to-page')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*'

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN)
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}
function sendJson(res, code, obj) {
  setCors(res)
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}

// Busca la impresora SELPHY en CUPS y evalúa si está lista.
// Robusto a idioma: lpstat -e da solo nombres; el estado se evalúa detectando
// SOLO estados problemáticos (en inglés y español). "idle/inactiva" = lista.
const BAD_STATE =
  /(disabled|stopped|paused|rejecting|not connected|offline|unplugged|desactivada|detenida|pausada|no conectada|sin conexión|rechaz)/i

async function findPrinter() {
  try {
    // 1) Nombre de la cola (independiente de idioma)
    const { stdout: names } = await execp('lpstat -e 2>/dev/null')
    const name = names
      .split('\n')
      .map((s) => s.trim())
      .find((n) => n && n.toLowerCase().includes(MATCH))
    if (!name) return null

    // 2) Estado de esa cola (idle/printing = ok; solo descartamos estados malos)
    const { stdout: st } = await execp(`lpstat -p ${name} 2>/dev/null`)
    const ready = !BAD_STATE.test(st)
    return { name, ready, detail: st.split('\n')[0].trim() }
  } catch {
    return null
  }
}

async function handleStatus(res) {
  const p = await findPrinter()
  sendJson(res, 200, {
    connected: !!(p && p.ready),
    printer: p?.name ?? null,
    detail: p?.detail ?? null,
  })
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 30 * 1024 * 1024) reject(new Error('payload muy grande'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

async function handlePrint(req, res) {
  const printer = await findPrinter()
  if (!printer) return sendJson(res, 409, { error: 'Impresora SELPHY no encontrada.' })

  let body
  try {
    body = JSON.parse(await readBody(req))
  } catch {
    return sendJson(res, 400, { error: 'JSON inválido.' })
  }

  // Obtiene los bytes de la imagen (por URL o base64)
  let bytes
  try {
    if (body.imageUrl) {
      const r = await fetch(body.imageUrl)
      if (!r.ok) throw new Error(`descarga ${r.status}`)
      bytes = Buffer.from(await r.arrayBuffer())
    } else if (body.imageBase64) {
      const b64 = String(body.imageBase64).replace(/^data:[^;]+;base64,/, '')
      bytes = Buffer.from(b64, 'base64')
    } else {
      return sendJson(res, 400, { error: 'Falta imageUrl o imageBase64.' })
    }
  } catch (e) {
    return sendJson(res, 502, { error: 'No se pudo obtener la imagen: ' + e.message })
  }

  const file = join(tmpdir(), `snapp-${randomUUID()}.png`)
  try {
    await writeFile(file, bytes)
    const opts = PRINT_OPTIONS.map((o) => `-o ${o}`).join(' ')
    const cmd = `lp -d ${printer.name} ${opts} "${file}"`
    const { stdout } = await execp(cmd)
    sendJson(res, 200, { ok: true, printer: printer.name, message: stdout.trim() })
  } catch (e) {
    sendJson(res, 500, { error: 'Falló la impresión: ' + (e.message || e) })
  } finally {
    unlink(file).catch(() => {})
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    setCors(res)
    res.writeHead(204)
    return res.end()
  }
  try {
    if (req.method === 'GET' && req.url === '/status') return handleStatus(res)
    if (req.method === 'POST' && req.url === '/print') return handlePrint(req, res)
    if (req.method === 'GET' && req.url === '/') {
      setCors(res)
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end('SNAPP print helper activo. Endpoints: /status, /print')
    }
    sendJson(res, 404, { error: 'No encontrado' })
  } catch (e) {
    sendJson(res, 500, { error: String(e?.message ?? e) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`🖨️  SNAPP print helper escuchando en http://localhost:${PORT}`)
  console.log(`    Buscando impresora que contenga: "${MATCH}"`)
  findPrinter().then((p) =>
    console.log(
      p ? `    ✅ Detectada: ${p.name} (${p.ready ? 'lista' : 'no lista'})` : '    ⚠️  Aún no detecto la SELPHY (conéctala y recarga /status)',
    ),
  )
})
