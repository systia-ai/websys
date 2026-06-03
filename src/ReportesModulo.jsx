/* eslint-disable react-hooks/set-state-in-effect -- carga inicial de clientes */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { normalizeClienteRow, sameId } from './clienteUtils.js'
import ReportesEstadisticasView from './ReportesEstadisticasView.jsx'
import ReportesFiltrosCard from './ReportesFiltrosCard.jsx'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'
import {
  aYmdLocalDesdeRaw,
  formatFechaLegibleEsMx,
  TIPOS_SERVICIO_CANONICOS,
  tipoServicioDeRep,
  ymdHoyLocal,
  ymdLocalDesdeDate,
} from './reparacionUtils.js'
import {
  crearSetEstatusTodos,
  contarOrdenesDuplicadas,
  excluirOrdenesDuplicadas,
  labelEstatusAplicados,
  filtrarReparacionesParaReporte,
  mapsFechasEntregaReporte,
} from './reportesFiltros.js'
import {
  aplicarFiltroPagosPorFechas,
  cargarCuentasMapParaPagos,
  cargarTodosPagosClientes,
} from './pagosClientesUtils.js'
import { extractFechaPagoYmd, normalizarLabelEstatus, totalPagosEnLista } from './reportesEstadisticas.js'

const LS_VISTA_REPORTES = 'sistefix_reportes_vista'

function leerVistaReportes() {
  try {
    return localStorage.getItem(LS_VISTA_REPORTES) === 'tabla' ? 'tabla' : 'lista'
  } catch {
    return 'lista'
  }
}

const LS_REP = 'sistefix_local_reparaciones'
const LS_CLIENTES = 'sistefix_local_clientes'
const LS_EQUIPOS = 'sistefix_local_equipos'
const LS_PAGOS = 'sistefix_local_pagosclientes'
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
  if (!ymdStr || ymdStr.length < 10) return ymdStr
  return formatFechaLegibleEsMx(ymdStr, { day: '2-digit', month: 'short', year: 'numeric' })
}

function esEntregada(rep) {
  return /ENTREGAD/i.test(String(rep?.estatus ?? ''))
}

/**
 * Reportes de reparaciones por periodo (fecha inicio / fin), resumen y lista, al estilo Android.
 */
