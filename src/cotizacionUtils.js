import { sameId } from './clienteUtils.js'
import {
  formatMontoCuenta,
  sincronizarEstatusCuentaPorSaldo,
  totalCargosDesdeLineasCuenta,
} from './reparacionUtils.js'
import { registrarVentaEnCuenta } from './inventarioStock.js'

export const LS_COTIZACIONES = 'sistefix_local_cotizaciones'
export const LS_COTIZACIONMOV = 'sistefix_local_cotizacionmov'
const LS_CUENTAS = 'sistefix_local_cuentas'
const LS_CUENTAMOV = 'sistefix_local_cuentamov'
const LS_PAGOS = 'sistefix_local_pagosclientes'
const LS_REPARAMOV = 'sistefix_local_reparamov'

export const ESTATUS_COTIZACION = ['BORRADOR', 'FINALIZADA', 'ACEPTADA', 'CONVERTIDA']

function readLs(key, fb) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fb))
  } catch {
    return fb
  }
}

function writeLs(key, v) {
  localStorage.setItem(key, JSON.stringify(v))
}

export function nextLocalCotizacionId(list) {
  const max = list.reduce((m, r) => {
    const id = Number(r.id)
    return Number.isFinite(id) && id > m ? id : m
  }, 0)
  return max + 1
}

export function nextLocalCotizacionMovId(list) {
  return nextLocalCotizacionId(list)
}

export function totalCotizacionDesdeLineas(lineas = []) {
  return lineas.reduce((s, l) => {
    const cant = Number(l.cantidad ?? 0)
    const precio = Number(l.precioUnitario ?? l.costo ?? 0)
    if (Number.isFinite(l.subtotal)) return s + Number(l.subtotal)
    return s + cant * precio
  }, 0)
}

export function lineaCotizacionDesdeMov(m) {
  const cant = Number(m.cantidad ?? 0)
  const costo = Number(m.costo ?? 0)
  const desc = String(m.descripcion ?? '').trim() || '—'
  return {
    key: `cotizacionmov_${m.id}`,
    tipo: 'cotizacionmov',
    dbId: m.id,
    producto_id: m.producto_id,
    cantidad: cant,
    descripcion: desc.startsWith('[COTIZACIÓN]') ? desc : `[COTIZACIÓN] ${desc}`,
    precioUnitario: costo,
    subtotal: cant * costo,
  }
}

export function lineasCotizacionParaReciboPdf(lineas = []) {
  return lineas.map((l) => {
    const raw = String(l.descripcion ?? '').trim() || 'Sin descripción'
    const body = raw.replace(/^\[(COTIZACIÓN|VENTA)\]\s*/i, '').trim()
    return {
      tipo: 'cuentamov',
      cantidad: l.cantidad,
      descripcion: body ? `[COTIZACIÓN] ${body}` : '[COTIZACIÓN] Sin descripción',
      precioUnitario: l.precioUnitario,
      subtotal: l.subtotal,
    }
  })
}

export function etiquetaEstatusCotizacion(est) {
  const st = String(est ?? '').trim().toUpperCase()
  if (st === 'BORRADOR') return 'Borrador'
  if (st === 'FINALIZADA') return 'Finalizada'
  if (st === 'ACEPTADA') return 'Aceptada'
  if (st === 'CONVERTIDA') return 'Convertida a cuenta'
  return st || '—'
}

export function cotizacionEditable(est) {
  return String(est ?? '').trim().toUpperCase() === 'BORRADOR'
}

/** Número visible de la cotización (por cliente); si falta en datos viejos, usa el id interno. */
export function numeroCotizacionVisible(cot) {
  if (!cot) return null
  const n = Number(cot.numero)
  if (Number.isFinite(n) && n > 0) return Math.floor(n)
  const id = Number(cot.id)
  return Number.isFinite(id) && id > 0 ? Math.floor(id) : null
}

async function obtenerNumerosCotizacionCliente(supabase, clienteId) {
  if (supabase) {
    const { data, error } = await supabase.from('cotizaciones').select('numero').eq('cliente_id', clienteId)
    if (error) throw error
    return (data ?? []).map((r) => Number(r.numero)).filter((n) => Number.isFinite(n) && n > 0)
  }
  return readLs(LS_COTIZACIONES, [])
    .filter((c) => sameId(c.cliente_id, clienteId))
    .map((c) => {
      const n = Number(c.numero)
      if (Number.isFinite(n) && n > 0) return n
      const id = Number(c.id)
      return Number.isFinite(id) && id > 0 ? id : null
    })
    .filter((n) => n != null && n > 0)
}

