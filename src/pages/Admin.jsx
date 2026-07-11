import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { CameraIcon } from '../components/Brand.jsx'

const ADMIN_DOMAIN = '@mayam.lat'
const MODELS = [
  { key: 'nano-banana-2', label: 'Nano Banana 2 · rápido (actual)' },
  { key: 'nano-banana-pro', label: 'Nano Banana Pro · mejor calidad' },
  { key: 'vertex', label: 'Vertex · empresarial (requiere credenciales)' },
]
const isAdminEmail = (email) =>
  !!email && email.toLowerCase().endsWith(ADMIN_DOMAIN)

export default function Admin() {
  const [session, setSession] = useState(undefined) // undefined = cargando

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s),
    )
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="admin-center">
        <div className="spinner" />
      </div>
    )
  }
  if (!session) return <Login />
  if (!isAdminEmail(session.user?.email)) return <Unauthorized email={session.user?.email} />
  return <Dashboard session={session} />
}

// ---------------- Login (enlace mágico) ----------------
function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!isAdminEmail(email.trim())) {
      setError(`Solo se permiten correos ${ADMIN_DOMAIN}`)
      return
    }
    setLoading(true)
    const emailRedirectTo = `${window.location.origin}${import.meta.env.BASE_URL}#/admin`
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo },
    })
    setLoading(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="admin-center">
      <div className="admin-card admin-login">
        <div className="brand__badge" style={{ margin: '0 auto 8px' }}>
          <CameraIcon />
        </div>
        <h1 className="admin-title">Panel SNAPP</h1>
        {sent ? (
          <p className="admin-muted" style={{ textAlign: 'center' }}>
            📧 Te enviamos un enlace de acceso a <strong>{email}</strong>.
            Ábrelo en este dispositivo para entrar.
          </p>
        ) : (
          <form className="form" onSubmit={submit}>
            <p className="admin-muted" style={{ textAlign: 'center' }}>
              Ingresa con tu correo <strong>{ADMIN_DOMAIN}</strong>
            </p>
            <div className="field">
              <input
                type="email"
                placeholder={`nestor${ADMIN_DOMAIN}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
              />
            </div>
            {error && <p className="form__error">{error}</p>}
            <button className="btn btn--primary btn--lg" disabled={loading}>
              {loading ? 'Enviando…' : 'Enviar enlace de acceso'}
            </button>
          </form>
        )}
        <Link to="/" className="admin-back">
          ← Volver a la app
        </Link>
      </div>
    </div>
  )
}

function Unauthorized({ email }) {
  return (
    <div className="admin-center">
      <div className="admin-card admin-login">
        <h1 className="admin-title">Acceso no autorizado</h1>
        <p className="admin-muted" style={{ textAlign: 'center' }}>
          La cuenta <strong>{email}</strong> no pertenece al dominio{' '}
          {ADMIN_DOMAIN}.
        </p>
        <button
          className="btn btn--ghost btn--lg"
          onClick={() => supabase.auth.signOut()}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

// ---------------- Dashboard ----------------
const empty = {
  title: '',
  prompt: '',
  model_key: 'nano-banana-2',
  use_logo: false,
  logo_white_path: null,
  logo_color_path: null,
}

function Dashboard({ session }) {
  const [projects, setProjects] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) {
      setMsg('Error cargando proyectos: ' + error.message)
      return
    }
    setProjects(data || [])
    setSelectedId((prev) => prev || data?.find((p) => p.is_active)?.id || data?.[0]?.id || null)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Al cambiar de proyecto seleccionado, carga sus campos
  useEffect(() => {
    const p = projects.find((x) => x.id === selectedId)
    if (p)
      setForm({
        title: p.title,
        prompt: p.prompt,
        model_key: p.model_key,
        use_logo: p.use_logo,
        logo_white_path: p.logo_white_path,
        logo_color_path: p.logo_color_path,
      })
  }, [selectedId, projects])

  const flash = (m) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 3500)
  }

  const createProject = async () => {
    const { data, error } = await supabase
      .from('projects')
      .insert({
        title: 'Nuevo proyecto',
        prompt: 'Describe aquí el efecto que la IA aplicará a la foto.',
        model_key: 'nano-banana-2',
      })
      .select('*')
      .single()
    if (error) return flash('Error: ' + error.message)
    await load()
    setSelectedId(data.id)
    flash('Proyecto creado')
  }

  const save = async () => {
    if (!selectedId) return
    setSaving(true)
    const { error } = await supabase
      .from('projects')
      .update({
        title: form.title.trim() || 'Proyecto',
        prompt: form.prompt,
        model_key: form.model_key,
        use_logo: form.use_logo,
      })
      .eq('id', selectedId)
    setSaving(false)
    if (error) return flash('Error al guardar: ' + error.message)
    await load()
    flash('Guardado ✓')
  }

  const activate = async (id) => {
    const { error } = await supabase.rpc('set_active_project', { p_id: id })
    if (error) return flash('Error: ' + error.message)
    await load()
    flash('Proyecto activo actualizado')
  }

  const removeProject = async (id) => {
    if (!confirm('¿Eliminar este proyecto?')) return
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) return flash('Error: ' + error.message)
    setSelectedId(null)
    await load()
    flash('Proyecto eliminado')
  }

  const uploadLogo = async (which, file) => {
    if (!file || !selectedId) return
    const ext = file.name.split('.').pop()
    const path = `${selectedId}/${which}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('logos')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) return flash('Error subiendo logo: ' + upErr.message)
    const col = which === 'white' ? 'logo_white_path' : 'logo_color_path'
    const { error } = await supabase
      .from('projects')
      .update({ [col]: path })
      .eq('id', selectedId)
    if (error) return flash('Error: ' + error.message)
    await load()
    flash('Logo actualizado ✓')
  }

  const deleteLogo = async (which) => {
    const col = which === 'white' ? 'logo_white_path' : 'logo_color_path'
    const path = form[col]
    if (path) await supabase.storage.from('logos').remove([path])
    const { error } = await supabase
      .from('projects')
      .update({ [col]: null })
      .eq('id', selectedId)
    if (error) return flash('Error: ' + error.message)
    await load()
    flash('Logo eliminado')
  }

  const logoUrl = (path) =>
    path ? supabase.storage.from('logos').getPublicUrl(path).data.publicUrl : null

  return (
    <div className="admin">
      <header className="admin-header">
        <div>
          <span className="brand__eyebrow">Panel de administración</span>
          <div className="wordmark" style={{ fontSize: 22 }}>SNAPP</div>
        </div>
        <div className="admin-header__right">
          <Link to="/" className="btn btn--ghost">Ver app</Link>
          <button className="btn btn--ghost" onClick={() => supabase.auth.signOut()}>
            Salir
          </button>
        </div>
      </header>

      <p className="admin-muted">
        Sesión: <strong>{session.user.email}</strong>
      </p>

      <div className="admin-grid">
        {/* Lista de proyectos */}
        <aside className="admin-card">
          <div className="admin-card__head">
            <h2>Proyectos</h2>
            <button className="btn btn--primary" onClick={createProject}>
              + Nuevo
            </button>
          </div>
          <ul className="proj-list">
            {projects.map((p) => (
              <li
                key={p.id}
                className={`proj-item ${p.id === selectedId ? 'is-selected' : ''}`}
                onClick={() => setSelectedId(p.id)}
              >
                <label className="proj-active" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="radio"
                    name="active"
                    checked={p.is_active}
                    onChange={() => activate(p.id)}
                    title="Marcar como proyecto activo (demo)"
                  />
                </label>
                <span className="proj-title">{p.title}</span>
                {p.is_active && <span className="proj-badge">activo</span>}
              </li>
            ))}
          </ul>
          <p className="admin-hint">El radio marca el proyecto <strong>activo</strong> (el que usa el demo).</p>
        </aside>

        {/* Editor del proyecto seleccionado */}
        <section className="admin-card">
          {!selectedId ? (
            <p className="admin-muted">Selecciona o crea un proyecto.</p>
          ) : (
            <>
              <div className="field">
                <label>Título del proyecto</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>

              <div className="field">
                <label>Modelo de IA</label>
                <select
                  value={form.model_key}
                  onChange={(e) => setForm({ ...form, model_key: e.target.value })}
                >
                  {MODELS.map((m) => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Prompt (efecto que aplica la IA)</label>
                <textarea
                  rows={6}
                  value={form.prompt}
                  onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                />
              </div>

              <label className="admin-check">
                <input
                  type="checkbox"
                  checked={form.use_logo}
                  onChange={(e) => setForm({ ...form, use_logo: e.target.checked })}
                />
                Incluir logo en la imagen generada (arriba a la derecha)
              </label>

              <div className="logos">
                <LogoSlot
                  title="Logo blanco"
                  url={logoUrl(form.logo_white_path)}
                  onUpload={(f) => uploadLogo('white', f)}
                  onDelete={() => deleteLogo('white')}
                />
                <LogoSlot
                  title="Logo original"
                  url={logoUrl(form.logo_color_path)}
                  onUpload={(f) => uploadLogo('color', f)}
                  onDelete={() => deleteLogo('color')}
                />
              </div>

              <div className="admin-actions">
                <button
                  className="btn btn--danger"
                  onClick={() => removeProject(selectedId)}
                >
                  Eliminar
                </button>
                <button className="btn btn--primary" onClick={save} disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {msg && <div className="toast">{msg}</div>}
    </div>
  )
}

function LogoSlot({ title, url, onUpload, onDelete }) {
  return (
    <div className="logo-slot">
      <span className="logo-slot__title">{title}</span>
      <div className="logo-slot__preview" data-empty={!url}>
        {url ? <img src={url} alt={title} /> : <span>sin logo</span>}
      </div>
      <div className="logo-slot__actions">
        <label className="btn btn--ghost btn--sm">
          {url ? 'Cambiar' : 'Subir'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files[0] && onUpload(e.target.files[0])}
          />
        </label>
        {url && (
          <button className="btn btn--danger btn--sm" onClick={onDelete}>
            Quitar
          </button>
        )}
      </div>
    </div>
  )
}
