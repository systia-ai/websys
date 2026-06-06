import { TEXTO_VERIFICAR_DATOS } from './confirmarDatosUtils.js'

/**
 * Confirmación de datos antes de guardar (sustituye window.confirm).
 * @param {{ open: boolean, onClose: () => void, onConfirm: () => void | Promise<void>, tituloGrupo?: string, lineas?: { label: string, value?: string }[], confirmando?: boolean, textoConfirmar?: string }} props
 */
export default function ConfirmarDatosModal({
  open,
  onClose,
  onConfirm,
  tituloGrupo = 'Resumen',
  lineas = [],
  confirmando = false,
  textoConfirmar = 'Confirmar y guardar',
}) {
  if (!open) return null

  const lineasVisibles = lineas.filter((l) => {
    const v = l?.value
    return v != null && String(v).trim() !== ''
  })

  return (
    <div
      className="modal-backdrop confirmar-datos-backdrop"
      role="presentation"
      onClick={() => !confirmando && onClose?.()}
    >
      <div
        className="modal modal-alerta modal-alerta--info modal-confirmar-datos"
        role="dialog"
        aria-labelledby="confirmar-datos-heading"
        aria-describedby="confirmar-datos-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header confirmar-datos-header">
          <span className="confirmar-datos-header-ico" aria-hidden="true">
            ✓
          </span>
          <div>
            <h3 id="confirmar-datos-heading">Verificar datos</h3>
            <p id="confirmar-datos-desc" className="confirmar-datos-lead">
              {TEXTO_VERIFICAR_DATOS}
            </p>
          </div>
        </div>
        <div className="modal-body">
          <div className="confirmar-datos-recuadro" role="region" aria-label={tituloGrupo}>
            <h4 className="confirmar-datos-recuadro-titulo">{tituloGrupo}</h4>
            <dl className="confirmar-datos-lista">
              {lineasVisibles.length > 0 ? (
                lineasVisibles.map((l) => (
                  <div key={l.label} className="confirmar-datos-fila">
                    <dt>{l.label}</dt>
                    <dd>{l.value}</dd>
                  </div>
                ))
              ) : (
                <p className="muted small">Sin datos adicionales.</p>
              )}
            </dl>
          </div>
          <p className="confirmar-datos-pregunta">¿Los datos son correctos? Confirme para guardar.</p>
        </div>
        <div className="modal-footer">
          <button type="button" className="secondary" onClick={onClose} disabled={confirmando}>
            Volver a editar
          </button>
          <button
            type="button"
            className="btn-confirm-guardar"
            disabled={confirmando}
            onClick={() => void onConfirm?.()}
          >
            {confirmando ? 'Guardando…' : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
