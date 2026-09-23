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
 * True si al agregar un producto el saldo quedaría en 0 solo porque ya hay anticipo.
 * En ese caso la venta no genera un pago y el corte no la ve.
 */
export function ventaProductoCubiertaPorAnticipo({ cargosActuales, pagos, nuevoCargo }) {
  const nuevo = Number(nuevoCargo ?? 0)
  if (!(nuevo > 0.0001)) return false
  const lista = pagos ?? []
  const hayAnticipo = lista.some((p) => esConceptoAnticipo(p.concepto) && Number(p.pago ?? 0) > 0.0001)
  if (!hayAnticipo) return false
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
