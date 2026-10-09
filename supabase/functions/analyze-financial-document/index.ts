import { createClient } from 'npm:@supabase/supabase-js@2.110.7';
import { buildFinancialDocumentRequest, requestFinancialExtraction, assessPaymentSuggestion, FinancialAIError } from '../_shared/financial-document-ai.mjs';

declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void };
const bucket = 'financial-contract-documents';
const maxBytes = 8388608;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const origins = new Set(['https://app.harmonylembrancinhas.com.br', 'https://jonatashonorioferraz.github.io']);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
type FinancialDetail = {
  can_write: boolean;
  contract: { entity_id: string; creditor_name: string };
  installments: Array<{ id: string; position: number; due_date: string; remaining: number }>;
  payments: Array<{ amount: number; effective_date: string; transaction_reference: string | null; reversal: unknown }>;
};

async function body(req: Request) {
  if (!req.headers.get('content-type')?.startsWith('application/json')) throw new Error('invalid_input');
  const reader = req.body?.getReader();
  if (!reader) throw new Error('invalid_input');
  const parts: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 12 * 1024 * 1024) { await reader.cancel(); throw new Error('file_too_large'); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size); let at = 0;
  for (const part of parts) { bytes.set(part, at); at += part.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('invalid_input'); }
}

function safeCode(error: unknown): string {
  const raw = error instanceof FinancialAIError ? error.code : error instanceof Error ? error.message : '';
  const known = ['invalid_input', 'file_too_large', 'unauthorized', 'forbidden', 'not_configured', 'original_unavailable', 'access_revoked'];
  if (known.includes(raw)) return raw;
  if (/orcamento|limite mensal|budget/i.test(raw)) return 'budget_exhausted';
  if (/desativad|disabled/i.test(raw)) return 'disabled';
  if (/hora|rate.limit/i.test(raw)) return 'rate_limited';
  return 'request_failed';
}

