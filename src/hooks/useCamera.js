import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Elige constraints de cámara según la potencia del equipo.
 * En equipos de bajo consumo (≤4 núcleos, ej. mini PCs con Intel N) bajamos
 * la resolución para que el video no se entrecorte en el navegador.
 * Se puede forzar con ?q=low | ?q=high en la URL.
 */
function pickConstraints() {
  let forced = null
  try {
    forced = new URLSearchParams(window.location.search).get('q')
  } catch (_) {}
  const cores = navigator.hardwareConcurrency || 4
  const lowPower = forced === 'low' || (forced !== 'high' && cores <= 4)
  const size = lowPower ? { w: 640, h: 480 } : { w: 1280, h: 720 }
  return {
    lowPower,
    constraints: {
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: size.w },
        height: { ideal: size.h },
        frameRate: { ideal: 30, max: 30 },
      },
    },
  }
}

/**
 * Hook de cámara multi-navegador (Safari, Chrome, Firefox, iOS/Android).
 * Optimizado para hardware de bajo consumo (resolución adaptativa + 30fps).
 */
export function useCamera({ mirror = true } = {}) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null) // { width, height, frameRate, lowPower }

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setReady(false)
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setReady(false)

    // Compatibilidad: normaliza getUserMedia entre navegadores.
    const getUserMedia =
      navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices) ||
      ((constraints) => {
        const legacy =
          navigator.getUserMedia ||
          navigator.webkitGetUserMedia ||
          navigator.mozGetUserMedia
        if (!legacy) return Promise.reject(new Error('unsupported'))
        return new Promise((res, rej) =>
          legacy.call(navigator, constraints, res, rej),
        )
      })

    const { constraints, lowPower } = pickConstraints()

    try {
      let stream
      try {
        stream = await getUserMedia(constraints)
      } catch (e) {
        // Si la cámara rechaza los constraints ideales, reintenta con lo básico.
        if (e?.name === 'OverconstrainedError' || e?.name === 'NotReadableError') {
          stream = await getUserMedia({ audio: false, video: { facingMode: 'user' } })
        } else {
          throw e
        }
      }

      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        // iOS Safari necesita estos atributos para reproducir inline.
        video.setAttribute('playsinline', 'true')
        video.setAttribute('muted', 'true')
        video.muted = true
        await video.play().catch(() => {})
      }

      // Diagnóstico: resolución/fps reales que entregó la cámara.
      try {
        const s = stream.getVideoTracks()[0]?.getSettings?.() ?? {}
        setInfo({
          width: s.width,
          height: s.height,
          frameRate: s.frameRate ? Math.round(s.frameRate) : undefined,
          lowPower,
        })
      } catch (_) {}

      setReady(true)
    } catch (err) {
      let message = 'No se pudo acceder a la cámara.'
      switch (err?.name) {
        case 'NotAllowedError':
        case 'SecurityError':
          message =
            'Permiso de cámara denegado. Habilítalo en tu navegador y vuelve a intentar.'
          break
        case 'NotFoundError':
        case 'DevicesNotFoundError':
          message = 'No se encontró ninguna cámara en este dispositivo.'
          break
        case 'NotReadableError':
        case 'TrackStartError':
          message = 'La cámara está siendo usada por otra aplicación.'
          break
        default:
          if (err?.message === 'unsupported')
            message = 'Tu navegador no soporta acceso a la cámara.'
      }
      setError(message)
      setReady(false)
    }
  }, [])

  /** Captura el frame actual → { blob, dataUrl, capturedAt }. */
  const capture = useCallback(
    async (quality = 0.92) => {
      const video = videoRef.current
      if (!video || !video.videoWidth) return null

      const w = video.videoWidth
      const h = video.videoHeight
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')

      if (mirror) {
        ctx.translate(w, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(video, 0, 0, w, h)

      const capturedAt = new Date().toISOString()
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      )
      return { blob, dataUrl, capturedAt }
    },
    [mirror],
  )

  // Limpia el stream al desmontar.
  useEffect(() => stop, [stop])

  return { videoRef, ready, error, info, start, stop, capture }
}
