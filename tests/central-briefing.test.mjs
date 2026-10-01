import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyBriefing, BRIEFING_APP_URL, BRIEFING_VERSION, BRIEFING_MAX_LENGTH } from '../central-briefing.mjs';
import { evaluateOperational } from '../supabase/functions/operational-central/evaluator.mjs';
const at = '2026-10-01T10:30:00Z';
const id = value => '00000000-0000-4000-8000-' + String(value).padStart(12, '0');
const base = (value, protocol = value) => ({ id: id(value), protocol, status: 'pending', updated_at: '2026-09-30T00:00:00Z' });
const bill = (value, due_date) => ({ ...base(value), due_date });
const request = (value, extra = {}) => ({ ...base(value), created_at: '2026-09-25T10:30:00Z', scheduled_for: null, ...extra });
function evaluation({ bills = [bill(37, '2026-09-30'), bill(38, '2026-10-01'), bill(39, '2026-10-02')], requests = [request(42, { status: 'scheduled', scheduled_for: '2026-09-30T13:00:00Z' }), request(47)], evaluatedAt = at, missing = [] } = {}) {
  return evaluateOperational({ evaluatedAt, sources: Object.entries({ bills, requests }).map(([key, rows]) => missing.includes(key) ? { id: key, status: 'unavailable', complete: false, row_count: null, fetched_at: evaluatedAt, error_code: 'READ_FAILED' } : { id: key, status: 'evaluated', complete: true, row_count: rows.length, fetched_at: evaluatedAt, rows }) });
}
function frozen(value) { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; }

