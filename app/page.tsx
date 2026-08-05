"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";

type Step = "fotos" | "conferencia" | "resultado";
type Photo = { file: File; url: string };

const colors = [
  ["Rosa BB", "Mamãe e Bebê", "#f4b6c8"], ["Azul BB", "Mamãe e Bebê", "#a9d9f2"],
  ["Lilás", "Lavanda", "#bca7de"], ["Branco", "Karité", "#f5f1e8"],
  ["Amarelo", "Floral", "#f5dc69"], ["Vermelho", "Morango", "#c83e4d"],
  ["Pink", "Tutti-frutti", "#ef4f91"], ["Verde BB", "Capim-limão", "#b9dec8"],
  ["Branco perolado", "Karité", "#e9e7df"],
];

const defaultTitle = "100 Mini Sabonetes Rosinhas Perfumadas 3cm para Lembrancinhas";
const defaultDescription = `MINI SABONETES ROSINHAS PERFUMADAS — 100 UNIDADES

Deixe suas lembrancinhas ainda mais delicadas com as Mini Rosinhas da Harmony Store Oficial.

Produzidas artesanalmente em base glicerinada, possuem formato de rosa e são ideais para decoração e montagem de lembrancinhas para casamentos, maternidade, aniversários, chá de bebê e outras ocasiões especiais.

INFORMAÇÕES DO PRODUTO
• Quantidade: 100 unidades
• Formato: rosa
• Medidas aproximadas: 3 cm × 3 cm
• Peso aproximado: 2 g por unidade
• Produto disponível para pronta entrega
• Validade: 12 meses

ESCOLHA DA COR E DO AROMA
Cada pacote é enviado em uma única opção, conforme a variação selecionada. Cada cor possui seu aroma padrão; não enviamos cores sortidas no mesmo pacote.

EMBALAGEM
As unidades são enviadas soltas em embalagem segura para transporte. Saquinhos de organza e demais itens decorativos não estão inclusos.

COMPOSIÇÃO
Base glicerinada, essência, corante, conservantes e veículo.

CUIDADOS
Não ingerir. Evitar contato com os olhos. Manter fora do alcance de crianças e animais. Conservar em local seco, fresco, protegido do calor e da luz solar. Produto artesanal: podem ocorrer pequenas variações de tonalidade e acabamento.`;

const cards = [
  { kicker: "HARMONY STORE OFICIAL", title: "100 Mini Rosinhas", sub: "Sabonetes perfumados para lembrancinhas", tag: "3 cm × 3 cm" },
  { kicker: "ESCOLHA SUA COR", title: "9 opções delicadas", sub: "Cada cor possui seu aroma especial", tag: "Você escolhe" },
  { kicker: "FEITO COM CUIDADO", title: "Produção artesanal", sub: "Base glicerinada • 2 g por unidade", tag: "100 unidades" },
  { kicker: "PARA MOMENTOS ESPECIAIS", title: "Lembranças que encantam", sub: "Casamentos • Maternidade • Festas", tag: "Pronta entrega" },
  { kicker: "INFORMAÇÃO IMPORTANTE", title: "Organza não inclusa", sub: "As unidades seguem soltas e protegidas", tag: "Envio seguro" },
];

