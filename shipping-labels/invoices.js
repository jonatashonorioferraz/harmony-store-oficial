/* Local DANFE matching and vector PDF composition. No URLs, storage or uploads. */
(function(root){
  'use strict';
  const fail=message=>{throw Error(message);};
  const unique=values=>[...new Set(values)];
  const fold=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
  const W=100/25.4*72,H=150/25.4*72,MAX_PAGES=1000;
  // Confirmations belong only to parsed label objects in this session. Original
  // ZPL metadata stays unchanged; re-reading files creates unconfirmed objects.
  const confirmations=new WeakMap();
  function labelIdentity(label){
    const m=label.metadata||{},confirmation=confirmations.get(label);
    if(!confirmation)return m;
    if(m.invoiceNumber||m.invoiceNumbers?.length||m.shipmentId!==confirmation.shipmentId||m.postcode!==confirmation.postcode)fail('A etiqueta mudou após a confirmação. Confira o lote novamente.');
    return {...m,invoiceNumber:confirmation.invoiceNumber,confirmedKey:confirmation.key};
  }
  function missingInvoiceOptions(labels,invoices,index){
    const label=labels[index],m=label?.metadata;
    if(!m||confirmations.has(label)||m.invoiceNumber||m.invoiceNumbers?.length||!/^\d{8}$/.test(m.postcode||'')||!/^\d+$/.test(m.shipmentId||'')||labels.filter(l=>l.metadata?.shipmentId===m.shipmentId).length!==1)return [];
    return invoices.filter(note=>validKey(note.key)&&note.key.slice(25,34).replace(/^0+/,'')===note.invoiceNumber&&note.postcode===m.postcode&&
      invoices.filter(n=>n.invoiceNumber===note.invoiceNumber).length===1&&
      !labels.some(l=>labelIdentity(l).invoiceNumber===note.invoiceNumber||l.metadata?.invoiceNumbers?.includes(note.invoiceNumber)));
  }
  function confirmMissingInvoice(labels,invoices,index,key,confirmed=false){
    if(confirmed!==true)fail('Confirme o envio e a nota no Mercado Livre antes de vincular.');
    const note=missingInvoiceOptions(labels,invoices,index).find(n=>n.key===key);
    if(!note)fail('Essa nota não pode ser confirmada: confira CEP, duplicidades e os arquivos do lote.');
    const m=labels[index].metadata;
    confirmations.set(labels[index],{key:note.key,invoiceNumber:note.invoiceNumber,shipmentId:m.shipmentId,postcode:m.postcode});
  }
  class MemoryFonts {
    async fetch({kind,filename}){
      // Standard PDF fonts are already bundled as bytes. Disallow every other
      // resource request, including URLs embedded in an untrusted document.
      if(kind!=='standardFontDataUrl'||!Object.hasOwn(root.LocalPdfFonts||{},filename))fail('Este PDF precisa de um recurso de fonte não incluído no conversor local.');
      return Uint8Array.from(atob(root.LocalPdfFonts[filename]),c=>c.charCodeAt(0));
    }
  }
  async function openPdf(data){
    if(!root.LocalPdfJs||!root.PDFLib)fail('As bibliotecas de PDF estão ausentes. Extraia a pasta inteira do conversor.');
    const task=root.LocalPdfJs.getDocument({
      data:new Uint8Array(data).slice(),isEvalSupported:false,useWorkerFetch:false,
      useWasm:false,disableFontFace:true,useSystemFonts:false,BinaryDataFactory:MemoryFonts,
      isOffscreenCanvasSupported:false,isImageDecoderSupported:false,enableXfa:false,
      stopAtErrors:true,maxImageSize:20*1024*1024,
      ...(root.LocalPdfCanvasFactory?{CanvasFactory:root.LocalPdfCanvasFactory}:{})
    });
    try{return await task.promise;}catch(error){await task.destroy();if(error.name==='PasswordException')fail('Remova a senha do PDF de notas antes de converter.');throw error;}
  }
  function validKey(key){
    if(!/^\d{44}$/.test(key)||key.slice(20,22)!=='55')return false;
    let sum=0,weight=2;for(let i=42;i>=0;i--){sum+=Number(key[i])*weight;weight=weight===9?2:weight+1;}
    const remainder=sum%11,digit=remainder<2?0:11-remainder;
    return digit===Number(key[43]);
  }
  function sectionPostcode(items,pattern,name){
    // Read only the CEP cell of an explicitly named section. Stop at the next
    // section so issuer, carrier and pickup addresses cannot become delivery.
    const sections=/^(?:DESTINATARIO\s*\/\s*REMETENTE|(?:INFORMACOES|IDENTIFICACAO)\b|LOCAL DE\b|FATURA\b|DUPLICATAS?\b|CALCULO\b|TRANSPORTADOR\b|DADOS (?:DO|DOS|ADICIONAIS)\b)/;
    const postcodes=[];
    for(const header of items.filter(i=>pattern.test(fold(i.str||'')))){
      const y=header.transform[5];
      const next=items.filter(i=>i.transform[5]<y-2&&sections.test(fold(i.str||''))).map(i=>i.transform[5]);
      const bottom=Math.max(y-130,...next);
      for(const anchor of items.filter(i=>fold(i.str||'')==='CEP'&&i.transform[5]<=y+2&&i.transform[5]>bottom)){
        const values=items.filter(value=>{
          const dy=anchor.transform[5]-value.transform[5],dx=value.transform[4]-anchor.transform[4];
          // The next row's small field caption can sit less than 22 pt below
          // an empty CEP (for example FONE/FAX); it is not a malformed value.
          return value.str?.trim()&&!/^(?:FONE\s*\/\s*FAX|TELEFONE|MUNICIPIO|UF|INSCRICAO ESTADUAL)$/.test(fold(value.str))&&dy>0&&dy<22&&value.transform[5]>bottom&&dx>=-5&&dx<35;
        });
        const valid=values.map(value=>value.str.trim().match(/^(\d{5})-?(\d{3})$/)).filter(Boolean);
        if(values.length&&!valid.length)fail(`CEP ${name} ilegível. Confira o DANFE original.`);
        postcodes.push(...valid.map(match=>match[1]+match[2]));
      }
    }
    const ceps=unique(postcodes);
    if(ceps.length>1)fail(`Mais de um CEP ${name} encontrado nesta página.`);
    return ceps[0]||null;
  }
  function invoiceDestination(pages){
    const recipient=unique(pages.map(p=>Object.hasOwn(p,'recipientPostcode')?p.recipientPostcode:p.postcode).filter(Boolean));
    const delivery=unique(pages.map(p=>p.deliveryPostcode).filter(Boolean));
    if(recipient.length>1||delivery.length>1)fail('CEPs de destinatário ou de entrega divergentes entre as folhas da nota.');
    const postcode=delivery[0]||recipient[0];
    if(!postcode)fail('Não foi possível confirmar um único CEP de entrega ou do destinatário.');
    return {postcode,recipientPostcode:recipient[0]||null,deliveryPostcode:delivery[0]||null,postcodeSource:delivery.length?'delivery':'recipient'};
  }
  function pageInfo(items){
    const strings=items.filter(i=>typeof i.str==='string').map(i=>i.str);
    const text=strings.join(' ');
    if(!text.trim())fail('Página sem texto pesquisável. Use o DANFE original em PDF; imagens digitalizadas não permitem a conferência automática.');
    const candidates=unique([...text.matchAll(/(?<!\d)(?:\d{44}|(?:\d{4}\s+){10}\d{4})(?!\d)/g)].map(m=>m[0].replace(/\s/g,'')));
    if(candidates.length!==1)fail(candidates.length?'Há mais de uma chave de acesso nesta página; a associação seria ambígua.':'Não foi encontrada uma única chave de acesso de NF-e com 44 dígitos.');
    const key=candidates[0];if(!validKey(key))fail('Chave de acesso de NF-e inválida: confira o DANFE original.');
    const invoiceNumber=key.slice(25,34).replace(/^0+/,'');
    if(!invoiceNumber)fail('Número da nota inválido.');
    const recipientPostcode=sectionPostcode(items,/^DESTINATARIO\s*\/\s*REMETENTE$/,'do destinatário');
    const deliveryPostcode=sectionPostcode(items,/^(?:(?:INFORMACOES|IDENTIFICACAO) DO )?LOCAL DE ENTREGA(?:\s*\/\s*RETIRADA)?$/,'do local de entrega');
    const counters=unique(strings.map(s=>s.trim()).filter(s=>/^\d+\s*(?:d(?:e)?|\/)\s*\d+$/i.test(s)));
    if(counters.length>1)fail('Numeração de folhas ambígua no DANFE.');
    const counter=counters[0]?.match(/^(\d+)\s*(?:d(?:e)?|\/)\s*(\d+)$/i);
    const sheet=counter?Number(counter[1]):null,totalSheets=counter?Number(counter[2]):null;
    if(counter&&(!sheet||sheet>totalSheets||totalSheets>MAX_PAGES))fail('Numeração de folhas inválida no DANFE.');
    return {key,invoiceNumber,series:String(Number(key.slice(22,25))),issuer:key.slice(6,20),recipientPostcode,deliveryPostcode,postcode:deliveryPostcode||recipientPostcode,postcodeSource:deliveryPostcode?'delivery':'recipient',sheet,totalSheets};
  }
  async function readInvoices(files,onProgress=()=>{}){
    const documents=[],groups=new Map();let total=0;
    for(let fileIndex=0;fileIndex<files.length;fileIndex++){
      const file=files[fileIndex];if(!/\.pdf$/i.test(file.name))fail('No campo de notas, selecione apenas arquivos PDF.');
      const bytes=new Uint8Array(await file.arrayBuffer());
      let reader;
      try{
        reader=await openPdf(bytes);
        total+=reader.numPages;if(total>MAX_PAGES)fail('Limite de 1.000 páginas de notas excedido.');
        documents.push({name:file.name,bytes});
        for(let i=1;i<=reader.numPages;i++){
          try{
            const page=await reader.getPage(i),content=await page.getTextContent();
            const info=pageInfo(content.items);
            if(root.LocalPicking){
              try{info.products=root.LocalPicking.extract(content.items,await page.getOperatorList());}
              catch(error){info.productError=error.message;}
            }
            const ref={...info,fileIndex,pageIndex:i-1,source:file.name};
            if(!groups.has(info.key))groups.set(info.key,[]);groups.get(info.key).push(ref);
            page.cleanup();onProgress(fileIndex+1,files.length,i,reader.numPages);
          }catch(error){throw Error(`Página ${i}: ${error.message}`);}
        }
      }catch(error){throw Error(`${file.name}: ${error.message}`);}
      finally{if(reader)await reader.destroy();}
    }
    const invoices=[];
    for(const [key,pages] of groups){
      const expected=pages[0].totalSheets||1;
      if(pages.some(p=>(p.totalSheets||1)!==expected)||pages.length!==expected||
          (expected>1&&pages.some(p=>!p.sheet))||new Set(pages.map(p=>p.sheet||1)).size!==pages.length){
        fail(`NF ${pages[0].invoiceNumber}: nota duplicada, folhas faltantes ou numeração de folhas inconsistente. Confira os PDFs selecionados.`);
      }
      pages.sort((a,b)=>(a.sheet||1)-(b.sheet||1));
      const destination=invoiceDestination(pages);
      invoices.push({key,invoiceNumber:pages[0].invoiceNumber,series:pages[0].series,issuer:pages[0].issuer,...destination,pages});
    }
    if(!invoices.length)fail('Nenhuma nota fiscal identificada.');
    return {documents,invoices};
  }
  function pair(labels,invoices){
    const used=new Set(),shipments=new Set(),rows=[],errors=[];
    let nextPage=1;
    for(let i=0;i<labels.length;i++){
      const m=labelIdentity(labels[i]),prefix=`Etiqueta ${i+1}`;
      if(!m.invoiceNumber||!/^\d{1,9}$/.test(m.invoiceNumber)){errors.push(`${prefix}: número NF ausente ou ambíguo no ZPL.`);continue;}
      if(!m.postcode){errors.push(`${prefix} / NF ${m.invoiceNumber}: CEP ausente ou ambíguo no ZPL.`);continue;}
      if(!m.shipmentId){errors.push(`${prefix}: identificador de envio ausente ou divergente entre os códigos.`);continue;}
      if(shipments.has(m.shipmentId)){errors.push(`${prefix}: envio ${m.shipmentId} repetido. Remova etiquetas duplicadas.`);continue;}
      shipments.add(m.shipmentId);
      const matches=invoices.filter(n=>n.invoiceNumber===m.invoiceNumber);
      if(matches.length!==1){errors.push(`${prefix} / NF ${m.invoiceNumber}: ${matches.length?'mais de uma nota com esse número (séries ou emissores diferentes).':'nota não encontrada nos PDFs selecionados.'}`);continue;}
      const invoice=matches[0];
      if(m.confirmedKey&&m.confirmedKey!==invoice.key){errors.push(`${prefix}: a nota mudou após a confirmação do ADM. Confira o lote novamente.`);continue;}
      if(used.has(invoice.key)){errors.push(`${prefix} / NF ${m.invoiceNumber}: a mesma nota aparece em mais de uma etiqueta. Separe os volumes para conferência.`);continue;}
      if(invoice.postcode!==m.postcode){errors.push(`${prefix} / NF ${m.invoiceNumber}: CEP da etiqueta (${m.postcode}) diferente do DANFE (${invoice.postcode}).`);continue;}
      used.add(invoice.key);
      rows.push({labelIndex:i,invoice,shipmentId:m.shipmentId,confirmedByAdmin:Boolean(m.confirmedKey),labelPage:nextPage,invoiceStart:nextPage+1,invoiceEnd:nextPage+invoice.pages.length});
      nextPage+=1+invoice.pages.length;
    }
    const extras=invoices.filter(n=>!used.has(n.key));
    if(extras.length)errors.push(`${extras.length} nota(s) sem etiqueta correspondente: ${extras.slice(0,20).map(n=>n.invoiceNumber).join(', ')}${extras.length>20?'…':''}.`);
    if(nextPage-1>MAX_PAGES)errors.push('O PDF final ultrapassaria o limite de 1.000 páginas. Divida o lote.');
    if(errors.length){const error=Error(`Não foi possível vincular o lote com segurança. ${errors.length} pendência(s). Nenhum PDF parcial foi gerado.`);error.issues=errors;throw error;}
    return rows;
  }
  async function createPairedPdf(labels,read,rows,dpi,onProgress=()=>{},mode='danfe'){
    // Validate again at the composition boundary. Never allow a stale or partial
    // review table to decide which invoice is printed next to a shipment.
    const salesSource=mode==='picking'&&read.sales;
    rows=salesSource?root.LocalSales.pair(labels,read):pair(labels,read.invoices);
    const {PDFDocument,degrees,StandardFonts,rgb}=root.PDFLib;
    const output=await PDFDocument.create();
    if(!['danfe','picking'].includes(mode))fail('Tipo de documento inválido.');
    output.setTitle(mode==='picking'?'Harmony Store — Etiquetas e fichas de separação':'Harmony Store — Etiquetas e notas vinculadas');output.setProducer('Harmony Store · conversão local');
    const picking=mode==='picking'?(salesSource?await root.LocalPicking.planOrders(rows,output):await root.LocalPicking.plan(read.invoices,output,rows)):null;
    let nextPage=1;
    for(const row of rows){
      const count=picking?picking.layouts.get(row.order?.key||row.invoice.key).sheets.length:row.invoice.pages.length;
      row.labelPage=nextPage;row.invoiceStart=nextPage+1;row.invoiceEnd=nextPage+count;nextPage+=1+count;
    }
    if(nextPage-1>MAX_PAGES)fail('O PDF final ultrapassaria 1.000 páginas. Divida o lote.');
    const footerFont=await output.embedFont(StandardFonts.Helvetica);
    const labelBlob=await root.LocalZpl.createPdf(labels,dpi,'100x150');
    const labelDoc=await PDFDocument.load(await labelBlob.arrayBuffer());
    const sourceDocs=new Map(),sequence=[];
    for(const row of rows){
      const [labelPage]=await output.copyPages(labelDoc,[row.labelIndex]);output.addPage(labelPage);
      sequence.push({kind:'label',row});
      if(picking){
        const sheets=root.LocalPicking.draw(output,row,picking);
        for(let i=0;i<sheets.length;i++)sequence.push({kind:'picking',row,sheet:i+1,totalSheets:sheets.length});
        onProgress(sequence.length,nextPage-1);
        await new Promise(resolve=>setTimeout(resolve,0));continue;
      }
      for(const ref of row.invoice.pages){
        if(!sourceDocs.has(ref.fileIndex))sourceDocs.set(ref.fileIndex,await PDFDocument.load(read.documents[ref.fileIndex].bytes));
        const source=sourceDocs.get(ref.fileIndex).getPage(ref.pageIndex);
        const crop=source.getCropBox(),media=source.getMediaBox();
        const left=Math.max(crop.x,media.x),bottom=Math.max(crop.y,media.y);
        const right=Math.min(crop.x+crop.width,media.x+media.width),top=Math.min(crop.y+crop.height,media.y+media.height);
        if(right<=left||top<=bottom)fail('Área de impressão inválida no DANFE.');
        const embedded=await output.embedPage(source,{left,bottom,right,top});
        const rotation=((source.getRotation().angle%360)+360)%360;
        if(![0,90,180,270].includes(rotation))fail('Rotação de página PDF não suportada.');
        const turned=rotation===90||rotation===270;
        const sw=turned?embedded.height:embedded.width,sh=turned?embedded.width:embedded.height;
        // Reserve 15 mm for a readable duplicate of the validated NF-e access
        // key barcode. An A4 barcode shrunk to label size may be sub-dot at
        // 203 dpi. The full original DANFE stays above, with no cropped fields.
        const footer=15/25.4*72,areaHeight=H-footer;
        const scale=Math.min(W/sw,areaHeight/sh),x=(W-sw*scale)/2,y=footer+(areaHeight-sh*scale)/2;
        const w=embedded.width*scale,h=embedded.height*scale;
        const offsets={0:[x,y],90:[x,y+w],180:[x+w,y+h],270:[x+h,y]};
        const [px,py]=offsets[rotation],page=output.addPage([W,H]);
        page.drawPage(embedded,{x:px,y:py,width:w,height:h,rotate:degrees(-rotation)});
        const bars=root.ZplCode128('>;'+row.invoice.key);
        // Two printer dots per narrow module at 203 dpi; 10-module quiet
        // zones fit on both sides. Keep this physical size at every source DPI.
        const barUnit=2/203*72,totalWidth=bars.reduce((a,b)=>a+b,0)*barUnit;
        let bx=(W-totalWidth)/2;
        for(let i=0;i<bars.length;i++){
          const bw=bars[i]*barUnit;
          if(i%2===0)page.drawRectangle({x:bx,y:12,width:bw,height:21,color:rgb(0,0,0)});
          bx+=bw;
        }
        const keyText=row.invoice.key.match(/.{4}/g).join(' '),fontSize=5.5;
        page.drawText(keyText,{x:(W-footerFont.widthOfTextAtSize(keyText,fontSize))/2,y:4,size:fontSize,font:footerFont,color:rgb(0,0,0)});
        page.drawText('CHAVE DE ACESSO · CÓPIA PARA LEITURA',{x:(W-footerFont.widthOfTextAtSize('CHAVE DE ACESSO · CÓPIA PARA LEITURA',4.5))/2,y:36,size:4.5,font:footerFont,color:rgb(0,0,0)});
        sequence.push({kind:'invoice',row,sheet:ref.sheet||1,totalSheets:row.invoice.pages.length});
      }
      onProgress(sequence.length,labels.length+read.invoices.reduce((n,v)=>n+v.pages.length,0));
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    const bytes=await output.save();
    return {blob:new Blob([bytes],{type:'application/pdf'}),bytes,sequence,rows};
  }
  root.LocalInvoices={openPdf,validKey,pageInfo,invoiceDestination,readInvoices,pair,createPairedPdf,labelIdentity,missingInvoiceOptions,confirmMissingInvoice};
})(globalThis);
