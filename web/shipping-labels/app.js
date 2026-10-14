(function(){
'use strict';
if(!globalThis.HarmonyConverterAccess?.allowed())return;
const $=id=>document.getElementById(id);
let selected=[],invoiceFiles=[],sequence=[],page=0,url=null,pdfReader=null,renderTask=null,revision=0,busy=false,disposed=false,prepared=null;
const resolutionControls=[];
const guide=globalThis.HarmonyLabelsGuide;
const activeInvoices=()=>guide?.platform==='shopee'?[]:invoiceFiles;
const inputReady=()=>!guide||Boolean(guide.platform&&(guide.platform!=='mercado-livre'||invoiceFiles.length));
window.addEventListener('harmony-labels:platform-change',()=>{if(busy||disposed)return;clearResult();refreshFiles();$('status').className='';$('status').textContent='Plataforma alterada. Os arquivos selecionados foram preservados; confira o lote novamente.';});
function ensureActive(){if(disposed||!globalThis.HarmonyConverterAccess.allowed())throw Error('Conversão encerrada.');}
function clearResult(keepReview=false){
  revision++;renderTask?.cancel();renderTask=null;
  if(pdfReader){pdfReader.destroy().catch(()=>{});pdfReader=null;}
  sequence=[];page=0;if(url)URL.revokeObjectURL(url);url=null;
  $('actions').hidden=true;$('download').removeAttribute('href');$('navigation').hidden=true;
  $('preview').replaceChildren();const p=document.createElement('p');p.textContent='Sua prévia aparecerá após a conversão.';$('preview').append(p);
  $('preview-caption').textContent='';$('result-title').textContent='Sua prévia aparece aqui';
  if(!keepReview){prepared=null;resolutionControls.length=0;$('partial-consent').checked=false;
    for(const id of ['review-labels','review-invoices','review-products','review-pages'])$(id).textContent='Não calculado';
    for(const id of ['resolution-summary','partial-label','partial-safety','review-summary'])$(id).textContent='';
    for(const id of ['batch-review','pairing-report','resolution-panel'])$(id).hidden=true;
    for(const id of ['pairing-rows','issues','review-warnings','resolution-items'])$(id).replaceChildren();
    $('issues').hidden=true;
  }
}
function canGenerate(){return inputReady()&&!!prepared&&(prepared.report.ready||prepared.report.partialReady&&$('partial-consent').checked);}
function syncControls(){
  for(const control of resolutionControls)control.disabled=busy;
  for(const id of ['files','invoice-files','clear-invoices','dpi','document-mode','add-invoices','add-labels','retry-reading','use-danfe','remove-duplicates','partial-consent'])$(id).disabled=busy;
  $('size').disabled=busy||!!activeInvoices().length;$('paired-size').hidden=!activeInvoices().length;
  $('paired-size').textContent=$('document-mode').value==='picking'?'Todas as páginas ficam em 10 × 15 cm. Até 4 produtos/variações por ficha, com cor quando informada e quantidade da nota. Descrições extensas podem ocupar mais espaço. Composição de kits permanece na descrição.':'Todas as páginas ficam em 10 × 15 cm, na sequência etiqueta → DANFE completo. O A4 é reduzido por inteiro, com texto menor, e recebe uma cópia maior do código da chave no rodapé.';
  $('check').disabled=busy||!selected.length||!inputReady();$('check').textContent=prepared?'Conferir lote novamente':'1. Conferir lote';
  const partial=prepared&&!prepared.report.ready&&prepared.report.partialReady;
  const caption=partial?`Gerar somente ${prepared.report.confirmedCount} pedido(s) conferido(s)`:'2. Gerar PDF conferido';
  $('convert').disabled=busy||!canGenerate();$('review-generate').disabled=busy||!canGenerate();
  $('convert').textContent=caption;$('review-generate').textContent=partial?caption:'Gerar PDF conferido';
  $('clear-invoices').hidden=!invoiceFiles.length;
  $('download-pending').disabled=busy||!prepared;
  $('review-hint').textContent=prepared?(prepared.report.ready?'Conferência concluída. Revise o resumo antes de gerar.':partial?'Revise as pendências e confirme explicitamente para gerar só os pedidos conferidos.':'Use as ações indicadas para resolver a pendência, sem editar os arquivos originais.'):'Confira os arquivos para liberar a geração do PDF.';
  guide?.update({busy,review:Boolean(prepared),generated:Boolean(url),labels:selected.length,invoices:invoiceFiles.length,ready:canGenerate(),disposed});
}
function showFiles(id,files){
  $(id).replaceChildren();files.forEach((f,index)=>{const li=document.createElement('li'),name=document.createElement('span'),button=document.createElement('button');
    name.textContent=`${f.name} · ${(f.size/1024).toFixed(0)} KB`;button.type='button';button.className='secondary file-remove';button.textContent='Remover da seleção';button.setAttribute('aria-label',`Remover ${f.name} da seleção`);
    button.addEventListener('click',()=>{if(busy||disposed)return;if(id==='file-list')selected=selected.filter((_,i)=>i!==index);else invoiceFiles=invoiceFiles.filter((_,i)=>i!==index);clearResult();refreshFiles();$('status').textContent='Arquivo removido apenas da seleção. O original não foi alterado. Confira o lote novamente.';});
    li.append(name,button);$(id).append(li);
  });
}
function refreshFiles(){showFiles('file-list',selected);showFiles('invoice-list',invoiceFiles);syncControls();}
function selectFiles(files){selected.push(...Array.from(files));$('files').value='';clearResult();refreshFiles();$('status').className='';$('status').textContent=`${selected.length} arquivo(s) de etiquetas na seleção. Você pode adicionar mais ou remover um arquivo abaixo.`;}
function selectInvoices(files){invoiceFiles.push(...Array.from(files));$('invoice-files').value='';clearResult();refreshFiles();$('status').className='';$('status').textContent=`${invoiceFiles.length} PDF(s) de notas na seleção. Os arquivos anteriores foram mantidos. Confira o lote novamente.`;}
$('files').addEventListener('change',e=>{if(!busy)selectFiles(e.target.files);});
$('invoice-files').addEventListener('change',e=>{if(!busy)selectInvoices(e.target.files);});
$('clear-invoices').onclick=()=>{invoiceFiles=[];$('invoice-files').value='';clearResult();refreshFiles();$('status').textContent=guide?.platform==='mercado-livre'?'Notas removidas da seleção. Adicione os DANFEs deste lote para continuar.':'Modo somente etiquetas: notas e produtos não serão conferidos. Confira novamente antes de gerar.';};
for(const event of ['dragover','dragleave','drop'])$('drop').addEventListener(event,e=>{e.preventDefault();$('drop').classList.toggle('drag',event==='dragover');if(event==='drop'&&!busy)selectFiles(e.dataTransfer.files);});
async function preview(){
  const token=++revision,index=page,reader=pdfReader;
  renderTask?.cancel();renderTask=null;
  $('page-count').textContent=`Página ${index+1} de ${sequence.length}`;
  $('previous').disabled=index===0;$('next').disabled=index===sequence.length-1;
  const item=sequence[index];
  $('preview-caption').textContent=item.row?`${item.kind==='label'?'Etiqueta':item.kind==='picking'?'Ficha de separação':'DANFE'} · NF ${item.row.invoice.invoiceNumber} · Envio ${item.row.shipmentId}${item.kind!=='label'&&item.totalSheets>1?` · Folha ${item.sheet}/${item.totalSheets}`:''}`:'Etiqueta';
  try{
    const pdfPage=await reader.getPage(index+1);if(token!==revision)return;
    const natural=pdfPage.getViewport({scale:1}),viewport=pdfPage.getViewport({scale:Math.min(2,900/natural.height)});
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    const task=pdfPage.render({canvasContext:canvas.getContext('2d'),viewport});renderTask=task;
    await task.promise;if(token!==revision||disposed)return;
    $('preview').replaceChildren(canvas);renderTask=null;pdfPage.cleanup();
  }catch(error){
    if(token!==revision||error.name==='RenderingCancelledException')return;
    const p=document.createElement('p');p.textContent='Não foi possível mostrar esta prévia. Use “Abrir para imprimir” para conferir o PDF.';$('preview').replaceChildren(p);
  }
}
// Read-only session metadata for the local workspace UI. No file bytes leave this frame.
window.addEventListener('harmony-labels:workspace-request',()=>{
  if(disposed||!globalThis.HarmonyConverterAccess?.allowed())return;
  const available=Boolean(!busy&&pdfReader&&sequence.length&&!$('navigation').hidden&&!$('actions').hidden);
  const describe=files=>files.map(file=>({name:file.name,size:file.size}));
  window.dispatchEvent(new CustomEvent('harmony-labels:workspace-state',{detail:{
    files:{labels:describe(selected),invoices:describe(invoiceFiles)},busy,
    preview:available?{
      page:page+1,partial:/-PARCIAL-\d+-de-\d+\.pdf$/i.test($('download').download),
      pages:sequence.map((item,index)=>({
        page:index+1,kind:item.kind,invoiceNumber:item.row?.invoice?.invoiceNumber||'',
        shipmentId:item.row?.shipmentId||'',sheet:item.sheet||1,totalSheets:item.totalSheets||1
      }))
    }:null
  }}));
});
window.addEventListener('harmony-labels:preview-page',event=>{
  if(disposed||busy||!globalThis.HarmonyConverterAccess?.allowed()||!pdfReader||!sequence.length||$('navigation').hidden||$('actions').hidden)return;
  const requested=event.detail?.page;
  if(!Number.isInteger(requested)||requested<1||requested>sequence.length)return;
  page=requested-1;preview();
});

$('previous').onclick=()=>{if(page>0){page--;preview();}};
$('next').onclick=()=>{if(page<sequence.length-1){page++;preview();}};
$('open').onclick=()=>{if(globalThis.HarmonyConverterAccess.allowed()&&url)window.open(url,'_blank','noopener');};
for(const id of ['dpi','size','document-mode'])$(id).addEventListener('change',()=>{if(busy||disposed)return;clearResult();$('status').className='';$('status').textContent='Configuração alterada. Confira o lote novamente.';syncControls();});
function showReport(rows,generated=false){
  $('pairing-rows').replaceChildren();const picking=$('document-mode').value==='picking';
  for(const row of rows){const tr=document.createElement('tr'),products=row.invoice.pages.flatMap(p=>p.products||[]);
    const values=[row.shipmentId,`${row.invoice.invoiceNumber} / ${row.invoice.series}`,products.length?products.map(p=>`${p.quantity} ${p.unit} · ${p.description}${p.variation?'':' · Cor/variação não informada'}`).join('; '):'Não extraídos (DANFE completo)',row.invoice.pages.map(p=>`${p.source} · pág. ${p.pageIndex+1}`).join('; '),`${generated?'PDF':'Previsto'}: ${row.labelPage}: etiqueta → ${row.invoiceStart}${row.invoiceEnd!==row.invoiceStart?'–'+row.invoiceEnd:''}: ${picking?'ficha':'DANFE'}`];
    for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('pairing-rows').append(tr);
  }
  $('pairing-summary').textContent=`${rows.length} pedido(s) com vínculo único por NF e CEP${generated?', incluídos neste PDF':'; PDF ainda não gerado'}. Os pedidos pendentes, se houver, permanecem na lista de soluções.`;
  $('pairing-report').hidden=!rows.length;
}
function listMessages(id,messages){$(id).replaceChildren();for(const message of messages){const li=document.createElement('li');li.textContent=message;$(id).append(li);}$(id).hidden=!messages.length;}
function showSolutions(report){
  $('resolution-panel').hidden=report.ready;$('resolution-items').replaceChildren();resolutionControls.length=0;
  $('resolution-summary').textContent=`${report.confirmedCount} de ${report.counts.labels} etiqueta(s) com vínculo conferido · ${report.pendingCount} etiqueta(s) pendente(s) · ${report.unmatchedInvoices.length} nota(s) fora dos pedidos conferidos.`;
  const current=()=>!busy&&!disposed&&globalThis.HarmonyConverterAccess.allowed()&&prepared?.report===report;
  const next=document.createElement('p');next.className='resolution-next-step';
  next.textContent=report.duplicates.length?'Comece pelas cópias idênticas. Depois da remoção da seleção, o lote será conferido novamente.':report.uncertain?'Comece pelos arquivos sem leitura segura. Use a ação do cartão correspondente; nenhuma nota será associada por tentativa.':report.partialReady?'Você pode resolver as pendências abaixo ou escolher, ao final, gerar somente os pedidos já conferidos.':'Cada cartão mostra o próximo passo. Não é necessário editar o documento recebido da plataforma.';
  $('resolution-items').append(next);
  const button=(article,label,handler)=>{const control=document.createElement('button');control.type='button';control.className='secondary resolution-action';control.textContent=label;control.addEventListener('click',()=>{if(current())handler();});resolutionControls.push(control);article.append(control);return control;};
  const card=(title,message,details=[],guidance='')=>{const article=document.createElement('article'),h=document.createElement('h3'),p=document.createElement('p');h.textContent=title;p.textContent=message;article.append(h,p);
    if(guidance){const help=document.createElement('p');help.className='resolution-guidance';help.textContent='Como resolver: '+guidance;article.append(help);}
    for(const text of details){const detail=document.createElement('p');detail.className='resolution-compare';detail.textContent=text;article.append(detail);}$('resolution-items').append(article);return article;};
  const locateFiles=kind=>{const list=$(kind==='labels'?'file-list':'invoice-list');list.tabIndex=-1;list.focus?.();list.scrollIntoView?.({behavior:'smooth',block:'center'});};
  function replacementAction(article,source,kind){
    const files=kind==='labels'?selected:invoiceFiles;
    const matches=files.filter(file=>file.name===source||source.startsWith(file.name+' / '));
    if(matches.length!==1){button(article,'Localizar na seleção',()=>locateFiles(kind));return;}
    const original=matches[0],zip=/\.zip$/i.test(original.name);
    const explanation=document.createElement('p');explanation.className='resolution-replace-note';
    explanation.textContent=(zip?'A troca substitui o ZIP inteiro: ': 'A troca substitui este arquivo inteiro: ')+original.name+'. Os demais arquivos permanecem. Cancelar a escolha mantém a seleção atual; os originais no computador não são apagados.';
    article.append(explanation);
    const input=document.createElement('input');input.type='file';input.accept=kind==='labels'?'.zip,.zpl,.txt':'.pdf,application/pdf';input.hidden=true;article.append(input);
    const notice=document.createElement('p');notice.className='resolution-replace-status';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');article.append(notice);
    button(article,zip?'Substituir este ZIP…':'Substituir este arquivo…',()=>{input.value='';input.click();});
    input.addEventListener('change',()=>{
      const replacement=input.files?.[0];input.value='';if(!replacement||!current())return;
      const activeFiles=kind==='labels'?selected:invoiceFiles,index=activeFiles.indexOf(original);if(index<0)return;
      if(!(kind==='labels'?/\.(zip|zpl|txt)$/i:/\.pdf$/i).test(replacement.name)){notice.textContent=kind==='labels'?'Escolha ZIP, ZPL ou TXT exportado pela plataforma. A seleção anterior foi mantida.':'Escolha o DANFE em PDF. A seleção anterior foi mantida.';return;}
      const updated=activeFiles.map((file,i)=>i===index?replacement:file);
      try{LocalBatchRecovery.guardSize(kind==='labels'?[...updated,...invoiceFiles]:[...selected,...updated]);}
      catch(error){notice.textContent=(error.message||'Não foi possível usar este arquivo.')+' A seleção anterior foi mantida.';return;}
      if(kind==='labels')selected=updated;else invoiceFiles=updated;
      clearResult();refreshFiles();$('status').className='';$('status').textContent='Arquivo substituído somente na seleção. Conferindo o lote novamente, sem alterar os originais…';
      checkBatch();
    });
  }
  const guidance={
    missing:'Baixe o DANFE deste pedido na plataforma e adicione-o ao lote. Se já estiver selecionado, tente a leitura alternativa.',
    products:'Tente a leitura alternativa. Se a tabela continuar incompatível, você pode escolher DANFE completo; essa escolha troca o formato de TODOS os pedidos deste lote, não apenas desta nota.',
    metadata:'Obtenha o ZPL original que contenha NF, CEP e envio em texto. Troque o arquivo abaixo; o sistema não inventará esses campos.',
    'duplicate-label':'Se houver cópias idênticas indicadas, remova-as pelo botão próprio. Caso contrário, obtenha um lote sem repetir o envio e substitua o arquivo.',
    volumes:'Confira os volumes na plataforma e exporte o conjunto correto. A central não escolherá uma etiqueta no lugar de outra.',
    'invoice-read':'Localize abaixo o cartão da nota com problema. Substitua o PDF pelo original completo ou tente a leitura alternativa.',
    ambiguous:'Compare série, emitente e origem abaixo. Em arquivos separados, remova apenas o que não pertence ao lote. Se as lojas estiverem no mesmo PDF, exporte novamente o lote da loja correta.',
    mismatch:'Compare os CEPs abaixo e obtenha os documentos do mesmo pedido na plataforma. Troque o arquivo incorreto; não altere o CEP para fazer a conferência passar.'
  };
  for(const item of report.items.filter(i=>!i.ready)){
    const article=card(`Etiqueta ${item.labelIndex+1}${item.shipmentId?' · Envio '+item.shipmentId:''}${item.invoiceNumber?' · NF '+item.invoiceNumber:''}`,item.message,[`Etiqueta: CEP ${item.labelPostcode||'não identificado'} · ${item.source}`,...(item.candidates||[]).map(n=>`Nota: NF ${n.number} · série ${n.series} · emitente ${n.issuer} · CEP ${n.postcode||'não identificado'} · ${n.source}`)],guidance[item.code]||'Confira a origem dos documentos e use os arquivos do mesmo pedido.');
    if(item.code==='missing')button(article,'Adicionar o DANFE faltante',()=>$('invoice-files').click());
    if(['missing','products','invoice-read'].includes(item.code))button(article,'Tentar leitura alternativa',()=>checkBatch(true));
    if(item.code==='products')button(article,'Usar DANFE completo neste lote',()=>{$('document-mode').value='danfe';checkBatch(true);});
    if(['metadata','duplicate-label','volumes','mismatch'].includes(item.code))replacementAction(article,item.source,'labels');
    if(['ambiguous','mismatch','invoice-read'].includes(item.code))button(article,'Localizar os PDFs selecionados',()=>locateFiles('invoices'));
  }
  for(const p of report.invoiceProblems){
    const article=card(`${p.source}${p.page?' · página '+p.page:''}`,p.message,['O documento original não foi alterado.'],p.code==='sheets'?'Baixe novamente a nota completa, com todas as folhas, e substitua o PDF abaixo. A troca mantém os demais arquivos do lote.':'Tente a leitura alternativa ou substitua pelo DANFE original, pesquisável e sem senha, exportado pela plataforma. PDF digitalizado não recebe OCR nesta ferramenta.');
    button(article,'Tentar leitura alternativa',()=>checkBatch(true));replacementAction(article,p.source,'invoices');
  }
  for(const p of report.sourceProblems){const article=card(p.source,p.message,[],'Baixe novamente as etiquetas em ZIP, ZPL ou TXT na plataforma e substitua o arquivo. Renomear um PDF não o transforma em ZPL.');replacementAction(article,p.fileName||p.source,'labels');}
  for(const duplicate of report.duplicates){const article=card('Cópia idêntica encontrada',`${duplicate.name} tem o mesmo conteúdo de ${duplicate.original}. A remoção mantém a primeira cópia e não apaga arquivos do computador.`,[],'Remova as cópias idênticas já identificadas. Essa ação vale para todas as cópias idênticas deste lote e faz uma nova conferência.');button(article,'Remover cópias idênticas do lote',()=>$('remove-duplicates').click());}
  for(const invoice of report.unmatchedInvoices.filter(n=>!report.items.some(i=>!i.ready&&i.invoiceNumber===n.invoiceNumber))){const article=card(`NF ${invoice.invoiceNumber} · série ${invoice.series}`,'Esta nota não tem etiqueta entre os pedidos conferidos.',invoice.pages.map(p=>`${p.source} · página ${p.pageIndex+1}`),'Adicione as etiquetas correspondentes. Se a nota não pertence a este lote, localize o arquivo na seleção; se houver outros pedidos no mesmo PDF, não remova o arquivo sem conferir.');button(article,'Adicionar etiquetas deste pedido',()=>$('files').click());button(article,'Localizar o PDF selecionado',()=>locateFiles('invoices'));}
  $('remove-duplicates').hidden=!report.duplicates.length;$('use-danfe').hidden=report.mode!=='picking'||!report.items.some(i=>i.code==='products');
  $('retry-reading').hidden=!report.invoiceProblems.length&&!report.items.some(i=>['products','invoice-read','missing'].includes(i.code));
  $('partial-choice').hidden=!report.partialReady;
  $('partial-label').textContent=`Quero gerar somente ${report.confirmedCount} de ${report.counts.labels} etiqueta(s) conferida(s), em ${report.subset?.report.counts.pages||0} página(s). As pendências listadas não entrarão neste PDF.`;
  $('partial-safety').textContent=report.uncertain?'Ainda há páginas de notas sem identificação segura. Não podemos garantir quais pedidos elas afetam. Tente outra leitura ou selecione novamente o arquivo indicado antes de liberar um PDF vinculado.':report.partialReady?'Você decide se quer continuar agora. O PDF será identificado como parcial e a lista de pendências continuará disponível.':'Nenhum vínculo será forçado. Use as ações acima e confira novamente.';
}
function showReview(report){
  $('batch-review').hidden=false;
  $('review-state').textContent=report.ready?'LOTE CONFERIDO':report.partialReady?'PARTE DO LOTE CONFERIDA':'AÇÃO NECESSÁRIA';
  $('review-summary').textContent=report.ready?(report.paired?'Vínculos por NF e CEP conferidos. Revise os avisos antes de gerar.':guide?.platform==='shopee'?'Conteúdo do ZPL da Shopee preservado. Confira na prévia se a lista de empacotamento veio no arquivo; produtos não foram extraídos nem conferidos por DANFE.':'Modo somente etiquetas. Notas e produtos não foram conferidos.'):'Veja as soluções abaixo. Você não precisa editar a nota ou a etiqueta recebida da plataforma.';
  for(const [name,value] of Object.entries(report.counts))$('review-'+name).textContent=value===null?(name==='products'&&!report.paired?'Não se aplica':'Não calculado'):String(value);
  listMessages('issues',report.issues);listMessages('review-warnings',report.warnings);
  $('review-issues-title').hidden=!report.issues.length;$('review-warnings-title').hidden=!report.warnings.length;
  showSolutions(report);showReport(report.rows);syncControls();
  const target=$(report.ready?'batch-review':'resolution-panel');target.focus?.();target.scrollIntoView?.({behavior:'smooth',block:'start'});
}
async function checkBatch(alternative=false){
  if(busy||disposed||!selected.length||!inputReady()||!globalThis.HarmonyConverterAccess.allowed())return;
  clearResult();busy=true;syncControls();$('status').className='';$('progress').hidden=false;$('progress').value=0;
  try{
    if(!globalThis.DecompressionStream||!globalThis.CompressionStream)throw Error('Abra esta página no Chrome ou Edge atualizado.');
    LocalBatchRecovery.guardSize([...selected,...invoiceFiles]);
    $('status').textContent='Identificando cópias idênticas, sem enviar os arquivos…';
    const duplicates=await LocalBatchRecovery.duplicateFiles(selected,activeInvoices(),ensureActive);ensureActive();
    const batch=[],ignored=[],sourceProblems=[];let textSize=0;
    for(let i=0;i<selected.length;i++){
      const f=selected[i];let entries;
      try{
        $('status').textContent=`Lendo etiquetas ${i+1} de ${selected.length}…`;
        if(/\.zip$/i.test(f.name))entries=await LocalZpl.unzip(new Uint8Array(await f.arrayBuffer()));
        else if(/\.(zpl|txt)$/i.test(f.name))entries=[{name:f.name,text:await f.text()}];
        else throw Error('Selecione ZIP, ZPL ou TXT exportado pela plataforma. Não renomeie um PDF para ZPL.');
        ensureActive();ignored.push(...(entries.ignoredFiles||[]));
      }catch(error){ensureActive();sourceProblems.push({source:f.name,fileName:f.name,message:error.message});continue;}
      for(const entry of entries){
        textSize+=entry.text.length;if(textSize>100*1024*1024)throw Error('O lote ZPL descomprimido ultrapassa 100 MB. Selecione um lote menor.');
        try{
          const parsed=await LocalZpl.parseZpl(entry.text,{onProgress:(n,total)=>{ensureActive();$('progress').value=n/total;}});ensureActive();
          if(batch.length+parsed.length>1000)throw Object.assign(Error('Limite de 1.000 etiquetas excedido. Selecione um lote menor.'),{fatal:true});
          batch.push(...parsed.map(label=>({...label,source:f.name===entry.name?f.name:f.name+' / '+entry.name})));
        }catch(error){ensureActive();if(error.fatal)throw error;sourceProblems.push({source:f.name===entry.name?f.name:f.name+' / '+entry.name,fileName:f.name,message:error.message});}
      }
    }
    const read=activeInvoices().length?await LocalBatchRecovery.readInvoices(activeInvoices(),(file,total,n,pages)=>{ensureActive();$('status').textContent=`Conferindo notas: PDF ${file} de ${total}, página ${n} de ${pages}…`;$('progress').value=((file-1)+n/pages)/total;},{active:ensureActive,alternative}):null;
    ensureActive();const mode=$('document-mode').value,report=await LocalBatchRecovery.analyze(batch,read,{mode,ignored,duplicates,sourceProblems});ensureActive();
    prepared={batch,read,report,mode,dpi:Number($('dpi').value),size:$('size').value};showReview(report);
    $('status').textContent=report.ready?'Lote conferido. Revise o resumo e gere o PDF.':report.partialReady?'Há pedidos prontos e pendências separadas. Você pode resolver tudo ou autorizar somente os conferidos.':'A conferência encontrou uma situação que precisa de ação. Veja a solução indicada abaixo.';
  }catch(error){if(disposed)return;clearResult();$('status').className='error';$('status').textContent=(error.message||'Não foi possível conferir o lote.')+' Os originais não foram alterados. Remova da seleção o arquivo indicado, adicione o original da plataforma ou tente um lote menor.';}
  finally{busy=false;if(!disposed){syncControls();$('progress').hidden=true;}}
}
$('check').onclick=()=>checkBatch();
$('add-invoices').onclick=()=>{if(!busy)$('invoice-files').click();};
$('add-labels').onclick=()=>{if(!busy)$('files').click();};
$('retry-reading').onclick=()=>checkBatch(true);
$('use-danfe').onclick=()=>{if(busy)return;$('document-mode').value='danfe';return checkBatch(true);};
$('partial-consent').addEventListener('change',syncControls);
$('remove-duplicates').onclick=()=>{if(busy||!prepared)return;const duplicates=prepared.report.duplicates;
  selected=selected.filter((_,index)=>!duplicates.some(d=>d.kind==='labels'&&d.index===index));invoiceFiles=invoiceFiles.filter((_,index)=>!duplicates.some(d=>d.kind==='invoices'&&d.index===index));
  clearResult();refreshFiles();$('status').textContent='Cópias idênticas removidas apenas da seleção. Os arquivos originais foram preservados.';return checkBatch();};
$('download-pending').onclick=()=>{if(busy||!prepared||!globalThis.HarmonyConverterAccess.allowed())return;const objectUrl=URL.createObjectURL(new Blob([LocalBatchRecovery.pendingText(prepared.report)],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=objectUrl;a.download='pendencias-do-lote.txt';a.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);};
async function generate(){
  if(busy||disposed||!globalThis.HarmonyConverterAccess.allowed()||!canGenerate())return;
  const snapshot=prepared,partial=!snapshot.report.ready;
  const batch=partial?snapshot.report.subset.labels:snapshot.batch,read=partial?snapshot.report.subset.read:snapshot.read;
  busy=true;clearResult(true);syncControls();$('progress').hidden=false;
  try{
    // Recheck the exact chosen subset at the composition boundary. The printed
    // picking layout and the authoritative invoice matching remain unchanged.
    const checked=await LocalBatchReview.inspect(batch,read,{mode:snapshot.mode});ensureActive();
    if(!checked.ready)throw Error('A conferência mudou. Confira o lote novamente antes de gerar.');
    const progress=(n,total)=>{ensureActive();$('progress').value=n/total;$('status').textContent=`Preparando PDF: ${n} de ${total} páginas…`;};
    let pdf,rows=null;
    if(read){const result=await LocalInvoices.createPairedPdf(batch,read,checked.rows,snapshot.dpi,progress,snapshot.mode);ensureActive();pdf=result.blob;sequence=result.sequence;rows=result.rows;}
    else{pdf=await LocalZpl.createPdf(batch,snapshot.dpi,snapshot.size,progress);ensureActive();sequence=batch.map(()=>({kind:'label'}));}
    const opened=await LocalInvoices.openPdf(new Uint8Array(await pdf.arrayBuffer()));
    if(disposed||!globalThis.HarmonyConverterAccess.allowed()){await opened.destroy();return;}
    pdfReader=opened;url=URL.createObjectURL(pdf);$('download').href=url;
    const base=read?(snapshot.mode==='picking'?'etiquetas-e-fichas-de-separacao':'etiquetas-e-notas-vinculadas'):'etiquetas-para-impressao';
    $('download').download=base+(partial?`-PARCIAL-${batch.length}-de-${snapshot.batch.length}`:'')+'.pdf';
    $('actions').hidden=false;$('navigation').hidden=false;$('result-title').textContent=`${partial?'PDF parcial · ':''}${sequence.length} páginas prontas`;
    if(rows)showReport(rows,true);await preview();ensureActive();
    $('review-state').textContent=partial?'PDF PARCIAL GERADO':'PDF GERADO';
    $('review-summary').textContent=partial?`${batch.length} de ${snapshot.batch.length} etiqueta(s) incluída(s). As pendências continuam na lista de soluções e NÃO estão neste PDF.`:'PDF disponível. Confira a prévia e a primeira etiqueta na impressora. Gerar ou baixar não confirma impressão física.';
    $('status').textContent=`${partial?'PDF PARCIAL':'PDF'} pronto · ${batch.length} etiqueta(s) · ${sequence.length} páginas. ${partial?'As pendências listadas não foram incluídas. ':''}Nenhum dado enviado; impressão física não confirmada.`;
  }catch(error){if(disposed)return;clearResult();$('status').className='error';$('status').textContent=error.message||'Não foi possível gerar. Confira o lote novamente; os originais foram preservados.';}
  finally{busy=false;if(!disposed){syncControls();$('progress').hidden=true;}}
}
$('convert').onclick=generate;$('review-generate').onclick=generate;

syncControls();

window.HarmonyConverterLifecycle=Object.freeze({dispose(){if(disposed)return;disposed=true;selected=[];invoiceFiles=[];clearResult();showFiles('file-list',[]);showFiles('invoice-list',[]);for(const id of ["files","invoice-files"]){$(id).value="";}busy=false;syncControls();}});
window.addEventListener("pagehide",()=>window.HarmonyConverterLifecycle.dispose(),{once:true});
})();
