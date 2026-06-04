import { ESTATUS_ORDEN } from './catalogos.js'
import { aYmdLocalDesdeRaw, esOrdenDuplicada, repCoincideFiltroMonitor } from './reparacionUtils.js'

/** Orden en la cuadrícula de filtros de reportes (2 columnas). */
export const ESTATUS_ORDEN_REPORTES = [
  'INGRESADO',
  'ENTREGADO',
  'EN ESPERA POR REFACCION',
  'EN REVISION',
  'SIN REPARACION',
  'REPARADO',
]

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

/** Quita órdenes marcadas como duplicadas (no deben contar en reportes ni estadísticas). */
export function excluirOrdenesDuplicadas(rows) {
  return rows.filter((r) => !esOrdenDuplicada(r))
}

export function contarOrdenesDuplicadas(rows) {
  return rows.filter((r) => esOrdenDuplicada(r)).length
}

/** Mapas cuenta/pagos para fechas de entrega (misma lógica que el monitor). */
export function mapsFechasEntregaReporte(cuentas = [], pagos = []) {
  const reparaPorCuenta = new Map()
  const cuentaPorReparaId = new Map()
  for (const c of cuentas) {
    const rid = c?.repara_id ?? c?.reparacion_id
    if (rid != null && c?.id != null) reparaPorCuenta.set(String(c.id), String(rid))
  }
  for (const c of cuentas) {
    const rid = c?.repara_id ?? c?.reparacion_id
    if (rid == null) continue
    const key = String(rid)
    const prev = cuentaPorReparaId.get(key)
    if (!prev) {
      cuentaPorReparaId.set(key, c)
      continue
    }
    const tNew = new Date(c.updated_at ?? c.created_at ?? 0).getTime()
    const tPrev = new Date(prev.updated_at ?? prev.created_at ?? 0).getTime()
    if (tNew >= tPrev) cuentaPorReparaId.set(key, c)
  }
  const entregaDesdePagosPorRepara = new Map()
  for (const p of pagos) {
    const rid = reparaPorCuenta.get(String(p?.cuenta_id))
    if (!rid) continue
    const y = aYmdLocalDesdeRaw(p?.created_at ?? p?.fecha ?? p?.fecha_pago)
    if (!y) continue
    const prev = entregaDesdePagosPorRepara.get(rid)
    if (!prev || y > prev) entregaDesdePagosPorRepara.set(rid, y)
  }
  return { cuentaPorReparaId, entregaDesdePagosPorRepara }
}

/**
 * Filtra órdenes para reportes (estatus + rango, o solo por fecha ingreso/entrega como el monitor).
 * @param {'ingreso'|'entrega'|null} modoFecha
 */
export function filtrarReparacionesParaReporte(
  rows,
  { estatusSet, ini, fin, modoFecha = null, cuentaPorReparaId = new Map(), entregaDesdePagosPorRepara = new Map() },
) {
  const desde = String(ini ?? '').trim()
  const hasta = String(fin ?? '').trim()
  return rows.filter((r) => {
    const rid = String(r.id)
    return repCoincideFiltroMonitor(r, {
      estatusSeleccionados: estatusSet,
      desde,
      hasta,
      modoFecha,
      cuentaVinculada: cuentaPorReparaId.get(rid) ?? null,
      ymdDesdePagos: entregaDesdePagosPorRepara.get(rid) ?? null,
      estatusParaFiltroFn: estatusParaFiltroReporte,
    })
  })
}
