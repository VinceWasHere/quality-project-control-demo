import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qpc-push-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

const categoryAllowed = (categories: Record<string, unknown> | null, category: string) => {
  if (!categories || typeof categories !== 'object') return true
  const value = categories[category] ?? categories.GENERAL
  return value !== false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const publicKey = Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY') ?? ''
  const privateKey = Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY') ?? ''
  const subject = Deno.env.get('WEB_PUSH_VAPID_SUBJECT') ?? 'mailto:calidad@codelpa.com'
  const webhookSecret = Deno.env.get('QPC_PUSH_WEBHOOK_SECRET') ?? ''

  const url = new URL(req.url)
  if (req.method === 'GET' || url.searchParams.get('action') === 'public-key') {
    if (!publicKey) return json({ error: 'WEB_PUSH_VAPID_PUBLIC_KEY no configurada.' }, 503)
    return json({ publicKey })
  }

  if (!webhookSecret || req.headers.get('x-qpc-push-secret') !== webhookSecret) {
    return json({ error: 'Solicitud no autorizada.' }, 401)
  }
  if (!publicKey || !privateKey) return json({ error: 'Claves VAPID incompletas.' }, 503)

  const payload = await req.json().catch(() => ({}))
  const eventType = String(payload.type ?? payload.eventType ?? '').toUpperCase()
  const record = payload.record ?? payload.new ?? payload
  const oldRecord = payload.old_record ?? payload.old ?? null

  if (!record?.id || !record?.recipient_id) return json({ skipped: true, reason: 'Payload sin notificación.' })
  if (record.archived_at || record.read_at) return json({ skipped: true, reason: 'Notificación archivada o leída.' })

  if (eventType === 'UPDATE' && oldRecord) {
    const oldFingerprint = oldRecord?.metadata?.fingerprint ?? null
    const newFingerprint = record?.metadata?.fingerprint ?? null
    const becameUnread = Boolean(oldRecord.read_at) && !record.read_at
    const meaningfulDigestUpdate = oldFingerprint !== newFingerprint
    if (!becameUnread && !meaningfulDigestUpdate) {
      return json({ skipped: true, reason: 'Actualización sin contenido nuevo.' })
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const [{ data: preference }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
    admin.from('qpc_notification_preferences')
      .select('enabled,categories,show_preview,sound_enabled')
      .eq('user_id', record.recipient_id)
      .maybeSingle(),
    admin.from('qpc_push_subscriptions')
      .select('id,endpoint,p256dh,auth_key')
      .eq('user_id', record.recipient_id)
      .eq('enabled', true),
  ])

  if (subscriptionsError) return json({ error: subscriptionsError.message }, 500)
  if (!preference?.enabled) return json({ skipped: true, reason: 'Usuario no activó notificaciones del dispositivo.' })
  if (!categoryAllowed(preference.categories, String(record.category ?? 'GENERAL'))) {
    return json({ skipped: true, reason: 'Categoría desactivada.' })
  }
  if (!subscriptions?.length) return json({ skipped: true, reason: 'Sin dispositivos suscritos.' })

  webpush.setVapidDetails(subject, publicKey, privateKey)

  const pushPayload = JSON.stringify({
    notification_id: record.id,
    title: record.title || 'Quality Project Control',
    body: preference.show_preview === false ? 'Tiene una nueva notificación en Quality Project Control.' : (record.body || ''),
    category: record.category || 'GENERAL',
    action_view: record.action_view || null,
    entity_id: record.entity_id || null,
    project_id: record.project_id || null,
    metadata: record.metadata || {},
    silent: preference.sound_enabled === false,
  })

  let sent = 0
  let removed = 0
  const errors: string[] = []

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
      }, pushPayload, { TTL: 3600, urgency: 'normal' })
      sent += 1
      await admin.from('qpc_push_subscriptions').update({
        last_success_at: new Date().toISOString(),
        failure_count: 0,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', subscription.id)
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 0)
      if (statusCode === 404 || statusCode === 410) {
        await admin.from('qpc_push_subscriptions').delete().eq('id', subscription.id)
        removed += 1
      } else {
        errors.push(error instanceof Error ? error.message : String(error))
        await admin.from('qpc_push_subscriptions').update({
          failure_count: 1,
          updated_at: new Date().toISOString(),
        }).eq('id', subscription.id)
      }
    }
  }

  return json({ ok: true, sent, removed, errors: errors.slice(0, 5) })
})
