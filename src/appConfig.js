/** Valores por defecto (Sistefix / Sistebit). */
export const APP_CONFIG_DEFECTO = {
  nombreApp: 'Sistefix Web',
  subtituloInicio: 'Centro de Servicio EPSON · Sistema de gestión integral',
  pieInicioTexto: 'sistebit.com',
  pieInicioUrl: 'https://www.sistebit.com',
  loginTitulo: 'Sistefix Web',
  loginSubtitulo: 'Acceso para personal del taller',
  loginLabelCorreo: 'Correo',
  loginLabelPassword: 'Contraseña',
  loginPlaceholderCorreo: 'usuario@ejemplo.com',
  loginPlaceholderPassword: '••••••••',
  loginBoton: 'Iniciar sesión',
  loginHint:
    'Si no tiene cuenta, pida al administrador que la cree en Supabase (Authentication → Users).',
  loginAvatarLetra: 'S',
  modoOscuro: false,
  colorPrimario: '#1976d2',
  colorPrimarioOscuro: '#0d47a1',
  colorAcento: '#1565c0',
  colorFondoApp: '#f0f4f8',
  /** URL completa o data URL; null = asset por defecto del proyecto */
  logoUrl: null,
  bannerUrl: null,
  loginLogoUrl: null,
}

/** Solo apariencia personal por usuario (no afecta a otros). */
export const PREFERENCIAS_USUARIO_DEFECTO = {
  modoOscuro: false,
  colorPrimario: '#1976d2',
  colorPrimarioOscuro: '#0d47a1',
  colorAcento: '#1565c0',
  colorFondoApp: '#f0f4f8',
}

const CAMPOS_BRANDING = [
  'nombreApp',
  'subtituloInicio',
  'pieInicioTexto',
  'pieInicioUrl',
  'loginTitulo',
  'loginSubtitulo',
  'loginLabelCorreo',
  'loginLabelPassword',
  'loginPlaceholderCorreo',
  'loginPlaceholderPassword',
  'loginBoton',
  'loginHint',
  'loginAvatarLetra',
  'logoUrl',
  'bannerUrl',
  'loginLogoUrl',
]

const LS_APP_CONFIG = 'sistefix_app_config_branding'

/** Fondo general en modo oscuro (no usa colorFondoApp claro del panel). */
export const COLOR_FONDO_OSCURO = '#0f172a'

export function urlLogoPorDefecto() {
  return `${import.meta.env.BASE_URL}assets/sistebit-logo.png`
}

export function urlBannerPorDefecto() {
  return `${import.meta.env.BASE_URL}assets/home-repair-bg.png`
}

export function urlLogoEfectiva(config) {
  const c = normalizarAppConfig(config)
  return c.logoUrl || urlLogoPorDefecto()
}

export function urlBannerEfectiva(config) {
  const c = normalizarAppConfig(config)
  return c.bannerUrl || urlBannerPorDefecto()
}

export function urlLoginLogoEfectiva(config) {
  const c = normalizarAppConfig(config)
  return c.loginLogoUrl || c.logoUrl || urlLogoPorDefecto()
}

function str(val, fallback) {
  const s = String(val ?? '').trim()
  return s || fallback
}

