import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import Brand from './components/Brand.jsx'
import Countdown from './components/Countdown.jsx'
import ResultModal from './components/ResultModal.jsx'
import { useCamera } from './hooks/useCamera.js'
import { supabase } from './lib/supabase.js'

// Estados del flujo:
// 'live'      → cámara encendida, botón ¡Sonríe!
// 'counting'  → cuenta regresiva 3·2·1
// 'preview'   → foto tomada, botones Tomar de nuevo / SNAPP
// 'generating'→ generando LEGO con IA
// 'result'    → modal con la foto LEGO
export default function App() {
  const { videoRef, ready, error, info, start, capture } = useCamera({
    mirror: true,
  })

  // ?debug=1 muestra resolución/fps reales de la cámara (útil en equipos lentos)
  const showDiag = (() => {
    try {
      return new URLSearchParams(window.location.search).get('debug') === '1'
    } catch {
      return false
    }
  })()

  const [phase, setPhase] = useState('live')
  const [captured, setCaptured] = useState(null) // { blob, dataUrl }
  const [result, setResult] = useState(null) // { submissionId, generatedUrl }
  const [toast, setToast] = useState('')

  const flashRef = useRef(null)
  const smileBtnRef = useRef(null)

  // Enciende la cámara al montar.
  useEffect(() => {
    start()
  }, [start])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 5000)
  }

  // ---- ¡Sonríe! → arranca countdown ----
  const handleSmile = () => {
    if (!ready) return
    setPhase('counting')
  }

  // ---- Fin del countdown → dispara ----
  const handleShoot = async () => {
    // Flash blanco
    if (flashRef.current) {
      gsap.fromTo(
        flashRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.08, yoyo: true, repeat: 1, ease: 'power1.inOut' },
      )
    }
    const shot = await capture()
    if (!shot) {
      setPhase('live')
      showToast('No se pudo capturar la foto. Intenta de nuevo.')
      return
    }
    setCaptured(shot)
    setPhase('preview')
  }

  // ---- Tomar de nuevo ----
  const handleRetake = () => {
    setCaptured(null)
    setPhase('live')
  }

  // ---- SNAPP → genera el LEGO ----
  const handleSnapp = async () => {
    if (!captured) return
    setPhase('generating')
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'generate-lego',
        {
          body: {
            imageBase64: captured.dataUrl,
            capturedAt: captured.capturedAt,
          },
        },
      )
      if (fnError) throw fnError
      if (!data?.generatedUrl) throw new Error('La IA no devolvió imagen.')

      setResult({
        submissionId: data.submissionId,
        generatedUrl: data.generatedUrl,
      })
      setPhase('result')
    } catch (err) {
      console.error(err)
      setPhase('preview')
      showToast(
        'No se pudo generar tu SNAPP. Verifica la configuración de OpenRouter e intenta de nuevo.',
      )
    }
  }

  // ---- Enviar correo desde el modal ----
  const handleSend = async (form) => {
    const { error: fnError } = await supabase.functions.invoke(
      'send-photo-email',
      { body: { submissionId: result.submissionId, ...form } },
    )
    if (fnError) {
      // Intenta extraer un mensaje útil del error de la función
      let msg = 'No se pudo enviar el correo.'
      try {
        const ctx = await fnError.context?.json?.()
        if (ctx?.error) msg = ctx.error
      } catch (_) {}
      throw new Error(msg)
    }
  }

  const closeModal = () => {
    setResult(null)
    setCaptured(null)
    setPhase('live')
  }

  const mirrorClass = 'mirror'

  return (
    <div className="app">
      <div className="app-bg" />
      <Brand />

      <main className="stage">
        {phase === 'live' && (
          <p className="tagline">
            Convierte a tus invitados en los protagonistas del evento
          </p>
        )}

        <div className="frame">
          {/* Video en vivo (oculto cuando ya hay foto tomada) */}
          <video
            ref={videoRef}
            className={mirrorClass}
            playsInline
            autoPlay
            muted
            style={{
              display:
                phase === 'preview' ||
                phase === 'generating' ||
                phase === 'result'
                  ? 'none'
                  : 'block',
            }}
          />

          {/* Foto capturada */}
          {captured &&
            (phase === 'preview' ||
              phase === 'generating' ||
              phase === 'result') && (
              <img src={captured.dataUrl} alt="Foto capturada" />
            )}

          {/* Countdown */}
          {phase === 'counting' && (
            <Countdown from={3} onDone={handleShoot} />
          )}

          {/* Diagnóstico de cámara (?debug=1) */}
          {showDiag && info && (
            <div className="diag">
              {info.width}×{info.height} · {info.frameRate ?? '?'}fps ·{' '}
              {info.lowPower ? 'low-power' : 'normal'}
            </div>
          )}

          {/* Flash */}
          <div className="flash" ref={flashRef} />

          {/* Overlay: pidiendo permiso / error / generando */}
          {phase === 'live' && !ready && !error && (
            <div className="frame__overlay">
              <div style={{ display: 'grid', placeItems: 'center', gap: 16 }}>
                <div className="spinner" />
                <p>Encendiendo la cámara…</p>
              </div>
            </div>
          )}
          {phase === 'live' && error && (
            <div className="frame__overlay">
              <div style={{ display: 'grid', gap: 16 }}>
                <p>{error}</p>
                <button className="btn btn--primary" onClick={start}>
                  Reintentar
                </button>
              </div>
            </div>
          )}
          {phase === 'generating' && (
            <div className="frame__overlay">
              <div style={{ display: 'grid', placeItems: 'center', gap: 16 }}>
                <div className="spinner" />
                <p>
                  Creando tu versión LEGO con inteligencia artificial…
                  <br />
                  Esto puede tardar unos segundos.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Botonera según fase */}
        {phase === 'live' && (
          <div className="actions">
            <button
              ref={smileBtnRef}
              className="btn btn--primary btn--smile"
              onClick={handleSmile}
              disabled={!ready}
            >
              ¡Sonríe! 📸
            </button>
          </div>
        )}

        {phase === 'preview' && (
          <div className="actions">
            <button className="btn btn--ghost btn--lg" onClick={handleRetake}>
              Tomar de nuevo
            </button>
            <button className="btn btn--primary btn--lg" onClick={handleSnapp}>
              SNAPP
            </button>
          </div>
        )}

        <p className="footer-note">SNAPP · Powered by IA</p>
      </main>

      {/* Modal de resultado */}
      {phase === 'result' && result && (
        <ResultModal
          imageUrl={result.generatedUrl}
          onCancel={closeModal}
          onSend={handleSend}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
