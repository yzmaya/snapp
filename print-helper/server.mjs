// ============================================================
// SNAPP · Helper local de impresión para Canon SELPHY
// ------------------------------------------------------------
// Pequeño servidor HTTP (sin dependencias) que corre en la
// computadora del evento (Windows, macOS o Linux). Detecta la
// impresora SELPHY y le envía la foto.
//
//   Windows      → PowerShell (Get-CimInstance Win32_Printer) + mspaint /pt
//   macOS/Linux  → CUPS (lpstat / lp)
//
// Endpoints:
//   GET  /status  → { connected, printer, detail }
//   GET  /diag    → diagnóstico completo (plataforma, colas, estado, …)
//   POST /print   → body { imageUrl } | { imageBase64 }  → imprime
//
// Uso:   node print-helper/server.mjs
//        (Windows: doble clic en start-windows.bat)
//        (macOS:   doble clic en start.command)
//
// Config (opcional, por variables de entorno):
//   PORT            (default 47801)
//   SELPHY_MATCH    substring del nombre de impresora (default "selphy")
//   PRINT_OPTIONS   opciones de lp separadas por coma (default "fit-to-page", solo POSIX)
//   PRINT_CMD_WIN   comando de impresión en Windows (default "mspaint /pt");
//                   plantilla con {file} y {printer}
//   ALLOW_ORIGIN    CORS (default "*")
// ============================================================
import { createServer } from 'node:http'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const execp = promisify(exec)
const HERE = dirname(fileURLToPath(import.meta.url))

const VERSION = '1.2.0'
const IS_WIN = process.platform === 'win32'
const PORT = Number(process.env.PORT || 47801)
const MATCH = (process.env.SELPHY_MATCH || 'selphy').toLowerCase()
const PRINT_OPTIONS = (process.env.PRINT_OPTIONS || 'fit-to-page')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
// Plantilla opcional para forzar un comando de impresión propio en Windows
// (escape hatch). Si NO se define, se usa print-image.ps1 (System.Drawing),
// que es determinista y no depende de Paint. Plantilla con {file} y {printer}.
const PRINT_CMD_WIN = process.env.PRINT_CMD_WIN || ''
const PRINT_TIMEOUT_MS = Number(process.env.PRINT_TIMEOUT_MS || 90000)
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

// ------------------------------------------------------------
// Detección de impresoras (multiplataforma)
// ------------------------------------------------------------

// Estados problemáticos en CUPS (inglés y español). "idle/inactiva" = lista.
const BAD_STATE =
  /(disabled|stopped|paused|rejecting|not connected|offline|unplugged|desactivada|detenida|pausada|no conectada|sin conexión|rechaz)/i

// Devuelve TODAS las colas: [{ name, ready, detail }]
async function listPrinters() {
  return IS_WIN ? listPrintersWindows() : listPrintersCups()
}

async function listPrintersCups() {
  // 1) Nombres de las colas (independiente de idioma)
  const { stdout: names } = await execp('lpstat -e 2>/dev/null')
  const list = []
  for (const raw of names.split('\n')) {
    const name = raw.trim()
    if (!name) continue
    let detail = ''
    let ready = true
    try {
      const { stdout: st } = await execp(`lpstat -p ${name} 2>/dev/null`)
      detail = st.split('\n')[0].trim()
      ready = !BAD_STATE.test(st)
    } catch {
      ready = false
    }
    list.push({ name, ready, detail })
  }
  return list
}

async function listPrintersWindows() {
  // Get-CimInstance devuelve WorkOffline (bool) y PrinterStatus (int).
  const ps =
    'Get-CimInstance Win32_Printer | ' +
    'Select-Object Name,WorkOffline,PrinterStatus | ConvertTo-Json -Compress'
  const cmd = `powershell -NoProfile -NonInteractive -Command "${ps}"`
  const { stdout } = await execp(cmd, { windowsHide: true })
  const parsed = JSON.parse(stdout.trim() || 'null')
  const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
  return rows
    .filter((r) => r && r.Name)
    .map((r) => {
      const offline = r.WorkOffline === true
      return {
        name: String(r.Name),
        ready: !offline,
        detail: offline ? 'Sin conexión (offline)' : 'Lista',
      }
    })
}

