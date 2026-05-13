/**
 * Utilidades para abrir conversaciones de WhatsApp via wa.me.
 *
 * No hay servidor ni API: se construye una URL `https://wa.me/<telefono>?text=...`
 * y el navegador la abre con la sesión de WhatsApp Web (o la app) que el operador
 * tenga iniciada en su PC/celular.
 */

const NEGOCIO_DEFAULT = 'SISTEBIT'
const PAIS_DEFAULT = '52'

/**
 * Normaliza un teléfono al formato exigido por wa.me: sólo dígitos, con código
 * de país y (para celulares MX) el "1" móvil que sigue Meta.
 *
 * Reglas:
 *   - 10 dígitos          → se asume MX celular → `52` + `1` + número
 *   - 11 dígitos y "1..." → MX celular sin código país → `52` + número
 *   - 12 dígitos y "52.." → MX falta el "1" móvil    → `521` + 10 últimos
 *   - 13 dígitos y "521.."→ ya está OK
 *   - 8–15 dígitos con otro patrón → se respeta tal cual (clientes extranjeros)
 *   - Cualquier otro caso → `null`
 *
 * @param {string} raw
 * @param {string} [defaultPais='52']
 * @returns {string|null}
 */
export function normalizarTelefonoWa(raw, defaultPais = PAIS_DEFAULT) {
  if (raw == null) return null
  const dig = String(raw).replace(/\D+/g, '')
  if (!dig) return null

  if (dig.length === 10) return `${defaultPais}1${dig}`
  if (dig.length === 11 && dig.startsWith('1')) return `${defaultPais}${dig}`
  if (defaultPais === '52' && dig.length === 12 && dig.startsWith('52') && dig[2] !== '1') {
    return `521${dig.slice(2)}`
  }
  if (dig.length >= 8 && dig.length <= 15) return dig
  return null
}

/**
 * Construye el mensaje predeterminado de notificación de orden.
 * @param {string|number} numeroOrden
 * @param {string} [negocio]
 */
export function buildMensajeOrden(numeroOrden, negocio = NEGOCIO_DEFAULT) {
  return `Hola buen día, de parte de ${negocio} le informo que su número de orden es ${numeroOrden}.`
}

/**
 * Construye la URL `https://wa.me/...` para una conversación con un teléfono y mensaje dados.
 * @param {{ telefono: string, mensaje: string }} p
 * @returns {string|null} URL lista para abrir, o null si el teléfono no es válido.
 */
export function buildWhatsAppUrl({ telefono, mensaje }) {
  const tel = normalizarTelefonoWa(telefono)
  if (!tel) return null
  const txt = encodeURIComponent(mensaje ?? '')
  return `https://wa.me/${tel}?text=${txt}`
}

/**
 * Abre WhatsApp Web/app con el mensaje predeterminado de orden ya escrito.
 *
 * @param {{ telefono: string, numeroOrden: string|number, negocio?: string }} p
 * @returns {{ ok: true, url: string } | { ok: false, motivo: 'sin-telefono' | 'telefono-invalido' | 'popup-bloqueado' }}
 */
export function abrirWhatsAppOrden({ telefono, numeroOrden, negocio }) {
  if (!telefono || !String(telefono).trim()) {
    return { ok: false, motivo: 'sin-telefono' }
  }
  const mensaje = buildMensajeOrden(numeroOrden, negocio)
  const url = buildWhatsAppUrl({ telefono, mensaje })
  if (!url) return { ok: false, motivo: 'telefono-invalido' }
  const win = window.open(url, '_blank', 'noopener')
  if (!win) return { ok: false, motivo: 'popup-bloqueado' }
  return { ok: true, url }
}
