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
 * Prioridad: columna fecha_entrega → último pago → fecha_liquidada → updated_at de la orden.
 * No usa created_at de la cuenta (coincide con el ingreso al taller).
 */
export function fechaEntregaYmd(rep, cuentaVinculada = null, ymdDesdePagos = null) {
  if (!estatusEsEntregado(rep?.estatus)) return null
  const desdeRep = aYmdLocalDesdeRaw(
    rep?.fecha_entrega ?? rep?.fechaEntrega ?? rep?.fecha_entregada ?? rep?.fecha_entrega_cliente,
  )
  if (desdeRep) return desdeRep
  if (ymdDesdePagos) return ymdDesdePagos
  if (cuentaVinculada) {
    const estCuenta = String(cuentaVinculada.estatus ?? '').trim().toUpperCase()
    const liquidada =
      estCuenta === 'LIQUIDADA' ||
      cuentaVinculada.fecha_liquidada != null ||
      cuentaVinculada.fechaLiquidada != null
    if (liquidada) {
      const desdeLiq = aYmdLocalDesdeRaw(
        cuentaVinculada.fecha_liquidada ?? cuentaVinculada.fechaLiquidada,
      )
      if (desdeLiq) return desdeLiq
    }
  }
  return aYmdLocalDesdeRaw(rep?.updated_at)
}

/** YMD para guardar al marcar entregada: conserva la existente o usa hoy (local). */
export function ymdFechaEntregaParaGuardar(fechaEntregaExistente) {
  return aYmdLocalDesdeRaw(fechaEntregaExistente) || ymdHoyLocal()
}

function ymdEnRango(ymd, desde, hasta) {
  if (!ymd) return false
  const d = String(desde ?? '').trim()
  const h = String(hasta ?? '').trim()
  if (d && ymd < d) return false
  if (h && ymd > h) return false
  return true
}

/** Estatus cuyo rango de fechas en el monitor puede usar también `updated_at` (p. ej. reparadas hoy). */
const ESTATUS_RANGO_USA_ACTUALIZACION = new Set([
  'REPARADO',
  'EN REVISION',
  'EN ESPERA POR REFACCION',
  'SIN REPARACION',
])

/** Máx. días entre ingreso y actualización para contar `updated_at` en el filtro por mes. */
const DIAS_MAX_INGRESO_VS_ACTUALIZACION_MONITOR = 90

function diasEntreYmd(a, b) {
  if (!a || !b || a.length < 10 || b.length < 10) return null
  const [ya, ma, da] = a.slice(0, 10).split('-').map(Number)
  const [yb, mb, db] = b.slice(0, 10).split('-').map(Number)
  const ta = Date.UTC(ya, ma - 1, da)
  const tb = Date.UTC(yb, mb - 1, db)
  return Math.round(Math.abs(tb - ta) / 86400000)
}

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
    if (act && !fechas.includes(act)) {
      const dias = ing ? diasEntreYmd(ing, act) : null
      if (
        !ing ||
        (dias != null && dias <= DIAS_MAX_INGRESO_VS_ACTUALIZACION_MONITOR)
      ) {
        fechas.push(act)
      }
    }
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
 * ¿La orden cumple el filtro del monitor?
 * - `modoFecha` 'ingreso' | 'entrega': usa el rango superior y omite estatus.
 * - Sin `modoFecha`: filtra por estatus y, si hay rango, por ingreso o entrega (ambas).
 */
export function repCoincideFiltroMonitor(
  rep,
  {
    estatusSeleccionados,
    desde,
    hasta,
    modoFecha = null,
    cuentaVinculada = null,
    ymdDesdePagos = null,
    estatusParaFiltroFn = (r) => String(r?.estatus ?? '').trim().toUpperCase(),
  },
) {
  const d = String(desde ?? '').trim()
  const h = String(hasta ?? '').trim()
  const hayRango = Boolean(d || h)

  if (modoFecha === 'ingreso' || modoFecha === 'entrega') {
    if (!hayRango) return false
    return repEnRangoFechasMonitor(rep, d, h, cuentaVinculada, ymdDesdePagos, modoFecha)
  }

  const sel = estatusSeleccionados
  const st = estatusParaFiltroFn(rep)
  if (sel.size === 0 || !sel.has(st)) return false
  if (!hayRango) return true
  return repEnRangoFechasMonitor(rep, d, h, cuentaVinculada, ymdDesdePagos, 'ambas')
}

