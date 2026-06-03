# Configuración WhatsApp Cloud API (SISTEBIT)

Guía para conectar la app con Meta WhatsApp Business. El token **nunca** va en el frontend: solo en **Supabase → Edge Functions → Secrets**.

## Cómo funciona la app

1. **Con Supabase configurado:** intenta envío automático vía Cloud API (plantillas aprobadas).
2. **Si la API falla:** abre WhatsApp Web/app (`wa.me`) con el mensaje ya escrito — el operador pulsa **Enviar**.
3. **Sin Supabase (modo local):** solo `wa.me` manual.

## Lo que necesitas de Meta Developers

### Obligatorio (secretos en Supabase)

| Secreto | Dónde obtenerlo |
|---------|-----------------|
| `WHATSAPP_ACCESS_TOKEN` | Meta → tu app → WhatsApp → **API Setup** → token permanente (System User con permiso `whatsapp_business_messaging`) |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta → WhatsApp → **API Setup** → **Phone number ID** (número largo, **no** es el teléfono +52…) |

### Plantillas (WhatsApp Manager)

Deben estar en estado **Activa** (no “En revisión” ni “Rechazada”).

| Secreto (opcional) | Nombre por defecto | Variables en el cuerpo |
|--------------------|--------------------|-------------------------|
| `WHATSAPP_TEMPLATE_NAME` | `orden_servicio_sist` | 3: detalle cliente/equipo, número orden, fecha |
| `WHATSAPP_TEMPLATE_ANTICIPO_NAME` | `anticipo_recibido_s` | 5: cliente, orden, monto, forma pago, fecha |
| `WHATSAPP_TEMPLATE_LIQUIDACION_NAME` | `liquidacion_orden_s` | 5: cliente, orden, total pagado, forma pago, fecha |
| `WHATSAPP_TEMPLATE_LANG` | `es_MX` | Idioma exacto de la plantilla |

### Opcionales

| Secreto | Uso |
|---------|-----|
| `WHATSAPP_API_VERSION` | Default `v25.0` |
| `WHATSAPP_TEST_TO` | **Solo pruebas.** Si existe, **todos** los mensajes van a ese número. **Quitar en producción.** |

## Pasos en Supabase

1. Dashboard → **Project Settings** → **Edge Functions** → **Secrets**
2. Agregar `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`
3. Desplegar funciones (desde el repo, con token CLI en `.env` local):

   ```bash
   npm run deploy:function:whatsapp
   ```

## Modo Development vs Live (Meta)

| Modo | Comportamiento |
|------|----------------|
| **Development** | Solo números agregados como “testers” en Meta → API Setup |
| **Live** | Cualquier cliente con WhatsApp válido |

Error típico en Development: *“Recipient not in allowed list”* → agrega el celular del cliente como número de prueba o publica la app.

## Checklist rápido si “dejó de funcionar”

- [ ] ¿Plantillas siguen **Activas** en WhatsApp Manager?
- [ ] ¿Token no expiró? (generar uno nuevo y actualizar secreto)
- [ ] ¿`WHATSAPP_PHONE_NUMBER_ID` es el ID correcto del número de envío?
- [ ] ¿`WHATSAPP_TEST_TO` está vacío o apunta al número que quieres probar?
- [ ] ¿Funciones desplegadas después del último cambio? (`npm run deploy:function:whatsapp`)
- [ ] ¿App Meta en modo **Live** si envías a clientes reales?
- [ ] ¿Teléfono del cliente en la orden tiene 10 dígitos MX válidos?

## Información útil para soporte / depuración

Si pides ayuda, comparte ( **sin** pegar el token):

1. Mensaje de error exacto que muestra la app
2. Nombres y estado de las 3 plantillas en WhatsApp Manager
3. Texto de cada plantilla (para verificar cantidad de variables)
4. Modo de la app Meta: Development o Live
5. `WHATSAPP_PHONE_NUMBER_ID` (no es secreto)
6. Si usas `WHATSAPP_TEST_TO` y a qué número apunta

## Frontend (`.env` del proyecto)

Solo necesitas Supabase para invocar las Edge Functions:

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key
```

No hay variables `VITE_WHATSAPP_*` en el navegador.
