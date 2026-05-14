import ReparacionesOrden from './ReparacionesOrden.jsx'
import OrdenBusquedaInicial from './OrdenBusquedaInicial.jsx'

/** Sesión ya definida (desde Equipos/Clientes o tras elegir en la búsqueda) → mostrar formulario completo. */
function tieneSesionOrdenCargada(session) {
  const s = session ?? {}
  const rid = s.reparacionId != null && String(s.reparacionId).trim() !== ''
  const desdeContexto =
    (s.equipoSerie != null && String(s.equipoSerie).trim() !== '') ||
    (s.clienteNombre != null && String(s.clienteNombre).trim() !== '')
  return Boolean(rid || desdeContexto)
}

/**
 * Contenedor dedicado para la orden de servicio (como OrdenesScreen.kt):
 * primero búsqueda por No de orden / estatus (o fechas si no hay número); luego ReparacionesOrden.
 */
export default function OrdenServicioModulo({
  supabase,
  session,
  onHome,
  onIrEquipos,
  onIrClientes,
  onSalir,
  onSeleccionarOrdenDesdeBusqueda,
  onClearOrdenSession,
  onError,
  onNotice,
  error,
  notice,
}) {
  const mostrarFormulario = tieneSesionOrdenCargada(session)

  return (
    <div className="servicios-root orden-servicio-modulo">
      <header className="servicios-appbar servicios-appbar--dense">
        <button type="button" className="icon-back" onClick={onHome} aria-label="Atrás">
          ←
        </button>
        <h1 className="servicios-appbar-title">
          <span className="appbar-title-emoji" aria-hidden="true">📝</span>
          Orden de servicio
        </h1>
        <div className="appbar-actions-cluster">
          {mostrarFormulario ? (
            <button type="button" className="appbar-text-btn appbar-text-btn--narrow" onClick={onClearOrdenSession}>
              Otra orden
            </button>
          ) : null}
          <button type="button" className="appbar-text-btn appbar-text-btn--narrow" onClick={onIrEquipos}>
            Equipos
          </button>
          <button type="button" className="appbar-text-btn appbar-text-btn--narrow" onClick={onIrClientes}>
            Clientes
          </button>
        </div>
      </header>

      <div className="servicios-body rep-module-wrap orden-servicio-body">
        {!supabase && (
          <p className="warning">Modo local: datos en navegador; defina variables Supabase para producción.</p>
        )}
        {error ? <p className="error">{error}</p> : null}
        {notice ? <p className="ok">{notice}</p> : null}

        {!mostrarFormulario ? (
          <OrdenBusquedaInicial supabase={supabase} onSeleccionarOrden={onSeleccionarOrdenDesdeBusqueda} onError={onError} />
        ) : (
          <ReparacionesOrden
            key={[
              session?.equipoSerie ?? '',
              session?.reparacionId ?? '',
              session?.clienteTelefono ?? '',
              session?.clienteNombre ?? '',
            ].join('|')}
            supabase={supabase}
            session={session ?? {}}
            onSalir={onSalir}
            onError={onError}
            onNotice={onNotice}
            omitOuterHeader
          />
        )}
      </div>
    </div>
  )
}
