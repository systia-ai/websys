/**
 * `contable` en tabla productos:
 * - true (default): pieza física; valida y descuenta existencia al vender.
 * - false: servicio o concepto (reseteo, mano de obra); se cobra en cuenta sin mover stock.
 */

/** Serie/descripción que indica servicio (aunque en BD quede contable=true por defecto). */
export function pareceProductoServicio(producto) {
  if (!producto || typeof producto !== 'object') return false
  const serie = String(producto.serie ?? '').trim().toUpperCase()
  const desc = String(producto.descripcion ?? '').trim().toUpperCase()
  const tipo = String(producto.tipo ?? producto.tipo_producto ?? '').trim().toUpperCase()
  if (tipo === 'SERVICIO' || tipo === 'SERVICIOS') return true
  if (serie.startsWith('SERVICIO') || serie.startsWith('SERV-') || serie.startsWith('SERV ')) return true
  if (/\bSERVICIO\b/.test(desc)) return true
  if (/\bMANO\s+DE\s+OBRA\b/.test(desc) || /\bRESETEO\b/.test(desc)) return true
  return false
}

export function esProductoContable(producto) {
  if (!producto || typeof producto !== 'object') return true
  const v = producto.contable
  if (v === false || v === 0 || v === '0' || v === 'false' || v === 'FALSE') return false
  if (v === true || v === 1 || v === '1' || v === 'true' || v === 'TRUE') {
    return !pareceProductoServicio(producto)
  }
  if (pareceProductoServicio(producto)) return false
  return true
}

export function etiquetaExistencia(producto) {
  if (!esProductoContable(producto)) return 'Servicio (sin stock)'
  const n = Number(producto?.existencia ?? 0)
  return Number.isFinite(n) ? String(n) : '—'
}
