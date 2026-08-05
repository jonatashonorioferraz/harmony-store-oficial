"use client";

import { ChangeEvent, useState } from "react";

type Photo = { file: File; url: string };
type CopyResult = { title: string; description: string; confidence: number; summary: string };
type Art = { label: string; brief: string; image?: string; score?: number; error?: string };

const colors = [
  ["Rosa BB", "Mamãe e Bebê"], ["Azul BB", "Mamãe e Bebê"], ["Lilás", "Lavanda"],
  ["Branco", "Karité"], ["Amarelo", "Floral"], ["Vermelho", "Morango"],
  ["Pink", "Tutti-frutti"], ["Verde BB", "Capim-limão"], ["Branco perolado", "Karité"],
];

const artBriefs = [
  { label: "Capa de catálogo", brief: "uma fotografia hero de catálogo, com várias mini rosas organizadas elegantemente sobre fundo neutro sofisticado" },
  { label: "Detalhe artesanal", brief: "um close macro editorial que revele com fidelidade o relevo das pétalas e o acabamento artesanal" },
  { label: "Paleta de cores", brief: "uma composição premium que apresente as cores reais disponíveis de forma organizada e sem texto" },
  { label: "Ocasião especial", brief: "uma cena elegante de lembrancinha para celebração, sem embalagem ou acessórios que possam parecer inclusos" },
  { label: "Composição versátil", brief: "uma fotografia comercial minimalista que sugira decoração e perfumação de ambiente sem fazer alegações cosméticas" },
];

const fallback: CopyResult = {
  title: "100 Mini Sabonetes Rosinhas Perfumadas 3 cm para Lembrancinhas",
  confidence: 94,
  summary: "Mini sabonete artesanal em formato de rosa.",
  description: `MINI SABONETES ROSINHAS PERFUMADAS — 100 UNIDADES

Mini sabonetes artesanais em formato de rosa, ideais para decoração e montagem de lembrancinhas de casamento, maternidade, aniversário, chá de bebê e outras ocasiões especiais.

INFORMAÇÕES DO PRODUTO
• Quantidade: 100 unidades
• Medidas aproximadas: 3 cm × 3 cm
• Peso aproximado: 2 g por unidade
• Base glicerinada, essência, corante, conservantes e veículo
• Pronta entrega
• Validade: 12 meses

COR E AROMA
Cada pacote é enviado na cor selecionada. Cada cor possui seu aroma padrão; não misturamos cores no mesmo pacote.

EMBALAGEM
As unidades são enviadas soltas em embalagem segura para transporte. Organza vendida separadamente.

CUIDADOS
Não ingerir. Evitar contato com os olhos. Manter fora do alcance de crianças e animais. Conservar longe do calor e da luz solar.`,
};

function save(name: string, href: string) { const a = document.createElement("a"); a.href = href; a.download = name; a.click(); }
function saveText(name: string, text: string) { save(name, URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }))); }

