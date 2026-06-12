import {
  PREFERENCIAS_USUARIO_DEFECTO,
  normalizarPreferenciasUsuario,
} from './appConfig.js'

const LS_USER_PREFS_PREFIX = 'sistefix_user_prefs_'

function lsKey(userId) {
  return `${LS_USER_PREFS_PREFIX}${userId || 'local'}`
}

export function leerPreferenciasUsuarioLocal(userId) {
  try {
    const raw = localStorage.getItem(lsKey(userId))
    if (!raw) return { ...PREFERENCIAS_USUARIO_DEFECTO }
    return normalizarPreferenciasUsuario(JSON.parse(raw))
  } catch {
    return { ...PREFERENCIAS_USUARIO_DEFECTO }
  }
}

export function guardarPreferenciasUsuarioLocal(userId, preferencias) {
  const payload = normalizarPreferenciasUsuario(preferencias)
  localStorage.setItem(lsKey(userId), JSON.stringify(payload))
  return payload
}

/** Carga preferencias del usuario autenticado (Supabase o localStorage). */
export async function cargarPreferenciasUsuarioServidor(supabase, userId) {
  if (!userId) {
    return { ...PREFERENCIAS_USUARIO_DEFECTO }
  }
  if (!supabase) {
    return leerPreferenciasUsuarioLocal(userId)
  }
  try {
    const { data, error } = await supabase.rpc('obtener_mis_preferencias_app')
    if (error) throw error
    const normalizada = normalizarPreferenciasUsuario(data ?? {})
    guardarPreferenciasUsuarioLocal(userId, normalizada)
    return normalizada
  } catch {
    return leerPreferenciasUsuarioLocal(userId)
  }
}

export async function guardarPreferenciasUsuarioServidor(supabase, userId, preferencias) {
  const payload = normalizarPreferenciasUsuario(preferencias)
  if (!supabase || !userId) {
    guardarPreferenciasUsuarioLocal(userId, payload)
    return payload
  }
  const { data, error } = await supabase.rpc('guardar_mis_preferencias_app', {
    p_preferencias: payload,
  })
  if (error) throw error
  const guardado = normalizarPreferenciasUsuario(data ?? payload)
  guardarPreferenciasUsuarioLocal(userId, guardado)
  return guardado
}

export async function restablecerPreferenciasUsuarioServidor(supabase, userId) {
  return guardarPreferenciasUsuarioServidor(supabase, userId, { ...PREFERENCIAS_USUARIO_DEFECTO })
}
