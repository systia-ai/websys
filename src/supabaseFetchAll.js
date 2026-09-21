/** PostgREST recorta cada petición a este máximo; hay que paginar para tablas más grandes. */
export const SUPABASE_PAGE_SIZE = 1000

/**
 * Ejecuta una consulta de Supabase en páginas hasta traer todas las filas.
 * `buildQuery` debe devolver una consulta nueva en cada llamada (el builder no se reutiliza).
 * Use `.order(...)` dentro de `buildQuery` para que el `range` no se solape ni omita filas.
 */
export async function fetchAllRows(buildQuery, pageSize = SUPABASE_PAGE_SIZE) {
  if (typeof buildQuery !== 'function') {
    throw new Error('fetchAllRows espera una función que construya la consulta.')
  }
  const size = Math.max(1, Number(pageSize) || SUPABASE_PAGE_SIZE)
  const all = []
  let from = 0
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + size - 1)
    if (error) throw error
    const chunk = data ?? []
    all.push(...chunk)
    if (chunk.length < size) break
    from += size
  }
  return all
}
