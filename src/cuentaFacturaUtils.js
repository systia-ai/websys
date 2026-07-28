/** Folio fiscal de factura en cuentas (captura manual por el usuario). */

export function folioFacturaDeCuenta(cuenta) {
  const f = String(cuenta?.folio_factura ?? cuenta?.folioFactura ?? '').trim()
  return f || null
}

export function cuentaMarcadaParaFactura(cuenta) {
  if (cuenta?.lleva_factura === true || cuenta?.llevaFactura === true) return true
  if (cuenta?.lleva_factura === false || cuenta?.llevaFactura === false) return false
  return Boolean(folioFacturaDeCuenta(cuenta))
}

export function normalizarFolioFacturaInput(raw) {
  return String(raw ?? '').trim()
}

/** Activa marca de factura; el folio lo escribe el usuario (opcional al marcar). */
export function activarFacturaEnCuenta(cuenta, folioManual = null) {
  const folio =
    normalizarFolioFacturaInput(folioManual) ||
    folioFacturaDeCuenta(cuenta) ||
    null
  return {
    lleva_factura: true,
    folio_factura: folio,
  }
}

/** Desactiva la marca; conserva el folio ya capturado. */
export function desactivarFacturaEnCuenta(cuenta) {
  const folio = folioFacturaDeCuenta(cuenta)
  return {
    lleva_factura: false,
    folio_factura: folio,
  }
}

/** Guarda/actualiza el folio fiscal escrito por el usuario. */
export function patchFolioFacturaManual(folioRaw, { llevaFactura = true } = {}) {
  const folio = normalizarFolioFacturaInput(folioRaw)
  if (!folio) {
    throw new Error('Escriba el folio fiscal de la factura')
  }
  return {
    lleva_factura: Boolean(llevaFactura),
    folio_factura: folio,
  }
}
