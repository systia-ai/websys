# Seguridad: Supabase Auth + RLS (opción A)

La app web exige **inicio de sesión** cuando están configurados `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.  
La base de datos usa **RLS**: solo el rol `authenticated` puede leer y escribir las tablas del taller.

## 1. Aplicar la migración en Supabase

Desde la carpeta del proyecto (con el CLI enlazado al proyecto **sistefix**):

```bash
supabase db push
```

O en el Dashboard: **SQL Editor** → pegar el contenido de  
`supabase/migrations/20260520120000_rls_authenticated_staff.sql` → ejecutar.

## 2. Crear usuarios del taller

1. [Supabase Dashboard](https://supabase.com/dashboard) → proyecto **sistefix**
2. **Authentication** → **Users** → **Add user** → **Create new user**
3. Correo y contraseña para cada persona (o invitación por email si lo activas)
4. Si usas confirmación de correo: **Authentication** → **Providers** → Email → desactiva *Confirm email* para uso interno, o confirma cada cuenta manualmente

No compartas la contraseña en el código ni en GitHub.

## 3. URLs en Authentication

**Authentication** → **URL configuration**:

| Campo | Ejemplo desarrollo | Ejemplo GitHub Pages |
|--------|-------------------|----------------------|
| Site URL | `http://localhost:8080/` | `https://TU_USUARIO.github.io/websys/` |
| Redirect URLs | `http://localhost:8080/**` | `https://TU_USUARIO.github.io/websys/**` |

La app usa **HashRouter** (`#/…`); las redirecciones de magic link/OAuth deben incluir la ruta base del sitio.

## 4. Variables de entorno

Local (`.env`):

```
VITE_SUPABASE_URL=https://gvxffxyygvtpmqlsrsmn.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...  # anon key del proyecto
```

GitHub Actions: secretos `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (igual que antes).

La **anon key** sigue en el frontend; la protección viene del **JWT de sesión** tras login y de las políticas RLS.

## 5. Comportamiento de la app

- Sin `.env` de Supabase → modo **local** (`localStorage`), sin pantalla de login.
- Con Supabase → pantalla **Iniciar sesión**; en inicio se muestra el correo y **Cerrar sesión**.
- La ruta pública `/etiqueta` (QR) **no** requiere login (solo muestra datos del enlace).

## 6. Tablas protegidas

RLS + política `staff_authenticated_all` para `authenticated`:

- clientes, equipos, reparaciones, cuentas, pagosclientes  
- productos, catalogopagos, cuentamov, reparamov, producmov, `Datos`

`n8n_chat_histories`: RLS activo **sin** políticas → sin acceso por API (solo service role / panel).

## 7. Errores frecuentes

| Mensaje | Causa |
|---------|--------|
| row-level security | Sin sesión o migración no aplicada |
| Invalid login credentials | Correo/contraseña incorrectos |
| Email not confirmed | Confirmar correo o desactivar confirmación en Auth |

## 8. Bloqueo HTML antiguo

Se eliminó la contraseña fija en `index.html`. El único acceso es Supabase Auth (o modo local sin Supabase).
