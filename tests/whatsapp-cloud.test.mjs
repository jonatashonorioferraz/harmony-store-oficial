import assert from 'node:assert/strict';
import test from 'node:test';
import { WEBHOOK_MAX_BYTES, normalizeWhatsAppNumber, buildTemplateRequest, sendTemplateOnce, verifyWhatsAppSignature, parseWhatsAppStatuses, applyWhatsAppStatus } from '../supabase/functions/_shared/whatsapp-cloud.mjs';

const NOW = new Date('2026-10-01T10:30:00Z');
const ID = '00000000-0000-4000-8000-000000000001';
const PHONE = '15555550100';
const MESSAGE = 'wamid.synthetic_test_1';
const config = () => ({ enabled: true, apiVersion: 'v99.0', phoneNumberId: '123456789012345', accessToken: 'synthetic-token',
  template: { name: 'harmony_resumo_operacional', language: 'pt_BR', status: 'APPROVED', category: 'UTILITY', ttlSeconds: 3600 } });
const delivery = () => ({ id: ID, state: 'dispatching', business_date: '2026-10-01', expires_at: '2026-10-01T11:30:00Z',
  recipient: PHONE, opted_in_at: '2026-09-30T10:00:00Z', opted_out_at: null,
  plain_text: 'Consulta de teste.\nBoletos indisponíveis. Solicitações abertas: 1.' });
const signed = async payload => {
  const rawBody = new TextEncoder().encode(JSON.stringify(payload));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('synthetic-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, rawBody));
  return { rawBody, signature: 'sha256=' + [...digest].map(byte => byte.toString(16).padStart(2, '0')).join(''), appSecret: 'synthetic-secret',
    wabaId: '987654321012345', phoneNumberId: config().phoneNumberId };
};
const payload = (statuses, overrides = {}) => ({ object: 'whatsapp_business_account', entry: [{ id: '987654321012345', changes: [{
  field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: config().phoneNumberId }, statuses, ...overrides },
}] }] });
const status = (state, overrides = {}) => ({ id: MESSAGE, recipient_id: PHONE, status: state,
  timestamp: String(NOW.getTime() / 1000), biz_opaque_callback_data: 'central:' + ID, ...overrides });

