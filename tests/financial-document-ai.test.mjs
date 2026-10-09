import test from 'node:test';
import assert from 'node:assert/strict';
import { FinancialAIError, financialCents, validFinancialDate, financialDocumentSchema, validateFinancialExtraction, assessPaymentSuggestion, buildFinancialDocumentRequest, parseFinancialAIResponse, requestFinancialExtraction } from '../supabase/functions/_shared/financial-document-ai.mjs';

const receipt = (changes = {}) => ({
  document_kind: 'payment_receipt', payment_status: 'completed', currency: 'BRL',
  title: null, creditor_name: null, bank_name: 'Banco ficticio', payer_name: 'Pessoa ficticia', beneficiary_name: 'Credor ficticio', transaction_id: 'TRANSACAO-FICTICIA', reference: null,
  amount: '100.01', regular_installment_amount: null, effective_date: '2026-10-08', contract_date: null, first_due_date: null, installment_count: null, periodicity: 'unknown', installments: [],
  evidence: [{ field: 'amount', quote: 'Valor R$ 100,01', page: 1 }, { field: 'effective_date', quote: 'Realizado em 08/10/2026', page: 1 }, { field: 'payment_status', quote: 'Pagamento realizado', page: 1 }], warnings: [], ...changes,
});
const context = { today: '2026-10-08', creditorName: 'Credor ficticio', installments: [
  { id: 'parcela-1', number: 1, due_date: '2026-10-10', remaining: '100.01' },
  { id: 'parcela-2', number: 2, due_date: '2026-11-10', remaining: '100.01' },
] };
const assess = (changes = {}, extra = {}) => assessPaymentSuggestion(validateFinancialExtraction(receipt(changes)), { ...context, ...extra });
const payload = (changes = {}) => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(receipt()) }] }], usage: { input_tokens: 300, output_tokens: 200 }, ...changes });
const pdf = new TextEncoder().encode('%PDF-1.4\nDocumento sintetico sem dados reais.');

