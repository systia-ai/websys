/** True si la orden ya salió del taller (entregada al cliente). */
export function estatusEsEntregado(estatus) {
  return /ENTREGAD[OA]\b/i.test(String(estatus ?? '').trim())
}

/** Reparación aún en taller (no entregada). */
export function isReparacionActiva(rep) {
  return !estatusEsEntregado(rep?.estatus)
}

/** Orden marcada manualmente como duplicada accidental. */
export function esOrdenDuplicada(rep) {
  return rep?.es_orden_duplicada === true || rep?.es_orden_duplicada === 1
}

/** Supabase/PostgREST cuando la migración `es_orden_duplicada` aún no está aplicada. */
export function esErrorColumnaEsOrdenDuplicada(error) {
  const msg = String(error?.message ?? error ?? '').toLowerCase()
  const code = String(error?.code ?? '')
  if (code === 'PGRST204' || code === '42703') {
    return msg.includes('es_orden_duplicada') || msg.includes('duplicad')
  }
  return (
    msg.includes('es_orden_duplicada') ||
    (msg.includes('column') && msg.includes('duplicad'))
  )
}

/** Quita el campo opcional antes de INSERT si la columna no existe en la BD. */
export function filaReparacionSinCampoDuplicada(row) {
  if (!row || typeof row !== 'object') return row
  const { es_orden_duplicada: _omit, ...rest } = row
  return rest
}

/**
 * Inserta en `reparaciones`. Si la columna es_orden_duplicada no existe, reintenta sin ese campo.
 */
export async function insertarReparacionSupabase(supabase, row) {
  const first = await supabase.from('reparaciones').insert(row).select('id').single()
  if (!first.error) return first.data
  if (esErrorColumnaEsOrdenDuplicada(first.error)) {
    const sinDup = filaReparacionSinCampoDuplicada(row)
    const retry = await supabase.from('reparaciones').insert(sinDup).select('id').single()
    if (!retry.error) return retry.data
    throw retry.error
  }
  throw first.error
}

const LS_INSERT_LOCK = 'sistefix_rep_insert_lock'
const LS_LAST_CREATED = 'sistefix_rep_last_created'

/** Promesa de inserción en curso (una sola a la vez en toda la app). */
let promesaInsercionOrden = null

/**
 * Ejecuta el guardado de una orden nueva de forma exclusiva.
 * Si el usuario hace doble clic (o React remonta), reutiliza la misma promesa.
 */
export function ejecutarInsercionOrdenUnica(ejecutar) {
  if (promesaInsercionOrden) {
    return promesaInsercionOrden
  }
  promesaInsercionOrden = Promise.resolve()
    .then(() => ejecutar())
    .finally(() => {
      promesaInsercionOrden = null
    })
  return promesaInsercionOrden
}

export function hayInsercionOrdenEnCurso() {
  return promesaInsercionOrden != null
}

/** Bloqueo entre pestañas solo mientras dura el guardado (no minutos después). */
export function iniciarBloqueoInsercionPestana() {
  try {
    const raw = sessionStorage.getItem(LS_INSERT_LOCK)
    if (raw) {
      const { inProgress, ts } = JSON.parse(raw)
      if (inProgress && Date.now() - Number(ts) < 90_000) return false
    }
    sessionStorage.setItem(
      LS_INSERT_LOCK,
      JSON.stringify({ inProgress: true, ts: Date.now() }),
    )
    return true
  } catch {
    return true
  }
}

export function finalizarBloqueoInsercionPestana() {
  try {
    sessionStorage.removeItem(LS_INSERT_LOCK)
  } catch {
    /* ignore */
  }
}

export function registrarOrdenCreadaEnSesion(id) {
  try {
    sessionStorage.setItem(
      LS_LAST_CREATED,
      JSON.stringify({ id: Number(id), ts: Date.now() }),
    )
  } catch {
    /* ignore */
  }
}

/** ID de orden creada hace poco en esta pestaña (evita segundo INSERT tras remount). */
export function leerOrdenRecienCreadaEnSesion(maxEdadMs = 120_000) {
  try {
    const raw = sessionStorage.getItem(LS_LAST_CREATED)
    if (!raw) return null
    const { id, ts } = JSON.parse(raw)
    if (Date.now() - Number(ts) > maxEdadMs) return null
    const n = Number(id)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}
