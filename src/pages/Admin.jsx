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
  use_frame: false,
  frame_path: null,
  frame_source: 'generated',
}

const MAX_VARIANTS = 10

function Dashboard({ session }) {
  const [projects, setProjects] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState(empty)
  const [variants, setVariants] = useState([])
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

  const loadVariants = useCallback(async (projectId) => {
    if (!projectId) {
      setVariants([])
      return
    }
    const { data, error } = await supabase
      .from('project_variants')
      .select('*')
      .eq('project_id', projectId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) {
      setMsg('Error cargando estilos: ' + error.message)
      return
    }
    setVariants(data || [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    loadVariants(selectedId)
  }, [selectedId, loadVariants])

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
        use_frame: p.use_frame ?? false,
        frame_path: p.frame_path ?? null,
        frame_source: p.frame_source ?? 'generated',
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
        use_frame: form.use_frame,
        frame_source: form.frame_source,
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

  const frameUrl = (path) =>
    path ? supabase.storage.from('frames').getPublicUrl(path).data.publicUrl : null

  const uploadFrame = async (file) => {
    if (!file || !selectedId) return
    const ext = file.name.split('.').pop()
    const path = `${selectedId}/frame.${ext}`
    const { error: upErr } = await supabase.storage
      .from('frames')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) return flash('Error subiendo marco: ' + upErr.message)
    const { error } = await supabase
      .from('projects')
      .update({ frame_path: path })
      .eq('id', selectedId)
    if (error) return flash('Error: ' + error.message)
    await load()
    flash('Marco actualizado ✓')
  }

  const deleteFrame = async () => {
    if (form.frame_path) await supabase.storage.from('frames').remove([form.frame_path])
    const { error } = await supabase
      .from('projects')
      .update({ frame_path: null })
      .eq('id', selectedId)
    if (error) return flash('Error: ' + error.message)
    await load()
    flash('Marco eliminado')
  }

  const exampleUrl = (path) =>
    path ? supabase.storage.from('examples').getPublicUrl(path).data.publicUrl : null

  // ---- Estilos (variantes) ----
  const addVariant = async () => {
    if (!selectedId) return
    if (variants.length >= MAX_VARIANTS)
      return flash(`Máximo ${MAX_VARIANTS} estilos por proyecto`)
    const { error } = await supabase.from('project_variants').insert({
      project_id: selectedId,
      position: variants.length,
      label: `Opción ${variants.length + 1}`,
      prompt:
        'En la imagen de REFERENCIA aparece un personaje (recortado, con fondo ' +
        'transparente). Intégralo de forma realista JUNTO a la persona o personas ' +
        'de la FOTO, MUY CERCA y en contacto físico, en pose amistosa de convivencia: ' +
        'el personaje pasa el brazo por detrás y apoya la mano sobre el hombro de la ' +
        'persona, de modo que se vean unidos e interactuando para la misma foto (NO ' +
        'separados ni distantes). Deben compartir el mismo plano y distancia a la ' +
        'cámara, con iluminación, perspectiva, escala y sombras coherentes y bordes ' +
        'naturales. Conserva de forma fiel y reconocible el rostro y los rasgos tanto ' +
        'del personaje de la referencia como de las personas de la FOTO. Mantén el ' +
        'fondo y el entorno de la FOTO original.',
    })
    if (error) return flash('Error: ' + error.message)
    await loadVariants(selectedId)
    flash('Estilo agregado')
  }

  // Edición local (se persiste con "Guardar estilo")
  const patchVariant = (id, patch) =>
    setVariants((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)))

  const saveVariant = async (v) => {
    const { error } = await supabase
      .from('project_variants')
      .update({ label: v.label.trim() || 'Opción', prompt: v.prompt })
      .eq('id', v.id)
    if (error) return flash('Error al guardar estilo: ' + error.message)
    flash('Estilo guardado ✓')
  }

  const removeVariant = async (v) => {
    if (!confirm(`¿Eliminar el estilo "${v.label}"?`)) return
    if (v.example_path) await supabase.storage.from('examples').remove([v.example_path])
    const { error } = await supabase.from('project_variants').delete().eq('id', v.id)
    if (error) return flash('Error: ' + error.message)
    await loadVariants(selectedId)
    flash('Estilo eliminado')
  }

  const uploadExample = async (v, file) => {
    if (!file) return
    const ext = file.name.split('.').pop()
    const path = `${selectedId}/${v.id}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('examples')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) return flash('Error subiendo ejemplo: ' + upErr.message)
    const { error } = await supabase
      .from('project_variants')
      .update({ example_path: path })
      .eq('id', v.id)
    if (error) return flash('Error: ' + error.message)
    await loadVariants(selectedId)
    flash('Imagen de ejemplo actualizada ✓')
  }

  const deleteExample = async (v) => {
    if (v.example_path) await supabase.storage.from('examples').remove([v.example_path])
    const { error } = await supabase
      .from('project_variants')
      .update({ example_path: null })
      .eq('id', v.id)
    if (error) return flash('Error: ' + error.message)
    await loadVariants(selectedId)
    flash('Imagen de ejemplo eliminada')
  }

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

              {/* Marco: superposición fija sobre la imagen final */}
              <div className="frame-section">
                <div className="admin-card__head" style={{ marginTop: 20 }}>
                  <h2 style={{ fontSize: 16 }}>Marco</h2>
                </div>
                <label className="admin-check" style={{ margin: '4px 0 10px' }}>
                  <input
                    type="checkbox"
                    checked={form.use_frame}
                    onChange={(e) => setForm({ ...form, use_frame: e.target.checked })}
                  />
                  Usar marco (la foto aparece dentro de este marco fijo)
                </label>

                {form.use_frame && (
                  <>
                    <p className="admin-hint" style={{ marginTop: 0, marginBottom: 12 }}>
                      Sube un <strong>PNG con el centro transparente</strong> (la
                      ventana donde aparecerá la foto). Detectamos esa zona y
                      colocamos la imagen ahí; los bordes, encabezado y banner del
                      marco quedan por encima.
                    </p>

                    <div className="field">
                      <label>Aplicar el marco a</label>
                      <select
                        value={form.frame_source}
                        onChange={(e) => setForm({ ...form, frame_source: e.target.value })}
                      >
                        <option value="generated">El resultado generado por IA</option>
                        <option value="original">La foto original (sin IA)</option>
                      </select>
                    </div>

                    <div className="logos" style={{ gridTemplateColumns: '1fr' }}>
                      <LogoSlot
                        title="Imagen del marco (PNG transparente)"
                        url={frameUrl(form.frame_path)}
                        onUpload={(f) => uploadFrame(f)}
                        onDelete={() => deleteFrame()}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="variants">
                <div className="admin-card__head" style={{ marginTop: 20 }}>
                  <h2 style={{ fontSize: 16 }}>Estilos (opciones de resultado)</h2>
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={addVariant}
                    disabled={variants.length >= MAX_VARIANTS}
                  >
                    + Estilo
                  </button>
                </div>
                <p className="admin-hint" style={{ marginTop: 0, marginBottom: 12 }}>
                  Agrega de 1 a {MAX_VARIANTS} estilos, cada uno con la imagen del
                  personaje/escena de referencia. El invitado elige uno antes de tomarse
                  la foto y esa referencia se envía a la IA junto con su foto. El prompt
                  por defecto ya inserta al <strong>personaje de la referencia junto a los
                  invitados</strong> (como si posaran juntos); solo necesitas subir la
                  imagen. Puedes ajustar el prompt si quieres otro efecto. Sin estilos, el
                  proyecto usa el prompt de arriba.
                </p>
                {variants.length === 0 ? (
                  <p className="admin-muted">Este proyecto no tiene estilos (usa el prompt general).</p>
                ) : (
                  <div className="variant-grid">
                    {variants.map((v, i) => (
                      <VariantCard
                        key={v.id}
                        index={i}
                        variant={v}
                        exampleUrl={exampleUrl(v.example_path)}
                        onChange={(patch) => patchVariant(v.id, patch)}
                        onSave={() => saveVariant(v)}
                        onDelete={() => removeVariant(v)}
                        onUpload={(f) => uploadExample(v, f)}
                        onDeleteImage={() => deleteExample(v)}
                      />
                    ))}
                  </div>
                )}
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

function VariantCard({ index, variant, exampleUrl, onChange, onSave, onDelete, onUpload, onDeleteImage }) {
  return (
    <div className="variant-card">
      <div className="variant-card__preview" data-empty={!exampleUrl}>
        {exampleUrl ? (
          <img src={exampleUrl} alt={variant.label} />
        ) : (
          <span>Imagen de ejemplo del resultado</span>
        )}
      </div>
      <div className="logo-slot__actions">
        <label className="btn btn--ghost btn--sm">
          {exampleUrl ? 'Cambiar imagen' : 'Subir imagen'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files[0] && onUpload(e.target.files[0])}
          />
        </label>
        {exampleUrl && (
          <button className="btn btn--danger btn--sm" onClick={onDeleteImage}>
            Quitar
          </button>
        )}
      </div>

      <div className="field">
        <label>Nombre del estilo (lo ve el invitado)</label>
        <input
          type="text"
          value={variant.label}
          placeholder={`Opción ${index + 1}`}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </div>

      <div className="field">
        <label>Prompt de este estilo</label>
        <textarea
          rows={4}
          value={variant.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
        />
      </div>

      <div className="variant-card__actions">
        <button className="btn btn--danger btn--sm" onClick={onDelete}>
          Eliminar estilo
        </button>
        <button className="btn btn--primary btn--sm" onClick={onSave}>
          Guardar estilo
        </button>
      </div>
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
