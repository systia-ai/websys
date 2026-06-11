import {
  ROLES_SISTEMA,
  PERMISOS_DEFECTO_POR_ROL,
  guardarPermisosRolesLocal,
  leerPermisosRolesLocal,
  mapaDesdeListaParcial,
  normalizarRolSistema,
  todasLasClavesPermiso,
} from './permisosConfig.js'

function filasAResumen(filas) {
  const out = {}
  for (const row of filas ?? []) {
    const rol = normalizarRolSistema(row?.rol)
    if (rol === 'ADMIN') continue
    const permisos = row?.permisos
    if (permisos && typeof permisos === 'object' && !Array.isArray(permisos)) {
      out[rol] = mapaDesdeListaParcial(permisos)
    }
  }
  return out
}

/** Carga personalizaciones guardadas (Supabase o localStorage). */
export async function cargarPermisosRolesServidor(supabase) {
  if (!supabase) {
    return leerPermisosRolesLocal()
  }
  try {
    const { data, error } = await supabase.rpc('obtener_permisos_roles')
    if (error) throw error
    return filasAResumen(data)
  } catch {
    return leerPermisosRolesLocal()
  }
}

export async function guardarPermisosRolServidor(supabase, rol, permisosMap) {
  const r = normalizarRolSistema(rol)
  if (r === 'ADMIN') {
    throw new Error('Los permisos de ADMIN no se pueden modificar.')
  }
  const payload = mapaDesdeListaParcial(permisosMap)

  if (!supabase) {
    const prev = leerPermisosRolesLocal() ?? {}
    prev[r] = payload
    guardarPermisosRolesLocal(prev)
    return payload
  }

  const { error } = await supabase.rpc('guardar_permisos_rol', {
    p_rol: r,
    p_permisos: payload,
  })
  if (error) throw error
  return payload
}

export async function restablecerPermisosRolServidor(supabase, rol) {
  const r = normalizarRolSistema(rol)
  if (r === 'ADMIN') return PERMISOS_DEFECTO_POR_ROL.ADMIN
  const defecto = { ...PERMISOS_DEFECTO_POR_ROL[r] }
  await guardarPermisosRolServidor(supabase, r, defecto)
  return defecto
}

export function resumenPermisosActivos(permisosMap) {
  const claves = todasLasClavesPermiso()
  const activos = claves.filter((k) => permisosMap?.[k]).length
  return { activos, total: claves.length }
}

export { ROLES_SISTEMA }
