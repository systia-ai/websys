/**
 * URL de la vista pública de etiqueta (HashRouter: #/etiqueta?…).
 * Compatible con GitHub Pages (base /websys/).
 */
export function buildEtiquetaQrUrl({ nombre, orden, equipo, etiquetaId }) {
  const qs = new URLSearchParams()
  qs.set('n', nombre ?? '')
  qs.set('o', String(orden ?? ''))
  qs.set('e', equipo ?? '')
  if (etiquetaId) qs.set('k', String(etiquetaId))
  return `${window.location.origin}${import.meta.env.BASE_URL}#/etiqueta?${qs.toString()}`
}

/** Escapar texto para insertar en HTML de ventana de impresión. */
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
