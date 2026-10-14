/* Local recovery only: original documents and picking layout remain unchanged. */
(function(root){
  'use strict';
  const MAX_BYTES=100*1024*1024,MAX_PAGES=1000;
  const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s/g,'');
  function problem(code,message,extra={}){return {code,message,...extra};}
  function guardSize(files){if(files.reduce((n,f)=>n+f.size,0)>MAX_BYTES)throw Error('O lote ultrapassa 100 MB. Selecione um lote menor, sem editar os documentos.');}
  async function duplicateFiles(labels,invoices,active=()=>{}){
    guardSize([...labels,...invoices]);const seen=new Map(),duplicates=[];
    for(const [kind,files] of [['labels',labels],['invoices',invoices]])for(let index=0;index<files.length;index++){
      const file=files[index],bytes=await file.arrayBuffer();active();
      const digest=await root.crypto.subtle.digest('SHA-256',bytes);active();
      const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
      const key=kind+':'+hash;
      if(seen.has(key))duplicates.push({kind,index,name:file.name,original:seen.get(key)});
      else seen.set(key,file.name);
    }
    return duplicates;
  }
  // Reassemble only contiguous glyphs of explicit identity fields. Never infer
  // digits, use a recipient name, or join distant cells to manufacture a match.
  function alternativeItems(items){
    const out=items.slice(),rows=[];
    for(const item of items){if(!item.str?.trim()||!Array.isArray(item.transform))continue;
      let row=rows.find(r=>Math.abs(r.y-item.transform[5])<1.5);
      if(!row){row={y:item.transform[5],items:[]};rows.push(row);}row.items.push(item);
    }
    for(const row of rows){
      row.items.sort((a,b)=>a.transform[4]-b.transform[4]);
      for(let start=0;start<row.items.length;start++){
        let text='',right=0;
        for(let end=start;end<Math.min(row.items.length,start+60);end++){
          const item=row.items[end],x=item.transform[4];
          if(end>start&&(x-right>3||x<right-1))break;
          text+=item.str;right=x+Math.abs(item.width||0);
          const compact=text.replace(/\s/g,'');
          const recognized=/^\d{44}$/.test(compact)&&root.LocalInvoices.validKey(compact)||/^\d{5}-?\d{3}$/.test(compact)||['CEP','DESTINATARIO/REMETENTE'].includes(fold(compact));
          if(end>start&&recognized&&!out.some(i=>i.str===compact&&i.transform?.[4]===row.items[start].transform[4]&&i.transform?.[5]===row.y))out.push({...row.items[start],str:compact,width:right-row.items[start].transform[4]});
        }
      }
    }
    return out;
  }
  async function readInvoices(files,onProgress=()=>{},options={}){
    const active=options.active||(()=>{}),documents=[],groups=new Map(),problems=[],recovered=[];let total=0;
    guardSize(files);
    for(let fileIndex=0;fileIndex<files.length;fileIndex++){
      const file=files[fileIndex];let reader;
      if(!/\.pdf$/i.test(file.name)){problems.push(problem('read','Selecione o DANFE original em PDF.',{source:file.name,uncertain:true}));continue;}
      try{
        const bytes=new Uint8Array(await file.arrayBuffer());active();documents[fileIndex]={name:file.name,bytes};
        reader=await root.LocalInvoices.openPdf(bytes);active();total+=reader.numPages;
        if(total>MAX_PAGES)throw Object.assign(Error('Limite de 1.000 páginas de notas excedido. Selecione um lote menor.'),{fatal:true});
        for(let index=1;index<=reader.numPages;index++){
          let page;
          try{
            page=await reader.getPage(index);active();
            let content=await page.getTextContent();active();let info,usedAlternative=false;
            try{info=root.LocalInvoices.pageInfo(content.items);}
            catch(first){
              content=await page.getTextContent({disableNormalization:true});active();
              try{info=root.LocalInvoices.pageInfo(alternativeItems(content.items));usedAlternative=true;}
              catch{throw first;}
            }
            if(options.alternative&&!usedAlternative){content=await page.getTextContent({disableNormalization:true});active();
              const alternative=root.LocalInvoices.pageInfo(alternativeItems(content.items));
              if(['key','recipientPostcode','deliveryPostcode'].some(field=>alternative[field]!==info[field]))throw Error('As duas leituras discordam sobre a identidade da nota. Selecione novamente o DANFE original da plataforma.');
            }
            try{info.products=root.LocalPicking.extract(content.items,await page.getOperatorList());active();}
            catch(error){active();info.productError=error.message;}
            const ref={...info,fileIndex,pageIndex:index-1,source:file.name};
            if(!groups.has(info.key))groups.set(info.key,[]);groups.get(info.key).push(ref);
            if(usedAlternative)recovered.push(`${file.name}, página ${index}: campos de identificação recuperados por leitura local alternativa.`);
          }catch(error){active();problems.push(problem('read',error.message||'Não foi possível identificar esta página.',{source:file.name,page:index,uncertain:true}));}
          finally{page?.cleanup();}
          onProgress(fileIndex+1,files.length,index,reader.numPages);
        }
      }catch(error){active();if(error.fatal)throw error;problems.push(problem('read',error.message||'Não foi possível abrir este PDF.',{source:file.name,uncertain:true}));}
      finally{if(reader)await reader.destroy();}
    }
    const invoices=[];
    for(const [key,pages] of groups){
      const first=pages[0],expected=first.totalSheets||1,extra={invoiceNumber:first.invoiceNumber,source:first.source,key};
      if(pages.some(p=>(p.totalSheets||1)!==expected)||pages.length!==expected||(expected>1&&pages.some(p=>!p.sheet))||new Set(pages.map(p=>p.sheet||1)).size!==pages.length){
        problems.push(problem('sheets',`NF ${first.invoiceNumber}: há folhas repetidas, faltantes ou com numeração inconsistente. Selecione o conjunto completo desta nota, sem editar o PDF.`,extra));continue;
      }
      pages.sort((a,b)=>(a.sheet||1)-(b.sheet||1));let destination;
      try{destination=root.LocalInvoices.invoiceDestination(pages);}
      catch(error){problems.push(problem('postcode',`NF ${first.invoiceNumber}: ${error.message} Tente a leitura alternativa ou selecione novamente o DANFE original.`,extra));continue;}
      invoices.push({key,invoiceNumber:first.invoiceNumber,series:first.series,issuer:first.issuer,...destination,pages});
    }
    return {documents,invoices,problems,recovered};
  }
  async function analyze(labels,read,options={}){
    if((options.mode||'picking')==='picking'&&read?.sales)return root.LocalSales.review(labels,read,options);
    const mode=options.mode||'picking',duplicates=options.duplicates||[],sourceProblems=options.sourceProblems||[];
    const invoiceProblems=read?.problems||[],items=[],validLabels=[],validInvoices=[],used=new Set();
    const count=(values,key)=>values.filter(v=>key(v)).reduce((m,v)=>m.set(key(v),(m.get(key(v))||0)+1),new Map());
    const shipmentCount=count(labels,l=>l.metadata?.shipmentId),numberCount=count(labels,l=>root.LocalInvoices.labelIdentity(l).invoiceNumber);
    const uncertain=invoiceProblems.some(p=>p.uncertain);
    for(let index=0;index<labels.length;index++){
      const label=labels[index],m=root.LocalInvoices.labelIdentity(label),item={labelIndex:index,shipmentId:m.shipmentId||'',invoiceNumber:m.invoiceNumber||'',labelPostcode:m.postcode||'',source:label.source||`Etiqueta ${index+1}`,ready:false};
      const stop=(code,message,extra={})=>Object.assign(item,problem(code,message,extra));
      if(!read){item.ready=true;validLabels.push(label);items.push(item);continue;}
      const matches=read.invoices.filter(n=>n.invoiceNumber===m.invoiceNumber);item.candidates=matches.map(n=>({number:n.invoiceNumber,series:n.series,issuer:n.issuer,postcode:n.postcode,source:n.pages.map(p=>`${p.source}, pág. ${p.pageIndex+1}`).join('; ')}));
      const confirmable=!uncertain&&!duplicates.length&&!sourceProblems.length?root.LocalInvoices.missingInvoiceOptions(labels,read.invoices,index).filter(n=>!invoiceProblems.some(p=>p.invoiceNumber===n.invoiceNumber)):[];
      if(confirmable.length)stop('missing-invoice-number','Este modelo de etiqueta não informa o número da NF. Confira o envio no Mercado Livre e confirme a nota correspondente abaixo. O CEP igual, sozinho, não comprova o vínculo.',{confirmationOptions:confirmable.map(n=>({key:n.key,number:n.invoiceNumber,series:n.series,postcode:n.postcode,source:n.pages.map(p=>`${p.source}, pág. ${p.pageIndex+1}`).join('; ')}))});
      else if(!m.invoiceNumber||!/^\d{1,9}$/.test(m.invoiceNumber)||!m.postcode||!m.shipmentId)stop('metadata','A etiqueta não contém NF, CEP e envio legíveis em texto. Selecione o ZPL original com esses campos; etiquetas somente em imagem não podem ser vinculadas automaticamente.');
      else if(shipmentCount.get(m.shipmentId)>1)stop('duplicate-label','Este envio aparece mais de uma vez. Remova arquivos idênticos, quando indicados, ou selecione um lote sem repetir o envio.');
      else if(numberCount.get(m.invoiceNumber)>1)stop('volumes','Mais de uma etiqueta usa esta NF. Separe os volumes na plataforma; não é seguro escolher uma etiqueta automaticamente.');
      else if(invoiceProblems.some(p=>p.invoiceNumber===m.invoiceNumber))stop('invoice-read','A nota correspondente tem pendência de leitura ou de folhas. Veja o arquivo indicado abaixo; tente outra leitura ou adicione o DANFE completo.');
      else if(matches.length===0)stop('missing','Esta nota não foi identificada nos PDFs selecionados. Adicione o DANFE correspondente ou tente a leitura alternativa se ele já estiver no lote.');
      else if(matches.length!==1)stop('ambiguous','Há notas de séries ou emissores diferentes com este número. Compare as origens e selecione o lote da loja correta. Nenhuma foi escolhida automaticamente.');
      else if(matches[0].postcode!==m.postcode)stop('mismatch','O CEP da etiqueta e o da nota são diferentes. Confira os dois documentos abaixo e selecione os arquivos do mesmo pedido. Não edite o CEP para forçar o vínculo.');
      else if(mode==='picking'&&matches[0].pages.some(p=>p.productError||!p.products?.length))stop('products','Não conseguimos interpretar a tabela de produtos deste modelo. Tente outra leitura ou escolha DANFE completo para continuar com o documento original.');
      else{
        try{if(mode==='picking'&&read.sales)root.LocalSales.productsFor(label,matches[0],read.sales);item.ready=true;validLabels.push(label);validInvoices.push(matches[0]);used.add(matches[0].key);}
        catch(error){stop('sales',error.message);}
      }
      items.push(item);
    }
    const unmatchedInvoices=(read?.invoices||[]).filter(n=>!used.has(n.key));
    const subsetRead=read?{documents:read.documents,invoices:validInvoices,sales:read.sales}:null;
    let subset=null;
    if(validLabels.length)subset=await root.LocalBatchReview.inspect(validLabels,subsetRead,{mode,ignored:options.ignored||[]});
    const issues=[...items.filter(i=>!i.ready).map(i=>`Etiqueta ${i.labelIndex+1}${i.invoiceNumber?' / NF '+i.invoiceNumber:''}: ${i.message}`),...invoiceProblems.map(p=>`${p.source}${p.page?', página '+p.page:''}: ${p.message}`),...sourceProblems.map(p=>`${p.source}: ${p.message}`)];
    if(duplicates.length)issues.push(`${duplicates.length} arquivo(s) com conteúdo idêntico. Use “Remover cópias idênticas” antes de conferir novamente.`);
    if(unmatchedInvoices.length)issues.push(`${unmatchedInvoices.length} nota(s) fora dos pedidos conferidos: ${unmatchedInvoices.map(n=>n.invoiceNumber).join(', ')}.`);
    if(subset&&!subset.ready)issues.push(...subset.issues);
    const ready=!!subset?.ready&&validLabels.length===labels.length&&!issues.length;
    const partialReady=!ready&&!!subset?.ready&&!uncertain&&!duplicates.length;
    const counts={labels:labels.length,invoices:read?read.invoices.length:0,products:read?read.invoices.reduce((n,i)=>n+i.pages.reduce((s,p)=>s+(p.products?.length||0),0),0):null,pages:ready?subset.counts.pages:null};
    if(uncertain||read?.invoices.some(i=>i.pages.some(p=>p.productError||!p.products?.length)))counts.products=null;
    return {ready,partialReady,paired:!!read,mode,rows:subset?.rows||[],counts,issues,warnings:[...(subset?.warnings||[]),...(read?.recovered||[])],items,unmatchedInvoices,invoiceProblems,sourceProblems,duplicates,uncertain,confirmedCount:validLabels.length,pendingCount:items.filter(i=>!i.ready).length,subset:subset?.ready?{labels:validLabels,read:subsetRead,report:subset}:null};
  }
  function pendingText(report){
    const lines=['PENDENCIAS DO LOTE - NAO INCLUIDAS NO PDF',`Etiquetas conferidas: ${report.confirmedCount} de ${report.counts.labels}`,`Etiquetas pendentes: ${report.pendingCount}`,''];
    for(const item of report.items.filter(i=>!i.ready))lines.push(`Etiqueta ${item.labelIndex+1} | Envio ${item.shipmentId||'nao lido'} | NF ${item.invoiceNumber||'nao lida'} | ${item.message}`);
    for(const p of [...report.invoiceProblems,...report.sourceProblems])lines.push(`${p.source}${p.page?' / pagina '+p.page:''}: ${p.message}`);
    for(const n of report.unmatchedInvoices)lines.push(`NF ${n.invoiceNumber}, serie ${n.series}: fora dos pedidos conferidos.`);
    return lines.join('\n');
  }
  root.LocalBatchRecovery=Object.freeze({duplicateFiles,alternativeItems,readInvoices,analyze,pendingText,guardSize});
})(globalThis);
