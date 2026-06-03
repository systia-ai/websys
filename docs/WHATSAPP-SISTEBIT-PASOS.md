# WhatsApp — app Sistebit CAS Epson (producción)

Usar la app **Sistebit CAS Epson** en Meta Developers. Es la que tiene el número de WhatsApp Business real de SISTEBIT.

## IDs de la app (capturas Meta)

| Dato | Valor |
|------|--------|
| App Meta | **Sistebit CAS Epson** |
| App ID | `1701676374523471` |
| WhatsApp Business Account ID | `2044195813178508` |
| **Phone number ID** (Supabase) | **`1061313353733967`** |
| Supabase project | `gvxffxyygvtpmqlsrsmn` |
| Link directo | [developers.facebook.com/apps/1701676374523471](https://developers.facebook.com/apps/1701676374523471) |

> No uses la app «Sistebit» (`26654586127534028`) ni el Phone ID `1083008164899211` — es la cuenta de prueba Test WABA.

## Secretos en Supabase (Edge Functions)

Dashboard → **Project Settings** → **Edge Functions** → **Secrets**

| Secreto | Valor producción |
|---------|------------------|
| `WHATSAPP_ACCESS_TOKEN` | Token permanente de **Sistebit CAS Epson** (ver abajo) |
| `WHATSAPP_PHONE_NUMBER_ID` | `1061313353733967` |
| `WHATSAPP_TEMPLATE_LANG` | `es_MX` |
| `WHATSAPP_TEMPLATE_NAME` | `orden_servicio_sisteb` |
| `WHATSAPP_TEMPLATE_ANTICIPO_NAME` | `anticipo_recibido_sisteb` |
| `WHATSAPP_TEMPLATE_LIQUIDACION_NAME` | `liquidacion_orden_s` |
| `WHATSAPP_API_VERSION` | `v25.0` |
| `WHATSAPP_TEST_TO` | `524622647020` → **modo prueba:** todos los mensajes van a **462 264 7020** (quitar en producción) |

**No configurar** `WHATSAPP_TEST_TO` en producción final — si existe, todos los mensajes van a ese número y no al cliente.

Desplegar funciones:

```bash
npm run deploy:function:whatsapp
```

---

## Paso 1 — Token permanente (Meta)

El token del botón «Generar identificador» en API Setup **caduca en ~24 h**. Para producción:

1. [business.facebook.com/settings/system-users](https://business.facebook.com/settings/system-users)
2. Usuario **Systia** (o el que administre el negocio)
3. **Asignar activos:**
   - App: **Sistebit CAS Epson**
   - Cuenta WhatsApp: la WABA `2044195813178508`
   - Permisos: mensajería WhatsApp
4. **Generar identificador** → app **Sistebit CAS Epson**
5. Permisos: `whatsapp_business_messaging`, `whatsapp_business_management`
6. Copiar token → Supabase → `WHATSAPP_ACCESS_TOKEN`

**Importante:** el token debe generarse para la app **CAS Epson**, no para «Sistebit» genérica. Si el token es de otra app, Meta responde «no permissions».

---

## Paso 2 — API Setup (verificar número)

1. App **Sistebit CAS Epson** → **WhatsApp** → **API Setup**
2. Confirmar **Phone number ID** = `1061313353733967`
3. Confirmar el número de envío (+52 … de SISTEBIT)
4. En **API Setup → Paso 1**, probar envío de `hello_world` a un celular de prueba

---

## Paso 3 — Plantillas en WhatsApp Manager

Crear las 3 plantillas en **es_MX**, categoría **Utilidad**, estado **Activa**:

Ver textos exactos en `docs/WHATSAPP-SETUP.md`.

| Nombre plantilla | Variables cuerpo |
|------------------|------------------|
| `orden_servicio_sisteb` | 3 |
| `anticipo_recibido_sisteb` | 5 |
| `liquidacion_orden_s` | 5 |

---

## Paso 4 — App en modo Live

1. App **Sistebit CAS Epson** → panel → cambiar **Development** → **Live**
2. Completar lo que Meta pida (privacidad, icono, etc.)

En **Development** solo llega a números agregados como testers en API Setup.

---

## Paso 5 — Probar en SISTEBIT

1. Orden con cliente que tenga celular (10 dígitos MX)
2. **Enviar por WhatsApp** → **Enviar orden cliente**
3. Debe llegar al **celular del cliente**

Si falla la API, la app abre WhatsApp manual (`wa.me`) como respaldo.

---

## Errores frecuentes

| Error | Causa | Solución |
|-------|--------|----------|
| `no permissions` / token inválido | Token de otra app (Sistebit vs CAS Epson) | Regenerar token para **CAS Epson** |
| `Recipient not in allowed list` | App en Development | Agregar número tester o pasar a **Live** |
| `Template not found` / `#132001` | Plantilla no existe o no está Activa | Crear/aprobar plantillas en es_MX |
| Mensaje va a tu celular, no al cliente | `WHATSAPP_TEST_TO` configurado | Eliminar ese secreto en Supabase |

## Seguridad

No pegues tokens en chat ni en el repo. Solo en Supabase Secrets. Si se filtró: revocar en Meta → generar nuevo.
