import { NextResponse } from "next/server";

export const runtime = "edge";
const RESPONSES_URL = "https://api.openai.com/v1/responses";
const IMAGE_EDITS_URL = "https://api.openai.com/v1/images/edits";

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer); let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function outputText(data: any) { return data.output_text || data.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === "output_text")?.text || ""; }
function jsonFrom(text: string) { const match = text.match(/\{[\s\S]*\}/); return match ? JSON.parse(match[0]) : null; }

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY não configurada" }, { status: 503 });
  try {
    const incoming = await request.formData();
    const files = incoming.getAll("images").filter((item): item is File => item instanceof File);
    if (files.length !== 4) return NextResponse.json({ error: "Envie exatamente quatro imagens" }, { status: 400 });
    if (files.some((file) => !file.type.startsWith("image/") || file.size > 10_000_000)) return NextResponse.json({ error: "Imagem inválida ou maior que 10 MB" }, { status: 400 });

    const brief = String(incoming.get("brief") || "fotografia principal de catálogo");
    const label = String(incoming.get("label") || "Imagem profissional");
    const prompt = `Crie ${brief} para anúncio de marketplace da Harmony Store Oficial. As quatro imagens são referências do mesmo produto real. Preserve rigorosamente o formato de rosa, desenho das pétalas, proporções, material artesanal, acabamento e cores observadas. Melhore apenas iluminação, enquadramento, composição e cenário. Fotografia publicitária premium, natural, elegante, comercial e crível; fundo limpo, luz suave e produto nítido. Sem texto, logotipo, selo, rótulo, embalagem, organza, pessoas ou objetos que pareçam acompanhar a compra. Evite estética infantil, cartoon, ilustração, plástico 3D, brilho artificial, deformações ou quantidade enganosa.`;

    // A Image API é a rota direta indicada para uma única edição. Evita cobrar
    // um modelo conversacional adicional antes de iniciar a geração.
    const imageForm = new FormData();
    imageForm.append("model", "gpt-image-2");
    imageForm.append("prompt", prompt);
    imageForm.append("quality", "high");
    imageForm.append("size", "1024x1024");
    imageForm.append("output_format", "png");
    files.forEach((file) => imageForm.append("image[]", file, file.name));

    const generation = await fetch(IMAGE_EDITS_URL, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: imageForm });
    const generated = await generation.json().catch(() => ({})) as any;
    if (!generation.ok) {
      const apiMessage = generated?.error?.message || `Erro ${generation.status}`;
      return NextResponse.json({
        error: generation.status === 429 ? "Limite temporário do GPT Image atingido. Aguarde 60 segundos antes de refazer." : apiMessage,
        code: generated?.error?.code || generated?.error?.type || "image_api_error",
        apiMessage,
      }, { status: generation.status });
    }
    const image = generated?.data?.[0]?.b64_json;
    if (!image) throw new Error("A Image API não retornou o arquivo gerado");

    // A imagem nunca é descartada depois de ser cobrada. A auditoria acrescenta
    // uma nota; se estiver indisponível, a candidata continua disponível.
    let review = { approved: true, score: 0, issues: ["Auditoria automática pendente"] };
    try {
      const references = await Promise.all(files.map(async (file) => ({ type: "input_image", detail: "low", image_url: `data:${file.type};base64,${toBase64(await file.arrayBuffer())}` })));
      const candidate = { type: "input_image", detail: "high", image_url: `data:image/png;base64,${image}` };
      const response = await fetch(RESPONSES_URL, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({
        model: "gpt-5.6-sol",
        instructions: "Você é diretor de arte e auditor de fidelidade. Compare a candidata às referências. Responda apenas JSON com approved, score de 0 a 100 e issues.",
        input: [{ role: "user", content: [{ type: "input_text", text: `Audite fidelidade e qualidade para: ${brief}. As quatro primeiras são referências; a última é a candidata.` }, ...references, candidate] }],
      }) });
      if (response.ok) review = jsonFrom(outputText(await response.json())) || review;
    } catch { /* A geração paga permanece disponível. */ }

    return NextResponse.json({ label, image: `data:image/png;base64,${image}`, score: Number(review.score) || 0, approved: Boolean(review.approved), issues: review.issues || [] });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao criar imagem" }, { status: 500 }); }
}
