/** Utilidades compartidas para Edge Functions de WhatsApp Cloud API (Meta). */

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function truncar(s: string, max: number) {
  const t = String(s ?? '')
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

export function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/** Destino E.164 solo dígitos. `testTo` anula el teléfono del cliente (modo prueba). */
export function resolverDestino(bodyTo: string | undefined, testTo: string | undefined): string {
  const test = testTo?.replace(/\D/g, '') || ''
  if (test) return test
  return bodyTo?.replace(/\D/g, '') || ''
}

export function fechaDefaultEsMx(): string {
  return new Date().toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export type EnviarPlantillaResult =
  | { ok: true; to: string; template: string; language: string; messages: unknown[] }
  | { ok: false; status: number; error: string; meta?: unknown; raw?: string }

/**
 * Envía plantilla por WhatsApp Cloud API.
 * @param bodyParams Parámetros del cuerpo en orden {{1}}, {{2}}, …
 */
export async function enviarPlantillaWhatsApp(p: {
  token: string
  phoneId: string
  apiVersion: string
  templateName: string
  templateLang: string
  to: string
  bodyParams: string[]
  simpleTemplates?: Set<string>
}): Promise<EnviarPlantillaResult> {
  const simple = p.simpleTemplates ?? new Set(['hello_world'])
  const template: {
    name: string
    language: { code: string }
    components?: Array<{ type: string; parameters: Array<{ type: string; text: string }> }>
  } = {
    name: p.templateName,
    language: { code: p.templateLang },
  }

  if (!simple.has(p.templateName.toLowerCase()) && p.bodyParams.length > 0) {
    template.components = [
      {
        type: 'body',
        parameters: p.bodyParams.map((text) => ({ type: 'text', text })),
      },
    ]
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: p.to,
    type: 'template',
    template,
  }

  const url = `https://graph.facebook.com/${p.apiVersion}/${p.phoneId}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${p.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const text = await res.text()
  let metaJson: { error?: { message?: string }; messages?: unknown[] } = {}
  try {
    metaJson = JSON.parse(text) as typeof metaJson
  } catch {
    return { ok: false, status: 502, error: 'Respuesta no JSON de Meta', raw: text.slice(0, 500) }
  }

  if (!res.ok) {
    const msg = metaJson.error?.message ?? text.slice(0, 300)
    return { ok: false, status: res.status, error: msg, meta: metaJson }
  }

  return {
    ok: true,
    to: p.to,
    template: p.templateName,
    language: p.templateLang,
    messages: metaJson.messages ?? [],
  }
}

export function leerConfigWhatsAppBase() {
  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN')?.trim()
  const phoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')?.trim()
  const apiVersion = Deno.env.get('WHATSAPP_API_VERSION')?.trim() || 'v25.0'
  const templateLang = Deno.env.get('WHATSAPP_TEMPLATE_LANG')?.trim() || 'es_MX'
  const testTo = Deno.env.get('WHATSAPP_TEST_TO')?.trim()
  return { token, phoneId, apiVersion, templateLang, testTo }
}

export function validarConfigBase(
  cfg: ReturnType<typeof leerConfigWhatsAppBase>,
): cfg is typeof cfg & { token: string; phoneId: string } {
  return Boolean(cfg.token && cfg.phoneId)
}
