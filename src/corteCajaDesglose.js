import { sameId } from './clienteUtils.js'
import { LS_PAGOS_CLIENTES } from './pagosClientesUtils.js'

const LS_CUENTAS = 'sistefix_local_cuentas'
const LS_CUENTAMOV = 'sistefix_local_cuentamov'
const LS_REPARAMOV = 'sistefix_local_reparamov'
const LS_REP = 'sistefix_local_reparaciones'

function readLs(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback))
  } catch {
    return fallback
  }
}

function limpiarPrefijoDescripcion(texto) {
  return String(texto ?? '')
    .trim()
    .replace(/^\[(VENTA|REPARACIÓN|REPARACION|CUENTA)\]\s*/i, '')
    .trim() || 'Concepto'
}

function lineaCargo(descripcion, cantidad, costoUnitario) {
  const cant = Number(cantidad ?? 1)
  const unit = Number(costoUnitario ?? 0)
  const monto = cant * unit
  if (monto <= 0.0001) return null
  return {
    descripcion: limpiarPrefijoDescripcion(descripcion),
    cantidad: cant,
    precioUnitario: unit,
    monto,
  }
}

function cargosDesdeMovs(movs = []) {
  return movs
    .map((m) => lineaCargo(m.descripcion, m.cantidad, m.costo))
    .filter(Boolean)
}

function cargosDesdeReps(reps = []) {
  return reps
    .map((r) => lineaCargo(r.descripcion, r.cantidad, r.costo))
    .filter(Boolean)
}

function inyectarCostoReparacion(cargos, rep) {
  if (!rep) return cargos
  const costo = Number(rep.costo_reparacion ?? 0)
  if (costo <= 0.0001) return cargos
  const sumRep = cargos.reduce((s, c) => s + c.monto, 0)
  if (sumRep >= costo - 0.01) return cargos
  const faltante = Math.max(0, costo - sumRep)
  return [
    ...cargos,
    {
      descripcion: limpiarPrefijoDescripcion(
        rep.descripcion_equipo ?? 'Costo de reparación',
      ),
      cantidad: 1,
      precioUnitario: faltante,
      monto: faltante,
    },
  ]
}

function inyectarSaldoCuenta(cargos, cuentaRow) {
  if (!cuentaRow?.id) return cargos
  const ct = Number(cuentaRow.total ?? 0)
  if (ct <= 0.0001 || cargos.length > 0) return cargos
  return [
    {
      descripcion: 'Saldo de cuenta',
      cantidad: 1,
      precioUnitario: ct,
      monto: ct,
    },
  ]
}

function construirCargosCuenta(cuentaRow, movs, reps, repOrden) {
  let cargos = [...cargosDesdeMovs(movs), ...cargosDesdeReps(reps)]
  cargos = inyectarCostoReparacion(cargos, repOrden)
  cargos = inyectarSaldoCuenta(cargos, cuentaRow)
  return cargos
}

function etiquetaAbonoPago(pago) {
  const concepto = String(pago?.concepto ?? 'Pago').trim()
  if (/anticipo/i.test(concepto)) return 'Anticipo'
  return concepto || 'Abono'
}

function lineaAbonoDesglose(pago) {
  const monto = Number(pago?.pago ?? 0)
  if (monto <= 0.0001) return null
  return {
    descripcion: etiquetaAbonoPago(pago),
    cantidad: 1,
    precioUnitario: monto,
    monto,
    esAbono: true,
  }
}

function construirDesgloseCuenta(cuentaRow, movs, reps, repOrden, pagosCuenta = []) {
  return {
    cargos: construirCargosCuenta(cuentaRow, movs, reps, repOrden),
    pagos: [...(pagosCuenta ?? [])].sort(
      (a, b) => Number(a.id ?? 0) - Number(b.id ?? 0),
    ),
  }
}

/** Texto de una línea de cargo o abono para UI / PDF. */
export function formatearLineaDesglose(linea) {
  if (linea.esAbono) {
    return `${linea.descripcion}: $${Number(linea.monto ?? 0).toFixed(2)}`
  }
  const cant = Number(linea.cantidad ?? 1)
  const qty =
    cant > 1 && Math.abs(cant - Math.round(cant)) < 0.001
      ? ` ×${Math.round(cant)}`
      : cant > 1
        ? ` ×${cant}`
        : ''
  return `${linea.descripcion}${qty}: $${Number(linea.monto ?? 0).toFixed(2)}`
}

