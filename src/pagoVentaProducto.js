/** Conceptos de anticipo en cuenta y corte. */

export function esConceptoAnticipo(concepto) {
  return /anticipo/i.test(String(concepto ?? ''))
}

/**
 * Antes pedía forma de pago si el anticipo de servicio cubría el producto.
 * Eso ya no aplica: el producto se agrega a la lista y el anticipo permanece en la cuenta.
 */
export function ventaProductoCubiertaPorAnticipo() {
  return false
}
