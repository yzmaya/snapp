import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { HELPER_URL } from '../hooks/usePrinter.js'

const PLATFORM_LABEL = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
}

// Genera una tarjeta de prueba (canvas) y la devuelve como data URL PNG.
function makeTestCard() {
  const canvas = document.createElement('canvas')
  canvas.width = 600
  canvas.height = 400
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#0b1f4d'
  ctx.fillRect(0, 0, 600, 400)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.font = 'bold 44px sans-serif'
  ctx.fillText('SNAPP', 300, 150)
  ctx.font = '26px sans-serif'
  ctx.fillText('Prueba de impresión', 300, 200)
  ctx.font = '20px sans-serif'
  ctx.fillText(new Date().toLocaleString(), 300, 250)
  ctx.strokeStyle = '#7aa6f5'
  ctx.lineWidth = 6
  ctx.strokeRect(20, 20, 560, 360)
  return canvas.toDataURL('image/png')
}

function Row({ ok, title, children }) {
  const state = ok === null ? 'pending' : ok ? 'ok' : 'bad'
  return (
    <div className="diag-row" data-state={state}>
      <span className="diag-row__icon">{ok === null ? '…' : ok ? '✓' : '✗'}</span>
      <div className="diag-row__body">
        <strong>{title}</strong>
        {children && <div className="diag-row__detail">{children}</div>}
      </div>
    </div>
  )
}

export default function PrinterDiag() {
  const [diag, setDiag] = useState(null) // objeto de /diag
  const [reachable, setReachable] = useState(null) // null | bool
  const [latency, setLatency] = useState(null)
  const [loading, setLoading] = useState(false)
  const [printState, setPrintState] = useState('idle') // idle | printing | done | error
  const [printMsg, setPrintMsg] = useState('')
  const timer = useRef(null)

  const check = useCallback(async () => {
    setLoading(true)
    const t0 = performance.now()
    try {
      const ctrl = new AbortController()
      const to = setTimeout(() => ctrl.abort(), 2500)
      const res = await fetch(`${HELPER_URL}/diag`, { signal: ctrl.signal })
      clearTimeout(to)
      setLatency(Math.round(performance.now() - t0))
      if (!res.ok) throw new Error('diag ' + res.status)
      const j = await res.json()
      setDiag(j)
      setReachable(true)
    } catch {
      setReachable(false)
      setDiag(null)
      setLatency(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    check()
    timer.current = setInterval(check, 4000)
    return () => clearInterval(timer.current)
  }, [check])

  const testPrint = async () => {
    setPrintState('printing')
    setPrintMsg('')
    try {
      const imageBase64 = makeTestCard()
      const res = await fetch(`${HELPER_URL}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'No se pudo imprimir.')
      setPrintState('done')
      setPrintMsg('Enviada a: ' + (j?.printer || 'la impresora'))
    } catch (err) {
      setPrintState('error')
      setPrintMsg(err?.message || 'No se pudo imprimir.')
    }
  }

  const printerDetected = !!diag?.matched
  const printerReady = !!diag?.matched?.ready

  return (
    <div className="admin">
      <header className="admin-header">
        <div>
          <span className="brand__eyebrow">Diagnóstico de impresora</span>
          <div className="wordmark" style={{ fontSize: 22 }}>SNAPP</div>
        </div>
        <div className="admin-header__right">
          <Link to="/" className="btn btn--ghost">Ver app</Link>
          <button className="btn btn--ghost" onClick={check} disabled={loading}>
            {loading ? 'Comprobando…' : 'Reintentar'}
          </button>
        </div>
      </header>

      <p className="admin-muted">
        Helper consultado: <strong>{HELPER_URL}</strong>
        {latency != null && ` · ${latency} ms`}
      </p>

      <div className="admin-card" style={{ marginTop: 16, maxWidth: 640 }}>
        {/* 1 · Helper accesible */}
        <Row ok={reachable} title="Helper de impresión accesible">
          {reachable === false && (
            <>
              No se pudo contactar al helper local. Revisa que:
              <ul>
                <li>El helper esté corriendo (doble clic en <code>start-windows.bat</code>).</li>
                <li>Uses <strong>Chrome</strong> (la app HTTPS solo puede llamar a <code>localhost</code> desde Chrome).</li>
                <li>Node.js esté instalado en esta computadora.</li>
              </ul>
            </>
          )}
          {reachable && diag && (
            <>Helper v{diag.version} en el puerto {diag.port}.</>
          )}
        </Row>

        {reachable && diag && (
          <>
            {/* 2 · Sistema y herramienta */}
            <Row ok={diag.toolAvailable} title="Sistema y herramienta de impresión">
              {PLATFORM_LABEL[diag.platform] || diag.platform} ·{' '}
              {diag.tool === 'powershell' ? 'PowerShell (Get-Printer)' : 'CUPS (lp/lpstat)'}
              {!diag.toolAvailable && (
                <div className="diag-warn">
                  No se pudieron listar las impresoras del sistema. En Windows,
                  verifica que PowerShell esté disponible.
                </div>
              )}
            </Row>

            {/* 3 · Impresora SELPHY detectada */}
            <Row ok={printerDetected} title="Impresora SELPHY detectada">
              {printerDetected ? (
                <>Detectada: <strong>{diag.matched.name}</strong></>
              ) : (
                <>
                  No hay ninguna impresora cuyo nombre contenga{' '}
                  <code>{diag.match}</code>. Impresoras encontradas:
                  {diag.printers.length ? (
                    <ul>
                      {diag.printers.map((p) => (
                        <li key={p.name}>
                          {p.name} {p.ready ? '' : '(sin conexión)'}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div>(ninguna)</div>
                  )}
                  <div className="diag-warn">
                    Renombra la impresora para que incluya «selphy», o arranca el
                    helper con <code>SELPHY_MATCH</code> apuntando a su nombre
                    (ej. <code>set SELPHY_MATCH=cp1500</code>).
                  </div>
                </>
              )}
            </Row>

            {/* 4 · Lista para imprimir */}
            {printerDetected && (
              <Row ok={printerReady} title="Lista para imprimir">
                {diag.matched.detail || (printerReady ? 'Lista' : 'No lista')}
              </Row>
            )}

            {/* 5 · Impresión de prueba */}
            <div className="diag-actions">
              <button
                className="btn btn--print"
                onClick={testPrint}
                disabled={!printerReady || printState === 'printing'}
              >
                {printState === 'printing' ? 'Enviando…' : '🖨️ Imprimir página de prueba'}
              </button>
              {printState === 'done' && <p className="diag-ok">✓ {printMsg}</p>}
              {printState === 'error' && <p className="form__error">{printMsg}</p>}
              {!printerReady && (
                <p className="admin-hint" style={{ margin: 0 }}>
                  Conecta y enciende la SELPHY para habilitar la prueba.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <p className="admin-hint" style={{ maxWidth: 640 }}>
        Cuando el checklist esté todo en ✓, el botón <strong>Imprimir</strong>
        reaparecerá automáticamente en la pantalla de resultado. Esta pantalla se
        actualiza sola cada pocos segundos.
      </p>
    </div>
  )
}