export default function ReportesModulo({ supabase, onHome, onError, onNotice }) {
  const [pantalla, setPantalla] = useState('fechas')
  const [fechaInicio, setFechaInicio] = useState(ymdInicioMes)
  const [fechaFin, setFechaFin] = useState(ymdHoy)
  const [estatusSeleccionados, setEstatusSeleccionados] = useState(() => crearSetEstatusTodos())
  const [estadisticasDesdeReporte, setEstadisticasDesdeReporte] = useState(false)
  const [periodoAplicado, setPeriodoAplicado] = useState(null)
  const [estatusAplicado, setEstatusAplicado] = useState('')
  const [sinColumnaFecha, setSinColumnaFecha] = useState(false)
  const [duplicadasExcluidas, setDuplicadasExcluidas] = useState(0)

  const [reparaciones, setReparaciones] = useState([])
  const [equipos, setEquipos] = useState([])
  const [pagosPeriodo, setPagosPeriodo] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [tiposServicioSeleccionados, setTiposServicioSeleccionados] = useState(
    () => new Set(TIPOS_SERVICIO_CANONICOS),
  )
  const [filtroModoFechaIngreso, setFiltroModoFechaIngreso] = useState(false)
  const [filtroModoFechaEntrega, setFiltroModoFechaEntrega] = useState(false)
  const [vista, setVista] = useState(leerVistaReportes)

  function cambiarVista(modo) {
    setVista(modo)
    try {
      localStorage.setItem(LS_VISTA_REPORTES, modo)
    } catch {
      /* ignore */
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
    async (ini, fin, estatusSet, modoFecha = null) => {
      setLoading(true)
      setSinColumnaFecha(false)
      try {
        let todos = []
        let cuentas = []
        if (supabase) {
          const [rRep, rCuentas] = await Promise.all([
            supabase.from('reparaciones').select('*').order('id', { ascending: false }),
            supabase.from('cuentas').select('*'),
          ])
          if (rRep.error) throw rRep.error
          todos = rRep.data ?? []
          if (!rCuentas.error) cuentas = rCuentas.data ?? []
        } else {
          todos = readLs(LS_REP, [])
          cuentas = readLs(LS_CUENTAS, [])
        }

        const pagosTodos = await cargarTodosPagosClientes(supabase)
        const { cuentaPorReparaId, entregaDesdePagosPorRepara } = mapsFechasEntregaReporte(
          cuentas,
          pagosTodos,
        )
        const porFiltro = filtrarReparacionesParaReporte(todos, {
          estatusSet,
          ini,
          fin,
          modoFecha,
          cuentaPorReparaId,
          entregaDesdePagosPorRepara,
        })
        const nDup = contarOrdenesDuplicadas(porFiltro)
        const filas = excluirOrdenesDuplicadas(porFiltro)
        setReparaciones(filas)

        const cuentasMap = supabase ? await cargarCuentasMapParaPagos(supabase) : new Map()
        const { filas: pagosFiltrados, sinFechaIncluidos } = aplicarFiltroPagosPorFechas(
          pagosTodos,
          ini,
          fin,
          cuentasMap,
        )
        setPagosPeriodo(pagosFiltrados)
        if (sinFechaIncluidos > 0) {
          onNotice?.(
            sinFechaIncluidos === 1
              ? '1 pago sin fecha exacta se incluyó en ingresos del periodo (fecha tomada de la cuenta).'
              : `${sinFechaIncluidos} pagos sin fecha exacta se incluyeron en ingresos del periodo.`,
          )
        }

        setDuplicadasExcluidas(nDup)
        setSinColumnaFecha(false)
        setPeriodoAplicado({ ini, fin })
        const etiquetaFiltro =
          modoFecha === 'ingreso'
            ? 'Fecha ingresado'
            : modoFecha === 'entrega'
              ? 'Fecha entrega'
              : labelEstatusAplicados(estatusSet)
        setEstatusAplicado(etiquetaFiltro)
        setBusqueda('')
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
        setPagosPeriodo([])
        return false
      } finally {
        setLoading(false)
      }
    },
    [supabase, onError, onNotice],
  )

  const rangoInvalido = Boolean(fechaInicio && fechaFin && fechaInicio > fechaFin)
  const modoFechaActivo = filtroModoFechaIngreso
    ? 'ingreso'
    : filtroModoFechaEntrega
      ? 'entrega'
      : null
  const filtrosListos =
    !rangoInvalido &&
    Boolean(fechaInicio.trim() && fechaFin.trim()) &&
    (modoFechaActivo != null || estatusSeleccionados.size > 0)

  function clearModoFecha() {
    setFiltroModoFechaIngreso(false)
    setFiltroModoFechaEntrega(false)
  }

  function toggleModoFechaIngreso() {
    setFiltroModoFechaIngreso((prev) => {
      const next = !prev
      if (next) setFiltroModoFechaEntrega(false)
      return next
    })
  }

  function toggleModoFechaEntrega() {
    setFiltroModoFechaEntrega((prev) => {
      const next = !prev
      if (next) setFiltroModoFechaIngreso(false)
      return next
    })
  }

  function soloModoFechaIngreso() {
    setFiltroModoFechaEntrega(false)
    setFiltroModoFechaIngreso(true)
  }

  function soloModoFechaEntrega() {
    setFiltroModoFechaIngreso(false)
    setFiltroModoFechaEntrega(true)
  }

  function validarFiltros() {
    const ini = fechaInicio.trim()
    const fin = fechaFin.trim()
    if (!ini || !fin) {
      onError?.('Indique fecha inicio y fecha fin')
      return null
    }
    if (ini > fin) {
      onError?.('La fecha inicio no puede ser posterior a la fecha fin')
      return null
    }
    if (!modoFechaActivo && estatusSeleccionados.size === 0) {
      onError?.('Seleccione al menos un estatus o active Fecha ingresado / Fecha entrega')
      return null
    }
    return { ini, fin, modoFecha: modoFechaActivo }
  }

  async function onGenerarReporte() {
    const rango = validarFiltros()
    if (!rango) return
    const ok = await cargarDatosPeriodo(rango.ini, rango.fin, estatusSeleccionados, rango.modoFecha)
    if (ok) {
      setEstadisticasDesdeReporte(false)
      setPantalla('resultados')
    }
  }

  async function onVerEstadisticas() {
    const rango = validarFiltros()
    if (!rango) return
    const ok = await cargarDatosPeriodo(rango.ini, rango.fin, estatusSeleccionados, rango.modoFecha)
    if (ok) {
      setEstadisticasDesdeReporte(false)
      setPantalla('estadisticas')
    }
  }

  async function onActualizarEstadisticas() {
    const rango = validarFiltros()
    if (!rango) return
    await cargarDatosPeriodo(rango.ini, rango.fin, estatusSeleccionados, rango.modoFecha)
  }

  function onVerEstadisticasDelPeriodo() {
    setEstadisticasDesdeReporte(true)
    setPantalla('estadisticas')
  }

  const resumen = useMemo(() => {
    const total = reparaciones.length
    const entregadas = reparaciones.filter(esEntregada).length
    const activas = total - entregadas
    const totalPagos = totalPagosEnLista(pagosPeriodo)
    const totalCosto = reparaciones.reduce((s, r) => s + Number(r.costo_reparacion ?? 0), 0)
    const porEstatus = {}
    for (const r of reparaciones) {
      const k = normalizarLabelEstatus(r.estatus)
      porEstatus[k] = (porEstatus[k] ?? 0) + 1
    }
    return { total, entregadas, activas, totalPagos, totalCosto, porEstatus }
  }, [reparaciones, pagosPeriodo])

  const equipoPorId = useMemo(() => {
    const m = new Map()
    for (const eq of equipos) {
      if (eq?.id != null) m.set(String(eq.id), eq)
    }
    return m
  }, [equipos])

  const filtrados = useMemo(() => {
    const base =
      tiposServicioSeleccionados.size === 0
        ? []
        : reparaciones.filter((r) => {
            const tipoCanon = tipoServicioDeRep(r, equipoPorId, { usarEquipoSiFalta: true })
            return tipoCanon != null && tiposServicioSeleccionados.has(tipoCanon)
          })
    const t = busqueda.trim().toLowerCase()
    if (!t) return base
    return base.filter((r) => {
      const id = String(r.id ?? '')
      const est = String(r.estatus ?? '').toLowerCase()
      const nom = nombreCliente(clientes, r.cliente_id).toLowerCase()
      const desc = String(r.descripcion_equipo ?? '').toLowerCase()
      const tipo = String(r.tipo_reparacion ?? '').toLowerCase()
      const tech = String(r.tecnico ?? '').toLowerCase()
      const problema = String(r.problemas_reportados ?? '').toLowerCase()
      const tipoCanon = String(tipoServicioDeRep(r, equipoPorId, { usarEquipoSiFalta: true }) ?? '').toLowerCase()
      return (
        id.includes(t) ||
        est.includes(t) ||
        nom.includes(t) ||
        desc.includes(t) ||
        tipo.includes(t) ||
        tech.includes(t) ||
        problema.includes(t) ||
        tipoCanon.includes(t)
      )
    })
  }, [reparaciones, busqueda, clientes, tiposServicioSeleccionados, equipoPorId])

  function volverAElegirFechas() {
    setPantalla('fechas')
    setEstadisticasDesdeReporte(false)
    setReparaciones([])
    setPagosPeriodo([])
    setPeriodoAplicado(null)
    setEstatusAplicado('')
    setSinColumnaFecha(false)
    setDuplicadasExcluidas(0)
    setBusqueda('')
    setTiposServicioSeleccionados(new Set(TIPOS_SERVICIO_CANONICOS))
    clearModoFecha()
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
    onToggleModoFechaIngreso: toggleModoFechaIngreso,
    onToggleModoFechaEntrega: toggleModoFechaEntrega,
    onSoloModoFechaIngreso: soloModoFechaIngreso,
    onSoloModoFechaEntrega: soloModoFechaEntrega,
    onClearModoFecha: clearModoFecha,
    tiposServicioSeleccionados,
    onTiposServicioSeleccionados: setTiposServicioSeleccionados,
    busqueda,
    onBusqueda: setBusqueda,
    rangoInvalido,
  }

  if (pantalla === 'estadisticas') {
    return (
      <ReportesEstadisticasView
        reparaciones={reparaciones}
        pagosPeriodo={pagosPeriodo}
        resumen={resumen}
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
    )
  }

  async function imprimirReporte() {
    if (!periodoAplicado || reparaciones.length === 0) {
      onError?.('No hay datos del reporte para imprimir.')
      return
    }
    try {
      const { printReporteReparacionesPdf } = await import('./reporteReparacionesPdf.js')
      await printReporteReparacionesPdf({
        periodo: periodoAplicado,
        formatearFechaCorta,
        estatusFiltro: estatusAplicado || 'Todos',
        resumen: {
          total: resumen.total,
          activas: resumen.activas,
          entregadas: resumen.entregadas,
          totalPagos: resumen.totalPagos,
          totalCosto: resumen.totalCosto,
        },
        porEstatus: resumen.porEstatus,
        filas: reparaciones.map((r) => ({
          orden: String(r.id ?? '—'),
          cliente: nombreCliente(clientes, r.cliente_id),
          estatus: String(r.estatus ?? '—'),
          tipo: String(r.tipo_reparacion ?? '—'),
          fecha: extractDateYmd(r) ?? '—',
          pago: `$${Number(r.pago ?? 0).toFixed(2)}`,
          costo: `$${Number(r.costo_reparacion ?? 0).toFixed(2)}`,
        })),
      })
    } catch (e) {
      onError?.(`No se pudo imprimir el reporte: ${e?.message ?? e}`)
    }
  }

  if (pantalla === 'fechas') {
    return (
      <div className="servicios-root inventarios-root reportes-modulo-root">
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
              {formatearFechaCorta(periodoAplicado.fin)} · <strong>Estatus:</strong> {estatusAplicado || 'Todos'}
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

        <section className="corte-caja-resumen card-pad reportes-resumen">
          <header className="corte-caja-resumen-header">
            <span className="corte-caja-resumen-ico" aria-hidden="true">
              📊
            </span>
            <h2 className="corte-caja-resumen-titulo">Resumen del periodo</h2>
          </header>
          <div className="corte-caja-stats reportes-stats">
            <div className="corte-caja-stat corte-caja-stat--total">
              <span className="label">
                <span aria-hidden="true">🧾</span> Total órdenes
              </span>
              <strong>{resumen.total}</strong>
            </div>
            <div className="corte-caja-stat reportes-stat--activas">
              <span className="label">
                <span aria-hidden="true">🔧</span> Activas
              </span>
              <strong>{resumen.activas}</strong>
            </div>
            <div className="corte-caja-stat reportes-stat--entregadas">
              <span className="label">
                <span aria-hidden="true">✅</span> Entregadas
              </span>
              <strong>{resumen.entregadas}</strong>
            </div>
            <div className="corte-caja-stat corte-caja-stat--tarjeta">
              <span className="label">
                <span aria-hidden="true">💵</span> Suma pagos
              </span>
              <strong>${resumen.totalPagos.toFixed(2)}</strong>
            </div>
            <div className="corte-caja-stat corte-caja-stat--otro">
              <span className="label">
                <span aria-hidden="true">🛠️</span> Suma costo reparación
              </span>
              <strong>${resumen.totalCosto.toFixed(2)}</strong>
            </div>
          </div>
          <div className="reportes-por-estatus">
            <h3 className="reportes-subtitulo">
              <span aria-hidden="true">🏷️</span> Por estatus
            </h3>
            <ul className="reportes-estatus-lista">
              {Object.entries(resumen.porEstatus)
                .filter(([, n]) => n > 0)
                .map(([k, n]) => (
                  <li key={k}>
                    <span>{k}</span>
                    <strong>{n}</strong>
                  </li>
                ))}
            </ul>
          </div>
        </section>

        <div className="reportes-acciones-row">
          <button
            type="button"
            className="btn-agregar-equipo btn-ver-estadisticas"
            onClick={onVerEstadisticasDelPeriodo}
            disabled={loading || reparaciones.length === 0}
          >
            📈 Ver estadísticas del periodo
          </button>
          <button
            type="button"
            className="btn-agregar-equipo btn-imprimir-corte-caja"
            onClick={() => void imprimirReporte()}
            disabled={loading || reparaciones.length === 0}
          >
            🖨 IMPRIMIR REPORTE
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
        </div>

        {loading ? (
          <p className="muted center">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <div className="empty-card">
            <p>
              {busqueda.trim()
                ? 'No se encontraron resultados'
                : sinColumnaFecha
                  ? 'No hay órdenes'
                  : 'No hay órdenes en el periodo y filtro seleccionados'}
            </p>
          </div>
        ) : vista === 'tabla' ? (
          <TablaScrollSuperior
            ariaLabel="Órdenes del reporte en tabla"
            classNameWrap="reportes-tabla-wrap"
            syncDeps={[vista, filtrados, loading]}
          >
              <div className="inventario-tabla-grid reportes-tabla-grid">
                <div className="inventario-tabla-fila-grupo inventario-tabla-cabecera" role="row">
                  <div className="inventario-tabla-grupo-celdas inventario-tabla-grupo-celdas--cabecera">
                    <span className="inventario-tabla-th inventario-celda inventario-celda--orden-rep">No.</span>
                    <span className="inventario-tabla-th inventario-celda inventario-celda--cliente-corte">Cliente</span>
                    <span className="inventario-tabla-th inventario-celda inventario-celda--forma-corte">Estatus</span>
                    <span className="inventario-tabla-th inventario-celda inventario-celda--desc">Equipo / tipo</span>
                    <span className="inventario-tabla-th inventario-celda inventario-celda--fecha-corte">Fecha</span>
                    <span className="inventario-tabla-th inventario-celda inventario-celda--monto-cat">Pago</span>
                    <span className="inventario-tabla-th inventario-celda inventario-celda--costo-rep">Costo</span>
                  </div>
                </div>
                {filtrados.map((r) => {
                  const ymd = extractDateYmd(r)
                  return (
                    <div key={r.id} className="inventario-tabla-fila-grupo" role="row">
                      <div className="inventario-tabla-grupo-celdas">
                        <span className="inventario-celda inventario-celda--orden-rep">#{r.id}</span>
                        <span className="inventario-celda inventario-celda--cliente-corte">
                          {nombreCliente(clientes, r.cliente_id)}
                        </span>
                        <span className="inventario-celda inventario-celda--forma-corte corte-caja-chip">
                          {String(r.estatus ?? '—')}
                        </span>
                        <span className="inventario-celda inventario-celda--desc">
                          {String(r.descripcion_equipo ?? r.tipo_reparacion ?? '—')}
                        </span>
                        <span className="inventario-celda inventario-celda--fecha-corte">
                          {ymd ? formatearFechaCorta(ymd) : '—'}
                        </span>
                        <span className="inventario-celda inventario-celda--monto-cat corte-caja-monto-celda">
                          ${Number(r.pago ?? 0).toFixed(2)}
                        </span>
                        <span className="inventario-celda inventario-celda--costo-rep">
                          ${Number(r.costo_reparacion ?? 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
          </TablaScrollSuperior>
        ) : (
          <ul className="equipo-list inventario-list reportes-lista">
            {filtrados.map((r) => {
              const ymd = extractDateYmd(r)
              return (
                <li key={r.id} className="equipo-card inventario-card reportes-card corte-caja-card--solo-lectura">
                  <div className="equipo-card-main inventario-card-main reportes-fila">
                    <strong>
                      <span aria-hidden="true">📋</span> Orden #{r.id}
                    </strong>
                    <span className="reportes-cliente-lista">
                      <span aria-hidden="true">👤</span> {nombreCliente(clientes, r.cliente_id)}
                    </span>
                    <span className="corte-caja-chip">{String(r.estatus ?? '—')}</span>
                    <span className="muted small">
                      <span aria-hidden="true">🖨️</span> {String(r.descripcion_equipo ?? r.tipo_reparacion ?? '—')}
                    </span>
                    <span className="muted small reportes-meta-lista">
                      <span aria-hidden="true">💵</span> Pago ${Number(r.pago ?? 0).toFixed(2)} ·{' '}
                      <span aria-hidden="true">🛠️</span> Costo ${Number(r.costo_reparacion ?? 0).toFixed(2)}
                      {ymd ? (
                        <>
                          {' '}
                          · <span aria-hidden="true">📅</span> {formatearFechaCorta(ymd)}
                        </>
                      ) : null}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
