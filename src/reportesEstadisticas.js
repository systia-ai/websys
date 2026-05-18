/** Utilidades para gráficas del reporte de reparaciones. */

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

export function serieOrdenesPorDia(reparaciones, periodo) {
  const conteo = new Map()
  for (const r of reparaciones) {
    const y = extractDateYmdReporte(r)
    if (!y) continue
    conteo.set(y, (conteo.get(y) ?? 0) + 1)
  }
  if (periodo?.ini && periodo?.fin) {
    return llenarRangoDias(periodo.ini, periodo.fin).map((dia) => ({
      label: dia,
      value: conteo.get(dia) ?? 0,
    }))
  }
  return [...conteo.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, value]) => ({ label, value }))
}

export function seriePagosPorDia(reparaciones, periodo) {
  const suma = new Map()
  for (const r of reparaciones) {
    const y = extractDateYmdReporte(r)
    if (!y) continue
    suma.set(y, (suma.get(y) ?? 0) + Number(r.pago ?? 0))
  }
  if (periodo?.ini && periodo?.fin) {
    return llenarRangoDias(periodo.ini, periodo.fin).map((dia) => ({
      label: dia,
      value: suma.get(dia) ?? 0,
    }))
  }
  return [...suma.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }))
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
