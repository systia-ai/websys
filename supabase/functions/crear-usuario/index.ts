/**
 * Edge Function: crear usuario en Auth + asignar rol en user_roles.
 * Solo invocable por sesión ADMIN (es_admin_actual).
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ROLES = ['ADMIN', 'COORDINADOR', 'TECNICO', 'OPERADOR']

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

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json(401, { error: 'Sesión no válida. Inicie sesión de nuevo.' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json(500, { error: 'Configuración del servidor incompleta.' })
  }

  let body: { email?: string; password?: string; rol?: string } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    return json(400, { error: 'Cuerpo JSON inválido.' })
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) {
    return json(401, { error: 'Sesión no válida. Inicie sesión de nuevo.' })
  }

  const { data: isAdmin, error: adminErr } = await userClient.rpc('es_admin_actual')
  if (adminErr || !isAdmin) {
    return json(403, { error: 'Solo administradores pueden crear usuarios.' })
  }

  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  const rol = String(body.rol ?? 'TECNICO').trim().toUpperCase()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: 'Correo electrónico no válido.' })
  }
  if (password.length < 6) {
    return json(400, { error: 'La contraseña debe tener al menos 6 caracteres.' })
  }
  if (!ROLES.includes(rol)) {
    return json(400, { error: 'Rol no válido.' })
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createErr) {
    const msg = createErr.message ?? ''
    if (/already registered|already exists|duplicate/i.test(msg)) {
      return json(409, { error: 'Ya existe un usuario con ese correo.' })
    }
    return json(400, { error: msg || 'No se pudo crear el usuario.' })
  }

  const newUserId = created.user?.id
  if (!newUserId) {
    return json(500, { error: 'Usuario creado pero sin identificador.' })
  }

  const { error: rolErr } = await adminClient.from('user_roles').upsert(
    {
      user_id: newUserId,
      rol,
      assigned_by: userData.user.id,
      assigned_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (rolErr) {
    return json(500, {
      error: `Usuario creado pero no se pudo asignar el rol: ${rolErr.message}`,
      user_id: newUserId,
    })
  }

  return json(200, {
    ok: true,
    user_id: newUserId,
    email,
    rol,
  })
})
