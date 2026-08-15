import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const allowedOrigins = new Set([
  "https://app.harmonylembrancinhas.com.br",
  "https://jonatashonorioferraz.github.io",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);
const priorities = new Set(["low", "medium", "high", "critical"]);
const categories = new Set(["sales", "conversion", "traffic", "product", "promotion", "cancellation", "data_quality", "opportunity"]);
const actions = new Set(["none", "view_overview", "view_products", "view_marketing", "view_promotions", "view_imports"]);
const outputSchema = {
  type: "object", additionalProperties: false, required: ["health_status", "overall_summary", "insights"],
  properties: {
    health_status: { type: "string", enum: ["good", "attention", "critical"] },
    overall_summary: { type: "string", maxLength: 1800 },
    insights: { type: "array", minItems: 1, maxItems: 8, items: {
      type: "object", additionalProperties: false,
      required: ["priority", "category", "title", "explanation", "recommendation", "action_type", "evidence"],
      properties: {
        priority: { type: "string", enum: [...priorities] }, category: { type: "string", enum: [...categories] },
        title: { type: "string", maxLength: 180 }, explanation: { type: "string", maxLength: 1800 },
        recommendation: { type: "string", maxLength: 1200 }, action_type: { type: "string", enum: [...actions] },
        evidence: { type: "array", maxItems: 6, items: { type: "string", maxLength: 260 } },
      },
    } },
  },
};
const corsFor = (request: Request) => {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://app.harmonylembrancinhas.com.br",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
  };
};
const reply = (request: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsFor(request), "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const safeText = (value: unknown, maximum: number) => String(value || "").trim().slice(0, maximum);
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(item => item.toString(16).padStart(2, "0")).join("");
};
const outputText = (payload: Record<string, unknown>) => {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of Array.isArray(payload.output) ? payload.output as Array<Record<string, unknown>> : []) {
    for (const part of Array.isArray(item.content) ? item.content as Array<Record<string, unknown>> : []) {
      if (part.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  return "";
};
const isoDate = (value: unknown, fallback: string) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : fallback;

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsFor(request) });
  if (request.method !== "POST") return reply(request, { error: "Método não permitido." }, 405);
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) return reply(request, { error: "Origem não autorizada." }, 403);
  const errorId = crypto.randomUUID();
  let analysisId = "";
  let admin: ReturnType<typeof createClient> | null = null;
  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!openaiKey || !serviceKey || !supabaseUrl) return reply(request, { error: "Inteligência Shopee ainda não configurada." }, 503);
    admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const bearer = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = await admin.auth.getUser(bearer);
    if (authError || !authData.user) return reply(request, { error: "Sessão inválida." }, 401);
    const { data: caller } = await admin.from("profiles").select("role,status").eq("id", authData.user.id).single();
    if (!caller || caller.role !== "admin" || caller.status !== "active") return reply(request, { error: "Somente administradores podem gerar análises." }, 403);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const today = new Date().toISOString().slice(0, 10), month = `${today.slice(0, 8)}01`;
    const from = isoDate(body.from, month), to = isoDate(body.to, today);
    if (to < from) return reply(request, { error: "Período inválido." }, 400);
    const { data: settings, error: settingsError } = await admin.from("shopee_ai_settings").select("*").eq("id", 1).single();
    if (settingsError || !settings) return reply(request, { error: "Configuração da Inteligência indisponível." }, 503);
    if (!settings.enabled) return reply(request, { error: "A Inteligência Shopee está pausada pelo ADM principal." }, 503);
    const processingSince = new Date(Date.now() - 15 * 60000).toISOString();
    const { count: running } = await admin.from("shopee_ai_analyses").select("id", { count: "exact", head: true }).eq("status", "processing").gte("started_at", processingSince);
    if ((running || 0) > 0) return reply(request, { error: "Já existe uma análise em andamento. Aguarde alguns instantes.", code: "ANALYSIS_IN_PROGRESS" }, 409);
    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const { data: monthRows } = await admin.from("shopee_ai_analyses").select("estimated_cost_usd").eq("status", "completed").gte("created_at", monthStart.toISOString());
    const monthCost = (monthRows || []).reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0);
    if (monthCost >= Number(settings.monthly_budget_usd || 0)) return reply(request, { error: "O orçamento mensal da IA foi atingido. Todos os gráficos continuam funcionando normalmente.", code: "BUDGET_REACHED" }, 429);
    const since = new Date(Date.now() - Math.max(1, Number(settings.manual_cooldown_minutes || 10)) * 60000).toISOString();
    const { data: recent } = await admin.from("shopee_ai_analyses").select("id").eq("status", "completed").gte("completed_at", since).order("completed_at", { ascending: false }).limit(1);
    if (recent?.length) return reply(request, { error: `A análise já foi atualizada recentemente. Aguarde ${settings.manual_cooldown_minutes} minutos.`, code: "COOLDOWN" }, 429);
    const { data: snapshot, error: snapshotError } = await admin.rpc("service_shopee_ai_snapshot", { p_from: from, p_to: to });
    if (snapshotError || !snapshot) throw snapshotError || new Error("SNAPSHOT_EMPTY");
    const imports = Array.isArray((snapshot as Record<string, unknown>).imports) ? (snapshot as Record<string, unknown>).imports as unknown[] : [];
    if (!imports.length) return reply(request, { error: "Importe ao menos um relatório da Shopee antes de gerar a análise." }, 422);
    const fingerprint = await sha256(JSON.stringify(snapshot));
    const reuseSince = new Date(Date.now() - 6 * 3600000).toISOString();
    const { data: cached } = await admin.from("shopee_ai_analyses").select("*").eq("status", "completed").eq("snapshot_fingerprint", fingerprint).gte("completed_at", reuseSince).order("completed_at", { ascending: false }).limit(1);
    if (cached?.[0]) {
      const { data: insights } = await admin.from("shopee_ai_insights").select("*").eq("analysis_id", cached[0].id).order("position");
      return reply(request, { analysis: cached[0], insights: insights || [], cached: true });
    }
    const model = Deno.env.get("OPENAI_INTELLIGENCE_MODEL") || String(settings.model || "gpt-5.6-terra");
    const { data: analysis, error: insertError } = await admin.from("shopee_ai_analyses").insert({
      status: "processing", model, period_start: from, period_end: to, snapshot_fingerprint: fingerprint,
      snapshot_summary: { period: (snapshot as Record<string, unknown>).period, import_count: imports.length }, created_by: authData.user.id,
    }).select("id").single();
    if (insertError || !analysis) throw insertError || new Error("ANALYSIS_INSERT_FAILED");
    analysisId = analysis.id;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, store: false, max_output_tokens: 4200, reasoning: { effort: "medium" },
        input: [{ role: "user", content: [{ type: "input_text", text:
          "Você é a analista de e-commerce da Harmony Store Oficial. Analise exclusivamente o JSON consolidado dos relatórios oficiais da Shopee. " +
          "Nunca invente números, datas, causas, margens, estoque ou previsões. Toda afirmação quantitativa deve aparecer em evidence. " +
          "Compare vendas feitas e pagas, cancelamentos, funil, tráfego, produtos e promoções. Diferencie correlação de causa. " +
          "Quando faltar um dos três relatórios, registre a limitação como qualidade dos dados. Não altere dados nem afirme que executou ações. " +
          "Gere de 3 a 8 insights em português do Brasil, objetivos, distintos e ordenados por impacto.\n\nDADOS CONSOLIDADOS:\n" + JSON.stringify(snapshot)
        }] }], text: { format: { type: "json_schema", name: "harmony_shopee_intelligence", strict: true, schema: outputSchema } } }),
    });
    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      const apiError = payload.error as Record<string, unknown> | undefined;
      throw new Error(`OPENAI_${String(apiError?.code || response.status)}`);
    }
    const text = outputText(payload); if (!text) throw new Error("OPENAI_EMPTY_OUTPUT");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const insights = (Array.isArray(parsed.insights) ? parsed.insights : []).slice(0, 8).map(raw => {
      const item = raw as Record<string, unknown>;
      return { priority: priorities.has(String(item.priority)) ? String(item.priority) : "medium",
        category: categories.has(String(item.category)) ? String(item.category) : "opportunity",
        title: safeText(item.title, 180), explanation: safeText(item.explanation, 1800), recommendation: safeText(item.recommendation, 1200),
        action_type: actions.has(String(item.action_type)) ? String(item.action_type) : "none",
        evidence: (Array.isArray(item.evidence) ? item.evidence : []).slice(0, 6).map(value => safeText(value, 260)).filter(Boolean) };
    }).filter(item => item.title && item.explanation && item.recommendation);
    if (!insights.length) throw new Error("OPENAI_INVALID_INSIGHTS");
    const usage = (payload.usage || {}) as Record<string, number>;
    const inputTokens = Number(usage.input_tokens || 0), outputTokens = Number(usage.output_tokens || 0);
    const inputRate = Number(Deno.env.get("OPENAI_INTELLIGENCE_INPUT_USD_PER_MILLION") || 2);
    const outputRate = Number(Deno.env.get("OPENAI_INTELLIGENCE_OUTPUT_USD_PER_MILLION") || 12);
    const cost = inputTokens * inputRate / 1_000_000 + outputTokens * outputRate / 1_000_000;
    const health = ["good", "attention", "critical"].includes(String(parsed.health_status)) ? String(parsed.health_status) : "attention";
    const { error: finalizeError } = await admin.rpc("service_finalize_shopee_ai_analysis", {
      p_analysis_id: analysisId, p_health_status: health, p_overall_summary: safeText(parsed.overall_summary, 1800),
      p_insights: insights, p_input_tokens: inputTokens, p_output_tokens: outputTokens, p_estimated_cost_usd: cost,
    });
    if (finalizeError) throw finalizeError;
    const { data: saved } = await admin.from("shopee_ai_analyses").select("*").eq("id", analysisId).single();
    const { data: savedInsights } = await admin.from("shopee_ai_insights").select("*").eq("analysis_id", analysisId).order("position");
    return reply(request, { analysis: saved, insights: savedInsights || [], cached: false });
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 120) : "UNKNOWN";
    if (admin && analysisId) {
      try {
        await admin.from("shopee_ai_analyses").update({ status: "failed", completed_at: new Date().toISOString(), error_code: code }).eq("id", analysisId).eq("status", "processing");
      } catch { /* o erro principal é registrado abaixo */ }
    }
    console.error(JSON.stringify({ event: "shopee_ai_analysis_error", error_id: errorId, analysis_id: analysisId || null, code }));
    return reply(request, { error: "Não foi possível concluir a análise agora. Os gráficos e métricas continuam disponíveis.", error_id: errorId }, 500);
  }
});
