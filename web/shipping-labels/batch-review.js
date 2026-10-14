/* Read-only batch review. No uploads, persisted data or changes to the picking layout. */
(function(root){
  'use strict';
  async function inspect(labels,read=null,{mode='picking',ignored=[]}={}){
    const paired=read!==null;
    const report={ready:false,paired,mode:paired?mode:'labels',rows:[],issues:[],warnings:[],
      counts:{labels:labels.length,invoices:paired?read.invoices.length:0,products:null,pages:null}};
    for(const name of ignored)report.warnings.push('Anexo do ZIP não incorporado: '+name+'. Se for uma nota, selecione o PDF no campo de DANFEs.');
    if(!labels.length)report.issues.push('Nenhuma etiqueta encontrada. Selecione um arquivo ZIP, ZPL ou TXT com etiquetas.');
    if(labels.length>1000)report.issues.push('Limite de 1.000 etiquetas excedido. Divida o lote.');
    if(report.issues.length)return report;
    if(!paired){report.counts.pages=labels.length;report.ready=true;return report;}
    if(!['picking','danfe'].includes(mode)){report.issues.push('Tipo de documento inválido.');return report;}
    const allProductsKnown=read.invoices.every(note=>note.pages.length&&note.pages.every(page=>!page.productError&&Array.isArray(page.products)));
    if(allProductsKnown)report.counts.products=read.invoices.reduce((sum,note)=>sum+note.pages.reduce((n,page)=>n+page.products.length,0),0);
    for(const note of read.invoices){
      const missing=note.pages.flatMap(page=>page.products||[]).filter(product=>!product.variation).length;
      if(missing)report.warnings.push('NF '+note.invoiceNumber+': '+missing+' item(ns) sem cor/variação explícita na nota. Confira no pedido; o sistema não deduz essa informação.');
      if(mode==='danfe'&&note.pages.some(page=>page.productError||!page.products?.length))report.warnings.push('NF '+note.invoiceNumber+': produtos não extraídos em uma ou mais folhas. Neste modo, o DANFE será incluído por inteiro; confira sua leitura na prévia.');
    }
    let rows;
    try{rows=root.LocalInvoices.pair(labels,read.invoices);}
    catch(error){report.issues.push(...(error.issues?.length?error.issues:[error.message||'Não foi possível confirmar os vínculos.']));return report;}
    let picking=null;
    if(mode==='picking'){
      try{picking=await root.LocalPicking.plan(read.invoices,await root.PDFLib.PDFDocument.create());}
      catch(error){report.issues.push(error.message||'Não foi possível preparar a ficha de separação.');return report;}
    }
    let nextPage=1;
    for(const row of rows){
      if(row.confirmedByAdmin)report.warnings.push('Envio '+row.shipmentId+' / NF '+row.invoice.invoiceNumber+': vínculo confirmado pelo ADM porque a etiqueta não informa a NF. CEP conferido; a confirmação vale somente para esta seleção.');
      const count=picking?picking.layouts.get(row.invoice.key).sheets.length:row.invoice.pages.length;
      report.rows.push({...row,labelPage:nextPage,invoiceStart:nextPage+1,invoiceEnd:nextPage+count});
      nextPage+=1+count;
    }
    report.counts.pages=nextPage-1;
    if(report.counts.pages>1000){report.issues.push('O PDF final ultrapassaria 1.000 páginas. Divida o lote.');report.rows=[];return report;}
    report.ready=true;
    return report;
  }
  root.LocalBatchReview=Object.freeze({inspect});
})(globalThis);
