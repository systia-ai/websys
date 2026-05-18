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
    <section className="monitor-ordenes-filtros card-pad reportes-filtros-card">
      <h2 className="monitor-ordenes-filtros-titulo">Filtros</h2>
      <p className="muted small reportes-filtros-desc">
        Rango de fechas de la orden y estatus a incluir (puede elegir varios).
      </p>

      <div className="monitor-ordenes-rango-fechas reportes-filtros-fechas">
        <div className="monitor-ordenes-rango-inputs">
          <label className="monitor-ordenes-label-inline monitor-ordenes-label-fecha">
            <span>Desde</span>
            <input
              type="date"
              value={fechaInicio}
              max={fechaFin || undefined}
              onChange={(e) => onFechaInicio(e.target.value)}
              aria-label="Fecha inicial"
            />
          </label>
          <label className="monitor-ordenes-label-inline monitor-ordenes-label-fecha">
            <span>Hasta</span>
            <input
              type="date"
              value={fechaFin}
              min={fechaInicio || undefined}
              onChange={(e) => onFechaFin(e.target.value)}
              aria-label="Fecha final"
            />
          </label>
        </div>
        {rangoInvalido ? (
          <p className="monitor-ordenes-rango-aviso" role="alert">
            La fecha inicial no puede ser posterior a la final.
          </p>
        ) : null}
      </div>

      <fieldset className="monitor-ordenes-fieldset">
        <legend className="monitor-ordenes-legend">Estatus a incluir</legend>
        <div className="reportes-estatus-acciones">
          <button type="button" className="monitor-ordenes-solo" onClick={() => onEstatusSeleccionados(crearSetEstatusTodos())}>
            Todos
          </button>
          <button type="button" className="monitor-ordenes-solo" onClick={() => onEstatusSeleccionados(new Set())}>
            Ninguno
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