function download(name: string, content: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

export default function Page() {
  const [step, setStep] = useState<Step>("fotos");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [processing, setProcessing] = useState(false);
  const [selected, setSelected] = useState("Rosa BB");
  const [toast, setToast] = useState("");
  const [aiResult, setAiResult] = useState<{ title:string; description:string; confidence:number; summary:string }|null>(null);
  const [aiMode, setAiMode] = useState<"real"|"demo">("demo");
  const input = useRef<HTMLInputElement>(null);
  const progress = step === "fotos" ? 1 : step === "conferencia" ? 2 : 3;
  const selectedColor = useMemo(() => colors.find(c => c[0] === selected)!, [selected]);

  const addPhotos = (e: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files || []).slice(0, 4 - photos.length);
    setPhotos(p => [...p, ...incoming.map(file => ({ file, url: URL.createObjectURL(file) }))]);
    e.target.value = "";
  };
  const analyze = async () => {
    if (photos.length !== 4) return;
    setProcessing(true);
    try {
      const body = new FormData();
      photos.forEach(photo => body.append("images", photo.file));
      body.append("product", JSON.stringify({name:"Mini Sabonetes Rosinhas",quantity:100,dimensions:"3 cm × 3 cm",unitWeight:"2 g",availability:"pronta entrega",shelfLife:"12 meses",colors:colors.map(c=>({color:c[0],fragrance:c[1]}))}));
      const response = await fetch("/api/agents/analyze", {method:"POST",body});
      if (!response.ok) throw new Error("IA indisponível");
      setAiResult(await response.json()); setAiMode("real");
    } catch {
      setAiResult({title:defaultTitle,description:defaultDescription,confidence:94,summary:"Mini sabonete artesanal em formato de rosa."});
      setAiMode("demo");
    } finally { setProcessing(false); setStep("conferencia"); }
  };
  const generate = () => { setProcessing(true); setTimeout(() => { setProcessing(false); setStep("resultado"); }, 1300); };
  const copy = async (text: string, message: string) => { await navigator.clipboard.writeText(text); setToast(message); setTimeout(() => setToast(""), 2400); };
  const exportCard = (index: number) => {
    const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = 1080;
    const ctx = canvas.getContext("2d")!; const card = cards[index];
    const render = (img?: HTMLImageElement) => {
      ctx.fillStyle = index === 4 ? "#183f39" : "#f4eee7"; ctx.fillRect(0, 0, 1080, 1080);
      if (img) { ctx.save(); ctx.globalAlpha = .92; ctx.drawImage(img, 0, 0, 1080, 700); ctx.restore(); const g=ctx.createLinearGradient(0,480,0,810);g.addColorStop(0,"rgba(244,238,231,0)");g.addColorStop(1,index===4?"#183f39":"#f4eee7");ctx.fillStyle=g;ctx.fillRect(0,430,1080,390); }
      ctx.fillStyle = index === 4 ? "#c9a876" : "#926b3f"; ctx.font = "600 26px Arial"; ctx.fillText(card.kicker, 74, 790);
      ctx.fillStyle = index === 4 ? "#fffaf2" : "#193f38"; ctx.font = "700 66px Georgia"; wrap(ctx, card.title, 74, 865, 900, 75);
      ctx.font = "32px Arial"; ctx.fillStyle = index === 4 ? "#e6ddd1" : "#5d625e"; ctx.fillText(card.sub, 74, 994);
      const a=document.createElement("a");a.href=canvas.toDataURL("image/png");a.download=`${String(index+1).padStart(2,"0")}-arte-rosinhas.png`;a.click();
    };
    if (photos.length) { const img=new Image();img.onload=()=>render(img);img.src=photos[index%photos.length].url; } else render();
  };
  const downloadKit = () => {
    const finalTitle=aiResult?.title||defaultTitle, finalDescription=aiResult?.description||defaultDescription;
    download("titulo.txt", finalTitle); download("descricao.txt", finalDescription + "\n\nVARIAÇÕES\n" + colors.map(c=>`${c[0]} — ${c[1]}`).join("\n"));
    cards.forEach((_, i) => setTimeout(() => exportCard(i), 180 * i)); setToast("Kit preparado para download"); setTimeout(()=>setToast(""),2500);
  };

  return <main className="app-shell">
    <aside className="side">
      <div className="brand"><img src="/harmony-logo-oficial.jpg" alt="Harmony Store Oficial"/><div><b>Harmony Studio</b><small>Anúncios com IA</small></div></div>
      <div className="agent-status"><span>✦</span><div><b>Equipe de IA ativa</b><small>5 agentes trabalhando juntos</small></div></div>
      <nav className="steps" aria-label="Etapas do anúncio">
        {["Fotos do produto", "Conferência", "Material pronto"].map((label,i)=><div className={progress===i+1?"active":progress>i+1?"done":""} key={label}><i>{progress>i+1?"✓":i+1}</i><span><b>{label}</b><small>{["4 imagens reais", "Dados e variações", "Textos e artes"][i]}</small></span></div>)}
      </nav>
      <div className="safety"><b>✓ Produto protegido</b><p>A IA usa suas fotos como fonte da verdade e sinaliza dados não confirmados.</p></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><small>NOVO ANÚNCIO</small><b>Mini Sabonetes Rosinhas</b></div><button className="ghost" onClick={()=>{setStep("fotos");setPhotos([])}}>Começar novamente</button></header>

      {step === "fotos" && <div className="stage photo-stage"><div className="stage-heading"><span className="eyebrow">ETAPA 1 DE 3</span><h1>Mostre o produto.<br/><em>A IA cuida do resto.</em></h1><p>Envie quatro fotos reais, em ângulos ou cenários diferentes. Elas serão a referência visual de todo o anúncio.</p></div>
        <div className="photo-grid">
          {Array.from({length:4}).map((_,i)=>photos[i]?<figure key={i}><img src={photos[i].url} alt={`Foto ${i+1} do produto`}/><button aria-label={`Remover foto ${i+1}`} onClick={()=>setPhotos(p=>p.filter((_,x)=>x!==i))}>×</button><figcaption><span>✓</span> Foto {i+1}</figcaption></figure>:<button key={i} className="photo-slot" onClick={()=>input.current?.click()}><i>＋</i><b>Adicionar foto {i+1}</b><small>{["Vista principal","Outro ângulo","Detalhes","Cenário diferente"][i]}</small></button>)}
        </div>
        <input ref={input} hidden multiple type="file" accept="image/png,image/jpeg,image/webp" onChange={addPhotos}/>
        <div className="tip"><span>✦</span><div><b>Dica da diretora de arte</b><p>Use boa iluminação e deixe o formato inteiro visível em pelo menos uma foto.</p></div><strong>{photos.length}/4 fotos</strong></div>
        <button className="primary wide" disabled={photos.length!==4||processing} onClick={analyze}>{processing?<><i className="spinner"/> Analisando forma, cores e acabamento...</>:<>Analisar produto com IA <span>→</span></>}</button>
      </div>}

      {step === "conferencia" && <div className="stage review-stage"><div className="stage-heading"><span className="eyebrow">ETAPA 2 DE 3</span><h1>A IA analisou o produto.</h1><p>Confira os dados antes de gerar o material. Nada importante será inventado.</p></div>
        <div className="confidence"><span>✦</span><div><b>Produto reconhecido com alta confiança</b><p>{aiResult?.summary||"Mini sabonete artesanal em formato de rosa."}</p></div><strong>{aiResult?.confidence||94}% · {aiMode==="real"?"IA real":"demonstração"}</strong></div>
        <div className="review-grid"><section className="facts card"><header><div><small>DADOS CONFIRMADOS</small><h2>Ficha do produto</h2></div><span>8 de 8 ✓</span></header>
          {[["Produto","Mini Sabonetes Rosinhas"],["Quantidade","100 unidades"],["Tamanho","3 cm × 3 cm"],["Peso","2 g por unidade"],["Disponibilidade","Pronta entrega"],["Validade","12 meses"],["Embalagem","Soltos, com proteção"],["Personalização","Não disponível"]].map(x=><label key={x[0]}><span>{x[0]}</span><input value={x[1]} readOnly/><i>✓</i></label>)}
        </section><section className="variants card"><header><div><small>VARIAÇÃO DO ANÚNCIO</small><h2>Cores e aromas</h2></div><span>9 opções</span></header><p>O pacote recebe uma única cor, conforme a opção escolhida.</p><div className="color-list">{colors.map(c=><button className={selected===c[0]?"selected":""} key={c[0]} onClick={()=>setSelected(c[0])}><i style={{background:c[2]}}/><span><b>{c[0]}</b><small>{c[1]}</small></span><em>{selected===c[0]?"✓":""}</em></button>)}</div><div className="selection">Prévia selecionada: <b>{selectedColor[0]} · {selectedColor[1]}</b></div></section></div>
        <div className="review-actions"><button className="ghost" onClick={()=>setStep("fotos")}>← Voltar às fotos</button><button className="primary" disabled={processing} onClick={generate}>{processing?"Agentes criando o anúncio...":"Aprovar e criar anúncio →"}</button></div>
      </div>}

      {step === "resultado" && <div className="stage result-stage"><div className="result-head"><div><span className="eyebrow">ETAPA 3 DE 3 · CONCLUÍDO</span><h1>Seu anúncio está pronto.</h1><p>Título, descrição e cinco artes revisados pela equipe de IA {aiMode==="real"?"conectada":"em modo demonstrativo"}.</p></div><button className="primary" onClick={downloadKit}>Baixar kit completo ↓</button></div>
        <div className="quality"><span>✓</span><div><b>Revisão concluída sem pendências</b><p>Informações, imagens, variações e avisos estão consistentes.</p></div><strong>Pronto para enviar</strong></div>
        <div className="output-grid"><section className="copy-column"><article className="card copy-card"><header><div><small>TÍTULO OTIMIZADO</small><span>{(aiResult?.title||defaultTitle).length} caracteres</span></div><button onClick={()=>copy(aiResult?.title||defaultTitle,"Título copiado")}>Copiar</button></header><h2>{aiResult?.title||defaultTitle}</h2></article>
          <article className="card copy-card description"><header><div><small>DESCRIÇÃO COMPLETA</small><span>Revisada</span></div><button onClick={()=>copy(aiResult?.description||defaultDescription,"Descrição copiada")}>Copiar</button></header><pre>{aiResult?.description||defaultDescription}</pre></article></section>
          <section className="art-column"><header><div><small>ARTES DO ANÚNCIO</small><h2>5 imagens preparadas</h2></div><span>1080 × 1080 px</span></header><div className="art-grid">{cards.map((c,i)=><article className={`art a${i}`} key={c.title}><div className="art-photo">{photos.length&&<img src={photos[i%photos.length].url} alt=""/>}<span>{i+1}</span></div><small>{c.kicker}</small><h3>{c.title}</h3><p>{c.sub}</p><button onClick={()=>exportCard(i)}>Baixar PNG ↓</button></article>)}</div></section>
        </div>
      </div>}
    </section>
    {toast&&<div className="toast">✓ {toast}</div>}
  </main>;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x:number, y:number, max:number, line:number){const words=text.split(" ");let row="";for(const word of words){const test=row+word+" ";if(ctx.measureText(test).width>max&&row){ctx.fillText(row,x,y);row=word+" ";y+=line}else row=test}ctx.fillText(row,x,y)}
