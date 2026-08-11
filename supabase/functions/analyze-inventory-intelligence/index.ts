import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const allowedOrigins = new Set([
  "https://app.harmonylembrancinhas.com.br",
  "https://jonatashonorioferraz.github.io",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);
const priorities = new Set(["low", "medium", "high", "critical"]);
const categories = new Set([
  "stockout_risk", "slow_stock", "overstock", "data_quality", "production_balance",
  "worker_concentration", "movement_anomaly", "opportunity",
]);
const actionTypes = new Set([
  "none", "view_inventory", "view_boxes", "view_movements", "view_worker", "view_production_orders",
]);
const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["health_status", "overall_summary", "insights"],
  properties: {
    health_status: { type: "string", enum: ["good", "attention", "critical"] },
    overall_summary: { type: "string", maxLength: 1600 },
    insights: {
      type: "array", minItems: 1, maxItems: 8,
      items: {
        type: "object", additionalProperties: false,
        required: ["priority", "category", "title", "explanation", "recommendation", "action_type", "model_id", "color_id", "worker_id", "evidence"],
        properties: {
          priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
          category: { type: "string", enum: [...categories] },
          title: { type: "string", maxLength: 180 },
          explanation: { type: "string", maxLength: 1800 },
          recommendation: { type: "string", maxLength: 1200 },
          action_type: { type: "string", enum: [...actionTypes] },
          model_id: { type: ["string", "null"] },
          color_id: { type: ["string", "null"] },
          worker_id: { type: ["string", "null"] },
          evidence: { type: "array", maxItems: 6, items: { type: "string", maxLength: 260 } },
        },
      },
    },
  },
};

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
const trustedSecretKeys = () => {
  const keys = new Set<string>();
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) keys.add(legacy);
  try {
    const configured = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}") as Record<string, unknown>;
    for (const value of Object.values(configured)) {
      if (typeof value === "string") keys.add(value);
      else if (value && typeof value === "object") {
        for (const nested of Object.values(value as Record<string, unknown>)) if (typeof nested === "string") keys.add(nested);
      }
    }
  } catch { /* chave legada continua disponível */ }
  return keys;
};
const sha256 = async (value: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(item => item.toString(16).padStart(2, "0")).join("");
};
const monthStart = () => {
  const value = new Date(); value.setUTCDate(1); value.setUTCHours(0, 0, 0, 0); return value.toISOString();
};
const dayStart = () => {
  const value = new Date(); value.setUTCHours(0, 0, 0, 0); return value.toISOString();
};
const safeText = (value: unknown, maximum: number) => String(value || "").trim().slice(0, maximum);

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsFor(request) });
  if (request.method !== "POST") return reply(request, { error: "Método não permitido." }, 405);
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) return reply(request, { error: "Origem não autorizada." }, 403);

  const errorId = crypto.randomUUID();
  let admin: ReturnType<typeof createClient> | null = null;
  let analysisId = "";
  let callerId: string | null = null;
  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!openaiKey || !serviceKey) return reply(request, { error: "Inteligência ainda não configurada." }, 503);
    admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const bearer = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const apiKey = request.headers.get("apikey") || "";
    const internalCall = !bearer && trustedSecretKeys().has(apiKey);
    if (bearer) {
      const { data: authData, error: authError } = await admin.auth.getUser(bearer);
      if (authError || !authData.user) return reply(request, { error: "Sessão inválida." }, 401);
      callerId = authData.user.id;
      const { data: caller } = await admin.from("profiles").select("role,status").eq("id", callerId).single();
      if (!caller || caller.status !== "active" || caller.role !== "admin") {
        return reply(request, { error: "Somente administradores podem solicitar análises." }, 403);
      }
    } else if (!internalCall) return reply(request, { error: "Autenticação obrigatória." }, 401);

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const trigger = internalCall ? "scheduled" : body.trigger === "critical" ? "critical" : "manual";
    const { data: settings, error: settingsError } = await admin.from("inventory_ai_settings").select("*").eq("id", 1).single();
    if (settingsError || !settings) return reply(request, { error: "Configuração da Inteligência indisponível." }, 503);
    if (!settings.enabled) return reply(request, { error: "A Inteligência está pausada pelo ADM principal." }, 503);

    const processingSince = new Date(Date.now() - 15 * 60000).toISOString();
    const { count: processingCount } = await admin.from("inventory_ai_analyses")
      .select("id", { count: "exact", head: true }).eq("status", "processing").gte("started_at", processingSince);
    if ((processingCount || 0) > 0) {
      if (internalCall) return reply(request, { ok: true, skipped: true, reason: "analysis_in_progress" });
      return reply(request, { error: "Já existe uma análise em andamento. Aguarde alguns instantes.", code: "ANALYSIS_IN_PROGRESS" }, 409);
    }

    const { data: monthRows, error: monthError } = await admin.from("inventory_ai_analyses")
      .select("estimated_cost_usd").eq("status", "completed").gte("created_at", monthStart());
    if (monthError) throw monthError;
    const monthCost = (monthRows || []).reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0);
    if (monthCost >= Number(settings.monthly_budget_usd || 0)) {
      return reply(request, { error: "O orçamento mensal da Inteligência foi atingido. As métricas normais continuam funcionando.", code: "BUDGET_REACHED" }, 429);
    }

    if (trigger === "scheduled") {
      const { count } = await admin.from("inventory_ai_analyses").select("id", { count: "exact", head: true })
        .eq("trigger_source", "scheduled").eq("status", "completed").gte("created_at", dayStart());
      if ((count || 0) >= Number(settings.scheduled_daily_limit || 2)) {
        return reply(request, { ok: true, skipped: true, reason: "daily_limit" });
      }
    } else {
      const cooldown = Math.max(1, Number(settings.manual_cooldown_minutes || 10));
      const since = new Date(Date.now() - cooldown * 60000).toISOString();
      const { data: recent } = await admin.from("inventory_ai_analyses").select("id,completed_at")
        .eq("status", "completed").gte("completed_at", since).order("completed_at", { ascending: false }).limit(1);
      if (recent?.length) return reply(request, { error: `A análise já foi atualizada recentemente. Aguarde ${cooldown} minutos.`, code: "COOLDOWN" }, 429);
    }

    const periodDays = Math.max(30, Math.min(Number(settings.analysis_window_days || 90), 365));
    const { data: snapshot, error: snapshotError } = await admin.rpc("service_inventory_ai_snapshot", { p_days: periodDays });
    if (snapshotError || !snapshot) throw snapshotError || new Error("SNAPSHOT_EMPTY");
    const fingerprint = await sha256(JSON.stringify(snapshot));
    const reuseSince = new Date(Date.now() - 6 * 3600000).toISOString();
    const { data: cached } = await admin.from("inventory_ai_analyses").select("*")
      .eq("status", "completed").eq("snapshot_fingerprint", fingerprint)
      .gte("completed_at", reuseSince).order("completed_at", { ascending: false }).limit(1);
    if (cached?.[0]) {
      const { data: insights } = await admin.from("inventory_ai_insights").select("*")
        .eq("analysis_id", cached[0].id).order("position");
      return reply(request, { analysis: cached[0], insights: insights || [], cached: true });
    }

    const model = Deno.env.get("OPENAI_INTELLIGENCE_MODEL") || String(settings.model || "gpt-5.6-terra");
    const summary = (snapshot as Record<string, unknown>).overall || {};
    const { data: analysis, error: insertError } = await admin.from("inventory_ai_analyses").insert({
      trigger_source: trigger, status: "processing", model, period_days: periodDays,
      snapshot_fingerprint: fingerprint, snapshot_summary: summary, created_by: callerId,
    }).select("id").single();
    if (insertError || !analysis) throw insertError || new Error("ANALYSIS_INSERT_FAILED");
    analysisId = analysis.id;

    const sanitized = structuredClone(snapshot) as Record<string, unknown>;
    if (Array.isArray(sanitized.workers)) sanitized.workers = sanitized.workers.map((worker, index) => {
      const row = worker as Record<string, unknown>;
      return { ...row, worker_name: `Colaboradora ${index + 1}` };
    });
    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, store: false, max_output_tokens: 4200, reasoning: { effort: "medium" },
        input: [{ role: "user", content: [{ type: "input_text", text:
          "Você é a analista operacional da Harmony Store Oficial. Analise exclusivamente o JSON consolidado do Inventário de Produção abaixo. " +
          "Nunca invente números, datas, causas ou previsões. Toda afirmação quantitativa deve aparecer nas evidências. " +
          "Priorize: risco de falta por modelo e cor, caixas antigas/paradas, excesso de estoque, divergências e ajustes, " +
          "caixas sem localização, equilíbrio entre entradas/saídas, ordens de produção e concentração por colaboradora. " +
          "Uma cobertura estimada é somente projeção e deve ser descrita como estimativa. Não trate valores de pagamento. " +
          "Recomende ações para conferência humana; jamais afirme que alterou estoque, ordens ou pagamentos. " +
          "Retorne de 3 a 8 insights em português do Brasil, objetivos, diferentes entre si e ordenados por prioridade.\n\nDADOS CONSOLIDADOS:\n" + JSON.stringify(sanitized)
        }] }],
        text: { format: { type: "json_schema", name: "harmony_inventory_intelligence", strict: true, schema: outputSchema } },
      }),
    });
    const payload = await aiResponse.json() as Record<string, unknown>;
    if (!aiResponse.ok) {
      const apiError = payload.error as Record<string, unknown> | undefined;
      throw new Error(`OPENAI_${String(apiError?.code || aiResponse.status)}`);
    }
    const text = outputText(payload);
    if (!text) throw new Error("OPENAI_EMPTY_OUTPUT");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const snapshotItems = Array.isArray((snapshot as Record<string, unknown>).items)
      ? (snapshot as Record<string, unknown>).items as Array<Record<string, unknown>>
      : [];
    const modelIds = new Set(snapshotItems.map(item => String(item.model_id || "")));
    const colorIds = new Set(snapshotItems.map(item => String(item.color_id || "")));
    const workerIds = new Set((Array.isArray((snapshot as Record<string, unknown>).workers) ? (snapshot as Record<string, unknown>).workers as Array<Record<string, unknown>> : []).map(item => String(item.worker_id || "")));
    const insights = (Array.isArray(parsed.insights) ? parsed.insights : []).slice(0, 8).map(raw => {
      const item = raw as Record<string, unknown>;
      const modelId = modelIds.has(String(item.model_id || "")) ? String(item.model_id) : null;
      const colorId = colorIds.has(String(item.color_id || "")) ? String(item.color_id) : null;
      const workerId = workerIds.has(String(item.worker_id || "")) ? String(item.worker_id) : null;
      return {
        priority: priorities.has(String(item.priority)) ? String(item.priority) : "medium",
        category: categories.has(String(item.category)) ? String(item.category) : "opportunity",
        title: safeText(item.title, 180), explanation: safeText(item.explanation, 1800),
        recommendation: safeText(item.recommendation, 1200),
        action_type: actionTypes.has(String(item.action_type)) ? String(item.action_type) : "none",
        model_id: modelId, color_id: colorId, worker_id: workerId,
        evidence: (Array.isArray(item.evidence) ? item.evidence : []).slice(0, 6).map(value => safeText(value, 260)).filter(Boolean),
      };
    }).filter(item => item.title && item.explanation && item.recommendation);
    if (!insights.length) throw new Error("OPENAI_INVALID_INSIGHTS");
    const usage = (payload.usage || {}) as Record<string, number>;
    const inputTokens = Number(usage.input_tokens || 0), outputTokens = Number(usage.output_tokens || 0);
    const inputRate = Number(Deno.env.get("OPENAI_INTELLIGENCE_INPUT_USD_PER_MILLION") || 2);
    const outputRate = Number(Deno.env.get("OPENAI_INTELLIGENCE_OUTPUT_USD_PER_MILLION") || 12);
    const estimatedCostUsd = inputTokens * inputRate / 1_000_000 + outputTokens * outputRate / 1_000_000;
    const health = ["good", "attention", "critical"].includes(String(parsed.health_status)) ? String(parsed.health_status) : "attention";
    const overall = safeText(parsed.overall_summary, 1600);
    const { error: finalizeError } = await admin.rpc("service_finalize_inventory_ai_analysis", {
      p_analysis_id: analysisId, p_health_status: health, p_overall_summary: overall,
      p_insights: insights, p_input_tokens: inputTokens, p_output_tokens: outputTokens,
      p_estimated_cost_usd: estimatedCostUsd,
    });
    if (finalizeError) throw finalizeError;
    const { data: savedAnalysis } = await admin.from("inventory_ai_analyses").select("*").eq("id", analysisId).single();
    const { data: savedInsights } = await admin.from("inventory_ai_insights").select("*").eq("analysis_id", analysisId).order("position");
    return reply(request, { analysis: savedAnalysis, insights: savedInsights || [], cached: false });
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 120) : "UNKNOWN";
    if (admin && analysisId) {
      try {
        await admin.from("inventory_ai_analyses").update({ status: "failed", completed_at: new Date().toISOString(), error_code: code }).eq("id", analysisId).eq("status", "processing");
      } catch { /* erro principal é registrado abaixo */ }
    }
    console.error(JSON.stringify({ event: "inventory_ai_analysis_error", error_id: errorId, analysis_id: analysisId || null, code }));
    return reply(request, { error: "Não foi possível concluir a análise do Inventário. As métricas normais continuam disponíveis.", error_id: errorId }, 500);
  }
});
