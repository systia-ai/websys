import FechaInputPermiso from './FechaInputPermiso.jsx'
import {
  crearSetEstatusTodos,
  etiquetaEstatusChipReporte,
  ESTATUS_REPORTES_ANCLADOS_FIN,
  ESTATUS_REPORTES_ANCLADOS_INICIO,
  ESTATUS_REPORTES_SECUNDARIOS,
} from './reportesFiltros.js'
import { ESTATUS_BAJA, ESTATUS_ENTREGADO_SIN_REPARACION, TIPOS_SERVICIO_CANONICOS } from './reparacionUtils.js'

/**
 * Filtros de reportes: mismos chips que el monitor (sin avisos ni buscador).
 * Equipos que entraron, que salieron y filtrar por estatus se pueden combinar.
 */
export default function ReportesFiltrosCard({
  fechaInicio,
  fechaFin,
  onFechaInicio,
  onFechaFin,
  puedeCambiarFechas = true,
  onIntentoSinPermisoFecha = null,
  estatusSeleccionados,
  onEstatusSeleccionados,
  filtroModoFechaIngreso = false,
  filtroModoFechaEntrega = false,
  filtroPorEstatus = false,
  onToggleModoFechaIngreso = null,
  onToggleModoFechaEntrega = null,
  onToggleFiltroPorEstatus = null,
  onSoloFiltroEstatus = null,
  onSoloModoFechaIngreso = null,
  onSoloModoFechaEntrega = null,
  tiposServicioSeleccionados = new Set(TIPOS_SERVICIO_CANONICOS),
  onTiposServicioSeleccionados = null,
  rangoInvalido,
  children,
}) {
  const tiposServicioLista = TIPOS_SERVICIO_CANONICOS
  const tileActive = (on) => (on ? ' monitor-ordenes-tile--active' : '')

  function avisarSinPermisoFecha() {
    onIntentoSinPermisoFecha?.()
  }

  function cambiarFechaInicio(e) {
    if (!puedeCambiarFechas) {
      avisarSinPermisoFecha()
      return
    }
    onFechaInicio(e.target.value)
  }

  function cambiarFechaFin(e) {
    if (!puedeCambiarFechas) {
      avisarSinPermisoFecha()
      return
    }
    onFechaFin(e.target.value)
  }

  function toggleEstatus(est) {
    const st = String(est).trim().toUpperCase()
    onEstatusSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(st)) next.delete(st)
      else next.add(st)
      return next
    })
  }

  function seleccionarSolo(est) {
    const st = String(est).trim().toUpperCase()
    onEstatusSeleccionados(new Set([st]))
    onSoloFiltroEstatus?.()
  }

  function toggleTipoServicio(tipo) {
    if (!onTiposServicioSeleccionados) return
    const t = String(tipo).trim().toUpperCase()
    onTiposServicioSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  function seleccionarSoloTipoServicio(tipo) {
    if (!onTiposServicioSeleccionados) return
    onTiposServicioSeleccionados(new Set([String(tipo).trim().toUpperCase()]))
  }

  function chipFiltroEstatus(est) {
    const st = String(est).trim().toUpperCase()
    const checked = estatusSeleccionados.has(st)
    return (
      <label
        key={est}
        className={`monitor-ordenes-check monitor-ordenes-tile monitor-ordenes-tile--chip${tileActive(checked)}`}
      >
        <span className="monitor-ordenes-tile-badge" aria-hidden="true" />
        <input
          type="checkbox"
          className="monitor-ordenes-check-input"
          checked={checked}
          onChange={() => toggleEstatus(est)}
        />
        <span className="monitor-ordenes-check-text">{etiquetaEstatusChipReporte(est)}</span>
        <button
          type="button"
          className="monitor-ordenes-solo"
          onClick={(e) => {
            e.preventDefault()
            seleccionarSolo(est)
          }}
          title={
            st === ESTATUS_ENTREGADO_SIN_REPARACION
              ? 'Solo equipos entregados sin reparación'
              : st === ESTATUS_BAJA
                ? 'Solo equipos dados de baja'
                : 'Solo este'
          }
        >
          Solo
        </button>
      </label>
    )
  }

  return (
    <section className="corte-caja-hero-card card-pad reportes-filtros-card">
      <header className="corte-caja-hero-header">
        <span className="corte-caja-hero-emoji" aria-hidden="true">
          🔎
        </span>
        <h2 className="corte-caja-hero-titulo">Filtros del reporte</h2>
      </header>

      <div
        className={`monitor-ordenes-filtros-rango monitor-ordenes-tile monitor-ordenes-tile--wide${tileActive(
          Boolean(fechaInicio || fechaFin),
        )}`}
      >
        <span className="monitor-ordenes-tile-badge" aria-hidden="true" />
        <span className="monitor-ordenes-filtros-grupo-titulo">Rango de fechas</span>
        <div className="monitor-ordenes-rango-inputs reportes-filtros-fechas">
          <label className="corte-caja-fecha-campo monitor-ordenes-label-fecha">
            <span className="corte-caja-fecha-label">Desde</span>
            <FechaInputPermiso
              value={fechaInicio}
              min={puedeCambiarFechas ? undefined : fechaInicio || undefined}
              max={puedeCambiarFechas ? fechaFin || undefined : fechaInicio || undefined}
              puedeEditar={puedeCambiarFechas}
              onChange={cambiarFechaInicio}
              onSinPermiso={avisarSinPermisoFecha}
              ariaLabel="Fecha inicial"
            />
          </label>
          <label className="corte-caja-fecha-campo monitor-ordenes-label-fecha">
            <span className="corte-caja-fecha-label">Hasta</span>
            <FechaInputPermiso
              value={fechaFin}
              min={puedeCambiarFechas ? fechaInicio || undefined : fechaFin || undefined}
              max={puedeCambiarFechas ? undefined : fechaFin || undefined}
              puedeEditar={puedeCambiarFechas}
              onChange={cambiarFechaFin}
              onSinPermiso={avisarSinPermisoFecha}
              ariaLabel="Fecha final"
            />
          </label>
        </div>
        <div
          className="monitor-ordenes-rango-modos"
          role="group"
          aria-label="Incluir en el reporte: equipos que entraron, equipos que salieron y/o filtrar por estatus"
        >
          <label
            className={`monitor-ordenes-check monitor-ordenes-tile monitor-ordenes-tile--chip${tileActive(filtroModoFechaIngreso)}`}
          >
            <span className="monitor-ordenes-tile-badge" aria-hidden="true" />
            <input
              type="checkbox"
              className="monitor-ordenes-check-input"
              checked={filtroModoFechaIngreso}
              onChange={() => onToggleModoFechaIngreso?.()}
            />
            <span className="monitor-ordenes-check-text">Equipos que entraron</span>
            <button
              type="button"
              className="monitor-ordenes-solo"
              onClick={(e) => {
                e.preventDefault()
                onSoloModoFechaIngreso?.()
              }}
              title="Solo órdenes con fecha de ingreso en el rango"
            >
              Solo
            </button>
          </label>
          <label
            className={`monitor-ordenes-check monitor-ordenes-tile monitor-ordenes-tile--chip${tileActive(filtroModoFechaEntrega)}`}
          >
            <span className="monitor-ordenes-tile-badge" aria-hidden="true" />
            <input
              type="checkbox"
              className="monitor-ordenes-check-input"
              checked={filtroModoFechaEntrega}
              onChange={() => onToggleModoFechaEntrega?.()}
            />
            <span className="monitor-ordenes-check-text">Equipos que salieron</span>
            <button
              type="button"
              className="monitor-ordenes-solo"
              onClick={(e) => {
                e.preventDefault()
                onSoloModoFechaEntrega?.()
              }}
              title="Solo órdenes con fecha de entrega en el rango"
            >
              Solo
            </button>
          </label>
          <label
            className={`monitor-ordenes-check monitor-ordenes-tile monitor-ordenes-tile--chip monitor-ordenes-check--filtrar-estatus${tileActive(filtroPorEstatus)}`}
          >
            <span className="monitor-ordenes-tile-badge" aria-hidden="true" />
            <input
              type="checkbox"
              className="monitor-ordenes-check-input"
              checked={filtroPorEstatus}
              onChange={() => onToggleFiltroPorEstatus?.()}
            />
            <span className="monitor-ordenes-check-text">Filtrar por estatus</span>
          </label>
        </div>
        {rangoInvalido ? (
          <p className="monitor-ordenes-rango-aviso" role="alert">
            La fecha inicial no puede ser posterior a la final.
          </p>
        ) : null}
        <p className="monitor-ordenes-rango-aviso monitor-ordenes-rango-aviso--fieldset" role="status">
          Lo que marque se incluye en el reporte y las gráficas (se pueden combinar entrada, salida y estatus).
        </p>
      </div>

      {filtroPorEstatus ? (
        <fieldset className="monitor-ordenes-fieldset monitor-ordenes-fieldset--estatus monitor-ordenes-tile monitor-ordenes-tile--wide reportes-estatus-fieldset">
          <legend className="monitor-ordenes-legend">Estatus de la orden</legend>
          <div className="reportes-estatus-acciones">
            <button
              type="button"
              className="monitor-ordenes-solo"
              onClick={() => onEstatusSeleccionados(crearSetEstatusTodos())}
            >
              ✓ Todos
            </button>
            <button type="button" className="monitor-ordenes-solo" onClick={() => onEstatusSeleccionados(new Set())}>
              ✕ Ninguno
            </button>
          </div>
          <div className="monitor-ordenes-estatus-grid monitor-ordenes-estatus-grid--orden">
            {ESTATUS_REPORTES_ANCLADOS_INICIO.map((est) => chipFiltroEstatus(est))}
            {ESTATUS_REPORTES_SECUNDARIOS.map((est) => chipFiltroEstatus(est))}
            {ESTATUS_REPORTES_ANCLADOS_FIN.map((est) => chipFiltroEstatus(est))}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="monitor-ordenes-fieldset monitor-ordenes-fieldset--estatus monitor-ordenes-tile monitor-ordenes-tile--wide reportes-estatus-fieldset">
        <legend className="monitor-ordenes-legend">Tipo de servicio</legend>
        <div className="reportes-estatus-acciones">
          <button
            type="button"
            className="monitor-ordenes-solo"
            onClick={() => onTiposServicioSeleccionados?.(new Set(tiposServicioLista))}
          >
            ✓ Todos
          </button>
          <button type="button" className="monitor-ordenes-solo" onClick={() => onTiposServicioSeleccionados?.(new Set())}>
            ✕ Ninguno
          </button>
        </div>
        <div className="monitor-ordenes-estatus-grid">
          {tiposServicioLista.map((tipo) => {
            const checked = tiposServicioSeleccionados.has(tipo)
            return (
              <label
                key={tipo}
                className={`monitor-ordenes-check monitor-ordenes-tile monitor-ordenes-tile--chip${tileActive(checked)}`}
              >
                <span className="monitor-ordenes-tile-badge" aria-hidden="true" />
                <input
                  type="checkbox"
                  className="monitor-ordenes-check-input"
                  checked={checked}
                  onChange={() => toggleTipoServicio(tipo)}
                />
                <span className="monitor-ordenes-check-text">{tipo}</span>
                <button
                  type="button"
                  className="monitor-ordenes-solo"
                  onClick={() => seleccionarSoloTipoServicio(tipo)}
                  title="Solo este tipo"
                >
                  Solo
                </button>
              </label>
            )
          })}
        </div>
      </fieldset>

      {children ? <div className="reportes-filtros-acciones">{children}</div> : null}
    </section>
  )
}
