import { useEffect, useMemo, useState } from 'react'
import { APP_CONFIG_DEFECTO, aplicarAppConfigEnDom } from './appConfig.js'
import { useAppConfig } from './AppConfigContext.jsx'

function CampoTexto({ label, value, onChange, disabled, multiline = false, hint }) {
  return (
    <label className="admin-app-config-campo">
      <span className="admin-app-config-label">{label}</span>
      {multiline ? (
        <textarea
          rows={3}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input type="text" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint ? <span className="admin-app-config-hint muted small">{hint}</span> : null}
    </label>
  )
}

function CampoColor({ label, value, onChange, disabled }) {
  return (
    <label className="admin-app-config-campo admin-app-config-campo--color">
      <span className="admin-app-config-label">{label}</span>
      <div className="admin-app-config-color-row">
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} selector`}
        />
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          pattern="#[0-9a-fA-F]{6}"
          spellCheck={false}
        />
      </div>
    </label>
  )
}

function BloqueImagen({
  titulo,
  descripcion,
  previewUrl,
  imagenPersonalizada = false,
  onFile,
  onQuitar,
  disabled,
  subiendo,
  quitando,
}) {
  const ocupado = subiendo || quitando
  return (
    <div className="admin-app-config-imagen">
      <div className="admin-app-config-imagen-head">
        <h4>{titulo}</h4>
        <p className="muted small">{descripcion}</p>
      </div>
      {previewUrl ? (
        <div className="admin-app-config-imagen-preview">
          <img src={previewUrl} alt="" />
          {imagenPersonalizada ? (
            <span className="admin-app-config-imagen-badge">Personalizada</span>
          ) : (
            <span className="admin-app-config-imagen-badge admin-app-config-imagen-badge--defecto">
              Predeterminada
            </span>
          )}
        </div>
      ) : null}
      <div className="admin-app-config-imagen-acciones">
        <label className="admin-app-config-upload-btn">
          <input
            type="file"
            accept="image/jpeg,image/png,image/jpg"
            disabled={disabled || ocupado}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) onFile(f)
            }}
          />
          {subiendo ? '⏳ Subiendo…' : '📁 Cargar JPG o PNG (máx. 2 MB)'}
        </label>
        {imagenPersonalizada ? (
          <button
            type="button"
            className="admin-app-config-quitar-btn"
            disabled={disabled || ocupado}
            onClick={() => onQuitar?.()}
          >
            {quitando ? '⏳ Quitando…' : '🗑 Quitar imagen cargada'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default function AdministracionAppConfigPanel({
  supabase,
  puedeConfigurar = false,
  onError,
  onNotice,
}) {
  const { config, logoUrl, bannerUrl, loginLogoUrl, guardar, subirImagen, eliminarImagen, restablecer, guardando } =
    useAppConfig()
  const [borrador, setBorrador] = useState({ ...config })
  const [subiendo, setSubiendo] = useState(null)
  const [quitando, setQuitando] = useState(null)

  useEffect(() => {
    setBorrador({ ...config })
  }, [config])

  useEffect(() => {
    aplicarAppConfigEnDom(borrador)
  }, [borrador])

  useEffect(() => {
    return () => aplicarAppConfigEnDom(config)
  }, [config])

  const hayCambios = useMemo(() => {
    return Object.keys(APP_CONFIG_DEFECTO).some((k) => {
      if (k.endsWith('Url')) return false
      return borrador[k] !== config[k]
    })
  }, [borrador, config])

  function patch(cambios) {
    setBorrador((prev) => ({ ...prev, ...cambios }))
  }

  async function guardarTextosYColores() {
    if (!puedeConfigurar) return
    try {
      await guardar(borrador)
      onNotice?.('Configuración del sistema guardada.')
    } catch (e) {
      onError?.(`No se pudo guardar: ${e.message}`)
    }
  }

  async function manejarImagen(file, tipo) {
    if (!puedeConfigurar) return
    setSubiendo(tipo)
    try {
      await subirImagen(file, tipo)
      onNotice?.('Imagen actualizada.')
    } catch (e) {
      onError?.(`Error al subir imagen: ${e.message}`)
    } finally {
      setSubiendo(null)
    }
  }

  async function manejarQuitarImagen(tipo, etiqueta) {
    if (!puedeConfigurar) return
    if (!confirm(`¿Quitar la imagen personalizada de «${etiqueta}» y volver al predeterminado?`)) return
    setQuitando(tipo)
    try {
      await eliminarImagen(tipo)
      onNotice?.('Imagen eliminada.')
    } catch (e) {
      onError?.(`Error al quitar imagen: ${e.message}`)
    } finally {
      setQuitando(null)
    }
  }

  async function restablecerTodo() {
    if (!puedeConfigurar) return
    if (!confirm('¿Restablecer logo, colores, textos y banner a los valores Sistefix por defecto?')) return
    try {
      await restablecer()
      onNotice?.('Configuración restablecida.')
    } catch (e) {
      onError?.(`No se pudo restablecer: ${e.message}`)
    }
  }

  return (
    <section className="card-pad administracion-config-panel admin-app-config-panel">
      <header className="administracion-panel-head">
        <div>
          <h2>Configuración del sistema</h2>
          <p className="muted administracion-panel-help">
            Personalice la apariencia para otra empresa: nombre, login, colores, logo y banner de inicio.
            Los cambios se aplican a todos los usuarios.
          </p>
        </div>
      </header>

      {!puedeConfigurar ? (
        <p className="administracion-config-solo-lectura" role="status">
          Solo el rol <strong>ADMIN</strong> puede modificar colores, textos, logo y banner del sistema.
        </p>
      ) : null}

      <div className="admin-app-config-vista-previa card-pad">
        <h3 className="admin-app-config-seccion-titulo">Vista previa rápida</h3>
        <div className="admin-app-config-preview-row">
          <div
            className="admin-app-config-preview-banner"
            style={{ backgroundImage: `url('${bannerUrl}')` }}
          >
            <img src={logoUrl} alt="" className="admin-app-config-preview-logo" />
          </div>
          <div className="admin-app-config-preview-login">
            <strong>{borrador.loginTitulo}</strong>
            <span className="muted small">{borrador.loginSubtitulo}</span>
          </div>
        </div>
      </div>

      <div className="admin-app-config-seccion">
        <h3 className="admin-app-config-seccion-titulo">Identidad e inicio</h3>
        <div className="admin-app-config-grid">
          <CampoTexto
            label="Nombre de la aplicación"
            value={borrador.nombreApp}
            disabled={!puedeConfigurar || guardando}
            onChange={(v) => patch({ nombreApp: v })}
          />
          <CampoTexto
            label="Subtítulo en pantalla de inicio"
            value={borrador.subtituloInicio}
            disabled={!puedeConfigurar || guardando}
            onChange={(v) => patch({ subtituloInicio: v })}
            multiline
          />
          <CampoTexto
            label="Texto del pie de inicio"
            value={borrador.pieInicioTexto}
            disabled={!puedeConfigurar || guardando}
            onChange={(v) => patch({ pieInicioTexto: v })}
          />
          <CampoTexto
            label="Enlace del pie (URL)"
            value={borrador.pieInicioUrl}
            disabled={!puedeConfigurar || guardando}
            onChange={(v) => patch({ pieInicioUrl: v })}
          />
        </div>
      </div>

      <div className="admin-app-config-seccion">
        <h3 className="admin-app-config-seccion-titulo">Pantalla de inicio de sesión</h3>
        <div className="admin-app-config-grid">
          <CampoTexto
            label="Título del login"
            value={borrador.loginTitulo}
            disabled={!puedeConfigurar || guardando}
            onChange={(v) => patch({ loginTitulo: v })}
          />
          <CampoTexto
            label="Subtítulo del login"
            value={borrador.loginSubtitulo}
            disabled={!puedeConfigurar || guardando}
            onChange={(v) => patch({ loginSubtitulo: v })}
          />
          <CampoTexto
            label="Etiqueta correo"
            value={borrador.loginLabelCorreo}
            disabled={!puedeConfigurar || guardando}
            onChange={(v) => patch({ loginLabelCorreo: v })}
          />
          <CampoTexto
            label="Etiqueta contraseña"
            value={borrador.loginLabelPassword}
            disabled={!puedeConfigurar || guardando}
            onChange={(v) => patch({ loginLabelPassword: v })}
          />
          <CampoTexto
            label="Placeholder correo"
            value={borrador.loginPlaceholderCorreo}
            disabled={!puedeConfigurar || guardando}
            onChange={(v) => patch({ loginPlaceholderCorreo: v })}
          />
          <CampoTexto
            label="Placeholder contraseña"
            value={borrador.loginPlaceholderPassword}
            disabled={!puedeConfigurar || guardando}
            onChange={(v) => patch({ loginPlaceholderPassword: v })}
          />
          <CampoTexto
            label="Texto del botón"
            value={borrador.loginBoton}
            disabled={!puedeConfigurar || guardando}
            onChange={(v) => patch({ loginBoton: v })}
          />
          <CampoTexto
            label="Letra del avatar (si no hay logo de login)"
            value={borrador.loginAvatarLetra}
            disabled={!puedeConfigurar || guardando}
            onChange={(v) => patch({ loginAvatarLetra: v })}
            hint="Se usa cuando no carga logo en login (1–2 caracteres)."
          />
          <CampoTexto
            label="Mensaje de ayuda bajo el login"
            value={borrador.loginHint}
            disabled={!puedeConfigurar || guardando}
            onChange={(v) => patch({ loginHint: v })}
            multiline
          />
        </div>
      </div>

      <div className="admin-app-config-seccion">
        <h3 className="admin-app-config-seccion-titulo">Colores y tema</h3>
        <label className="admin-app-config-toggle">
          <input
            type="checkbox"
            checked={Boolean(borrador.modoOscuro)}
            disabled={!puedeConfigurar || guardando}
            onChange={(e) => patch({ modoOscuro: e.target.checked })}
          />
          <span>Modo oscuro en toda la aplicación</span>
        </label>
        <div className="admin-app-config-grid admin-app-config-grid--colores">
          <CampoColor
            label="Color primario"
            value={borrador.colorPrimario}
            disabled={!puedeConfigurar || guardando}
            onChange={(v) => patch({ colorPrimario: v })}
          />
          <CampoColor
            label="Color primario oscuro"
            value={borrador.colorPrimarioOscuro}
            disabled={!puedeConfigurar || guardando}
            onChange={(v) => patch({ colorPrimarioOscuro: v })}
          />
          <CampoColor
            label="Color acento"
            value={borrador.colorAcento}
            disabled={!puedeConfigurar || guardando}
            onChange={(v) => patch({ colorAcento: v })}
          />
          <CampoColor
            label="Fondo general de la app"
            value={borrador.colorFondoApp}
            disabled={!puedeConfigurar || guardando}
            onChange={(v) => patch({ colorFondoApp: v })}
          />
        </div>
      </div>

      <div className="admin-app-config-seccion">
        <h3 className="admin-app-config-seccion-titulo">Imágenes (JPG o PNG)</h3>
        {!supabase ? (
          <p className="warn-inline">Sin Supabase: las imágenes se guardan en este navegador (modo local).</p>
        ) : null}
        <div className="admin-app-config-imagenes-grid">
          <BloqueImagen
            titulo="Logo de inicio"
            descripcion="Aparece en la cabecera del menú principal (como el logo Sistebit)."
            previewUrl={logoUrl}
            imagenPersonalizada={Boolean(config.logoUrl)}
            disabled={!puedeConfigurar}
            subiendo={subiendo === 'logo'}
            quitando={quitando === 'logo'}
            onFile={(f) => void manejarImagen(f, 'logo')}
            onQuitar={() => void manejarQuitarImagen('logo', 'Logo de inicio')}
          />
          <BloqueImagen
            titulo="Banner de fondo"
            descripcion="Imagen de fondo del inicio y del login (taller, marca, etc.)."
            previewUrl={bannerUrl}
            imagenPersonalizada={Boolean(config.bannerUrl)}
            disabled={!puedeConfigurar}
            subiendo={subiendo === 'banner'}
            quitando={quitando === 'banner'}
            onFile={(f) => void manejarImagen(f, 'banner')}
            onQuitar={() => void manejarQuitarImagen('banner', 'Banner de fondo')}
          />
          <BloqueImagen
            titulo="Logo en login (opcional)"
            descripcion="Si no sube uno, se usa el logo de inicio o la letra del avatar."
            previewUrl={loginLogoUrl}
            imagenPersonalizada={Boolean(config.loginLogoUrl)}
            disabled={!puedeConfigurar}
            subiendo={subiendo === 'login_logo'}
            quitando={quitando === 'login_logo'}
            onFile={(f) => void manejarImagen(f, 'login_logo')}
            onQuitar={() => void manejarQuitarImagen('login_logo', 'Logo en login')}
          />
        </div>
      </div>

      <div className="administracion-config-acciones">
        <button
          type="button"
          className="btn-primary"
          disabled={!puedeConfigurar || guardando || !hayCambios}
          onClick={() => void guardarTextosYColores()}
        >
          {guardando ? 'Guardando…' : '💾 Guardar textos y colores'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={!puedeConfigurar || guardando}
          onClick={() => void restablecerTodo()}
        >
          ↺ Restablecer todo
        </button>
      </div>
    </section>
  )
}
