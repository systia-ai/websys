/** Utilidades para gráficas del reporte de reparaciones. */

import { aYmdLocalDesdeRaw, ymdLocalDesdeDate } from './reparacionUtils.js'

export const AGRUPACIONES_ESTADISTICAS = [
  { id: 'dia', label: 'Por día' },
  { id: 'semana', label: 'Por semana' },
  { id: 'mes', label: 'Por mes' },
  { id: 'anio', label: 'Por año' },
]

const LS_AGRUPACION = 'sistefix_reportes_agrupacion'

export function leerAgrupacionEstadisticas() {
  try {
    const v = localStorage.getItem(LS_AGRUPACION)
    if (v === 'semana' || v === 'mes' || v === 'anio') return v
    return 'dia'
  } catch {
    return 'dia'
  }
}

export function guardarAgrupacionEstadisticas(id) {
  try {
    localStorage.setItem(LS_AGRUPACION, id)
  } catch {
    /* ignore */
  }
}

/** Fecha del movimiento de pago (pagosclientes). */
export function extractFechaPagoYmd(pago) {
  return (
    aYmdLocalDesdeRaw(pago?.created_at) ??
    aYmdLocalDesdeRaw(pago?.fecha) ??
    aYmdLocalDesdeRaw(pago?.fecha_pago) ??
    aYmdLocalDesdeRaw(pago?.Fecha) ??
    aYmdLocalDesdeRaw(pago?.fecha_registro)
  )
}

export function extractDateYmdReporte(row) {
  return (
    aYmdLocalDesdeRaw(row?.fecha) ??
    aYmdLocalDesdeRaw(row?.Fecha) ??
    aYmdLocalDesdeRaw(row?.fecha_ingreso) ??
    aYmdLocalDesdeRaw(row?.fechaIngreso) ??
    aYmdLocalDesdeRaw(row?.fecha_entrega) ??
    aYmdLocalDesdeRaw(row?.created_at) ??
    aYmdLocalDesdeRaw(row?.updated_at) ??
    aYmdLocalDesdeRaw(row?.date)
  )
}

function llenarRangoDias(ini, fin) {
  const out = []
  const [y0, m0, d0] = ini.split('-').map(Number)
  const [y1, m1, d1] = fin.split('-').map(Number)
  const start = new Date(y0, m0 - 1, d0)
  const end = new Date(y1, m1 - 1, d1)
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    out.push(ymdLocalDesdeDate(new Date(t)))
  }
  return out
}

