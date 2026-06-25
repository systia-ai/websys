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

/** Meta no permite \\n, \\t ni más de 4 espacios seguidos en parámetros de plantilla. */
export function sanitizarParamPlantilla(text: string): string {
  return String(text ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {5,}/g, '    ')
    .trim()
}

export function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

const PAIS_DEFAULT = '52'

/**
 * México para WhatsApp: `52` + 10 dígitos (sin "1" intermedio).
 * Alineado con `normalizarTelefonoWa` del frontend.
 */
export function normalizarTelefonoE164(
  raw: string | undefined,
  defaultPais = PAIS_DEFAULT,
): string | null {
  if (raw == null) return null
  let dig = String(raw).replace(/\D/g, '')
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

/**
 * Destino E.164 solo dígitos.
 * Si `testTo` (WHATSAPP_TEST_TO) está configurado, **siempre** manda ahí (pruebas).
 * Si no, usa el teléfono del cliente (`bodyTo`).
 */
export function resolverDestino(bodyTo: string | undefined, testTo: string | undefined): string {
  const fromTest = normalizarTelefonoE164(testTo)
  if (fromTest) return fromTest
  const rawTest = testTo?.replace(/\D/g, '') ?? ''
  if (rawTest.length >= 10 && rawTest.length <= 15) return rawTest

  const fromBody = normalizarTelefonoE164(bodyTo)
  if (fromBody) return fromBody
  const rawBody = bodyTo?.replace(/\D/g, '') ?? ''
  if (rawBody.length >= 10 && rawBody.length <= 15) return rawBody
  return ''
}

export function fechaDefaultEsMx(): string {
  return new Date().toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** {{1}} en plantillas con etiqueta «Cliente:» (anticipo). */
export function nombreClientePlantillaPlain(raw: unknown) {
  return truncar(String(raw ?? 'Cliente').trim() || 'Cliente', 120)
}

/** {{1}} en plantilla en línea propia (liquidación, cotización). */
export function nombreClientePlantillaVineta(raw: unknown) {
  return `• ${nombreClientePlantillaPlain(raw)}`
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
        parameters: p.bodyParams.map((text) => ({
          type: 'text',
          text: sanitizarParamPlantilla(text),
        })),
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
