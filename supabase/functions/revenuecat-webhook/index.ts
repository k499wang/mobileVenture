import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Set REVENUECAT_WEBHOOK_SECRET and REVENUECAT_APP_ID_TO_SLUG='{ "rc-app-id": "my-app" }'.
Deno.serve(async (request) => {
  if (request.headers.get('Authorization') !== `Bearer ${Deno.env.get('REVENUECAT_WEBHOOK_SECRET')}`) return new Response('Unauthorized', { status: 401 });
  const payload = await request.json().catch(() => null);
  if (!payload) return new Response('Invalid JSON', { status: 400 });
  const event = payload.event ?? payload;
  let appMapping: Record<string, string>;
  try { appMapping = JSON.parse(Deno.env.get('REVENUECAT_APP_ID_TO_SLUG') ?? '{}'); }
  catch { return new Response('Invalid app mapping', { status: 500 }); }
  const appId = appMapping[event.app_id];
  const userId = event.app_user_id;
  if (!appId || !userId || userId.startsWith('$RCAnonymousID:')) return new Response('Ignored', { status: 200 });
  // Cancellation only stops renewal. The entitlement remains active until an
  // expiration/refund event tells us otherwise.
  const active = !['EXPIRATION', 'REFUND'].includes(event.type);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { error } = await admin.from('subscription_status').upsert({
    app_id: appId, user_id: userId, entitlement_id: event.entitlement_ids?.[0] ?? 'pro', is_active: active,
    expires_at: event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null, revenuecat_app_user_id: userId, updated_at: new Date().toISOString(),
  });
  return error ? new Response('Update failed', { status: 500 }) : new Response('OK');
});