/**
 * Mapa cuenta_id (string) → { cargos, pagos }.
 */
export async function cargarDesglosePorCuentas(supabase, cuentaIds) {
  const ids = [...new Set((cuentaIds ?? []).filter((id) => id != null && id !== '').map(String))]
  const out = new Map()
  if (!ids.length) return out

  if (!supabase?.from) {
    const cuentas = readLs(LS_CUENTAS, [])
    const movsAll = readLs(LS_CUENTAMOV, [])
    const repsAll = readLs(LS_REPARAMOV, [])
    const repsOrden = readLs(LS_REP, [])
    const pagosAll = readLs(LS_PAGOS_CLIENTES, [])
    for (const cid of ids) {
      const cuenta = cuentas.find((c) => sameId(c.id, cid))
      const movs = movsAll.filter((m) => sameId(m.cuenta_id, cid))
      const pagosCuenta = pagosAll.filter((p) => sameId(p.cuenta_id, cid))
      const rid = cuenta?.repara_id
      const reps = rid != null ? repsAll.filter((r) => sameId(r.repara_id, rid)) : []
      const repOrden = rid != null ? repsOrden.find((r) => sameId(r.id, rid)) : null
      out.set(cid, construirDesgloseCuenta(cuenta, movs, reps, repOrden, pagosCuenta))
    }
    return out
  }

  const numericIds = ids.map(Number).filter((n) => Number.isFinite(n))
  if (!numericIds.length) return out

  const [cuentasRes, movsRes, pagosRes] = await Promise.all([
    supabase.from('cuentas').select('id, repara_id, total').in('id', numericIds),
    supabase
      .from('cuentamov')
      .select('id, cuenta_id, descripcion, cantidad, costo, producto_id')
      .in('cuenta_id', numericIds),
    supabase
      .from('pagosclientes')
      .select('id, cuenta_id, pago, concepto, created_at')
      .in('cuenta_id', numericIds)
      .order('id', { ascending: true }),
  ])
  if (cuentasRes.error) throw cuentasRes.error
  if (movsRes.error) throw movsRes.error
  if (pagosRes.error) throw pagosRes.error

  const cuentas = cuentasRes.data ?? []
  const movs = movsRes.data ?? []
  const pagosAll = pagosRes.data ?? []

  const reparaIds = [
    ...new Set(cuentas.map((c) => c.repara_id).filter((id) => id != null && id !== '')),
  ]

  let repsAll = []
  let repsOrden = []
  if (reparaIds.length) {
    const [rRepMov, rRep] = await Promise.all([
      supabase
        .from('reparamov')
        .select('id, repara_id, descripcion, cantidad, costo, producto_id')
        .in('repara_id', reparaIds),
      supabase
        .from('reparaciones')
        .select('id, costo_reparacion, descripcion_equipo')
        .in('id', reparaIds),
    ])
    if (rRepMov.error) throw rRepMov.error
    if (rRep.error) throw rRep.error
    repsAll = rRepMov.data ?? []
    repsOrden = rRep.data ?? []
  }

  for (const cid of ids) {
    const cuenta = cuentas.find((c) => sameId(c.id, cid))
    const movsCuenta = movs.filter((m) => sameId(m.cuenta_id, cid))
    const pagosCuenta = pagosAll.filter((p) => sameId(p.cuenta_id, cid))
    const rid = cuenta?.repara_id
    const reps = rid != null ? repsAll.filter((r) => sameId(r.repara_id, rid)) : []
    const repOrden = rid != null ? repsOrden.find((r) => sameId(r.id, rid)) : null
    out.set(cid, construirDesgloseCuenta(cuenta, movsCuenta, reps, repOrden, pagosCuenta))
  }

  return out
}

export function desgloseParaPago(pago, desglosePorCuenta) {
  const cid = pago?.cuenta_id
  if (cid == null || cid === '') return []
  const bloque = desglosePorCuenta.get(String(cid))
  if (!bloque) return []

  const lineas = [...(bloque.cargos ?? [])]
  for (const pg of bloque.pagos ?? []) {
    if (pago?.id != null && sameId(pg.id, pago.id)) continue
    const abono = lineaAbonoDesglose(pg)
    if (abono) lineas.push(abono)
  }
  return lineas
}
