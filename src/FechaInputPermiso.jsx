/**
 * Campo fecha con bloqueo visual y captura de clic cuando el usuario no puede editarlo.
 */
export default function FechaInputPermiso({
  value,
  min,
  max,
  puedeEditar = true,
  onChange,
  onSinPermiso,
  ariaLabel,
}) {
  function avisarSinPermiso(e) {
    e.preventDefault()
    e.stopPropagation()
    onSinPermiso?.()
  }

  function manejarCambio(e) {
    if (!puedeEditar) {
      avisarSinPermiso(e)
      return
    }
    onChange?.(e)
  }

  return (
    <div
      className={`corte-caja-fecha-input-wrap${puedeEditar ? '' : ' corte-caja-fecha-input-wrap--bloqueada'}`}
    >
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        readOnly={!puedeEditar}
        tabIndex={puedeEditar ? 0 : -1}
        onChange={manejarCambio}
        aria-label={ariaLabel}
        aria-disabled={!puedeEditar}
      />
      {!puedeEditar ? (
        <button
          type="button"
          className="corte-caja-fecha-bloqueo"
          onClick={avisarSinPermiso}
          onMouseDown={avisarSinPermiso}
          aria-label="Sin permiso para cambiar fechas"
          title="Sin permiso para cambiar fechas"
        />
      ) : null}
    </div>
  )
}
