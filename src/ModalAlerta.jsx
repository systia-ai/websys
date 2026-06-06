const ICONOS = {
  error: '⚠',
  warning: '⚠',
  success: '✓',
  info: 'ℹ',
}

/**
 * Modal de alerta con animación de zumbido y variantes de color.
 * @param {{ open: boolean, onClose?: () => void, titulo: string, mensaje?: string, variante?: 'error'|'warning'|'success'|'info', icono?: string, children?: import('react').ReactNode, footer?: import('react').ReactNode, textoBoton?: string, backdropClose?: boolean, role?: string, tituloId?: string, className?: string }} props
 */
export default function ModalAlerta({
  open,
  onClose,
  titulo,
  mensaje,
  variante = 'error',
  icono,
  children,
  footer,
  textoBoton = 'Entendido',
  backdropClose = true,
  role = 'alertdialog',
  tituloId,
  className = '',
}) {
  if (!open) return null

  const id = tituloId ?? 'modal-alerta-titulo'
  const ico = icono ?? ICONOS[variante] ?? '⚠'

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={() => backdropClose && onClose?.()}
    >
      <div
        className={`modal modal-alerta modal-alerta--${variante}${className ? ` ${className}` : ''}`}
        role={role}
        aria-labelledby={id}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id={id}>
            <span className="modal-alerta-icon" aria-hidden="true">
              {ico}
            </span>
            {titulo}
          </h3>
        </div>
        <div className="modal-body">
          {mensaje ? <p className="modal-alerta-mensaje">{mensaje}</p> : null}
          {children}
        </div>
        <div className="modal-footer">
          {footer ?? (
            <button type="button" className="modal-alerta-btn" onClick={onClose}>
              {textoBoton}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
