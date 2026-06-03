/**
 * Saldo de cuenta: los anticipos solo cubren cargos de reparación/servicio,
 * no productos de venta (p. ej. tintas). Otros pagos cubren ventas primero.
 */

export function esPagoAnticipo(pago) {
  const c = String(pago?.concepto ?? pago?.descripcion ?? '').toLowerCase()
  return c.includes('anticipo')
}

export function extraerConceptoDescripcionPago(desc) {
  const m = String(desc ?? '').match(/^PAGO:\s*(.+?)\s*\(/)
  return m ? m[1].trim() : String(desc ?? '').trim()
}

export function montoLineaCargo(linea) {
  return Number(linea?.subtotal ?? 0)
}

export function esLineaCargoReparacion(linea) {
  const t = String(linea?.tipo ?? '')
  return t === 'reparamov' || t === 'reparacion_cargo'
}

export function totalCargosVentaDesdeLineas(lineas = []) {
  return lineas
    .filter((l) => l.tipo !== 'pago' && !esLineaCargoReparacion(l))
    .reduce((s, l) => s + Math.max(0, montoLineaCargo(l)), 0)
}

export function totalCargosReparacionDesdeLineas(lineas = []) {
  return lineas
    .filter((l) => esLineaCargoReparacion(l))
    .reduce((s, l) => s + Math.max(0, montoLineaCargo(l)), 0)
}

export function totalCargosDesdeLineas(lineas = []) {
  return totalCargosVentaDesdeLineas(lineas) + totalCargosReparacionDesdeLineas(lineas)
}

export function sumCargosCuentamov(movs = []) {
  return (movs ?? []).reduce((s, m) => {
    const line = Number(m.cantidad ?? 0) * Number(m.costo ?? 0)
    return line > 0.0001 ? s + line : s
  }, 0)
}

export function sumCargosReparamov(movs = []) {
  return (movs ?? []).reduce((s, m) => {
    const line = Number(m.cantidad ?? 0) * Number(m.costo ?? 0)
    return line > 0.0001 ? s + line : s
  }, 0)
}

export function sumPagosAnticipo(pagos = []) {
  return (pagos ?? []).reduce((s, p) => (esPagoAnticipo(p) ? s + Number(p.pago ?? 0) : s), 0)
}

export function sumPagosNoAnticipo(pagos = []) {
  return (pagos ?? []).reduce((s, p) => (!esPagoAnticipo(p) ? s + Number(p.pago ?? 0) : s), 0)
}

export function pagosDesdeLineasPago(lineas = []) {
  return lineas
    .filter((l) => l.tipo === 'pago')
    .map((l) => ({
      pago: Math.abs(Number(l.subtotal ?? l.precioUnitario ?? 0)),
      concepto: l.concepto ?? extraerConceptoDescripcionPago(l.descripcion),
    }))
}

/**
 * @param {{ cargosVenta?: number, cargosReparacion?: number, pagos?: object[] }} p
 * @returns {number} Adeudo pendiente (≥ 0)
 */
export function calcularSaldoPendienteAnticipo(p) {
  const cv = Math.max(0, Number(p?.cargosVenta ?? 0) || 0)
  const cr = Math.max(0, Number(p?.cargosReparacion ?? 0) || 0)
  const pagos = p?.pagos ?? []
  const anticipo = sumPagosAnticipo(pagos)
  const otros = sumPagosNoAnticipo(pagos)

  const pagadoVenta = Math.min(cv, otros)
  const restoOtros = Math.max(0, otros - pagadoVenta)
  const aplicadoReparacion = Math.min(cr, anticipo + restoOtros)

  return Math.max(0, cv - pagadoVenta) + Math.max(0, cr - aplicadoReparacion)
}

/** Anticipo registrado que aún no se aplica (no hay cargo de servicio o sobra). */
export function calcularAnticipoDisponible(p) {
  const cr = Math.max(0, Number(p?.cargosReparacion ?? 0) || 0)
  const pagos = p?.pagos ?? []
  const anticipo = sumPagosAnticipo(pagos)
  if (anticipo <= 0.0001) return 0
  const otros = sumPagosNoAnticipo(pagos)
  const cv = Math.max(0, Number(p?.cargosVenta ?? 0) || 0)
  const pagadoVenta = Math.min(cv, otros)
  const restoOtros = Math.max(0, otros - pagadoVenta)
  const aplicadoRep = Math.min(cr, anticipo + restoOtros)
  const usadoDeAnticipo = Math.min(anticipo, Math.max(0, aplicadoRep - Math.min(restoOtros, cr)))
  return Math.max(0, anticipo - usadoDeAnticipo)
}

export function calcularSaldoPendienteDesdeLineas(lineas = [], pagosOverride) {
  const pagos = pagosOverride ?? pagosDesdeLineasPago(lineas)
  return calcularSaldoPendienteAnticipo({
    cargosVenta: totalCargosVentaDesdeLineas(lineas),
    cargosReparacion: totalCargosReparacionDesdeLineas(lineas),
    pagos,
  })
}

export function calcularSaldoPendienteDesdeMovs(pagos = [], movsCuenta = [], movsReparacion = []) {
  return calcularSaldoPendienteAnticipo({
    cargosVenta: sumCargosCuentamov(movsCuenta),
    cargosReparacion: sumCargosReparamov(movsReparacion),
    pagos,
  })
}