function hexColor(val, fallback) {
  const s = String(val ?? '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback
}

/** Normaliza solo preferencias de apariencia del usuario. */
export function normalizarPreferenciasUsuario(parcial = {}) {
  const d = PREFERENCIAS_USUARIO_DEFECTO
  const p = parcial && typeof parcial === 'object' ? parcial : {}
  return {
    modoOscuro: Boolean(p.modoOscuro),
    colorPrimario: hexColor(p.colorPrimario, d.colorPrimario),
    colorPrimarioOscuro: hexColor(p.colorPrimarioOscuro, d.colorPrimarioOscuro),
    colorAcento: hexColor(p.colorAcento, d.colorAcento),
    colorFondoApp: hexColor(p.colorFondoApp, d.colorFondoApp),
  }
}

/** Marca global (textos, imágenes) sin colores/tema de usuario. */
export function normalizarConfigBranding(parcial = {}) {
  const d = APP_CONFIG_DEFECTO
  const p = parcial && typeof parcial === 'object' ? parcial : {}
  return {
    nombreApp: str(p.nombreApp, d.nombreApp),
    subtituloInicio: str(p.subtituloInicio, d.subtituloInicio),
    pieInicioTexto: str(p.pieInicioTexto, d.pieInicioTexto),
    pieInicioUrl: str(p.pieInicioUrl, d.pieInicioUrl),
    loginTitulo: str(p.loginTitulo, d.loginTitulo),
    loginSubtitulo: str(p.loginSubtitulo, d.loginSubtitulo),
    loginLabelCorreo: str(p.loginLabelCorreo, d.loginLabelCorreo),
    loginLabelPassword: str(p.loginLabelPassword, d.loginLabelPassword),
    loginPlaceholderCorreo: str(p.loginPlaceholderCorreo, d.loginPlaceholderCorreo),
    loginPlaceholderPassword: str(p.loginPlaceholderPassword, d.loginPlaceholderPassword),
    loginBoton: str(p.loginBoton, d.loginBoton),
    loginHint: str(p.loginHint, d.loginHint),
    loginAvatarLetra: str(p.loginAvatarLetra, d.loginAvatarLetra).slice(0, 2) || d.loginAvatarLetra,
    logoUrl: p.logoUrl ? String(p.logoUrl) : null,
    bannerUrl: p.bannerUrl ? String(p.bannerUrl) : null,
    loginLogoUrl: p.loginLogoUrl ? String(p.loginLogoUrl) : null,
  }
}

/** Combina marca global + preferencias del usuario para la UI. */
export function fusionarConfigConPreferencias(branding, preferencias) {
  return {
    ...normalizarConfigBranding(branding),
    ...normalizarPreferenciasUsuario(preferencias),
  }
}

/** Fusiona parcial con defaults y sanea tipos. */
export function normalizarAppConfig(parcial = {}) {
  return fusionarConfigConPreferencias(parcial, parcial)
}

export function payloadBrandingParaGuardar(config) {
  return normalizarConfigBranding(config)
}

export function brandingTieneCambios(a, b) {
  const ca = normalizarConfigBranding(a)
  const cb = normalizarConfigBranding(b)
  return CAMPOS_BRANDING.some((k) => ca[k] !== cb[k])
}

export function preferenciasTienenCambios(a, b) {
  const pa = normalizarPreferenciasUsuario(a)
  const pb = normalizarPreferenciasUsuario(b)
  return Object.keys(PREFERENCIAS_USUARIO_DEFECTO).some((k) => pa[k] !== pb[k])
}

/** Aplica variables CSS y tema en el documento. */
export function aplicarAppConfigEnDom(config) {
  const c = normalizarAppConfig(config)
  const root = document.documentElement
  root.style.setProperty('--app-color-primary', c.colorPrimario)
  root.style.setProperty('--app-color-primary-dark', c.colorPrimarioOscuro)
  root.style.setProperty('--app-color-accent', c.colorAcento)
  if (c.modoOscuro) {
    root.setAttribute('data-theme', 'dark')
    root.style.setProperty('--app-color-bg', COLOR_FONDO_OSCURO)
  } else {
    root.removeAttribute('data-theme')
    root.style.setProperty('--app-color-bg', c.colorFondoApp)
  }
  root.style.setProperty('--bg-home-repair', `url('${urlBannerEfectiva(c)}')`)
}

export function leerAppConfigLocal() {
  try {
    const raw = localStorage.getItem(LS_APP_CONFIG)
    if (!raw) return null
    return normalizarConfigBranding(JSON.parse(raw))
  } catch {
    return null
  }
}

export function guardarAppConfigLocal(branding) {
  localStorage.setItem(LS_APP_CONFIG, JSON.stringify(normalizarConfigBranding(branding)))
}

export { LS_APP_CONFIG }
