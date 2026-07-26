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
  required: ["beneficiary_name","beneficiary_document","description","amount","due_date","digit_line","confidence","warnings"],
  properties: {
    beneficiary_name: { type: ["string","null"] },
    beneficiary_document: { type: ["string","null"] },
    description: { type: ["string","null"] },
    amount: { type: ["number","null"] },
    due_date: { type: ["string","null"], description: "Data ISO 8601 YYYY-MM-DD" },
    digit_line: { type: ["string","null"], description: "Somente dígitos da linha digitável ou código de barras" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    warnings: { type: "array", items: { type: "string" }, maxItems: 12 },
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

function mod10(value: string) {
  let sum = 0, weight = 2;
  for (let index = value.length - 1; index >= 0; index--) {
    let product = Number(value[index]) * weight;
    if (product > 9) product = Math.floor(product / 10) + product % 10;
    sum += product; weight = weight === 2 ? 1 : 2;
  }
  return (10 - sum % 10) % 10;
}
function mod11Collection(value: string) {
  let sum = 0, weight = 2;
  for (let index = value.length - 1; index >= 0; index--) {
    sum += Number(value[index]) * weight; weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  return remainder === 0 || remainder === 1 ? 0 : remainder === 10 ? 1 : 11 - remainder;
}
function validBankBarcode(digits: string) {
  let sum = 0, weight = 2;
  for (let index = 43; index >= 0; index--) {
    if (index === 4) continue;
    sum += Number(digits[index]) * weight; weight = weight === 9 ? 2 : weight + 1;
  }
  let check = 11 - sum % 11;
  if (check === 0 || check === 10 || check === 11) check = 1;
  return check === Number(digits[4]);
}
function validDigitLine(input: unknown) {
  const digits = String(input || "").replace(/\D/g, "");
  if (/^(\d)\1+$/.test(digits)) return false;
  if (digits.length === 47) {
    const fieldsValid = mod10(digits.slice(0,9)) === Number(digits[9])
      && mod10(digits.slice(10,20)) === Number(digits[20])
      && mod10(digits.slice(21,31)) === Number(digits[31]);
    const barcode = digits.slice(0,4) + digits[32] + digits.slice(33)
      + digits.slice(4,9) + digits.slice(10,20) + digits.slice(21,31);
    return fieldsValid && validBankBarcode(barcode);
  }
  if (digits.length === 48) {
    const calculator = ["6","7"].includes(digits[2]) ? mod10 : mod11Collection;
    return [0,12,24,36].every(start => calculator(digits.slice(start,start+11)) === Number(digits[start+11]));
  }
  if (digits.length === 44 && digits[0] === "8") {
    const calculator = ["6","7"].includes(digits[2]) ? mod10 : mod11Collection;
    return calculator(digits.slice(0,3) + digits.slice(4)) === Number(digits[3]);
  }
  if (digits.length === 44) return validBankBarcode(digits);
  return false;
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply({ error: "Método não permitido." }, 405);
  const errorId = crypto.randomUUID();
  let admin: ReturnType<typeof createClient> | null = null;
  let callerId = "", documentPath = "";
  const model = Deno.env.get("OPENAI_BILL_MODEL") || Deno.env.get("OPENAI_RECEIPT_MODEL") || "gpt-5.6-luna";
  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return reply({ error: "Leitura inteligente ainda não configurada." }, 503);
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return reply({ error: "Sessão ausente." }, 401);
    admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return reply({ error: "Sessão inválida." }, 401);
    callerId = authData.user.id;
    const { data: caller } = await admin.from("profiles").select("role,status").eq("id", callerId).single();
    if (!caller || caller.status !== "active" || caller.role !== "admin") return reply({ error: "Somente administradores podem analisar boletos." }, 403);

    const body = await request.json();
    documentPath = String(body.document_path || "").trim();
    if (!documentPath || documentPath.split("/")[0] !== callerId) return reply({ error: "Documento inválido." }, 400);
    const since = new Date(Date.now() - 3600000).toISOString();
    const { count } = await admin.from("bill_ai_runs").select("id", { count: "exact", head: true }).eq("created_by", callerId).gte("created_at", since);
    if ((count || 0) >= 20) return reply({ error: "Limite temporário atingido. Aguarde uma hora." }, 429);

    const { data: file, error: downloadError } = await admin.storage.from("bill-documents").download(documentPath);
    if (downloadError || !file) return reply({ error: "Não foi possível carregar o documento." }, 404);
    if (file.size > 10485760) return reply({ error: "O arquivo deve ter no máximo 10 MB." }, 413);
    const mime = file.type || "application/octet-stream";
    if (!["application/pdf","image/jpeg","image/png","image/webp"].includes(mime)) return reply({ error: "Formato de arquivo não permitido." }, 415);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    const dataUrl = `data:${mime};base64,${btoa(binary)}`;
    const fileInput = mime === "application/pdf"
      ? { type: "input_file", filename: "boleto.pdf", file_data: dataUrl, detail: "high" }
      : { type: "input_image", image_url: dataUrl, detail: "high" };

    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, max_output_tokens: 1800, store: false,
        input: [{ role: "user", content: [
          { type: "input_text", text: "Leia este boleto brasileiro. Extraia somente informações claramente visíveis. Nunca complete, corrija ou invente dígitos. Para a linha digitável ou código de barras, retorne somente os dígitos exatamente como aparecem. Use null quando houver dúvida. Não trate QR Code Pix como linha digitável. Retorne avisos para qualquer campo duvidoso." },
          fileInput,
        ] }],
        text: { format: { type: "json_schema", name: "harmony_bill", strict: true, schema } },
      }),
    });
    const payload = await aiResponse.json() as Record<string, unknown>;
    if (!aiResponse.ok) {
      const apiError = payload.error as Record<string, unknown> | undefined;
      throw new Error(`OPENAI_${String(apiError?.code || aiResponse.status)}`);
    }
    const text = outputText(payload);
    if (!text) throw new Error("OPENAI_EMPTY_OUTPUT");
    const extraction = JSON.parse(text);
    extraction.digit_line = String(extraction.digit_line || "").replace(/\D/g, "") || null;
    extraction.digit_line_valid = validDigitLine(extraction.digit_line);
    if (extraction.digit_line && !extraction.digit_line_valid) extraction.warnings.push("A linha digitável não passou na validação automática. Digite ou confira todos os números.");
    const usage = (payload.usage || {}) as Record<string, number>;
    const inputTokens = Number(usage.input_tokens || 0), outputTokens = Number(usage.output_tokens || 0);
    const inputRate = Number(Deno.env.get("OPENAI_INPUT_USD_PER_MILLION") || 1);
    const outputRate = Number(Deno.env.get("OPENAI_OUTPUT_USD_PER_MILLION") || 6);
    const estimatedCostUsd = inputTokens * inputRate / 1_000_000 + outputTokens * outputRate / 1_000_000;
    await admin.from("bill_ai_runs").insert({
      created_by: callerId, document_path: documentPath, model, status: "success",
      input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: estimatedCostUsd,
    });
    return reply({ extraction, model, usage: { input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: estimatedCostUsd } });
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0,80) : "UNKNOWN";
    if (admin && callerId && documentPath) {
      try { await admin.from("bill_ai_runs").insert({ created_by: callerId, document_path: documentPath, model, status: "failed", error_code: code }); } catch { /* erro principal abaixo */ }
    }
    console.error(JSON.stringify({ event: "bill_analysis_error", error_id: errorId, code }));
    return reply({ error: "Não foi possível ler o boleto. Confira o arquivo ou preencha os dados manualmente.", error_id: errorId }, 500);
  }
});
