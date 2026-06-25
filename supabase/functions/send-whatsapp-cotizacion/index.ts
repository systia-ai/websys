/**
 * Edge Function: cotización por WhatsApp Cloud API (Meta).
 *
 * Secretos compartidos con send-whatsapp-orden, más:
 *   WHATSAPP_TEMPLATE_COTIZACION_NAME   default cotizacion_sisteb
 *
 * Plantilla esperada (cuerpo): {{1}} cliente, {{2}} número cotización, {{3}} detalle, {{4}} total, {{5}} fecha
 *
 * Texto sugerido en Meta (es_MX, categoría Utilidad):
 * ---
 * Hola, buen día.
 * De parte de SISTEBIT le compartimos su cotización:
 *
 * {{1}}
 *
 * Número de cotización: {{2}}
 * Detalle: {{3}}
 * Total cotización: {{4}}
 * Fecha: {{5}}
 *
 * Quedamos atentos a sus comentarios.
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
  nombreClientePlantillaVineta,
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
    Deno.env.get('WHATSAPP_TEMPLATE_COTIZACION_NAME')?.trim() || 'cotizacion_sisteb'

  if (!validarConfigBase(cfg)) {
    return json(500, {
      error:
        'Falta configuración: WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID en secretos de Edge Functions.',
    })
  }

  let body: {
    nombreCliente?: string
    numeroCotizacion?: string
    detalle?: string
    total?: string
    fecha?: string
    to?: string
  } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    body = {}
  }

  const to = resolverDestino(body.to, cfg.testTo)
  if (!to || to.length < 10) {
    return json(400, {
      error:
        'Destino no válido. Use teléfono MX de 10 dígitos (4622090526) o con lada 1 (14622090526). Opcional: WHATSAPP_TEST_TO en secretos si falta teléfono del cliente.',
    })
  }

  const nombreCliente = nombreClientePlantillaVineta(body.nombreCliente)
  const numeroCotizacion = truncar(String(body.numeroCotizacion ?? '—'), 120)
  const detalle = truncar(String(body.detalle ?? '—').trim() || '—', 512)
  const total = truncar(String(body.total ?? '—'), 80)
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
    bodyParams: [nombreCliente, numeroCotizacion, detalle, total, fecha],
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
