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
 * Fecha legible para el mensaje (orden en BD o notificación).
 * @param {string|Date|null|undefined} isoOrDate
 * @returns {string}
 */
export function formatFechaOrdenMensaje(isoOrDate) {
  if (isoOrDate == null || isoOrDate === '') {
    return new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(String(isoOrDate))
  if (Number.isNaN(d.getTime())) {
    return new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
}

function textoDescripcionEquipoWa({ descripcionEquipo, tipoEquipo, serieEquipo }) {
  const desc = String(descripcionEquipo ?? '').trim()
  const tipo = String(tipoEquipo ?? '').trim()
  const ser = String(serieEquipo ?? '').trim()
  const bits = []
  if (desc) bits.push(desc)
  const meta = [tipo && `Tipo: ${tipo}`, ser && `Serie: ${ser}`].filter(Boolean).join(', ')
  if (meta) bits.push(meta)
  return bits.length ? bits.join(' — ') : '—'
}

/**
 * Mensaje completo para el cliente (wa.me o referencia para plantillas).
 * Usa los datos reales de la orden en pantalla.
 *
 * @param {object} p
 * @param {string} [p.negocio]
 * @param {string|number} p.numeroOrden
 * @param {string|Date|null} [p.fechaCreacion] ISO o Date; si falta, hoy
 * @param {string} [p.nombreCliente]
 * @param {string} [p.descripcionEquipo]
 * @param {string} [p.problemasReportados]
 * @param {string} [p.tipoEquipo]
 * @param {string} [p.serieEquipo]
 */
export function buildMensajeOrdenClienteDetalle(p) {
  const neg = String(p?.negocio ?? NEGOCIO_DEFAULT).trim() || NEGOCIO_DEFAULT
  const ord = String(p?.numeroOrden ?? '').trim() || '—'
  const fecha = formatFechaOrdenMensaje(p?.fechaCreacion)
  const nom = String(p?.nombreCliente ?? '').trim() || '—'
  const equipo = textoDescripcionEquipoWa({
    descripcionEquipo: p?.descripcionEquipo,
    tipoEquipo: p?.tipoEquipo,
    serieEquipo: p?.serieEquipo,
  })
  const prob = String(p?.problemasReportados ?? '').trim() || '—'
  return (
    `Hola buen día, de parte de ${neg} le informo lo siguiente:\n\n` +
    `• Número de orden: ${ord}\n` +
    `• Fecha: ${fecha}\n` +
    `• Nombre del cliente: ${nom}\n` +
    `• Descripción del equipo: ${equipo}\n` +
    `• Descripción del problema: ${prob}`
  )
}

/**
 * Construye el mensaje corto (compatibilidad).
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
 * @param {{
 *   orden: string|number,
 *   nombreCliente?: string,
 *   to?: string,
 *   fecha?: string,
 *   descripcionEquipo?: string,
 *   problemasReportados?: string,
 * }} p
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

/** Mensaje más claro cuando Meta aún no aprueba la plantilla o el nombre no coincide. */
export function humanizarErrorWhatsApp(errorMsg) {
  const m = String(errorMsg ?? '').toLowerCase()
  if (
    m.includes('template') &&
    (m.includes('not found') ||
      m.includes('does not exist') ||
      m.includes('not approved') ||
      m.includes('pending') ||
      m.includes('rejected'))
  ) {
    return (
      'La plantilla de WhatsApp no está disponible aún (Meta en revisión o nombre incorrecto). ' +
      'Cuando esté Activa en WhatsApp Manager, vuelva a intentar.'
    )
  }
  if (m.includes('(#132001)') || m.includes('132001')) {
    return 'Plantilla no encontrada: revise WHATSAPP_TEMPLATE_NAME y WHATSAPP_TEMPLATE_LANG (es_MX) en Supabase.'
  }
  return String(errorMsg ?? 'Error al enviar por WhatsApp.')
}

export async function enviarOrdenWhatsAppCloudApi(supabase, p) {
  if (!supabase) return { ok: false, errorMsg: 'Supabase no está configurado.' }
  const { orden, nombreCliente = '', to, fecha, descripcionEquipo, problemasReportados } = p
  const { data, error } = await supabase.functions.invoke('send-whatsapp-orden', {
    body: {
      orden: String(orden),
      nombreCliente: truncarMetaTexto(nombreCliente),
      ...(fecha != null && String(fecha).trim() ? { fecha: truncarMetaTexto(String(fecha).trim(), 120) } : {}),
      ...(descripcionEquipo != null && String(descripcionEquipo).trim()
        ? { descripcionEquipo: truncarMetaTexto(String(descripcionEquipo).trim(), 400) }
        : {}),
      ...(problemasReportados != null && String(problemasReportados).trim()
        ? { problemasReportados: truncarMetaTexto(String(problemasReportados).trim(), 400) }
        : {}),
      ...(to ? { to } : {}),
    },
  })
  if (error) {
    const msg = await mensajeErrorInvoke(error)
    return { ok: false, errorMsg: humanizarErrorWhatsApp(msg) }
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    return { ok: false, errorMsg: humanizarErrorWhatsApp(String(data.error)) }
  }
  return { ok: true, data }
}

/**
 * Confirmación de anticipo vía Edge Function `send-whatsapp-anticipo`.
 * Plantilla Meta: {{1}} cliente, {{2}} orden, {{3}} monto, {{4}} forma pago, {{5}} fecha.
 *
 * @param {object} supabase
 * @param {{
 *   nombreCliente?: string,
 *   orden: string|number,
 *   monto: string,
 *   formaPago?: string,
 *   fecha?: string,
 *   to?: string,
 * }} p
 */
export async function enviarAnticipoWhatsAppCloudApi(supabase, p) {
  if (!supabase) return { ok: false, errorMsg: 'Supabase no está configurado.' }
  const { orden, nombreCliente = '', monto, formaPago = '', fecha, to } = p
  const { data, error } = await supabase.functions.invoke('send-whatsapp-anticipo', {
    body: {
      orden: String(orden),
      nombreCliente: truncarMetaTexto(nombreCliente),
      monto: truncarMetaTexto(monto, 80),
      formaPago: truncarMetaTexto(formaPago, 80),
      ...(fecha != null && String(fecha).trim() ? { fecha: truncarMetaTexto(String(fecha).trim(), 120) } : {}),
      ...(to ? { to } : {}),
    },
  })
  if (error) {
    const msg = await mensajeErrorInvoke(error)
    return { ok: false, errorMsg: humanizarErrorWhatsApp(msg) }
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    return { ok: false, errorMsg: humanizarErrorWhatsApp(String(data.error)) }
  }
  return { ok: true, data }
}

/** Monto legible para plantilla WhatsApp (anticipo). */
export function formatMontoAnticipoWa(monto) {
  const n = Number(monto)
  if (!Number.isFinite(n)) return String(monto ?? '—')
  return `$${n.toFixed(2)} MXN`
}

/**
 * Mensaje de anticipo para wa.me (modo sin API).
 */
export function buildMensajeAnticipoClienteDetalle(p) {
  const neg = String(p?.negocio ?? NEGOCIO_DEFAULT).trim() || NEGOCIO_DEFAULT
  const ord = String(p?.numeroOrden ?? '').trim() || '—'
  const nom = String(p?.nombreCliente ?? '').trim() || '—'
  const monto = String(p?.monto ?? '—').trim() || '—'
  const forma = String(p?.formaPago ?? '').trim() || '—'
  const fecha = formatFechaOrdenMensaje(p?.fecha)
  return (
    `Hola buen día, de parte de ${neg} confirmamos su anticipo:\n\n` +
    `• Cliente: ${nom}\n` +
    `• Orden de servicio: ${ord}\n` +
    `• Monto: ${monto}\n` +
    `• Forma de pago: ${forma}\n` +
    `• Fecha: ${fecha}\n\n` +
    `Gracias por su pago.`
  )
}

/**
 * Abre WhatsApp con mensaje de anticipo (wa.me).
 */
export function abrirWhatsAppAnticipo(p) {
  const { telefono, mensaje: mensajePre, numeroOrden, negocio, nombreCliente, monto, formaPago, fecha } = p
  if (!telefono || !String(telefono).trim()) {
    return { ok: false, motivo: 'sin-telefono' }
  }
  const mensaje =
    mensajePre != null && String(mensajePre).trim()
      ? String(mensajePre).trim()
      : buildMensajeAnticipoClienteDetalle({
          negocio,
          numeroOrden,
          nombreCliente,
          monto,
          formaPago,
          fecha,
        })
  const url = buildWhatsAppUrl({ telefono, mensaje })
  if (!url) return { ok: false, motivo: 'telefono-invalido' }
  const win = window.open(url, '_blank', 'noopener')
  if (!win) return { ok: false, motivo: 'popup-bloqueado' }
  return { ok: true, url }
}

/**
 * Abre WhatsApp Web/app con el mensaje predeterminado de orden ya escrito.
 *
 * @param {{
 *   telefono: string,
 *   mensaje?: string,
 *   numeroOrden?: string|number,
 *   negocio?: string,
 *   fechaCreacion?: string|Date|null,
 *   nombreCliente?: string,
 *   descripcionEquipo?: string,
 *   problemasReportados?: string,
 *   tipoEquipo?: string,
 *   serieEquipo?: string,
 * }} p
 * @returns {{ ok: true, url: string } | { ok: false, motivo: 'sin-telefono' | 'telefono-invalido' | 'popup-bloqueado' }}
 */
export function abrirWhatsAppOrden(p) {
  const { telefono, mensaje: mensajePre, numeroOrden, negocio, fechaCreacion, nombreCliente, descripcionEquipo, problemasReportados, tipoEquipo, serieEquipo } = p
  if (!telefono || !String(telefono).trim()) {
    return { ok: false, motivo: 'sin-telefono' }
  }
  const mensaje =
    mensajePre != null && String(mensajePre).trim()
      ? String(mensajePre).trim()
      : buildMensajeOrdenClienteDetalle({
          negocio,
          numeroOrden: numeroOrden ?? '—',
          fechaCreacion,
          nombreCliente,
          descripcionEquipo,
          problemasReportados,
          tipoEquipo,
          serieEquipo,
        })
  const url = buildWhatsAppUrl({ telefono, mensaje })
  if (!url) return { ok: false, motivo: 'telefono-invalido' }
  const win = window.open(url, '_blank', 'noopener')
  if (!win) return { ok: false, motivo: 'popup-bloqueado' }
  return { ok: true, url }
}
