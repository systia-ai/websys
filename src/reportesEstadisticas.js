/** Utilidades para gráficas del reporte de reparaciones. */

import {
  aYmdLocalDesdeRaw,
  estaVerificadoEntrega,
  estatusParaFiltroMonitor,
  fechaHitoEstatusMonitor,
  fechaIngresoFiltroYmd,
  ymdLocalDesdeDate,
} from './reparacionUtils.js'
import { extractFechaPagoYmd } from './pagosClientesUtils.js'
import { ESTATUS_ORDEN_REPORTES } from './reportesFiltros.js'

export { extractFechaPagoYmd }

export const AGRUPACIONES_ESTADISTICAS = [
  { id: 'dia', label: 'Por día' },
  { id: 'mes', label: 'Por mes' },
  { id: 'anio', label: 'Por año' },
]

const LS_AGRUPACION = 'sistefix_reportes_agrupacion'

export function leerAgrupacionEstadisticas() {
  try {
    const v = localStorage.getItem(LS_AGRUPACION)
    if (v === 'mes' || v === 'anio') return v
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

export function extractFechaIngresoYmdReporte(row) {
  return fechaIngresoFiltroYmd(row)
}

export function extractFechaSalidaYmdReporte(row) {
  return aYmdLocalDesdeRaw(row?.fecha_entrega ?? row?.fechaEntrega)
}

export function extractFechaVerificacionYmd(row) {
  return aYmdLocalDesdeRaw(row?.fecha_verificacion_entrega)
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

/** Cuenta órdenes por una fecha extraída (ingreso, entrega, etc.). */
export function serieOrdenesPorFechaExtractor(reparaciones, periodo, agrupacion, extractor) {
  const map = new Map()
  const getYmd = typeof extractor === 'function' ? extractor : extractDateYmdReporte
  for (const r of reparaciones ?? []) {
    const y = getYmd(r)
    if (!y) continue
    if (periodo?.ini && y < periodo.ini) continue
    if (periodo?.fin && y > periodo.fin) continue
    const key = claveAgrupacion(y, agrupacion)
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return serieDesdeMapa(map, periodo, agrupacion, false)
}

export const COLORES_COMPARATIVA = {
  ingreso: '#1976d2',
  entrega: '#ef6c00',
  estatus: '#7b1fa2',
  ordenes: '#1976d2',
}

const COLORES_ESTATUS_SERIE = ['#7b1fa2', '#00897b', '#c62828', '#1565c0', '#f9a825', '#6d4c41', '#455a64', '#2e7d32']

export const COLOR_ESTATUS_COMPARATIVA = {
  INGRESADO: '#1565c0',
  ENTREGADO: '#2e7d32',
  'ENTREGADO SIN REPARACION': '#00897b',
  REPARADO: '#7b1fa2',
  'EN ESPERA POR REFACCION': '#f9a825',
  'SIN REPARACION': '#c62828',
  BAJA: '#6d4c41',
  'EN REVISION': '#00838f',
}

export function colorEstatusComparativa(estatus, index = 0) {
  const k = String(estatus ?? '').trim().toUpperCase()
  return COLOR_ESTATUS_COMPARATIVA[k] ?? COLORES_ESTATUS_SERIE[index % COLORES_ESTATUS_SERIE.length]
}

export function extractFechaHitoYmdReporte(row) {
  return fechaHitoEstatusMonitor(row)
}

function listaEstatusSet(estatusSet) {
  if (estatusSet == null) return null
  const raw = estatusSet instanceof Set ? [...estatusSet] : Array.isArray(estatusSet) ? estatusSet : []
  return raw.map((s) => String(s).trim().toUpperCase()).filter(Boolean)
}

function clavesEstatusParaGrafica(rows, estatusSet) {
  const order = ESTATUS_ORDEN_REPORTES.map((e) => String(e).trim().toUpperCase())
  const selected = listaEstatusSet(estatusSet)
  if (selected) {
    const sel = new Set(selected)
    const out = order.filter((k) => sel.has(k))
    for (const k of selected) {
      if (!out.includes(k)) out.push(k)
    }
    return out
  }
  const seen = new Set()
  for (const r of rows) {
    const k = estatusParaFiltroMonitor(r?.estatus)
    if (k) seen.add(k)
  }
  return order.filter((k) => seen.has(k)).concat([...seen].filter((k) => !order.includes(k)))
}

/**
 * Series combinadas según filtros del reporte (entrada, salida, cada estatus marcado).
 * Sirven para línea, barras agrupadas, circular y las tarjetas de selección.
 */
export function datasetsComparativaReporte({
  reparaciones,
  periodo,
  agrupacion = 'dia',
  incluirIngreso = false,
  incluirEntrega = false,
  incluirEstatus = false,
  estatusSet,
} = {}) {
  const rows = reparaciones ?? []
  const out = []

  if (incluirIngreso) {
    out.push({
      id: 'ingreso',
      label: 'Entraron',
      color: COLORES_COMPARATIVA.ingreso,
      points: serieOrdenesPorFechaExtractor(rows, periodo, agrupacion, extractFechaIngresoYmdReporte),
    })
  }
  if (incluirEntrega) {
    out.push({
      id: 'entrega',
      label: 'Salieron',
      color: COLORES_COMPARATIVA.entrega,
      points: serieOrdenesPorFechaExtractor(rows, periodo, agrupacion, extractFechaSalidaYmdReporte),
    })
  }
  if (incluirEstatus) {
    const claves = clavesEstatusParaGrafica(rows, estatusSet)
    claves.forEach((clave, i) => {
      const filas = rows.filter((r) => estatusParaFiltroMonitor(r?.estatus) === clave)
      out.push({
        id: `estatus-${clave}`,
        label: labelEstatusGrafica(clave),
        color: colorEstatusComparativa(clave, i),
        points: serieOrdenesPorFechaExtractor(filas, periodo, agrupacion, extractFechaHitoYmdReporte),
      })
    })
  }
  if (!out.length) {
    out.push({
      id: 'ordenes',
      label: 'Órdenes',
      color: COLORES_COMPARATIVA.ordenes,
      points: serieOrdenesAgrupada(rows, periodo, agrupacion),
    })
  }
  return out
}

export function totalesDesdeDatasets(datasets) {
  return (datasets ?? [])
    .map((d) => ({
      id: d.id,
      label: d.label,
      color: d.color,
      value: (d.points ?? []).reduce((s, p) => s + Number(p.value || 0), 0),
    }))
    .filter((t) => t.value > 0)
}

/** Totales de lo seleccionado (incluye ceros) para las tarjetas antes de las gráficas. */
export function kpisDesdeDatasets(datasets) {
  return (datasets ?? []).map((d) => ({
    id: d.id,
    label:
      d.id === 'ingreso' ? 'Equipos que entraron' : d.id === 'entrega' ? 'Equipos que salieron' : d.label,
    color: d.color,
    value: (d.points ?? []).reduce((s, p) => s + Number(p.value || 0), 0),
  }))
}

/** Tarjetas del reporte/gráficas: solo lo marcado (entrada, salida, cada estatus). */
export function kpisSeleccionReporte({ reparaciones, periodo, agrupacion = 'dia' } = {}) {
  if (!periodo) return []
  return kpisDesdeDatasets(
    datasetsComparativaReporte({
      reparaciones,
      periodo,
      agrupacion,
      incluirIngreso: Boolean(periodo.incluirIngreso),
      incluirEntrega: Boolean(periodo.incluirEntrega),
      incluirEstatus: Boolean(periodo.incluirEstatus),
      estatusSet: periodo.estatusSet,
    }),
  )
}

export function datasetsTienenDatos(datasets) {
  return (datasets ?? []).some((d) => serieTieneDatos(d.points))
}

export function tituloComparativa(agrupacion) {
  if (agrupacion === 'anio') return 'Comparativa por año'
  if (agrupacion === 'mes') return 'Comparativa por mes'
  return 'Comparativa por día'
}

function agregarSeriesVerificadas(conteoMap, reparaciones, agrupacion) {
  for (const r of reparaciones) {
    if (!estaVerificadoEntrega(r)) continue
    const y = extractFechaVerificacionYmd(r)
    if (!y) continue
    const key = claveAgrupacion(y, agrupacion)
    conteoMap.set(key, (conteoMap.get(key) ?? 0) + 1)
  }
}

/** Verificaciones agrupadas por fecha de verificación (fecha_verificacion_entrega). */
export function serieVerificadasAgrupada(reparaciones, periodo, agrupacion = 'dia') {
  const map = new Map()
  agregarSeriesVerificadas(map, reparaciones, agrupacion)
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
  return reparacionesEnRangoPorExtractor(reparaciones, ini, fin, extractDateYmdReporte)
}

export function reparacionesEnRangoPorExtractor(reparaciones, ini, fin, extractor) {
  const getYmd = typeof extractor === 'function' ? extractor : extractDateYmdReporte
  return (reparaciones ?? []).filter((r) => {
    const y = getYmd(r)
    return y != null && y >= ini && y <= fin
  })
}

export function tituloAgrupacionOrdenes(agrupacion) {
  if (agrupacion === 'anio') return 'Órdenes por año'
  if (agrupacion === 'mes') return 'Órdenes por mes'
  if (agrupacion === 'semana') return 'Órdenes por semana'
  return 'Órdenes por día'
}

export function tituloAgrupacionEntradas(agrupacion) {
  if (agrupacion === 'anio') return 'Equipos que entraron por año'
  if (agrupacion === 'mes') return 'Equipos que entraron por mes'
  return 'Equipos que entraron por día'
}

export function tituloAgrupacionSalidas(agrupacion) {
  if (agrupacion === 'anio') return 'Equipos que salieron por año'
  if (agrupacion === 'mes') return 'Equipos que salieron por mes'
  return 'Equipos que salieron por día'
}

export function tituloAgrupacionPagos(agrupacion) {
  if (agrupacion === 'anio') return 'Ingresos por año (pagos)'
  if (agrupacion === 'mes') return 'Ingresos por mes (pagos)'
  if (agrupacion === 'semana') return 'Ingresos por semana (pagos)'
  return 'Ingresos por día (pagos)'
}

export function tituloAgrupacionVerificadas(agrupacion) {
  if (agrupacion === 'anio') return 'Verificaciones por año'
  if (agrupacion === 'mes') return 'Verificaciones por mes'
  if (agrupacion === 'semana') return 'Verificaciones por semana'
  return 'Verificaciones por día'
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
    'ENTREGADO SIN REPARACION': 'Ent. sin rep.',
    BAJA: 'Baja',
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

/** Donut: en taller, verificadas listas para entrega y entregadas. */
export function serieDistribucionOrdenes({ entregadas = 0, verificadas = 0, enProceso = 0 }) {
  const items = []
  if (enProceso > 0) items.push({ label: 'En taller', value: enProceso, color: '#ff9800' })
  if (verificadas > 0) items.push({ label: 'Verificadas', value: verificadas, color: '#00897b' })
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
