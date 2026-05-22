import { TIPOS_REPARACION } from './catalogos.js'

/** Claves del catálogo en mayúsculas (SERVICIO, GARANTIA EPSON, GARANTIA SISTEBIT). */
export const TIPOS_SERVICIO_CANONICOS = TIPOS_REPARACION.map((t) => String(t).trim().toUpperCase())

function sinAcentos(s) {
  return String(s)
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/**
 * Normaliza `tipo_reparacion` al catálogo. Devuelve null si no es uno de los tres tipos.
 * Acepta variantes con acentos y textos legacy que contengan EPSON o SISTEBIT.
 */
export function claveCanonicaTipoServicio(raw) {
  const t = String(raw ?? '').trim()
  if (!t) return null
  const norm = sinAcentos(t)
  for (const cat of TIPOS_REPARACION) {
    const c = String(cat).trim().toUpperCase()
    if (norm === sinAcentos(cat)) return c
  }
  if (norm.includes('SISTEBIT')) return 'GARANTIA SISTEBIT'
  if (norm.includes('EPSON')) return 'GARANTIA EPSON'
  if (norm === 'SERVICIO' || (norm.startsWith('SERVICIO') && !norm.includes('GARANT'))) {
    return 'SERVICIO'
  }
  return null
}

/**
 * Tipo de servicio de la orden. Por defecto solo `reparaciones.tipo_reparacion`
 * (no hereda del equipo, para que el filtro del monitor coincida con la orden).
 */
export function tipoServicioDeRep(rep, equipoPorId = null, { usarEquipoSiFalta = false } = {}) {
  let raw = String(rep?.tipo_reparacion ?? '').trim()
  if (!raw && usarEquipoSiFalta && rep?.equipo_id != null && equipoPorId) {
    const eq = equipoPorId.get(String(rep.equipo_id))
    raw = String(eq?.tipo_reparacion ?? '').trim()
  }
  return claveCanonicaTipoServicio(raw)
}

/** True si la orden ya salió del taller (entregada al cliente). */
export function estatusEsEntregado(estatus) {
  return /ENTREGAD[OA]\b/i.test(String(estatus ?? '').trim())
}

/**
 * Date en calendario local. Las cadenas `YYYY-MM-DD` no se parsean como UTC
 * (evita mostrar un día menos en México).
 */
export function fechaALocalDate(raw) {
  if (raw == null || raw === '') return null
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** YYYY-MM-DD en calendario local (nunca UTC de toISOString). */
export function ymdLocalDesdeDate(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Fecha de hoy en México / zona horaria del navegador. */
export function ymdHoyLocal() {
  return ymdLocalDesdeDate(new Date())
}

/** Convierte timestamp o fecha a YYYY-MM-DD en calendario local. */
export function aYmdLocalDesdeRaw(raw) {
  if (raw == null || raw === '') return null
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = fechaALocalDate(raw)
  if (!d) return null
  return ymdLocalDesdeDate(d)
}

/** Fecha legible en español (calendario local). */
export function formatFechaLegibleEsMx(
  raw,
  opts = { day: 'numeric', month: 'long', year: 'numeric' },
) {
  const d = fechaALocalDate(raw)
  if (!d) {
    return new Date().toLocaleDateString('es-MX', opts)
  }
  return d.toLocaleDateString('es-MX', opts)
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

/** Estatus cuyo rango de fechas en el monitor usa también `updated_at` (p. ej. reparadas hoy). */
const ESTATUS_RANGO_USA_ACTUALIZACION = new Set([
  'REPARADO',
  'EN REVISION',
  'EN ESPERA POR REFACCION',
  'SIN REPARACION',
])

function normalizarEstatusOrden(st) {
  const u = String(st ?? '').trim().toUpperCase()
  if (u === 'ENTREGADA') return 'ENTREGADO'
  return u
}

/**
 * Fechas que cuentan para el rango del monitor (ingreso, entrega y/o última actualización).
 */
export function fechasRangoMonitor(rep, cuentaVinculada = null, ymdDesdePagos = null) {
  const ing = fechaIngresoYmd(rep)
  const ent = fechaEntregaYmd(rep, cuentaVinculada, ymdDesdePagos)
  const st = normalizarEstatusOrden(rep?.estatus)
  const fechas = []
  if (ing) fechas.push(ing)
  if (ent) fechas.push(ent)
  if (ESTATUS_RANGO_USA_ACTUALIZACION.has(st)) {
    const act = aYmdLocalDesdeRaw(rep?.updated_at)
    if (act && !fechas.includes(act)) fechas.push(act)
  }
  return fechas
}

/**
 * Rango Desde/Hasta del monitor.
 * @param {'todas'|'ingreso'|'entrega'|'ambas'} modo
 */
export function repEnRangoFechasMonitor(
  rep,
  desde,
  hasta,
  cuentaVinculada = null,
  ymdDesdePagos = null,
  modo = 'ingreso',
) {
  if (modo === 'todas') return true
  const d = String(desde ?? '').trim()
  const h = String(hasta ?? '').trim()
  if (!d && !h) return true
  const ing = fechaIngresoYmd(rep)
  const ent = fechaEntregaYmd(rep, cuentaVinculada, ymdDesdePagos)
  if (modo === 'ingreso') return ymdEnRango(ing, d, h)
  if (modo === 'entrega') return ymdEnRango(ent, d, h)
  const fechas = fechasRangoMonitor(rep, cuentaVinculada, ymdDesdePagos)
  if (fechas.length === 0) return false
  return fechas.some((ymd) => ymdEnRango(ymd, d, h))
}

/**
 * ¿La orden cumple el filtro del monitor? (estatus operativo y/o fechas de ingreso o entrega).
 */
export function repCoincideFiltroMonitor(
  rep,
  {
    estatusSeleccionados,
    desde,
    hasta,
    cuentaVinculada = null,
    ymdDesdePagos = null,
    estatusParaFiltroFn = (r) => String(r?.estatus ?? '').trim().toUpperCase(),
  },
) {
  const sel = estatusSeleccionados
  const st = estatusParaFiltroFn(rep)
  const matchOp = sel.size > 0 && sel.has(st)

  const d = String(desde ?? '').trim()
  const h = String(hasta ?? '').trim()
  const hayRango = Boolean(d || h)

  if (!hayRango) return matchOp

  return (
    matchOp &&
    repEnRangoFechasMonitor(rep, d, h, cuentaVinculada, ymdDesdePagos, 'ambas')
  )
}

/** Campos al marcar orden entregada (Ventas / actualización de estatus). */
export function patchReparacionEntregada(estatus = 'ENTREGADA') {
  const now = new Date().toISOString()
  return {
    estatus,
    updated_at: now,
    fecha_entrega: ymdHoyLocal(),
  }
}

function esErrorColumnaDesconocida(error, nombreColumna) {
  const msg = String(error?.message ?? error ?? '').toLowerCase()
  const code = String(error?.code ?? '')
  const col = String(nombreColumna ?? '').toLowerCase()
  if (!col) return msg.includes('column') || code === 'PGRST204' || code === '42703'
  return (
    msg.includes(col) ||
    (msg.includes('column') && msg.includes(col.replace(/_/g, ''))) ||
    code === 'PGRST204' ||
    code === '42703'
  )
}

/** UPDATE en reparaciones; reintenta sin columnas opcionales si la BD aún no las tiene. */
export async function actualizarReparacionSupabase(supabase, reparaId, patch) {
  let payload = { ...patch }
  for (let intento = 0; intento < 6; intento += 1) {
    const { error } = await supabase.from('reparaciones').update(payload).eq('id', reparaId)
    if (!error) return
    const msg = String(error.message ?? '').toLowerCase()
    if (msg.includes('permission') || msg.includes('row-level security') || msg.includes('rls')) {
      throw new Error(
        'No tiene permiso para actualizar esta orden en la base de datos. Revise la sesión de Supabase o las políticas RLS del proyecto.',
      )
    }
    if (
      'fecha_entrega' in payload &&
      (payload.fecha_entrega == null || esErrorColumnaDesconocida(error, 'fecha_entrega'))
    ) {
      const { fecha_entrega: _f, ...rest } = payload
      if (Object.keys(rest).length > 0) {
        payload = rest
        continue
      }
    }
    if (payload.es_orden_duplicada != null && esErrorColumnaDesconocida(error, 'es_orden_duplicada')) {
      const { es_orden_duplicada: _d, ...rest } = payload
      payload = rest
      continue
    }
    throw error
  }
  throw new Error('No se pudo actualizar la orden tras varios intentos.')
}

/** Actualiza reparación a entregada; omite fecha_entrega si la columna no existe en BD. */
export async function marcarReparacionEntregadaSupabase(supabase, reparaId) {
  await actualizarReparacionSupabase(supabase, reparaId, patchReparacionEntregada())
}

/**
 * Reparación marcada ENTREGADA/ENTREGADO por error (cuenta aún PENDIENTE y sin pagos).
 * Corrige en BD a INGRESADO y quita fecha_entrega.
 */
export async function corregirEntregadaIndebidaSiAplica(supabase, repRow) {
  if (!supabase?.from || !repRow?.id || !estatusEsEntregado(repRow.estatus)) {
    return repRow
  }

  const { data: cuentas, error: eC } = await supabase
    .from('cuentas')
    .select('id, estatus, total')
    .eq('repara_id', repRow.id)
    .limit(3)
  if (eC) return repRow

  const cuenta = cuentas?.[0]
  if (!cuenta?.id) return repRow

  const estCuenta = String(cuenta.estatus ?? '').trim().toUpperCase()
  if (estCuenta === 'LIQUIDADA') return repRow

  const { data: pagos, error: eP } = await supabase
    .from('pagosclientes')
    .select('id')
    .eq('cuenta_id', cuenta.id)
    .limit(1)
  if (eP) return repRow
  if ((pagos ?? []).length > 0) return repRow

  const now = new Date().toISOString()
  const patch = { estatus: 'INGRESADO', fecha_entrega: null, updated_at: now }
  await actualizarReparacionSupabase(supabase, repRow.id, patch)
  return { ...repRow, ...patch }
}

/**
 * Si hay pagos que cubren el adeudo (o total $0 con pagos registrados), marca la cuenta LIQUIDADA.
 * No toca el estatus de la orden de taller (INGRESADO/REPARADO ≠ entrega al cliente).
 * Una cuenta nueva con total $0 y sin pagos se deja PENDIENTE.
 */
export async function sincronizarCuentaLiquidadaSiSaldoCero(
  supabase,
  cuenta,
  _reparaId = null,
  pagosCuenta = [],
) {
  if (!cuenta?.id) return cuenta
  const est = String(cuenta.estatus ?? '').trim().toUpperCase()
  if (est === 'LIQUIDADA') return cuenta

  const pagos = pagosCuenta ?? []
  if (pagos.length === 0) return cuenta

  const totalCuenta = Number(cuenta.total ?? 0)
  const sumPagos = pagos.reduce((s, p) => s + Number(p.pago ?? 0), 0)
  const pagosCubren = totalCuenta > 0.0001 && sumPagos >= totalCuenta - 0.01
  const saldoCeroConPagos = Math.abs(totalCuenta) <= 0.0001 && sumPagos > 0.0001
  if (!pagosCubren && !saldoCeroConPagos) return cuenta

  const nowLiq = new Date().toISOString()
  const patch = { total: 0, estatus: 'LIQUIDADA', fecha_liquidada: nowLiq, updated_at: nowLiq }

  if (supabase) {
    await actualizarCuentaSupabase(supabase, cuenta.id, patch)
  }

  return { ...cuenta, ...patch }
}

/** UPDATE en cuentas; reintenta sin columnas opcionales (fecha_liquidada, updated_at). */
export async function actualizarCuentaSupabase(supabase, cuentaId, patch) {
  let payload = { ...patch }
  for (let intento = 0; intento < 6; intento += 1) {
    const { error } = await supabase.from('cuentas').update(payload).eq('id', cuentaId)
    if (!error) return
    const msg = String(error.message ?? '').toLowerCase()
    if (msg.includes('permission') || msg.includes('row-level security') || msg.includes('rls')) {
      throw new Error(
        'No tiene permiso para actualizar esta cuenta. Revise la sesión de Supabase o las políticas RLS.',
      )
    }
    if (payload.fecha_liquidada != null && esErrorColumnaDesconocida(error, 'fecha_liquidada')) {
      const { fecha_liquidada: _f, ...rest } = payload
      payload = rest
      continue
    }
    if (payload.updated_at != null && esErrorColumnaDesconocida(error, 'updated_at')) {
      const { updated_at: _u, ...rest } = payload
      payload = rest
      continue
    }
    throw error
  }
  throw new Error('No se pudo actualizar la cuenta tras varios intentos.')
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
