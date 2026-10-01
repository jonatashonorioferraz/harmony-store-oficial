// Server-only transport primitives. No deployed endpoint, scheduler, storage or automatic retries.
// A future worker MUST durably reserve and mark dispatching before calling sendTemplateOnce.
const encoder = new TextEncoder();
const digits = value => typeof value === 'string' && /^[1-9][0-9]{6,14}$/.test(value);
const graphId = value => typeof value === 'string' && /^[1-9][0-9]{0,31}$/.test(value);
export const WEBHOOK_MAX_BYTES = 3 * 1024 * 1024;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const instant = value => typeof value === 'string' && /T.*(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) && Number.isFinite(Date.parse(value));
const providerId = value => typeof value === 'string' && /^wamid\.[A-Za-z0-9_+\/=.-]{1,500}$/.test(value);
const safeCode = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
export function normalizeWhatsAppNumber(value) {
  if (typeof value !== 'string' || !/^\+?[1-9][0-9 ()-]{6,24}$/.test(value)) throw new Error('INVALID_RECIPIENT');
  const normalized = value.replace(/[+ ()-]/g, '');
  if (!digits(normalized)) throw new Error('INVALID_RECIPIENT');
  return normalized;
}
const saoPauloDate = now => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
};
export function buildTemplateRequest({ config, delivery, now = new Date() }) {
  const time = now.getTime();
  if (!Number.isFinite(time)) throw new Error('INVALID_CLOCK');
  if (config?.enabled !== true) throw new Error('CHANNEL_DISABLED');
  if (!/^v[0-9]{2}\.0$/.test(config.apiVersion || '') || !graphId(config.phoneNumberId) ||
      typeof config.accessToken !== 'string' || !config.accessToken.trim() || /\s/.test(config.accessToken)) throw new Error('CHANNEL_CONFIGURATION');
  const template = config.template;
  if (template?.status !== 'APPROVED' || template.category !== 'UTILITY' ||
      !/^[a-z][a-z0-9_]{0,511}$/.test(template.name || '') || template.language !== 'pt_BR' ||
      !Number.isInteger(template.ttlSeconds) || template.ttlSeconds < 30 || template.ttlSeconds > 3600) throw new Error('TEMPLATE_NOT_READY');
  if (!uuid(delivery?.id) || delivery.state !== 'dispatching') throw new Error('DELIVERY_NOT_RESERVED');
  if (!instant(delivery.expires_at) || Date.parse(delivery.expires_at) <= time ||
      delivery.business_date !== saoPauloDate(now)) throw new Error('BRIEFING_EXPIRED');
  if (!instant(delivery.opted_in_at) || Date.parse(delivery.opted_in_at) > time ||
      delivery.opted_out_at != null) throw new Error('CONSENT_REQUIRED');
  const to = normalizeWhatsAppNumber(delivery.recipient);
  if (config.senderNumber && normalizeWhatsAppNumber(config.senderNumber) === to) throw new Error('SENDER_IS_RECIPIENT');
  // The durable snapshot supplies the exact text. Never recompute it independently per recipient.
  if (typeof delivery.plain_text !== 'string' || !delivery.plain_text.trim() ||
      [...delivery.plain_text].length > 850) throw new Error('INVALID_BRIEFING');
  const summary = delivery.plain_text.replace(/\s+/gu, ' ').trim();
  if (/[\u0000-\u001f\u007f]/u.test(summary)) throw new Error('INVALID_BRIEFING');
  return {
    url: 'https://graph.facebook.com/' + config.apiVersion + '/' + config.phoneNumberId + '/messages',
    payload: {
      messaging_product: 'whatsapp', recipient_type: 'individual', to: '+' + to, type: 'template',
      biz_opaque_callback_data: 'central:' + delivery.id,
      template: { name: template.name, language: { code: template.language },
        components: [{ type: 'body', parameters: [
          { type: 'text', text: delivery.business_date.split('-').reverse().join('/') },
          { type: 'text', text: summary },
        ] }] },
    },
  };
}
export async function sendTemplateOnce({ config, delivery, now = new Date(), fetchImpl = fetch }) {
  let request;
  try { request = buildTemplateRequest({ config, delivery, now }); }
  catch (error) { return { state: 'blocked', code: error.message, provider_message_id: null, retry_automatically: false }; }
  // One HTTP attempt only. A lost response may hide a successful send.
  try {
    const response = await fetchImpl(request.url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: 'Bearer ' + config.accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(request.payload),
    });
    let body;
    try { body = await response.json(); } catch { body = null; }
    if (response.ok && body?.messaging_product === 'whatsapp' && body.messages?.length === 1 && providerId(body.messages[0]?.id)) {
      const providerStatus = body.messages[0].message_status;
      if (providerStatus && !['accepted', 'held_for_quality_assessment'].includes(providerStatus)) {
        return { state: 'unknown', code: 'UNRECOGNIZED_ACCEPTANCE', provider_message_id: body.messages[0].id, retry_automatically: false };
      }
      let providerRecipient = null;
      const contact = body.contacts?.length === 1 ? body.contacts[0] : null;
      if (contact && digits(contact.wa_id)) {
        try { if (normalizeWhatsAppNumber(contact.input) === request.payload.to.slice(1)) providerRecipient = contact.wa_id; } catch { /* Untrusted response field: leave unresolved. */ }
      }
      return { state: 'accepted', code: null, provider_message_id: body.messages[0].id, provider_recipient_id: providerRecipient,
        provider_status: providerStatus || 'accepted', retry_automatically: false };
    }
    if (response.status >= 400 && response.status < 500 && safeCode(body?.error?.code) !== null) {
      return { state: 'rejected', code: 'PROVIDER_REJECTED', provider_code: safeCode(body.error.code),
        provider_message_id: null, retry_automatically: false };
    }
    return { state: 'unknown', code: 'AMBIGUOUS_RESPONSE', provider_message_id: null, retry_automatically: false };
  } catch {
    // Do not persist raw provider errors, tokens, phone numbers or message text in diagnostic logs.
    return { state: 'unknown', code: 'RESPONSE_NOT_CONFIRMED', provider_message_id: null, retry_automatically: false };
  }
}
export async function verifyWhatsAppSignature(rawBody, signature, appSecret) {
  if (!(rawBody instanceof Uint8Array) || rawBody.byteLength > WEBHOOK_MAX_BYTES ||
      !/^sha256=[0-9a-f]{64}$/.test(signature || '') || typeof appSecret !== 'string' || !appSecret) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.slice(7).match(/../g), value => Number.parseInt(value, 16));
  return crypto.subtle.verify('HMAC', key, bytes, rawBody);
}
export async function parseWhatsAppStatuses({ rawBody, signature, appSecret, wabaId, phoneNumberId }) {
  if (!graphId(wabaId) || !graphId(phoneNumberId) || !await verifyWhatsAppSignature(rawBody, signature, appSecret)) {
    throw new Error('WEBHOOK_NOT_AUTHENTICATED');
  }
  let payload;
  try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody)); }
  catch { throw new Error('WEBHOOK_INVALID'); }
  if (payload?.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) throw new Error('WEBHOOK_INVALID');
  const results = [];
  for (const entry of payload.entry) {
    if (entry.id !== wabaId || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      const value = change.value;
      if (change.field !== 'messages' || value?.messaging_product !== 'whatsapp' ||
          value.metadata?.phone_number_id !== phoneNumberId || !Array.isArray(value.statuses)) continue;
      for (const item of value.statuses) {
        if (!providerId(item.id) || !digits(item.recipient_id) || !['sent', 'delivered', 'read', 'failed'].includes(item.status) ||
            typeof item.timestamp !== 'string' || !/^[1-9][0-9]{0,11}$/.test(item.timestamp)) continue;
        const callback = typeof item.biz_opaque_callback_data === 'string' && item.biz_opaque_callback_data.startsWith('central:')
          ? item.biz_opaque_callback_data.slice(8) : null;
        results.push({
          provider_message_id: item.id, recipient: item.recipient_id, status: item.status,
          occurred_at: new Date(Number(item.timestamp) * 1000).toISOString(),
          delivery_id: uuid(callback) ? callback : null,
          provider_code: safeCode(item.errors?.[0]?.code),
        });
      }
    }
  }
  // Caller MUST persist events/dedup and reconcile recipient+ID in one transaction before acknowledging HTTP200.
  return results;
}
export function applyWhatsAppStatus(delivery, event) {
  if (!delivery || !event || !['sent', 'delivered', 'read', 'failed'].includes(event.status) ||
      !instant(event.occurred_at) || !providerId(event.provider_message_id) ||
      (delivery.provider_recipient_id || normalizeWhatsAppNumber(delivery.recipient)) !== event.recipient) throw new Error('STATUS_MISMATCH');
  if (delivery.provider_message_id) {
    if (delivery.provider_message_id !== event.provider_message_id) throw new Error('STATUS_MISMATCH');
    if (event.delivery_id && event.delivery_id !== delivery.id) throw new Error('STATUS_MISMATCH');
  } else if (!uuid(delivery.id) || event.delivery_id !== delivery.id ||
      !['dispatching', 'unknown', 'accepted'].includes(delivery.state)) throw new Error('STATUS_MISMATCH');
  const next = { ...delivery, provider_message_id: event.provider_message_id };
  const field = { sent: 'sent_at', delivered: 'delivered_at', read: 'read_at', failed: 'failed_at' }[event.status];
  if (!next[field] || Date.parse(event.occurred_at) < Date.parse(next[field])) next[field] = event.occurred_at;
  // 'read' may arrive without 'delivered'; never invent a delivered timestamp.
  // Keep failure as an event, but it must not erase proven delivery/read.
  if (next.read_at) next.state = 'read';
  else if (next.delivered_at) next.state = 'delivered';
  else if (next.failed_at) next.state = 'failed';
  else if (next.sent_at) next.state = 'sent';
  next.retry_automatically = false;
  return next;
}