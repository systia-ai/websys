/** Mensaje estándar cuando un técnico intenta eliminar datos. */
export const MENSAJE_SIN_PERMISO_ELIMINAR =
  'Su usuario no tiene permisos para realizar esas acciones.'

/** Normaliza rol de `user_roles` (sin fila → técnico). */
export function rolDesdeFilaUserRoles(data) {
  if (!data?.rol) return 'TECNICO'
  return String(data.rol).trim().toUpperCase() === 'ADMIN' ? 'ADMIN' : 'TECNICO'
}

export function esRolAdmin(rol) {
  return String(rol ?? '').trim().toUpperCase() === 'ADMIN'
}

/** Técnicos solo consultan el día en curso; admins conservan el rango elegido. */
export function rangoFechasPermitidoUsuario(esAdmin, ini, fin, hoy) {
  const h = String(hoy ?? '').trim()
  if (esAdmin) {
    return { ini: String(ini ?? '').trim(), fin: String(fin ?? '').trim() }
  }
  return { ini: h, fin: h }
}
