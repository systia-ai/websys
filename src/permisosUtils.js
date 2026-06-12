/** Mensaje estándar cuando un usuario intenta una acción sin permiso. */
export const MENSAJE_SIN_PERMISO_ELIMINAR =
  'Su usuario no tiene permisos para realizar esa acción. Consulte con el administrador.'

/** Mensaje al intentar cambiar fechas sin permiso de rango. */
export const MENSAJE_SIN_PERMISO_FECHAS =
  'Su usuario no tiene permisos para cambiar el rango de fechas. Consulte con el administrador.'

/** Mensaje al intentar crear usuarios sin ser administrador. */
export const MENSAJE_SIN_PERMISO_CREAR_USUARIO =
  'Su usuario no tiene permisos para crear usuarios. Consulte con el administrador.'

export {
  esRolAdmin,
  normalizarRolSistema,
  permisosEfectivosRol,
  tienePermiso,
  puedeAccederModulo,
} from './permisosConfig.js'

import { normalizarRolSistema } from './permisosConfig.js'

/** Normaliza rol de `user_roles` (sin fila → TECNICO). */
export function rolDesdeFilaUserRoles(data) {
  if (!data?.rol) return 'TECNICO'
  return normalizarRolSistema(data.rol)
}

/** Sin permiso de fechas: solo el día en curso; con permiso conserva el rango elegido. */
export function rangoFechasPermitidoUsuario(puedeElegirRango, ini, fin, hoy) {
  const h = String(hoy ?? '').trim()
  if (puedeElegirRango) {
    return { ini: String(ini ?? '').trim(), fin: String(fin ?? '').trim() }
  }
  return { ini: h, fin: h }
}
