# WhatsApp — app Sistebit (configuración actual)

Usar la app **Sistebit** (no Sistebit CAS Epson). Ahí está vinculada la cuenta **Test WhatsApp Business Account**.

## IDs correctos

| Dato | Valor |
|------|--------|
| Business Portfolio | Sistebit (`2051087975830734`) |
| Usuario del sistema | Systia (`61589259461561`) |
| App Meta | **Sistebit** (`26654586127534028`) |
| Cuenta WhatsApp | Test WhatsApp Business Account (`2033268898074307`) |
| **Phone number ID** (Supabase) | **`1083008164899211`** |
| Número de envío Meta (prueba) | +1 555-167-5584 |
| Tu celular destino pruebas | `524622647020` (+52 462 264 7020) |
| Supabase project | `gvxffxyygvtpmqlsrsmn` |

## Secretos en Supabase (Edge Functions)

| Secreto | Valor |
|---------|--------|
| `WHATSAPP_ACCESS_TOKEN` | Token de Systia (app **Sistebit**) |
| `WHATSAPP_PHONE_NUMBER_ID` | `1083008164899211` |
| `WHATSAPP_TEST_TO` | `524622647020` |
| `WHATSAPP_API_VERSION` | `v25.0` |

Plantillas de producción (cuando las crees):

| Secreto | Valor |
|---------|--------|
| `WHATSAPP_TEMPLATE_LANG` | `es_MX` |
| `WHATSAPP_TEMPLATE_NAME` | `orden_servicio_sist` |
| `WHATSAPP_TEMPLATE_ANTICIPO_NAME` | `anticipo_recibido_s` |
| `WHATSAPP_TEMPLATE_LIQUIDACION_NAME` | `liquidacion_orden_s` |

Prueba rápida (solo plantilla `hello_world` que ya existe):

| Secreto | Valor |
|---------|--------|
| `WHATSAPP_TEMPLATE_NAME` | `hello_world` |
| `WHATSAPP_TEMPLATE_LANG` | `en_US` |

## Pasos en Meta (donde estás ahora)

### 1. Regenerar token (obligatorio tras asignar activos)

En **Usuarios del sistema → Systia**:

1. Clic **Generar identificador**
2. App: **Sistebit**
3. Permisos: `whatsapp_business_messaging`, `whatsapp_business_management`
4. Copiar token → Supabase → `WHATSAPP_ACCESS_TOKEN`

### 2. Completar API Setup de la app Sistebit

1. [developers.facebook.com/apps/26654586127534028](https://developers.facebook.com/apps/26654586127534028)
2. Menú **WhatsApp** → **API Setup** (Configuración de API)
3. Verifica que aparezca Phone number ID **`1083008164899211`**
4. En **Para** / destinatarios de prueba: **+52 462 264 7020**
5. Si pide registrar el número, sigue el asistente de Meta

Error `(#133010) Account not registered` = falta completar este paso en la app **Sistebit**.

### 3. Probar envío en Meta

En API Setup → Paso 1 → plantilla **hello_world** → enviar a `+52 462 264 7020`.  
Si llega al celular, la API está lista.

### 4. Probar en SISTEBIT

Orden → **Enviar por WhatsApp** → **Enviar orden cliente**.

## Plantillas para producción

La cuenta de prueba solo trae `hello_world`. Crea en WhatsApp Manager las 3 plantillas en `es_MX` (ver `docs/WHATSAPP-SETUP.md`) y quita los secretos `hello_world` / `en_US`.

## Seguridad

No compartas tokens en chat. Si se filtró, en Systia → **Revocar identificadores** → generar uno nuevo.
