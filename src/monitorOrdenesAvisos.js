import {
  aYmdLocalDesdeRaw,
  estatusEsEnRevision,
  estatusEsEntregado,
  estatusEsIngresado,
  estatusEsReparado,
  estaVerificadoEntrega,
  fechaIngresoYmd,
  repEsVerificadaListaEntrega,
} from './reparacionUtils.js'

/** Solo órdenes con sistema web (desde 1° de mayo). */
export const MONITOR_AVISOS_DESDE_YMD = '2026-05-01'

export const AVISO_IDS = {
  REPARADAS_SIN_VERIFICAR: 'reparadas-sin-verificar',
  VERIFICADAS_PENDIENTES: 'verificadas-pendientes',
  EN_REVISION: 'en-revision',
  INGRESADAS: 'ingresadas',
}

export function repEnPeriodoMonitorAvisos(rep) {
  const ymd =
    fechaIngresoYmd(rep) ?? aYmdLocalDesdeRaw(rep?.fecha_creacion ?? rep?.created_at ?? rep?.fecha_registro)
  if (!ymd || ymd.length < 10) return false
  return ymd >= MONITOR_AVISOS_DESDE_YMD
}

export function repCoincideAvisoMonitor(rep, avisoId) {
  if (!repEnPeriodoMonitorAvisos(rep)) return false
  switch (avisoId) {
    case AVISO_IDS.REPARADAS_SIN_VERIFICAR:
      return (
        estatusEsReparado(rep?.estatus) &&
        !estaVerificadoEntrega(rep) &&
        !estatusEsEntregado(rep?.estatus)
      )
    case AVISO_IDS.VERIFICADAS_PENDIENTES:
      return repEsVerificadaListaEntrega(rep)
    case AVISO_IDS.EN_REVISION:
      return estatusEsEnRevision(rep?.estatus)
    case AVISO_IDS.INGRESADAS:
      return estatusEsIngresado(rep?.estatus)
    default:
      return false
  }
}

const DEFINICIONES_AVISOS = [
  {
    id: AVISO_IDS.REPARADAS_SIN_VERIFICAR,
    prioridad: 1,
    variante: 'warning',
    texto: (n) =>
      `Tienes (${n}) ${n === 1 ? 'orden reparada sin verificar' : 'órdenes reparadas sin verificar'}`,
  },
  {
    id: AVISO_IDS.VERIFICADAS_PENDIENTES,
    prioridad: 2,
    variante: 'info',
    texto: (n) =>
      `Tienes (${n}) ${n === 1 ? 'orden verificada pendiente de entrega' : 'órdenes verificadas pendientes de entrega'}`,
  },
  {
    id: AVISO_IDS.EN_REVISION,
    prioridad: 3,
    variante: 'info',
    texto: (n) =>
      `Tienes (${n}) ${n === 1 ? 'orden en revisión' : 'órdenes en revisión'}`,
  },
  {
    id: AVISO_IDS.INGRESADAS,
    prioridad: 4,
    variante: 'neutral',
    texto: (n) =>
      `Tienes (${n}) ${n === 1 ? 'orden ingresada en taller' : 'órdenes ingresadas en taller'}`,
  },
]

/** Resumen de pendientes para el panel del monitor (solo órdenes desde mayo). */
export function calcularAvisosMonitor(reparaciones) {
  const reps = (reparaciones ?? []).filter(repEnPeriodoMonitorAvisos)
  const conteos = {
    [AVISO_IDS.REPARADAS_SIN_VERIFICAR]: reps.filter((r) =>
      repCoincideAvisoMonitor(r, AVISO_IDS.REPARADAS_SIN_VERIFICAR),
    ).length,
    [AVISO_IDS.VERIFICADAS_PENDIENTES]: reps.filter((r) =>
      repCoincideAvisoMonitor(r, AVISO_IDS.VERIFICADAS_PENDIENTES),
    ).length,
    [AVISO_IDS.EN_REVISION]: reps.filter((r) => repCoincideAvisoMonitor(r, AVISO_IDS.EN_REVISION)).length,
    [AVISO_IDS.INGRESADAS]: reps.filter((r) => repCoincideAvisoMonitor(r, AVISO_IDS.INGRESADAS)).length,
  }

  return DEFINICIONES_AVISOS.map((def) => ({
    ...def,
    count: conteos[def.id] ?? 0,
    mensaje: def.texto(conteos[def.id] ?? 0),
  }))
    .filter((a) => a.count > 0)
    .sort((a, b) => a.prioridad - b.prioridad)
}

export function totalAvisosMonitor(avisos) {
  return (avisos ?? []).reduce((s, a) => s + a.count, 0)
}
