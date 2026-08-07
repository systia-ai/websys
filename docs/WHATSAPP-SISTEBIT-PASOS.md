# WhatsApp — SISTEBIT (producción)

Número y cuenta de WhatsApp Business **en producción** (app Meta publicada / Live).

## IDs de producción

| Dato | Valor |
|------|--------|
| WhatsApp Business Account ID (WABA) | `1701523064207755` |
| **Phone number ID** (Supabase) | **`1090000467533678`** |
| Número registrado (remitente) | **`+52 14621907249`** |
| Supabase project | `gvxffxyygvtpmqlsrsmn` |

> El **Phone number ID** (`1090000467533678`) es el que va en secretos.  
> El **+52 14621907249** es el número que ve el cliente como remitente; **no** se pone en `WHATSAPP_PHONE_NUMBER_ID`.

## Secretos en Supabase (Edge Functions)

Dashboard → **Project Settings** → **Edge Functions** → **Secrets**

| Secreto | Valor producción |
|---------|------------------|
| `WHATSAPP_ACCESS_TOKEN` | Token **permanente** del System User (esta app + esta WABA) |
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
| `WHATSAPP_TEST_TO` | **Eliminar** del proyecto. Si existe, **todos** los mensajes van a ese número y no al cliente de la orden. |

Desplegar funciones después de cambiar secretos:

```bash
npm run deploy:function:whatsapp
```

---

## Paso 1 — Token permanente (Meta)

El token del botón «Generar identificador» en API Setup **caduca en ~24 h**. Para producción:

1. [business.facebook.com/settings/system-users](https://business.facebook.com/settings/system-users)
2. Usuario del negocio (ej. Systia)
3. **Asignar activos:**
   - App Meta (la publicada / Live)
   - Cuenta WhatsApp (WABA) `1701523064207755`
   - Permisos: mensajería WhatsApp
4. **Generar identificador** → la misma app Live
5. Permisos: `whatsapp_business_messaging`, `whatsapp_business_management`
6. Copiar token → Supabase → `WHATSAPP_ACCESS_TOKEN`

**Importante:** el token debe ser de la app/WABA de producción. Si es de otra app, Meta responde «no permissions».

---

## Paso 2 — API Setup (verificar número)

1. Meta Developers → tu app Live → **WhatsApp** → **API Setup**
2. Confirmar **Phone number ID** = `1090000467533678`
3. Confirmar el número de envío = `+52 14621907249`
4. Opcional: probar `hello_world` a un celular

---

## Paso 3 — Plantillas en WhatsApp Manager

Crear/verificar las 4 plantillas en **es_MX**, categoría **Utilidad**, estado **Activa**:

Textos exactos en `docs/WHATSAPP-SETUP.md`.

| Nombre plantilla | Variables cuerpo |
|------------------|------------------|
| `orden_servicio_sisteb` | 3 |
| `anticipo_recibido_sisteb` | 5 |
| `liquidacion_orden_s` | 5 |
| `cotizacion_sisteb` | 5 |

---

## Paso 4 — App en modo Live

1. Meta Developers → panel de la app → **Live**
2. Completar lo que Meta pida (privacidad, icono, etc.)

En **Development** solo llega a números agregados como testers.

---

## Paso 5 — Probar en SISTEBIT

1. Orden con cliente que tenga celular (10 dígitos MX)
2. **Enviar por WhatsApp** → **Enviar orden cliente**
3. Debe llegar al **celular del cliente**, saliendo desde `+52 14621907249`

Si falla la API, la app abre WhatsApp manual (`wa.me`) como respaldo.

---

## Errores frecuentes

| Error | Causa | Solución |
|-------|--------|----------|
| `no permissions` / token inválido | Token de otra app o WABA | Regenerar token para esta app + WABA `1701523064207755` |
| `Recipient not in allowed list` | App en Development | Agregar tester o pasar a **Live** |
| `Template not found` / `#132001` | Plantilla no existe o no está Activa | Crear/aprobar plantillas en es_MX |
| Mensaje va a un solo celular, no al cliente | `WHATSAPP_TEST_TO` configurado | **Eliminar** ese secreto en Supabase |
| Phone number ID incorrecto | Secretos viejos (IDs de prueba) | Usar `1090000467533678` |

## Seguridad

No pegues tokens en chat ni en el repo. Solo en Supabase Secrets. Si se filtró: revocar en Meta → generar nuevo.

## IDs antiguos (no usar)

Quedaron de pruebas / otra WABA; **no** configurarlos en producción:

- Phone ID `1061313353733967`
- WABA `2044195813178508`
- Phone ID de prueba `1083008164899211`
