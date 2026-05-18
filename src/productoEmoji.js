/** Mapa local de iconos elegidos por el usuario (id de producto → emoji). */
export const LS_PRODUCTO_ICONOS = 'sistefix_producto_iconos'

const REGLAS = [
  { keys: ['tinta', 'cartucho', 'toner', 'tóner', 'cilindro', 'botella'], emoji: '🖨️' },
  { keys: ['impresora', 'printer', 'multifuncional', 'plotter', 'epson', 'l355', 'l325', 'l3150'], emoji: '🖨️' },
  { keys: ['pantalla', 'display', 'lcd', 'led', 'monitor', 'panel'], emoji: '📺' },
  { keys: ['cable', 'usb', 'hdmi', 'alimentacion', 'alimentación', 'corriente', 'adaptador'], emoji: '🔌' },
  { keys: ['teclado', 'keyboard'], emoji: '⌨️' },
  { keys: ['mouse', 'raton', 'ratón'], emoji: '🖱️' },
  { keys: ['tambor', 'drum', 'unidad', 'fusor', 'fuser'], emoji: '⚙️' },
  { keys: ['rodillo', 'pickup', 'alimentador'], emoji: '🔄' },
  { keys: ['cabezal', 'head', 'inyector'], emoji: '💧' },
  { keys: ['papel', 'hoja', 'bond'], emoji: '📄' },
  { keys: ['tornillo', 'tornillos', 'perno', 'tuerca'], emoji: '🔩' },
  { keys: ['herramienta', 'destornillador', 'pinza'], emoji: '🛠️' },
  { keys: ['limpieza', 'alcohol', 'hisopo', 'servilleta'], emoji: '🧴' },
  { keys: ['chip', 'ic', 'tarjeta', 'placa', 'mainboard'], emoji: '💾' },
  { keys: ['wifi', 'red', 'ethernet', 'lan'], emoji: '📡' },
  { keys: ['bateria', 'batería', 'pila'], emoji: '🔋' },
  { keys: ['fundas', 'carcasa', 'cover'], emoji: '📦' },
  { keys: ['servicio', 'mano de obra', 'reparacion', 'reparación'], emoji: '🔧' },
  { keys: ['scanner', 'escaner', 'escáner'], emoji: '📠' },
  { keys: ['memoria', 'ram', 'ssd', 'disco'], emoji: '💽' },
]

/** Emojis que el usuario puede elegir al editar un producto. */
export const EMOJIS_ELEGIR = [
  '🖨️',
  '📺',
  '💧',
  '🖱️',
  '⌨️',
  '🔌',
  '⚙️',
  '🔄',
  '📄',
  '🔩',
  '🛠️',
  '🧴',
  '💾',
  '📡',
  '🔋',
  '📦',
  '🔧',
  '📠',
  '💽',
  '🏷️',
]

export function readIconosMap() {
  try {
    const raw = localStorage.getItem(LS_PRODUCTO_ICONOS)
    const o = raw ? JSON.parse(raw) : {}
    return o && typeof o === 'object' ? o : {}
  } catch {
    return {}
  }
}

export function guardarIconoProducto(productoId, emoji) {
  if (productoId == null || !emoji) return
  const map = readIconosMap()
  map[String(productoId)] = emoji
  localStorage.setItem(LS_PRODUCTO_ICONOS, JSON.stringify(map))
}

export function sugerirEmojiPorTexto(serie = '', descripcion = '') {
  const texto = `${serie} ${descripcion}`.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  for (const { keys, emoji } of REGLAS) {
    if (keys.some((k) => texto.includes(k.normalize('NFD').replace(/\p{M}/gu, '')))) {
      return emoji
    }
  }
  return '📦'
}

/**
 * Icono del producto: guardado por el usuario, columna `icono`/`emoji`, o sugerido por texto.
 */
export function emojiParaProducto(producto, iconosMap = null) {
  if (!producto) return '📦'
  const map = iconosMap ?? readIconosMap()
  const id = producto.id
  if (id != null && map[String(id)]) return map[String(id)]
  const guardado = producto.icono ?? producto.emoji
  if (guardado && String(guardado).trim()) return String(guardado).trim()
  return sugerirEmojiPorTexto(producto.serie, producto.descripcion)
}
