/**
 * Recuadro flotante de alerta (rojo/amarillo) para acciones no permitidas.
 */
import { useEffect, useState } from 'react'

export default function AlertaPermiso({ mensaje }) {
  const [animKey, setAnimKey] = useState(0)

  useEffect(() => {
    if (mensaje) setAnimKey((k) => k + 1)
  }, [mensaje])

  if (!mensaje) return null

  return (
    <div className="alerta-permiso-flotante" role="alert" aria-live="assertive">
      <div className="alerta-permiso-flotante-mover" key={animKey}>
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
    </div>
  )
}
