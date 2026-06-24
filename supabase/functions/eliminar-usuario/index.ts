/**
 * Edge Function: eliminar usuario de Auth (y datos vinculados en cascada).
 * Solo invocable por sesión ADMIN (es_admin_actual).
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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

  let body: { user_id?: string } = {}
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
    return json(403, { error: 'Solo administradores pueden eliminar usuarios.' })
  }

  const userId = String(body.user_id ?? '').trim()
  if (!userId) {
    return json(400, { error: 'Falta el identificador del usuario.' })
  }

  if (userId === userData.user.id) {
    return json(400, { error: 'No puede eliminar su propio usuario.' })
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: roleRow, error: roleErr } = await adminClient
    .from('user_roles')
    .select('rol')
    .eq('user_id', userId)
    .maybeSingle()

  if (roleErr) {
    return json(500, { error: `No se pudo verificar el rol: ${roleErr.message}` })
  }

  if (String(roleRow?.rol ?? '').toUpperCase() === 'ADMIN') {
    const { count, error: countErr } = await adminClient
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('rol', 'ADMIN')

    if (countErr) {
      return json(500, { error: `No se pudo verificar administradores: ${countErr.message}` })
    }
    if ((count ?? 0) <= 1) {
      return json(400, { error: 'No se puede eliminar el último usuario ADMIN.' })
    }
  }

  const { error: delErr } = await adminClient.auth.admin.deleteUser(userId)
  if (delErr) {
    return json(400, { error: delErr.message || 'No se pudo eliminar el usuario.' })
  }

  return json(200, { ok: true, user_id: userId })
})