function ymdToLocalDate(ymd) {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function claveMes(ymd) {
  return ymd.slice(0, 7)
}

function claveAnio(ymd) {
  return ymd.slice(0, 4)
}

/** Lunes de la semana (calendario local) como YYYY-MM-DD. */
function claveSemana(ymd) {
  const d = ymdToLocalDate(ymd)
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  const y = monday.getFullYear()
  const m = String(monday.getMonth() + 1).padStart(2, '0')
  const day = String(monday.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function llenarRangoMeses(ini, fin) {
  const out = []
  let y = Number(ini.slice(0, 4))
  let m = Number(ini.slice(5, 7))
  const yFin = Number(fin.slice(0, 4))
  const mFin = Number(fin.slice(5, 7))
  while (y < yFin || (y === yFin && m <= mFin)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

function llenarRangoAnios(ini, fin) {
  const out = []
  const y0 = Number(ini.slice(0, 4))
  const y1 = Number(fin.slice(0, 4))
  for (let y = y0; y <= y1; y += 1) {
    out.push(String(y))
  }
  return out
}

function llenarRangoSemanas(ini, fin) {
  const seen = new Set()
  for (const dia of llenarRangoDias(ini, fin)) {
    seen.add(claveSemana(dia))
  }
  return [...seen].sort((a, b) => a.localeCompare(b))
}

function ultimoDiaMes(ym) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m, 0)
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${String(m).padStart(2, '0')}-${day}`
}

function claveAgrupacion(ymd, agrupacion) {
  if (agrupacion === 'anio') return claveAnio(ymd)
  if (agrupacion === 'mes') return claveMes(ymd)
  if (agrupacion === 'semana') return claveSemana(ymd)
  return ymd
}

function bucketsEnPeriodo(periodo, agrupacion) {
  if (!periodo?.ini || !periodo?.fin) return []
  if (agrupacion === 'anio') return llenarRangoAnios(periodo.ini, periodo.fin)
  if (agrupacion === 'mes') return llenarRangoMeses(periodo.ini, periodo.fin)
  if (agrupacion === 'semana') return llenarRangoSemanas(periodo.ini, periodo.fin)
  return llenarRangoDias(periodo.ini, periodo.fin)
}

function agregarSeries(conteoMap, reparaciones, agrupacion, campo) {
  for (const r of reparaciones) {
    const y = extractDateYmdReporte(r)
    if (!y) continue
    const key = claveAgrupacion(y, agrupacion)
    const add = campo === 'pago' ? Number(r.pago ?? 0) : 1
    conteoMap.set(key, (conteoMap.get(key) ?? 0) + add)
  }
}

function serieDesdeMapa(conteoMap, periodo, agrupacion, esPago) {
  if (periodo?.ini && periodo?.fin) {
    return bucketsEnPeriodo(periodo, agrupacion).map((label) => {
      const raw = conteoMap.get(label) ?? 0
      const value = esPago ? Math.round(raw * 100) / 100 : raw
      return { label, value }
    })
  }
  return [...conteoMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, value]) => ({
      label,
      value: esPago ? Math.round(value * 100) / 100 : value,
    }))
}

export function serieOrdenesAgrupada(reparaciones, periodo, agrupacion = 'dia') {
  const map = new Map()
  agregarSeries(map, reparaciones, agrupacion, 'count')
  return serieDesdeMapa(map, periodo, agrupacion, false)
}

/** @deprecated Use seriePagosAgrupadaDesdePagos con registros de pagosclientes. */
export function seriePagosAgrupada(reparaciones, periodo, agrupacion = 'dia') {
  const map = new Map()
  agregarSeries(map, reparaciones, agrupacion, 'pago')
  return serieDesdeMapa(map, periodo, agrupacion, true)
}

export function pagosEnRango(pagos, ini, fin) {
  return (pagos ?? []).filter((p) => {
    const y = extractFechaPagoYmd(p)
    return y != null && y >= ini && y <= fin
  })
}

/** Ingresos reales agrupados por fecha de pago (tabla pagosclientes). */
export function seriePagosAgrupadaDesdePagos(pagos, periodo, agrupacion = 'dia') {
  const map = new Map()
  for (const p of pagos ?? []) {
    const y = extractFechaPagoYmd(p)
    if (!y) continue
    const key = claveAgrupacion(y, agrupacion)
    const add = Number(p.pago ?? 0)
    if (!Number.isFinite(add) || add <= 0) continue
    map.set(key, (map.get(key) ?? 0) + add)
  }
  return serieDesdeMapa(map, periodo, agrupacion, true)
}

/** Compatibilidad con llamadas anteriores. */
export function serieOrdenesPorDia(reparaciones, periodo) {
  return serieOrdenesAgrupada(reparaciones, periodo, 'dia')
}

export function seriePagosPorDia(reparaciones, periodo) {
  return seriePagosAgrupada(reparaciones, periodo, 'dia')
}

export function labelMesLargo(ym) {
  const [y, m] = ym.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ym
  return new Date(y, m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
}

export function labelPeriodoEje(label, agrupacion) {
  if (!label) return label
  if (agrupacion === 'dia') return labelDiaCorta(label)
  if (agrupacion === 'mes') {
    const [y, m] = label.split('-').map(Number)
    if (!Number.isFinite(y) || !Number.isFinite(m)) return label
    return new Date(y, m - 1, 1).toLocaleDateString('es-MX', { month: 'short', year: '2-digit' })
  }
  if (agrupacion === 'semana') {
    const start = ymdToLocalDate(label)
    const fmt = (d) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
    return `${fmt(start)}`
  }
  if (agrupacion === 'anio') return label
  return label
}

/** Años calendario dentro del periodo (detalle mensual por año). */
export function segmentosAnioEnPeriodo(periodo) {
  if (!periodo?.ini || !periodo?.fin) return []
  return llenarRangoAnios(periodo.ini, periodo.fin).map((y) => {
    const inicioAnio = `${y}-01-01`
    const finAnio = `${y}-12-31`
    return {
      key: y,
      label: y,
      ini: inicioAnio < periodo.ini ? periodo.ini : inicioAnio,
      fin: finAnio > periodo.fin ? periodo.fin : finAnio,
    }
  })
}

/** Meses calendario dentro del periodo (para gráficas diarias por mes). */
export function segmentosMesEnPeriodo(periodo) {
  if (!periodo?.ini || !periodo?.fin) return []
  return llenarRangoMeses(periodo.ini, periodo.fin).map((ym) => {
    const inicioMes = `${ym}-01`
    const finMes = ultimoDiaMes(ym)
    return {
      key: ym,
      label: labelMesLargo(ym),
      ini: inicioMes < periodo.ini ? periodo.ini : inicioMes,
      fin: finMes > periodo.fin ? periodo.fin : finMes,
    }
  })
}

export function reparacionesEnRango(reparaciones, ini, fin) {
  return reparaciones.filter((r) => {
    const y = extractDateYmdReporte(r)
    return y != null && y >= ini && y <= fin
  })
}

export function tituloAgrupacionOrdenes(agrupacion) {
  if (agrupacion === 'anio') return 'Órdenes por año'
  if (agrupacion === 'mes') return 'Órdenes por mes'
  if (agrupacion === 'semana') return 'Órdenes por semana'
  return 'Órdenes por día'
}

export function tituloAgrupacionPagos(agrupacion) {
  if (agrupacion === 'anio') return 'Ingresos por año (pagos)'
  if (agrupacion === 'mes') return 'Ingresos por mes (pagos)'
  if (agrupacion === 'semana') return 'Ingresos por semana (pagos)'
  return 'Ingresos por día (pagos)'
}

export function normalizarLabelEstatus(label) {
  const u = String(label ?? '').trim().toUpperCase()
  if (u === 'ENTREGADA') return 'ENTREGADO'
  return String(label ?? '').trim() || '—'
}

/** Etiquetas cortas y legibles bajo las barras de «Órdenes por estatus». */
export function labelEstatusGrafica(label) {
  const u = String(label ?? '').trim().toUpperCase()
  const cortos = {
    INGRESADO: 'Ingresado',
    'EN REVISION': 'En revisión',
    'EN ESPERA POR REFACCION': 'En espera',
    REPARADO: 'Reparado',
    'SIN REPARACION': 'Sin reparación',
    ENTREGADO: 'Entregado',
    ENTREGADA: 'Entregado',
  }
  if (cortos[u]) return cortos[u]
  const t = String(label ?? '').trim()
  return t.length > 16 ? `${t.slice(0, 15)}…` : t
}

export function serieEstatus(porEstatus) {
  const merged = {}
  for (const [raw, n] of Object.entries(porEstatus ?? {})) {
    const num = Number(n)
    if (!Number.isFinite(num) || num <= 0) continue
    const label = normalizarLabelEstatus(raw)
    merged[label] = (merged[label] ?? 0) + num
  }
  return Object.entries(merged)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }))
}

export function totalPagosEnLista(pagos) {
  return (pagos ?? []).reduce((s, p) => s + Number(p.pago ?? 0), 0)
}

export function serieTieneDatos(series) {
  return (series ?? []).some((d) => Number(d.value) > 0)
}

export function serieEntregadasActivas(entregadas, activas) {
  const items = []
  if (activas > 0) items.push({ label: 'Activas', value: activas, color: '#ff9800' })
  if (entregadas > 0) items.push({ label: 'Entregadas', value: entregadas, color: '#43a047' })
  return items
}

export function labelDiaCorta(ymd) {
  if (!ymd || ymd.length < 10) return ymd
  const [y, m, d] = ymd.split('-').map(Number)
  if (!Number.isFinite(y)) return ymd
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

export function hayDatosConFecha(reparaciones) {
  return reparaciones.some((r) => extractDateYmdReporte(r) != null)
}
