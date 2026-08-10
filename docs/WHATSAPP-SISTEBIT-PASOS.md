# WhatsApp — SISTEBIT (modo prueba)

Configuración actual: **número de prueba / CAS Epson**, y **todos** los mensajes van al celular de SISTEBIT (no al cliente de la orden).

## IDs de prueba

| Dato | Valor |
|------|--------|
| App Meta | **Sistebit CAS Epson** (`1701676374523471`) |
| WhatsApp Business Account ID (WABA) | `2044195813178508` |
| **Phone number ID** (Supabase) | **`1061313353733967`** |
| Destino de todas las pruebas | **`524622090526`** (+52 462 209 0526) |
| Supabase project | `gvxffxyygvtpmqlsrsmn` |

> El **Phone number ID** va en `WHATSAPP_PHONE_NUMBER_ID`.  
> `WHATSAPP_TEST_TO` hace que **cualquier** envío (orden, anticipo, liquidación, cotización) llegue solo a **462 209 0526** (SISTEBIT).

## Secretos en Supabase (Edge Functions)

Dashboard → **Project Settings** → **Edge Functions** → **Secrets**

| Secreto | Valor (prueba) |
|---------|----------------|
| `WHATSAPP_ACCESS_TOKEN` | Token de la app **Sistebit CAS Epson** (System User o API Setup) |
| `WHATSAPP_PHONE_NUMBER_ID` | `1061313353733967` |
| `WHATSAPP_TEST_TO` | `524622090526` |
| `WHATSAPP_TEMPLATE_LANG` | `es_MX` |
| `WHATSAPP_TEMPLATE_NAME` | `orden_servicio_sisteb` |
| `WHATSAPP_TEMPLATE_ANTICIPO_NAME` | `anticipo_recibido_sisteb` |
| `WHATSAPP_TEMPLATE_LIQUIDACION_NAME` | `liquidacion_orden_s` |
| `WHATSAPP_TEMPLATE_COTIZACION_NAME` | `cotizacion_sisteb` |
| `WHATSAPP_API_VERSION` | `v25.0` |

Desplegar funciones después de cambiar secretos (si cambias código):

```bash
npm run deploy:function:whatsapp
```

---

## Cómo probar

1. Abre cualquier orden con teléfono de cliente (da igual cuál: **no se usa** mientras exista `WHATSAPP_TEST_TO`).
2. **Enviar por WhatsApp** → **Enviar orden cliente**.
3. El mensaje debe llegar a **462 209 0526** (SISTEBIT).

Si la API falla, la app abre WhatsApp Web (`wa.me`) como respaldo.

---

## Volver a producción (más adelante)

Cuando las plantillas estén en la WABA de producción:

1. `WHATSAPP_PHONE_NUMBER_ID` = `1090000467533678`
2. **Eliminar** `WHATSAPP_TEST_TO`
3. Token de la app/WABA Live de producción (`1701523064207755`)
4. Remitente real: `+52 14621907249`

---

## Errores frecuentes

| Error | Causa | Solución |
|-------|--------|----------|
| `no permissions` / token inválido | Token de otra app | Generar token en **Sistebit CAS Epson** y actualizar `WHATSAPP_ACCESS_TOKEN` |
| `Template not found` / `#132001` | Plantilla no Activa en esta WABA | Crear/aprobar plantillas en es_MX en WABA `2044195813178508` |
| Mensaje al cliente, no a 462… | Falta `WHATSAPP_TEST_TO` | Poner `524622090526` en secretos |

## Seguridad

No pegues tokens en chat ni en el repo. Solo en Supabase Secrets.
