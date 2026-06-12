import { totalAvisosMonitor } from './monitorOrdenesAvisos.js'

/**
 * Panel desplegable de avisos al entrar al monitor de órdenes.
 */
export default function MonitorOrdenesAvisosPanel({
  avisos = [],
  expandido = true,
  onToggle,
  filtroAvisoActivo = null,
  onAvisoClick,
  loading = false,
}) {
  const total = totalAvisosMonitor(avisos)

  return (
    <section
      className={`monitor-ordenes-avisos card-pad${filtroAvisoActivo ? ' monitor-ordenes-avisos--filtrando' : ''}`}
      aria-label="Avisos del taller"
    >
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
          ) : filtroAvisoActivo ? (
            'Filtrando aviso'
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
          {loading ? (
            <p className="monitor-ordenes-avisos-vacio muted">Cargando avisos…</p>
          ) : avisos.length === 0 ? (
            <p className="monitor-ordenes-avisos-vacio ok small">
              No hay pendientes destacados en este periodo.
            </p>
          ) : (
            <ul className="monitor-ordenes-avisos-lista">
              {avisos.map((aviso) => {
                const activo = filtroAvisoActivo === aviso.id
                return (
                  <li key={aviso.id}>
                    <button
                      type="button"
                      className={`monitor-ordenes-aviso-item monitor-ordenes-aviso-item--${aviso.variante}${
                        activo ? ' monitor-ordenes-aviso-item--activo' : ''
                      }`}
                      onClick={() => onAvisoClick?.(aviso.id)}
                      title={
                        activo
                          ? 'Quitar filtro y volver a los filtros normales'
                          : 'Ver solo estas órdenes (se desactivan los demás filtros)'
                      }
                      aria-pressed={activo}
                    >
                      <span className="monitor-ordenes-aviso-texto">{aviso.mensaje}</span>
                      <span className="monitor-ordenes-aviso-accion" aria-hidden="true">
                        {activo ? '✕ Quitar' : 'Ver →'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  )
}
