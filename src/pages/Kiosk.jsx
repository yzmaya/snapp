import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import Brand from '../components/Brand.jsx'
import Countdown from '../components/Countdown.jsx'
import ResultModal from '../components/ResultModal.jsx'
import { useCamera } from '../hooks/useCamera.js'
import { usePrinter } from '../hooks/usePrinter.js'
import { supabase } from '../lib/supabase.js'

const PRIVACY_URL = `${import.meta.env.BASE_URL}aviso-privacidad.html`

// Flujo: 'live' → 'counting' → 'preview' → 'generating' → 'result'
export default function Kiosk() {
  const { videoRef, ready, error, info, start, capture } = useCamera({ mirror: true })

  const showDiag = (() => {
    try {
      return new URLSearchParams(window.location.search).get('debug') === '1'
    } catch {
      return false
    }
  })()

  const { printer, print } = usePrinter()

  const [phase, setPhase] = useState('live')
  const [captured, setCaptured] = useState(null)
  const [result, setResult] = useState(null)
  const [toast, setToast] = useState('')
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [projectTitle, setProjectTitle] = useState('')

  const flashRef = useRef(null)

  useEffect(() => {
    start()
  }, [start])

  // Título del proyecto activo (configurable desde el panel admin)
  useEffect(() => {
    supabase
      .from('v_active_project')
      .select('title')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.title) setProjectTitle(data.title)
      })
  }, [])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 5000)
  }

  const handleSmile = () => {
    if (!ready) return
    setPhase('counting')
  }

  const handleShoot = async () => {
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

  const handleRetake = () => {
    setCaptured(null)
    setPhase('live')
  }

  const handleSnapp = async () => {
    if (!captured) return
    if (!privacyAccepted) {
      showToast('Debes aceptar el aviso de privacidad para continuar.')
      return
    }
    setPhase('generating')
    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-lego', {
        body: { imageBase64: captured.dataUrl, capturedAt: captured.capturedAt },
      })
      if (fnError) throw fnError
      if (!data?.generatedUrl) throw new Error('La IA no devolvió imagen.')
      setResult({ submissionId: data.submissionId, generatedUrl: data.generatedUrl })
      setPhase('result')
    } catch (err) {
      console.error(err)
      setPhase('preview')
      showToast('No se pudo generar tu foto. Intenta de nuevo en un momento.')
    }
  }

  const handleSend = async (form) => {
    const { error: fnError } = await supabase.functions.invoke('send-photo-email', {
      body: { submissionId: result.submissionId, ...form },
    })
    if (fnError) {
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

  const showPhoto = phase === 'preview' || phase === 'generating' || phase === 'result'

  return (
    <div className="app">
      <div className="app-bg" />
      <Brand />
      {projectTitle && <div className="project-chip">{projectTitle}</div>}

      <main className="stage">
        {phase === 'live' && (
          <p className="tagline">
            Convierte a tus invitados en los protagonistas del evento
          </p>
        )}

        <div className="frame">
          <video
            ref={videoRef}
            className="mirror"
            playsInline
            autoPlay
            muted
            style={{ display: showPhoto ? 'none' : 'block' }}
          />

          {captured && showPhoto && <img src={captured.dataUrl} alt="Foto capturada" />}

          {phase === 'counting' && <Countdown from={3} onDone={handleShoot} />}

          {showDiag && info && (
            <div className="diag">
              {info.width}×{info.height} · {info.frameRate ?? '?'}fps ·{' '}
              {info.lowPower ? 'low-power' : 'normal'}
            </div>
          )}

          <div className="flash" ref={flashRef} />

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
                  Creando tu versión{projectTitle ? ` ${projectTitle}` : ''} con
                  inteligencia artificial…
                  <br />
                  Esto puede tardar unos segundos.
                </p>
              </div>
            </div>
          )}
        </div>

        {phase === 'live' && (
          <div className="actions">
            <button
              className="btn btn--primary btn--smile"
              onClick={handleSmile}
              disabled={!ready}
            >
              ¡Sonríe! 📸
            </button>
          </div>
        )}

        {phase === 'preview' && (
          <>
            <label className="privacy">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(e) => setPrivacyAccepted(e.target.checked)}
              />
              <span>
                He leído y acepto el{' '}
                <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
                  aviso de privacidad
                </a>
                .
              </span>
            </label>
            <div className="actions">
              <button className="btn btn--ghost btn--lg" onClick={handleRetake}>
                Tomar de nuevo
              </button>
              <button
                className="btn btn--primary btn--lg"
                onClick={handleSnapp}
                disabled={!privacyAccepted}
              >
                SNAPP
              </button>
            </div>
          </>
        )}

        <p className="footer-note">SNAPP · Powered by MYM</p>
      </main>

      {phase === 'result' && result && (
        <ResultModal
          imageUrl={result.generatedUrl}
          onCancel={closeModal}
          onSend={handleSend}
          canPrint={!!printer}
          onPrint={print}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
