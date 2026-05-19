/** True si la orden ya salió del taller (entregada al cliente). */
export function estatusEsEntregado(estatus) {
  return /ENTREGAD[OA]\b/i.test(String(estatus ?? '').trim())
}

/** Convierte timestamp o fecha a YYYY-MM-DD en calendario local. */
export function aYmdLocalDesdeRaw(raw) {
  if (raw == null || raw === '') return null
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Fecha de ingreso al taller. */
export function fechaIngresoYmd(rep) {
  const raw =
    rep?.fecha_ingreso ??
    rep?.fechaIngreso ??
    rep?.fecha_registro ??
    rep?.fecha_creacion ??
    rep?.created_at ??
    rep?.fecha
  return aYmdLocalDesdeRaw(raw)
}

/**
 * Fecha de entrega (órdenes ENTREGADO/A).
 * Usa cuenta liquidada si se pasa (repara_id → cuenta).
 */
export function fechaEntregaYmd(rep, cuentaVinculada = null, ymdDesdePagos = null) {
  if (!estatusEsEntregado(rep?.estatus)) return null
  const desdeRep = aYmdLocalDesdeRaw(
    rep?.fecha_entrega ?? rep?.fechaEntrega ?? rep?.fecha_entregada ?? rep?.fecha_entrega_cliente,
  )
  if (desdeRep) return desdeRep
  if (ymdDesdePagos) return ymdDesdePagos
  if (cuentaVinculada) {
    const desdeCuenta = aYmdLocalDesdeRaw(
      cuentaVinculada.fecha_liquidada ??
        cuentaVinculada.fechaLiquidada ??
        cuentaVinculada.updated_at ??
        cuentaVinculada.created_at,
    )
    if (desdeCuenta) return desdeCuenta
  }
  return aYmdLocalDesdeRaw(rep?.updated_at)
}

function ymdEnRango(ymd, desde, hasta) {
  if (!ymd) return false
  const d = String(desde ?? '').trim()
  const h = String(hasta ?? '').trim()
  if (d && ymd < d) return false
  if (h && ymd > h) return false
  return true
}

/**
 * Rango Desde/Hasta del monitor.
 * @param {'ingreso'|'entrega'|'ambas'} modo — ingreso: solo fecha de ingreso; entrega: solo entrega; ambas: cualquiera.
 */
export function repEnRangoFechasMonitor(
  rep,
  desde,
  hasta,
  cuentaVinculada = null,
  ymdDesdePagos = null,
  modo = 'ingreso',
) {
  const d = String(desde ?? '').trim()
  const h = String(hasta ?? '').trim()
  if (!d && !h) return true
  const ing = fechaIngresoYmd(rep)
  const ent = fechaEntregaYmd(rep, cuentaVinculada, ymdDesdePagos)
  if (modo === 'ingreso') return ymdEnRango(ing, d, h)
  if (modo === 'entrega') return ymdEnRango(ent, d, h)
  const fechas = [ing, ent].filter(Boolean)
  if (fechas.length === 0) return false
  return fechas.some((ymd) => ymdEnRango(ymd, d, h))
}

/** Campos al marcar orden entregada (Ventas / actualización de estatus). */
export function patchReparacionEntregada(estatus = 'ENTREGADA') {
  const now = new Date().toISOString()
  return {
    estatus,
    updated_at: now,
    fecha_entrega: now.slice(0, 10),
  }
}

/** Actualiza reparación a entregada; omite fecha_entrega si la columna no existe en BD. */
export async function marcarReparacionEntregadaSupabase(supabase, reparaId) {
  const patch = patchReparacionEntregada()
  const first = await supabase.from('reparaciones').update(patch).eq('id', reparaId)
  if (!first.error) return
  const msg = String(first.error.message ?? '').toLowerCase()
  if (msg.includes('fecha_entrega') || msg.includes('column')) {
    const { fecha_entrega: _f, ...rest } = patch
    const retry = await supabase.from('reparaciones').update(rest).eq('id', reparaId)
    if (!retry.error) return
    throw retry.error
  }
  throw first.error
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
