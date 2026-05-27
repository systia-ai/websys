/** Mensaje estándar antes de persistir cliente, equipo u orden nueva. */
export const TEXTO_VERIFICAR_DATOS =
  'Revise la información en el recuadro. No es un error: solo confirma antes de guardar.'

/**
 * Convierte texto "Etiqueta: valor" (líneas) en filas para ConfirmarDatosModal.
 */
export function parseDetalleConfirmacion(detalle = '') {
  if (!detalle) return []
  return detalle
    .split('\n')
    .map((line) => {
      const t = line.trim()
      if (!t) return null
      const i = t.indexOf(':')
      if (i < 0) return { label: t, value: '' }
      return { label: t.slice(0, i).trim(), value: t.slice(i + 1).trim() }
    })
    .filter(Boolean)
}
