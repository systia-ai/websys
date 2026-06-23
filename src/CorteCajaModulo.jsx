/* eslint-disable react-hooks/set-state-in-effect -- carga inicial de clientes */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AlertaPermiso from './AlertaPermiso.jsx'
import FechaInputPermiso from './FechaInputPermiso.jsx'
import { normalizeClienteRow, sameId } from './clienteUtils.js'
import { MENSAJE_SIN_PERMISO_FECHAS, rangoFechasPermitidoUsuario } from './permisosUtils.js'
import { usePermisoEliminar } from './usePermisoEliminar.js'
import {
  aplicarFiltroPagosPorFechas,
  cargarCuentasMapParaPagos,
  cargarTodosPagosClientes,
  extractFechaPagoYmd,
  ordenarPagosPorFecha,
} from './pagosClientesUtils.js'
import { formatFechaLegibleEsMx, ymdHoyLocal } from './reparacionUtils.js'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'
import {
  cargarDesglosePorCuentas,
  desgloseParaPago,
  formatearLineaDesglose,
} from './corteCajaDesglose.js'

const LS_VISTA_CORTE = 'sistefix_corte_caja_vista'
const LS_DETALLADO_CORTE = 'sistefix_corte_caja_detallado'
const LS_ORDEN_FECHA_CORTE = 'sistefix_corte_caja_orden_fecha'

function leerVistaCorte() {
  try {
    return localStorage.getItem(LS_VISTA_CORTE) === 'tabla' ? 'tabla' : 'lista'
  } catch {
    return 'lista'
  }
}

function leerDetalladoCorte() {
  try {
    return localStorage.getItem(LS_DETALLADO_CORTE) === '1'
  } catch {
    return false
  }
}

function leerOrdenFechaCorte() {
  try {
    return localStorage.getItem(LS_ORDEN_FECHA_CORTE) === 'asc' ? 'asc' : 'desc'
  } catch {
    return 'desc'
  }
}

const LS_CLIENTES = 'sistefix_local_clientes'

function ymdHoy() {
  return ymdHoyLocal()
}

function readLs(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback))
  } catch {
    return fallback
  }
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

function emojiFormaPago(forma) {
  const f = String(forma ?? 'EFECTIVO').trim().toUpperCase()
  if (f === 'TRANSFERENCIA') return '🏦'
  if (f === 'TARJETA') return '💳'
  if (f === 'OTRO') return '📎'
  return '💵'
}

/**
 * Corte de caja: primero fechas inicio/fin (como Android), luego resumen y movimientos de pagos
 * (`pagosclientes` o, si existe, `pagocliente`).
 */
