import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { usePrinter } from '../hooks/usePrinter.js'
import { Login, Unauthorized, isAdminEmail } from './Admin.jsx'

const LIMIT = 5

// /#/print — últimas fotos generadas para volver a imprimirlas.
// Protegida con la misma sesión @mayam.lat del panel (son fotos de invitados).
export default function Reprint() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="admin-center">
        <div className="spinner" />
      </div>
    )
  }
  if (!session) return <Login redirectHash="#/print" title="Reimprimir fotos" />
  if (!isAdminEmail(session.user?.email)) return <Unauthorized email={session.user?.email} />
  return <RecentList />
}

function RecentList() {
  const { printer, print } = usePrinter()
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [state, setState] = useState({}) // id -> { status, msg }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error } = await supabase.rpc('recent_prints', { p_limit: LIMIT })
    if (error) setError(error.message)
    else setItems(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const doPrint = async (item) => {
    setState((s) => ({ ...s, [item.id]: { status: 'printing' } }))
    try {
      await print(item.generated_url)
      setState((s) => ({ ...s, [item.id]: { status: 'done' } }))
    } catch (err) {
      setState((s) => ({
        ...s,
        [item.id]: { status: 'error', msg: err?.message || 'No se pudo imprimir.' },
      }))
    }
  }

  return (
    <div className="admin">
      <header className="admin-header">
        <div>
          <span className="brand__eyebrow">Reimprimir</span>
          <div className="wordmark" style={{ fontSize: 22 }}>SNAPP</div>
        </div>
        <div className="admin-header__right">
          <Link to="/" className="btn btn--ghost">Ver app</Link>
          <button className="btn btn--primary" onClick={load} disabled={loading}>
            {loading ? 'Cargando…' : '↻ Actualizar'}
          </button>
        </div>
      </header>

      <p className="admin-muted">
        Últimas {LIMIT} fotos generadas ·{' '}
        {printer ? (
          <>🖨️ Impresora lista: <strong>{printer.printer}</strong></>
        ) : (
          <>
            ⚠️ No se detecta la impresora. Revisa el{' '}
            <Link to="/impresora">diagnóstico</Link>.
          </>
        )}
      </p>

      {error && <p className="form__error">{error}</p>}
      {items && items.length === 0 && <p className="admin-muted">Aún no hay fotos.</p>}

      <div className="reprint-grid">
        {items?.map((item) => {
          const st = state[item.id] || {}
          return (
            <div className="admin-card reprint-card" key={item.id}>
              <img src={item.generated_url} alt={item.name || 'Foto'} loading="lazy" />
              <div className="reprint-card__meta">
                <strong>{item.name || 'Sin nombre'}</strong>
                <span className="admin-muted">
                  {new Date(item.created_at).toLocaleString()}
                  {item.project_title ? ` · ${item.project_title}` : ''}
                </span>
              </div>
              <button
                className="btn btn--print"
                onClick={() => doPrint(item)}
                disabled={!printer || st.status === 'printing'}
              >
                {st.status === 'printing'
                  ? 'Enviando…'
                  : st.status === 'done'
                    ? '✓ Enviada · Imprimir otra'
                    : '🖨️ Imprimir'}
              </button>
              {st.status === 'error' && <p className="form__error">{st.msg}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