/** Menor entero positivo libre para el cliente (reutiliza huecos tras eliminar). */
export function menorNumeroCotizacionDisponible(numerosUsados = []) {
  const set = new Set(numerosUsados.map((n) => Math.floor(Number(n))).filter((n) => n > 0))
  let n = 1
  while (set.has(n)) n += 1
  return n
}

export async function siguienteNumeroCotizacionCliente(supabase, clienteId) {
  const usados = await obtenerNumerosCotizacionCliente(supabase, clienteId)
  return menorNumeroCotizacionDisponible(usados)
}

/** Cotizaciones del cliente, más recientes primero. */
export async function listarCotizacionesPorCliente(supabase, clienteId) {
  if (supabase) {
    const { data, error } = await supabase
      .from('cotizaciones')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('numero', { ascending: false })
    if (error) throw error
    return data ?? []
  }
  const lista = readLs(LS_COTIZACIONES, []).filter((c) => sameId(c.cliente_id, clienteId))
  lista.sort((a, b) => (Number(b.numero ?? b.id) || 0) - (Number(a.numero ?? a.id) || 0))
  return lista
}

export function cotizacionResumenParaPantalla(cot) {
  if (!cot?.id) return undefined
  return {
    id: cot.id,
    numero: cot.numero ?? numeroCotizacionVisible(cot),
    total: cot.total,
    estatus: cot.estatus,
    notas: cot.notas ?? null,
  }
}

export async function crearCotizacionVacia(supabase, clienteId) {
  const numero = await siguienteNumeroCotizacionCliente(supabase, clienteId)
  const row = {
    cliente_id: clienteId,
    numero,
    total: 0,
    estatus: 'BORRADOR',
  }
  if (supabase) {
    const { data, error } = await supabase.from('cotizaciones').insert(row).select('*').single()
    if (error) throw error
    return data
  }
  const list = readLs(LS_COTIZACIONES, [])
  const nuevo = { id: nextLocalCotizacionId(list), ...row, created_at: new Date().toISOString() }
  writeLs(LS_COTIZACIONES, [nuevo, ...list])
  return nuevo
}

async function persistirTotalCotizacion(supabase, cotizacionId, lineas) {
  const total = totalCotizacionDesdeLineas(lineas)
  const payload = { total, updated_at: new Date().toISOString() }
  if (supabase) {
    const { error } = await supabase.from('cotizaciones').update(payload).eq('id', cotizacionId)
    if (error) throw error
    return total
  }
  const list = readLs(LS_COTIZACIONES, [])
  writeLs(
    LS_COTIZACIONES,
    list.map((c) => (sameId(c.id, cotizacionId) ? { ...c, total, updated_at: payload.updated_at } : c)),
  )
  return total
}

export async function insertarLineaCotizacion({
  supabase,
  cotizacionId,
  productoId,
  descripcion,
  cantidad,
  precio,
  nextLocalId,
}) {
  const desc = String(descripcion ?? '').trim()
  const row = {
    cotizacion_id: cotizacionId,
    producto_id: productoId ?? null,
    cantidad,
    descripcion: desc.startsWith('[COTIZACIÓN]') ? desc : `[COTIZACIÓN] ${desc}`,
    costo: precio,
  }
  let movId
  if (supabase) {
    const { data, error } = await supabase.from('cotizacionmov').insert(row).select('id').single()
    if (error) throw error
    movId = data.id
    const { data: movs } = await supabase.from('cotizacionmov').select('*').eq('cotizacion_id', cotizacionId)
    await persistirTotalCotizacion(supabase, cotizacionId, (movs ?? []).map(lineaCotizacionDesdeMov))
  } else {
    const list = readLs(LS_COTIZACIONMOV, [])
    movId = nextLocalId ? nextLocalId() : nextLocalCotizacionMovId(list)
    writeLs(LS_COTIZACIONMOV, [{ id: movId, ...row }, ...list])
    const movs = readLs(LS_COTIZACIONMOV, []).filter((m) => sameId(m.cotizacion_id, cotizacionId))
    await persistirTotalCotizacion(supabase, cotizacionId, movs.map(lineaCotizacionDesdeMov))
  }
  return { movId, linea: lineaCotizacionDesdeMov({ id: movId, ...row }) }
}

export async function eliminarLineaCotizacion(supabase, linea, cotizacionId, lineasRestantes) {
  if (linea?.dbId == null) return persistirTotalCotizacion(supabase, cotizacionId, lineasRestantes)
  if (supabase) {
    const { error } = await supabase.from('cotizacionmov').delete().eq('id', linea.dbId)
    if (error) throw error
  } else {
    writeLs(
      LS_COTIZACIONMOV,
      readLs(LS_COTIZACIONMOV, []).filter((x) => !sameId(x.id, linea.dbId)),
    )
  }
  return persistirTotalCotizacion(supabase, cotizacionId, lineasRestantes)
}

