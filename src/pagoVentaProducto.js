/** Cobro de productos en cuenta: el anticipo de servicio no sustituye la venta en el corte. */

export function esConceptoAnticipo(concepto) {
  return /anticipo/i.test(String(concepto ?? ''))
}

export function montoPagoLinea(linea) {
  return Math.abs(Number(linea?.subtotal ?? linea?.precioUnitario ?? linea?.pago ?? 0))
}

/** Pagos de la UI de cuenta, con concepto para distinguir anticipos. */
export function pagosConConceptoDesdeLineas(lineas = []) {
  return (lineas ?? [])
    .filter((l) => l?.tipo === 'pago')
    .map((l) => ({
      pago: montoPagoLinea(l),
      concepto: l.concepto ?? l.descripcion ?? '',
    }))
}

/**
 * True si al agregar un producto el saldo quedaría en 0 solo porque hay anticipo de servicio.
 * En ese caso la venta no genera un pago y el corte no la ve.
 * Un anticipo de pieza/producto sí cubre la venta: no hay que pedir otro cobro.
 */
export function esConceptoAnticipoPieza(concepto) {
  const t = String(concepto ?? '')
  return /anticipo/i.test(t) && /pieza|producto|refacci[oó]n|consumible/i.test(t)
}

export function esConceptoAnticipoServicio(concepto) {
  const t = String(concepto ?? '')
  if (!/anticipo/i.test(t)) return false
  return !esConceptoAnticipoPieza(t)
}

export function ventaProductoCubiertaPorAnticipo({ cargosActuales, pagos, nuevoCargo }) {
  const nuevo = Number(nuevoCargo ?? 0)
  if (!(nuevo > 0.0001)) return false
  const lista = pagos ?? []
  const conImporte = lista.filter((p) => Number(p.pago ?? 0) > 0.0001)
  if (conImporte.some((p) => esConceptoAnticipoPieza(p.concepto))) return false
  const hayAnticipoServicio = conImporte.some((p) => esConceptoAnticipoServicio(p.concepto))
  if (!hayAnticipoServicio) return false
  const pagado = lista.reduce((s, p) => s + Number(p.pago ?? 0), 0)
  const saldoTras = Number(cargosActuales ?? 0) + nuevo - pagado
  return saldoTras <= 0.0001
}

export function payloadPagoVentaProducto({ clienteId, cuentaId, descripcion, monto, formaPago }) {
  return {
    cliente_id: clienteId,
    cuenta_id: cuentaId,
    pago: Number(monto),
    concepto: String(descripcion ?? 'VENTA').trim() || 'VENTA',
    forma_pago: formaPago ?? 'EFECTIVO',
  }
}
