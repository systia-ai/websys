# WhatsApp — SISTEBIT (producción)

Número de WhatsApp Business **en producción**. Los mensajes salen desde este número y van al **celular del cliente** de cada orden/cotización.

## IDs de producción

| Dato | Valor |
|------|--------|
| WhatsApp Business Account ID (WABA) | `1701523064207755` |
| **Phone number ID** (Supabase) | **`1090000467533678`** |
| Número remitente (Meta) | **`+52 1 4621907249`** (462 190 7249) |
| Destino | Teléfono del **cliente** en la orden (no hay número fijo) |
| Supabase project | `gvxffxyygvtpmqlsrsmn` |

> El **Phone number ID** (`1090000467533678`) es el que va en secretos.  
> El **+52 1 4621907249** es lo que ve el cliente como remitente; **no** se pone en `WHATSAPP_PHONE_NUMBER_ID`.

## Secretos en Supabase (Edge Functions)

Dashboard → **Project Settings** → **Edge Functions** → **Secrets**

| Secreto | Valor producción |
|---------|------------------|
| `WHATSAPP_ACCESS_TOKEN` | Token **permanente** del System User (app Live + esta WABA) |
| `WHATSAPP_PHONE_NUMBER_ID` | `1090000467533678` |
| `WHATSAPP_TEMPLATE_LANG` | `es_MX` |
| `WHATSAPP_TEMPLATE_NAME` | `orden_servicio_sisteb` |
| `WHATSAPP_TEMPLATE_ANTICIPO_NAME` | `anticipo_recibido_sisteb` |
| `WHATSAPP_TEMPLATE_LIQUIDACION_NAME` | `liquidacion_orden_s` |
| `WHATSAPP_TEMPLATE_COTIZACION_NAME` | `cotizacion_sisteb` |
| `WHATSAPP_API_VERSION` | `v25.0` |

### Producción: NO usar `WHATSAPP_TEST_TO`

| Secreto | Acción |
|---------|--------|
| `WHATSAPP_TEST_TO` | **Eliminar**. Si existe, todos los mensajes van a ese número y no al cliente. |

```bash
npm run deploy:function:whatsapp
```

---

## Paso 1 — Token permanente (Meta)

1. [business.facebook.com/settings/system-users](https://business.facebook.com/settings/system-users)
2. Usuario del negocio → asignar app Live + WABA `1701523064207755`
3. Permisos: `whatsapp_business_messaging`, `whatsapp_business_management`
4. Generar token → Supabase → `WHATSAPP_ACCESS_TOKEN`

---

## Paso 2 — Verificar número en API Setup

1. Meta Developers → app Live → **WhatsApp** → **API Setup**
2. Phone number ID = `1090000467533678`
3. Número de envío = `+52 1 4621907249`

---

## Paso 3 — Plantillas Activas (es_MX)

Deben existir en **esta** WABA (`1701523064207755`). Textos en `docs/WHATSAPP-SETUP.md`.

| Nombre | Variables |
|--------|-----------|
| `orden_servicio_sisteb` | 3 |
| `anticipo_recibido_sisteb` | 5 |
| `liquidacion_orden_s` | 5 |
| `cotizacion_sisteb` | 5 |

---

## Paso 4 — Probar en SISTEBIT

1. Orden con cliente que tenga celular MX de 10 dígitos
2. **Enviar por WhatsApp** → **Enviar orden cliente**
3. Debe llegar al **celular del cliente**, saliendo desde `+52 1 4621907249`

Si la API falla, la app abre WhatsApp manual (`wa.me`) como respaldo.

---

## Errores frecuentes

| Error | Causa | Solución |
|-------|--------|----------|
| `no permissions` / token inválido | Token de otra app/WABA | Regenerar token para WABA `1701523064207755` |
| `Template not found` / `#132001` | Plantilla no existe en esta WABA | Crear/aprobar plantillas en es_MX |
| Mensaje va a un solo celular | `WHATSAPP_TEST_TO` configurado | **Eliminar** ese secreto |
| Phone ID incorrecto | Secretos de prueba | Usar `1090000467533678` |

## Seguridad

No pegues tokens en chat ni en el repo. Solo en Supabase Secrets.