// La cola SELPHY (primera cuyo nombre contiene MATCH), o null.
async function findPrinter() {
  try {
    const all = await listPrinters()
    return all.find((p) => p.name.toLowerCase().includes(MATCH)) ?? null
  } catch {
    return null
  }
}

// ------------------------------------------------------------
// Impresión (multiplataforma)
// ------------------------------------------------------------
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}: timeout tras ${ms}ms`)), ms)
    promise.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

async function printImage(printer, file) {
  if (IS_WIN) {
    // Escape hatch: comando propio si el operador definió PRINT_CMD_WIN.
    if (PRINT_CMD_WIN) {
      const cmd = PRINT_CMD_WIN.replaceAll('{file}', file).replaceAll('{printer}', printer.name)
      const { stdout } = await execp(cmd, { windowsHide: true })
      return stdout.trim()
    }
    // Por defecto: impresión determinista con System.Drawing (sin Paint).
    const ps1 = join(HERE, 'print-image.ps1')
    const cmd =
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass ` +
      `-File "${ps1}" -ImagePath "${file}" -PrinterName "${printer.name}"`
    const { stdout } = await execp(cmd, { windowsHide: true })
    return stdout.trim()
  }
  const opts = PRINT_OPTIONS.map((o) => `-o ${o}`).join(' ')
  const { stdout } = await execp(`lp -d ${printer.name} ${opts} "${file}"`)
  return stdout.trim()
}

// Serializa los trabajos: dos impresiones no se enciman en la SELPHY.
let printChain = Promise.resolve()
function runPrint(printer, file) {
  const job = printChain.then(() =>
    withTimeout(printImage(printer, file), PRINT_TIMEOUT_MS, 'impresión'),
  )
  // La cadena continúa aunque un trabajo falle.
  printChain = job.catch(() => {})
  return job
}

// ------------------------------------------------------------
// Handlers
// ------------------------------------------------------------
async function handleStatus(res) {
  const p = await findPrinter()
  sendJson(res, 200, {
    connected: !!(p && p.ready),
    printer: p?.name ?? null,
    detail: p?.detail ?? null,
  })
}

async function handleDiag(res) {
  let printers = []
  let toolAvailable = true
  try {
    printers = await listPrinters()
  } catch (e) {
    toolAvailable = false
    printers = []
  }
  const matched = printers.find((p) => p.name.toLowerCase().includes(MATCH)) ?? null
  sendJson(res, 200, {
    platform: process.platform,
    tool: IS_WIN ? 'powershell' : 'cups',
    toolAvailable,
    match: MATCH,
    printers,
    matched,
    connected: !!(matched && matched.ready),
    port: PORT,
    version: VERSION,
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
    const message = await runPrint(printer, file)
    sendJson(res, 200, { ok: true, printer: printer.name, message })
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
    if (req.method === 'GET' && req.url === '/diag') return handleDiag(res)
    if (req.method === 'POST' && req.url === '/print') return handlePrint(req, res)
    if (req.method === 'GET' && req.url === '/') {
      setCors(res)
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end('SNAPP print helper activo. Endpoints: /status, /diag, /print')
    }
    sendJson(res, 404, { error: 'No encontrado' })
  } catch (e) {
    sendJson(res, 500, { error: String(e?.message ?? e) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`🖨️  SNAPP print helper v${VERSION} escuchando en http://localhost:${PORT}`)
  console.log(`    Plataforma: ${process.platform} · Herramienta: ${IS_WIN ? 'PowerShell' : 'CUPS'}`)
  console.log(`    Buscando impresora que contenga: "${MATCH}"`)
  findPrinter().then(
    (p) =>
      console.log(
        p
          ? `    ✅ Detectada: ${p.name} (${p.ready ? 'lista' : 'no lista'})`
          : `    ⚠️  Aún no detecto la SELPHY. Abre /diag para ver las impresoras disponibles.`,
      ),
    (e) => console.log(`    ⚠️  No pude listar impresoras: ${e?.message ?? e}`),
  )
})
