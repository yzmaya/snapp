import { useCallback, useEffect, useRef, useState } from 'react'

// URL del helper local de impresión (corre en la computadora del evento).
export const HELPER_URL =
  import.meta.env.VITE_PRINT_HELPER_URL || 'http://localhost:47801'

// La primera consulta al helper puede tardar varios segundos: en Windows
// lanza un proceso de PowerShell para listar las colas de impresión (medido
// en ~4s, con picos de 6s). Con un timeout corto el fetch se abortaba
// siempre y el botón Imprimir nunca aparecía. Las siguientes consultas las
// responde el helper desde su caché, en milisegundos.
const STATUS_TIMEOUT_MS = 8000
const POLL_MS = 10000

/**
 * Detecta la impresora SELPHY vía el helper local y permite imprimir.
 * - Si el helper no está corriendo o la impresora no está conectada,
 *   `printer` queda en null (el botón Imprimir no se muestra).
 * - Hace polling para reflejar conexión/desconexión.
 */
export function usePrinter() {
  const [printer, setPrinter] = useState(null) // { connected, printer } | null
  const timer = useRef(null)

  const check = useCallback(async () => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), STATUS_TIMEOUT_MS)
    try {
      const res = await fetch(`${HELPER_URL}/status`, { signal: ctrl.signal })
      const j = await res.json()
      setPrinter(j?.connected ? j : null)
    } catch {
      // Helper apagado o inalcanzable → sin impresora
      setPrinter(null)
    } finally {
      clearTimeout(t)
    }
  }, [])

  useEffect(() => {
    check()
    timer.current = setInterval(check, POLL_MS)
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
