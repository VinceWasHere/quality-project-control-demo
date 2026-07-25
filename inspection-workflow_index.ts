import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método no permitido', stage: 'method' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Faltan secretos de Supabase', stage: 'environment' }, 500)
  }

  const authorization = req.headers.get('Authorization') || ''
  const token = authorization.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Sesión no disponible', stage: 'authentication' }, 401)

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: authData, error: authError } = await authClient.auth.getUser(token)
  if (authError || !authData.user) {
    return json({ error: authError?.message || 'Sesión inválida', stage: 'authentication' }, 401)
  }
  const actorId = authData.user.id

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id,role,is_active,email')
    .eq('id', actorId)
    .maybeSingle()
  if (profileError) return json({ error: profileError.message, stage: 'actor_profile' }, 500)
  if (!profile || profile.is_active === false) {
    return json({ error: 'El perfil del usuario no está activo', stage: 'actor_profile' }, 403)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'El cuerpo JSON no es válido', stage: 'payload' }, 400)
  }

  const action = String(body.action || '')
  try {
    if (action === 'create_request') {
      const { data, error } = await admin.rpc('qpc_create_inspection_request', {
        p_actor: actorId,
        p_payload: body.payload || {},
      })
      if (error) throw Object.assign(error, { stage: 'create_request' })
      return json({ ok: true, inspection: data })
    }

    if (action === 'take') {
      const { data, error } = await admin.rpc('qpc_take_inspection', {
        p_actor: actorId,
        p_inspection_id: body.inspection_id,
      })
      if (error) throw Object.assign(error, { stage: 'take' })
      return json({ ok: true, inspection: data })
    }

    if (action === 'start_visit') {
      const { data, error } = await admin.rpc('qpc_start_inspection_visit', {
        p_actor: actorId,
        p_inspection_id: body.inspection_id,
        p_payload: body.payload || {},
      })
      if (error) throw Object.assign(error, { stage: 'start_visit' })
      return json({ ok: true, visit: data })
    }

    if (action === 'save_visit_draft') {
      const { data, error } = await admin.rpc('qpc_save_visit_draft', {
        p_actor: actorId,
        p_visit_id: body.visit_id,
        p_payload: body.payload || {},
      })
      if (error) throw Object.assign(error, { stage: 'save_visit_draft' })
      return json({ ok: true, visit: data })
    }

    if (action === 'finish_visit') {
      const { data, error } = await admin.rpc('qpc_finish_inspection_visit', {
        p_actor: actorId,
        p_visit_id: body.visit_id,
        p_payload: body.payload || {},
      })
      if (error) throw Object.assign(error, { stage: 'finish_visit' })
      return json({ ok: true, ...data })
    }

    if (action === 'mark_improper') {
      const { data, error } = await admin.rpc('qpc_mark_inspection_improper', {
        p_actor: actorId,
        p_inspection_id: body.inspection_id,
        p_comment: String(body.comment || ''),
      })
      if (error) throw Object.assign(error, { stage: 'mark_improper' })
      return json({ ok: true, inspection: data })
    }

    return json({ error: 'Acción no reconocida', stage: 'action', action }, 400)
  } catch (error) {
    const e = error as { message?: string; details?: string; hint?: string; code?: string; stage?: string }
    console.error('inspection-workflow', { action, actorId, error: e })
    return json({
      error: e.message || 'La operación no pudo completarse',
      stage: e.stage || action || 'unknown',
      code: e.code || null,
      details: e.details || null,
      hint: e.hint || null,
    }, 400)
  }
})
