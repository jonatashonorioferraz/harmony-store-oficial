import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["merchant_name","merchant_document","fiscal_access_key","receipt_number","purchased_at","total_value","payment_method","confidence","warnings","items"],
  properties: {
    merchant_name: { type: ["string","null"] },
    merchant_document: { type: ["string","null"] },
    fiscal_access_key: { type: ["string","null"] },
    receipt_number: { type: ["string","null"] },
    purchased_at: { type: ["string","null"], description: "Data e hora ISO 8601 quando legível" },
    total_value: { type: ["number","null"] },
    payment_method: { type: ["string","null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    warnings: { type: "array", items: { type: "string" }, maxItems: 12 },
    items: {
      type: "array", maxItems: 200,
      items: {
        type: "object", additionalProperties: false,
        required: ["description","quantity","unit","unit_price","total_price","confidence"],
        properties: {
          description: { type: "string" },
          quantity: { type: ["number","null"] },
          unit: { type: ["string","null"] },
          unit_price: { type: ["number","null"] },
          total_price: { type: ["number","null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
};

function outputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output as Array<Record<string, unknown>> : [];
  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content as Array<Record<string, unknown>> : [];
    for (const part of content) if (part.type === "output_text" && typeof part.text === "string") return part.text;
  }
  return "";
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply({ error: "Método não permitido." }, 405);
  const errorId = crypto.randomUUID();
  let admin: ReturnType<typeof createClient> | null = null;
  let callerId = "";
  let imagePath = "";
  const model = Deno.env.get("OPENAI_RECEIPT_MODEL") || "gpt-5.6-luna";
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return reply({ error: "Leitura inteligente ainda não configurada." }, 503);
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return reply({ error: "Sessão ausente." }, 401);
    admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return reply({ error: "Sessão inválida." }, 401);
    callerId = authData.user.id;
    const { data: caller } = await admin.from("profiles").select("id,role,status").eq("id", callerId).single();
    if (!caller || caller.status !== "active" || caller.role !== "admin") return reply({ error: "Somente administradores podem analisar cupons fiscais." }, 403);

    const body = await request.json();
    imagePath = String(body.image_path || "").trim();
    if (!imagePath || imagePath.split("/")[0] !== callerId) return reply({ error: "Imagem do cupom inválida." }, 400);
    const since = new Date(Date.now() - 3600000).toISOString();
    const { count } = await admin.from("internal_receipt_ai_runs").select("id", { count: "exact", head: true }).eq("created_by", callerId).gte("created_at", since);
    if ((count || 0) >= 20) return reply({ error: "Limite temporário atingido. Aguarde uma hora antes de analisar outro cupom." }, 429);

    const { data: file, error: downloadError } = await admin.storage.from("internal-receipts").download(imagePath);
    if (downloadError || !file) return reply({ error: "Não foi possível carregar a foto do cupom." }, 404);
    if (file.size > 5242880) return reply({ error: "A foto deve ter no máximo 5 MB." }, 413);
    const mime = file.type || "image/jpeg";
    if (!/^image\/(jpeg|png|webp)$/i.test(mime)) return reply({ error: "Formato de imagem não permitido." }, 415);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    const imageUrl = `data:${mime};base64,${btoa(binary)}`;

    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_output_tokens: 5000,
        input: [{ role: "user", content: [
          { type: "input_text", text: "Leia este cupom fiscal brasileiro. Extraia somente informações visíveis. Não invente valores. Preserve as descrições dos itens como impressas. Use null quando algo não estiver legível. Identifique descontos no total sem distribuí-los artificialmente. Retorne avisos sobre campos duvidosos e uma confiança entre 0 e 1." },
          { type: "input_image", image_url: imageUrl, detail: "high" },
        ] }],
        text: { format: { type: "json_schema", name: "harmony_receipt", strict: true, schema } },
      }),
    });
    const aiPayload = await aiResponse.json() as Record<string, unknown>;
    if (!aiResponse.ok) {
      const apiError = aiPayload.error as Record<string, unknown> | undefined;
      throw new Error(`OPENAI_${String(apiError?.code || aiResponse.status)}`);
    }
    const text = outputText(aiPayload);
    if (!text) throw new Error("OPENAI_EMPTY_OUTPUT");
    const extracted = JSON.parse(text);
    const usage = (aiPayload.usage || {}) as Record<string, number>;
    const inputTokens = Number(usage.input_tokens || 0), outputTokens = Number(usage.output_tokens || 0);
    const inputRate = Number(Deno.env.get("OPENAI_INPUT_USD_PER_MILLION") || 1);
    const outputRate = Number(Deno.env.get("OPENAI_OUTPUT_USD_PER_MILLION") || 6);
    const estimatedCostUsd = inputTokens * inputRate / 1_000_000 + outputTokens * outputRate / 1_000_000;
    await admin.from("internal_receipt_ai_runs").insert({
      created_by: callerId, image_path: imagePath, model, status: "success",
      input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: estimatedCostUsd,
    });
    return reply({ extraction: extracted, model, usage: { input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: estimatedCostUsd } });
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 80) : "UNKNOWN";
    if (admin && callerId && imagePath) {
      try { await admin.from("internal_receipt_ai_runs").insert({ created_by: callerId, image_path: imagePath, model, status: "failed", error_code: code }); } catch { /* O erro principal já será registrado abaixo. */ }
    }
    console.error(JSON.stringify({ event: "receipt_analysis_error", error_id: errorId, code }));
    return reply({ error: "Não foi possível ler este cupom. Confira a foto ou preencha os dados manualmente.", error_id: errorId }, 500);
  }
});
