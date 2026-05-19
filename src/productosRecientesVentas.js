const LS_RECIENTES = 'sistefix_productos_recientes_ventas'
const MAX_RECIENTES = 300

export function leerRecientesProductosVentas() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_RECIENTES) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.map((x) => String(x)).filter(Boolean)
  } catch {
    return []
  }
}

export function registrarProductoRecienteVentas(productoId) {
  const id = String(productoId ?? '').trim()
  if (!id || id === '0') return leerRecientesProductosVentas()
  const prev = leerRecientesProductosVentas().filter((x) => x !== id)
  const next = [id, ...prev].slice(0, MAX_RECIENTES)
  try {
    localStorage.setItem(LS_RECIENTES, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}

/** Combina recientes locales (prioridad) con ids vistos en cuentamov. */
export function mergeRecientesProductos(localIds, desdeMovimientos) {
  const out = []
  const seen = new Set()
  for (const id of [...(localIds ?? []), ...(desdeMovimientos ?? [])]) {
    const s = String(id ?? '').trim()
    if (!s || s === '0' || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

/** Más reciente primero; sin historial → id de producto descendente. */
export function ordenarProductosMasRecientes(productos, recientesIds) {
  const rank = new Map((recientesIds ?? []).map((id, i) => [String(id), i]))
  return [...(productos ?? [])].sort((a, b) => {
    const ia = rank.get(String(a.id))
    const ib = rank.get(String(b.id))
    if (ia != null && ib != null) return ia - ib
    if (ia != null) return -1
    if (ib != null) return 1
    return Number(b.id ?? 0) - Number(a.id ?? 0)
  })
}

/**
 * Productos usados en ventas (cuentamov), del movimiento más reciente al más antiguo.
 * @param {import('@supabase/supabase-js').SupabaseClient|null} supabase
 * @param {() => unknown[]} readCuentamovLocal
 */
export async function recientesProductosDesdeCuentamov(supabase, readCuentamovLocal) {
  let movs = []
  if (supabase) {
    const { data, error } = await supabase
      .from('cuentamov')
      .select('producto_id, id, created_at')
      .order('id', { ascending: false })
      .limit(400)
    if (error) throw error
    movs = data ?? []
  } else {
    movs = [...(readCuentamovLocal?.() ?? [])].sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0))
  }
  const ids = []
  const seen = new Set()
  for (const m of movs) {
    const pid = m?.producto_id
    if (pid == null || pid === '' || pid === 0) continue
    const s = String(pid)
    if (seen.has(s)) continue
    seen.add(s)
    ids.push(s)
  }
  return ids
}
