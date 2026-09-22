/* eslint-disable react-hooks/set-state-in-effect -- carga inicial de clientes */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AlertaPermiso from './AlertaPermiso.jsx'
import { normalizeClienteRow, sameId } from './clienteUtils.js'
import { MENSAJE_SIN_PERMISO_FECHAS, rangoFechasPermitidoUsuario } from './permisosUtils.js'
import { usePermisoEliminar } from './usePermisoEliminar.js'
import ReportesEstadisticasView, { ReportesKpisSeleccion } from './ReportesEstadisticasView.jsx'
import ReportesFiltrosCard from './ReportesFiltrosCard.jsx'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'
import { fetchAllRows } from './supabaseFetchAll.js'
import {
  aYmdLocalDesdeRaw,
  claseBadgeEstatusOrden,
  contarNotificacionesClienteBitacora,
  estaVerificadoEntrega,
  estatusEsBaja,
  estatusEsEntregado,
  fechaBajaYmd,
  fechaEntregaYmd,
  fechaIngresoFiltroYmd,
  fechaIngresoYmd,
  formatFechaLegibleEsMx,
  TIPO_GARANTIA_EPSON,
  TIPOS_SERVICIO_CANONICOS,
  tipoServicioDeRep,
  ymdHoyLocal,
  ymdLocalDesdeDate,
} from './reparacionUtils.js'
import {
  crearSetEstatusTodos,
  contarOrdenesDuplicadas,
  excluirOrdenesDuplicadas,
  etiquetaFiltrosReporteAplicados,
  filtrarReparacionesParaReporte,
  mapsFechasEntregaReporte,
} from './reportesFiltros.js'
import {
  cargarTodosPagosClientes,
} from './pagosClientesUtils.js'
import { kpisSeleccionReporte } from './reportesEstadisticas.js'

const LS_VISTA_REPORTES = 'sistefix_reportes_vista'
const LS_ORDEN_FECHA_REPORTES = 'sistefix_reportes_orden_fecha'

function leerVistaReportes() {
  try {
    return localStorage.getItem(LS_VISTA_REPORTES) === 'tabla' ? 'tabla' : 'lista'
  } catch {
    return 'lista'
  }
}

function leerOrdenFechaReportes() {
  try {
    return localStorage.getItem(LS_ORDEN_FECHA_REPORTES) === 'asc' ? 'asc' : 'desc'
  } catch {
    return 'desc'
  }
}

const LS_REP = 'sistefix_local_reparaciones'
const LS_CLIENTES = 'sistefix_local_clientes'
const LS_EQUIPOS = 'sistefix_local_equipos'
const LS_CUENTAS = 'sistefix_local_cuentas'

function ymdHoy() {
  return ymdHoyLocal()
}

function ymdInicioMes() {
  const d = new Date()
  return ymdLocalDesdeDate(new Date(d.getFullYear(), d.getMonth(), 1))
}

function readLs(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback))
  } catch {
    return fallback
  }
}

