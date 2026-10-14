/* Local Mercado Livre sales export. Source documents are never changed. */
(function(root){
 'use strict';
 const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
 const stripVariant=s=>String(s||'').replace(/\s*[-|;,]?\s*(?:COR(?:ES)?\s+E\s+AROMAS?(?:\s+PADR[ÃA]O)?|COR(?:ES)?|VARIA[ÇC][ÃA]O|AROMA|TAMANHO)\s*:\s*.+$/i,'').trim();
 const fail=message=>{throw Error(message);};
 const nodes=(element,name)=>Array.from(element.getElementsByTagNameNS(NS,name));
 function xml(source){
  if(!source||/<!DOCTYPE|<!ENTITY/i.test(source))fail('Excel inválido: XML ausente ou declaração não permitida.');
  const doc=new root.DOMParser().parseFromString(source,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)fail('Excel inválido: XML incompleto.');
  return doc;
 }
 const column=ref=>{let n=0;for(const c of ref)n=n*26+c.charCodeAt(0)-64;return n;};
 async function read(file,active=()=>{}){
  active();if(!/\.xlsx$/i.test(file.name))fail('Selecione o relatório original de vendas do Mercado Livre em .xlsx.');
  if(file.size>20*1024*1024)fail('O relatório Excel ultrapassa 20 MB. Exporte um período menor.');
  const entries=await root.LocalZpl.unzip(new Uint8Array(await file.arrayBuffer()),{accept:/^xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/i,emptyMessage:'O arquivo não contém um relatório Excel compatível.'});active();
  const parts=new Map();for(const entry of entries){if(parts.has(entry.name))fail('Excel com partes duplicadas. Exporte novamente.');parts.set(entry.name,entry.text);}
  const workbook=xml(parts.get('xl/workbook.xml')),sheets=nodes(workbook,'sheet').filter(s=>fold(s.getAttribute('name'))==='VENDAS BR');
  if(sheets.length!==1)fail('Não foi encontrada uma única aba “Vendas BR”. Use o Excel original de vendas do Mercado Livre.');
  const sheet=sheets[0],rels=xml(parts.get('xl/_rels/workbook.xml.rels'));
  const links=Array.from(rels.getElementsByTagNameNS('http://schemas.openxmlformats.org/package/2006/relationships','Relationship')).filter(r=>r.getAttribute('Id')===sheet.getAttributeNS(REL,'id'));
  if(links.length!==1||links[0].getAttribute('TargetMode')==='External')fail('Aba de vendas inválida.');
  const target=links[0].getAttribute('Target').replace(/^\/xl\//,'');
  if(!/^worksheets\/sheet\d+\.xml$/.test(target))fail('Caminho da aba de vendas não suportado.');
  const strings=parts.has('xl/sharedStrings.xml')?nodes(xml(parts.get('xl/sharedStrings.xml')),'si').map(si=>nodes(si,'t').map(t=>t.textContent).join('')):[];
  const sourceRows=nodes(xml(parts.get('xl/'+target)),'row');
  if(sourceRows.length>20000)fail('O relatório ultrapassa 20.000 linhas. Exporte um período menor.');
  const grid=[],seenRows=new Set();let cellsCount=0;
  for(const row of sourceRows){
   const number=Number(row.getAttribute('r'));if(!Number.isSafeInteger(number)||number<1||seenRows.has(number))fail('Numeração de linhas inválida no Excel.');seenRows.add(number);
   const cells={};
   for(const cell of nodes(row,'c')){
    if(++cellsCount>1500000)fail('Relatório Excel grande demais. Exporte um período menor.');
    const ref=cell.getAttribute('r'),match=/^([A-Z]{1,3})(\d+)$/.exec(ref);
    if(!match||Number(match[2])!==number||cells[match[1]])fail('Referência de célula inválida no Excel.');
    const type=cell.getAttribute('t')||'n';let value=nodes(cell,'v')[0]?.textContent||'';
    if(type==='s'){if(!/^\d+$/.test(value)||strings[Number(value)]===undefined)fail('Texto ausente no Excel.');value=strings[Number(value)];}
    else if(type==='inlineStr')value=nodes(cell,'t').map(t=>t.textContent).join('');
    else if(!['n','str','b','e'].includes(type))fail('Tipo de célula não suportado.');
    cells[match[1]]={value:value.trim(),type,formula:nodes(cell,'f').length>0};
   }
   grid.push({number,cells});
  }
  active();return parse(grid,file.name,sheet.getAttribute('name'));
 }
 function parse(grid,source='vendas.xlsx',sheet='Vendas BR'){
  const headers=grid.filter(row=>Object.values(row.cells).some(c=>['N DE VENDA','NUMERO DE VENDA'].includes(fold(c.value))));
  if(headers.length!==1)fail('Cabeçalho de vendas ausente ou repetido. Use o relatório original.');
  const header=headers[0],cols=Object.entries(header.cells).sort((a,b)=>column(a[0])-column(b[0]));
  const sections=Object.entries(grid.find(r=>r.number===header.number-1)?.cells||{}).filter(([,c])=>c.value.trim()).sort((a,b)=>column(a[0])-column(b[0]));
  const sectionFor=col=>fold(sections.filter(([key])=>column(key)<=column(col)).at(-1)?.[1].value);
  const find=(title,section)=>{const hits=cols.filter(([col,c])=>fold(c.value)===title&&(!section||sectionFor(col)===section));if(hits.length!==1)fail('Coluna ausente ou ambígua no relatório: '+title);return hits[0][0];};
  const keys={id:cols.find(([,c])=>['N DE VENDA','NUMERO DE VENDA'].includes(fold(c.value)))[0],status:find('ESTADO','VENDAS'),multi:find('PACOTE DE DIVERSOS PRODUTOS'),quantity:find('UNIDADES','VENDAS'),sku:find('SKU'),item:find('DE ANUNCIO'),title:find('TITULO DO ANUNCIO'),variation:find('VARIACAO'),postcode:find('CEP'),tracking:find('NUMERO DE RASTREAMENTO','ENVIOS')};
  const value=(row,key)=>{const c=row.cells[keys[key]];if(c?.formula||c?.type==='e')fail(`Linha ${row.number}: ${key} contém fórmula ou erro. Use o relatório original.`);return c?.value||'';};
  const identifier=(row,key)=>{const v=value(row,key),type=row.cells[keys[key]]?.type;if(!/^\d{8,20}$/.test(v)||type==='n'&&v.length>15)fail(`Linha ${row.number}: identificador ausente ou com possível perda de precisão. Exporte novamente.`);return v;};
  const data=grid.filter(r=>r.number>header.number&&Object.values(r.cells).some(c=>c.value)).sort((a,b)=>a.number-b.number);
  const groups=[],ids=new Set();let current=null;
  function finish(){if(current&&current.products.length!==current.expected)fail(`Pacote da linha ${current.row}: quantidade de produtos incompleta. Use o Excel original, sem ordenar ou remover linhas internas.`);current=null;}
  function group(row,id){
   const tracking=value(row,'tracking'),match=/^MEL(\d{8,15})[A-Z][A-Z0-9]*$/.exec(tracking),postcode=value(row,'postcode').replace(/\D/g,'');
   const shipmentId=match?match[1]:/^\d{8,15}$/.test(tracking)?tracking:null;
   return {id,shipmentId,tracking,postcode:postcode&&postcode.length<=8?postcode.padStart(8,'0'):postcode,products:[],source,sheet,row:row.number};
  }
  for(const row of data){
   const id=identifier(row,'id');if(ids.has(id))fail(`Venda ou pacote repetido na linha ${row.number}. Use um relatório sem duplicidades.`);ids.add(id);
   const status=value(row,'status'),pack=/^PACOTE DE (\d+) PRODUTOS?$/.exec(fold(status));
   if(pack){finish();current=group(row,id);current.expected=Number(pack[1]);if(!current.shipmentId||!/^\d{8}$/.test(current.postcode)||value(row,'item')||current.expected<1||current.expected>1000)fail(`Pacote inválido na linha ${row.number}.`);groups.push(current);continue;}
   const itemId=value(row,'item'),title=value(row,'title'),q=value(row,'quantity');
   if(!/^MLB\d+$/.test(itemId)||!title||!/^\d+(?:\.0+)?$/.test(q)||Number(q)<1||!Number.isSafeInteger(Number(q)))fail(`Produto ou quantidade inválida na linha ${row.number}.`);
   const product={orderId:id,itemId,title,sku:value(row,'sku'),variation:value(row,'variation')||null,quantity:Number(q),source,sheet,row:row.number,status};
   if(current&&current.products.length<current.expected){
    if(fold(value(row,'multi'))!=='SIM'||value(row,'tracking')||value(row,'postcode'))fail(`Pacote incompleto ou linhas reordenadas antes da linha ${row.number}. Exporte novamente.`);
    current.products.push(product);if(current.products.length===current.expected)finish();
   }else{finish();const single=group(row,id);single.expected=1;single.products.push(product);groups.push(single);}
  }
  finish();if(!groups.length)fail('O relatório não contém vendas.');
  return {groups,source,sheet,products:groups.reduce((n,g)=>n+g.products.length,0)};
 }
 function productsFor(label,invoice,sales){
  const m=root.LocalInvoices.labelIdentity(label),byShip=sales.groups.filter(g=>g.shipmentId===m.shipmentId),bySale=m.saleId?sales.groups.filter(g=>g.id===m.saleId):[];
  if(m.saleIds?.length>1)fail('A etiqueta contém números de venda/pacote ambíguos. Confira o pedido.');
  if(byShip.length!==1)fail(`Envio ${m.shipmentId}: ${byShip.length?'rastreamento repetido':'não encontrado'} no Excel. Selecione o relatório dos mesmos pedidos.`);
  const group=byShip[0];if(m.saleId&&(bySale.length!==1||bySale[0]!==group))fail('O número de venda/pacote do Excel diverge da etiqueta.');
  if(group.postcode!==invoice.postcode)fail('O CEP do Excel diverge do DANFE.');
  if(group.products.some(p=>/CANCEL|DEVOL|REEMBOLS/.test(fold(p.status))))fail('O relatório indica cancelamento ou devolução neste pedido. Confira na plataforma.');
  const fiscal=invoice.pages.flatMap(p=>p.products||[]);if(!fiscal.length||invoice.pages.some(p=>p.productError))fail('Não foi possível conferir os produtos da NF com o Excel.');
  const buckets=new Map();
  const title=s=>fold(stripVariant(s));
  for(const p of fiscal){
   const itemId=/^(MLB\d+)(?:_|$)/.exec(p.code)?.[1],q=Number(p.quantity.replace(/\./g,'').replace(',','.'));
   if(!itemId||!['UN','UND','UNID','UNIDADE','UNIDADES'].includes(fold(p.unit))||!Number.isSafeInteger(q)||q<1)fail('Código ou unidade da NF não permite conferir este produto com o relatório.');
   const key=itemId+'|'+title(p.description);if(!buckets.has(key))buckets.set(key,{quantity:0,products:[],market:[]});const b=buckets.get(key);b.quantity+=q;b.products.push(p);
  }
  for(const p of group.products){const b=buckets.get(p.itemId+'|'+title(p.title));if(!b)fail('Há produto do Excel que não corresponde ao anúncio e à descrição da NF.');b.market.push(p);}
  const result=[];
  for(const b of buckets.values()){
   if(b.market.reduce((n,p)=>n+p.quantity,0)!==b.quantity)fail('A quantidade de produtos do Excel diverge da NF.');
   // An explicit fiscal variation must agree; never override it from an export.
   if(b.products.some(p=>p.variation)){
    const variants=new Map();for(const p of b.products){if(!p.variation)fail('A NF mistura variações informadas e ausentes para o mesmo anúncio. Confira o pedido.');const k=fold(p.variation);variants.set(k,(variants.get(k)||0)+Number(p.quantity.replace(/\./g,'').replace(',','.')));}
    for(const p of b.market){const v=root.LocalPicking.variation(p.variation||'')||p.variation,k=fold(v);variants.set(k,(variants.get(k)||0)-p.quantity);}
    if([...variants.values()].some(n=>n!==0))fail('A variação do Excel diverge da variação escrita na NF.');
   }
   // These are order lines reconciled as a whole, not guessed fiscal row matches.
   for(const p of b.market)result.push({description:stripVariant(b.products[0].description),quantity:String(p.quantity),unit:b.products[0].unit,code:p.sku||p.itemId,variation:root.LocalPicking.variation(p.variation||'')||p.variation,variationSource:'sales',orderId:p.orderId,source:p.source,sheet:p.sheet,sourceRow:p.row});
  }
  return {products:result,source:group.source,sheet:group.sheet,row:group.row,id:group.id,shipmentId:group.shipmentId};
 }
 function apply(rows,labels,sales){return rows.map(row=>({...row,sales:productsFor(labels[row.labelIndex],row.invoice,sales)}));}
 // Picking from sales is an independent mode: an invoice is not its identity
 // or quantity source. Require both order and shipment IDs plus destination CEP.
 function orderFor(label,sales){
  const m=root.LocalInvoices.labelIdentity(label);
  if(!/^\d{8,15}$/.test(m.shipmentId||'')||!/^\d{8,20}$/.test(m.saleId||'')||m.saleIds?.length>1||!/^\d{8}$/.test(m.postcode||''))fail('A etiqueta precisa informar um único envio, pedido/pacote e CEP em texto para conferir com o Excel. Selecione o ZPL original.');
  const shipments=sales.groups.filter(g=>g.shipmentId===m.shipmentId),orders=sales.groups.filter(g=>g.id===m.saleId);
  if(shipments.length!==1)fail(`Envio ${m.shipmentId}: ${shipments.length?'rastreamento repetido':'não encontrado'} no Excel. Selecione o relatório que contém este pedido.`);
  const group=shipments[0];
  if(orders.length!==1||orders[0]!==group)fail('O número de venda/pacote do Excel diverge da etiqueta ou está repetido. Selecione o relatório correto.');
  if(group.postcode!==m.postcode)fail('O CEP do Excel diverge da etiqueta. Confira o pedido na plataforma e selecione os arquivos corretos.');
  if(!group.products.length||group.products.length!==group.expected)fail('O pacote do Excel está incompleto. Exporte novamente, sem remover ou ordenar suas linhas internas.');
  if(group.products.some(p=>/CANCEL|DEVOL|REEMBOLS/.test(fold(p.status))))fail('O relatório indica cancelamento ou devolução neste pedido. Confira na plataforma.');
  const products=group.products.map(p=>{
   if(!/^MLB\d+$/.test(p.itemId)||!p.title?.trim()||!Number.isSafeInteger(p.quantity)||p.quantity<1)fail('Produto ou quantidade inválida no pedido do Excel. Exporte novamente.');
   return {description:p.title,quantity:String(p.quantity),unit:'UNID',code:p.sku||p.itemId,variation:root.LocalPicking.variation(p.variation||'')||p.variation,variationSource:'sales',orderId:p.orderId,source:p.source,sheet:p.sheet,sourceRow:p.row};
  });
  return {key:'sales:'+group.id,id:group.id,shipmentId:group.shipmentId,postcode:group.postcode,products,source:group.source,sheet:group.sheet,row:group.row};
 }
 function fiscalCheck(label,read){
  if(!read.invoices?.length&&!read.problems?.length)return 'DANFE não fornecido; ficha baseada no Excel.';
  const m=root.LocalInvoices.labelIdentity(label);
  if(!m.invoiceNumber)return 'Etiqueta sem número de NF; nenhuma nota foi associada. Ficha baseada no Excel.';
  const matches=(read.invoices||[]).filter(n=>n.invoiceNumber===m.invoiceNumber);
  if(matches.length!==1)return `NF ${m.invoiceNumber}: ${matches.length?'número ambíguo nos PDFs':'não encontrada nos PDFs'}. Ficha baseada no Excel.`;
  if(matches[0].postcode!==m.postcode)return `NF ${m.invoiceNumber}: CEP diferente da etiqueta. A nota não foi vinculada; ficha baseada no Excel.`;
  try{productsFor(label,matches[0],read.sales);return `NF ${m.invoiceNumber}: produtos e quantidades também conferidos com o DANFE.${matches[0].postcodeSource==='delivery'?' CEP do local de entrega conferido.':''}`;}
  catch(error){return `NF ${m.invoiceNumber}: conferência complementar: ${error.message} A ficha usa os dados do Excel.`;}
 }
 function pair(labels,read){
  if(!labels.length||labels.length>1000)fail('Selecione entre 1 e 1.000 etiquetas.');
  const shipments=new Set(),orders=new Set();
  return labels.map((label,labelIndex)=>{
   const order=orderFor(label,read.sales);
   if(shipments.has(order.shipmentId)||orders.has(order.id))fail('Envio ou pedido repetido nas etiquetas. Selecione um lote sem duplicidades.');
   shipments.add(order.shipmentId);orders.add(order.id);
   return {labelIndex,order,sales:order,shipmentId:order.shipmentId,fiscalCheck:fiscalCheck(label,read)};
  });
 }
 async function review(labels,read,options={}){
  const duplicates=options.duplicates||[],sourceProblems=options.sourceProblems||[];
  const items=[],validLabels=[],rows=[],issues=[],warnings=[];
  const identities=labels.map(l=>root.LocalInvoices.labelIdentity(l));
  for(let index=0;index<labels.length;index++){
   const label=labels[index],m=identities[index],item={labelIndex:index,shipmentId:m.shipmentId||'',invoiceNumber:m.invoiceNumber||'',labelPostcode:m.postcode||'',source:label.source||`Etiqueta ${index+1}`,ready:false};
   try{
    const order=orderFor(label,read.sales);
    if(identities.filter(other=>other.shipmentId===m.shipmentId||other.saleId===m.saleId).length!==1)fail('Envio ou pedido repetido nas etiquetas. Selecione um lote sem duplicidades.');
    rows.push({labelIndex:validLabels.length,order,sales:order,shipmentId:order.shipmentId,fiscalCheck:fiscalCheck(label,read)});
    validLabels.push(label);item.ready=true;
   }catch(error){Object.assign(item,{code:'sales',message:error.message});issues.push(`Etiqueta ${index+1}: ${error.message}`);}
   items.push(item);
  }
  if(!labels.length||labels.length>1000)issues.push('Selecione entre 1 e 1.000 etiquetas.');
  issues.push(...sourceProblems.map(p=>`${p.source}: ${p.message}`));
  const labelDuplicates=duplicates.filter(d=>d.kind==='labels');
  if(labelDuplicates.length)issues.push('Há arquivos de etiquetas idênticos. Use “Remover cópias idênticas” antes de conferir novamente.');
  let pages=null,layoutReady=false;
  if(rows.length&&labels.length<=1000){
   try{
    const layout=await root.LocalPicking.planOrders(rows,await root.PDFLib.PDFDocument.create());let nextPage=1;
    for(const row of rows){const count=layout.layouts.get(row.order.key).sheets.length;row.labelPage=nextPage;row.invoiceStart=nextPage+1;row.invoiceEnd=nextPage+count;nextPage+=1+count;}
    if(nextPage-1>1000)fail('O PDF final ultrapassaria 1.000 páginas. Divida o lote.');
    pages=nextPage-1;layoutReady=true;
   }catch(error){issues.push(error.message);}
  }
  const matched=new Set(rows.map(r=>r.order.id)),scope={total:read.sales.groups.length,matched:matched.size,ignored:read.sales.groups.filter(g=>!matched.has(g.id)).length};
  const products=rows.reduce((n,r)=>n+r.order.products.length,0),missing=rows.reduce((n,r)=>n+r.order.products.filter(p=>!p.variation).length,0);
  if(missing)warnings.push(`${missing} item(ns) sem variação no Excel. ${root.LocalPicking.missingSalesVariation} Nenhuma cor ou aroma foi deduzido.`);
  if(read.invoices?.length||read.problems?.length){
   warnings.push('DANFEs usados apenas para conferência complementar. As fichas seguem produtos, quantidades e variações do Excel.');
   warnings.push(...rows.filter(r=>!r.fiscalCheck.includes('também conferidos')).map(r=>'Envio '+r.shipmentId+' — '+r.fiscalCheck));
   warnings.push(...(read.problems||[]).map(p=>`${p.source}${p.page?', página '+p.page:''}: ${p.message}`));
  }
  for(const name of options.ignored||[])warnings.push('Anexo do ZIP não incorporado: '+name+'.');
  const ready=layoutReady&&rows.length===labels.length&&!issues.length;
  const partialReady=!ready&&layoutReady&&!labelDuplicates.length;
  const counts={labels:labels.length,invoices:read.invoices?.length||0,products,pages:ready?pages:null};
  const subsetReport={ready:layoutReady,paired:true,mode:'picking',salesSource:true,rows,counts:{...counts,labels:rows.length,pages},issues:[],warnings,scope};
  return {ready,partialReady,paired:true,mode:'picking',salesSource:true,rows,counts,scope,issues,warnings,items,unmatchedInvoices:[],invoiceProblems:[],sourceProblems,duplicates,uncertain:false,confirmedCount:rows.length,pendingCount:items.filter(i=>!i.ready).length,subset:layoutReady?{labels:validLabels,read,report:subsetReport}:null};
 }
 root.LocalSales=Object.freeze({read,parse,productsFor,apply,orderFor,pair,review});
})(globalThis);
