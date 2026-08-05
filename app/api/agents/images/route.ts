import { NextResponse } from "next/server";

export const runtime = "edge";

const API_URL = "https://api.openai.com/v1/responses";

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function outputText(data: any) {
  return data.output_text || data.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === "output_text")?.text || "";
}

function jsonFrom(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("A revisão não retornou um resultado válido");
  return JSON.parse(match[0]);
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY não configurada" }, { status: 503 });

  try {
    const form = await request.formData();
    const files = form.getAll("images").filter((item): item is File => item instanceof File);
    if (files.length !== 4) return NextResponse.json({ error: "Envie exatamente quatro imagens" }, { status: 400 });
    if (files.some((file) => !file.type.startsWith("image/") || file.size > 10_000_000)) return NextResponse.json({ error: "Imagem inválida ou maior que 10 MB" }, { status: 400 });

    const brief = String(form.get("brief") || "fotografia principal de catálogo");
    const label = String(form.get("label") || "Imagem profissional");
    const references = await Promise.all(files.map(async (file) => ({
      type: "input_image",
      detail: "high",
      image_url: `data:${file.type};base64,${toBase64(await file.arrayBuffer())}`,
    })));

    const generation = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.6",
        input: [{ role: "user", content: [{ type: "input_text", text: `Você é um fotógrafo publicitário sênior especializado em produtos artesanais. Crie ${brief} para um anúncio de marketplace da Harmony Store Oficial. Use as quatro imagens como fonte de verdade. Preserve rigorosamente formato de rosa, pétalas, proporções, tamanho aparente, material artesanal, acabamento e cores reais. Pode melhorar iluminação, composição e cenário, mas não redesenhe o produto. Fotografia editorial premium, natural, elegante, comercial e crível. Fundo limpo, luz suave, alta nitidez no produto e espaço visual equilibrado. Sem texto, logotipo, selo, rótulo, embalagem, organza, pessoas ou objetos que pareçam inclusos. Evite estética infantil, cartoon, ilustração, plástico 3D, brilho artificial, pétalas deformadas e quantidade enganosa.` }, ...references] }],
        tools: [{ type: "image_generation", action: "edit", quality: "high", size: "1024x1024" }],
      }),
    });
    if (!generation.ok) {
      const details = await generation.json().catch(() => ({})) as any;
      if (generation.status === 429) return NextResponse.json({
        error: "A conta da API está sem créditos disponíveis ou atingiu o limite de uso. Ative o faturamento na plataforma OpenAI e tente novamente.",
        code: details?.error?.code || "billing_or_rate_limit",
      }, { status: 429 });
      throw new Error(details?.error?.message || `Falha na geração profissional (${generation.status})`);
    }
    const generated = await generation.json() as any;
    const image = generated.output?.find((item: any) => item.type === "image_generation_call")?.result;
    if (!image) throw new Error("A IA não entregou a imagem");

    const candidate = { type: "input_image", detail: "high", image_url: `data:image/png;base64,${image}` };
    const reviewResponse = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.6-sol",
        instructions: "Você é o diretor de arte e auditor de fidelidade. Compare a candidata com as quatro referências. Reprove deformações, mudança do formato da rosa, material plástico, cores falsas, texto ilegível, itens que sugiram inclusão, estética infantil ou resultado amador. Responda apenas JSON válido com approved, score de 0 a 100 e issues em lista.",
        input: [{ role: "user", content: [{ type: "input_text", text: `Avalie a candidata para: ${brief}. As quatro primeiras imagens são referências reais; a última é a candidata.` }, ...references, candidate] }],
      }),
    });
    if (!reviewResponse.ok) throw new Error(`Falha na revisão de qualidade (${reviewResponse.status})`);
    const review = jsonFrom(outputText(await reviewResponse.json()));
    if (!review.approved || Number(review.score) < 80) return NextResponse.json({ error: "A imagem não atingiu o padrão profissional", review }, { status: 422 });

    return NextResponse.json({ label, image: `data:image/png;base64,${image}`, score: Number(review.score), issues: review.issues || [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao criar imagem" }, { status: 500 });
  }
}
