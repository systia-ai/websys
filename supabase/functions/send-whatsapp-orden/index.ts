/**
 * Edge Function: envía un mensaje de plantilla por WhatsApp Cloud API (Meta).
 *
 * Secretos (Dashboard → Project Settings → Edge Functions → Secrets):
 *   WHATSAPP_ACCESS_TOKEN      (obligatorio)
 *   WHATSAPP_PHONE_NUMBER_ID   (obligatorio)
 *
 * Opcionales:
 *   WHATSAPP_API_VERSION       default v25.0
 *   WHATSAPP_TEST_TO          destino E.164 solo dígitos (ej. 524622647020). Si no existe, usa `to` del body.
 *   WHATSAPP_TEMPLATE_NAME     default jaspers_market_order_confirmation_v1 (use hello_world + en_US para prueba mínima)
 *   WHATSAPP_TEMPLATE_LANG     default en_US (debe coincidir con la plantilla en Meta)
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function truncar(s: string, max: number) {
  const t = String(s ?? '')
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN')?.trim()
  const phoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')?.trim()
  const apiVersion = Deno.env.get('WHATSAPP_API_VERSION')?.trim() || 'v25.0'
  const templateName =
    Deno.env.get('WHATSAPP_TEMPLATE_NAME')?.trim() || 'jaspers_market_order_confirmation_v1'
  const templateLang = Deno.env.get('WHATSAPP_TEMPLATE_LANG')?.trim() || 'en_US'
  const testTo = Deno.env.get('WHATSAPP_TEST_TO')?.trim()

  if (!token || !phoneId) {
    return json(500, {
      error:
        'Falta configuración en el servidor: defina WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID en los secretos de la Edge Function.',
    })
  }

  let body: { orden?: string; nombreCliente?: string; to?: string } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    body = {}
  }

  const to = testTo || body.to?.replace(/\D/g, '') || ''
  if (!to || to.length < 8) {
    return json(400, {
      error:
        'Destino no válido. Configure el secreto WHATSAPP_TEST_TO (solo dígitos, ej. 524622647020) o envíe `to` en el JSON.',
    })
  }

  const orden = truncar(String(body.orden ?? '—'), 120)
  const nombre = truncar(String(body.nombreCliente ?? 'Cliente').trim() || 'Cliente', 120)
  const fecha = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const template: {
    name: string
    language: { code: string }
    components?: Array<{ type: string; parameters: Array<{ type: string; text: string }> }>
  } = {
    name: templateName,
    language: { code: templateLang },
  }

  // Plantilla de prueba de Meta: sin variables en el cuerpo (p. ej. hello_world + en_US).
  const simpleTemplates = new Set(['hello_world'])
  if (!simpleTemplates.has(templateName.toLowerCase())) {
    template.components = [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: nombre },
          { type: 'text', text: orden },
          { type: 'text', text: fecha },
        ],
      },
    ]
  }

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template,
  }

  const url = `https://graph.facebook.com/${apiVersion}/${phoneId}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const text = await res.text()
  let metaJson: { error?: { message?: string }; messages?: unknown[] } = {}
  try {
    metaJson = JSON.parse(text) as typeof metaJson
  } catch {
    return json(502, { error: 'Respuesta no JSON de Meta', raw: text.slice(0, 500) })
  }

  if (!res.ok) {
    const msg = metaJson.error?.message ?? text.slice(0, 300)
    return json(res.status, { error: msg, meta: metaJson })
  }

  return json(200, {
    ok: true,
    to,
    template: templateName,
    language: templateLang,
    messages: metaJson.messages ?? [],
  })
})
