import { MONITOR_AVISOS_DESDE_YMD, totalAvisosMonitor } from './monitorOrdenesAvisos.js'

function formatearDesdeLegible(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ymd
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Panel desplegable de avisos al entrar al monitor de órdenes.
 */
export default function MonitorOrdenesAvisosPanel({
  avisos = [],
  expandido = true,
  onToggle,
  filtroAvisoActivo = null,
  onAvisoClick,
  onQuitarFiltroAviso,
  loading = false,
}) {
  const total = totalAvisosMonitor(avisos)
  const desdeLegible = formatearDesdeLegible(MONITOR_AVISOS_DESDE_YMD)

  return (
    <section className="monitor-ordenes-avisos card-pad" aria-label="Avisos del taller">
      <button
        type="button"
        className="monitor-ordenes-avisos-toggle"
        onClick={onToggle}
        aria-expanded={expandido}
        aria-controls="monitor-ordenes-avisos-panel"
      >
        <span className="monitor-ordenes-avisos-toggle-titulo">
          <span className="monitor-ordenes-avisos-icon" aria-hidden="true">
            📢
          </span>
          Avisos del taller
        </span>
        <span className="monitor-ordenes-avisos-resumen">
          {loading ? (
            'Calculando…'
          ) : total > 0 ? (
            <>
              <span className="monitor-ordenes-avisos-badge">{total}</span>
              {total === 1 ? ' pendiente' : ' pendientes'}
            </>
          ) : (
            'Todo al día'
          )}
        </span>
        <span className="monitor-ordenes-avisos-chevron" aria-hidden="true">
          {expandido ? '▲' : '▼'}
        </span>
      </button>

      {expandido ? (
        <div id="monitor-ordenes-avisos-panel" className="monitor-ordenes-avisos-body">
          <p className="monitor-ordenes-avisos-nota muted small">
            Solo órdenes desde el {desdeLegible} (antes no había sistema).
          </p>
          {loading ? (
            <p className="monitor-ordenes-avisos-vacio muted">Cargando avisos…</p>
          ) : avisos.length === 0 ? (
            <p className="monitor-ordenes-avisos-vacio ok small">
              No hay pendientes destacados en este periodo.
            </p>
          ) : (
            <ul className="monitor-ordenes-avisos-lista">
              {avisos.map((aviso) => (
                <li key={aviso.id}>
                  <button
                    type="button"
                    className={`monitor-ordenes-aviso-item monitor-ordenes-aviso-item--${aviso.variante}${
                      filtroAvisoActivo === aviso.id ? ' monitor-ordenes-aviso-item--activo' : ''
                    }`}
                    onClick={() => onAvisoClick?.(aviso.id)}
                    title="Ver estas órdenes en la tabla"
                  >
                    <span className="monitor-ordenes-aviso-texto">{aviso.mensaje}</span>
                    <span className="monitor-ordenes-aviso-accion" aria-hidden="true">
                      Ver →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {filtroAvisoActivo ? (
            <button
              type="button"
              className="monitor-ordenes-avisos-quitar-filtro secondary"
              onClick={onQuitarFiltroAviso}
            >
              Quitar filtro de aviso
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