export async function actualizarCotizacion(supabase, cotizacionId, patch) {
  if (supabase) {
    const { data, error } = await supabase
      .from('cotizaciones')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', cotizacionId)
      .select('*')
      .single()
    if (error) throw error
    return data
  }
  const list = readLs(LS_COTIZACIONES, [])
  let updated = null
  const next = list.map((c) => {
    if (!sameId(c.id, cotizacionId)) return c
    updated = { ...c, ...patch, updated_at: new Date().toISOString() }
    return updated
  })
  writeLs(LS_COTIZACIONES, next)
  return updated
}

export async function finalizarCotizacion(supabase, cotizacionId, lineas) {
  const total = totalCotizacionDesdeLineas(lineas)
  if (total <= 0.0001) throw new Error('Agregue al menos un producto o servicio antes de finalizar')
  return actualizarCotizacion(supabase, cotizacionId, {
    estatus: 'FINALIZADA',
    total,
  })
}

export async function marcarCotizacionAceptada(supabase, cotizacionId) {
  return actualizarCotizacion(supabase, cotizacionId, { estatus: 'ACEPTADA' })
}

export async function crearCuentaVaciaParaCliente(supabase, clienteId, nextLocalCuentaIdFn) {
  const row = {
    cliente_id: clienteId,
    total: 0,
    saldo: 0,
    estatus: 'PENDIENTE',
    tipo_pago: 'EFECTIVO',
    repara_id: null,
  }
  if (supabase) {
    const { data, error } = await supabase.from('cuentas').insert(row).select('*').single()
    if (error) throw error
    return data
  }
  const LS_CUENTAS = 'sistefix_local_cuentas'
  const list = readLs(LS_CUENTAS, [])
  const nuevo = { id: nextLocalCuentaIdFn(list), ...row, created_at: new Date().toISOString() }
  writeLs(LS_CUENTAS, [nuevo, ...list])
  return nuevo
}

/** Cuentas del cliente que aún pueden recibir cargos (no liquidadas). */
export async function listarCuentasAbiertasCliente(supabase, clienteId) {
  if (!clienteId) return []
  if (supabase) {
    const { data, error } = await supabase
      .from('cuentas')
      .select('*')
      .eq('cliente_id', clienteId)
      .neq('estatus', 'LIQUIDADA')
      .order('id', { ascending: false })
    if (error) throw error
    return data ?? []
  }
  return readLs(LS_CUENTAS, []).filter(
    (c) => sameId(c.cliente_id, clienteId) && String(c.estatus ?? '').toUpperCase() !== 'LIQUIDADA',
  )
}

async function sincronizarTotalesCuentaTrasAgregarLineas(supabase, cuentaId) {
  let cuenta = null
  let movs = []
  let pagos = []
  let reps = []

  if (supabase) {
    const { data: c, error: eC } = await supabase.from('cuentas').select('*').eq('id', cuentaId).maybeSingle()
    if (eC) throw eC
    cuenta = c
    if (cuenta) {
      const [rMovs, rPagos] = await Promise.all([
        supabase.from('cuentamov').select('*').eq('cuenta_id', cuentaId),
        supabase.from('pagosclientes').select('*').eq('cuenta_id', cuentaId),
      ])
      if (rMovs.error) throw rMovs.error
      if (rPagos.error) throw rPagos.error
      movs = rMovs.data ?? []
      pagos = rPagos.data ?? []
      const rid = cuenta.repara_id
      if (rid != null && rid !== '') {
        const rReps = await supabase.from('reparamov').select('*').eq('repara_id', rid)
        if (rReps.error) throw rReps.error
        reps = rReps.data ?? []
      }
    }
  } else {
    cuenta = readLs(LS_CUENTAS, []).find((c) => sameId(c.id, cuentaId)) ?? null
    movs = readLs(LS_CUENTAMOV, []).filter((m) => sameId(m.cuenta_id, cuentaId))
    pagos = readLs(LS_PAGOS, []).filter((p) => sameId(p.cuenta_id, cuentaId))
    if (cuenta?.repara_id != null && cuenta.repara_id !== '') {
      reps = readLs(LS_REPARAMOV, []).filter((x) => sameId(x.repara_id, cuenta.repara_id))
    }
  }

  if (!cuenta?.id) throw new Error('Cuenta no encontrada')

  const lineasCargos = [
    ...movs.map((m) => ({
      tipo: 'cuentamov',
      subtotal: Number(m.cantidad ?? 0) * Number(m.costo ?? 0),
    })),
    ...reps.map((r) => ({
      tipo: 'reparamov',
      subtotal: Number(r.cantidad ?? 0) * Number(r.costo ?? 0),
    })),
  ]
  const totalVenta = totalCargosDesdeLineasCuenta(lineasCargos)
  const actualizada = await sincronizarEstatusCuentaPorSaldo(supabase, cuenta, pagos, { totalVenta })
  return { cuenta: actualizada, totalVenta }
}