export default function CorteCajaModulo({
  supabase,
  onHome,
  onError,
  onNotice,
  puedeElegirRangoFechas = false,
}) {
  const { alertaPermiso, mostrarSinPermiso } = usePermisoEliminar(puedeElegirRangoFechas)
  const avisarSinPermisoFecha = () => mostrarSinPermiso(MENSAJE_SIN_PERMISO_FECHAS)
  const cuentasPorIdRef = useRef(new Map())

  const [pantalla, setPantalla] = useState('fechas')
  const [fechaInicio, setFechaInicio] = useState(ymdHoy)
  const [fechaFin, setFechaFin] = useState(ymdHoy)
  const [periodoAplicado, setPeriodoAplicado] = useState(null)
  const [sinColumnaFecha, setSinColumnaFecha] = useState(false)
  const [avisoPagosSinFecha, setAvisoPagosSinFecha] = useState(0)

  const [pagos, setPagos] = useState([])
  const [clientes, setClientes] = useState([])
  const [loadingCorte, setLoadingCorte] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [vista, setVista] = useState(leerVistaCorte)
  const [detallado, setDetallado] = useState(leerDetalladoCorte)
  const [ordenFecha, setOrdenFecha] = useState(leerOrdenFechaCorte)
  const [desglosePorCuenta, setDesglosePorCuenta] = useState(() => new Map())
  const [cargandoDesglose, setCargandoDesglose] = useState(false)

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
    if (puedeElegirRangoFechas) return
    const hoy = ymdHoy()
    setFechaInicio(hoy)
    setFechaFin(hoy)
  }, [puedeElegirRangoFechas])

  const ejecutarConsulta = useCallback(
    async (ini, fin) => {
      setLoadingCorte(true)
      setSinColumnaFecha(false)
      setAvisoPagosSinFecha(0)
      try {
        const cuentasMap = supabase ? await cargarCuentasMapParaPagos(supabase) : new Map()
        cuentasPorIdRef.current = cuentasMap
        const todos = await cargarTodosPagosClientes(supabase)
        const { filas, sinColumnaFecha: sinF, sinFechaIncluidos } = aplicarFiltroPagosPorFechas(
          todos,
          ini,
          fin,
          cuentasMap,
        )
        setPagos(filas)
        setSinColumnaFecha(sinF)
        setAvisoPagosSinFecha(sinFechaIncluidos)
        setPeriodoAplicado({ ini, fin })
        setPantalla('resultados')
        setBusqueda('')
        setCargandoDesglose(true)
        try {
          const idsCuenta = filas.map((p) => p.cuenta_id).filter((id) => id != null && id !== '')
          const desglose = await cargarDesglosePorCuentas(supabase, idsCuenta)
          setDesglosePorCuenta(desglose)
        } catch (e) {
          setDesglosePorCuenta(new Map())
          console.warn('No se cargó el desglose del corte:', e.message)
        } finally {
          setCargandoDesglose(false)
        }
        if (sinF && todos.length > 0) {
          onNotice?.('Los registros no tienen fecha; se muestran todos los movimientos.')
        } else if (sinFechaIncluidos > 0) {
          onNotice?.(
            sinFechaIncluidos === 1
              ? '1 pago sin fecha de pago se incluyó en el corte (revise el registro en la cuenta).'
              : `${sinFechaIncluidos} pagos sin fecha de pago se incluyeron en el corte (revise esos registros).`,
          )
        }
      } catch (e) {
        onError?.(`Error al consultar corte: ${e.message}`)
        setPagos([])
      } finally {
        setLoadingCorte(false)
      }
    },
    [supabase, onError, onNotice],
  )

  function cambiarFechaInicio(valor) {
    if (!puedeElegirRangoFechas) {
      avisarSinPermisoFecha()
      return
    }
    setFechaInicio(valor)
  }

  function cambiarFechaFin(valor) {
    if (!puedeElegirRangoFechas) {
      avisarSinPermisoFecha()
      return
    }
    setFechaFin(valor)
  }

  async function onConsultarCorte() {
    const hoy = ymdHoy()
    const { ini, fin } = rangoFechasPermitidoUsuario(puedeElegirRangoFechas, fechaInicio.trim(), fechaFin.trim(), hoy)
    if (!ini || !fin) {
      onError?.('Indique fecha inicio y fecha fin')
      return
    }
    if (ini > fin) {
      onError?.('La fecha inicio no puede ser posterior a la fecha fin')
      return
    }
    await ejecutarConsulta(ini, fin)
  }

  const resumen = useMemo(() => {
    const cantidadPagos = pagos.length
    const porForma = { EFECTIVO: 0, TRANSFERENCIA: 0, TARJETA: 0, OTRO: 0 }
    let totalIngresos = 0
    for (const p of pagos) {
      const n = Number(p.pago ?? 0)
      if (!Number.isFinite(n)) continue
      totalIngresos += n
      const f = String(p.forma_pago ?? 'EFECTIVO').toUpperCase()
      if (f in porForma) porForma[f] += n
      else porForma.OTRO += n
    }
    return { cantidadPagos, porForma, totalIngresos }
  }, [pagos])

  const etiquetaTotalResumen = useMemo(() => {
    if (!periodoAplicado) return 'Total del día'
    return periodoAplicado.ini === periodoAplicado.fin ? 'Total del día' : 'Total del periodo'
  }, [periodoAplicado])

  const pagosOrdenados = useMemo(
    () => ordenarPagosPorFecha(pagos, ordenFecha, cuentasPorIdRef.current),
    [pagos, ordenFecha],
  )

  const filtrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    if (!t) return pagosOrdenados
    return pagosOrdenados.filter((p) => {
      const con = String(p.concepto ?? '').toLowerCase()
      const fp = String(p.forma_pago ?? '').toLowerCase()
      const nom = nombreCliente(clientes, p.cliente_id).toLowerCase()
      const cid = String(p.cliente_id ?? '')
      const cuent = String(p.cuenta_id ?? '')
      return con.includes(t) || fp.includes(t) || nom.includes(t) || cid.includes(t) || cuent.includes(t)
    })
  }, [pagosOrdenados, busqueda, clientes])

  function cambiarVista(modo) {
    setVista(modo)
    try {
      localStorage.setItem(LS_VISTA_CORTE, modo)
    } catch {
      /* ignore */
    }
  }

  function volverAElegirFechas() {
    setPantalla('fechas')
    setPagos([])
    setPeriodoAplicado(null)
    setSinColumnaFecha(false)
    setAvisoPagosSinFecha(0)
    setBusqueda('')
    setDesglosePorCuenta(new Map())
    if (!puedeElegirRangoFechas) {
      const hoy = ymdHoy()
      setFechaInicio(hoy)
      setFechaFin(hoy)
    }
  }

  function cambiarDetallado(activo) {
    setDetallado(activo)
    try {
      localStorage.setItem(LS_DETALLADO_CORTE, activo ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  function cambiarOrdenFecha(valor) {
    const orden = valor === 'asc' ? 'asc' : 'desc'
    setOrdenFecha(orden)
    try {
      localStorage.setItem(LS_ORDEN_FECHA_CORTE, orden)
    } catch {
      /* ignore */
    }
  }

  function conceptoPagoFilas(p) {
    const concepto = String(p.concepto ?? '—')
    if (!detallado) return { titulo: concepto, lineas: [] }
    const cargos = desgloseParaPago(p, desglosePorCuenta)
    return {
      titulo: concepto,
      lineas: cargos.map(formatearLineaDesglose),
    }
  }

  function renderConceptoPago(p) {
    const { titulo, lineas } = conceptoPagoFilas(p)
    if (!detallado || lineas.length === 0) {
      return titulo
    }
    return (
      <span className="corte-caja-concepto-detallado">
        <span className="corte-caja-concepto-titulo">{titulo}</span>
        <ul className="corte-caja-desglose-lista">
          {lineas.map((txt, i) => (
            <li key={i}>{txt}</li>
          ))}
        </ul>
      </span>
    )
  }

  function fechaPagoEtiqueta(p) {
    return extractFechaPagoYmd(p, cuentasPorIdRef.current) ?? '—'
  }

  async function imprimirCorte() {
    if (!periodoAplicado) {
      onError?.('Consulte un periodo antes de imprimir.')
      return
    }
    if (pagos.length === 0) {
      onError?.('No hay movimientos en el corte para imprimir.')
      return
    }
    try {
      const { printCorteCajaPdf } = await import('./corteCajaPdf.js')
      await printCorteCajaPdf({
        periodo: periodoAplicado,
        formatearFechaCorta,
        etiquetaTotal: etiquetaTotalResumen,
        resumen,
        filas: ordenarPagosPorFecha(pagos, ordenFecha, cuentasPorIdRef.current).map((p) => {
          const { titulo, lineas } = conceptoPagoFilas(p)
          const conceptoPdf =
            detallado && lineas.length > 0 ? [titulo, ...lineas.map((l) => `  · ${l}`)].join('\n') : titulo
          return {
            concepto: conceptoPdf,
            cliente: nombreCliente(clientes, p.cliente_id),
            cuenta: p.cuenta_id != null && p.cuenta_id !== '' ? String(p.cuenta_id) : '—',
            forma: String(p.forma_pago ?? '—'),
            fecha: fechaPagoEtiqueta(p),
            monto: `$${Number(p.pago ?? 0).toFixed(2)}`,
          }
        }),
      })
    } catch (e) {
      onError?.(`No se pudo imprimir el corte: ${e?.message ?? e}`)
    }
  }

  if (pantalla === 'fechas') {
    return (
      <div className="servicios-root inventarios-root corte-caja-root">
        <AlertaPermiso mensaje={alertaPermiso} />
        <header className="servicios-appbar">
          <button type="button" className="icon-back" onClick={onHome} aria-label="Atrás">
            ←
          </button>
          <h1 className="servicios-appbar-title">
            <span className="appbar-title-emoji" aria-hidden="true">💰</span>
            Corte de caja
          </h1>
          {onHome ? (
            <button type="button" className="appbar-text-btn appbar-text-btn--narrow" onClick={onHome}>
              Inicio
            </button>
          ) : (
            <span className="servicios-appbar-placeholder" aria-hidden />
          )}
        </header>

        <div className="servicios-body corte-caja-body">
          <section className="corte-caja-hero-card card-pad">
            <header className="corte-caja-hero-header">
              <span className="corte-caja-hero-emoji" aria-hidden="true">
                📅
              </span>
              <h2 className="corte-caja-hero-titulo">Consultar periodo</h2>
            </header>
            <p className="corte-caja-hero-tip">
              <span className="corte-caja-hero-tip-ico" aria-hidden="true">
                💡
              </span>
              Elija fecha inicio y fin para ver pagos, totales por forma de pago y el detalle del corte.
            </p>
            <div className="corte-caja-fechas-grid">
              <label className="corte-caja-fecha-campo">
                <span className="corte-caja-fecha-label">
                  <span aria-hidden="true">🗓️</span> Fecha inicio
                </span>
                <FechaInputPermiso
                  value={fechaInicio}
                  min={puedeElegirRangoFechas ? undefined : fechaInicio || undefined}
                  max={puedeElegirRangoFechas ? fechaFin || undefined : fechaInicio || undefined}
                  puedeEditar={puedeElegirRangoFechas}
                  onChange={(e) => cambiarFechaInicio(e.target.value)}
                  onSinPermiso={avisarSinPermisoFecha}
                  ariaLabel="Fecha inicio"
                />
              </label>
              <label className="corte-caja-fecha-campo">
                <span className="corte-caja-fecha-label">
                  <span aria-hidden="true">📆</span> Fecha fin
                </span>
                <FechaInputPermiso
                  value={fechaFin}
                  min={puedeElegirRangoFechas ? fechaInicio || undefined : fechaFin || undefined}
                  max={puedeElegirRangoFechas ? undefined : fechaFin || undefined}
                  puedeEditar={puedeElegirRangoFechas}
                  onChange={(e) => cambiarFechaFin(e.target.value)}
                  onSinPermiso={avisarSinPermisoFecha}
                  ariaLabel="Fecha fin"
                />
              </label>
            </div>
            <button
              type="button"
              className="btn-agregar-equipo btn-consultar-corte-caja"
              onClick={() => void onConsultarCorte()}
              disabled={loadingCorte}
            >
              {loadingCorte ? '⏳ Consultando…' : '🔎 CONSULTAR CORTE'}
            </button>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`servicios-root inventarios-root corte-caja-root${vista === 'tabla' && periodoAplicado ? ' corte-caja-modulo--tabla' : ''}${detallado ? ' corte-caja-modulo--detallado' : ''}`}
    >
      <AlertaPermiso mensaje={alertaPermiso} />
      <header className="servicios-appbar">
        <button type="button" className="icon-back" onClick={volverAElegirFechas} aria-label="Atrás">
          ←
        </button>
        <h1 className="servicios-appbar-title">
          <span className="appbar-title-emoji" aria-hidden="true">💰</span>
          Corte de caja
        </h1>
        {onHome ? (
          <button type="button" className="appbar-text-btn appbar-text-btn--narrow" onClick={onHome}>
            Inicio
          </button>
        ) : (
          <span className="servicios-appbar-placeholder" aria-hidden />
        )}
      </header>

      <div className={`servicios-body corte-caja-body${vista === 'tabla' ? ' corte-caja-body--tabla' : ''}`}>
        {periodoAplicado ? (
          <div className="corte-caja-periodo-banner card-pad" role="status">
            <span className="corte-caja-periodo-ico" aria-hidden="true">
              📆
            </span>
            <span>
              <strong>Periodo:</strong> {formatearFechaCorta(periodoAplicado.ini)} —{' '}
              {formatearFechaCorta(periodoAplicado.fin)}
            </span>
          </div>
        ) : null}

        {sinColumnaFecha ? (
          <p className="corte-caja-warning-inset card-pad">
            <span aria-hidden="true">⚠️</span> Los movimientos no incluyen fecha en la base de datos; se listan todos
            los registros.
          </p>
        ) : null}

        {avisoPagosSinFecha > 0 ? (
          <p className="corte-caja-warning-inset card-pad">
            <span aria-hidden="true">⚠️</span>{' '}
            {avisoPagosSinFecha === 1
              ? 'Hay 1 pago sin fecha de pago en la tabla; se incluyó en el total usando la fecha de la cuenta.'
              : `Hay ${avisoPagosSinFecha} pagos sin fecha de pago; se incluyeron en el total usando la fecha de la cuenta.`}
          </p>
        ) : null}

        <section className="corte-caja-resumen card-pad">
          <header className="corte-caja-resumen-header">
            <span className="corte-caja-resumen-ico" aria-hidden="true">
              📊
            </span>
            <h2 className="corte-caja-resumen-titulo">Resumen del periodo</h2>
          </header>
          <div className="corte-caja-stats">
            <div className="corte-caja-stat corte-caja-stat--total-dia">
              <span className="label">
                <span aria-hidden="true">💰</span> {etiquetaTotalResumen}
              </span>
              <strong>${resumen.totalIngresos.toFixed(2)}</strong>
            </div>
            <div className="corte-caja-stats-fila">
              <div className="corte-caja-stat corte-caja-stat--cantidad">
                <span className="label">
                  <span aria-hidden="true">🧾</span> Pagos
                </span>
                <strong>{resumen.cantidadPagos}</strong>
              </div>
              <div className="corte-caja-stat corte-caja-stat--efectivo">
                <span className="label">
                  <span aria-hidden="true">💵</span> Efectivo
                </span>
                <strong>${resumen.porForma.EFECTIVO.toFixed(2)}</strong>
              </div>
              <div className="corte-caja-stat corte-caja-stat--transferencia">
                <span className="label">
                  <span aria-hidden="true">🏦</span> Transferencia
                </span>
                <strong>${resumen.porForma.TRANSFERENCIA.toFixed(2)}</strong>
              </div>
              <div className="corte-caja-stat corte-caja-stat--tarjeta">
                <span className="label">
                  <span aria-hidden="true">💳</span> Tarjeta
                </span>
                <strong>${resumen.porForma.TARJETA.toFixed(2)}</strong>
              </div>
              {resumen.porForma.OTRO > 0 ? (
                <div className="corte-caja-stat corte-caja-stat--otro">
                  <span className="label">
                    <span aria-hidden="true">📎</span> Otras
                  </span>
                  <strong>${resumen.porForma.OTRO.toFixed(2)}</strong>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <button
          type="button"
          className="btn-agregar-equipo btn-imprimir-corte-caja"
          onClick={() => void imprimirCorte()}
          disabled={loadingCorte || pagos.length === 0}
        >
          🖨 IMPRIMIR CORTE
        </button>

        <div className="servicios-search card-pad">
          <span className="search-ico" aria-hidden>
            🔍
          </span>
          <input
            placeholder="Buscar en este periodo…"
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
          <div className="corte-caja-vista-opciones">
          <label className="corte-caja-orden-fecha">
            <span className="inventario-vista-label">Orden:</span>
            <select
              value={ordenFecha}
              onChange={(e) => cambiarOrdenFecha(e.target.value)}
              aria-label="Ordenar movimientos por fecha"
            >
              <option value="asc">Más antiguo primero</option>
              <option value="desc">Más nuevo primero</option>
            </select>
          </label>
          <label className="corte-caja-detallado-check">
            <input
              type="checkbox"
              checked={detallado}
              onChange={(e) => cambiarDetallado(e.target.checked)}
              disabled={cargandoDesglose && pagos.length > 0}
            />
            <span>Detallado</span>
          </label>
          </div>
        </div>

        {loadingCorte ? (
          <p className="muted center">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <div className="empty-card">
            <p>
              {busqueda.trim()
                ? 'No se encontraron resultados'
                : sinColumnaFecha
                  ? 'No hay movimientos'
                  : 'No hay movimientos en el periodo seleccionado'}
            </p>
          </div>
        ) : vista === 'tabla' ? (
          <TablaScrollSuperior
            ariaLabel="Movimientos del corte en tabla"
            classNameWrap="corte-caja-tabla-wrap"
            showHint={false}
            syncDeps={[vista, filtrados, loadingCorte, ordenFecha]}
          >
              <div className={`inventario-tabla-grid corte-caja-tabla-grid${detallado ? ' corte-caja-tabla-grid--detallado' : ''}`}>
                <div className="inventario-tabla-fila-grupo inventario-tabla-cabecera" role="row">
                  <div className="inventario-tabla-grupo-celdas inventario-tabla-grupo-celdas--cabecera">
                    <span className="inventario-tabla-th inventario-celda inventario-celda--monto-cat">Monto</span>
                    <span className="inventario-tabla-th inventario-celda inventario-celda--concepto">Concepto</span>
                    <span className="inventario-tabla-th inventario-celda inventario-celda--cliente-corte">Cliente</span>
                    <span className="inventario-tabla-th inventario-celda inventario-celda--cuenta-corte">Cuenta</span>
                    <span className="inventario-tabla-th inventario-celda inventario-celda--forma-corte">Forma</span>
                    <span className="inventario-tabla-th inventario-celda inventario-celda--fecha-corte">Fecha</span>
                  </div>
                </div>
                {filtrados.map((p) => {
                  const fp = String(p.forma_pago ?? 'EFECTIVO').trim().toUpperCase()
                  const ymd = extractFechaPagoYmd(p, cuentasPorIdRef.current)
                  return (
                    <div key={p.id} className="inventario-tabla-fila-grupo" role="row">
                      <div className="inventario-tabla-grupo-celdas">
                        <span className="inventario-celda inventario-celda--monto-cat corte-caja-monto-celda">
                          ${Number(p.pago ?? 0).toFixed(2)}
                        </span>
                        <span className="inventario-celda inventario-celda--concepto">
                          {renderConceptoPago(p)}
                        </span>
                        <span className="inventario-celda inventario-celda--cliente-corte">
                          {nombreCliente(clientes, p.cliente_id)}
                        </span>
                        <span className="inventario-celda inventario-celda--cuenta-corte">
                          {p.cuenta_id != null && p.cuenta_id !== '' ? `#${p.cuenta_id}` : '—'}
                        </span>
                        <span className={`inventario-celda inventario-celda--forma-corte corte-caja-chip corte-caja-chip--${fp.toLowerCase()}`}>
                          {emojiFormaPago(fp)} {fp}
                        </span>
                        <span className="inventario-celda inventario-celda--fecha-corte">
                          {ymd ? formatearFechaCorta(ymd) : '—'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
          </TablaScrollSuperior>
        ) : (
          <ul className="equipo-list inventario-list corte-caja-lista">
            {filtrados.map((p) => {
              const fp = String(p.forma_pago ?? 'EFECTIVO').trim().toUpperCase()
              const ymd = extractFechaPagoYmd(p, cuentasPorIdRef.current)
              return (
                <li key={p.id} className="equipo-card inventario-card corte-caja-card corte-caja-card--solo-lectura">
                  <div className="equipo-card-main inventario-card-main corte-caja-fila-lectura">
                    <strong className="corte-caja-monto-lista">${Number(p.pago ?? 0).toFixed(2)}</strong>
                    <span className="corte-caja-concepto-lista">
                      <span aria-hidden="true">📝</span> {renderConceptoPago(p)}
                    </span>
                    <span className="muted small corte-caja-meta-lista">
                      <span aria-hidden="true">👤</span> {nombreCliente(clientes, p.cliente_id)}
                      {p.cuenta_id != null && p.cuenta_id !== '' ? (
                        <>
                          {' '}
                          · <span aria-hidden="true">🧾</span> Cuenta #{p.cuenta_id}
                        </>
                      ) : null}
                      {ymd ? (
                        <>
                          {' '}
                          · <span aria-hidden="true">📅</span> {formatearFechaCorta(ymd)}
                        </>
                      ) : null}
                    </span>
                    <span className={`corte-caja-chip corte-caja-chip--${fp.toLowerCase()}`}>
                      {emojiFormaPago(fp)} {fp}
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