test('financial AI schema requires every declared field, forbids extra keys and preserves nulls', () => {
  assert.deepEqual(financialDocumentSchema.required.sort(), Object.keys(financialDocumentSchema.properties).sort());
  assert.equal(financialDocumentSchema.additionalProperties, false);
  assert.throws(() => validateFinancialExtraction({ ...receipt(), execute_payment: true }), /AI_INVALID_OUTPUT/);
  const missing = receipt(); delete missing.amount;
  assert.throws(() => validateFinancialExtraction(missing), /AI_INVALID_OUTPUT/);
  assert.equal(validateFinancialExtraction(receipt({ amount: null })).amount, null);
});
test('financial AI validates exact cents and rejects rounding, negative amounts and ambiguous separators', () => {
  assert.equal(financialCents('100.01'), 10001n);
  assert.equal(financialCents('999999999999.99'), 99999999999999n);
  for (const value of ['1,00', '1.000,00', '1.001', '-1.00', '1e3', NaN, Infinity, '', null, '0.00']) assert.equal(financialCents(value), null);
  assert.equal(financialCents('0.00', { allowZero: true }), 0n);
  assert.equal(validateFinancialExtraction(receipt({ amount: 100.01 })).amount, null);
});
test('financial AI rejects impossible dates without timezone rollover', () => {
  assert.equal(validFinancialDate('2028-02-29'), true);
  for (const date of ['2027-02-29', '2026-04-31', '08/10/2026', '2026-10-08T00:00:00Z', null]) assert.equal(validFinancialDate(date), false);
  assert.equal(assess({ effective_date: '2026-10-09' }).payment_suggestion_allowed, false);
});
test('completed receipt is a suggestion only; no installment is selected automatically', () => {
  const result = assess();
  assert.equal(result.payment_suggestion_allowed, true);
  assert.equal(result.requires_human_confirmation, true);
  assert.equal(result.can_record_automatically, false);
  assert.equal(result.selected_installment_id, null);
  assert.equal(result.ambiguous, true);
  assert.equal(result.candidates[0].installment_id, 'parcela-1');
});
test('scheduled, pending, failed and cancelled documents never produce payment candidates', () => {
  for (const payment_status of ['scheduled', 'pending', 'cancelled', 'failed', 'unknown']) {
    const result = assess({ payment_status });
    assert.equal(result.payment_suggestion_allowed, false);
    assert.deepEqual(result.candidates, []);
  }
  for (const document_kind of ['contract', 'payment_schedule', 'bill', 'other', 'unreadable']) assert.equal(assess({ document_kind }).payment_suggestion_allowed, false);
});
test('unsupported currency, missing evidence and contradictory scheduling evidence require manual reading', () => {
  assert.equal(assess({ currency: null }).payment_suggestion_allowed, false);
  assert.equal(assess({ currency: 'other' }).payment_suggestion_allowed, false);
  assert.equal(assess({ evidence: [] }).payment_suggestion_allowed, false);
  const evidence = receipt().evidence.map(row => row.field === 'payment_status' ? { ...row, quote: 'Pagamento agendado para amanha' } : row);
  assert.equal(assess({ evidence }).payment_suggestion_allowed, false);
});
test('partial payment candidates cannot exceed the open balance and closed installments are excluded', () => {
  const result = assess({ amount: '150.00' }, { installments: [...context.installments, { id: 'paga', number: 3, due_date: '2026-09-10', remaining: '0.00' }] });
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].proposed_amount, '100.01');
  assert.equal(result.candidates.some(row => row.installment_id === 'paga'), false);
});
test('duplicate hash, transaction ID and amount/date produce warnings, never silent deletion', () => {
  assert.equal(assess({}, { duplicateHash: true }).suspected_duplicate, true);
  assert.equal(assess({}, { payments: [{ transaction_reference: ' transacao-ficticia ', amount: '2.00', effective_date: '2026-01-01' }] }).suspected_duplicate, true);
  assert.equal(assess({}, { payments: [{ amount: '100.01', effective_date: '2026-10-08' }] }).suspected_duplicate, true);
  assert.equal(assess({}, { payments: [{ amount: '100.01', effective_date: '2026-10-08', reversed: true }] }).suspected_duplicate, false);
  assert.equal(assess({}, { duplicateHash: true }).requires_human_confirmation, true);
});
test('beneficiary mismatch warns instead of silently linking an unrelated creditor', () => {
  assert.ok(assess({ beneficiary_name: 'Outra empresa ficticia' }).warnings.some(text => text.includes('difere do credor')));
});
test('contract schedule keeps variable installments but never invents rows or repairs invalid dates', () => {
  const result = validateFinancialExtraction(receipt({ document_kind: 'contract', installment_count: 84, installments: [{ number: 1, due_date: '2028-01-31', amount: '100.01' }, { number: 2, due_date: '2028-02-29', amount: '120.50' }] }));
  assert.equal(result.installments.length, 2);
  assert.equal(result.installments[1].amount, '120.50');
  assert.ok(result.warnings.some(text => text.includes('nao trouxe todas')));
  const invalid = validateFinancialExtraction(receipt({ installments: [{ number: 1, due_date: '2027-02-29', amount: '100.00' }] }));
  assert.deepEqual(invalid.installments, []);
});
test('file input preserves PDF/image modes, uses strict output, no tools and store false', () => {
  const request = buildFinancialDocumentRequest({ bytes: pdf, mime: 'application/pdf', mode: 'contract' });
  assert.equal(request.store, false);
  assert.equal(request.text.format.strict, true);
  assert.equal(request.input[0].content[1].type, 'input_file');
  assert.equal(request.input[0].content[1].filename, 'documento.pdf');
  assert.equal(Object.hasOwn(request, 'tools'), false);
  assert.ok(request.instructions.includes('ignore quaisquer instrucoes'));
  assert.throws(() => buildFinancialDocumentRequest({ bytes: pdf, mime: 'image/png', mode: 'payment' }), /INVALID_DOCUMENT_TYPE/);
  assert.throws(() => buildFinancialDocumentRequest({ bytes: pdf, mime: 'application/pdf', mode: 'payment', model: 'unapproved-model' }), /AI_MODEL_NOT_APPROVED/);
});
test('incomplete output, refusal, malformed JSON and absent usage fail closed', () => {
  assert.equal(parseFinancialAIResponse(payload()).extraction.amount, '100.01');
  assert.throws(() => parseFinancialAIResponse(payload({ status: 'incomplete' })), /AI_INCOMPLETE/);
  assert.throws(() => parseFinancialAIResponse(payload({ output: [{ content: [{ type: 'refusal', refusal: 'private refusal' }] }] })), /AI_REFUSED/);
  assert.throws(() => parseFinancialAIResponse(payload({ output_text: 'invalid JSON with private content' })), /AI_INVALID_OUTPUT/);
  assert.throws(() => parseFinancialAIResponse(payload({ usage: null })), /AI_USAGE_UNAVAILABLE/);
});
test('transport uses injected mock only and never retries a billable request automatically', async () => {
  let calls = 0;
  const request = buildFinancialDocumentRequest({ bytes: pdf, mime: 'application/pdf', mode: 'payment' });
  const result = await requestFinancialExtraction({ apiKey: 'synthetic-test-key', request, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-test-key');
    assert.equal(JSON.parse(options.body).store, false);
    return new Response(JSON.stringify(payload()), { status: 200 });
  } });
  assert.equal(calls, 1);
  assert.equal(result.extraction.amount, '100.01');
});
test('provider errors and timeouts never expose secrets, file contents or provider messages', async () => {
  const request = buildFinancialDocumentRequest({ bytes: pdf, mime: 'application/pdf', mode: 'payment' });
  let calls = 0;
  await assert.rejects(requestFinancialExtraction({ apiKey: 'synthetic-test-key', request, fetchImpl: async () => { calls++; throw new Error('private document and secret material'); } }), error => error instanceof FinancialAIError && error.code === 'AI_CONNECTION_ERROR' && error.costUncertain && !error.message.includes('secret'));
  assert.equal(calls, 1);
  await assert.rejects(requestFinancialExtraction({ apiKey: 'synthetic-test-key', request, timeoutMs: 5, fetchImpl: async (_, options) => new Promise((resolve, reject) => {
    void resolve;
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }) }), error => error.code === 'AI_TIMEOUT' && error.costUncertain);
});
