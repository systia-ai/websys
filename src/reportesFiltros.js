import { ESTATUS_ORDEN } from './catalogos.js'

export function estatusParaFiltroReporte(rep) {
  const st = String(rep?.estatus ?? '').trim().toUpperCase()
  if (st === 'ENTREGADA') return 'ENTREGADO'
  return st
}

export function crearSetEstatusTodos() {
  return new Set(ESTATUS_ORDEN.map((e) => String(e).trim().toUpperCase()))
}

export function labelEstatusAplicados(estatusSet) {
  if (!estatusSet || estatusSet.size === 0) return 'Ninguno'
  if (estatusSet.size >= ESTATUS_ORDEN.length) return 'Todos'
  return [...estatusSet].sort().join(', ')
}

export function filtrarPorEstatus(rows, estatusSet) {
  if (!estatusSet || estatusSet.size === 0) return []
  if (estatusSet.size >= ESTATUS_ORDEN.length) return rows
  return rows.filter((r) => estatusSet.has(estatusParaFiltroReporte(r)))
}
