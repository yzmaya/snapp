import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

/**
 * Cuenta regresiva 3 · 2 · 1 en grande, animada con GSAP.
 * Llama onDone() al terminar (justo antes del disparo).
 */
export default function Countdown({ from = 3, onDone }) {
  const [n, setN] = useState(from)
  const numRef = useRef(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    let current = from
    setN(current)

    const animateNumber = () => {
      const el = numRef.current
      if (!el) return
      gsap.fromTo(
        el,
        { scale: 0.3, opacity: 0 },
        {
          scale: 1,
          opacity: 1,
          duration: 0.35,
          ease: 'back.out(2)',
          onComplete: () => {
            gsap.to(el, {
              scale: 1.6,
              opacity: 0,
              duration: 0.55,
              delay: 0.1,
              ease: 'power2.in',
            })
          },
        },
      )
    }

    animateNumber()
    const interval = setInterval(() => {
      current -= 1
      if (current <= 0) {
        clearInterval(interval)
        doneRef.current?.()
        return
      }
      setN(current)
      animateNumber()
    }, 1000)

    return () => clearInterval(interval)
  }, [from])

  return (
    <div className="countdown" aria-live="assertive">
      <span className="countdown__num" ref={numRef}>
        {n}
      </span>
    </div>
  )
}
