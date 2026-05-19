import { ESTATUS_ORDEN } from './catalogos.js'
import { crearSetEstatusTodos } from './reportesFiltros.js'

/**
 * Filtros de reportes / estadísticas (rango de fechas + estatus múltiple, estilo monitor).
 */
export default function ReportesFiltrosCard({
  fechaInicio,
  fechaFin,
  onFechaInicio,
  onFechaFin,
  estatusSeleccionados,
  onEstatusSeleccionados,
  rangoInvalido,
  children,
}) {
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
  }

  return (
    <section className="corte-caja-hero-card card-pad reportes-filtros-card">
      <header className="corte-caja-hero-header">
        <span className="corte-caja-hero-emoji" aria-hidden="true">
          🔎
        </span>
        <h2 className="corte-caja-hero-titulo">Filtros del reporte</h2>
      </header>
      <p className="corte-caja-hero-tip">
        <span className="corte-caja-hero-tip-ico" aria-hidden="true">
          💡
        </span>
        Rango de fechas de la orden y estatus a incluir (puede elegir varios).
      </p>

      <div className="corte-caja-fechas-grid reportes-filtros-fechas">
        <label className="corte-caja-fecha-campo">
          <span className="corte-caja-fecha-label">
            <span aria-hidden="true">🗓️</span> Desde
          </span>
          <div className="corte-caja-fecha-input-wrap">
            <input
              type="date"
              value={fechaInicio}
              max={fechaFin || undefined}
              onChange={(e) => onFechaInicio(e.target.value)}
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
              min={fechaInicio || undefined}
              onChange={(e) => onFechaFin(e.target.value)}
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
          {ESTATUS_ORDEN.map((est) => {
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
        </div>
      </fieldset>

      {children ? <div className="reportes-filtros-acciones">{children}</div> : null}
    </section>
  )
}
