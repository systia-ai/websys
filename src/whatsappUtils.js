import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'

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
 * Envía notificación de orden vía WhatsApp Cloud API (Supabase Edge Function `send-whatsapp-orden`).
 * El token de Meta vive solo en secretos del servidor.
 *
 * @param {object} supabase Cliente `@supabase/supabase-js`.
 * @param {{ orden: string|number, nombreCliente?: string, to?: string }} p
 * @returns {Promise<{ ok: true, data?: unknown } | { ok: false, errorMsg: string }>}
 */
function truncarMetaTexto(s, max = 900) {
  const t = String(s ?? '')
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

/**
 * Cuando la Edge Function responde 4xx/5xx, supabase-js lanza `FunctionsHttpError` y `data` es null.
 * El JSON con `error` viene en `error.context` (Response).
 */
async function mensajeErrorInvoke(error) {
  if (error instanceof FunctionsHttpError && error.context?.json) {
    try {
      const body = await error.context.json()
      if (body && typeof body === 'object') {
        if (typeof body.error === 'string') return body.error
        if (body.error && typeof body.error === 'object' && typeof body.error.message === 'string') {
          return body.error.message
        }
        if (body.meta?.error?.message) return String(body.meta.error.message)
      }
    } catch {
      /* ignore */
    }
    return `${error.message} (HTTP ${error.context.status})`
  }
  if (error instanceof FunctionsRelayError) {
    return error.message || 'Error de relay al invocar la función.'
  }
  if (error instanceof FunctionsFetchError) {
    return error.message || 'No se pudo conectar con la Edge Function (red o CORS).'
  }
  return error?.message ?? 'Error al invocar la función.'
}

export async function enviarOrdenWhatsAppCloudApi(supabase, p) {
  if (!supabase) return { ok: false, errorMsg: 'Supabase no está configurado.' }
  const { orden, nombreCliente = '', to } = p
  const { data, error } = await supabase.functions.invoke('send-whatsapp-orden', {
    body: { orden: String(orden), nombreCliente: truncarMetaTexto(nombreCliente), ...(to ? { to } : {}) },
  })
  if (error) {
    const msg = await mensajeErrorInvoke(error)
    return { ok: false, errorMsg: msg }
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    return { ok: false, errorMsg: String(data.error) }
  }
  return { ok: true, data }
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
