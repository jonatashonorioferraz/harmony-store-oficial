(function(){
'use strict';
if(!globalThis.HarmonyConverterAccess?.allowed())return;
const $=id=>document.getElementById(id);
let selected=[],invoiceFiles=[],sequence=[],page=0,url=null,pdfReader=null,renderTask=null,revision=0,busy=false,disposed=false,prepared=null,inputRevision=0;
function ensureActive(){if(disposed||!globalThis.HarmonyConverterAccess.allowed())throw Error('Conversão encerrada.');}
function clearOutput(){
  revision++;renderTask?.cancel();renderTask=null;
  if(pdfReader){pdfReader.destroy().catch(()=>{});pdfReader=null;}
  sequence=[];page=0;if(url)URL.revokeObjectURL(url);url=null;
  $('actions').hidden=true;$('download').removeAttribute('href');$('navigation').hidden=true;
  $('preview').replaceChildren();const p=document.createElement('p');p.textContent='Sua prévia aparecerá após a conversão.';$('preview').append(p);
  $('preview-caption').textContent='';$('result-title').textContent='Sua prévia aparece aqui';
}
function clearResult(){
  inputRevision++;prepared=null;clearOutput();
  $('batch-review').hidden=true;$('pairing-report').hidden=true;$('pairing-rows').replaceChildren();
  for(const id of ['issues','review-warnings']){$(id).hidden=true;$(id).replaceChildren();}
  for(const id of ['review-labels','review-invoices','review-products','review-pages','review-summary','review-badge'])$(id).textContent='';
}
function syncControls(){
  for(const id of ['files','invoice-files','clear-invoices','dpi','document-mode'])$(id).disabled=busy||disposed;
  $('size').disabled=busy||disposed||!!invoiceFiles.length;$('paired-size').hidden=!invoiceFiles.length;
  $('paired-size').textContent=$('document-mode').value==='picking'?'Todas as páginas ficam em 10 × 15 cm. Até 4 produtos/variações por ficha, com cor quando informada e quantidade da nota. Descrições extensas podem ocupar mais espaço. Composição de kits permanece na descrição.':'Todas as páginas ficam em 10 × 15 cm, na sequência etiqueta → DANFE completo. O A4 é reduzido por inteiro, com texto menor, e recebe uma cópia maior do código da chave no rodapé.';
  $('check').disabled=busy||disposed||!selected.length;
  $('check').textContent=prepared?'Conferir lote novamente':'1. Conferir lote';
  for(const id of ['convert','review-generate'])$(id).disabled=busy||disposed||!prepared?.report.ready;
  $('clear-invoices').hidden=!invoiceFiles.length;
  $('convert').textContent='2. Gerar PDF conferido';
  $('check-hint').textContent=prepared?'Conferência concluída. Revise o resumo antes de gerar.':'Confira os arquivos para liberar a geração do PDF.';
}
function showFiles(id,files){
  $(id).replaceChildren();for(const f of files){const li=document.createElement('li');li.textContent=`${f.name} · ${(f.size/1024).toFixed(0)} KB`;$(id).append(li);}
}
function selectFiles(files){
  if(busy||disposed)return;
  selected=Array.from(files);clearResult();showFiles('file-list',selected);syncControls();
  $('status').className='';$('status').textContent=selected.length?`${selected.length} arquivo(s) de etiquetas selecionado(s).`:'Selecione os arquivos para começar.';
}
function selectInvoices(files){
  if(busy||disposed)return;
  invoiceFiles=Array.from(files);clearResult();showFiles('invoice-list',invoiceFiles);syncControls();
  $('status').className='';$('status').textContent=invoiceFiles.length?`${invoiceFiles.length} PDF(s) de notas selecionado(s). Clique em “Conferir lote” para verificar os vínculos.`:'Modo somente etiquetas. Confira o lote novamente.';
}
$('files').addEventListener('change',e=>selectFiles(e.target.files));
$('invoice-files').addEventListener('change',e=>selectInvoices(e.target.files));
$('clear-invoices').onclick=()=>{$('invoice-files').value='';selectInvoices([]);};
for(const event of ['dragover','dragleave','drop'])$('drop').addEventListener(event,e=>{
  e.preventDefault();$('drop').classList.toggle('drag',event==='dragover');if(event==='drop'&&!busy)selectFiles(e.dataTransfer.files);
});
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
$('previous').onclick=()=>{if(page>0){page--;preview();}};
$('next').onclick=()=>{if(page<sequence.length-1){page++;preview();}};
$('open').onclick=()=>{if(globalThis.HarmonyConverterAccess.allowed()&&url)window.open(url,'_blank','noopener');};
for(const id of ['dpi','size','document-mode'])$(id).addEventListener('change',()=>{if(busy||disposed)return;clearResult();$('status').className='';$('status').textContent='Configuração alterada. Confira o lote novamente.';syncControls();});
function showReport(rows,generated=false){
  const picking=$('document-mode').value==='picking';
  $('pairing-rows').replaceChildren();
  for(const row of rows){
    const tr=document.createElement('tr');
    const source=row.invoice.pages.map(ref=>`${ref.source} · pág. ${ref.pageIndex+1}`).join('; ');
    const target=`${generated?'PDF':'Previsto'}: ${row.labelPage}: etiqueta → ${row.invoiceStart}${row.invoiceEnd!==row.invoiceStart?'–'+row.invoiceEnd:''}: ${picking?'ficha':'DANFE'}`;
    const products=row.invoice.pages.flatMap(p=>p.products||[]);
    const productText=products.length?products.map(p=>`${p.quantity} ${p.unit} · ${p.description}${p.variation?'':' · Cor/variação não informada'}`).join('; '):'Não extraídos (DANFE completo)';
    for(const value of [row.shipmentId,`${row.invoice.invoiceNumber} / ${row.invoice.series}`,productText,source,target]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
    $('pairing-rows').append(tr);
  }
  $('pairing-summary').textContent=`${rows.length} envio(s) com correspondência única. ${generated?'Todas as notas selecionadas foram incluídas no PDF.':'Todas as notas selecionadas têm vínculo único; o PDF ainda não foi gerado.'} Confirmação por número da nota e CEP do destinatário.`;
  $('pairing-report').hidden=false;
}
function showReview(report){
  $('batch-review').hidden=false;
  $('batch-review').setAttribute('data-state',report.ready?'ready':'blocked');
  $('review-badge').textContent=report.ready?'LOTE CONFERIDO':'REVISÃO NECESSÁRIA';
  for(const key of ['labels','invoices','products','pages'])$('review-'+key).textContent=report.counts[key]===null?'Não calculado':String(report.counts[key]);
  $('review-products').textContent=!report.paired?'Não se aplica':$('review-products').textContent;
  $('review-summary').textContent=report.ready
    ?(report.paired?'Vínculos por NF e CEP conferidos. Revise os avisos e os detalhes abaixo antes de gerar o PDF.':'Modo somente etiquetas. As notas e os produtos não foram conferidos. O PDF ainda não foi gerado.')
    :'Nenhum PDF parcial será liberado. Corrija as pendências e confira o lote novamente.';
  for(const [id,messages] of [['issues',report.issues],['review-warnings',report.warnings]]){
    $(id).replaceChildren();$(id).hidden=!messages.length;
    for(const message of messages){const li=document.createElement('li');li.textContent=message;$(id).append(li);}
  }
  $('review-issues-title').hidden=!report.issues.length;
  $('review-warnings-title').hidden=!report.warnings.length;
  $('pairing-report').hidden=true;$('pairing-rows').replaceChildren();
  if(report.ready&&report.paired)showReport(report.rows);
}
function failedReview(error){
  return {ready:false,paired:!!invoiceFiles.length,rows:[],
    counts:{labels:null,invoices:invoiceFiles.length?null:0,products:null,pages:null},
    issues:error.issues?.length?error.issues:[error.message||'Não foi possível conferir o lote.'],warnings:[]};
}
function ensureSnapshot(token){ensureActive();if(token!==inputRevision)throw Error('O lote mudou. Confira os arquivos novamente.');}
$('check').onclick=async()=>{
  if(busy||disposed||!globalThis.HarmonyConverterAccess.allowed()||!selected.length)return;
  clearResult();const token=inputRevision;busy=true;syncControls();
  $('status').className='';$('progress').hidden=false;$('progress').value=0;
  try{
    if(!globalThis.DecompressionStream||!globalThis.CompressionStream)throw Error('Abra esta página no Chrome ou Edge atualizado.');
    if([...selected,...invoiceFiles].reduce((s,f)=>s+f.size,0)>100*1024*1024)throw Error('Os arquivos do lote devem somar no máximo 100 MB.');
    const batch=[],ignored=[];let textSize=0;
    for(let i=0;i<selected.length;i++){
      const f=selected[i];$('status').textContent=`Lendo arquivo de etiquetas ${i+1} de ${selected.length}…`;
      let entries;
      if(/\.zip$/i.test(f.name))entries=await LocalZpl.unzip(new Uint8Array(await f.arrayBuffer()));
      else if(/\.(zpl|txt)$/i.test(f.name))entries=[{name:f.name,text:await f.text()}];
      else throw Error('No campo de etiquetas, selecione apenas ZIP, ZPL ou TXT com conteúdo ZPL.');
      ensureSnapshot(token);ignored.push(...(entries.ignoredFiles||[]));
      for(const entry of entries){
        textSize+=entry.text.length;if(textSize>100*1024*1024)throw Error('O lote ZPL descomprimido ultrapassa 100 MB.');
        try{
          const parsed=await LocalZpl.parseZpl(entry.text,{onProgress:(n,total)=>{ensureSnapshot(token);$('status').textContent=`Conferindo etiquetas: ${n} de ${total}…`;$('progress').value=n/total;}});
          ensureSnapshot(token);
          if(batch.length+parsed.length>1000)throw Error('Limite de 1.000 páginas excedido.');batch.push(...parsed);
        }catch(error){throw Error(`${entry.name}: ${error.message}`);}
      }
    }
    let read=null;
    if(invoiceFiles.length){
      read=await LocalInvoices.readInvoices(invoiceFiles,(file,total,n,pages)=>{
        ensureSnapshot(token);$('status').textContent=`Conferindo notas: PDF ${file} de ${total}, página ${n} de ${pages}…`;
        $('progress').value=((file-1)+n/pages)/total;
      });
      ensureSnapshot(token);
    }
    const mode=$('document-mode').value,dpi=Number($('dpi').value),size=$('size').value;
    $('status').textContent='Conferindo vínculos e calculando as páginas…';
    const report=await LocalBatchReview.inspect(batch,read,{mode,ignored});ensureSnapshot(token);
    prepared=report.ready?{batch,read,report,mode,dpi,size}:null;
    showReview(report);
    $('status').className=report.ready?'':'error';
    $('status').textContent=report.ready?'Lote conferido. Revise o resumo e clique em “Gerar PDF conferido”. Nenhum PDF foi gerado ainda.':'O lote precisa de revisão. Veja as pendências abaixo; nenhum PDF foi gerado.';
    $('batch-review').focus({preventScroll:true});$('batch-review').scrollIntoView({block:'nearest'});
  }catch(error){
    if(disposed||token!==inputRevision)return;
    prepared=null;showReview(failedReview(error));$('status').className='error';$('status').textContent='Não foi possível concluir a conferência. Veja as pendências abaixo.';
  }finally{busy=false;if(!disposed){syncControls();$('progress').hidden=true;}}
};
async function generateReviewed(){
  if(busy||disposed||!globalThis.HarmonyConverterAccess.allowed()||!prepared?.report.ready)return;
  const checked=prepared,token=inputRevision;clearOutput();busy=true;syncControls();
  $('status').className='';$('progress').hidden=false;$('progress').value=0;
  try{
    const progress=(n,total)=>{ensureSnapshot(token);$('progress').value=n/total;$('status').textContent=`Preparando PDF: ${n} de ${total} páginas…`;};
    let pdf,rows=null;
    if(checked.read){
      // Composition repeats the authoritative matching and pagination checks.
      const result=await LocalInvoices.createPairedPdf(checked.batch,checked.read,checked.report.rows,checked.dpi,progress,checked.mode);
      rows=result.rows;pdf=result.blob;sequence=result.sequence;
    }else{
      pdf=await LocalZpl.createPdf(checked.batch,checked.dpi,checked.size,progress);sequence=checked.batch.map(()=>({kind:'label'}));
    }
    ensureSnapshot(token);
    const opened=await LocalInvoices.openPdf(new Uint8Array(await pdf.arrayBuffer()));
    if(disposed||token!==inputRevision||!globalThis.HarmonyConverterAccess.allowed()){await opened.destroy();return;}
    pdfReader=opened;
    url=URL.createObjectURL(pdf);$('download').href=url;$('download').download=rows?(checked.mode==='picking'?'etiquetas-e-fichas-de-separacao.pdf':'etiquetas-e-notas-vinculadas.pdf'):'etiquetas-para-impressao.pdf';
    $('actions').hidden=false;$('navigation').hidden=false;$('result-title').textContent=`${sequence.length} páginas prontas`;
    if(rows)showReport(rows,true);await preview();ensureSnapshot(token);
    $('review-badge').textContent='PDF GERADO';
    $('review-summary').textContent='PDF disponível. Confira a prévia e a primeira etiqueta na impressora. Gerar ou baixar o arquivo não confirma a impressão física.';
    const d=LocalZpl.dimensions(checked.batch[0],checked.dpi,rows?'100x150':checked.size);
    $('status').textContent=`PDF pronto · ${rows?rows.length+' envios vinculados · ':''}${sequence.length} páginas · ${rows?'10 × 15 cm em todas as páginas':'primeira página '+(d.pw/72*25.4).toFixed(1)+' × '+(d.ph/72*25.4).toFixed(1)+' mm'}. Nenhum dado enviado.`;
  }catch(error){
    if(disposed||token!==inputRevision)return;
    clearResult();showReview(failedReview(error));$('status').className='error';$('status').textContent='O PDF não foi concluído. Corrija a pendência e confira o lote novamente.';
  }finally{busy=false;if(!disposed){syncControls();$('progress').hidden=true;}}
}
$('convert').onclick=generateReviewed;
$('review-generate').onclick=generateReviewed;

syncControls();

window.HarmonyConverterLifecycle=Object.freeze({dispose(){if(disposed)return;disposed=true;selected=[];invoiceFiles=[];clearResult();showFiles('file-list',[]);showFiles('invoice-list',[]);for(const id of ["files","invoice-files"]){$(id).value="";}busy=false;syncControls();}});
window.addEventListener("pagehide",()=>window.HarmonyConverterLifecycle.dispose(),{once:true});
})();
