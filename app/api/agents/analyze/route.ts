import { NextResponse } from "next/server";

export const runtime = "edge";
const API_URL = "https://api.openai.com/v1/responses";

async function ask(apiKey: string, input: unknown, instructions: string) {
  const response = await fetch(API_URL, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-5.6-sol", instructions, input }) });
  if (!response.ok) throw new Error(`OpenAI ${response.status}`);
  const data = await response.json() as any;
  return data.output_text || data.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === "output_text")?.text || "";
}

function jsonFrom(text: string) { const match = text.match(/\{[\s\S]*\}/); if (!match) throw new Error("Resposta sem JSON"); return JSON.parse(match[0]); }
function base64(buffer: ArrayBuffer) { const bytes = new Uint8Array(buffer); let value = ""; for (let i = 0; i < bytes.length; i += 0x8000) value += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(value); }

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY não configurada" }, { status: 503 });
  try {
    const form = await request.formData();
    const files = form.getAll("images").filter((item): item is File => item instanceof File);
    if (files.length !== 4) return NextResponse.json({ error: "Envie exatamente quatro imagens" }, { status: 400 });
    const product = JSON.parse(String(form.get("product") || "{}"));
    const images = await Promise.all(files.map(async (file) => ({ type: "input_image", detail: "high", image_url: `data:${file.type};base64,${base64(await file.arrayBuffer())}` })));

    const visual = jsonFrom(await ask(apiKey, [{ role: "user", content: [{ type: "input_text", text: `Ficha declarada: ${JSON.stringify(product)}` }, ...images] }],
      "Você é um analista visual sênior de produtos artesanais. Compare as quatro fotos, descreva apenas características observáveis, identifique inconsistências e nunca deduza composição, fragrância, medida, quantidade ou benefício. Responda apenas JSON com summary, observed_features, inconsistencies e confidence de 0 a 100."));

    const strategy = jsonFrom(await ask(apiKey, `Produto confirmado: ${JSON.stringify(product)}\nAnálise visual: ${JSON.stringify(visual)}`,
      "Você é um estrategista sênior de marketplace brasileiro e SEO para Shopee. Determine intenção de busca, termos principais e ordem de informação que aumentem descoberta e conversão sem repetição artificial, clickbait ou alegações não comprovadas. Responda apenas JSON com primary_keyword, secondary_keywords, search_intent, title_blueprint e description_outline."));

    const creative = jsonFrom(await ask(apiKey, `Produto: ${JSON.stringify(product)}\nVisual: ${JSON.stringify(visual)}\nEstratégia: ${JSON.stringify(strategy)}`,
      "Você é um copywriter sênior de e-commerce. Escreva em português brasileiro um título claro e natural e uma descrição escaneável, comercial e precisa. Inclua quantidade, dimensão, peso, escolha de uma cor por pacote, relação fixa entre cor e aroma, pronta entrega, validade, composição, embalagem, organza separada e cuidados. Não prometa efeitos cosméticos ou terapêuticos. Responda apenas JSON com title e description."));

    const review = jsonFrom(await ask(apiKey, `Fonte oficial: ${JSON.stringify(product)}\nAnálise: ${JSON.stringify(visual)}\nEstratégia: ${JSON.stringify(strategy)}\nTexto: ${JSON.stringify(creative)}`,
      "Você é o revisor-chefe de marca e conformidade. Faça auditoria factual linha por linha. Corrija qualquer invenção, ambiguidade, exagero, promessa cosmética, contradição sobre cores/aromas, organza ou embalagem. Preserve cuidados de não ingestão, olhos, calor, luz solar, crianças e animais. Devolva somente JSON com approved, title, description, corrections e quality_score de 0 a 100."));

    if (!review.approved || Number(review.quality_score) < 85) throw new Error("O texto não atingiu o padrão mínimo da revisão sênior");
    return NextResponse.json({ title: review.title, description: review.description, confidence: Number(visual.confidence) || 90, summary: visual.summary, quality: Number(review.quality_score), agents: ["analista visual", "estrategista SEO", "copywriter", "revisor-chefe"] });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Falha na análise" }, { status: 500 }); }
}
