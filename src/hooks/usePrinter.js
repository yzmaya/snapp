import { useCallback, useEffect, useRef, useState } from 'react'

// URL del helper local de impresión (corre en la Mac del evento).
const HELPER_URL =
  import.meta.env.VITE_PRINT_HELPER_URL || 'http://localhost:47801'

/**
 * Detecta la impresora SELPHY vía el helper local y permite imprimir.
 * - Si el helper no está corriendo o la impresora no está conectada,
 *   `printer` queda en null (el botón Imprimir no se muestra).
 * - Hace polling cada 5s para reflejar conexión/desconexión.
 */
export function usePrinter() {
  const [printer, setPrinter] = useState(null) // { connected, printer } | null
  const timer = useRef(null)

  const check = useCallback(async () => {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 1500)
      const res = await fetch(`${HELPER_URL}/status`, { signal: ctrl.signal })
      clearTimeout(t)
      const j = await res.json()
      setPrinter(j?.connected ? j : null)
    } catch {
      // Helper apagado o inalcanzable → sin impresora
      setPrinter(null)
    }
  }, [])

  useEffect(() => {
    check()
    timer.current = setInterval(check, 5000)
    return () => clearInterval(timer.current)
  }, [check])

  const print = useCallback(async (imageUrl) => {
    const res = await fetch(`${HELPER_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j?.error || 'No se pudo imprimir.')
    return j
  }, [])

  return { printer, print, recheck: check }
}