export async function convertirCotizacionACuenta({
  supabase,
  cotizacion,
  lineas,
  cuentaDestinoId = null,
  crearNuevaCuenta = false,
  nextLocalCuentaIdFn,
  nextLocalCuentamovIdFn,
  clienteIdOverride = null,
}) {
  const cotId = cotizacion?.id
  const clienteId = clienteIdOverride ?? cotizacion?.cliente_id
  if (!cotId || !clienteId) throw new Error('Cotización o cliente inválido')
  const est = String(cotizacion.estatus ?? '').toUpperCase()
  if (est === 'CONVERTIDA') throw new Error('Esta cotización ya fue convertida a cuenta')
  if (est !== 'ACEPTADA' && est !== 'FINALIZADA') {
    throw new Error('La cotización debe estar finalizada o aceptada antes de pasarla a cuenta')
  }

  let cuentaId = crearNuevaCuenta ? null : cuentaDestinoId
  if (crearNuevaCuenta || !cuentaId) {
    const cuenta = await crearCuentaVaciaParaCliente(supabase, clienteId, nextLocalCuentaIdFn)
    cuentaId = cuenta.id
  }

  let totalCotizacion = 0

  async function insertarMovimientoCuentaSinStock(row) {
    if (supabase) {
      const { error } = await supabase.from('cuentamov').insert(row)
      if (error) throw error
      return
    }
    const list = readLs(LS_CUENTAMOV, [])
    const id = nextLocalCuentamovIdFn(list)
    writeLs(LS_CUENTAMOV, [{ id, ...row }, ...list])
  }

  for (const l of lineas) {
    const cant = Number(l.cantidad ?? 0)
    const costo = Number(l.precioUnitario ?? 0)
    if (cant <= 0 || costo <= 0) continue
    const desc = String(l.descripcion ?? '')
      .replace(/^\[COTIZACIÓN\]\s*/i, '')
      .trim()
    const descVenta = desc.startsWith('[VENTA]') ? desc : `[VENTA] ${desc}`
    const row = {
      cuenta_id: cuentaId,
      producto_id: l.producto_id ?? null,
      cantidad: cant,
      descripcion: descVenta,
      costo,
    }
    totalCotizacion += cant * costo

    if (l.producto_id) {
      try {
        await registrarVentaEnCuenta({
          supabase,
          cuentaId,
          productoId: l.producto_id,
          descripcion: descVenta,
          cantidad: cant,
          precio: costo,
          nextLocalId: () => nextLocalCuentamovIdFn(readLs(LS_CUENTAMOV, [])),
        })
        continue
      } catch (e) {
        const msg = String(e?.message ?? '')
        if (!/stock insuficiente/i.test(msg)) throw e
      }
    }

    await insertarMovimientoCuentaSinStock(row)
  }

  const { cuenta: cuentaActualizada, totalVenta } = await sincronizarTotalesCuentaTrasAgregarLineas(
    supabase,
    cuentaId,
  )

  await actualizarCotizacion(supabase, cotId, {
    estatus: 'CONVERTIDA',
    cuenta_id: cuentaId,
    total: totalCotizacionDesdeLineas(lineas),
  })

  return { cuentaId, total: totalCotizacion, totalCuenta: totalVenta, cuenta: cuentaActualizada }
}

export async function eliminarCotizacionCompleta(supabase, cotizacionId) {
  if (supabase) {
    await supabase.from('cotizacionmov').delete().eq('cotizacion_id', cotizacionId)
    const { error } = await supabase.from('cotizaciones').delete().eq('id', cotizacionId)
    if (error) throw error
    return
  }
  writeLs(
    LS_COTIZACIONMOV,
    readLs(LS_COTIZACIONMOV, []).filter((m) => !sameId(m.cotizacion_id, cotizacionId)),
  )
  writeLs(
    LS_COTIZACIONES,
    readLs(LS_COTIZACIONES, []).filter((c) => !sameId(c.id, cotizacionId)),
  )
}

export function formatoTotalCotizacion(n) {
  return formatMontoCuenta(n)
}
