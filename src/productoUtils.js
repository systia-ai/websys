/**
 * `contable` en tabla productos:
 * - true (default): pieza física; valida y descuenta existencia al vender.
 * - false: servicio o concepto (reseteo, mano de obra); se cobra en cuenta sin mover stock.
 */
export function esProductoContable(producto) {
  if (!producto || typeof producto !== 'object') return true
  const v = producto.contable
  if (v === false || v === 0 || v === '0' || v === 'false' || v === 'FALSE') return false
  return true
}

export function etiquetaExistencia(producto) {
  if (!esProductoContable(producto)) return 'Servicio (sin stock)'
  const n = Number(producto?.existencia ?? 0)
  return Number.isFinite(n) ? String(n) : '—'
}
