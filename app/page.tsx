"use client";

import { ChangeEvent, useEffect, useState } from "react";

type Photo = { file: File; url: string };
type CopyResult = { title: string; description: string; confidence: number; summary: string };
type Art = { label: string; brief: string; image?: string; score?: number; error?: string };
type WorkflowStatus = { status: string; approved: boolean; progress: number; total: number; copy?: { title: string; description: string } | null; visual?: { summary?: string; confidence?: number } | null; images: Array<{ id: string; url: string }>; stages: Array<{ key: string; status: string; error?: { message?: string } | null }> };

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

const DRAFT_KEY = "harmony-current-ad";
function draftDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("harmony-studio", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function saveDraft(value: unknown) { const db = await draftDb(); const tx = db.transaction("drafts", "readwrite"); tx.objectStore("drafts").put(value, DRAFT_KEY); }
async function loadDraft() { const db = await draftDb(); return new Promise<any>((resolve) => { const request = db.transaction("drafts").objectStore("drafts").get(DRAFT_KEY); request.onsuccess = () => resolve(request.result); request.onerror = () => resolve(null); }); }
async function clearDraft() { const db = await draftDb(); db.transaction("drafts", "readwrite").objectStore("drafts").delete(DRAFT_KEY); }

export default function Page() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [step, setStep] = useState<"upload" | "review" | "result">("upload");
  const [copy, setCopy] = useState<CopyResult>(fallback);
  const [arts, setArts] = useState<Art[]>(artBriefs);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [workflowId, setWorkflowId] = useState<string | null>(null);

  useEffect(() => {
    loadDraft().then((draft) => {
      if (!draft?.photos?.length) return;
      setPhotos(draft.photos.map((file: File) => ({ file, url: URL.createObjectURL(file) })));
      if (draft.copy) setCopy(draft.copy);
      if (draft.arts) setArts(draft.arts);
      if (draft.step) setStep(draft.step);
      if (draft.workflowId) { setWorkflowId(draft.workflowId); fetch(`/api/studio/status?id=${encodeURIComponent(draft.workflowId)}`).then((response) => response.ok ? response.json() : null).then((status) => status && applyStatus(status)).catch(() => {}); }
      setMessage("Trabalho anterior recuperado automaticamente.");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!photos.length) return;
    const timer = window.setTimeout(() => saveDraft({ photos: photos.map((photo) => photo.file), copy, arts, step, workflowId }).catch(() => {}), 400);
    return () => window.clearTimeout(timer);
  }, [photos, copy, arts, step, workflowId]);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => { if (busy) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [busy]);

  const addPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).slice(0, 4 - photos.length);
    setPhotos((current) => [...current, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    event.target.value = "";
  };

  const formWithImages = () => { const form = new FormData(); photos.forEach((photo) => form.append("images", photo.file)); return form; };

  const applyStatus = (status: WorkflowStatus) => {
    setProgress(status.progress);
    if (status.copy) setCopy({ title: status.copy.title, description: status.copy.description, summary: status.visual?.summary || "Produto analisado com base nas quatro referências.", confidence: Number(status.visual?.confidence) || 90 });
    if (status.approved && status.images.length === 5) setArts(artBriefs.map((art, index) => ({ ...art, image: status.images[index].url, score: 100 })));
  };
  const advance = async (id: string) => { const response = await fetch("/api/studio/advance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workflowId: id }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "A etapa não foi concluída"); applyStatus(data); return data as WorkflowStatus; };

  const analyze = async () => {
    setBusy(true); setMessage("Triagem, análise visual, estratégia e copy estão trabalhando…");
    try {
      const form = formWithImages();
      form.append("product", JSON.stringify({ marketplace: "Shopee", productCategory: "mini-sabonetes", brand: "Harmony Store Oficial", product: "Mini Sabonetes Rosinhas ou Florzinhas", quantity: 100, size: "3 cm × 3 cm", weight: "2 g", stock: "pronta entrega", shelfLife: "12 meses", composition: "base glicerinada, essência, corante, conservantes e veículo", packaging: "soltas em embalagem segura; organza vendida separadamente", warnings: ["não ingerir", "evitar contato com os olhos", "manter longe de crianças e animais", "proteger de calor e sol"], colors: colors.map(([color, aroma]) => ({ color, aroma })) }));
      const response = await fetch("/api/studio/start", { method: "POST", body: form }); const started = await response.json(); if (!response.ok) throw new Error(started.error || "O trabalho não pôde ser iniciado"); setWorkflowId(started.workflowId);
      let status: WorkflowStatus | null = null; for (let i = 0; i < 4; i++) { status = await advance(started.workflowId); setMessage(`Equipe sênior: etapa ${status.progress} de ${status.total} concluída…`); }
      if (!status?.copy) throw new Error("A copy ainda não foi concluída"); setStep("review"); setMessage("Estratégia e texto prontos para sua conferência.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "A análise não foi concluída"); }
    finally { setBusy(false); }
  };

  const generate = async () => { if (!workflowId) return; setStep("result"); setBusy(true); setArts(artBriefs); try { let status: WorkflowStatus | null = null; for (let i = 0; i < 9; i++) { status = await advance(workflowId); setMessage(`Equipe sênior: etapa ${status.progress} de ${status.total} concluída…`); if (status.approved) break; } if (!status?.approved) throw new Error("O material não foi liberado pela revisão final."); setMessage("Pacote aprovado pelo diretor de qualidade: título, descrição e cinco imagens prontos."); } catch (error) { setMessage(error instanceof Error ? error.message : "A produção foi interrompida"); } finally { setBusy(false); } };

  const retry = async (_index?: number) => { if (!workflowId) return; setBusy(true); try { const status = await advance(workflowId); if (status.approved) setMessage("Material recuperado e aprovado."); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível repetir a etapa"); } finally { setBusy(false); } };

  const kit = () => {
    saveText("titulo-seo.txt", copy.title); saveText("descricao-anuncio.txt", copy.description);
    arts.forEach((art, index) => art.image && setTimeout(() => save(`${index + 1}-${art.label.toLowerCase().replaceAll(" ", "-")}.png`, art.image!), index * 180));
  };

  return <main className="studio"><a className="admin-shortcut" href="/admin">Administração</a>
    <aside className="studio-side"><img src="/harmony-logo-oficial.jpg" alt="Harmony Store Oficial"/><h2>Harmony Studio</h2><p>Anúncios com IA</p><div className="team"><b>✦ Equipe sênior ativa</b><span>Estratégia • SEO • Copy • Fotografia • Revisão</span></div><ol><li className={step === "upload" ? "active" : "done"}>1. Fotos reais</li><li className={step === "review" ? "active" : step === "result" ? "done" : ""}>2. Conferência</li><li className={step === "result" ? "active" : ""}>3. Material profissional</li></ol><small>As fotos são a fonte da verdade. Nenhuma promessa ou característica importante é inventada.</small></aside>
    <section className="studio-work"><header><div><small>HARMONY STORE OFICIAL</small><b>Mini Sabonetes Rosinhas</b></div><button onClick={() => { clearDraft().catch(() => {}); setStep("upload"); setPhotos([]); setArts(artBriefs); setWorkflowId(null); }}>Novo anúncio</button></header>

      {step === "upload" && <div className="studio-stage"><span className="eyebrow">ETAPA 1 DE 3</span><h1>Quatro referências.<br/><em>Uma produção de nível profissional.</em></h1><p>A equipe de IA compara ângulos, cores e acabamento antes de criar qualquer material.</p><div className="upload-grid">{Array.from({ length: 4 }).map((_, index) => photos[index] ? <figure key={index}><img src={photos[index].url} alt={`Referência ${index + 1}`}/><button onClick={() => setPhotos((all) => all.filter((_, i) => i !== index))}>×</button><figcaption>✓ Referência {index + 1}</figcaption></figure> : <label className="upload-slot" key={index}><input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={addPhotos}/><i>＋</i><b>Adicionar foto {index + 1}</b><span>{["Vista principal", "Outro ângulo", "Detalhe", "Cenário diferente"][index]}</span></label>)}</div><div className="studio-note"><b>Direção de arte</b><span>Prefira luz natural, foco nítido e pelo menos uma foto mostrando a peça inteira.</span><strong>{photos.length}/4</strong></div><button className="studio-primary" disabled={photos.length !== 4 || busy} onClick={analyze}>{busy ? message : "Analisar com a equipe de IA →"}</button></div>}

      {step === "review" && <div className="studio-stage"><span className="eyebrow">ETAPA 2 DE 3</span><h1>Estratégia pronta para aprovação.</h1><p>SEO, clareza comercial e conformidade foram revisados em conjunto.</p><div className="approval"><b>✓ Produto reconhecido</b><span>{copy.summary}</span><strong>{copy.confidence}% de confiança</strong></div><div className="review-panels"><article><small>TÍTULO SEO</small><h2>{copy.title}</h2><span>{copy.title.length} caracteres</span></article><article><small>FATOS CONFIRMADOS</small><ul><li>100 unidades</li><li>3 cm × 3 cm • 2 g</li><li>Uma cor por pacote</li><li>Organza não inclusa</li><li>Pronta entrega • validade 12 meses</li></ul></article></div><div className="review-actions"><button onClick={() => setStep("upload")}>← Rever fotos</button><button className="studio-primary" onClick={generate}>Aprovar e iniciar produção →</button></div></div>}

      {step === "result" && <div className="studio-stage result"><div className="result-title"><div><span className="eyebrow">ETAPA 3 DE 3</span><h1>{busy ? "Produção em andamento…" : "Material profissional pronto."}</h1><p>{message}</p></div><button className="studio-primary" disabled={busy || !arts.some((art) => art.image)} onClick={kit}>Baixar kit completo ↓</button></div><div className="agent-line">{["SEO", "Copy", "Fotografia", "Fidelidade", "Conformidade"].map((name, index) => <span className={!busy || index < Math.min(progress, 5) ? "done" : ""} key={name}>✓ {name}</span>)}</div><section className="copy-output"><article><header><small>TÍTULO OTIMIZADO</small><button onClick={() => navigator.clipboard.writeText(copy.title)}>Copiar</button></header><h2>{copy.title}</h2></article><article><header><small>DESCRIÇÃO COMPLETA</small><button onClick={() => navigator.clipboard.writeText(copy.description)}>Copiar</button></header><pre>{copy.description}</pre></article></section><h2 className="gallery-title">Imagens publicitárias auditadas</h2><div className="professional-gallery">{arts.map((art, index) => <article key={art.label}>{art.image ? <img src={art.image} alt={art.label}/> : <div className={art.error ? "image-state error" : "image-state"}><i>{art.error ? "!" : busy && progress === index + 1 ? "✦" : "○"}</i><b>{art.error || (busy && progress === index + 1 ? "Criando e revisando…" : "Aguardando produção")}</b></div>}<div><span>{String(index + 1).padStart(2, "0")}</span><h3>{art.label}</h3>{art.score && <small>Aprovada pelo diretor de arte • {art.score}/100</small>}{art.image && <button onClick={() => save(`${index + 1}-${art.label}.png`, art.image!)}>Baixar PNG</button>}{art.error && <button onClick={() => retry(index)}>Refazer com revisão</button>}</div></article>)}</div></div>}
    </section>
  </main>;
}
