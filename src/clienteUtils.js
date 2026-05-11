/** Compara IDs de cliente/equipo (Supabase puede devolver número; localStorage a veces string). */
export function sameId(a, b) {
  if (a == null || b == null) return false
  return String(a) === String(b)
}

/**
 * Unifica campos de una fila cliente (Postgres/Supabase o variaciones de nombre de columna).
 */
export function normalizeClienteRow(row) {
  if (!row || typeof row !== 'object') {
    return { id: null, nombre: '', telefono: '', domicilio: '', correo: '' }
  }
  const id = row.id ?? row.ID ?? null
  const nombre = row.nombre ?? row.Nombre ?? row.NOMBRE ?? ''
  const telefono = row.telefono ?? row.Telefono ?? row.TELEFONO ?? row.tel ?? ''
  const domicilio = row.domicilio ?? row.Domicilio ?? row.DOMICILIO ?? ''
  const correo = row.correo ?? row.Correo ?? row.CORREO ?? row.email ?? ''
  return {
    id,
    nombre: nombre != null ? String(nombre) : '',
    telefono: telefono != null ? String(telefono) : '',
    domicilio: domicilio != null ? String(domicilio) : '',
    correo: correo != null ? String(correo) : '',
  }
}
