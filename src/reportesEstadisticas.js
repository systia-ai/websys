/** Utilidades para gráficas del reporte de reparaciones. */

export const AGRUPACIONES_ESTADISTICAS = [
  { id: 'dia', label: 'Por día' },
  { id: 'semana', label: 'Por semana' },
  { id: 'mes', label: 'Por mes' },
]

const LS_AGRUPACION = 'sistefix_reportes_agrupacion'

export function leerAgrupacionEstadisticas() {
  try {
    const v = localStorage.getItem(LS_AGRUPACION)
    if (v === 'semana' || v === 'mes') return v
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
  const raw =
    row.fecha ??
    row.Fecha ??
    row.fecha_ingreso ??
    row.fechaIngreso ??
    row.fecha_entrega ??
    row.created_at ??
    row.updated_at ??
    row.date
  if (raw == null || raw === '') return null
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function llenarRangoDias(ini, fin) {
  const out = []
  const [y0, m0, d0] = ini.split('-').map(Number)
  const [y1, m1, d1] = fin.split('-').map(Number)
  const start = new Date(y0, m0 - 1, d0)
  const end = new Date(y1, m1 - 1, d1)
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10))
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
  if (agrupacion === 'mes') return claveMes(ymd)
  if (agrupacion === 'semana') return claveSemana(ymd)
  return ymd
}

function bucketsEnPeriodo(periodo, agrupacion) {
  if (!periodo?.ini || !periodo?.fin) return []
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

export function seriePagosAgrupada(reparaciones, periodo, agrupacion = 'dia') {
  const map = new Map()
  agregarSeries(map, reparaciones, agrupacion, 'pago')
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
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    const fmt = (d) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
    return `${fmt(start)}`
  }
  return label
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
  if (agrupacion === 'mes') return 'Órdenes por mes'
  if (agrupacion === 'semana') return 'Órdenes por semana'
  return 'Órdenes por día'
}

export function tituloAgrupacionPagos(agrupacion) {
  if (agrupacion === 'mes') return 'Ingresos por mes (pagos)'
  if (agrupacion === 'semana') return 'Ingresos por semana (pagos)'
  return 'Ingresos por día (pagos)'
}

export function serieEstatus(porEstatus) {
  return Object.entries(porEstatus ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }))
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