test('recipient normalization is explicit and does not infer country or accept URLs/extensions', () => {
  assert.equal(normalizeWhatsAppNumber('+1 (555) 555-0100'), PHONE);
  for (const value of ['', null, '00555555', 'abc', PHONE + '?token=x', '+15555550100ext9', '1234567890123456']) {
    assert.throws(() => normalizeWhatsAppNumber(value), /INVALID_RECIPIENT/);
  }
});
test('approved utility template uses persisted content, one-line parameters and correlation ID', () => {
  const result = buildTemplateRequest({ config: config(), delivery: delivery(), now: NOW });
  assert.equal(result.url, 'https://graph.facebook.com/v99.0/123456789012345/messages');
  assert.equal(result.payload.type, 'template');
  assert.equal(result.payload.to, '+' + PHONE);
  assert.equal(result.payload.biz_opaque_callback_data, 'central:' + ID);
  assert.deepEqual(result.payload.template.components[0].parameters, [
    { type: 'text', text: '01/10/2026' }, { type: 'text', text: delivery().plain_text.replace(/\s+/g, ' ') },
  ]);
  assert.ok(!JSON.stringify(result.payload).includes(config().accessToken));
});
test('disabled/incomplete channels, unapproved/recategorized or long-lived templates make zero calls', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('must not call'); };
  for (const current of [
    { ...config(), enabled: false }, { ...config(), accessToken: '' }, { ...config(), phoneNumberId: '../../outside' },
    { ...config(), apiVersion: 'https://other.invalid' },
    { ...config(), template: { ...config().template, status: 'PENDING' } },
    { ...config(), template: { ...config().template, category: 'MARKETING' } },
    { ...config(), template: { ...config().template, ttlSeconds: null } },
    { ...config(), template: { ...config().template, ttlSeconds: 86400 } },
  ]) {
    const result = await sendTemplateOnce({ config: current, delivery: delivery(), now: NOW, fetchImpl });
    assert.equal(result.state, 'blocked');
  }
  assert.equal(calls, 0);
});
test('reservation, consent, clock and daily expiry are checked before HTTP', async () => {
  let calls = 0;
  for (const current of [
    { ...delivery(), state: 'queued' }, { ...delivery(), opted_in_at: null },
    { ...delivery(), opted_in_at: '2026-10-02T00:00:00Z' }, { ...delivery(), opted_out_at: NOW.toISOString() },
    { ...delivery(), expires_at: NOW.toISOString() }, { ...delivery(), business_date: '2026-09-30' },
    { ...delivery(), expires_at: 'tomorrow' }, { ...delivery(), plain_text: 'x'.repeat(851) },
    { ...delivery(), plain_text: 'text\u0000invalid' }, { ...delivery(), id: 'not-an-id' },
  ]) {
    assert.equal((await sendTemplateOnce({ config: config(), delivery: current, now: NOW, fetchImpl: async () => { calls++; } })).state, 'blocked');
  }
  assert.equal(calls, 0);
  assert.throws(() => buildTemplateRequest({ config: { ...config(), senderNumber: '+' + PHONE }, delivery: delivery(), now: NOW }), /SENDER_IS_RECIPIENT/);
  assert.throws(() => buildTemplateRequest({ config: config(), delivery: delivery(), now: new Date('invalid') }), /INVALID_CLOCK/);
  assert.throws(() => buildTemplateRequest({ config: config(), delivery: { ...delivery(), expires_at: '2026-10-03T00:00:00Z' }, now: new Date('2026-10-02T03:00:00Z') }), /BRIEFING_EXPIRED/);
});
test('HTTP acceptance is not delivery; request redirects are forbidden and no retries occur', async () => {
  for (const message_status of ['accepted', 'held_for_quality_assessment', undefined]) {
    let calls = 0;
    const result = await sendTemplateOnce({ config: config(), delivery: delivery(), now: NOW,
      fetchImpl: async (url, options) => {
        calls++;
        assert.ok(url.startsWith('https://graph.facebook.com/'));
        assert.equal(options.redirect, 'error');
        assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
        assert.ok(options.signal instanceof AbortSignal);
        return Response.json({ messaging_product: 'whatsapp', messages: [{ id: MESSAGE, message_status }] });
      } });
    assert.equal(calls, 1);
    assert.equal(result.state, 'accepted');
    assert.equal(result.provider_message_id, MESSAGE);
    assert.equal(result.retry_automatically, false);
    assert.equal(result.delivered_at, undefined);
  }
});
test('network errors, invalid responses and server errors remain unknown without exposing raw errors', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('synthetic-token secret payload and recipient'); },
    async () => new Response('<html>gateway failed</html>', { status: 502 }),
    async () => Response.json({ error: { code: 1, message: 'raw private details' } }, { status: 500 }),
    async () => Response.json({ messaging_product: 'whatsapp', messages: [] }),
    async () => Response.json({ messaging_product: 'whatsapp', messages: [{ id: MESSAGE, message_status: 'new-status' }] }),
  ]) {
    let calls = 0;
    const result = await sendTemplateOnce({ config: config(), delivery: delivery(), now: NOW, fetchImpl: (...args) => { calls++; return fetchImpl(...args); } });
    assert.equal(calls, 1);
    assert.equal(result.state, 'unknown');
    assert.equal(result.retry_automatically, false);
    assert.doesNotMatch(JSON.stringify(result), /synthetic-token|private|recipient|secret payload/);
  }
});
test('definite provider rejection reports only numeric safe code and never retries', async () => {
  const result = await sendTemplateOnce({ config: config(), delivery: delivery(), now: NOW,
    fetchImpl: async () => Response.json({ error: { code: 131030, message: 'recipient detail' } }, { status: 400 }) });
  assert.equal(result.state, 'rejected');
  assert.equal(result.provider_code, 131030);
  assert.equal(result.retry_automatically, false);
  assert.ok(!JSON.stringify(result).includes('recipient detail'));
});
test('HMAC authenticates exact raw bytes before JSON; altered body, secret and missing signature fail', async () => {
  const input = await signed(payload([status('sent')]));
  assert.equal(await verifyWhatsAppSignature(input.rawBody, input.signature, input.appSecret), true);
  assert.equal(await verifyWhatsAppSignature(input.rawBody, input.signature, 'wrong'), false);
  assert.equal(await verifyWhatsAppSignature(new Uint8Array([...input.rawBody, 32]), input.signature, input.appSecret), false);
  assert.equal(await verifyWhatsAppSignature(input.rawBody, null, input.appSecret), false);
  assert.equal(await verifyWhatsAppSignature(new Uint8Array(WEBHOOK_MAX_BYTES + 1), input.signature, input.appSecret), false);
  await assert.rejects(parseWhatsAppStatuses({ ...input, signature: 'sha256=' + '0'.repeat(64) }), /WEBHOOK_NOT_AUTHENTICATED/);
});
test('webhook scope and status projection reject other accounts/numbers and ignore inbound message content', async () => {
  const input = await signed(payload([status('read'), status('failed', { errors: [{ code: 131026, title: 'private', error_data: { details: 'private' } }] })],
    { messages: [{ text: { body: 'private inbound' } }] }));
  const results = await parseWhatsAppStatuses(input);
  assert.equal(results.length, 2);
  assert.equal(results[0].delivery_id, ID);
  assert.equal(results[1].provider_code, 131026);
  assert.doesNotMatch(JSON.stringify(results), /private/);
  assert.deepEqual(await parseWhatsAppStatuses({ ...input, wabaId: '111111111111111' }), []);
  assert.deepEqual(await parseWhatsAppStatuses({ ...input, phoneNumberId: '222222222222222' }), []);
  const invalid = await signed(payload([status('unknown'), status('sent', { timestamp: 'not-time' }), status('sent', { id: 'bad-id' })]));
  assert.deepEqual(await parseWhatsAppStatuses(invalid), []);
});
test('ambiguous send reconciles by callback + recipient and binds provider ID, preventing cross-message updates', async () => {
  const [event] = await parseWhatsAppStatuses(await signed(payload([status('delivered')])));
  const stored = { ...delivery(), state: 'unknown' };
  const result = applyWhatsAppStatus(stored, event);
  assert.equal(result.state, 'delivered');
  assert.equal(result.provider_message_id, MESSAGE);
  assert.equal(stored.state, 'unknown');
  assert.throws(() => applyWhatsAppStatus(stored, { ...event, recipient: '15555550101' }), /STATUS_MISMATCH/);
  assert.throws(() => applyWhatsAppStatus(stored, { ...event, delivery_id: null }), /STATUS_MISMATCH/);
  assert.throws(() => applyWhatsAppStatus(result, { ...event, provider_message_id: 'wamid.different' }), /STATUS_MISMATCH/);
  assert.throws(() => applyWhatsAppStatus(result, { ...event, delivery_id: '00000000-0000-4000-8000-000000000002' }), /STATUS_MISMATCH/);
});
test('read may arrive first; duplicates and delayed sent/failed cannot erase delivery or fabricate its time', async () => {
  const events = await parseWhatsAppStatuses(await signed(payload([
    status('read'), status('sent', { timestamp: String(NOW.getTime() / 1000 - 60) }), status('failed'),
  ])));
  let state = { ...delivery(), state: 'accepted', provider_message_id: MESSAGE };
  for (const event of events) state = applyWhatsAppStatus(state, event);
  assert.equal(state.state, 'read');
  assert.equal(state.delivered_at, undefined);
  assert.equal(state.read_at, NOW.toISOString());
  assert.equal(state.failed_at, NOW.toISOString());
  assert.deepEqual(applyWhatsAppStatus(state, events[0]), state);
  assert.equal(state.retry_automatically, false);
});
test('Graph IDs are opaque numeric identifiers and may exceed the E.164 telephone limit', async () => {
  const current = { ...config(), phoneNumberId: '1234567890123456' };
  assert.match(buildTemplateRequest({ config: current, delivery: delivery(), now: NOW }).url, /1234567890123456\/messages$/);
  const data = payload([status('sent')]);
  data.entry[0].id = '123456789012345678';
  data.entry[0].changes[0].value.metadata.phone_number_id = current.phoneNumberId;
  const input = await signed(data);
  assert.equal((await parseWhatsAppStatuses({ ...input, wabaId: data.entry[0].id, phoneNumberId: current.phoneNumberId })).length, 1);
});
test('provider canonical recipient is bound only through the contact input from that exact response', async () => {
  const canonical = '15555550101';
  const send = contacts => sendTemplateOnce({ config: config(), delivery: delivery(), now: NOW, fetchImpl: async () =>
    Response.json({ messaging_product: 'whatsapp', contacts, messages: [{ id: MESSAGE }] }) });
  const accepted = await send([{ input: PHONE, wa_id: canonical }]);
  assert.equal(accepted.provider_recipient_id, canonical);
  const [event] = await parseWhatsAppStatuses(await signed(payload([status('delivered', { recipient_id: canonical })])));
  assert.equal(applyWhatsAppStatus({ ...delivery(), ...accepted }, event).state, 'delivered');
  assert.equal((await send([{ input: '15555550102', wa_id: canonical }])).provider_recipient_id, null);
  assert.equal((await send([{ input: PHONE, wa_id: 'invalid' }])).provider_recipient_id, null);
  // Lost send response provides no trustworthy canonical-number mapping; preserve ambiguity.
  assert.throws(() => applyWhatsAppStatus({ ...delivery(), state: 'unknown' }, event), /STATUS_MISMATCH/);
});
test('valid signed webhook batches larger than 256KiB remain supported within the provider limit', async () => {
  const input = await signed(payload([status('sent')], { ignored_padding: 'x'.repeat(300 * 1024) }));
  assert.equal((await parseWhatsAppStatuses(input)).length, 1);
});