Deno.serve(async req => {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
  if (origin && origins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });
  if (origin && !origins.has(origin)) return reply(403, { error: 'forbidden' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' } });
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  let intakeId: string | null = null;
  try {
    const url = Deno.env.get('SUPABASE_URL'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !serviceKey || !anonKey) throw new Error('not_configured');
    const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) throw new Error('unauthorized');
    const service = createClient(url, serviceKey, options);
    const { data: auth, error: authError } = await service.auth.getUser(token);
    if (authError || !auth.user) throw new Error('unauthorized');
    const actor = auth.user.id;
    const client = createClient(url, anonKey, { ...options, global: { headers: { Authorization: 'Bearer ' + token } } });
    const input = await body(req);
    if (!input || typeof input !== 'object' || Array.isArray(input) || !uuid.test(input.entity_id || '')) throw new Error('invalid_input');
    const { data: access, error: accessError } = await client.rpc('financial_access');
    if (accessError || !access?.some((row: { id: string; can_write: boolean }) => row.id === input.entity_id && row.can_write)) throw new Error('forbidden');
    let intake: Record<string, unknown>;
    if (input.intake_id) {
      if (!uuid.test(input.intake_id)) throw new Error('invalid_input');
      const { data, error } = await client.from('financial_ai_intakes').select('*').eq('id', input.intake_id).eq('entity_id', input.entity_id).single();
      if (error || !data) throw new Error('forbidden');
      intake = data;
    } else {
      if (!uuid.test(input.id || '') || !['contract', 'payment'].includes(input.mode) || typeof input.name !== 'string' || typeof input.base64 !== 'string') throw new Error('invalid_input');
      if ((input.mode === 'payment' && !uuid.test(input.contract_id || '')) || (input.mode === 'contract' && input.contract_id)) throw new Error('invalid_input');
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64) || input.base64.length > 11184812) throw new Error('invalid_input');
      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(input.base64), c => c.charCodeAt(0)); } catch { throw new Error('invalid_input'); }
      if (!bytes.length || bytes.length > maxBytes) throw new Error('file_too_large');
      // This also validates MIME and actual signature before storing any bytes.
      buildFinancialDocumentRequest({ bytes, mime: input.mime, mode: input.mode });
      if (input.mode === 'payment') {
        const { data, error } = await client.rpc('financial_contract_detail', { p_contract_id: input.contract_id });
        if (error || !data?.can_write || data.contract.entity_id !== input.entity_id) throw new Error('forbidden');
      }
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
      const extension = input.mime === 'application/pdf' ? 'pdf' : input.mime === 'image/png' ? 'png' : 'jpg';
      const path = input.entity_id + '/ai-originals/' + hash + '.' + extension;
      const name = input.name.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180) || 'documento.' + extension;
      const { error: uploadError } = await service.storage.from(bucket).upload(path, bytes, { contentType: input.mime, upsert: false });
      if (uploadError && !['409', 'Duplicate'].includes(String((uploadError as { statusCode?: string; error?: string }).statusCode || (uploadError as { error?: string }).error))) {
        // A successful retry must find the immutable original, never overwrite it.
        const { data: existing, error } = await service.storage.from(bucket).download(path);
        if (error || !existing || existing.size !== bytes.length) throw new Error('original_unavailable');
        const existingHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await existing.arrayBuffer()))).map(b => b.toString(16).padStart(2, '0')).join('');
        if (existingHash !== hash) throw new Error('original_unavailable');
      }
      const { data, error } = await service.rpc('finalize_financial_ai_intake', {
        p_actor: actor, p_id: input.id, p_entity: input.entity_id, p_contract: input.contract_id || null,
        p_mode: input.mode, p_name: name, p_mime: input.mime, p_size: bytes.length, p_sha256: hash, p_path: path,
      });
      if (error || !data) throw new Error('original_unavailable');
      intake = data;
    }
    intakeId = String(intake.id);
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('not_configured');
    if (!uuid.test(input.run_id || '')) throw new Error('invalid_input');
    const { data: job, error: beginError } = await service.rpc('begin_financial_ai_run', { p_actor: actor, p_intake: intakeId, p_run: input.run_id, p_retry: input.retry === true });
    if (beginError || !job) throw new Error(beginError?.message || 'request_failed');
    if (job.start) {
      const runId = job.run.id;
      EdgeRuntime.waitUntil((async () => {
        let claimed = false;
        try {
          const { data: source, error } = await service.rpc('claim_financial_ai_run', { p_actor: actor, p_run: runId });
          if (error || !source) return;
          claimed = true;
          const { data: currentAccess, error: permissionError } = await client.rpc('financial_access');
          if (permissionError || !currentAccess?.some((r: { id: string; can_write: boolean }) => r.id === source.entity_id && r.can_write)) throw new Error('access_revoked');
          const { data: file, error: downloadError } = await service.storage.from(bucket).download(source.storage_path);
          if (downloadError || !file || file.size !== source.byte_size || file.size > maxBytes) throw new Error('original_unavailable');
          const bytes = new Uint8Array(await file.arrayBuffer());
          let detail: FinancialDetail | null = null;
          if (source.mode === 'payment') {
            const response = await client.rpc('financial_contract_detail', { p_contract_id: source.contract_id });
            if (response.error || !response.data?.can_write) throw new Error('access_revoked');
            detail = response.data;
          }
          const request = buildFinancialDocumentRequest({ bytes, mime: source.mime_type, mode: source.mode });
          const output = await requestFinancialExtraction({ apiKey, request });
          const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
          const assessment = source.mode === 'payment' ? assessPaymentSuggestion(output.extraction, {
            today, creditorName: detail?.contract.creditor_name || '',
            installments: (detail?.installments || []).map(r => ({ ...r, number: r.position })),
            payments: (detail?.payments || []).map(r => ({ ...r, reversed: !!r.reversal })),
          }) : null;
          const { error: finishError } = await service.rpc('finish_financial_ai_run', { p_actor: actor, p_run: runId,
            p_result: { ...output, assessment }, p_input_tokens: output.usage.input_tokens, p_output_tokens: output.usage.output_tokens, p_error: null });
          if (finishError) console.error('financial_ai_completion_not_persisted');
        } catch (error) {
          if (!claimed) return;
          const code = error instanceof FinancialAIError ? error.code : safeCode(error);
          await service.rpc('finish_financial_ai_run', { p_actor: actor, p_run: runId, p_result: null, p_input_tokens: null, p_output_tokens: null, p_error: code });
        }
      })());
    }
    return reply(job.start ? 202 : 200, { intake_id: intakeId, run_id: job.run.id, status: job.run.status });
  } catch (error) {
    const code = safeCode(error);
    return reply(code === 'unauthorized' ? 401 : code === 'forbidden' ? 403 : code === 'invalid_input' || code === 'file_too_large' ? 400 : 503, { error: code, intake_id: intakeId });
  }
});
