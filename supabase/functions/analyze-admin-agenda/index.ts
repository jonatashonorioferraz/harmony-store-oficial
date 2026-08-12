import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const allowedOrigins = new Set([
  "https://app.harmonylembrancinhas.com.br",
  "https://jonatashonorioferraz.github.io",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);
const corsFor = (request: Request) => {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://app.harmonylembrancinhas.com.br",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};
const reply = (request: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsFor(request), "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const outputText = (payload: Record<string, unknown>) => {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of Array.isArray(payload.output) ? payload.output as Array<Record<string, unknown>> : []) {
    for (const part of Array.isArray(item.content) ? item.content as Array<Record<string, unknown>> : []) {
      if (part.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  return "";
};
const sha256 = async (value: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(item => item.toString(16).padStart(2, "0")).join("");
};
const monthStart = () => { const date = new Date(); date.setUTCDate(1); date.setUTCHours(0, 0, 0, 0); return date.toISOString(); };
const dayStart = () => { const date = new Date(); date.setUTCHours(0, 0, 0, 0); return date.toISOString(); };
const safeText = (value: unknown, maximum: number) => String(value || "").trim().slice(0, maximum);
const dateOnly = (value: unknown) => value ? String(value).slice(0, 10) : null;

const organizeSchema = {
  type: "object", additionalProperties: false,
  required: ["title", "description", "task_kind", "priority", "suggested_starts_at", "suggested_due_at", "checklist"],
  properties: {
    title: { type: "string", maxLength: 160 },
    description: { type: "string", maxLength: 1200 },
    task_kind: { type: "string", enum: ["task", "appointment", "follow_up"] },
    priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
    suggested_starts_at: { type: ["string", "null"] },
    suggested_due_at: { type: ["string", "null"] },
    checklist: { type: "array", maxItems: 8, items: { type: "string", maxLength: 180 } },
  },
};
const briefingSchema = {
  type: "object", additionalProperties: false,
  required: ["headline", "summary", "priorities", "risks"],
  properties: {
    headline: { type: "string", maxLength: 160 },
    summary: { type: "string", maxLength: 800 },
    priorities: { type: "array", maxItems: 5, items: { type: "string", maxLength: 220 } },
    risks: { type: "array", maxItems: 4, items: { type: "string", maxLength: 220 } },
  },
};

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsFor(request) });
  if (request.method !== "POST") return reply(request, { error: "Método não permitido." }, 405);
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) return reply(request, { error: "Origem não autorizada." }, 403);

  const errorId = crypto.randomUUID();
  let admin: ReturnType<typeof createClient> | null = null;
  let runId = "";
  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!openaiKey || !serviceKey) return reply(request, { error: "Assistente da Agenda ainda não configurada." }, 503);
    admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const bearer = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!bearer) return reply(request, { error: "Sessão ausente." }, 401);
    const { data: authData, error: authError } = await admin.auth.getUser(bearer);
    if (authError || !authData.user) return reply(request, { error: "Sessão inválida." }, 401);
    const callerId = authData.user.id;
    const { data: caller } = await admin.from("profiles").select("role,status").eq("id", callerId).single();
    if (!caller || caller.status !== "active" || caller.role !== "admin") return reply(request, { error: "Somente administradores podem usar a Agenda Harmony." }, 403);

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = body.action === "organize_task" ? "organize_task" : body.action === "daily_briefing" ? "daily_briefing" : "";
    if (!action) return reply(request, { error: "Ação inválida." }, 400);
    const { data: settings } = await admin.from("admin_agenda_ai_settings").select("*").eq("id", 1).single();
    if (!settings?.enabled) return reply(request, { error: "A IA da Agenda está pausada pelo ADM principal." }, 503);

    const { data: monthRuns, error: costError } = await admin.from("admin_agenda_ai_runs")
      .select("estimated_cost_usd").eq("status", "completed").gte("created_at", monthStart());
    if (costError) throw costError;
    const monthCost = (monthRuns || []).reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0);
    if (monthCost >= Number(settings.monthly_budget_usd || 0)) return reply(request, { error: "O orçamento mensal da Agenda com IA foi atingido. O calendário normal continua funcionando.", code: "BUDGET_REACHED" }, 429);

    const cooldown = Math.max(1, Number(settings.manual_cooldown_minutes || 10));
    const since = new Date(Date.now() - cooldown * 60000).toISOString();
    const { data: recent } = await admin.from("admin_agenda_ai_runs").select("id")
      .eq("action", action).eq("status", "completed").eq("created_by", callerId).gte("completed_at", since).limit(1);
    if (recent?.length && action === "daily_briefing") return reply(request, { error: `A análise já foi atualizada recentemente. Aguarde ${cooldown} minutos.`, code: "COOLDOWN" }, 429);
    const { count: todayCount } = await admin.from("admin_agenda_ai_runs").select("id", { count: "exact", head: true })
      .eq("status", "completed").eq("created_by", callerId).gte("created_at", dayStart());
    if ((todayCount || 0) >= Number(settings.daily_analysis_limit || 4)) return reply(request, { error: "O limite diário de análises da Agenda foi atingido. As tarefas continuam disponíveis.", code: "DAILY_LIMIT" }, 429);

    let input: Record<string, unknown>, instructions: string, schema: Record<string, unknown>;
    if (action === "organize_task") {
      const note = safeText(body.text, 2400);
      if (note.length < 8) return reply(request, { error: "Escreva um pouco mais sobre a tarefa." }, 400);
      input = { note, current_date: safeText(body.current_date, 10), timezone: "America/Sao_Paulo" };
      instructions = "Organize a anotação de uma administradora da Harmony Store em uma tarefa prática. Não invente nomes, valores ou compromissos não mencionados. Se a data não for clara, use null. Datas sugeridas devem ser ISO 8601 com fuso -03:00. Escreva em português do Brasil, com título direto, descrição clara e até oito passos. Sua resposta é somente uma sugestão que será revisada antes de salvar.";
      schema = organizeSchema;
    } else {
      const horizon = new Date(Date.now() + 14 * 86400000).toISOString();
      const [tasks, bills, requests, orders, supplies, boxCount] = await Promise.all([
        admin.from("admin_agenda_tasks").select("task_kind,status,priority,starts_at,due_at").in("status", ["pending", "in_progress"]).lte("starts_at", horizon).order("starts_at").limit(100),
        admin.from("bills").select("status,due_date,amount").eq("status", "pending").lte("due_date", dateOnly(horizon)).order("due_date").limit(100),
        admin.from("requests").select("status,scheduled_for,created_at").in("status", ["pending", "separating", "scheduled"]).order("created_at").limit(100),
        admin.from("production_orders").select("status,due_date").in("status", ["sent", "viewed", "acknowledged"]).order("due_date").limit(100),
        admin.from("internal_supply_requests").select("status,priority,needed_by").in("status", ["pending", "separating", "scheduled"]).order("needed_by").limit(100),
        admin.rpc("get_production_inventory_available_box_count"),
      ]);
      for (const result of [tasks, bills, requests, orders, supplies]) if (result.error) throw result.error;
      input = {
        generated_at: new Date().toISOString(), timezone: "America/Sao_Paulo",
        manual_tasks: (tasks.data || []).map(row => ({ kind: row.task_kind, status: row.status, priority: row.priority, starts_at: row.starts_at, due_at: row.due_at })),
        bills: (bills.data || []).map(row => ({ due_date: row.due_date, amount: row.amount })),
        requests: (requests.data || []).map(row => ({ status: row.status, scheduled_for: row.scheduled_for, created_at: row.created_at })),
        production_orders: (orders.data || []).map(row => ({ status: row.status, due_date: row.due_date })),
        internal_supplies: (supplies.data || []).map(row => ({ status: row.status, priority: row.priority, needed_by: row.needed_by })),
        inventory: { available_boxes: Number(boxCount.data || 0) },
      };
      instructions = "Você é a assistente administrativa da Harmony Store Oficial. Analise exclusivamente o JSON fornecido e resuma a rotina dos próximos dias. Não invente dados, não exponha nomes pessoais e não afirme que realizou ações. A Central de Pendências já mostra todas as solicitações abertas: não as enumere, não repita a lista e não trate volume normal como insight. Só mencione solicitações quando houver atraso, concentração ou risco operacional relevante. Priorize tarefas planejadas, compromissos, boletos, vencimentos, qualidade do inventário e exceções que realmente exijam decisão. Escreva prioridades curtas e acionáveis, próprias para cartões compactos. Não recomende alterar estoque ou pagamentos automaticamente. Escreva em português do Brasil, de forma executiva, acolhedora e objetiva.";
      schema = briefingSchema;
    }

    const fingerprint = await sha256(JSON.stringify(input));
    if (action === "daily_briefing") {
      const { data: cached } = await admin.from("admin_agenda_ai_runs").select("*")
        .eq("action", action).eq("status", "completed").eq("snapshot_fingerprint", fingerprint)
        .gte("completed_at", new Date(Date.now() - 6 * 3600000).toISOString()).order("completed_at", { ascending: false }).limit(1);
      if (cached?.[0]) return reply(request, { result: cached[0].result, cached: true });
    }

    const model = Deno.env.get("OPENAI_AGENDA_MODEL") || String(settings.model || "gpt-5.6-luna");
    const { data: run, error: runError } = await admin.from("admin_agenda_ai_runs").insert({
      action, status: "processing", model, snapshot_fingerprint: fingerprint, created_by: callerId,
    }).select("id").single();
    if (runError || !run) throw runError || new Error("RUN_INSERT_FAILED");
    runId = run.id;

    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, store: false, max_output_tokens: action === "daily_briefing" ? 1600 : 1200,
        reasoning: { effort: "low" },
        input: [{ role: "user", content: [{ type: "input_text", text: `${instructions}\n\nDADOS:\n${JSON.stringify(input)}` }] }],
        text: { format: { type: "json_schema", name: `harmony_admin_agenda_${action}`, strict: true, schema } },
      }),
    });
    const payload = await aiResponse.json() as Record<string, unknown>;
    if (!aiResponse.ok) {
      const apiError = payload.error as Record<string, unknown> | undefined;
      throw new Error(`OPENAI_${String(apiError?.code || aiResponse.status)}`);
    }
    const text = outputText(payload); if (!text) throw new Error("OPENAI_EMPTY_OUTPUT");
    const result = JSON.parse(text) as Record<string, unknown>;
    const usage = (payload.usage || {}) as Record<string, number>;
    const inputTokens = Number(usage.input_tokens || 0), outputTokens = Number(usage.output_tokens || 0);
    const inputRate = Number(Deno.env.get("OPENAI_AGENDA_INPUT_USD_PER_MILLION") || 0.20);
    const outputRate = Number(Deno.env.get("OPENAI_AGENDA_OUTPUT_USD_PER_MILLION") || 1.20);
    const estimatedCost = inputTokens * inputRate / 1_000_000 + outputTokens * outputRate / 1_000_000;
    const { error: updateError } = await admin.from("admin_agenda_ai_runs").update({
      status: "completed", result, input_tokens: inputTokens, output_tokens: outputTokens,
      estimated_cost_usd: estimatedCost, completed_at: new Date().toISOString(),
    }).eq("id", runId).eq("status", "processing");
    if (updateError) throw updateError;
    await admin.from("audit_logs").insert({ actor_id: callerId, action: `agenda.ai_${action}`, entity_type: "admin_agenda_ai_run", entity_id: runId, details: { model, input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: estimatedCost } });
    return reply(request, { result, cached: false });
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 120) : "UNKNOWN";
    if (admin && runId) await admin.from("admin_agenda_ai_runs").update({ status: "failed", completed_at: new Date().toISOString(), error_code: code }).eq("id", runId).eq("status", "processing").catch(() => undefined);
    console.error(JSON.stringify({ event: "admin_agenda_ai_error", error_id: errorId, run_id: runId || null, code }));
    return reply(request, { error: "Não foi possível concluir a análise da Agenda. O calendário e as tarefas continuam funcionando normalmente.", error_id: errorId }, 500);
  }
});
