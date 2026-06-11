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

const LS_APP_CONFIG = 'sistefix_app_config'

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

/** Fusiona parcial con defaults y sanea tipos. */
export function normalizarAppConfig(parcial = {}) {
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
    modoOscuro: Boolean(p.modoOscuro),
    colorPrimario: hexColor(p.colorPrimario, d.colorPrimario),
    colorPrimarioOscuro: hexColor(p.colorPrimarioOscuro, d.colorPrimarioOscuro),
    colorAcento: hexColor(p.colorAcento, d.colorAcento),
    colorFondoApp: hexColor(p.colorFondoApp, d.colorFondoApp),
    logoUrl: p.logoUrl ? String(p.logoUrl) : null,
    bannerUrl: p.bannerUrl ? String(p.bannerUrl) : null,
    loginLogoUrl: p.loginLogoUrl ? String(p.loginLogoUrl) : null,
  }
}

/** Aplica variables CSS y tema en el documento. */
export function aplicarAppConfigEnDom(config) {
  const c = normalizarAppConfig(config)
  const root = document.documentElement
  root.style.setProperty('--app-color-primary', c.colorPrimario)
  root.style.setProperty('--app-color-primary-dark', c.colorPrimarioOscuro)
  root.style.setProperty('--app-color-accent', c.colorAcento)
  root.style.setProperty('--app-color-bg', c.colorFondoApp)
  root.style.setProperty('--bg-home-repair', `url('${urlBannerEfectiva(c)}')`)
  if (c.modoOscuro) root.setAttribute('data-theme', 'dark')
  else root.removeAttribute('data-theme')
}

export function leerAppConfigLocal() {
  try {
    const raw = localStorage.getItem(LS_APP_CONFIG)
    if (!raw) return null
    return normalizarAppConfig(JSON.parse(raw))
  } catch {
    return null
  }
}

export function guardarAppConfigLocal(config) {
  localStorage.setItem(LS_APP_CONFIG, JSON.stringify(normalizarAppConfig(config)))
}

export { LS_APP_CONFIG }
