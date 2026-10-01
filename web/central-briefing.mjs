// Pure presentation of an existing B0 evaluation. No clock, storage or delivery.
export const BRIEFING_VERSION = 'daily-briefing.preview.v1';
export const BRIEFING_MAX_LENGTH = 850;
export const BRIEFING_APP_URL = 'https://app.harmonylembrancinhas.com.br/';
const TIMEZONE = 'America/Sao_Paulo';
const SOURCES = { bills: 'Boletos', requests: 'Solicitações' };
const COUNTS = { bills: ['overdue_bills', 'due_today_bills', 'due_tomorrow_bills'], requests: ['open_requests', 'past_scheduled_requests'] };
const fail = () => { throw new Error('A avaliação não permite preparar uma prévia confiável. Atualize a consulta.'); };
const integer = value => Number.isSafeInteger(value) && value >= 0;
function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !validDay(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) fail();
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = type => parts.find(item => item.type === type).value;
  return { day: [part('year'), part('month'), part('day')].join('-'), date: part('day') + '/' + part('month') + '/' + part('year'), time: part('hour') + ':' + part('minute') };
}
function shortDay(value) {
  if (!validDay(value)) fail();
  return value.slice(8, 10) + '/' + value.slice(5, 7);
}
function protocol(item) {
  const value = String(item.protocol ?? '');
  if (!/^[1-9]\d{0,19}$/.test(value)) fail();
  return '#' + value.padStart(4, '0');
}
function priorityText(item, complete) {
  const facts = item.facts || {};
  if (item.rule === 'DAT-01') {
    if (!Object.hasOwn(SOURCES, item.entity_id) || complete[item.entity_id]) fail();
    return SOURCES[item.entity_id] + ': fonte não avaliada';
  }
  if (['FIN-01', 'FIN-02'].includes(item.rule)) {
    if (item.entity_type !== 'bill' || !complete.bills) fail();
    const due = shortDay(facts.due_date), label = 'Boleto ' + protocol(item) + ': ';
    if (item.rule === 'FIN-01') return label + 'vencido e pendente no app (' + due + ')';
    if (!['today', 'tomorrow'].includes(facts.horizon)) fail();
    return label + 'vence ' + (facts.horizon === 'today' ? 'hoje' : 'amanhã') + ' (' + due + ')';
  }
  if (item.entity_type !== 'request' || !complete.requests) fail();
  const label = 'Solicitação ' + protocol(item) + ': ';
  if (item.rule === 'REQ-02') {
    const scheduled = instant(facts.scheduled_for);
    return label + 'agendamento de ' + scheduled.date.slice(0, 5) + ' ' + scheduled.time + ' ultrapassado';
  }
  if (item.rule !== 'REQ-01' || !integer(facts.age_hours) || !integer(facts.age_days) || facts.age_days !== Math.floor(facts.age_hours / 24)) fail();
  const age = facts.age_hours < 1 ? 'menos de 1 hora' : facts.age_hours < 24 ? facts.age_hours + (facts.age_hours === 1 ? ' hora' : ' horas') : facts.age_days + (facts.age_days === 1 ? ' dia corrido' : ' dias corridos');
  return label + 'aberta há ' + age;
}

/** The daily key identifies a business day, not a stored record or a delivery.
 * Future delivery deduplication must additionally identify channel/recipient.
 * appUrl accepts only the canonical app root, never credentials or deep links.
 */
export function buildDailyBriefing(evaluation, { appUrl = BRIEFING_APP_URL } = {}) {
  if (appUrl !== BRIEFING_APP_URL) throw new Error('O link deve apontar para a raiz oficial do aplicativo.');
  if (evaluation?.schema_version !== 'b0.1' || evaluation.rules_version !== 'b0.1' || evaluation.timezone !== TIMEZONE || typeof evaluation.evaluation_id !== 'string' || !evaluation.evaluation_id || !Array.isArray(evaluation.sources) || evaluation.sources.length !== 2 || !Array.isArray(evaluation.conditions) || !Array.isArray(evaluation.priorities) || evaluation.priorities.length > 3 || !evaluation.summary?.counts) fail();
  const at = instant(evaluation.evaluated_at);
  if (evaluation.business_date !== at.day) fail();
  const complete = {}, counts = evaluation.summary.counts;
  for (const [id, fields] of Object.entries(COUNTS)) {
    const sources = evaluation.sources.filter(source => source.id === id);
    if (sources.length !== 1 || !['evaluated', 'unavailable', 'invalid', 'incomplete'].includes(sources[0].status) || typeof sources[0].complete !== 'boolean' || (sources[0].status === 'evaluated') !== sources[0].complete) fail();
    complete[id] = sources[0].complete;
    for (const field of fields) if (complete[id] ? !integer(counts[field]) : counts[field] !== null) fail();
  }
  const coverage = Object.values(complete).filter(Boolean).length;
  if (evaluation.summary.evaluated_sources !== coverage) fail();
  const conditions = new Map();
  for (const item of evaluation.conditions) {
    if (!item || typeof item.key !== 'string' || !item.key || conditions.has(item.key)) fail();
    conditions.set(item.key, item);
  }
  const picked = new Set();
  const priorities = evaluation.priorities.map(priority => {
    const item = conditions.get(priority?.key);
    if (!item || typeof item.entity_id !== 'string' || !item.entity_id) fail();
    const key = item.entity_type + ':' + item.entity_id;
    if (picked.has(key)) fail();
    picked.add(key);
    return priorityText(item, complete);
  });
  const lines = [
    'Harmony · Resumo da manhã',
    'Prévia da consulta atual · ' + at.date + ' ' + at.time + ' (São Paulo).',
    complete.bills ? 'Boletos pendentes no app: ' + counts.overdue_bills + ' vencidos; ' + counts.due_today_bills + ' vencem hoje; ' + counts.due_tomorrow_bills + ' amanhã.' : 'Boletos: não avaliados nesta consulta.',
    complete.requests ? 'Solicitações: ' + counts.open_requests + ' abertas; ' + counts.past_scheduled_requests + ' com agendamento ultrapassado.' : 'Solicitações: não avaliadas nesta consulta.',
    ...priorities.map((text, index) => (index + 1) + '. ' + text + '.'),
    'Fontes completas: ' + coverage + '/2. Sem histórico; confira a situação nos módulos.',
    'Abrir app: ' + appUrl,
  ];
  const plainText = lines.join('\n');
  // Never truncate an identifier, coverage caveat or factual count to fit a channel.
  if (plainText.length > BRIEFING_MAX_LENGTH) fail();
  return Object.freeze({ schema_version: BRIEFING_VERSION, business_date: evaluation.business_date, evaluated_at: evaluation.evaluated_at, daily_key: 'daily-briefing:v1:' + evaluation.business_date + ':' + TIMEZONE, plain_text: plainText, source_evaluation_id: evaluation.evaluation_id });
}
