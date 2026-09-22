import {
  aYmdLocalDesdeRaw,
  esOrdenDuplicada,
  ESTATUS_BAJA,
  ESTATUS_ENTREGADO_SIN_REPARACION,
  estatusEsEntregado,
  estatusParaFiltroMonitor,
  ordenUsaSistemaWeb,
  repCoincideFiltroMonitor,
  repEnRangoFechasMonitor,
  repEsVerificadaListaEntrega,
} from './reparacionUtils.js'

/** Misma cuadrícula de estatus que el monitor (sin avisos ni buscador). */
export const ESTATUS_ORDEN_REPORTES = [
  'INGRESADO',
  'ENTREGADO',
  ESTATUS_ENTREGADO_SIN_REPARACION,
  'REPARADO',
  'EN ESPERA POR REFACCION',
  'SIN REPARACION',
  ESTATUS_BAJA,
  'EN REVISION',
]

export const ESTATUS_REPORTES_ANCLADOS_INICIO = [
  'INGRESADO',
  'ENTREGADO',
  ESTATUS_ENTREGADO_SIN_REPARACION,
]
export const ESTATUS_REPORTES_SECUNDARIOS = [
  'REPARADO',
  'EN ESPERA POR REFACCION',
  'SIN REPARACION',
  ESTATUS_BAJA,
]
export const ESTATUS_REPORTES_ANCLADOS_FIN = ['EN REVISION']

export function estatusParaFiltroReporte(rep) {
  return estatusParaFiltroMonitor(rep?.estatus)
}

export function crearSetEstatusTodos() {
  return new Set(ESTATUS_ORDEN_REPORTES.map((e) => String(e).trim().toUpperCase()))
}

export function labelEstatusAplicados(estatusSet) {
  if (!estatusSet || estatusSet.size === 0) return 'Ninguno'
  if (estatusSet.size >= ESTATUS_ORDEN_REPORTES.length) return 'Todos'
  return [...estatusSet].sort().join(', ')
}

export function filtrarPorEstatus(rows, estatusSet) {
  if (!estatusSet || estatusSet.size === 0) return []
  if (estatusSet.size >= ESTATUS_ORDEN_REPORTES.length) return rows
  return rows.filter((r) => estatusSet.has(estatusParaFiltroReporte(r)))
}

export function etiquetaEstatusChipReporte(est) {
  const st = String(est).trim().toUpperCase()
  if (st === 'INGRESADO') return 'Ingresado (estatus)'
  if (st === 'ENTREGADO') return 'Entregado (estatus)'
  if (st === ESTATUS_ENTREGADO_SIN_REPARACION) return 'Entregado sin reparación'
  if (st === ESTATUS_BAJA) return 'Baja'
  return est
}

/** Texto del banner: modos de fecha + estatus si aplica. */
export function etiquetaFiltrosReporteAplicados({
  incluirIngreso = false,
  incluirEntrega = false,
  incluirEstatus = false,
  estatusSet,
} = {}) {
  const partes = []
  if (incluirIngreso) partes.push('Equipos que entraron')
  if (incluirEntrega) partes.push('Equipos que salieron')
  if (incluirEstatus) partes.push(`Estatus: ${labelEstatusAplicados(estatusSet)}`)
  return partes.length ? partes.join(' · ') : 'Ninguno'
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

function coincideSalidaReporte(rep, d, h, cuentaVinculada, ymdDesdePagos) {
  if (!estatusEsEntregado(rep?.estatus)) return false
  if (repEsVerificadaListaEntrega(rep)) return false
  return repEnRangoFechasMonitor(rep, d, h, cuentaVinculada, ymdDesdePagos, 'entrega')
}

/**
 * En reportes se pueden combinar (unión) equipos que entraron, que salieron y filtro por estatus.
 * Lo marcado se incluye en el listado y en las gráficas.
 */
export function repCoincideFiltroReporte(
  rep,
  {
    estatusSet,
    desde,
    hasta,
    incluirIngreso = false,
    incluirEntrega = false,
    incluirEstatus = false,
    cuentaVinculada,
    ymdDesdePagos,
  },
) {
  if (!ordenUsaSistemaWeb(rep)) return false

  const d = String(desde ?? '').trim()
  const h = String(hasta ?? '').trim()
  const hayRango = Boolean(d || h)

  if (incluirIngreso) {
    if (hayRango && repEnRangoFechasMonitor(rep, d, h, cuentaVinculada, ymdDesdePagos, 'ingreso')) {
      return true
    }
  }

  if (incluirEntrega) {
    if (hayRango && coincideSalidaReporte(rep, d, h, cuentaVinculada, ymdDesdePagos)) {
      return true
    }
  }

  if (incluirEstatus) {
    return repCoincideFiltroMonitor(rep, {
      estatusSeleccionados: estatusSet,
      desde: d,
      hasta: h,
      modoFecha: null,
      cuentaVinculada,
      ymdDesdePagos,
      estatusParaFiltroFn: estatusParaFiltroReporte,
    })
  }

  return false
}

/**
 * Filtra órdenes para reportes. Los modos de fecha y el estatus se combinan por unión.
 */
export function filtrarReparacionesParaReporte(
  rows,
  {
    estatusSet,
    ini,
    fin,
    incluirIngreso = false,
    incluirEntrega = false,
    incluirEstatus = false,
    modoFecha = null,
    cuentaPorReparaId = new Map(),
    entregaDesdePagosPorRepara = new Map(),
  },
) {
  const desde = String(ini ?? '').trim()
  const hasta = String(fin ?? '').trim()
  let ingreso = incluirIngreso
  let entrega = incluirEntrega
  let estatus = incluirEstatus
  if (!ingreso && !entrega && !estatus && modoFecha) {
    ingreso = modoFecha === 'ingreso'
    entrega = modoFecha === 'entrega'
    estatus = modoFecha !== 'ingreso' && modoFecha !== 'entrega'
  }
  return rows.filter((r) => {
    const rid = String(r.id)
    return repCoincideFiltroReporte(r, {
      estatusSet,
      desde,
      hasta,
      incluirIngreso: ingreso,
      incluirEntrega: entrega,
      incluirEstatus: estatus,
      cuentaVinculada: cuentaPorReparaId.get(rid) ?? null,
      ymdDesdePagos: entregaDesdePagosPorRepara.get(rid) ?? null,
    })
  })
}
