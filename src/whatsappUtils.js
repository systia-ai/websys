import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'
import { formatFechaLegibleEsMx } from './reparacionUtils.js'

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
 * Normaliza teléfono MX para WhatsApp: `52` + 10 dígitos (sin el "1" intermedio).
 *
 * Reglas:
 *   - 10 dígitos           → `52` + número
 *   - 11 dígitos y "1…"    → `52` + últimos 10 (quita el 1 de marcado)
 *   - 12 dígitos y "52…"   → ya OK
 *   - 13 dígitos y "521…"  → quita el 1 → `52` + 10 dígitos
 *   - 8–15 otro patrón     → tal cual (extranjero)
 *
 * @param {string} raw
 * @param {string} [defaultPais='52']
 * @returns {string|null}
 */
export function normalizarTelefonoWa(raw, defaultPais = PAIS_DEFAULT) {
  if (raw == null) return null
  let dig = String(raw).replace(/\D+/g, '')
  if (!dig) return null

  if (defaultPais === '52') {
    if (dig.length > 13) {
      const m = dig.match(/52\d{10}$/)
      if (m) dig = m[0]
    }
    if (dig.length === 13 && dig.startsWith('521')) return `52${dig.slice(3)}`
    if (dig.length === 10) return `${defaultPais}${dig}`
    if (dig.length === 11 && dig.startsWith('1')) return `${defaultPais}${dig.slice(1)}`
    if (dig.length === 12 && dig.startsWith('52')) return dig
  }

  if (dig.length >= 8 && dig.length <= 15) return dig
  return null
}

/** Muestra +52 462 264 7020 a partir de 524622647020 */
export function formatearTelefonoWaDisplay(e164) {
  const d = String(e164 ?? '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('52')) {
    return `+52 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`
  }
  if (d.length === 13 && d.startsWith('521')) {
    return `+52 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`
  }
  return d ? `+${d}` : '—'
}

/**
 * Fecha legible para el mensaje (orden en BD o notificación).
 * @param {string|Date|null|undefined} isoOrDate
 * @returns {string}
 */