/** Campos al marcar orden entregada (Ventas / actualización de estatus). */
export function patchReparacionEntregada(estatus = 'ENTREGADA', fechaEntregaExistente = null) {
  const now = new Date().toISOString()
  return {
    estatus,
    updated_at: now,
    fecha_entrega: ymdFechaEntregaParaGuardar(fechaEntregaExistente),
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
    if ('fecha_entrega' in payload && esErrorColumnaDesconocida(error, 'fecha_entrega')) {
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

/** Actualiza reparación a entregada; conserva fecha_entrega ya guardada. */
export async function marcarReparacionEntregadaSupabase(supabase, reparaId) {
  let fechaPrev = null
  if (supabase?.from && reparaId != null) {
    const { data } = await supabase
      .from('reparaciones')
      .select('fecha_entrega')
      .eq('id', reparaId)
      .maybeSingle()
    fechaPrev = data?.fecha_entrega ?? null
  }
  await actualizarReparacionSupabase(supabase, reparaId, patchReparacionEntregada('ENTREGADA', fechaPrev))
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

/** Suma de pagos/anticipos registrados en la cuenta. */
export function sumPagosCuenta(pagosCuenta = []) {
  return (pagosCuenta ?? []).reduce((s, p) => s + Number(p.pago ?? 0), 0)
}

/** Balance neto (cargos − pagos). Negativo = saldo a favor (anticipo sin consumir). */
export function balanceNetoCuenta(cuenta, pagosCuenta = []) {
  const cargos = Number(cuenta?.total ?? 0)
  return cargos - sumPagosCuenta(pagosCuenta)
}

/** Adeudo = total de la venta menos lo pagado (mínimo 0). */
export function saldoPendienteCuenta(totalVenta, pagosCuenta = []) {
  const total = Number(totalVenta ?? 0)
  const pagado = sumPagosCuenta(pagosCuenta)
  return Math.max(0, total - pagado)
}

/** Saldo persistido en BD o calculado desde total y pagos. */
export function saldoDesdeCuenta(cuenta, pagosCuenta = []) {
  if (cuenta?.saldo != null && cuenta.saldo !== '' && !Number.isNaN(Number(cuenta.saldo))) {
    return Math.max(0, Number(cuenta.saldo))
  }
  return saldoPendienteCuenta(cuenta?.total, pagosCuenta)
}

function patchTotalesSaldoCuenta(totalVenta, saldo, extras = {}) {
  return {
    total: Number(totalVenta ?? 0),
    saldo: Math.max(0, Number(saldo ?? 0)),
    ...extras,
  }
}

/**
 * Ajusta PENDIENTE / LIQUIDADA según el adeudo real.
 * - Anticipo sin productos: queda PENDIENTE (no se auto-marca liquidada).
 * - Productos después de anticipo: vuelve a PENDIENTE si aún debe.
 * - Solo LIQUIDADA cuando los pagos cubren el total de cargos (> $0).
 */
export async function sincronizarEstatusCuentaPorSaldo(
  supabase,
  cuenta,
  pagosCuenta = [],
  { totalVenta: totalVentaOpt } = {},
) {
  if (!cuenta?.id) return cuenta

  const pagos = pagosCuenta ?? []
  const pagado = sumPagosCuenta(pagos)
  const totalVenta =
    totalVentaOpt != null ? Number(totalVentaOpt) : Number(cuenta.total ?? 0)
  const adeudo = saldoPendienteCuenta(totalVenta, pagos)
  const est = String(cuenta.estatus ?? '').trim().toUpperCase()

  const patchPendiente = patchTotalesSaldoCuenta(totalVenta, adeudo, {
    estatus: 'PENDIENTE',
    fecha_liquidada: null,
  })

  // Hay adeudo (p. ej. agregaron producto tras anticipo o cuenta mal liquidada).
  if (adeudo > 0.01) {
    const saldoDb = saldoDesdeCuenta(cuenta, pagos)
    if (
      est === 'PENDIENTE' &&
      cuenta.fecha_liquidada == null &&
      Math.abs(Number(cuenta.total ?? 0) - totalVenta) < 0.01 &&
      Math.abs(saldoDb - adeudo) < 0.01
    ) {
      return cuenta
    }
    if (supabase) {
      await actualizarCuentaSupabase(supabase, cuenta.id, patchPendiente)
    }
    return { ...cuenta, ...patchPendiente }
  }

  // Anticipo u otros pagos sin cargos en la cuenta: no cerrar como liquidada.
  if (totalVenta <= 0.0001 && pagado > 0.0001) {
    if (est === 'LIQUIDADA' || cuenta.fecha_liquidada != null) {
      const patchAnticipo = patchTotalesSaldoCuenta(0, 0, {
        estatus: 'PENDIENTE',
        fecha_liquidada: null,
      })
      if (supabase) {
        await actualizarCuentaSupabase(supabase, cuenta.id, patchAnticipo)
      }
      return { ...cuenta, ...patchAnticipo }
    }
    const patchSoloSaldo = patchTotalesSaldoCuenta(0, 0, {
      estatus: cuenta.estatus ?? 'PENDIENTE',
      fecha_liquidada: cuenta.fecha_liquidada ?? null,
    })
    if (supabase && Number(cuenta.saldo ?? -1) !== 0) {
      await actualizarCuentaSupabase(supabase, cuenta.id, patchSoloSaldo)
    }
    return { ...cuenta, ...patchSoloSaldo }
  }

  // Pagos cubren el total de cargos.
  const pagosCubrenTotal = totalVenta > 0.0001 && pagado >= totalVenta - 0.01
  if (!pagosCubrenTotal) return cuenta

  // Cuenta pagada pero aún no entregada al cliente (sigue activa hasta liquidar o entregar orden).
  if (est === 'PAGADA') {
    const patchPagada = patchTotalesSaldoCuenta(totalVenta, 0, {
      estatus: 'PAGADA',
      fecha_liquidada: null,
    })
    if (supabase) {
      await actualizarCuentaSupabase(supabase, cuenta.id, patchPagada)
    }
    return { ...cuenta, ...patchPagada }
  }

  // Ya liquidada: conservar total y saldo $0.
  if (est === 'LIQUIDADA') {
    const nowLiq = new Date().toISOString()
    const patchLiq = patchTotalesSaldoCuenta(totalVenta, 0, {
      estatus: 'LIQUIDADA',
      fecha_liquidada: cuenta.fecha_liquidada ?? nowLiq,
      updated_at: nowLiq,
    })
    const totalDesactualizado = Math.abs(Number(cuenta.total ?? 0) - totalVenta) > 0.01
    const saldoDesactualizado = Math.abs(saldoDesdeCuenta(cuenta, pagos)) > 0.01
    if (!totalDesactualizado && !saldoDesactualizado) {
      return { ...cuenta, ...patchLiq }
    }
    if (supabase) {
      await actualizarCuentaSupabase(supabase, cuenta.id, patchLiq)
    }
    return { ...cuenta, ...patchLiq }
  }

  // PENDIENTE con pagos completos: solo sincroniza saldo; no auto-liquida (el usuario elige en ventas).
  const patchSoloSaldo = patchTotalesSaldoCuenta(totalVenta, 0, {
    estatus: 'PENDIENTE',
    fecha_liquidada: null,
  })
  if (supabase) {
    await actualizarCuentaSupabase(supabase, cuenta.id, patchSoloSaldo)
  }
  return { ...cuenta, ...patchSoloSaldo }
}

/** Cuenta pagada en su total pero aún no liquidada (cliente no ha recogido, etc.). */
export function estatusEsCuentaPagadaActiva(estatus) {
  return String(estatus ?? '').trim().toUpperCase() === 'PAGADA'
}

/** Marca la cuenta como pagada (saldo $0) sin liquidar ni cerrar la orden. */
export async function aplicarCuentaPagadaActiva(
  supabase,
  cuenta,
  pagosCuenta = [],
  { totalVenta: totalVentaOpt } = {},
) {
  if (!cuenta?.id) return cuenta
  const pagos = pagosCuenta ?? []
  const totalVenta =
    totalVentaOpt != null ? Number(totalVentaOpt) : Number(cuenta.total ?? 0)
  const patch = patchTotalesSaldoCuenta(totalVenta, 0, {
    estatus: 'PAGADA',
    fecha_liquidada: null,
    updated_at: new Date().toISOString(),
  })
  if (supabase) {
    await actualizarCuentaSupabase(supabase, cuenta.id, patch)
  }
  return { ...cuenta, ...patch }
}

/** Al marcar la orden ENTREGADA, cierra cuentas que quedaron en PAGADA con saldo $0. */
export async function liquidarCuentaPagadaAlEntregarOrden(supabase, reparaId) {
  if (!supabase || reparaId == null) return null
  const rid = Number(reparaId)
  if (!Number.isFinite(rid) || rid <= 0) return null
  const { data: cuentas, error } = await supabase.from('cuentas').select('*').eq('repara_id', rid)
  if (error) throw error
  const lista = cuentas ?? []
  if (!lista.length) return null
  let cuenta = lista[0]
  for (const c of lista) {
    const tNew = new Date(c.updated_at ?? c.created_at ?? 0).getTime()
    const tPrev = new Date(cuenta.updated_at ?? cuenta.created_at ?? 0).getTime()
    if (tNew >= tPrev) cuenta = c
  }
  if (!estatusEsCuentaPagadaActiva(cuenta.estatus)) return cuenta
  const { data: pagos, error: ePag } = await supabase
    .from('pagosclientes')
    .select('*')
    .eq('cuenta_id', cuenta.id)
  if (ePag) throw ePag
  const totalVenta = Number(cuenta.total ?? 0)
  if (saldoPendienteCuenta(totalVenta, pagos ?? []) > 0.01) return cuenta
  const nowLiq = new Date().toISOString()
  const patch = patchTotalesSaldoCuenta(totalVenta, 0, {
    estatus: 'LIQUIDADA',
    fecha_liquidada: cuenta.fecha_liquidada ?? nowLiq,
    updated_at: nowLiq,
  })
  await actualizarCuentaSupabase(supabase, cuenta.id, patch)
  return { ...cuenta, ...patch }
}

/** @deprecated Alias; usa {@link sincronizarEstatusCuentaPorSaldo}. */
export async function sincronizarCuentaLiquidadaSiSaldoCero(
  supabase,
  cuenta,
  _reparaId = null,
  pagosCuenta = [],
  opts = {},
) {
  return sincronizarEstatusCuentaPorSaldo(supabase, cuenta, pagosCuenta, opts)
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
    if (payload.saldo != null && esErrorColumnaDesconocida(error, 'saldo')) {
      const { saldo: _s, ...rest } = payload
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
