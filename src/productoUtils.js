/**
 * `contable` en tabla productos:
 * - true (default): pieza física; valida y descuenta existencia al vender.
 * - false: servicio o concepto (reseteo, mano de obra); se cobra en cuenta sin mover stock.
 */

const TIPOS_FISICOS = new Set(['CONSUMIBLE', 'REFACCION'])
const TIPOS_SERVICIO = new Set(['SERVICIO', 'SERVICIOS'])

function quitarAcentos(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/** Canoniza tipo de catálogo: CONSUMIBLE | REFACCION | SERVICIO | ''. */
export function normalizarTipoProducto(valor) {
  const u = quitarAcentos(valor).trim().toUpperCase()
  if (u === 'CONSUMIBLE' || u === 'CONSUMIBLES') return 'CONSUMIBLE'
  if (u === 'REFACCION' || u === 'REFACCIONES') return 'REFACCION'
  if (u === 'SERVICIO' || u === 'SERVICIOS') return 'SERVICIO'
  return u
}

/** Prefiere `tipo_producto` (catálogo) sobre `tipo` (columna antigua/ambigua). */
export function tipoProductoDe(producto) {
  if (!producto || typeof producto !== 'object') return ''
  const desdeTipoProducto = normalizarTipoProducto(producto.tipo_producto)
  if (TIPOS_FISICOS.has(desdeTipoProducto) || desdeTipoProducto === 'SERVICIO') return desdeTipoProducto
  const desdeTipo = normalizarTipoProducto(producto.tipo)
  if (TIPOS_FISICOS.has(desdeTipo) || desdeTipo === 'SERVICIO') return desdeTipo
  const serie = String(producto.serie ?? '').trim().toUpperCase()
  if (serie.startsWith('S-')) return 'SERVICIO'
  if (serie.startsWith('R-')) return 'REFACCION'
  if (serie.startsWith('C-')) return 'CONSUMIBLE'
  return ''
}

function flagContableCrudo(valor) {
  if (valor === false || valor === 0 || valor === '0' || valor === 'false' || valor === 'FALSE') return false
  if (valor === true || valor === 1 || valor === '1' || valor === 'true' || valor === 'TRUE') return true
  return null
}

/** Serie/descripción que indica servicio (aunque en BD quede contable=true por defecto). */
export function pareceProductoServicio(producto) {
  if (!producto || typeof producto !== 'object') return false
  const tipoCanon = tipoProductoDe(producto)
  if (TIPOS_FISICOS.has(tipoCanon)) return false
  if (TIPOS_SERVICIO.has(tipoCanon)) return true
  const serie = String(producto.serie ?? '').trim().toUpperCase()
  const desc = String(producto.descripcion ?? '').trim().toUpperCase()
  if (serie.startsWith('SERVICIO') || serie.startsWith('SERV-') || serie.startsWith('SERV ')) return true
  if (/\bSERVICIO\b/.test(desc)) return true
  if (/\bMANO\s+DE\s+OBRA\b/.test(desc) || /\bRESETEO\b/.test(desc)) return true
  return false
}

export function esProductoContable(producto) {
  if (!producto || typeof producto !== 'object') return true
  const flag = flagContableCrudo(producto.contable)
  if (flag === false) return false

  const tipoCanon = tipoProductoDe(producto)
  if (TIPOS_FISICOS.has(tipoCanon)) return true
  if (tipoCanon === 'SERVICIO') return false

  if (flag === true) return !pareceProductoServicio(producto)
  if (pareceProductoServicio(producto)) return false
  return true
}

export function etiquetaExistencia(producto) {
  if (!esProductoContable(producto)) return 'Servicio (sin stock)'
  const n = Number(producto?.existencia ?? 0)
  return Number.isFinite(n) ? String(n) : '—'
}
