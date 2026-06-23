/** Mensaje cuando RLS bloquea DELETE sin devolver error explícito. */
export const ERROR_SIN_PERMISO_ELIMINAR_BD =
  'No se pudo eliminar: su usuario no tiene permiso en la base de datos. Verifique en Administración que tenga rol ADMIN (o permiso Eliminar).'

/**
 * Ejecuta DELETE en Supabase y exige que se haya borrado al menos una fila.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} tabla
 * @param {(q: import('@supabase/postgrest-js').PostgrestFilterBuilder) => import('@supabase/postgrest-js').PostgrestFilterBuilder} aplicarFiltro
 */
export async function deleteSupabaseVerificado(supabase, tabla, aplicarFiltro) {
  let query = supabase.from(tabla).delete({ count: 'exact' })
  query = aplicarFiltro(query)
  const { error, count } = await query
  if (error) throw error
  if (!count) throw new Error(ERROR_SIN_PERMISO_ELIMINAR_BD)
  return count
}

/**
 * DELETE opcional (p. ej. hijos que pueden estar vacíos); no exige filas borradas.
 */
export async function deleteSupabaseOpcional(supabase, tabla, aplicarFiltro) {
  let query = supabase.from(tabla).delete({ count: 'exact' })
  query = aplicarFiltro(query)
  const { error } = await query
  if (error) throw error
}

function rpcNoExiste(error) {
  const msg = String(error?.message ?? '').toLowerCase()
  return msg.includes('could not find the function') || msg.includes('does not exist')
}

/** Elimina cuenta vía RPC o, si la migración aún no está, en cascada con verificación. */
async function eliminarCuentaSupabaseCascada(supabase, cid) {
  const { data: cuenta, error: eSel } = await supabase.from('cuentas').select('repara_id').eq('id', cid).maybeSingle()
  if (eSel) throw eSel
  if (!cuenta) throw new Error('No se encontró la cuenta.')

  await deleteSupabaseOpcional(supabase, 'pagosclientes', (q) => q.eq('cuenta_id', cid))
  await deleteSupabaseOpcional(supabase, 'cuentamov', (q) => q.eq('cuenta_id', cid))
  const reparaId = cuenta.repara_id != null ? Number(cuenta.repara_id) : null
  if (reparaId != null && Number.isFinite(reparaId)) {
    await deleteSupabaseOpcional(supabase, 'reparamov', (q) => q.eq('repara_id', reparaId))
  }
  await deleteSupabaseVerificado(supabase, 'cuentas', (q) => q.eq('id', cid))
}

/** Elimina orden vía RPC o cascada manual. */
async function eliminarReparacionSupabaseCascada(supabase, rid) {
  const { data: cuentas, error: eCu } = await supabase.from('cuentas').select('id').eq('repara_id', rid)
  if (eCu) throw eCu
  const ids = (cuentas ?? []).map((c) => c.id).filter((id) => id != null)
  if (ids.length > 0) {
    await deleteSupabaseOpcional(supabase, 'pagosclientes', (q) => q.in('cuenta_id', ids))
    await deleteSupabaseOpcional(supabase, 'cuentamov', (q) => q.in('cuenta_id', ids))
    await deleteSupabaseOpcional(supabase, 'cuentas', (q) => q.eq('repara_id', rid))
  }
  await deleteSupabaseOpcional(supabase, 'reparamov', (q) => q.eq('repara_id', rid))
  await deleteSupabaseVerificado(supabase, 'reparaciones', (q) => q.eq('id', rid))
}

export { eliminarCuentaSupabaseCascada, eliminarReparacionSupabaseCascada, rpcNoExiste }
