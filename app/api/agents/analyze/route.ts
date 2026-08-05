import { NextResponse } from "next/server";

export const runtime = "edge";
const API_URL = "https://api.openai.com/v1/responses";

async function ask(apiKey: string, input: unknown, instructions: string) {
  const response = await fetch(API_URL, {method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-5.6-sol",instructions,input})});
  if (!response.ok) throw new Error(`OpenAI ${response.status}`);
  const data = await response.json() as {output_text?:string;output?:Array<{content?:Array<{type:string;text?:string}>}>};
  return data.output_text || data.output?.flatMap(o=>o.content||[]).find(c=>c.type==="output_text")?.text || "";
}

function jsonFrom(text:string) {
  const match=text.match(/\{[\s\S]*\}/); if(!match) throw new Error("Resposta sem JSON");
  return JSON.parse(match[0]);
}

export async function POST(request:Request) {
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey) return NextResponse.json({error:"OPENAI_API_KEY não configurada"},{status:503});
  try {
    const form=await request.formData();
    const images=form.getAll("images").filter((item):item is File=>item instanceof File);
    if(images.length!==4) return NextResponse.json({error:"Envie exatamente quatro imagens"},{status:400});
    if(images.some(file=>file.size>10_000_000||!file.type.startsWith("image/"))) return NextResponse.json({error:"Imagem inválida ou maior que 10 MB"},{status:400});
    const product=JSON.parse(String(form.get("product")||"{}"));
    const imageContent=await Promise.all(images.map(async file=>({type:"input_image",image_url:`data:${file.type};base64,${bufferToBase64(await file.arrayBuffer())}`})));

    const visual=jsonFrom(await ask(apiKey,[{role:"user",content:[{type:"input_text",text:`Dados declarados pelo fabricante: ${JSON.stringify(product)}`},...imageContent]}],
      "Você é o Agente Visual da Harmony Store. Analise somente características observáveis nas quatro fotos. Não invente fragrância, medidas, composição, quantidade ou uso. Responda somente JSON válido com summary, observed_features, inconsistencies e confidence de 0 a 100."));
    const creative=jsonFrom(await ask(apiKey,`Dados confirmados: ${JSON.stringify(product)}\nAnálise visual: ${JSON.stringify(visual)}`,
      "Você reúne o Redator de Marketplace e o Diretor de Arte. Crie em português do Brasil um título objetivo e uma descrição completa para 100 unidades. Preserve os dados confirmados, informe que é uma única cor por pacote, não prometa benefícios cosméticos e não diga que a organza acompanha. Responda somente JSON válido com title e description."));
    const review=jsonFrom(await ask(apiKey,`Fonte: ${JSON.stringify(product)}\nVisual: ${JSON.stringify(visual)}\nMaterial: ${JSON.stringify(creative)}`,
      "Você é o Agente Revisor. Remova qualquer afirmação não sustentada, promessa cosmética ou contradição. Mantenha os alertas de conservação, não ingestão, olhos, crianças e animais. Responda somente JSON válido com approved, title, description e notes."));
    if(!review.approved) throw new Error("Material reprovado pelo agente revisor");
    return NextResponse.json({title:review.title,description:review.description,confidence:Number(visual.confidence)||90,summary:visual.summary,trace:["visual","redator","direção de arte","revisor"]});
  } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:"Falha na análise"},{status:500}); }
}

function bufferToBase64(buffer:ArrayBuffer) {
  const bytes=new Uint8Array(buffer); let binary="";
  for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(binary);
}