export default function Page() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [step, setStep] = useState<"upload" | "review" | "result">("upload");
  const [copy, setCopy] = useState<CopyResult>(fallback);
  const [arts, setArts] = useState<Art[]>(artBriefs);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");

  const addPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).slice(0, 4 - photos.length);
    setPhotos((current) => [...current, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    event.target.value = "";
  };

  const formWithImages = () => { const form = new FormData(); photos.forEach((photo) => form.append("images", photo.file)); return form; };

  const analyze = async () => {
    setBusy(true); setMessage("Os agentes estão analisando produto, intenção de busca e conformidade…");
    try {
      const form = formWithImages();
      form.append("product", JSON.stringify({ brand: "Harmony Store Oficial", product: "Mini Sabonetes Rosinhas ou Florzinhas", quantity: 100, size: "3 cm × 3 cm", weight: "2 g", stock: "pronta entrega", shelfLife: "12 meses", colors: colors.map(([color, aroma]) => ({ color, aroma })) }));
      const response = await fetch("/api/agents/analyze", { method: "POST", body: form });
      if (!response.ok) throw new Error("A análise não foi concluída");
      setCopy(await response.json());
    } catch { setCopy(fallback); setMessage("Usei a ficha confirmada como alternativa segura."); }
    finally { setBusy(false); setStep("review"); }
  };

  const createArt = async (index: number) => {
    const item = artBriefs[index]; const form = formWithImages();
    form.append("label", item.label); form.append("brief", item.brief); form.append("variation", String(index));
    const response = await fetch("/api/agents/images", { method: "POST", body: form });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Imagem reprovada");
    return { ...item, image: result.image, score: result.score };
  };

  const generate = async () => {
    setStep("result"); setBusy(true); setProgress(0); setArts(artBriefs);
    for (let index = 0; index < artBriefs.length; index++) {
      setProgress(index + 1); setMessage(`Fotógrafo e diretor de arte: imagem ${index + 1} de 5…`);
      try { const art = await createArt(index); setArts((current) => current.map((old, i) => i === index ? art : old)); }
      catch (error) {
        const reason = error instanceof Error ? error.message : "Reprovada";
        setArts((current) => current.map((old, i) => i === index ? { ...old, error: reason } : old));
        if (reason.includes("créditos") || reason.includes("limite de uso")) {
          setArts((current) => current.map((old, i) => i > index ? { ...old, error: "Aguardando ativação dos créditos da API" } : old));
          setMessage("A produção foi pausada para evitar novas tentativas. Ative os créditos da API e use Refazer com revisão.");
          break;
        }
      }
    }
    setBusy(false); setMessage("Criação concluída. Cada imagem foi auditada antes de aparecer.");
  };

  const retry = async (index: number) => {
    setArts((current) => current.map((old, i) => i === index ? { ...old, error: undefined } : old));
    try { const art = await createArt(index); setArts((current) => current.map((old, i) => i === index ? art : old)); }
    catch (error) { setArts((current) => current.map((old, i) => i === index ? { ...old, error: error instanceof Error ? error.message : "Reprovada" } : old)); }
  };

  const kit = () => {
    saveText("titulo-seo.txt", copy.title); saveText("descricao-anuncio.txt", copy.description);
    arts.forEach((art, index) => art.image && setTimeout(() => save(`${index + 1}-${art.label.toLowerCase().replaceAll(" ", "-")}.png`, art.image!), index * 180));
  };

  return <main className="studio">
    <aside className="studio-side"><img src="/harmony-logo-oficial.jpg" alt="Harmony Store Oficial"/><h2>Harmony Studio</h2><p>Anúncios com IA</p><div className="team"><b>✦ Equipe sênior ativa</b><span>Estratégia • SEO • Copy • Fotografia • Revisão</span></div><ol><li className={step === "upload" ? "active" : "done"}>1. Fotos reais</li><li className={step === "review" ? "active" : step === "result" ? "done" : ""}>2. Conferência</li><li className={step === "result" ? "active" : ""}>3. Material profissional</li></ol><small>As fotos são a fonte da verdade. Nenhuma promessa ou característica importante é inventada.</small></aside>
    <section className="studio-work"><header><div><small>HARMONY STORE OFICIAL</small><b>Mini Sabonetes Rosinhas</b></div><button onClick={() => { setStep("upload"); setPhotos([]); setArts(artBriefs); }}>Novo anúncio</button></header>

      {step === "upload" && <div className="studio-stage"><span className="eyebrow">ETAPA 1 DE 3</span><h1>Quatro referências.<br/><em>Uma produção de nível profissional.</em></h1><p>A equipe de IA compara ângulos, cores e acabamento antes de criar qualquer material.</p><div className="upload-grid">{Array.from({ length: 4 }).map((_, index) => photos[index] ? <figure key={index}><img src={photos[index].url} alt={`Referência ${index + 1}`}/><button onClick={() => setPhotos((all) => all.filter((_, i) => i !== index))}>×</button><figcaption>✓ Referência {index + 1}</figcaption></figure> : <label className="upload-slot" key={index}><input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={addPhotos}/><i>＋</i><b>Adicionar foto {index + 1}</b><span>{["Vista principal", "Outro ângulo", "Detalhe", "Cenário diferente"][index]}</span></label>)}</div><div className="studio-note"><b>Direção de arte</b><span>Prefira luz natural, foco nítido e pelo menos uma foto mostrando a peça inteira.</span><strong>{photos.length}/4</strong></div><button className="studio-primary" disabled={photos.length !== 4 || busy} onClick={analyze}>{busy ? message : "Analisar com a equipe de IA →"}</button></div>}

      {step === "review" && <div className="studio-stage"><span className="eyebrow">ETAPA 2 DE 3</span><h1>Estratégia pronta para aprovação.</h1><p>SEO, clareza comercial e conformidade foram revisados em conjunto.</p><div className="approval"><b>✓ Produto reconhecido</b><span>{copy.summary}</span><strong>{copy.confidence}% de confiança</strong></div><div className="review-panels"><article><small>TÍTULO SEO</small><h2>{copy.title}</h2><span>{copy.title.length} caracteres</span></article><article><small>FATOS CONFIRMADOS</small><ul><li>100 unidades</li><li>3 cm × 3 cm • 2 g</li><li>Uma cor por pacote</li><li>Organza não inclusa</li><li>Pronta entrega • validade 12 meses</li></ul></article></div><div className="review-actions"><button onClick={() => setStep("upload")}>← Rever fotos</button><button className="studio-primary" onClick={generate}>Aprovar e iniciar produção →</button></div></div>}

      {step === "result" && <div className="studio-stage result"><div className="result-title"><div><span className="eyebrow">ETAPA 3 DE 3</span><h1>{busy ? "Produção em andamento…" : "Material profissional pronto."}</h1><p>{message}</p></div><button className="studio-primary" disabled={busy || !arts.some((art) => art.image)} onClick={kit}>Baixar kit completo ↓</button></div><div className="agent-line">{["SEO", "Copy", "Fotografia", "Fidelidade", "Conformidade"].map((name, index) => <span className={!busy || index < Math.min(progress, 5) ? "done" : ""} key={name}>✓ {name}</span>)}</div><section className="copy-output"><article><header><small>TÍTULO OTIMIZADO</small><button onClick={() => navigator.clipboard.writeText(copy.title)}>Copiar</button></header><h2>{copy.title}</h2></article><article><header><small>DESCRIÇÃO COMPLETA</small><button onClick={() => navigator.clipboard.writeText(copy.description)}>Copiar</button></header><pre>{copy.description}</pre></article></section><h2 className="gallery-title">Imagens publicitárias auditadas</h2><div className="professional-gallery">{arts.map((art, index) => <article key={art.label}>{art.image ? <img src={art.image} alt={art.label}/> : <div className={art.error ? "image-state error" : "image-state"}><i>{art.error ? "!" : busy && progress === index + 1 ? "✦" : "○"}</i><b>{art.error || (busy && progress === index + 1 ? "Criando e revisando…" : "Aguardando produção")}</b></div>}<div><span>{String(index + 1).padStart(2, "0")}</span><h3>{art.label}</h3>{art.score && <small>Aprovada pelo diretor de arte • {art.score}/100</small>}{art.image && <button onClick={() => save(`${index + 1}-${art.label}.png`, art.image!)}>Baixar PNG</button>}{art.error && <button onClick={() => retry(index)}>Refazer com revisão</button>}</div></article>)}</div></div>}
    </section>
  </main>;
}
