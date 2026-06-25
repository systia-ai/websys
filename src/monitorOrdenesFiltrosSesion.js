import { TIPOS_SERVICIO_CANONICOS } from './reparacionUtils.js'

export const LS_MONITOR_FILTROS = 'sistefix_monitor_ordenes_filtros_v1'
export const LS_MONITOR_REOPEN = 'sistefix_monitor_reopen_desde_orden'

const TECNICO_TODAS = ''

export function filtrosMonitorPorDefecto() {
  return {
    estatusSeleccionados: ['INGRESADO'],
    tiposServicioSeleccionados: [...TIPOS_SERVICIO_CANONICOS],
    ordenFecha: 'asc',
    tecnicoFiltro: TECNICO_TODAS,
    usarRangoFechas: false,
    rangoFechasElegido: true,
    fechaDesde: '',
    fechaHasta: '',
    filtroModoFechaIngreso: false,
    filtroModoFechaEntrega: false,
    filtroModoVerificadas: false,
    busqueda: '',
  }
}

function parseFiltrosGuardados(saved) {
  const defaults = filtrosMonitorPorDefecto()
  if (!saved || typeof saved !== 'object') return defaults
  return {
    estatusSeleccionados: Array.isArray(saved.estatusSeleccionados)
      ? saved.estatusSeleccionados
      : defaults.estatusSeleccionados,
    tiposServicioSeleccionados: Array.isArray(saved.tiposServicioSeleccionados)
      ? saved.tiposServicioSeleccionados
      : defaults.tiposServicioSeleccionados,
    ordenFecha: saved.ordenFecha === 'desc' ? 'desc' : 'asc',
    tecnicoFiltro: saved.tecnicoFiltro ?? defaults.tecnicoFiltro,
    usarRangoFechas:
      saved.usarRangoFechas != null
        ? !!saved.usarRangoFechas
        : Boolean(
            saved.filtroModoFechaIngreso ||
              saved.filtroModoFechaEntrega ||
              String(saved.fechaDesde ?? '').trim() ||
              String(saved.fechaHasta ?? '').trim(),
          ),
    rangoFechasElegido:
      saved.rangoFechasElegido != null
        ? !!saved.rangoFechasElegido
        : Boolean(
            saved.usarRangoFechas ||
              saved.filtroModoFechaIngreso ||
              saved.filtroModoFechaEntrega ||
              String(saved.fechaDesde ?? '').trim() ||
              String(saved.fechaHasta ?? '').trim(),
          ),
    fechaDesde: saved.fechaDesde ?? defaults.fechaDesde,
    fechaHasta: saved.fechaHasta ?? defaults.fechaHasta,
    filtroModoFechaIngreso: !!saved.filtroModoFechaIngreso,
    filtroModoFechaEntrega: !!saved.filtroModoFechaEntrega,
    filtroModoVerificadas: !!saved.filtroModoVerificadas,
    busqueda: typeof saved.busqueda === 'string' ? saved.busqueda : defaults.busqueda,
  }
}

export function leerEstadoFiltrosInicialMonitor() {
  try {
    const reopen = sessionStorage.getItem(LS_MONITOR_REOPEN) === '1'
    if (reopen) {
      sessionStorage.removeItem(LS_MONITOR_REOPEN)
      const raw = sessionStorage.getItem(LS_MONITOR_FILTROS)
      if (raw) {
        return parseFiltrosGuardados(JSON.parse(raw))
      }
    }
  } catch {
    /* ignore */
  }
  limpiarFiltrosMonitorSesion()
  return filtrosMonitorPorDefecto()
}

export function guardarFiltrosMonitorSesion(filtros) {
  try {
    sessionStorage.setItem(LS_MONITOR_FILTROS, JSON.stringify(filtros))
  } catch {
    /* quota / modo privado */
  }
}

export function marcarVolverMonitorDesdeOrden() {
  try {
    sessionStorage.setItem(LS_MONITOR_REOPEN, '1')
  } catch {
    /* ignore */
  }
}

export function limpiarFiltrosMonitorSesion() {
  try {
    sessionStorage.removeItem(LS_MONITOR_FILTROS)
    sessionStorage.removeItem(LS_MONITOR_REOPEN)
  } catch {
    /* ignore */
  }
}
