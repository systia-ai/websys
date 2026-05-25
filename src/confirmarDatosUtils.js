/** Mensaje estándar antes de persistir cliente, equipo u orden nueva. */
export const TEXTO_VERIFICAR_DATOS =
  'Verifique que sus datos son correctos antes de continuar.'

/**
 * Diálogo de confirmación (navegador). Devuelve true si el usuario acepta guardar.
 */
export function confirmarDatosAntesDeGuardar(detalle = '') {
  const extra = detalle ? `\n\n${detalle}` : ''
  return window.confirm(`${TEXTO_VERIFICAR_DATOS}${extra}\n\n¿Desea guardar?`)
}
