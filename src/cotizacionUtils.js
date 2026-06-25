import { sameId } from './clienteUtils.js'
import { formatMontoCuenta } from './reparacionUtils.js'

export const LS_COTIZACIONES = 'sistefix_local_cotizaciones'
export const LS_COTIZACIONMOV = 'sistefix_local_cotizacionmov'

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
  return lineas.map((l) => ({
    tipo: 'cuentamov',
    cantidad: l.cantidad,
    descripcion: String(l.descripcion ?? '').replace(/^\[COTIZACIÓN\]\s*/i, '[VENTA] '),
    precioUnitario: l.precioUnitario,
    subtotal: l.subtotal,
  }))
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

export async function crearCotizacionVacia(supabase, clienteId) {
  const row = {
    cliente_id: clienteId,
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
  } else {
    const list = readLs(LS_COTIZACIONMOV, [])
    movId = nextLocalId ? nextLocalId() : nextLocalCotizacionMovId(list)
    writeLs(LS_COTIZACIONMOV, [{ id: movId, ...row }, ...list])
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

export async function finalizarCotizacion(supabase, cotizacionId, lineas, validezHasta = null) {
  const total = totalCotizacionDesdeLineas(lineas)
  if (total <= 0.0001) throw new Error('Agregue al menos un producto o servicio antes de finalizar')
  return actualizarCotizacion(supabase, cotizacionId, {
    estatus: 'FINALIZADA',
    total,
    validez_hasta: validezHasta || null,
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

export async function convertirCotizacionACuenta({
  supabase,
  cotizacion,
  lineas,
  cuentaDestinoId = null,
  crearNuevaCuenta = false,
  nextLocalCuentaIdFn,
  nextLocalCuentamovIdFn,
}) {
  const cotId = cotizacion?.id
  const clienteId = cotizacion?.cliente_id
  if (!cotId || !clienteId) throw new Error('Cotización o cliente inválido')
  const est = String(cotizacion.estatus ?? '').toUpperCase()
  if (est === 'CONVERTIDA') throw new Error('Esta cotización ya fue convertida a cuenta')
  if (est !== 'ACEPTADA' && est !== 'FINALIZADA') {
    throw new Error('La cotización debe estar finalizada o aceptada antes de pasarla a cuenta')
  }

  let cuentaId = cuentaDestinoId
  if (crearNuevaCuenta || !cuentaId) {
    const cuenta = await crearCuentaVaciaParaCliente(supabase, clienteId, nextLocalCuentaIdFn)
    cuentaId = cuenta.id
  }

  const LS_CUENTAMOV = 'sistefix_local_cuentamov'
  const LS_CUENTAS = 'sistefix_local_cuentas'
  let total = 0

  for (const l of lineas) {
    const cant = Number(l.cantidad ?? 0)
    const costo = Number(l.precioUnitario ?? 0)
    if (cant <= 0 || costo <= 0) continue
    const desc = String(l.descripcion ?? '')
      .replace(/^\[COTIZACIÓN\]\s*/i, '')
      .trim()
    const row = {
      cuenta_id: cuentaId,
      producto_id: l.producto_id ?? null,
      cantidad: cant,
      descripcion: desc.startsWith('[VENTA]') ? desc : `[VENTA] ${desc}`,
      costo,
    }
    total += cant * costo
    if (supabase) {
      const { error } = await supabase.from('cuentamov').insert(row)
      if (error) throw error
    } else {
      const list = readLs(LS_CUENTAMOV, [])
      const id = nextLocalCuentamovIdFn(list)
      writeLs(LS_CUENTAMOV, [{ id, ...row }, ...list])
    }
  }

  const cuentaPatch = { total, saldo: total, estatus: 'PENDIENTE' }
  if (supabase) {
    const { error } = await supabase.from('cuentas').update(cuentaPatch).eq('id', cuentaId)
    if (error) throw error
  } else {
    const list = readLs(LS_CUENTAS, [])
    writeLs(
      LS_CUENTAS,
      list.map((c) => (sameId(c.id, cuentaId) ? { ...c, ...cuentaPatch } : c)),
    )
  }

  await actualizarCotizacion(supabase, cotId, {
    estatus: 'CONVERTIDA',
    cuenta_id: cuentaId,
    total: totalCotizacionDesdeLineas(lineas),
  })

  return { cuentaId, total }
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
