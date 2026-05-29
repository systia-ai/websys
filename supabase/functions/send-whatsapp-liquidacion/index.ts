/**
 * Edge Function: confirmación de pago total / liquidación por WhatsApp Cloud API (Meta).
 *
 * Secretos compartidos con send-whatsapp-orden, más:
 *   WHATSAPP_TEMPLATE_LIQUIDACION_NAME   default liquidacion_orden_s
 *
 * Plantilla esperada (cuerpo): {{1}} cliente, {{2}} orden, {{3}} total pagado, {{4}} forma pago, {{5}} fecha
 *
 * Texto sugerido en Meta (es_MX, categoría Utilidad):
 * ---
 * Hola, buen día.
 * De parte de SISTEBIT le confirmamos el pago total de su orden de servicio:
 *
 * {{1}}
 *
 * Número de orden: {{2}}
 * Total pagado: {{3}}
 * Forma de pago: {{4}}
 * Fecha: {{5}}
 *
 * Gracias por su preferencia.
 * ---
 * Muestra {{1}}: • Juan Pérez
 */

import {
  cors,
  enviarPlantillaWhatsApp,
  fechaDefaultEsMx,
  json,
  leerConfigWhatsAppBase,
  resolverDestino,
  truncar,
  validarConfigBase,
} from '../_shared/whatsapp.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const cfg = leerConfigWhatsAppBase()
  const templateName =
    Deno.env.get('WHATSAPP_TEMPLATE_LIQUIDACION_NAME')?.trim() || 'liquidacion_orden_s'

  if (!validarConfigBase(cfg)) {
    return json(500, {
      error:
        'Falta configuración: WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID en secretos de Edge Functions.',
    })
  }

  let body: {
    nombreCliente?: string
    orden?: string
    monto?: string
    formaPago?: string
    fecha?: string
    to?: string
  } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    body = {}
  }

  const to = resolverDestino(body.to, cfg.testTo)
  if (!to || to.length < 8) {
    return json(400, {
      error:
        'Destino no válido. Envíe `to` (E.164 solo dígitos) o configure WHATSAPP_TEST_TO para pruebas.',
    })
  }

  const nombreBase = truncar(String(body.nombreCliente ?? 'Cliente').trim() || 'Cliente', 120)
  const nombreCliente = `• ${nombreBase}`
  const orden = truncar(String(body.orden ?? '—'), 120)
  const monto = truncar(String(body.monto ?? '—'), 80)
  const formaPago = truncar(String(body.formaPago ?? '—'), 80)
  const fecha =
    body.fecha != null && String(body.fecha).trim()
      ? truncar(String(body.fecha).trim(), 120)
      : fechaDefaultEsMx()

  const result = await enviarPlantillaWhatsApp({
    token: cfg.token,
    phoneId: cfg.phoneId,
    apiVersion: cfg.apiVersion,
    templateName,
    templateLang: cfg.templateLang,
    to,
    bodyParams: [nombreCliente, orden, monto, formaPago, fecha],
  })

  if (!result.ok) {
    return json(result.status, { error: result.error, meta: result.meta, raw: result.raw })
  }

  return json(200, {
    ok: true,
    to: result.to,
    template: result.template,
    language: result.language,
    messages: result.messages,
  })
})
