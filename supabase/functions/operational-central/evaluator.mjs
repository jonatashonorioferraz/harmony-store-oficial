export const RULES_VERSION = 'b0.1';
export const TIMEZONE = 'America/Sao_Paulo';
export const SOURCE_LIMIT = 10000;
export const SOURCE_FIELDS = Object.freeze({
  bills: 'id,protocol,status,due_date,updated_at',
  requests: 'id,protocol,status,created_at,scheduled_for,updated_at',
});
const LABELS = { bills: 'Boletos', requests: 'Solicitações' };
const OPEN_REQUESTS = new Set(['pending', 'separating', 'scheduled']);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const protocol = value => (Number.isSafeInteger(value) && value > 0) || (typeof value === 'string' && /^[1-9][0-9]*$/.test(value));
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && validDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const integer = value => Number.isSafeInteger(value) && value >= 0;
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const tomorrowOf = day => new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
export function businessDate(value) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
}
function unavailable(id, code, status = 'unavailable', fetchedAt = null) {
  return { id, label: LABELS[id], status, complete: false, row_count: null, fetched_at: fetchedAt, error_code: code, rows: [] };
}
export async function readSource(client, id, { now = () => new Date(), limit = SOURCE_LIMIT, pageSize = 500, timeoutMs = 12000 } = {}) {
  if (!Object.hasOwn(SOURCE_FIELDS, id)) throw new Error('Fonte não permitida.');
  const started = Date.now(), rows = [], seen = new Set();
  let expected;
  const signal = () => AbortSignal.timeout(Math.max(1, timeoutMs - (Date.now() - started)));
  try {
    for (;;) {
      if (Date.now() - started >= timeoutMs) return unavailable(id, 'READ_TIMEOUT');
      const result = await client.from(id).select(SOURCE_FIELDS[id], { count: 'exact' })
        .order('id', { ascending: true }).range(rows.length, rows.length + pageSize - 1).abortSignal(signal());
      if (result.error) return unavailable(id, 'READ_FAILED');
      if (!integer(result.count)) return unavailable(id, 'COUNT_UNAVAILABLE', 'incomplete');
      if (result.count > limit) return unavailable(id, 'ROW_LIMIT', 'incomplete');
      if (expected !== undefined && result.count !== expected) return unavailable(id, 'COUNT_CHANGED', 'incomplete');
      expected = result.count;
      if (!Array.isArray(result.data) || (!result.data.length && rows.length < expected) || rows.length + result.data.length > expected) {
        return unavailable(id, 'PAGE_INCOMPLETE', 'incomplete');
      }
      for (const row of result.data) {
        if (!row || !uuid(row.id)) return unavailable(id, 'INVALID_KEY', 'invalid');
        if (seen.has(row.id)) return unavailable(id, 'DUPLICATE_KEY', 'invalid');
        seen.add(row.id); rows.push(row);
      }
      if (rows.length === expected) break;
    }
    // An additional count detects deletions/insertions around the final page.
    // Equal counts do not turn sequential reads into an atomic snapshot.
    const last = await client.from(id).select('id', { count: 'exact', head: true }).abortSignal(signal());
    if (last.error) return unavailable(id, 'READ_FAILED');
    if (last.count !== expected) return unavailable(id, 'COUNT_CHANGED', 'incomplete');
    return { id, label: LABELS[id], status: 'evaluated', complete: true, row_count: rows.length, fetched_at: now().toISOString(), error_code: null, rows };
  } catch {
    return unavailable(id, 'READ_FAILED');
  }
}
function validateSource(source, id, evaluatedAt) {
  if (!source || source.status !== 'evaluated' || source.complete !== true) {
    const statuses = ['unavailable', 'invalid', 'incomplete'];
    const allowedErrors = ['READ_FAILED', 'READ_TIMEOUT', 'COUNT_UNAVAILABLE', 'ROW_LIMIT', 'COUNT_CHANGED', 'PAGE_INCOMPLETE', 'INVALID_KEY', 'DUPLICATE_KEY'];
    return unavailable(id, allowedErrors.includes(source?.error_code) ? source.error_code : 'READ_FAILED',
      statuses.includes(source?.status) ? source.status : 'unavailable', timestamp(source?.fetched_at) ? source.fetched_at : null);
  }
  if (!Array.isArray(source.rows) || source.row_count !== source.rows.length || !integer(source.row_count) || source.row_count > SOURCE_LIMIT) {
    return unavailable(id, 'PAGE_INCOMPLETE', 'incomplete');
  }
  const seen = new Set();
  for (const row of source.rows) {
    if (!row || !uuid(row.id) || !protocol(row.protocol) || !timestamp(row.updated_at) || Date.parse(row.updated_at) > evaluatedAt) return unavailable(id, 'INVALID_FIELDS', 'invalid');
    if (seen.has(row.id)) return unavailable(id, 'DUPLICATE_KEY', 'invalid');
    seen.add(row.id);
    if (id === 'bills') {
      if (!['pending', 'paid', 'cancelled'].includes(row.status) || !validDate(row.due_date)) return unavailable(id, 'INVALID_FIELDS', 'invalid');
    } else if (!['pending', 'separating', 'scheduled', 'delivered', 'cancelled'].includes(row.status) ||
      !timestamp(row.created_at) || Date.parse(row.created_at) > evaluatedAt ||
      (row.scheduled_for !== null && !timestamp(row.scheduled_for)) ||
      (row.status === 'scheduled' && row.scheduled_for === null)) return unavailable(id, 'INVALID_FIELDS', 'invalid');
  }
  return { ...source, id, label: LABELS[id], error_code: null };
}
const describeDays = days => days === 1 ? '1 dia corrido' : days + ' dias corridos';
function ageText(hours) {
  if (hours < 1) return 'menos de 1 hora';
  if (hours < 24) return hours === 1 ? '1 hora' : hours + ' horas';
  return describeDays(Math.floor(hours / 24));
}
export function evaluateOperational({ sources, evaluatedAt, captureStartedAt = evaluatedAt, captureFinishedAt = evaluatedAt }) {
  const instant = Date.parse(evaluatedAt);
  if (!timestamp(evaluatedAt)) throw new Error('Instante de avaliação inválido.');
  const today = businessDate(evaluatedAt), tomorrow = tomorrowOf(today);
  const checked = ['bills', 'requests'].map(id => validateSource(sources.find(source => source.id === id), id, instant));
  const conditions = [], counts = { overdue_bills: null, due_today_bills: null, due_tomorrow_bills: null, open_requests: null, past_scheduled_requests: null };
  function add(row, rule, family, classification, title, message, facts, fields, rank, sortAt) {
    const type = family === 'financial' ? 'bill' : 'request';
    conditions.push({
      key: rule + ':' + row.id, rule, family, entity_type: type, entity_id: row.id, protocol: String(row.protocol),
      classification, title, message, facts, evidence_fields: fields,
      source_updated_at: row.updated_at, origin: { view: type === 'bill' ? 'bills' : 'requests', id: row.id },
      rank, sortAt,
    });
  }
  for (const source of checked) {
    if (!source.complete) {
      conditions.push({
        key: 'DAT-01:' + source.id, rule: 'DAT-01', family: 'data', entity_type: 'source', entity_id: source.id,
        protocol: null, classification: 'not_evaluated', title: source.label + ': fonte não avaliada',
        message: source.status === 'incomplete' ? 'A leitura não comprovou cobertura completa. Atualize para tentar novamente.' :
          source.status === 'invalid' ? 'Os dados necessários não passaram na verificação de qualidade. Confira a origem.' :
            'A fonte não respondeu à leitura. Nenhuma conclusão foi calculada para este domínio.',
        facts: { source: source.id, error_code: source.error_code, row_limit: SOURCE_LIMIT },
        evidence_fields: [], source_updated_at: null, origin: null, rank: 0, sortAt: source.id,
      });
      continue;
    }
    if (source.id === 'bills') {
      counts.overdue_bills = 0; counts.due_today_bills = 0; counts.due_tomorrow_bills = 0;
      for (const row of source.rows) {
        if (row.status !== 'pending') continue;
        const facts = { status: row.status, due_date: row.due_date, business_date: today };
        if (row.due_date < today) {
          counts.overdue_bills++;
          add(row, 'FIN-01', 'financial', 'attention', 'Vencido e ainda pendente no app',
            'O vencimento cadastrado já passou. Confira o registro e a confirmação bancária; a Central não comprova falta de pagamento.',
            facts, ['status', 'due_date'], 1, row.due_date);
        } else if (row.due_date === today || row.due_date === tomorrow) {
          const dueToday = row.due_date === today;
          counts[dueToday ? 'due_today_bills' : 'due_tomorrow_bills']++;
          add(row, 'FIN-02', 'financial', 'upcoming', dueToday ? 'Boleto pendente vence hoje' : 'Boleto pendente vence amanhã',
            'Vencimento considerado pelo calendário de São Paulo. Confira o boleto na origem.',
            { ...facts, horizon: dueToday ? 'today' : 'tomorrow' }, ['status', 'due_date'], dueToday ? 3 : 4, row.due_date);
        }
      }
    } else {
      counts.open_requests = 0; counts.past_scheduled_requests = 0;
      for (const row of source.rows) {
        if (!OPEN_REQUESTS.has(row.status)) continue;
        counts.open_requests++;
        const elapsedHours = Math.floor((instant - Date.parse(row.created_at)) / 3600000);
        add(row, 'REQ-01', 'requests', 'observation', 'Solicitação aberta há ' + ageText(elapsedHours),
          'Tempo corrido desde a criação. Esta observação não define prazo de atendimento, atraso ou falta de leitura.',
          { status: row.status, created_at: row.created_at, age_hours: elapsedHours, age_days: Math.floor(elapsedHours / 24) },
          ['status', 'created_at'], 5, Date.parse(row.created_at));
        if (row.status === 'scheduled' && Date.parse(row.scheduled_for) < instant) {
          counts.past_scheduled_requests++;
          add(row, 'REQ-02', 'requests', 'attention', 'Agendamento ultrapassado; conferir andamento',
            'O horário agendado passou e a solicitação permanece agendada no app. Isso não comprova a entrega física.',
            { status: row.status, scheduled_for: row.scheduled_for }, ['status', 'scheduled_for'], 2, Date.parse(row.scheduled_for));
        }
      }
    }
  }
  const ordered = conditions.sort((a, b) => a.rank - b.rank || (typeof a.sortAt === 'number' ? a.sortAt - b.sortAt : a.sortAt.localeCompare(b.sortAt)) || a.key.localeCompare(b.key))
    .map(item => { const condition = { ...item }; delete condition.rank; delete condition.sortAt; return condition; });
  const picked = new Set(), priorities = [];
  for (const condition of ordered) {
    const key = condition.entity_type + ':' + condition.entity_id;
    if (!picked.has(key) && priorities.length < 3) { priorities.push(condition); picked.add(key); }
  }
  const evaluatedSources = checked.filter(source => source.complete).length;
  const financialText = counts.overdue_bills === null ? 'Boletos não avaliados.' :
    'Boletos pendentes: ' + counts.overdue_bills + ' com vencimento passado, ' + counts.due_today_bills + ' para hoje e ' + counts.due_tomorrow_bills + ' para amanhã.';
  const requestsText = counts.open_requests === null ? 'Solicitações não avaliadas.' :
    'Solicitações abertas: ' + counts.open_requests + '; com agendamento ultrapassado: ' + counts.past_scheduled_requests + '.';
  return {
    schema_version: RULES_VERSION, rules_version: RULES_VERSION, evaluation_id: RULES_VERSION + '@' + evaluatedAt,
    evaluated_at: evaluatedAt, business_date: today, timezone: TIMEZONE,
    capture_started_at: captureStartedAt, capture_finished_at: captureFinishedAt, atomic_snapshot: false,
    sources: checked.map(source => ({ id: source.id, label: source.label, status: source.status, complete: source.complete,
      row_count: source.row_count, fetched_at: source.fetched_at, error_code: source.error_code })),
    conditions: ordered, priorities,
    summary: { text: financialText + ' ' + requestsText, counts, evaluated_sources: evaluatedSources },
  };
}
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const fail = (status, code, message) => reply({ error: { code, message } }, status);
async function activeAdmin(client, userId) {
  const result = await client.from('profiles').select('role,status').eq('id', userId).single().abortSignal(AbortSignal.timeout(5000));
  if (result.error) return null;
  return result.data?.role === 'admin' && result.data.status === 'active';
}
export function operationalHandler({ clientForToken, now = () => new Date() }) {
  return async request => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.');
    const match = (request.headers.get('Authorization') || '').match(/^Bearer ([^\s]+)$/i);
    if (!match) return fail(401, 'SESSION_REQUIRED', 'Entre na sua conta para consultar a Central.');
    let client;
    try { client = clientForToken(match[1]); } catch { return fail(503, 'CONFIGURATION_UNAVAILABLE', 'A Central ainda não está disponível.'); }
    try {
      const result = await client.auth.getUser(match[1]);
      if (result.error || !result.data?.user?.id) return fail(401, 'SESSION_INVALID', 'A sessão não pôde ser validada. Entre novamente.');
      const userId = result.data.user.id;
      const permitted = await activeAdmin(client, userId);
      if (permitted === null) return fail(503, 'ACCESS_CHECK_UNAVAILABLE', 'Não foi possível confirmar sua permissão.');
      if (!permitted) return fail(403, 'ACCESS_DENIED', 'A Central é restrita a administradores ativos.');
      const captureStartedAt = now().toISOString();
      const sources = [];
      for (const id of ['bills', 'requests']) sources.push(await readSource(client, id, { now }));
      // Role changes during collection must not produce a misleading empty result.
      const stillPermitted = await activeAdmin(client, userId);
      if (stillPermitted === null) return fail(503, 'ACCESS_CHECK_UNAVAILABLE', 'Não foi possível reconfirmar sua permissão.');
      if (!stillPermitted) return fail(403, 'ACCESS_DENIED', 'Sua permissão mudou. Atualize a sessão.');
      const evaluatedAt = now().toISOString();
      return reply(evaluateOperational({ sources, evaluatedAt, captureStartedAt, captureFinishedAt: evaluatedAt }));
    } catch { return fail(503, 'CENTRAL_UNAVAILABLE', 'A Central não respondeu. Tente atualizar em instantes.'); }
  };
}