export function formatFechaOrdenMensaje(isoOrDate) {
  return formatFechaLegibleEsMx(isoOrDate, { day: 'numeric', month: 'long', year: 'numeric' })
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

function montoMensajeWa(value) {
  const v = Number(value)
  if (!Number.isFinite(v)) return '$0.00'
  return `$${v.toFixed(2)}`
}

function limpiarDescripcionCotizacionWa(descripcion) {
  return String(descripcion ?? '')
    .replace(/^\[(COTIZACIÓN|VENTA)\]\s*/i, '')
    .trim() || '—'
}

function buildDetalleLineasCotizacionWa(lineas = []) {
  if (!lineas.length) return '• (Sin conceptos)'
  return lineas
    .map((l) => {
      const cant = Number(l.cantidad ?? 0)
      const desc = limpiarDescripcionCotizacionWa(l.descripcion)
      const sub = montoMensajeWa(l.subtotal ?? cant * Number(l.precioUnitario ?? l.costo ?? 0))
      return `• ${cant} × ${desc} — ${sub}`
    })
    .join('\n')
}

/**
 * Detalle de líneas en una sola línea para plantilla Meta (sin saltos de línea).
 * @param {object[]} lineas
 * @param {string|null} [notas]
 */
export function buildDetalleCotizacionPlantillaWa(lineas = [], notas = null) {
  const partes = []
  if (lineas.length) {
    partes.push(
      lineas
        .map((l) => {
          const cant = Number(l.cantidad ?? 0)
          const desc = limpiarDescripcionCotizacionWa(l.descripcion)
          const sub = montoMensajeWa(l.subtotal ?? cant * Number(l.precioUnitario ?? l.costo ?? 0))
          return `${cant} x ${desc} (${sub})`
        })
        .join(' | '),
    )
  } else {
    partes.push('Sin conceptos')
  }
  const n = String(notas ?? '').trim()
  if (n) partes.push(`Notas: ${n}`)
  return partes.join(' | ')
}

/**
 * Mensaje de cotización para el cliente (wa.me).
 *
 * @param {object} p
 * @param {string} [p.negocio]
 * @param {string|number} p.numeroCotizacion
 * @param {string|Date|null} [p.fechaCreacion]
 * @param {string} [p.nombreCliente]
 * @param {object[]} [p.lineas]
 * @param {string|number} [p.total]
 * @param {string|null} [p.notas]
 */
export function buildMensajeCotizacionCliente(p) {
  const neg = String(p?.negocio ?? NEGOCIO_DEFAULT).trim() || NEGOCIO_DEFAULT
  const num = String(p?.numeroCotizacion ?? '').trim() || '—'
  const fecha = formatFechaOrdenMensaje(p?.fechaCreacion)
  const nom = String(p?.nombreCliente ?? '').trim() || '—'
  const detalle = buildDetalleLineasCotizacionWa(p?.lineas ?? [])
  const total = montoMensajeWa(p?.total)
  let msg =
    `Hola buen día, de parte de ${neg} le compartimos su cotización:\n\n` +
    `• Número de cotización: ${num}\n` +
    `• Fecha: ${fecha}\n` +
    `• Cliente: ${nom}\n\n` +
    `Detalle:\n${detalle}\n\n` +
    `Total cotización: ${total}`
  const notas = String(p?.notas ?? '').trim()
  if (notas) msg += `\n\nNotas: ${notas}`
  msg += '\n\nQuedamos atentos a sus comentarios.'
  return msg
}

/**
 * Abre WhatsApp Web/app con el mensaje de cotización ya escrito.
 *
 * @param {{
 *   telefono: string,
 *   mensaje?: string,
 *   numeroCotizacion?: string|number,
 *   negocio?: string,
 *   fechaCreacion?: string|Date|null,
 *   nombreCliente?: string,
 *   lineas?: object[],
 *   total?: string|number,
 *   notas?: string|null,
 * }} p
 */
export function abrirWhatsAppCotizacion(p) {
  const {
    telefono,
    mensaje: mensajePre,
    numeroCotizacion,
    negocio,
    fechaCreacion,
    nombreCliente,
    lineas,
    total,
    notas,
  } = p
  if (!telefono || !String(telefono).trim()) {
    return { ok: false, motivo: 'sin-telefono' }
  }
  const mensaje =
    mensajePre != null && String(mensajePre).trim()
      ? String(mensajePre).trim()
      : buildMensajeCotizacionCliente({
          negocio,
          numeroCotizacion,
          fechaCreacion,
          nombreCliente,
          lineas,
          total,
          notas,
        })
  const url = buildWhatsAppUrl({ telefono, mensaje })
  if (!url) return { ok: false, motivo: 'telefono-invalido' }
  const win = window.open(url, '_blank', 'noopener')
  if (!win) return { ok: false, motivo: 'popup-bloqueado' }
  return { ok: true, url }
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

/** Interpreta respuesta de Edge Function WhatsApp (mismo criterio para todas las plantillas). */
async function procesarRespuestaInvokeWhatsApp(data, error) {
  if (error) {
    const msg = await mensajeErrorInvoke(error)
    return { ok: false, errorMsg: humanizarErrorWhatsApp(msg) }
  }
  if (data && typeof data === 'object' && data.error) {
    return { ok: false, errorMsg: humanizarErrorWhatsApp(String(data.error)) }
  }
  if (!data || typeof data !== 'object' || data.ok !== true) {
    return {
      ok: false,
      errorMsg: humanizarErrorWhatsApp(String(data?.error ?? 'No se confirmó el envío por WhatsApp.')),
    }
  }
  const toReal = data.to ? String(data.to) : null
  return { ok: true, data, toDisplay: toReal ? formatearTelefonoWaDisplay(toReal) : null }
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
    return 'Plantilla no encontrada: revise los nombres WHATSAPP_TEMPLATE_* y WHATSAPP_TEMPLATE_LANG (es_MX) en Supabase.'
  }
  if (
    m.includes('131030') ||
    m.includes('not in allowed') ||
    m.includes('allow list') ||
    m.includes('lista de permitidos')
  ) {
    return (
      'Meta no permite enviar a ese número: agréguelo como destinatario de prueba en ' +
      'Meta → WhatsApp → API Setup (o pase la app a modo Live).'
    )
  }
  if (m.includes('133010') || m.includes('not a valid whatsapp')) {
    return 'Ese número no tiene WhatsApp activo o el formato es incorrecto (use 10 dígitos o +52 1 …).'
  }
  if (m.includes('invalid oauth') || m.includes('expired') || m.includes('access token')) {
    return 'Token de WhatsApp inválido o vencido: genere uno nuevo en Meta y actualice WHATSAPP_ACCESS_TOKEN en Supabase.'
  }
  return String(errorMsg ?? 'Error al enviar por WhatsApp.')
}

/** Teléfono listo para Cloud API; mensaje si no es válido. */
export function telefonoWaParaEnvio(raw) {
  const to = normalizarTelefonoWa(raw)
  if (!to) {
    return {
      ok: false,
      errorMsg:
        'Teléfono no válido para WhatsApp. Ejemplo México: 4622647020 o 52 462 264 7020.',
    }
  }
  return { ok: true, to, display: formatearTelefonoWaDisplay(to) }
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
  return procesarRespuestaInvokeWhatsApp(data, error)
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
  return procesarRespuestaInvokeWhatsApp(data, error)
}

/**
 * Resumen de formas de pago para liquidación (una o varias).
 * @param {Array<{ forma_pago?: string }>} pagos
 */
export function resumenFormasPagoWa(pagos = []) {
  const formas = [
    ...new Set(
      (pagos ?? [])
        .map((p) => String(p?.forma_pago ?? '').trim())
        .filter(Boolean),
    ),
  ]
  if (formas.length === 0) return '—'
  if (formas.length === 1) return formas[0]
  return formas.join(', ')
}

/**
 * Confirmación de pago total / liquidación vía Edge Function `send-whatsapp-liquidacion`.
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
export async function enviarLiquidacionWhatsAppCloudApi(supabase, p) {
  if (!supabase) return { ok: false, errorMsg: 'Supabase no está configurado.' }
  const { orden, nombreCliente = '', monto, formaPago = '', fecha, to } = p
  const { data, error } = await supabase.functions.invoke('send-whatsapp-liquidacion', {
    body: {
      orden: String(orden),
      nombreCliente: truncarMetaTexto(nombreCliente),
      monto: truncarMetaTexto(monto, 80),
      formaPago: truncarMetaTexto(formaPago, 80),
      ...(fecha != null && String(fecha).trim() ? { fecha: truncarMetaTexto(String(fecha).trim(), 120) } : {}),
      ...(to ? { to } : {}),
    },
  })
  return procesarRespuestaInvokeWhatsApp(data, error)
}

/**
 * Cotización vía Edge Function `send-whatsapp-cotizacion`.
 * Plantilla Meta: {{1}} cliente, {{2}} número cotización, {{3}} detalle, {{4}} total, {{5}} fecha.
 *
 * @param {object} supabase
 * @param {{
 *   nombreCliente?: string,
 *   numeroCotizacion: string|number,
 *   detalle: string,
 *   total: string,
 *   fecha?: string,
 *   to?: string,
 * }} p
 */
export async function enviarCotizacionWhatsAppCloudApi(supabase, p) {
  if (!supabase) return { ok: false, errorMsg: 'Supabase no está configurado.' }
  const { numeroCotizacion, nombreCliente = '', detalle, total, fecha, to } = p
  const { data, error } = await supabase.functions.invoke('send-whatsapp-cotizacion', {
    body: {
      numeroCotizacion: String(numeroCotizacion),
      nombreCliente: truncarMetaTexto(nombreCliente),
      detalle: truncarMetaTexto(detalle, 512),
      total: truncarMetaTexto(total, 80),
      ...(fecha != null && String(fecha).trim() ? { fecha: truncarMetaTexto(String(fecha).trim(), 120) } : {}),
      ...(to ? { to } : {}),
    },
  })
  return procesarRespuestaInvokeWhatsApp(data, error)
}

/**
 * Mensaje de liquidación / pago total para wa.me (modo sin API).
 */
export function buildMensajeLiquidacionClienteDetalle(p) {
  const neg = String(p?.negocio ?? NEGOCIO_DEFAULT).trim() || NEGOCIO_DEFAULT
  const ord = String(p?.numeroOrden ?? '').trim() || '—'
  const nom = String(p?.nombreCliente ?? '').trim() || '—'
  const monto = String(p?.monto ?? '—').trim() || '—'
  const forma = String(p?.formaPago ?? '').trim() || '—'
  const fecha = formatFechaOrdenMensaje(p?.fecha)
  return (
    `Hola buen día, de parte de ${neg} confirmamos el pago total de su orden:\n\n` +
    `• ${nom}\n\n` +
    `• Número de orden: ${ord}\n` +
    `• Total pagado: ${monto}\n` +
    `• Forma de pago: ${forma}\n` +
    `• Fecha: ${fecha}\n\n` +
    `Gracias por su preferencia.`
  )
}

/**
 * Abre WhatsApp con mensaje de liquidación (wa.me).
 */
export function abrirWhatsAppLiquidacion(p) {
  const { telefono, mensaje: mensajePre, numeroOrden, negocio, nombreCliente, monto, formaPago, fecha } = p
  if (!telefono || !String(telefono).trim()) {
    return { ok: false, motivo: 'sin-telefono' }
  }
  const mensaje =
    mensajePre != null && String(mensajePre).trim()
      ? String(mensajePre).trim()
      : buildMensajeLiquidacionClienteDetalle({
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

/**
 * Si la Cloud API falló, abre wa.me con el mensaje ya escrito (respaldo manual).
 * @returns {{ ok: true, modo: 'cloud'|'manual', toDisplay?: string, aviso?: string } | { ok: false, errorMsg: string }}
 */
export function enviarWhatsAppConRespaldoManual(cloudResult, abrirWa, waParams) {
  if (cloudResult?.ok) {
    return {
      ok: true,
      modo: 'cloud',
      toDisplay: cloudResult.toDisplay ?? null,
    }
  }
  const wa = abrirWa(waParams)
  if (wa.ok) {
    return {
      ok: true,
      modo: 'manual',
      aviso: cloudResult?.errorMsg
        ? `No se envió automáticamente: ${cloudResult.errorMsg}`
        : 'Envío automático no disponible.',
    }
  }
  const base = cloudResult?.errorMsg || 'No se pudo enviar por WhatsApp.'
  if (wa.motivo === 'popup-bloqueado') {
    return { ok: false, errorMsg: `${base} Además, el navegador bloqueó WhatsApp.` }
  }
  if (wa.motivo === 'telefono-invalido' || wa.motivo === 'sin-telefono') {
    return { ok: false, errorMsg: base }
  }
  return { ok: false, errorMsg: base }
}
