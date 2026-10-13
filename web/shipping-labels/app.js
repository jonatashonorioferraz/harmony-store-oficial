(function(){
'use strict';
if(!globalThis.HarmonyConverterAccess?.allowed())return;
const $=id=>document.getElementById(id);
let selected=[],invoiceFiles=[],sequence=[],page=0,url=null,pdfReader=null,renderTask=null,revision=0,busy=false,disposed=false;
function ensureActive(){if(disposed||!globalThis.HarmonyConverterAccess.allowed())throw Error('Conversão encerrada.');}
function clearResult(){
  revision++;renderTask?.cancel();renderTask=null;
  if(pdfReader){pdfReader.destroy().catch(()=>{});pdfReader=null;}
  sequence=[];page=0;if(url)URL.revokeObjectURL(url);url=null;
  $('actions').hidden=true;$('download').removeAttribute('href');$('navigation').hidden=true;
  $('pairing-report').hidden=true;$('pairing-rows').replaceChildren();$('issues').hidden=true;$('issues').replaceChildren();
  $('preview').replaceChildren();const p=document.createElement('p');p.textContent='Sua prévia aparecerá após a conversão.';$('preview').append(p);
  $('preview-caption').textContent='';$('result-title').textContent='Sua prévia aparece aqui';
}
function syncControls(){
  for(const id of ['files','invoice-files','clear-invoices','dpi','document-mode'])$(id).disabled=busy;
  $('size').disabled=busy||!!invoiceFiles.length;$('paired-size').hidden=!invoiceFiles.length;
  $('paired-size').textContent=$('document-mode').value==='picking'?'Todas as páginas ficam em 10 × 15 cm. A ficha destaca os produtos, a cor/variação quando informada e a quantidade comercial da nota. Composição de kits permanece na descrição.':'Todas as páginas ficam em 10 × 15 cm, na sequência etiqueta → DANFE completo. O A4 é reduzido por inteiro, com texto menor, e recebe uma cópia maior do código da chave no rodapé.';
  $('convert').disabled=busy||!selected.length;$('clear-invoices').hidden=!invoiceFiles.length;
  $('convert').textContent=invoiceFiles.length?'Vincular notas e gerar PDF →':'Gerar PDF para impressão →';
}
function showFiles(id,files){
  $(id).replaceChildren();for(const f of files){const li=document.createElement('li');li.textContent=`${f.name} · ${(f.size/1024).toFixed(0)} KB`;$(id).append(li);}
}
function selectFiles(files){
  selected=Array.from(files);clearResult();showFiles('file-list',selected);syncControls();
  $('status').className='';$('status').textContent=selected.length?`${selected.length} arquivo(s) de etiquetas selecionado(s).`:'Selecione os arquivos para começar.';
}
function selectInvoices(files){
  invoiceFiles=Array.from(files);clearResult();showFiles('invoice-list',invoiceFiles);syncControls();
  $('status').className='';$('status').textContent=invoiceFiles.length?`${invoiceFiles.length} PDF(s) de notas selecionado(s). Gere o PDF para conferir os vínculos.`:'Modo somente etiquetas. Gere o PDF novamente.';
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
for(const id of ['dpi','size','document-mode'])$(id).addEventListener('change',()=>{clearResult();$('status').className='';$('status').textContent='Configuração alterada. Gere o PDF novamente.';syncControls();});
function showReport(rows){
  const picking=$('document-mode').value==='picking';
  $('pairing-rows').replaceChildren();
  for(const row of rows){
    const tr=document.createElement('tr');
    const source=row.invoice.pages.map(ref=>`${ref.source} · pág. ${ref.pageIndex+1}`).join('; ');
    const target=`${row.labelPage}: etiqueta → ${row.invoiceStart}${row.invoiceEnd!==row.invoiceStart?'–'+row.invoiceEnd:''}: ${picking?'ficha':'DANFE'}`;
    const products=row.invoice.pages.flatMap(p=>p.products||[]);
    const productText=products.length?products.map(p=>`${p.quantity} ${p.unit} · ${p.description}${p.variation?'':' · Cor/variação não informada'}`).join('; '):'Não extraídos (DANFE completo)';
    for(const value of [row.shipmentId,`${row.invoice.invoiceNumber} / ${row.invoice.series}`,productText,source,target]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
    $('pairing-rows').append(tr);
  }
  $('pairing-summary').textContent=`${rows.length} envio(s) com correspondência única. Todas as notas selecionadas foram incluídas. Confirmação por número da nota e CEP do destinatário.`;
  $('pairing-report').hidden=false;
}
$('convert').onclick=async()=>{
  if(disposed||!globalThis.HarmonyConverterAccess.allowed())return;
  clearResult();busy=true;syncControls();$('status').className='';$('progress').hidden=false;$('progress').value=0;
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
      ensureActive();
      ignored.push(...(entries.ignoredFiles||[]));
      for(const entry of entries){
        textSize+=entry.text.length;if(textSize>100*1024*1024)throw Error('O lote ZPL descomprimido ultrapassa 100 MB.');
        try{
          const parsed=await LocalZpl.parseZpl(entry.text,{onProgress:(n,total)=>{ensureActive();$('status').textContent=`Renderizando etiquetas: ${n} de ${total}…`;$('progress').value=n/total;}});
          ensureActive();
          if(batch.length+parsed.length>1000)throw Error('Limite de 1.000 páginas excedido.');batch.push(...parsed);
        }catch(error){throw Error(`${entry.name}: ${error.message}`);}
      }
    }
    const dpi=Number($('dpi').value);let pdf,rows=null;
    const progress=(n,total)=>{ensureActive();$('progress').value=n/total;$('status').textContent=`Preparando PDF: ${n} de ${total} páginas…`;};
    if(invoiceFiles.length){
      const read=await LocalInvoices.readInvoices(invoiceFiles,(file,total,n,pages)=>{
        ensureActive();
        $('status').textContent=`Conferindo notas: PDF ${file} de ${total}, página ${n} de ${pages}…`;$('progress').value=((file-1)+n/pages)/total;
      });
      ensureActive();
      rows=LocalInvoices.pair(batch,read.invoices);
      const result=await LocalInvoices.createPairedPdf(batch,read,rows,dpi,progress,$('document-mode').value);
      rows=result.rows;
      pdf=result.blob;sequence=result.sequence;
    }else{
      pdf=await LocalZpl.createPdf(batch,dpi,$('size').value,progress);sequence=batch.map(()=>({kind:'label'}));
    }
    ensureActive();
    const opened=await LocalInvoices.openPdf(new Uint8Array(await pdf.arrayBuffer()));
    if(disposed||!globalThis.HarmonyConverterAccess.allowed()){await opened.destroy();return;}
    pdfReader=opened;
    url=URL.createObjectURL(pdf);$('download').href=url;$('download').download=rows?($('document-mode').value==='picking'?'etiquetas-e-fichas-de-separacao.pdf':'etiquetas-e-notas-vinculadas.pdf'):'etiquetas-para-impressao.pdf';
    $('actions').hidden=false;$('navigation').hidden=false;$('result-title').textContent=`${sequence.length} páginas prontas`;
    if(rows)showReport(rows);await preview();ensureActive();
    const d=LocalZpl.dimensions(batch[0],dpi,rows?'100x150':$('size').value);
    $('status').textContent=`PDF pronto · ${rows?rows.length+' envios vinculados · ':''}${sequence.length} páginas · ${rows?'10 × 15 cm em todas as páginas':'primeira página '+(d.pw/72*25.4).toFixed(1)+' × '+(d.ph/72*25.4).toFixed(1)+' mm'}. Nenhum dado enviado.${ignored.length?' Anexos do ZIP não incorporados: '+ignored.join(', ')+'. Se forem notas, selecione os PDFs no campo de DANFEs.':''}`;
  }catch(error){
    if(disposed)return;
    clearResult();$('status').className='error';$('status').textContent=error.message||'Não foi possível converter o lote.';
    if(error.issues){$('issues').hidden=false;for(const message of error.issues){const li=document.createElement('li');li.textContent=message;$('issues').append(li);}}
  }finally{busy=false;if(!disposed){syncControls();$('progress').hidden=true;}}
};
syncControls();

window.HarmonyConverterLifecycle=Object.freeze({dispose(){if(disposed)return;disposed=true;selected=[];invoiceFiles=[];clearResult();for(const id of ["files","invoice-files"]){$(id).value="";}busy=false;syncControls();}});
window.addEventListener("pagehide",()=>window.HarmonyConverterLifecycle.dispose(),{once:true});
})();
