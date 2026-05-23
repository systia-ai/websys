/* eslint-disable react-hooks/set-state-in-effect -- carga inicial de clientes */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { normalizeClienteRow, sameId } from './clienteUtils.js'
import ReportesEstadisticasView from './ReportesEstadisticasView.jsx'
import ReportesFiltrosCard from './ReportesFiltrosCard.jsx'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'
import { aYmdLocalDesdeRaw, formatFechaLegibleEsMx, ymdHoyLocal, ymdLocalDesdeDate } from './reparacionUtils.js'
import {
  crearSetEstatusTodos,
  contarOrdenesDuplicadas,
  excluirOrdenesDuplicadas,
  labelEstatusAplicados,
  filtrarPorEstatus,
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
const LS_PAGOS = 'sistefix_local_pagosclientes'

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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
  const [pagosPeriodo, setPagosPeriodo] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(false)
  const [busqueda, setBusqueda] = useState('')
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

  const cargarDatosPeriodo = useCallback(
    async (ini, fin, estatusSet) => {
      setLoading(true)
      setSinColumnaFecha(false)
      try {
        let todos = []
        if (supabase) {
          const { data, error } = await supabase.from('reparaciones').select('*').order('id', { ascending: false })
          if (error) throw error
          todos = data ?? []
        } else {
          todos = readLs(LS_REP, [])
        }
        const { filas: porFecha, sinColumnaFecha: sinF } = aplicarFiltroFechas(todos, ini, fin)
        const porEstatus = filtrarPorEstatus(porFecha, estatusSet)
        const nDup = contarOrdenesDuplicadas(porEstatus)
        const filas = excluirOrdenesDuplicadas(porEstatus)
        setReparaciones(filas)

        const cuentasMap = supabase ? await cargarCuentasMapParaPagos(supabase) : new Map()
        const pagosTodos = await cargarTodosPagosClientes(supabase)
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
        setSinColumnaFecha(sinF)
        setPeriodoAplicado({ ini, fin })
        setEstatusAplicado(labelEstatusAplicados(estatusSet))
        setBusqueda('')
        if (nDup > 0) {
          onNotice?.(
            nDup === 1
              ? 'Se excluyó 1 orden marcada como duplicada del reporte y las estadísticas.'
              : `Se excluyeron ${nDup} órdenes marcadas como duplicadas del reporte y las estadísticas.`,
          )
        }
        if (sinF && todos.length > 0) {
          onNotice?.('Las órdenes no tienen fecha reconocible; se muestran todas para el reporte.')
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
    if (estatusSeleccionados.size === 0) {
      onError?.('Seleccione al menos un estatus')
      return null
    }
    return { ini, fin }
  }

  async function onGenerarReporte() {
    const rango = validarFiltros()
    if (!rango) return
    const ok = await cargarDatosPeriodo(rango.ini, rango.fin, estatusSeleccionados)
    if (ok) {
      setEstadisticasDesdeReporte(false)
      setPantalla('resultados')
    }
  }

  async function onVerEstadisticas() {
    const rango = validarFiltros()
    if (!rango) return
    const ok = await cargarDatosPeriodo(rango.ini, rango.fin, estatusSeleccionados)
    if (ok) {
      setEstadisticasDesdeReporte(false)
      setPantalla('estadisticas')
    }
  }

  async function onActualizarEstadisticas() {
    const rango = validarFiltros()
    if (!rango) return
    await cargarDatosPeriodo(rango.ini, rango.fin, estatusSeleccionados)
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

  const filtrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    if (!t) return reparaciones
    return reparaciones.filter((r) => {
      const id = String(r.id ?? '')
      const est = String(r.estatus ?? '').toLowerCase()
      const nom = nombreCliente(clientes, r.cliente_id).toLowerCase()
      const desc = String(r.descripcion_equipo ?? '').toLowerCase()
      const tipo = String(r.tipo_reparacion ?? '').toLowerCase()
      const tech = String(r.tecnico ?? '').toLowerCase()
      return (
        id.includes(t) ||
        est.includes(t) ||
        nom.includes(t) ||
        desc.includes(t) ||
        tipo.includes(t) ||
        tech.includes(t)
      )
    })
  }, [reparaciones, busqueda, clientes])

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
        filtrosSlot={
          !estadisticasDesdeReporte ? (
            <ReportesFiltrosCard
              fechaInicio={fechaInicio}
              fechaFin={fechaFin}
              onFechaInicio={setFechaInicio}
              onFechaFin={setFechaFin}
              estatusSeleccionados={estatusSeleccionados}
              onEstatusSeleccionados={setEstatusSeleccionados}
              rangoInvalido={rangoInvalido}
            >
              <button
                type="button"
                className="btn-agregar-equipo btn-consultar-corte-caja"
                onClick={() => void onActualizarEstadisticas()}
                disabled={loading || rangoInvalido}
              >
                {loading ? 'Actualizando…' : 'ACTUALIZAR GRÁFICAS'}
              </button>
            </ReportesFiltrosCard>
          ) : null
        }
      />
    )
  }

  function imprimirReporte() {
    if (!periodoAplicado || reparaciones.length === 0) {
      onError?.('No hay datos del reporte para imprimir.')
      return
    }
    const periodoTxt = `${formatearFechaCorta(periodoAplicado.ini)} — ${formatearFechaCorta(periodoAplicado.fin)}`
    const estTxt = escapeHtml(estatusAplicado || 'Todos')
    const filas = reparaciones
      .map(
        (r) =>
          `<tr><td>${r.id ?? '—'}</td><td>${escapeHtml(nombreCliente(clientes, r.cliente_id))}</td><td>${escapeHtml(String(r.estatus ?? '—'))}</td><td>${escapeHtml(String(r.tipo_reparacion ?? '—'))}</td><td>${escapeHtml(extractDateYmd(r) ?? '—')}</td><td style="text-align:right">$${Number(r.pago ?? 0).toFixed(2)}</td><td style="text-align:right">$${Number(r.costo_reparacion ?? 0).toFixed(2)}</td></tr>`,
      )
      .join('')
    const porEstRows =
      Object.entries(resumen.porEstatus)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `<tr><td>${escapeHtml(k)}</td><td style="text-align:right">${n}</td></tr>`)
        .join('') || '<tr><td colspan="2">—</td></tr>'
    const html = `<h1>Reporte de reparaciones</h1>
<p><strong>Periodo:</strong> ${escapeHtml(periodoTxt)}<br><strong>Estatus filtrado:</strong> ${estTxt}</p>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:520px;margin-bottom:16px"><tbody>
<tr><th colspan="2" style="text-align:left;background:#eceff1">Resumen</th></tr>
<tr><td>Total órdenes</td><td style="text-align:right"><strong>${resumen.total}</strong></td></tr>
<tr><td>Activas (no entregadas)</td><td style="text-align:right">${resumen.activas}</td></tr>
<tr><td>Entregadas</td><td style="text-align:right">${resumen.entregadas}</td></tr>
<tr><td>Suma pagos</td><td style="text-align:right">$${resumen.totalPagos.toFixed(2)}</td></tr>
<tr><td>Suma costo reparación</td><td style="text-align:right">$${resumen.totalCosto.toFixed(2)}</td></tr>
</tbody></table>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:520px;margin-bottom:20px"><caption style="caption-side:top;text-align:left;font-weight:bold;padding:8px 0">Por estatus</caption><tbody>${porEstRows}</tbody></table>
<h2>Detalle de órdenes</h2>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr><th>No</th><th>Cliente</th><th>Estatus</th><th>Tipo</th><th>Fecha</th><th>Pago</th><th>Costo</th></tr></thead><tbody>${filas}</tbody></table>`
    const w = window.open('', '_blank')
    if (!w) {
      onError?.('Permita ventanas emergentes para imprimir.')
      return
    }
    w.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte reparaciones</title><style>
body{font-family:Arial,sans-serif;padding:20px;color:#111}
h1{font-size:1.35rem;margin:0 0 12px}
h2{font-size:1.1rem;margin:20px 0 10px}
th{background:#eceff1;font-size:0.8rem}
td{font-size:0.88rem}
p{margin:0 0 16px;line-height:1.5}
</style></head><body>${html}<p class="muted">Imprima o guarde como PDF desde el navegador.</p></body></html>`,
    )
    w.document.close()
    w.focus()
    w.print()
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
          <span className="servicios-appbar-placeholder" aria-hidden />
        </header>
        <div className="servicios-body corte-caja-body reportes-body">
          <ReportesFiltrosCard
            fechaInicio={fechaInicio}
            fechaFin={fechaFin}
            onFechaInicio={setFechaInicio}
            onFechaFin={setFechaFin}
            estatusSeleccionados={estatusSeleccionados}
            onEstatusSeleccionados={setEstatusSeleccionados}
            rangoInvalido={rangoInvalido}
          >
            <div className="reportes-inicio-acciones">
              <button
                type="button"
                className="btn-agregar-equipo btn-consultar-corte-caja"
                onClick={() => void onGenerarReporte()}
                disabled={loading || rangoInvalido || estatusSeleccionados.size === 0}
              >
                {loading ? '⏳ Generando…' : '📋 GENERAR REPORTE'}
              </button>
              <button
                type="button"
                className="btn-agregar-equipo btn-ver-estadisticas"
                onClick={() => void onVerEstadisticas()}
                disabled={loading || rangoInvalido || estatusSeleccionados.size === 0}
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
        <button type="button" className="appbar-text-btn appbar-text-btn--narrow" onClick={volverAElegirFechas}>
          📅 Periodo
        </button>
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
            onClick={imprimirReporte}
            disabled={loading || reparaciones.length === 0}
          >
            🖨 IMPRIMIR REPORTE
          </button>
        </div>

        <div className="servicios-search card-pad">
          <span className="search-ico" aria-hidden>
            🔍
          </span>
          <input
            placeholder="Buscar en este reporte (no, cliente, estatus, equipo…)"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
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
