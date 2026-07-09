import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Modal con la foto LEGO generada.
 * Sub-estados internos: 'result' → 'form' → 'sent'.
 *  - onCancel(): cierra y vuelve a la cámara.
 *  - onSend(form): envía el correo (Promise). Debe lanzar en caso de error.
 */
export default function ResultModal({ imageUrl, onCancel, onSend }) {
  const [view, setView] = useState('result') // result | form | sent
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const backdropRef = useRef(null)
  const cardRef = useRef(null)

  // Animación de entrada
  useEffect(() => {
    const tl = gsap.timeline()
    tl.fromTo(
      backdropRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.25, ease: 'power1.out' },
    ).fromTo(
      cardRef.current,
      { y: 40, scale: 0.92, opacity: 0 },
      { y: 0, scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.6)' },
      '-=0.1',
    )
  }, [])

  // Transición suave entre sub-vistas
  useEffect(() => {
    if (cardRef.current) {
      gsap.fromTo(
        cardRef.current.querySelector('[data-view]'),
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' },
      )
    }
  }, [view])

  const close = (cb) => {
    const tl = gsap.timeline({ onComplete: cb })
    tl.to(cardRef.current, {
      y: 30,
      scale: 0.94,
      opacity: 0,
      duration: 0.3,
      ease: 'power2.in',
    }).to(backdropRef.current, { opacity: 0, duration: 0.25 }, '-=0.15')
  }

  const handleCancel = () => close(onCancel)

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) return setError('Escribe tu nombre.')
    if (!EMAIL_RE.test(form.email.trim()))
      return setError('Escribe un correo válido.')

    setSending(true)
    try {
      await onSend({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      })
      setView('sent')
    } catch (err) {
      setError(
        err?.message ||
          'No se pudo enviar el correo. Revisa la conexión e intenta de nuevo.',
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="modal-backdrop" ref={backdropRef}>
      <div className="modal" ref={cardRef}>
        {view === 'result' && (
          <div data-view="result">
            <h2 className="modal__title">¡Tu SNAPP está listo! 🧱</h2>
            <p className="modal__subtitle">Así te ves en versión LEGO</p>
            <div className="modal__img" style={{ marginTop: 16 }}>
              <img src={imageUrl} alt="Tu versión LEGO" />
            </div>
            <div className="actions" style={{ marginTop: 18 }}>
              <button className="btn btn--danger btn--lg" onClick={handleCancel}>
                Cancelar
              </button>
              <button
                className="btn btn--primary btn--lg"
                onClick={() => setView('form')}
              >
                Enviar
              </button>
            </div>
          </div>
        )}

        {view === 'form' && (
          <div data-view="form">
            <h2 className="modal__title">Te la enviamos por correo</h2>
            <p className="modal__subtitle">
              Déjanos tus datos y recibe tu foto
            </p>
            <form className="form" onSubmit={handleSubmit} style={{ marginTop: 8 }}>
              <div className="field">
                <label htmlFor="name">Nombre</label>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Tu nombre"
                  value={form.name}
                  onChange={update('name')}
                  disabled={sending}
                />
              </div>
              <div className="field">
                <label htmlFor="email">Correo</label>
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="tu@correo.com"
                  value={form.email}
                  onChange={update('email')}
                  disabled={sending}
                />
              </div>
              <div className="field">
                <label htmlFor="phone">
                  Teléfono <span className="opt">(opcional)</span>
                </label>
                <input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="55 1234 5678"
                  value={form.phone}
                  onChange={update('phone')}
                  disabled={sending}
                />
              </div>

              {error && <p className="form__error">{error}</p>}

              <div className="actions" style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="btn btn--ghost btn--lg"
                  onClick={() => setView('result')}
                  disabled={sending}
                >
                  Atrás
                </button>
                <button
                  type="submit"
                  className="btn btn--primary btn--lg"
                  disabled={sending}
                >
                  {sending ? <span className="spinner" style={{ width: 22, height: 22, borderWidth: 3 }} /> : 'Enviar'}
                </button>
              </div>
            </form>
          </div>
        )}

        {view === 'sent' && (
          <div data-view="sent">
            <div className="form__success">
              <div className="check">✓</div>
              <h2 className="modal__title">¡Enviado!</h2>
              <p className="modal__subtitle">
                Revisa tu correo <strong>{form.email}</strong>. ¡Gracias por
                participar!
              </p>
              <button
                className="btn btn--primary btn--lg"
                style={{ marginTop: 10 }}
                onClick={handleCancel}
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
