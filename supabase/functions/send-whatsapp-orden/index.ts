/**
 * Edge Function: notificación de orden de servicio por WhatsApp Cloud API (Meta).
 *
 * Secretos (Supabase → Edge Functions → Secrets):
 *   WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID (obligatorios)
 *   WHATSAPP_TEMPLATE_NAME     default orden_servicio_sist (nombre exacto en Meta)
 *   WHATSAPP_TEMPLATE_LANG     default es_MX
 *   WHATSAPP_TEST_TO           opcional: fuerza destino de prueba (solo dígitos)
 *   WHATSAPP_API_VERSION       default v25.0
 *
 * Plantilla esperada (cuerpo): {{1}} detalle cliente/equipo, {{2}} orden, {{3}} fecha
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
    Deno.env.get('WHATSAPP_TEMPLATE_NAME')?.trim() || 'orden_servicio_sist'

  if (!validarConfigBase(cfg)) {
    return json(500, {
      error:
        'Falta configuración: WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID en secretos de Edge Functions.',
    })
  }

  let body: {
    orden?: string
    nombreCliente?: string
    to?: string
    fecha?: string
    descripcionEquipo?: string
    problemasReportados?: string
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

  const orden = truncar(String(body.orden ?? '—'), 120)
  const nombreBase = truncar(String(body.nombreCliente ?? 'Cliente').trim() || 'Cliente', 120)
  const descEq = truncar(String(body.descripcionEquipo ?? '').trim(), 200)
  const prob = truncar(String(body.problemasReportados ?? '').trim(), 200)
  const partes = [nombreBase]
  if (descEq) partes.push(`Equipo: ${descEq}`)
  if (prob) partes.push(`Problema: ${prob}`)
  const detalleCliente = truncar(partes.join(' · '), 512)
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
    bodyParams: [detalleCliente, orden, fecha],
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