function extractDateYmd(row) {
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

function ordenarReparacionesPorFecha(filas, orden = 'desc') {
  const dir = orden === 'asc' ? 1 : -1
  return [...(filas ?? [])].sort((a, b) => {
    const ya = extractDateYmd(a)
    const yb = extractDateYmd(b)
    if (ya == null && yb == null) {
      return (Number(a.id) - Number(b.id)) * dir
    }
    if (ya == null) return 1
    if (yb == null) return -1
    if (ya !== yb) return ya < yb ? -dir : dir
    return (Number(a.id) - Number(b.id)) * dir
  })
}

function hayAlgunaFechaEnFilas(rows) {
  return rows.some((r) => extractDateYmd(r) != null)
}

function aplicarFiltroFechas(rows, ini, fin) {
  if (!hayAlgunaFechaEnFilas(rows)) {
    return { filas: [...rows], sinColumnaFecha: true }
  }
  const filas = rows.filter((r) => {
    const y = extractDateYmd(r)
    if (y == null) return false
    return y >= ini && y <= fin
  })
  return { filas, sinColumnaFecha: false }
}

function nombreCliente(clientes, clienteId) {
  if (clienteId == null || clienteId === '') return '—'
  const c = clientes.find((x) => sameId(x.id, clienteId))
  return c ? c.nombre || `#${clienteId}` : `Cliente #${clienteId}`
}

function formatearFechaCorta(ymdStr) {
  if (!ymdStr || ymdStr.length < 10) return ymdStr || '—'
  return formatFechaLegibleEsMx(ymdStr, { day: '2-digit', month: 'short', year: 'numeric' })
}

function diffDiasCalendario(ymdA, ymdB) {
  if (!ymdA || !ymdB || ymdA.length < 10 || ymdB.length < 10) return null
  const [ya, ma, da] = ymdA.slice(0, 10).split('-').map(Number)
  const [yb, mb, db] = ymdB.slice(0, 10).split('-').map(Number)
  const ta = Date.UTC(ya, ma - 1, da)
  const tb = Date.UTC(yb, mb - 1, db)
  return Math.round((tb - ta) / 86400000)
}

/** Igual que el monitor: días en taller solo si la orden no está entregada. */
function diasEnTallerReporte(rep) {
  if (estatusEsEntregado(rep?.estatus)) return null
  const ing = fechaIngresoYmd(rep)
  if (!ing) return null
  const n = diffDiasCalendario(ing, ymdHoyLocal())
  return n == null ? null : Math.max(0, n)
}

function datosEquipoReporte(rep, equipoPorId) {
  const id = rep?.equipo_id
  if (id == null) return { tipo: '—', desc: String(rep?.descripcion_equipo ?? '—') }
  const eq = equipoPorId?.get(String(id))
  const tipo = eq?.tipo_equipo != null && String(eq.tipo_equipo).trim() !== '' ? String(eq.tipo_equipo) : '—'
  const desc =
    rep.descripcion_equipo != null && String(rep.descripcion_equipo).trim() !== ''
      ? String(rep.descripcion_equipo)
      : eq?.descripcion != null
        ? String(eq.descripcion)
        : '—'
  return { tipo, desc }
}

function etiquetaTiposServicioReporte(tiposSet) {
  if (!tiposSet || tiposSet.size === 0) return 'Ningún tipo de servicio'
  const todos =
    TIPOS_SERVICIO_CANONICOS.length > 0 && TIPOS_SERVICIO_CANONICOS.every((t) => tiposSet.has(t))
  if (todos) return 'Todos los tipos de servicio'
  return `Tipos: ${[...tiposSet].join(', ')}`
}

function filasEstiloMonitor(reparaciones, { equipoPorId, cuentaPorReparaId, entregaDesdePagosPorRepara }) {
  return (reparaciones ?? []).map((r) => {
    const rid = String(r.id)
    const cuenta = cuentaPorReparaId?.get(rid) ?? null
    const ymdPago = entregaDesdePagosPorRepara?.get(rid) ?? null
    const ymdIng = fechaIngresoFiltroYmd(r) ?? fechaIngresoYmd(r)
    const ymdEnt = fechaEntregaYmd(r, cuenta, ymdPago)
    const ymdBaja = fechaBajaYmd(r)
    const ent = estatusEsEntregado(r?.estatus)
    const baja = estatusEsBaja(r?.estatus)
    const ymdSalida = ent ? ymdEnt : baja ? ymdBaja : null
    const { tipo, desc } = datosEquipoReporte(r, equipoPorId)
    const tipoCanon = tipoServicioDeRep(r, equipoPorId)
    const folioEpson = String(r?.folio_epson ?? '')
      .trim()
      .replace(/\s+/g, ' ')
    const dias = diasEnTallerReporte(r)
    return {
      rep: r,
      ymdIngreso: ymdIng,
      ymdSalida,
      dias,
      diasTxt: ent ? '✅' : dias == null ? '—' : String(dias),
      tipo,
      desc,
      tipoServicio: tipoCanon ?? '—',
      folioEpson: tipoCanon === TIPO_GARANTIA_EPSON && folioEpson ? folioEpson : '',
      problema: String(r.problemas_reportados ?? '').trim() || '—',
      tecnico: String(r.tecnico ?? '').trim() || '—',
      estatus: String(r.estatus ?? '—').trim() || '—',
      verificada: estaVerificadoEntrega(r),
      notificaciones: contarNotificacionesClienteBitacora(r?.bitacora),
    }
  })
}

function serializarEstadoReporte(estado) {
  return {
    pantalla: estado.pantalla,
    fechaInicio: estado.fechaInicio,
    fechaFin: estado.fechaFin,
    estatusSeleccionados: [...(estado.estatusSeleccionados ?? [])],
    estadisticasDesdeReporte: estado.estadisticasDesdeReporte,
    periodoAplicado: estado.periodoAplicado,
    estatusAplicado: estado.estatusAplicado,
    sinColumnaFecha: estado.sinColumnaFecha,
    duplicadasExcluidas: estado.duplicadasExcluidas,
    reparaciones: estado.reparaciones ?? [],
    busqueda: estado.busqueda ?? '',
    tiposServicioSeleccionados: [...(estado.tiposServicioSeleccionados ?? TIPOS_SERVICIO_CANONICOS)],
    filtroModoFechaIngreso: Boolean(estado.filtroModoFechaIngreso),
    filtroModoFechaEntrega: Boolean(estado.filtroModoFechaEntrega),
    filtroPorEstatus: Boolean(estado.filtroPorEstatus),
    vista: estado.vista === 'tabla' ? 'tabla' : 'lista',
    ordenFecha: estado.ordenFecha === 'asc' ? 'asc' : 'desc',
  }
}

function BadgeEstatusReporte({ fila }) {
  return (
    <span className="monitor-ordenes-estatus-celda">
      <span className={`rep-orden-badge rep-orden-badge--tabla ${claseBadgeEstatusOrden(fila.estatus)}`}>
        {fila.estatus}
      </span>
      {fila.verificada ? (
        <span className="rep-orden-badge rep-orden-badge--tabla rep-orden-badge--verificada">VERIFICADA</span>
      ) : null}
      {fila.notificaciones > 0 ? (
        <span
          className="rep-orden-badge rep-orden-badge--tabla rep-orden-badge--notificada"
          title={`${fila.notificaciones} notificación${fila.notificaciones === 1 ? '' : 'es'} al cliente`}
        >
          NOTIFICACIÓN({fila.notificaciones})
        </span>
      ) : null}
    </span>
  )
}

function CeldaTipoServicioReporte({ fila }) {
  return (
    <div className="monitor-ordenes-tipo-servicio-inner">
      <span className="monitor-ordenes-tipo-servicio-texto">{fila.tipoServicio}</span>
      {fila.folioEpson ? (
        <span
          className="rep-orden-badge rep-orden-badge--tabla rep-orden-badge--folio-epson"
          title={`Folio Epson: ${fila.folioEpson}`}
        >
          Folio {fila.folioEpson}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Reportes de reparaciones por periodo (fecha inicio / fin), resumen y lista, al estilo Android.
 */
export default function ReportesModulo({
  supabase,
  onHome,
  onError,
  onNotice,
  onAbrirOrden,
  puedeElegirRangoFechas = false,
  estadoRestaurar = null,
  onEstadoRestaurado,
}) {
  const { alertaPermiso, mostrarSinPermiso } = usePermisoEliminar(puedeElegirRangoFechas)
  const avisarSinPermisoFecha = () => mostrarSinPermiso(MENSAJE_SIN_PERMISO_FECHAS)

  const [pantalla, setPantalla] = useState('fechas')
  const [fechaInicio, setFechaInicio] = useState(() => (puedeElegirRangoFechas ? ymdInicioMes() : ymdHoy()))
  const [fechaFin, setFechaFin] = useState(ymdHoy)
  const [estatusSeleccionados, setEstatusSeleccionados] = useState(() => crearSetEstatusTodos())
  const [estadisticasDesdeReporte, setEstadisticasDesdeReporte] = useState(false)
  const [periodoAplicado, setPeriodoAplicado] = useState(null)
  const [estatusAplicado, setEstatusAplicado] = useState('')
  const [sinColumnaFecha, setSinColumnaFecha] = useState(false)
  const [duplicadasExcluidas, setDuplicadasExcluidas] = useState(0)

  const [reparaciones, setReparaciones] = useState([])
  const [equipos, setEquipos] = useState([])
  const [clientes, setClientes] = useState([])
  const [cuentaPorReparaId, setCuentaPorReparaId] = useState(() => new Map())
  const [entregaDesdePagosPorRepara, setEntregaDesdePagosPorRepara] = useState(() => new Map())
  const [loading, setLoading] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [tiposServicioSeleccionados, setTiposServicioSeleccionados] = useState(
    () => new Set(TIPOS_SERVICIO_CANONICOS),
  )
  const [filtroModoFechaIngreso, setFiltroModoFechaIngreso] = useState(true)
  const [filtroModoFechaEntrega, setFiltroModoFechaEntrega] = useState(true)
  const [filtroPorEstatus, setFiltroPorEstatus] = useState(false)
  const [vista, setVista] = useState(leerVistaReportes)
  const [ordenFecha, setOrdenFecha] = useState(leerOrdenFechaReportes)
  const omitirResetFechasRef = useRef(false)

  function cambiarVista(modo) {
    setVista(modo)
    try {
      localStorage.setItem(LS_VISTA_REPORTES, modo)
    } catch {
      /* ignore */
    }
  }

  function cambiarOrdenFecha(valor) {
    const orden = valor === 'asc' ? 'asc' : 'desc'
    setOrdenFecha(orden)
    try {
      localStorage.setItem(LS_ORDEN_FECHA_REPORTES, orden)
    } catch {
      /* ignore */
    }
  }

  function abrirOrden(rep) {
    if (!onAbrirOrden || rep?.id == null) return
    const c = clientes.find((x) => sameId(x.id, rep.cliente_id)) ?? {}
    const eq = equipos.find((x) => sameId(x.id, rep.equipo_id)) ?? {}
    onAbrirOrden({
      clienteId: rep.cliente_id ?? c.id ?? null,
      clienteNombre: c.nombre ?? '',
      clienteTelefono: c.telefono ?? '',
      clienteDomicilio: c.domicilio ?? '',
      clienteCorreo: c.correo ?? '',
      equipoId: rep.equipo_id ?? eq.id ?? null,
      equipoSerie: eq.serie ?? '',
      equipoTipo: eq.tipo_equipo ?? '',
      equipoDescripcion: rep.descripcion_equipo ?? eq.descripcion ?? '',
      equipoTipoReparacion: rep.tipo_reparacion ?? eq.tipo_reparacion ?? '',
      reparacionId: rep.id != null ? String(rep.id) : '',
      returnToReportes: serializarEstadoReporte({
        pantalla,
        fechaInicio,
        fechaFin,
        estatusSeleccionados,
        estadisticasDesdeReporte,
        periodoAplicado,
        estatusAplicado,
        sinColumnaFecha,
        duplicadasExcluidas,
        reparaciones,
        busqueda,
        tiposServicioSeleccionados,
        filtroModoFechaIngreso,
        filtroModoFechaEntrega,
        filtroPorEstatus,
        vista,
        ordenFecha,
      }),
    })
  }

  function onOrdenKeyDown(e, rep) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      abrirOrden(rep)
    }
  }

  const cargarClientes = useCallback(async () => {
    try {
      if (supabase) {
        const { data, error } = await supabase.from('clientes').select('*').order('id', { ascending: false })
        if (error) throw error
        setClientes((data ?? []).map((r) => normalizeClienteRow(r)))
      } else {
        setClientes(readLs(LS_CLIENTES, []).map((r) => normalizeClienteRow(r)))
      }
    } catch (e) {
      onError?.(`Error al cargar clientes: ${e.message}`)
      setClientes([])
    }
  }, [supabase, onError])

  useEffect(() => {
    void cargarClientes()
  }, [cargarClientes])

  useEffect(() => {
    if (!estadoRestaurar) return
    setPantalla(estadoRestaurar.pantalla === 'estadisticas' ? 'estadisticas' : estadoRestaurar.pantalla === 'resultados' ? 'resultados' : 'fechas')
    if (estadoRestaurar.fechaInicio) setFechaInicio(estadoRestaurar.fechaInicio)
    if (estadoRestaurar.fechaFin) setFechaFin(estadoRestaurar.fechaFin)
    if (Array.isArray(estadoRestaurar.estatusSeleccionados)) {
      setEstatusSeleccionados(new Set(estadoRestaurar.estatusSeleccionados))
    }
    setEstadisticasDesdeReporte(Boolean(estadoRestaurar.estadisticasDesdeReporte))
    setPeriodoAplicado(estadoRestaurar.periodoAplicado ?? null)
    setEstatusAplicado(estadoRestaurar.estatusAplicado ?? '')
    setSinColumnaFecha(Boolean(estadoRestaurar.sinColumnaFecha))
    setDuplicadasExcluidas(Number(estadoRestaurar.duplicadasExcluidas ?? 0))
    setReparaciones(Array.isArray(estadoRestaurar.reparaciones) ? estadoRestaurar.reparaciones : [])
    setBusqueda(String(estadoRestaurar.busqueda ?? ''))
    if (Array.isArray(estadoRestaurar.tiposServicioSeleccionados)) {
      setTiposServicioSeleccionados(new Set(estadoRestaurar.tiposServicioSeleccionados))
    }
    setFiltroModoFechaIngreso(Boolean(estadoRestaurar.filtroModoFechaIngreso))
    setFiltroModoFechaEntrega(Boolean(estadoRestaurar.filtroModoFechaEntrega))
    setFiltroPorEstatus(
      Boolean(estadoRestaurar.filtroPorEstatus) ||
        (!estadoRestaurar.filtroModoFechaIngreso && !estadoRestaurar.filtroModoFechaEntrega),
    )
    if (estadoRestaurar.vista === 'tabla' || estadoRestaurar.vista === 'lista') {
      setVista(estadoRestaurar.vista)
    }
    if (estadoRestaurar.ordenFecha === 'asc' || estadoRestaurar.ordenFecha === 'desc') {
      setOrdenFecha(estadoRestaurar.ordenFecha)
    }
    omitirResetFechasRef.current = true
    onEstadoRestaurado?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- restauración única al volver desde orden
  }, [estadoRestaurar])

  useEffect(() => {
    if (puedeElegirRangoFechas || omitirResetFechasRef.current) return
    const hoy = ymdHoy()
    setFechaInicio(hoy)
    setFechaFin(hoy)
  }, [puedeElegirRangoFechas])

  const cargarEquipos = useCallback(async () => {
    try {
      if (supabase) {
        const { data, error } = await supabase.from('equipos').select('*')
        if (error) throw error
        setEquipos(data ?? [])
      } else {
        setEquipos(readLs(LS_EQUIPOS, []))
      }
    } catch (e) {
      onError?.(`Error al cargar equipos: ${e.message}`)
      setEquipos([])
    }
  }, [supabase, onError])

  useEffect(() => {
    void cargarEquipos()
  }, [cargarEquipos])

  const cargarDatosPeriodo = useCallback(
    async (ini, fin, estatusSet, modos = {}, { limpiarBusqueda = false } = {}) => {
      setLoading(true)
      setSinColumnaFecha(false)
      try {
        let todos = []
        let cuentas = []
        if (supabase) {
          const [todosRep, todasCuentas] = await Promise.all([
            fetchAllRows(() => supabase.from('reparaciones').select('*').order('id', { ascending: false })),
            fetchAllRows(() => supabase.from('cuentas').select('*').order('id', { ascending: true })).catch(() => []),
          ])
          todos = todosRep
          cuentas = todasCuentas
        } else {
          todos = readLs(LS_REP, [])
          cuentas = readLs(LS_CUENTAS, [])
        }

        const pagosTodos = await cargarTodosPagosClientes(supabase)
        const mapsEntrega = mapsFechasEntregaReporte(cuentas, pagosTodos)
        const incluirIngreso = Boolean(modos.incluirIngreso)
        const incluirEntrega = Boolean(modos.incluirEntrega)
        const incluirEstatus = Boolean(modos.incluirEstatus)
        const porFiltro = filtrarReparacionesParaReporte(todos, {
          estatusSet,
          ini,
          fin,
          incluirIngreso,
          incluirEntrega,
          incluirEstatus,
          cuentaPorReparaId: mapsEntrega.cuentaPorReparaId,
          entregaDesdePagosPorRepara: mapsEntrega.entregaDesdePagosPorRepara,
        })
        const nDup = contarOrdenesDuplicadas(porFiltro)
        const filas = excluirOrdenesDuplicadas(porFiltro)
        setReparaciones(filas)
        setCuentaPorReparaId(mapsEntrega.cuentaPorReparaId)
        setEntregaDesdePagosPorRepara(mapsEntrega.entregaDesdePagosPorRepara)

        setDuplicadasExcluidas(nDup)
        setSinColumnaFecha(false)
        setPeriodoAplicado({
          ini,
          fin,
          incluirIngreso,
          incluirEntrega,
          incluirEstatus,
          estatusSet: [...(estatusSet ?? [])],
        })
        setEstatusAplicado(
          etiquetaFiltrosReporteAplicados({
            incluirIngreso,
            incluirEntrega,
            incluirEstatus,
            estatusSet,
          }),
        )
        if (limpiarBusqueda) setBusqueda('')
        if (nDup > 0) {
          onNotice?.(
            nDup === 1
              ? 'Se excluyó 1 orden marcada como duplicada del reporte y las estadísticas.'
              : `Se excluyeron ${nDup} órdenes marcadas como duplicadas del reporte y las estadísticas.`,
          )
        }
        return true
      } catch (e) {
        onError?.(`Error al cargar datos: ${e.message}`)
        setReparaciones([])
        setCuentaPorReparaId(new Map())
        setEntregaDesdePagosPorRepara(new Map())
        return false
      } finally {
        setLoading(false)
      }
    },
    [supabase, onError, onNotice],
  )

  const rangoInvalido = Boolean(fechaInicio && fechaFin && fechaInicio > fechaFin)
  const modosFiltro = {
    incluirIngreso: filtroModoFechaIngreso,
    incluirEntrega: filtroModoFechaEntrega,
    incluirEstatus: filtroPorEstatus,
  }
  const filtrosListos =
    !rangoInvalido &&
    Boolean(fechaInicio.trim() && fechaFin.trim()) &&
    (filtroModoFechaIngreso || filtroModoFechaEntrega || (filtroPorEstatus && estatusSeleccionados.size > 0))

  function resetModosFechaDefault() {
    setFiltroModoFechaIngreso(true)
    setFiltroModoFechaEntrega(true)
    setFiltroPorEstatus(false)
  }

  function toggleModoFechaIngreso() {
    setFiltroModoFechaIngreso((prev) => !prev)
  }

  function toggleModoFechaEntrega() {
    setFiltroModoFechaEntrega((prev) => !prev)
  }

  function toggleFiltroPorEstatus() {
    setFiltroPorEstatus((prev) => !prev)
  }

  function soloFiltroEstatus() {
    setFiltroPorEstatus(true)
    setFiltroModoFechaIngreso(false)
    setFiltroModoFechaEntrega(false)
  }

  function soloModoFechaIngreso() {
    setFiltroModoFechaIngreso(true)
    setFiltroModoFechaEntrega(false)
    setFiltroPorEstatus(false)
  }

  function soloModoFechaEntrega() {
    setFiltroModoFechaIngreso(false)
    setFiltroModoFechaEntrega(true)
    setFiltroPorEstatus(false)
  }

  function validarFiltros() {
    const hoy = ymdHoy()
    const { ini, fin } = rangoFechasPermitidoUsuario(puedeElegirRangoFechas, fechaInicio.trim(), fechaFin.trim(), hoy)
    if (!ini || !fin) {
      onError?.('Indique fecha inicio y fecha fin')
      return null
    }
    if (ini > fin) {
      onError?.('La fecha inicio no puede ser posterior a la fecha fin')
      return null
    }
    if (!filtroModoFechaIngreso && !filtroModoFechaEntrega && !filtroPorEstatus) {
      onError?.('Seleccione al menos un filtro: equipos que entraron, equipos que salieron o filtrar por estatus')
      return null
    }
    if (filtroPorEstatus && estatusSeleccionados.size === 0 && !filtroModoFechaIngreso && !filtroModoFechaEntrega) {
      onError?.('Seleccione al menos un estatus')
      return null
    }
    return { ini, fin, modos: modosFiltro }
  }

  async function onGenerarReporte() {
    const rango = validarFiltros()
    if (!rango) return
    const ok = await cargarDatosPeriodo(rango.ini, rango.fin, estatusSeleccionados, rango.modos, {
      limpiarBusqueda: true,
    })
    if (ok) {
      setEstadisticasDesdeReporte(false)
      setPantalla('resultados')
    }
  }

  async function onVerEstadisticas() {
    const rango = validarFiltros()
    if (!rango) return
    const ok = await cargarDatosPeriodo(rango.ini, rango.fin, estatusSeleccionados, rango.modos, {
      limpiarBusqueda: true,
    })
    if (ok) {
      setEstadisticasDesdeReporte(false)
      setPantalla('estadisticas')
    }
  }

  async function onActualizarReporte() {
    const rango = validarFiltros()
    if (!rango) return
    await cargarDatosPeriodo(rango.ini, rango.fin, estatusSeleccionados, rango.modos)
  }

  async function onActualizarEstadisticas() {
    const rango = validarFiltros()
    if (!rango) return
    await cargarDatosPeriodo(rango.ini, rango.fin, estatusSeleccionados, rango.modos)
  }

  function onVerEstadisticasDelPeriodo() {
    setEstadisticasDesdeReporte(true)
    setPantalla('estadisticas')
  }

  const equipoPorId = useMemo(() => {
    const m = new Map()
    for (const eq of equipos) {
      if (eq?.id != null) m.set(String(eq.id), eq)
    }
    return m
  }, [equipos])

  const filtrados = useMemo(() => {
    let filas = reparaciones

    if (tiposServicioSeleccionados.size === 0) {
      filas = []
    } else {
      const todosTipos =
        TIPOS_SERVICIO_CANONICOS.length > 0 &&
        TIPOS_SERVICIO_CANONICOS.every((t) => tiposServicioSeleccionados.has(t))
      if (!todosTipos) {
        filas = filas.filter((r) => {
          const tipoCanon = tipoServicioDeRep(r, equipoPorId, { usarEquipoSiFalta: true })
          return tipoCanon != null && tiposServicioSeleccionados.has(tipoCanon)
        })
      }
    }

    return ordenarReparacionesPorFecha(filas, ordenFecha)
  }, [reparaciones, tiposServicioSeleccionados, equipoPorId, ordenFecha])

  const kpisSeleccion = useMemo(
    () => kpisSeleccionReporte({ reparaciones: filtrados, periodo: periodoAplicado }),
    [filtrados, periodoAplicado],
  )

  const filasVista = useMemo(
    () =>
      filasEstiloMonitor(filtrados, {
        equipoPorId,
        cuentaPorReparaId,
        entregaDesdePagosPorRepara,
      }),
    [filtrados, equipoPorId, cuentaPorReparaId, entregaDesdePagosPorRepara],
  )

  const resumenListado = useMemo(() => {
    const partes = []
    if (estatusAplicado) partes.push(estatusAplicado)
    partes.push(etiquetaTiposServicioReporte(tiposServicioSeleccionados))
    return partes.join(' · ')
  }, [estatusAplicado, tiposServicioSeleccionados])

  function volverAElegirFechas() {
    setPantalla('fechas')
    setEstadisticasDesdeReporte(false)
    setReparaciones([])
    setCuentaPorReparaId(new Map())
    setEntregaDesdePagosPorRepara(new Map())
    setPeriodoAplicado(null)
    setEstatusAplicado('')
    setSinColumnaFecha(false)
    setDuplicadasExcluidas(0)
    setBusqueda('')
    setTiposServicioSeleccionados(new Set(TIPOS_SERVICIO_CANONICOS))
    resetModosFechaDefault()
    const hoy = ymdHoy()
    if (puedeElegirRangoFechas) {
      setFechaInicio(ymdInicioMes())
      setFechaFin(hoy)
    } else {
      setFechaInicio(hoy)
      setFechaFin(hoy)
    }
  }

  const propsFiltrosReporte = {
    fechaInicio,
    fechaFin,
    onFechaInicio: setFechaInicio,
    onFechaFin: setFechaFin,
    estatusSeleccionados,
    onEstatusSeleccionados: setEstatusSeleccionados,
    filtroModoFechaIngreso,
    filtroModoFechaEntrega,
    filtroPorEstatus,
    onToggleModoFechaIngreso: toggleModoFechaIngreso,
    onToggleModoFechaEntrega: toggleModoFechaEntrega,
    onToggleFiltroPorEstatus: toggleFiltroPorEstatus,
    onSoloFiltroEstatus: soloFiltroEstatus,
    onSoloModoFechaIngreso: soloModoFechaIngreso,
    onSoloModoFechaEntrega: soloModoFechaEntrega,
    tiposServicioSeleccionados,
    onTiposServicioSeleccionados: setTiposServicioSeleccionados,
    rangoInvalido,
    puedeCambiarFechas: puedeElegirRangoFechas,
    onIntentoSinPermisoFecha: avisarSinPermisoFecha,
  }

  if (pantalla === 'estadisticas') {
    return (
      <>
      <AlertaPermiso mensaje={alertaPermiso} />
      <ReportesEstadisticasView
        reparaciones={filtrados}
        periodoAplicado={periodoAplicado}
        estatusAplicado={estatusAplicado}
        formatearFechaCorta={formatearFechaCorta}
        soloPeriodo={estadisticasDesdeReporte}
        duplicadasExcluidas={duplicadasExcluidas}
        loading={loading}
        onVolver={estadisticasDesdeReporte ? () => setPantalla('resultados') : volverAElegirFechas}
        onHome={onHome}
        filtrosSlot={
          !estadisticasDesdeReporte ? (
            <ReportesFiltrosCard {...propsFiltrosReporte}>
              <button
                type="button"
                className="btn-agregar-equipo btn-consultar-corte-caja"
                onClick={() => void onActualizarEstadisticas()}
                disabled={loading || !filtrosListos}
              >
                {loading ? 'Actualizando…' : 'ACTUALIZAR GRÁFICAS'}
              </button>
            </ReportesFiltrosCard>
          ) : null
        }
      />
      </>
    )
  }

  async function abrirPdfReporte() {
    if (!periodoAplicado || filtrados.length === 0) {
      onError?.('No hay datos del reporte para abrir.')
      return
    }
    try {
      const { abrirReporteReparacionesPdf } = await import('./reporteReparacionesPdf.js')
      abrirReporteReparacionesPdf({
        periodo: periodoAplicado,
        formatearFechaCorta,
        estatusFiltro: [estatusAplicado || 'Ninguno', etiquetaTiposServicioReporte(tiposServicioSeleccionados)].join(' · '),
        kpis: kpisSeleccion,
        filas: filasVista.map((f) => ({
          ingreso: f.ymdIngreso ? formatearFechaCorta(f.ymdIngreso) : '—',
          salida: f.ymdSalida ? formatearFechaCorta(f.ymdSalida) : '—',
          dias: f.diasTxt,
          orden: String(f.rep.id ?? '—'),
          cliente: nombreCliente(clientes, f.rep.cliente_id),
          equipo: f.tipo,
          servicio: f.folioEpson ? `${f.tipoServicio} (${f.folioEpson})` : f.tipoServicio,
          descripcion: f.desc,
          problema: f.problema,
          tecnico: f.tecnico,
          estatus: f.verificada ? `${f.estatus} · VERIFICADA` : f.estatus,
        })),
      })
    } catch (e) {
      onError?.(`No se pudo abrir el PDF del reporte: ${e?.message ?? e}`)
    }
  }

  if (pantalla === 'fechas') {
    return (
      <div className="servicios-root inventarios-root reportes-modulo-root">
        <AlertaPermiso mensaje={alertaPermiso} />
        <header className="servicios-appbar">
          <button type="button" className="icon-back" onClick={onHome} aria-label="Atrás">
            ←
          </button>
          <h1 className="servicios-appbar-title">
            <span className="appbar-title-emoji" aria-hidden="true">📊</span>
            Reportes
          </h1>
          {onHome ? (
            <button type="button" className="appbar-text-btn appbar-text-btn--narrow" onClick={onHome}>
              Inicio
            </button>
          ) : (
            <span className="servicios-appbar-placeholder" aria-hidden />
          )}
        </header>
        <div className="servicios-body corte-caja-body reportes-body">
          <ReportesFiltrosCard {...propsFiltrosReporte}>
            <div className="reportes-inicio-acciones">
              <button
                type="button"
                className="btn-agregar-equipo btn-consultar-corte-caja"
                onClick={() => void onGenerarReporte()}
                disabled={loading || !filtrosListos}
              >
                {loading ? '⏳ Generando…' : '📋 GENERAR REPORTE'}
              </button>
              <button
                type="button"
                className="btn-agregar-equipo btn-ver-estadisticas"
                onClick={() => void onVerEstadisticas()}
                disabled={loading || !filtrosListos}
              >
                {loading ? '⏳ Cargando…' : '📈 VER ESTADÍSTICAS'}
              </button>
            </div>
          </ReportesFiltrosCard>
        </div>
      </div>
    )
  }

  return (
    <div className="servicios-root inventarios-root reportes-modulo-root">
      <AlertaPermiso mensaje={alertaPermiso} />
      <header className="servicios-appbar">
        <button type="button" className="icon-back" onClick={volverAElegirFechas} aria-label="Atrás">
          ←
        </button>
        <h1 className="servicios-appbar-title">
          <span className="appbar-title-emoji" aria-hidden="true">📊</span>
          Reportes
        </h1>
        {onHome ? (
          <button type="button" className="appbar-text-btn appbar-text-btn--narrow" onClick={onHome}>
            Inicio
          </button>
        ) : (
          <span className="servicios-appbar-placeholder" aria-hidden />
        )}
      </header>

      <div className="servicios-body corte-caja-body reportes-body">
        {periodoAplicado ? (
          <div className="corte-caja-periodo-banner card-pad" role="status">
            <span className="corte-caja-periodo-ico" aria-hidden="true">
              📆
            </span>
            <span>
              <strong>Periodo:</strong> {formatearFechaCorta(periodoAplicado.ini)} —{' '}
              {formatearFechaCorta(periodoAplicado.fin)}
              {estatusAplicado ? (
                <>
                  {' '}
                  · <strong>Filtros:</strong> {estatusAplicado}
                </>
              ) : null}
            </span>
          </div>
        ) : null}

        {sinColumnaFecha ? (
          <p className="corte-caja-warning-inset card-pad">
            <span aria-hidden="true">⚠️</span> Las órdenes no incluyen fecha reconocible; se listaron todas para el
            reporte.
          </p>
        ) : null}

        {duplicadasExcluidas > 0 ? (
          <p className="reportes-aviso-duplicadas card-pad" role="status">
            <span aria-hidden="true">🔄</span> Se excluyeron <strong>{duplicadasExcluidas}</strong>{' '}
            {duplicadasExcluidas === 1 ? 'orden duplicada' : 'órdenes duplicadas'} del reporte y las estadísticas.
          </p>
        ) : null}

        {!loading ? <ReportesKpisSeleccion kpis={kpisSeleccion} /> : null}

        <ReportesFiltrosCard {...propsFiltrosReporte}>
          <button
            type="button"
            className="btn-agregar-equipo btn-consultar-corte-caja"
            onClick={() => void onActualizarReporte()}
            disabled={loading || !filtrosListos}
          >
            {loading ? 'Actualizando…' : 'ACTUALIZAR REPORTE'}
          </button>
        </ReportesFiltrosCard>

        <div className="reportes-acciones-row">
          <button
            type="button"
            className="btn-agregar-equipo btn-ver-estadisticas"
            onClick={onVerEstadisticasDelPeriodo}
            disabled={loading || filtrados.length === 0}
          >
            📈 Ver estadísticas del periodo
          </button>
          <button
            type="button"
            className="btn-agregar-equipo btn-imprimir-corte-caja"
            onClick={() => void abrirPdfReporte()}
            disabled={loading || filtrados.length === 0}
          >
            📄 ABRIR PDF
          </button>
        </div>

        <div className="inventario-vista-bar card-pad" role="group" aria-label="Modo de visualización">
          <span className="inventario-vista-label">Ver como:</span>
          <div className="inventario-vista-toggle">
            <button
              type="button"
              className={`inventario-vista-btn${vista === 'lista' ? ' activo' : ''}`}
              onClick={() => cambiarVista('lista')}
              aria-pressed={vista === 'lista'}
            >
              📋 Lista
            </button>
            <button
              type="button"
              className={`inventario-vista-btn${vista === 'tabla' ? ' activo' : ''}`}
              onClick={() => cambiarVista('tabla')}
              aria-pressed={vista === 'tabla'}
            >
              ▦ Tabla
            </button>
          </div>
          <div className="corte-caja-vista-opciones">
            <label className="corte-caja-orden-fecha">
              <span className="inventario-vista-label">Orden:</span>
              <select
                value={ordenFecha}
                onChange={(e) => cambiarOrdenFecha(e.target.value)}
                aria-label="Ordenar órdenes por fecha"
              >
                <option value="asc">Más antiguo primero</option>
                <option value="desc">Más nuevo primero</option>
              </select>
            </label>
          </div>
        </div>

        {loading ? (
          <p className="muted center">Cargando…</p>
        ) : (
          <section className="monitor-ordenes-resultados reportes-resultados-monitor">
            <p className="monitor-ordenes-conteo" role="status" aria-live="polite">
              <span className="monitor-ordenes-conteo-icon" aria-hidden="true">
                📋
              </span>
              <span className="monitor-ordenes-conteo-num">{filasVista.length}</span>
              <span className="monitor-ordenes-conteo-cuerpo">
                <span className="monitor-ordenes-conteo-texto">
                  {filasVista.length === 1 ? 'orden encontrada' : 'órdenes encontradas'}
                </span>
                <span className="monitor-ordenes-conteo-resumen">{resumenListado}</span>
              </span>
            </p>

            {filasVista.length === 0 ? (
              <div className="monitor-ordenes-vacio-card empty-card">
                <p>
                  {sinColumnaFecha
                    ? 'No hay órdenes'
                    : 'No hay órdenes con los filtros seleccionados.'}
                </p>
              </div>
            ) : vista === 'tabla' ? (
              <TablaScrollSuperior
                ariaLabel="Órdenes del reporte en tabla"
                classNameWrap="cuentas-cliente-tabla-wrap monitor-ordenes-tabla-wrap"
                syncDeps={[vista, filasVista, loading, ordenFecha]}
              >
                <table className="cuentas-cliente-tabla monitor-ordenes-tabla">
                  <thead>
                    <tr>
                      <th>Fecha ingreso</th>
                      <th>Fecha entrega / baja</th>
                      <th>Días</th>
                      <th>No. orden</th>
                      <th>Cliente</th>
                      <th>Equipo</th>
                      <th>Servicio</th>
                      <th>Descripción</th>
                      <th>Problema</th>
                      <th>Técnico</th>
                      <th>Estatus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasVista.map((f) => {
                      const r = f.rep
                      const puedeAbrir = Boolean(onAbrirOrden && r.id != null)
                      return (
                        <tr
                          key={r.id}
                          className={`monitor-ordenes-tabla-fila${puedeAbrir ? ' monitor-ordenes-tabla-fila--clic' : ''}${f.verificada ? ' monitor-ordenes-tabla-fila--verificada' : ''}`}
                          title={puedeAbrir ? `Abrir orden #${r.id}` : undefined}
                          onClick={puedeAbrir ? () => abrirOrden(r) : undefined}
                          onKeyDown={puedeAbrir ? (e) => onOrdenKeyDown(e, r) : undefined}
                          tabIndex={puedeAbrir ? 0 : undefined}
                          role={puedeAbrir ? 'button' : undefined}
                        >
                          <td className="monitor-ordenes-fecha-ingreso cuentas-cliente-tabla-fecha">
                            {f.ymdIngreso ? formatearFechaCorta(f.ymdIngreso) : '—'}
                          </td>
                          <td
                            className={`monitor-ordenes-fecha-entrega-celda cuentas-cliente-tabla-fecha${f.ymdSalida ? ' cuentas-cliente-tabla-fecha--entrega' : ''}`}
                          >
                            {f.ymdSalida ? formatearFechaCorta(f.ymdSalida) : '—'}
                          </td>
                          <td
                            className={`monitor-ordenes-dias${estatusEsEntregado(r?.estatus) ? ' monitor-ordenes-dias--entregado' : ''}`}
                            title={
                              estatusEsEntregado(r?.estatus)
                                ? 'Entregado'
                                : f.dias == null
                                  ? 'Sin fecha de ingreso'
                                  : `${f.dias} días en taller`
                            }
                          >
                            {f.diasTxt}
                          </td>
                          <td className="monitor-ordenes-num cuentas-cliente-tabla-orden">{r.id ?? '—'}</td>
                          <td className="monitor-ordenes-col-cliente">{nombreCliente(clientes, r.cliente_id)}</td>
                          <td>{f.tipo}</td>
                          <td className="monitor-ordenes-tipo-servicio">
                            <CeldaTipoServicioReporte fila={f} />
                          </td>
                          <td className="monitor-ordenes-col-texto">{f.desc}</td>
                          <td className="monitor-ordenes-col-texto">{f.problema}</td>
                          <td>{f.tecnico}</td>
                          <td>
                            <BadgeEstatusReporte fila={f} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TablaScrollSuperior>
            ) : (
              <ul className="equipo-list inventario-list reportes-lista">
                {filasVista.map((f) => {
                  const r = f.rep
                  const puedeAbrir = Boolean(onAbrirOrden && r.id != null)
                  return (
                    <li
                      key={r.id}
                      className={`equipo-card inventario-card reportes-card${puedeAbrir ? ' reportes-card--clic' : ' corte-caja-card--solo-lectura'}${f.verificada ? ' reportes-card--verificada' : ''}`}
                    >
                      <button
                        type="button"
                        className={`equipo-card-main inventario-card-main reportes-fila${puedeAbrir ? ' reportes-fila--clic' : ''}`}
                        disabled={!puedeAbrir}
                        title={puedeAbrir ? `Abrir orden #${r.id}` : undefined}
                        onClick={() => abrirOrden(r)}
                      >
                        <strong>
                          <span aria-hidden="true">📋</span> Orden #{r.id}
                        </strong>
                        <span className="reportes-cliente-lista">
                          <span aria-hidden="true">👤</span> {nombreCliente(clientes, r.cliente_id)}
                        </span>
                        <BadgeEstatusReporte fila={f} />
                        <span className="muted small reportes-meta-lista">
                          <span aria-hidden="true">📅</span> Ingreso:{' '}
                          {f.ymdIngreso ? formatearFechaCorta(f.ymdIngreso) : '—'}
                          {' · '}
                          Entrega/baja: {f.ymdSalida ? formatearFechaCorta(f.ymdSalida) : '—'}
                          {' · '}
                          Días: {f.diasTxt}
                        </span>
                        <span className="muted small">
                          <span aria-hidden="true">🖨️</span> {f.tipo} · {f.tipoServicio}
                          {f.folioEpson ? ` · Folio ${f.folioEpson}` : ''}
                        </span>
                        <span className="muted small reportes-meta-lista">{f.desc}</span>
                        <span className="muted small reportes-meta-lista">
                          <span aria-hidden="true">⚠️</span> {f.problema}
                        </span>
                        <span className="muted small">
                          <span aria-hidden="true">🔧</span> Técnico: {f.tecnico}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
