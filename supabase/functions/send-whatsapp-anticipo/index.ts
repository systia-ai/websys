/**
 * Edge Function: confirmación de anticipo por WhatsApp Cloud API (Meta).
 *
 * Secretos compartidos con send-whatsapp-orden, más:
 *   WHATSAPP_TEMPLATE_ANTICIPO_NAME   default anticipo_recibido_sisteb
 *
 * Plantilla esperada (cuerpo): {{1}} cliente, {{2}} orden, {{3}} monto, {{4}} forma pago, {{5}} fecha
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
    Deno.env.get('WHATSAPP_TEMPLATE_ANTICIPO_NAME')?.trim() || 'anticipo_recibido_sisteb'

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

  const nombreCliente = truncar(String(body.nombreCliente ?? 'Cliente').trim() || 'Cliente', 120)
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
