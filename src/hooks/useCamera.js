import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Hook de cámara multi-navegador (Safari, Chrome, Firefox, iOS/Android).
 * - Usa navigator.mediaDevices.getUserMedia con fallback a APIs antiguas.
 * - Cámara frontal (facingMode 'user') por defecto.
 * - Captura el frame actual a un blob JPEG, respejando el espejo del preview.
 */
export function useCamera({ mirror = true } = {}) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

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

    try {
      const stream = await getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 1706 }, // ~3:4
        },
      })
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

  /** Captura el frame actual → { blob, dataUrl }. */
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

  return { videoRef, ready, error, start, stop, capture }
}