test('real B0 evaluation yields deterministic concise preview with counts, protocols and safe root link', () => {
  const data = frozen(evaluation()), result = buildDailyBriefing(data);
  assert.deepEqual(result, buildDailyBriefing(data));assert.equal(result.schema_version, BRIEFING_VERSION);
  assert.equal(result.business_date, '2026-10-01');assert.equal(result.evaluated_at, at);assert.equal(result.source_evaluation_id, data.evaluation_id);
  assert.match(result.plain_text, /Prévia da consulta atual · 01\/10\/2026 07:30 \(São Paulo\)/);
  assert.match(result.plain_text, /1 vencidos; 1 vencem hoje; 1 amanhã/);assert.match(result.plain_text, /2 abertas; 1 com agendamento ultrapassado/);
  assert.match(result.plain_text, /1\. Boleto #0037: vencido e pendente no app \(30\/09\)/);
  assert.match(result.plain_text, /2\. Solicitação #0042: agendamento de 30\/09 10:00 ultrapassado/);
  assert.match(result.plain_text, /3\. Boleto #0038: vence hoje/);assert.doesNotMatch(result.plain_text, /#0039|#0047/);
  assert.match(result.plain_text, /Fontes completas: 2\/2/);assert.ok(result.plain_text.endsWith(BRIEFING_APP_URL));assert.ok(result.plain_text.length <= BRIEFING_MAX_LENGTH);
  assert.doesNotMatch(result.plain_text, /R\$|enviado|sem pendências|SLA/);assert.equal(result.generated_at, undefined);
});

test('daily identity depends on server business date, not evaluation or composer time', () => {
  const first = buildDailyBriefing(evaluation({ evaluatedAt: '2026-10-02T01:00:00Z' }));
  const second = buildDailyBriefing(evaluation({ evaluatedAt: '2026-10-02T02:59:59Z' }));
  const third = buildDailyBriefing(evaluation({ evaluatedAt: '2026-10-02T03:00:00Z' }));
  assert.equal(first.daily_key, second.daily_key);assert.notEqual(second.daily_key, third.daily_key);
  assert.equal(first.business_date, '2026-10-01');assert.equal(third.business_date, '2026-10-02');assert.notEqual(first.plain_text, second.plain_text);
});

test('unavailable sources remain unknown and do not turn into zero or remove the healthy domain', () => {
  for (const missing of [['bills'], ['requests'], ['bills', 'requests']]) {
    const data = evaluation({ missing }), text = buildDailyBriefing(data).plain_text;
    assert.match(text, new RegExp('Fontes completas: ' + (2 - missing.length) + '/2'));
    if (missing.includes('bills')) { assert.match(text, /Boletos: não avaliados/);assert.doesNotMatch(text, /Boletos pendentes no app: 0/);assert.equal(data.summary.counts.overdue_bills, null); }
    else assert.match(text, /1 vencidos; 1 vencem hoje; 1 amanhã/);
    if (missing.includes('requests')) { assert.match(text, /Solicitações: não avaliadas/);assert.doesNotMatch(text, /Solicitações: 0 abertas/); }
    else assert.match(text, /Solicitações: 2 abertas/);
    assert.doesNotMatch(text, /sem pendências|tudo em dia/);
  }
});

test('complete empty sources show actual zeros without inventing historical improvement', () => {
  const text = buildDailyBriefing(evaluation({ bills: [], requests: [] })).plain_text;
  assert.match(text, /0 vencidos; 0 vencem hoje; 0 amanhã/);assert.match(text, /0 abertas; 0 com agendamento ultrapassado/);assert.match(text, /Fontes completas: 2\/2/);
  assert.doesNotMatch(text, /resolvid|melhor|ontem|1\. /);
});

test('age is informative and measured in elapsed hours or days without an invented deadline', () => {
  for (const [created_at, expected] of [['2026-10-01T10:29:59Z', 'menos de 1 hora'], ['2026-10-01T09:30:00Z', '1 hora'], ['2026-09-30T10:30:00Z', '1 dia corrido'], ['2026-09-29T10:30:00Z', '2 dias corridos']]) {
    const text = buildDailyBriefing(evaluation({ bills: [], requests: [request(1, { created_at })] })).plain_text;
    assert.ok(text.includes('Solicitação #0001: aberta há ' + expected));assert.doesNotMatch(text, /atrasad|não lida|prazo excedido/);
  }
});

test('composer takes priority facts from conditions, never arbitrary titles, messages or duplicate payload', () => {
  const data = evaluation();data.conditions[0].title='SENSITIVE NAME';data.conditions[0].message='SENSITIVE AMOUNT';data.priorities[0]={key:data.conditions[0].key,title:'INJECTED TEXT'};
  const text=buildDailyBriefing(data).plain_text;assert.doesNotMatch(text,/SENSITIVE|INJECTED/);assert.match(text,/#0037/);
});

test('same request cannot occupy two priority positions and invalid or excessive priorities fail closed', () => {
  for (const mutate of [data => data.priorities.push(data.priorities[0]), data => data.priorities[0]={key:'missing'}, data => { const [a,b]=data.conditions.filter(item=>item.entity_id===id(42));data.priorities=[a,b]; }]) {
    const data=evaluation();mutate(data);assert.throws(()=>buildDailyBriefing(data),/prévia confiável/);
  }
});

test('invalid dates, coverage, rule version, unknown counts or protocol injection never become a plausible briefing', () => {
  const mutations=[data=>data.business_date='2026-10-02',data=>data.evaluated_at='2026-02-30T10:30:00Z',data=>data.rules_version='unknown',data=>data.summary.counts.overdue_bills=null,data=>data.summary.evaluated_sources=0,data=>data.sources[0].complete=false,data=>data.conditions[0].protocol='<script>',data=>data.conditions[0].facts.due_date='2026-02-30'];
  for(const mutate of mutations){const data=evaluation();mutate(data);assert.throws(()=>buildDailyBriefing(data),/prévia confiável/);}
});

test('external URL, credentials, alternate scheme, query and entity paths are rejected', () => {
  for (const appUrl of ['http://app.harmonylembrancinhas.com.br/','https://evil.test/','https://app.harmonylembrancinhas.com.br.evil.test/','https://user:password@app.harmonylembrancinhas.com.br/','https://app.harmonylembrancinhas.com.br/?view=operational-central','https://app.harmonylembrancinhas.com.br/entity/1','javascript:alert(1)']) assert.throws(()=>buildDailyBriefing(evaluation(),{appUrl}),/raiz oficial/);
});

test('text fits the channel with long valid identifiers and large counts without truncating facts', () => {
  const data=evaluation();for(const item of data.conditions)if(item.protocol)item.protocol='9223372036854775807';for(const key of Object.keys(data.summary.counts))data.summary.counts[key]=10000;
  const text=buildDailyBriefing(data).plain_text;assert.ok(text.length<=850);assert.equal((text.match(/#9223372036854775807/g)||[]).length,3);assert.match(text,/10000 vencidos/);
});
