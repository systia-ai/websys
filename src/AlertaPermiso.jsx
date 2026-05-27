/**
 * Recuadro flotante de alerta (rojo/amarillo) para acciones no permitidas.
 */
export default function AlertaPermiso({ mensaje }) {
  if (!mensaje) return null

  return (
    <div className="alerta-permiso-flotante" role="alert" aria-live="assertive">
      <div className="alerta-permiso-flotante-inner">
        <span className="alerta-permiso-flotante-ico" aria-hidden="true">
          🚫
        </span>
        <div>
          <strong className="alerta-permiso-flotante-titulo">Sin permisos</strong>
          <p className="alerta-permiso-flotante-texto">{mensaje}</p>
        </div>
      </div>
    </div>
  )
}
