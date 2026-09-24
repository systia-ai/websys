/** Folio fiscal de factura en cuentas (captura manual por el usuario). */

export function folioFacturaDeCuenta(cuenta) {
  const f = String(cuenta?.folio_factura ?? cuenta?.folioFactura ?? '').trim()
  return f || null
}

export function totalFacturaDeCuenta(cuenta) {
  const n = Number(cuenta?.total_factura ?? cuenta?.totalFactura)
  return Number.isFinite(n) ? n : null
}

/** Interpreta el total de factura escrito por el usuario. */
export function parseTotalFacturaInput(raw) {
  let s = String(raw ?? '').trim()
  if (!s) return null
  s = s.replace(/[$]/g, '').replace(/\s/g, '')
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '')
  else if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function textoTotalFacturaInput(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0.00'
  return v.toFixed(2)
}

export function defaultTotalFactura(cuenta, totalCuenta) {
  const stored = totalFacturaDeCuenta(cuenta)
  if (stored != null) return stored
  const t = Number(totalCuenta ?? 0)
  return Number.isFinite(t) ? t : 0
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
export function activarFacturaEnCuenta(cuenta, folioManual = null, totalFactura = null) {
  const folio =
    normalizarFolioFacturaInput(folioManual) ||
    folioFacturaDeCuenta(cuenta) ||
    null
  const total = parseTotalFacturaInput(totalFactura) ?? defaultTotalFactura(cuenta, totalFactura)
  return {
    lleva_factura: true,
    folio_factura: folio,
    total_factura: total,
  }
}

/** Desactiva la marca; conserva folio y total ya capturados. */
export function desactivarFacturaEnCuenta(cuenta) {
  const folio = folioFacturaDeCuenta(cuenta)
  const total = totalFacturaDeCuenta(cuenta)
  return {
    lleva_factura: false,
    folio_factura: folio,
    total_factura: total,
  }
}

/** Guarda/actualiza folio y total de factura escritos por el usuario. */
export function patchFolioFacturaManual(folioRaw, { llevaFactura = true, totalFactura = null } = {}) {
  const folio = normalizarFolioFacturaInput(folioRaw)
  const total = parseTotalFacturaInput(totalFactura)
  if (total == null) {
    throw new Error('Escriba el total de la factura')
  }
  const patch = {
    lleva_factura: Boolean(llevaFactura),
    total_factura: total,
  }
  if (folio) patch.folio_factura = folio
  return patch
}
