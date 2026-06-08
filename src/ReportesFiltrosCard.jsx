import { crearSetEstatusTodos, ESTATUS_ORDEN_REPORTES } from './reportesFiltros.js'
import { TIPOS_SERVICIO_CANONICOS } from './reparacionUtils.js'

/**
 * Filtros de reportes / estadísticas (rango de fechas + estatus múltiple, estilo monitor).
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
  onToggleModoFechaIngreso = null,
  onToggleModoFechaEntrega = null,
  onSoloModoFechaIngreso = null,
  onSoloModoFechaEntrega = null,
  onClearModoFecha = null,
  tiposServicioSeleccionados = new Set(TIPOS_SERVICIO_CANONICOS),
  onTiposServicioSeleccionados = null,
  busqueda = '',
  onBusqueda = null,
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
    onClearModoFecha?.()
    onEstatusSeleccionados(new Set([st]))
  }

  const modoFechaActivo = filtroModoFechaIngreso || filtroModoFechaEntrega

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

  return (
    <section className="corte-caja-hero-card card-pad reportes-filtros-card">
      <header className="corte-caja-hero-header">
        <span className="corte-caja-hero-emoji" aria-hidden="true">
          🔎
        </span>
        <h2 className="corte-caja-hero-titulo">Filtros del reporte</h2>
      </header>

      <div className="corte-caja-fechas-grid reportes-filtros-fechas">
        <label className="corte-caja-fecha-campo">
          <span className="corte-caja-fecha-label">
            <span aria-hidden="true">🗓️</span> Desde
          </span>
          <div className="corte-caja-fecha-input-wrap">
            <input
              type="date"
              value={fechaInicio}
              min={puedeCambiarFechas ? undefined : fechaInicio || undefined}
              max={puedeCambiarFechas ? fechaFin || undefined : fechaInicio || undefined}
              readOnly={!puedeCambiarFechas}
              onClick={!puedeCambiarFechas ? avisarSinPermisoFecha : undefined}
              onFocus={!puedeCambiarFechas ? avisarSinPermisoFecha : undefined}
              onChange={cambiarFechaInicio}
              aria-label="Fecha inicial"
            />
          </div>
        </label>
        <label className="corte-caja-fecha-campo">
          <span className="corte-caja-fecha-label">
            <span aria-hidden="true">📆</span> Hasta
          </span>
          <div className="corte-caja-fecha-input-wrap">
            <input
              type="date"
              value={fechaFin}
              min={puedeCambiarFechas ? fechaInicio || undefined : fechaFin || undefined}
              max={puedeCambiarFechas ? undefined : fechaFin || undefined}
              readOnly={!puedeCambiarFechas}
              onClick={!puedeCambiarFechas ? avisarSinPermisoFecha : undefined}
              onFocus={!puedeCambiarFechas ? avisarSinPermisoFecha : undefined}
              onChange={cambiarFechaFin}
              aria-label="Fecha final"
            />
          </div>
        </label>
      </div>
      {rangoInvalido ? (
        <p className="reportes-rango-aviso" role="alert">
          <span aria-hidden="true">⚠️</span> La fecha inicial no puede ser posterior a la final.
        </p>
      ) : null}

      <label
        className={`monitor-ordenes-label-inline monitor-ordenes-filtros-busqueda monitor-ordenes-tile monitor-ordenes-tile--wide${tileActive(
          Boolean(String(busqueda ?? '').trim()),
        )}`}
      >
        <span className="monitor-ordenes-tile-badge" aria-hidden="true" />
        <span className="monitor-ordenes-tile-label">Buscador</span>
        <div className="monitor-ordenes-fecha-desde">
          <input
            type="search"
            className="monitor-ordenes-busqueda-input"
            value={busqueda}
            onChange={(e) => onBusqueda?.(e.target.value)}
            placeholder="Ej. Garantía Epson, reparado, entregado, #orden..."
            aria-label="Buscar por cliente, orden, estatus, técnico, problema o tipo de servicio"
          />
          <button
            type="button"
            className="monitor-ordenes-fecha-clear"
            onClick={() => onBusqueda?.('')}
            disabled={!String(busqueda ?? '').trim()}
            title="Limpiar buscador"
            aria-label="Limpiar buscador"
          >
            Limpiar
          </button>
        </div>
      </label>

      <fieldset className="monitor-ordenes-fieldset monitor-ordenes-fieldset--fechas-tipo reportes-estatus-fieldset">
        <legend className="monitor-ordenes-legend">Estatus a incluir</legend>
        <div className="reportes-estatus-acciones">
          <button type="button" className="monitor-ordenes-solo" onClick={() => onEstatusSeleccionados(crearSetEstatusTodos())}>
            ✓ Todos
          </button>
          <button type="button" className="monitor-ordenes-solo" onClick={() => onEstatusSeleccionados(new Set())}>
            ✕ Ninguno
          </button>
        </div>
        <div className="monitor-ordenes-estatus-grid">
          {ESTATUS_ORDEN_REPORTES.map((est) => {
            const st = String(est).trim().toUpperCase()
            const checked = estatusSeleccionados.has(st)
            return (
              <label key={est} className="monitor-ordenes-check">
                <input type="checkbox" checked={checked} onChange={() => toggleEstatus(est)} />
                <span>{est}</span>
                <button type="button" className="monitor-ordenes-solo" onClick={() => seleccionarSolo(est)} title="Solo este">
                  Solo
                </button>
              </label>
            )
          })}
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
            <span className="monitor-ordenes-check-text">Fecha ingresado</span>
            <button
              type="button"
              className="monitor-ordenes-solo"
              onClick={(e) => {
                e.preventDefault()
                onSoloModoFechaIngreso?.()
              }}
              title="Solo órdenes ingresadas en el rango de fechas de arriba"
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
            <span className="monitor-ordenes-check-text">Fecha entrega</span>
            <button
              type="button"
              className="monitor-ordenes-solo"
              onClick={(e) => {
                e.preventDefault()
                onSoloModoFechaEntrega?.()
              }}
              title="Solo órdenes entregadas en el rango de fechas de arriba"
            >
              Solo
            </button>
          </label>
        </div>
        {modoFechaActivo ? (
          <p className="monitor-ordenes-rango-aviso monitor-ordenes-rango-aviso--fieldset" role="status">
            Modo fecha activo: se usa el rango «Desde / Hasta» y se omiten los estatus marcados arriba.
          </p>
        ) : null}
      </fieldset>

      <fieldset className="monitor-ordenes-fieldset monitor-ordenes-fieldset--estatus reportes-estatus-fieldset">
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
              <label key={tipo} className={`monitor-ordenes-check monitor-ordenes-tile monitor-ordenes-tile--chip${tileActive(checked)}`}>
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
