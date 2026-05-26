import { aYmdLocalDesdeRaw } from './reparacionUtils.js'

export const LS_PAGOS_CLIENTES = 'sistefix_local_pagosclientes'
export const LS_PAGOCLIENTE_LEGACY = 'sistefix_local_pagocliente'

const TABLAS_PAGOS_SUPABASE = ['pagosclientes', 'pagocliente']

function readLs(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback))
  } catch {
    return fallback
  }
}

export function isTableMissingError(err) {
  const m = String(err?.message ?? err ?? '').toLowerCase()
  return (
    m.includes('could not find the table') ||
    m.includes('schema cache') ||
    m.includes('does not exist') ||
    (m.includes('relation') && m.includes('does not exist'))
  )
}

/** Fecha del movimiento de pago (columna real en Supabase: `created_at`). */
export function extractFechaPagoYmd(pago, cuentasPorId = null) {
  const direct =
    aYmdLocalDesdeRaw(pago?.created_at) ??
    aYmdLocalDesdeRaw(pago?.fecha) ??
    aYmdLocalDesdeRaw(pago?.fecha_pago) ??
    aYmdLocalDesdeRaw(pago?.Fecha) ??
    aYmdLocalDesdeRaw(pago?.fecha_registro) ??
    aYmdLocalDesdeRaw(pago?.fecha_movimiento) ??
    aYmdLocalDesdeRaw(pago?.date)
  if (direct) return direct

  const cid = pago?.cuenta_id
  if (cid == null || cid === '' || !cuentasPorId) return null
  const cuenta = cuentasPorId.get(String(cid))
  if (!cuenta) return null
  return (
    aYmdLocalDesdeRaw(cuenta.fecha_liquidada ?? cuenta.fechaLiquidada) ??
    aYmdLocalDesdeRaw(cuenta.created_at)
  )
}

export function readLocalPagosMerged() {
  const principal = readLs(LS_PAGOS_CLIENTES, [])
  const legacy = readLs(LS_PAGOCLIENTE_LEGACY, [])
  if (!legacy.length) return principal
  const ids = new Set(principal.map((r) => String(r.id)))
  return [...principal, ...legacy.filter((r) => r.id != null && !ids.has(String(r.id)))]
}

function fusionarPagosPorId(listas) {
  const ids = new Set()
  const out = []
  for (const lista of listas) {
    for (const row of lista ?? []) {
      if (row?.id == null) continue
      const key = String(row.id)
      if (ids.has(key)) continue
      ids.add(key)
      out.push(row)
    }
  }
  return out
}

/** Carga todos los pagos: `pagosclientes` + `pagocliente` (legacy) si existe. */
export async function cargarTodosPagosClientes(supabase) {
  if (!supabase?.from) return readLocalPagosMerged()

  const bloques = []
  let algunaTabla = false
  for (const tabla of TABLAS_PAGOS_SUPABASE) {
    const { data, error } = await supabase.from(tabla).select('*').order('id', { ascending: false })
    if (!error) {
      algunaTabla = true
      bloques.push(data ?? [])
      continue
    }
    if (isTableMissingError(error)) continue
    throw error
  }
  if (!algunaTabla) {
    throw new Error('En Supabase no existe la tabla pagosclientes ni pagocliente.')
  }
  return fusionarPagosPorId(bloques)
}

/** Mapa cuenta_id → fila de cuenta (fechas para inferir pago sin `created_at`). */
export async function cargarCuentasMapParaPagos(supabase) {
  if (!supabase?.from) return new Map()
  const { data, error } = await supabase
    .from('cuentas')
    .select('id, fecha_liquidada, created_at')
  if (error) throw error
  return new Map((data ?? []).map((c) => [String(c.id), c]))
}

/**
 * Filtra pagos por [ini, fin] inclusive.
 * Si ningún registro trae fecha, devuelve todos.
 * Los pagos sin fecha reconocible se incluyen siempre y se reportan aparte.
 */
export function aplicarFiltroPagosPorFechas(pagos, ini, fin, cuentasPorId = null) {
  const rows = pagos ?? []
  if (!rows.length) {
    return { filas: [], sinColumnaFecha: false, excluidosFueraDeRango: 0, sinFechaIncluidos: 0 }
  }

  const conFecha = rows.some((r) => extractFechaPagoYmd(r, cuentasPorId) != null)
  if (!conFecha) {
    return { filas: [...rows], sinColumnaFecha: true, excluidosFueraDeRango: 0, sinFechaIncluidos: 0 }
  }

  const filas = []
  let excluidosFueraDeRango = 0
  let sinFechaIncluidos = 0
  for (const r of rows) {
    const y = extractFechaPagoYmd(r, cuentasPorId)
    if (y == null) {
      filas.push(r)
      sinFechaIncluidos += 1
      continue
    }
    if (y >= ini && y <= fin) filas.push(r)
    else excluidosFueraDeRango += 1
  }
  return { filas, sinColumnaFecha: false, excluidosFueraDeRango, sinFechaIncluidos }
}

/** Inserta en `pagosclientes` y devuelve la fila guardada (con `created_at` del servidor). */
export async function insertPagoCliente(supabase, row, { nextLocalId } = {}) {
  const payload = {
    cliente_id: row.cliente_id,
    cuenta_id: row.cuenta_id,
    pago: row.pago,
    concepto: row.concepto ?? 'Pago',
    forma_pago: row.forma_pago ?? 'EFECTIVO',
  }
  if (!payload.cliente_id || !payload.cuenta_id) {
    throw new Error('El pago requiere cliente y cuenta.')
  }
  if (!Number.isFinite(Number(payload.pago)) || Number(payload.pago) <= 0) {
    throw new Error('El monto del pago debe ser mayor a cero.')
  }

  if (supabase?.from) {
    const { data, error } = await supabase.from('pagosclientes').insert(payload).select('*').single()
    if (error) throw error
    return data
  }

  const now = new Date().toISOString()
  const id = typeof nextLocalId === 'function' ? nextLocalId() : Date.now()
  const local = { id, ...payload, created_at: now }
  const all = readLs(LS_PAGOS_CLIENTES, [])
  localStorage.setItem(LS_PAGOS_CLIENTES, JSON.stringify([local, ...all]))
  return local
}

export function sumMontoPagos(pagos = []) {
  return (pagos ?? []).reduce((s, p) => {
    const n = Number(p.pago ?? 0)
    return Number.isFinite(n) ? s + n : s
  }, 0)
}
