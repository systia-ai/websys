import { useCallback, useMemo, useState } from 'react'
import FechaInputPermiso from './FechaInputPermiso.jsx'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'
import { normalizeClienteRow } from './clienteUtils.js'
import { fetchAllRows } from './supabaseFetchAll.js'
import {
  formatFechaLegibleEsMx,
  formatMontoCuenta,
  ymdHoyLocal,
  ymdLocalDesdeDate,
} from './reparacionUtils.js'
import {
  folioFacturaDeCuenta,
} from './cuentaFacturaUtils.js'
import {
  MODOS_REPORTE_FACTURAS,
  etiquetaCriterioReporteFacturas,
  fechaCuentaFacturaYmd,
  filtrarCuentasParaReporteFacturas,
  importeFacturaDeCuenta,
  nombreClienteDeCuenta,
  ordenarCuentasFacturaPorFolio,
  resumenTotalesReporteFacturas,
  validarCriterioReporteFacturas,
} from './reportesFacturas.js'

const LS_CLIENTES = 'sistefix_local_clientes'
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

function formatearFechaCorta(ymdStr) {
  if (!ymdStr || ymdStr.length < 10) return ymdStr || '—'
  return formatFechaLegibleEsMx(ymdStr, { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ReportesFacturasView({
  supabase,
  onVolver,
  onHome,
  onError,
  onNotice,
  puedeElegirRangoFechas = false,
  onIntentoSinPermisoFecha = null,
}) {
  const [pantalla, setPantalla] = useState('filtros')
  const [modo, setModo] = useState('rango')
  const [fechaInicio, setFechaInicio] = useState(() => (puedeElegirRangoFechas ? ymdInicioMes() : ymdHoy()))
  const [fechaFin, setFechaFin] = useState(ymdHoy)
  const [folio, setFolio] = useState('')
  const [loading, setLoading] = useState(false)
  const [filas, setFilas] = useState([])
  const [criterioAplicado, setCriterioAplicado] = useState('')
  const [vista, setVista] = useState('lista')

  const rangoInvalido = Boolean(fechaInicio && fechaFin && fechaInicio > fechaFin)
  const tileActive = (on) => (on ? ' monitor-ordenes-tile--active' : '')

  const optsCriterio = useMemo(
    () => ({
      modo,
      ini: fechaInicio,
      fin: fechaFin,
      folio,
    }),
    [modo, fechaInicio, fechaFin, folio],
  )

  const resumen = useMemo(() => resumenTotalesReporteFacturas(filas), [filas])

  function cambiarFechaInicio(e) {
    if (!puedeElegirRangoFechas) {
      onIntentoSinPermisoFecha?.()
      return
    }
    setFechaInicio(e.target.value)
  }

  function cambiarFechaFin(e) {
    if (!puedeElegirRangoFechas) {
      onIntentoSinPermisoFecha?.()
      return
    }
    setFechaFin(e.target.value)
  }

  const generar = useCallback(async () => {
    const errorCriterio = validarCriterioReporteFacturas(optsCriterio)
    if (errorCriterio) {
      onError?.(errorCriterio)
      return
    }
    if (modo === 'rango' && rangoInvalido) {
      onError?.('La fecha inicial no puede ser mayor que la final.')
      return
    }
    setLoading(true)
    try {
      let cuentas = []
      let clientes = []
      if (supabase) {
        const [cuRows, cliRows] = await Promise.all([
          fetchAllRows(() => supabase.from('cuentas').select('*').order('id', { ascending: false })),
          fetchAllRows(() => supabase.from('clientes').select('*').order('id', { ascending: true })),
        ])
        cuentas = cuRows
        clientes = (cliRows ?? []).map((r) => normalizeClienteRow(r))
      } else {
        cuentas = readLs(LS_CUENTAS, [])
        clientes = readLs(LS_CLIENTES, []).map((r) => normalizeClienteRow(r))
      }
      const encontradas = ordenarCuentasFacturaPorFolio(
        filtrarCuentasParaReporteFacturas(cuentas, clientes, optsCriterio),
      )
      const conNombre = encontradas.map((cuenta) => ({
        ...cuenta,
        _clienteNombre: nombreClienteDeCuenta(cuenta, clientes) || 'Cliente no encontrado',
        _folio: folioFacturaDeCuenta(cuenta) || '—',
        _fecha: fechaCuentaFacturaYmd(cuenta),
        _importe: importeFacturaDeCuenta(cuenta),
      }))
      setFilas(conNombre)
      setCriterioAplicado(etiquetaCriterioReporteFacturas(optsCriterio))
      setPantalla('resultados')
      if (conNombre.length === 0) {
        onNotice?.('No se encontraron facturas con ese criterio.')
      }
    } catch (e) {
      onError?.(`Error al generar el reporte de facturas: ${e.message}`)
      setFilas([])
    } finally {
      setLoading(false)
    }
  }, [supabase, optsCriterio, modo, rangoInvalido, onError, onNotice])

  async function abrirPdf() {
    if (filas.length === 0) {
      onError?.('No hay datos del reporte para abrir.')
      return
    }
    try {
      const { abrirReporteFacturasPdf } = await import('./reporteFacturasPdf.js')
      abrirReporteFacturasPdf({
        criterioTxt: criterioAplicado,
        importeTxt: formatMontoCuenta(resumen.importe),
        filas: filas.map((f) => ({
          fecha: f._fecha ? formatearFechaCorta(f._fecha) : '—',
          folio: f._folio,
          cliente: f._clienteNombre,
          cuenta: f.id != null ? String(f.id) : '—',
          orden: f.repara_id != null ? String(f.repara_id) : '—',
          total: formatMontoCuenta(f._importe),
          estatus: String(f.estatus ?? '—'),
        })),
      })
    } catch (e) {
      onError?.(`No se pudo abrir el PDF del reporte: ${e?.message ?? e}`)
    }
  }

  function volverAFiltros() {
    setPantalla('filtros')
    setFilas([])
    setCriterioAplicado('')
  }

  const filtrosCard = (
    <section className="corte-caja-hero-card card-pad reportes-filtros-card">
      <header className="corte-caja-hero-header">
        <span className="corte-caja-hero-emoji" aria-hidden="true">
          🧾
        </span>
        <h2 className="corte-caja-hero-titulo">Filtros del reporte de facturas</h2>
      </header>
      <p className="corte-caja-hero-tip">
        <span className="corte-caja-hero-tip-ico" aria-hidden="true">
          💡
        </span>
        El rango de fechas usa la fecha de la cuenta. También puede generar el reporte por folio fiscal. La lista
        siempre se ordena por folio. Solo se incluyen cuentas marcadas con «Lleva factura».
      </p>

      <div
        className={`monitor-ordenes-filtros-rango monitor-ordenes-tile monitor-ordenes-tile--wide${tileActive(
          modo === 'rango',
        )}`}
      >
        <span className="monitor-ordenes-tile-badge" aria-hidden="true" />
        <span className="monitor-ordenes-filtros-grupo-titulo">Rango de fechas</span>
        <div className="monitor-ordenes-rango-inputs reportes-filtros-fechas">
          <label className="corte-caja-fecha-campo monitor-ordenes-label-fecha">
            <span className="corte-caja-fecha-label">Desde</span>
            <FechaInputPermiso
              value={fechaInicio}
              min={puedeElegirRangoFechas ? undefined : fechaInicio || undefined}
              max={puedeElegirRangoFechas ? fechaFin || undefined : fechaInicio || undefined}
              puedeEditar={puedeElegirRangoFechas}
              onChange={cambiarFechaInicio}
              onSinPermiso={onIntentoSinPermisoFecha}
              ariaLabel="Fecha inicial"
            />
          </label>
          <label className="corte-caja-fecha-campo monitor-ordenes-label-fecha">
            <span className="corte-caja-fecha-label">Hasta</span>
            <FechaInputPermiso
              value={fechaFin}
              min={puedeElegirRangoFechas ? fechaInicio || undefined : fechaFin || undefined}
              max={puedeElegirRangoFechas ? undefined : fechaFin || undefined}
              puedeEditar={puedeElegirRangoFechas}
              onChange={cambiarFechaFin}
              onSinPermiso={onIntentoSinPermisoFecha}
              ariaLabel="Fecha final"
            />
          </label>
        </div>
        {rangoInvalido ? (
          <p className="corte-caja-fecha-error" role="alert">
            La fecha inicial no puede ser mayor que la final.
          </p>
        ) : null}
      </div>

      <fieldset className="reportes-facturas-criterio" role="radiogroup" aria-label="Generar el reporte por">
        <legend className="monitor-ordenes-filtros-grupo-titulo">Generar reporte por</legend>
        <div className="reportes-facturas-criterio-opciones">
          {MODOS_REPORTE_FACTURAS.map((opt) => (
            <label
              key={opt.id}
              className={`monitor-ordenes-check monitor-ordenes-tile monitor-ordenes-tile--chip${tileActive(
                modo === opt.id,
              )}`}
            >
              <input
                type="radio"
                name="reporte-facturas-modo"
                className="monitor-ordenes-check-input"
                checked={modo === opt.id}
                onChange={() => setModo(opt.id)}
              />
              <span className="monitor-ordenes-check-text">{opt.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {modo === 'folio' ? (
        <label className="reportes-facturas-campo">
          <span>Folio fiscal</span>
          <input
            className="full"
            value={folio}
            onChange={(e) => setFolio(e.target.value)}
            placeholder="Ej. A-1234 o UUID del CFDI"
            autoComplete="off"
          />
        </label>
      ) : null}

      <div className="reportes-filtros-acciones">
        <button
          type="button"
          className="btn-agregar-equipo btn-consultar-corte-caja"
          onClick={() => void generar()}
          disabled={loading || (modo === 'rango' && rangoInvalido)}
        >
          {loading ? '⏳ Generando…' : '📋 GENERAR REPORTE'}
        </button>
      </div>
    </section>
  )

  return (
    <div className="servicios-root inventarios-root reportes-modulo-root">
      <header className="servicios-appbar">
        <button
          type="button"
          className="icon-back"
          onClick={pantalla === 'resultados' ? volverAFiltros : onVolver}
          aria-label="Atrás"
        >
          ←
        </button>
        <h1 className="servicios-appbar-title">
          <span className="appbar-title-emoji" aria-hidden="true">
            🧾
          </span>
          Reporte de Facturas
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
        {pantalla === 'filtros' ? filtrosCard : null}

        {pantalla === 'resultados' ? (
          <>
            {criterioAplicado ? (
              <div className="corte-caja-periodo-banner card-pad" role="status">
                <span className="corte-caja-periodo-ico" aria-hidden="true">
                  📆
                </span>
                <span>
                  <strong>Criterio:</strong> {criterioAplicado}
                </span>
              </div>
            ) : null}

            <section className="reportes-kpi-grid card-pad" aria-label="Resumen de facturas">
              <div className="reportes-kpi" style={{ borderTopColor: '#1565c0' }}>
                <span className="reportes-kpi-label">
                  <span className="reportes-kpi-swatch" style={{ background: '#1565c0' }} aria-hidden />
                  Facturas
                </span>
                <strong className="reportes-kpi-valor">{resumen.cantidad}</strong>
              </div>
              <div className="reportes-kpi" style={{ borderTopColor: '#2e7d32' }}>
                <span className="reportes-kpi-label">
                  <span className="reportes-kpi-swatch" style={{ background: '#2e7d32' }} aria-hidden />
                  Importe
                </span>
                <strong className="reportes-kpi-valor">{formatMontoCuenta(resumen.importe)}</strong>
              </div>
            </section>

            {filtrosCard}

            <div className="reportes-acciones-row">
              <button
                type="button"
                className="btn-agregar-equipo btn-imprimir-corte-caja"
                onClick={() => void abrirPdf()}
                disabled={loading || filas.length === 0}
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
                  onClick={() => setVista('lista')}
                  aria-pressed={vista === 'lista'}
                >
                  Lista
                </button>
                <button
                  type="button"
                  className={`inventario-vista-btn${vista === 'tabla' ? ' activo' : ''}`}
                  onClick={() => setVista('tabla')}
                  aria-pressed={vista === 'tabla'}
                >
                  Tabla
                </button>
              </div>
            </div>

            <section className="monitor-ordenes-resultados reportes-resultados-monitor">
              <p className="muted small">
                {filas.length === 1 ? '1 factura encontrada' : `${filas.length} facturas encontradas`}
              </p>
              {vista === 'tabla' ? (
                <TablaScrollSuperior
                  ariaLabel="Facturas del reporte"
                  classNameWrap="orden-resultados-tabla-wrap cuentas-cliente-tabla-wrap"
                  syncDeps={[filas]}
                >
                  <table className="cuentas-cliente-tabla orden-resultados-tabla">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Folio fiscal</th>
                        <th>Cliente</th>
                        <th>Cuenta</th>
                        <th>Orden</th>
                        <th>Total</th>
                        <th>Estatus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.length === 0 ? (
                        <tr>
                          <td colSpan={7}>Sin facturas con el criterio seleccionado</td>
                        </tr>
                      ) : (
                        filas.map((f) => (
                          <tr key={f.id}>
                            <td>{f._fecha ? formatearFechaCorta(f._fecha) : '—'}</td>
                            <td>{f._folio}</td>
                            <td className="orden-resultados-cliente">{f._clienteNombre}</td>
                            <td>{f.id ?? '—'}</td>
                            <td>{f.repara_id ?? '—'}</td>
                            <td>{formatMontoCuenta(f._importe)}</td>
                            <td>{f.estatus ?? '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </TablaScrollSuperior>
              ) : (
                <ul className="equipo-list inventario-list reportes-lista">
                  {filas.length === 0 ? (
                    <li className="muted">Sin facturas con el criterio seleccionado</li>
                  ) : (
                    filas.map((f) => (
                      <li key={f.id} className="equipo-card inventario-card reportes-card">
                        <div className="equipo-card-main inventario-card-main reportes-fila">
                          <strong>
                            {f._folio !== '—' ? f._folio : `Cuenta #${f.id ?? '—'}`}
                          </strong>
                          <span className="reportes-cliente-lista">{f._clienteNombre}</span>
                          <span className="muted small reportes-meta-lista">
                            {f._fecha ? formatearFechaCorta(f._fecha) : 'Sin fecha'}
                            {f.id != null ? ` · Cuenta #${f.id}` : ''}
                            {f.repara_id != null ? ` · Orden #${f.repara_id}` : ''}
                          </span>
                          <span className="muted small reportes-meta-lista">
                            Total {formatMontoCuenta(f._importe)}
                            {f.estatus ? ` · ${f.estatus}` : ''}
                          </span>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}
