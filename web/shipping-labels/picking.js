/* Read product cells using the PDF's drawn table grid, never by guessing which
 * nearby quantity belongs to a wrapped description. Unsupported grids stop. */
(function(root){
 'use strict';
 const fold=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
 const fail=s=>{throw Error(s);};
 const near=(a,b)=>Math.abs(a-b)<0.7;
 function tableLines(operators){
  const {OPS,Util}=root.LocalPdfJs,lines=[],stack=[];let matrix=[1,0,0,1,0,0];
  const point=(x,y)=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]];
  function segment(a,b){if(!a||!b)return;const p=point(...a),q=point(...b);if(near(p[1],q[1])||near(p[0],q[0]))lines.push({x1:Math.min(p[0],q[0]),x2:Math.max(p[0],q[0]),y1:Math.min(p[1],q[1]),y2:Math.max(p[1],q[1])});}
  for(let i=0;i<operators.fnArray.length;i++){
   const op=operators.fnArray[i],args=operators.argsArray[i];
   if(op===OPS.save)stack.push(matrix.slice());
   else if(op===OPS.restore)matrix=stack.pop()||matrix;
   else if(op===OPS.transform)matrix=Util.transform(matrix,args);
   else if(op===OPS.paintFormXObjectBegin){stack.push(matrix.slice());if(args[0])matrix=Util.transform(matrix,args[0]);}
   else if(op===OPS.paintFormXObjectEnd)matrix=stack.pop()||matrix;
   else if(op===OPS.constructPath&&[OPS.stroke,OPS.closeStroke,OPS.fillStroke,OPS.eoFillStroke,OPS.closeFillStroke,OPS.closeEOFillStroke].includes(args[0])){
    const data=args[1]?.[0];if(!ArrayBuffer.isView(data)&&!Array.isArray(data))continue;
    let at=0,current=null,start=null;
    while(at<data.length){
     const action=data[at++];
     if(action===0){current=[data[at++],data[at++]];start=current;}
     else if(action===1){const next=[data[at++],data[at++]];segment(current,next);current=next;}
     else if(action===2){at+=4;current=[data[at++],data[at++]];}
     else if(action===3){at+=2;current=[data[at++],data[at++]];}
     else if(action===4){segment(current,start);current=start;}
     else break;
    }
   }
  }
  return lines;
 }
 const variantMatch=description=>description.match(/(?:COR(?:ES)?\s+E\s+AROMAS?(?:\s+PADR[ÃA]O)?|COR(?:ES)?|VARIA[ÇC][ÃA]O|AROMA|TAMANHO)\s*:\s*(.+)$/i);
 function variation(description){
  const match=variantMatch(description);
  return match?match[1].trim():null;
 }
 function extract(items,operators){
  const texts=items.filter(i=>i.str?.trim()).map(i=>({...i,str:i.str.trim()}));
  const heads=texts.filter(i=>/^DADOS DO[S]? PRODUTO[S]?\s*\//.test(fold(i.str)));
  if(heads.length!==1)fail('Tabela de produtos não reconhecida neste modelo de DANFE.');
  const top=heads[0].transform[5];
  const ends=texts.filter(i=>/^(CALCULO DO ISSQN|DADOS ADICIONAIS)/.test(fold(i.str))&&i.transform[5]<top);
  if(!ends.length)fail('Não foi possível delimitar o final da tabela de produtos.');
  const bottom=Math.max(...ends.map(i=>i.transform[5]));
  const header=texts.filter(i=>i.transform[5]<top&&i.transform[5]>top-25);
  const find=re=>{const hits=header.filter(i=>re.test(fold(i.str)));if(hits.length!==1)fail('Colunas de produto, unidade e quantidade não reconhecidas com segurança.');return hits[0];};
  const anchors={code:find(/^CODIGO$/),description:find(/^DESCRICAO (?:DO[S]? )?PRODUTO/),unit:find(/^UN(?:ID)?\.?$/),quantity:find(/^(?:QTD|QUANT(?:IDADE)?)\.?$/)};
  const lines=tableLines(operators);
  const columns={};
  for(const [key,anchor] of Object.entries(anchors)){
   const x=anchor.transform[4]+anchor.width/2,y=anchor.transform[5]+anchor.height/3;
   const edges=lines.filter(l=>near(l.x1,l.x2)&&l.y1<=y&&l.y2>=y).map(l=>l.x1);
   const left=Math.max(...edges.filter(e=>e<x)),right=Math.min(...edges.filter(e=>e>x));
   if(!Number.isFinite(left)||!Number.isFinite(right))fail('Grade das colunas do DANFE não reconhecida.');
   columns[key]={left,right};
  }
  const headerBottom=Math.min(...Object.values(anchors).map(a=>a.transform[5]))-1;
  const boundaries=[...new Set(lines.filter(l=>near(l.y1,l.y2)&&l.x1<=columns.description.left+1&&l.x2>=columns.quantity.right-1&&l.y1<headerBottom&&l.y1>bottom).map(l=>Math.round(l.y1*10)/10))].sort((a,b)=>b-a);
  if(boundaries.length<2)fail('Linhas de produtos não reconhecidas na grade do DANFE.');
  const body=texts.filter(i=>i.transform[5]<Math.max(...boundaries)&&i.transform[5]>bottom);
  const cellItems=(column,hi,lo)=>body.filter(i=>{
   const x=i.transform[4]+i.width/2,y=i.transform[5];return x>column.left&&x<column.right&&y<hi&&y>lo;
  });
  const joined=values=>{
   const rows=[];for(const item of [...values].sort((a,b)=>b.transform[5]-a.transform[5]||a.transform[4]-b.transform[4])){
    let row=rows.find(r=>Math.abs(r.y-item.transform[5])<1);if(!row){row={y:item.transform[5],items:[]};rows.push(row);}row.items.push(item);
   }
   return rows.map(row=>row.items.sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join(' ')).join(' ');
  };
  const products=[],consumed=new Set();
  for(let index=0;index<boundaries.length-1;index++){
   const cells=Object.fromEntries(Object.entries(columns).map(([key,column])=>[key,cellItems(column,boundaries[index],boundaries[index+1])]));
   if(Object.values(cells).every(v=>!v.length))continue;
   const description=joined(cells.description),quantity=joined(cells.quantity),unit=joined(cells.unit),code=joined(cells.code).replace(/\s+_/g,'_');
   if(!description||!code||!unit||!/^\d+(?:\.\d{3})*(?:,\d+)?$/.test(quantity)||Number(quantity.replace(/\./g,'').replace(',','.'))<=0)fail('Há um produto sem descrição, código, unidade ou quantidade legível.');
   if(cells.quantity.length!==1||cells.unit.length!==1)fail('Mais de uma quantidade na mesma linha. Confira o modelo de DANFE.');
   for(const cell of Object.values(cells))for(const item of cell){consumed.add(item);}
   products.push({description,quantity,unit,code,variation:variation(description)});
  }
  if(!products.length)fail('Nenhum produto com quantidade identificado na nota.');
  for(const column of Object.values(columns))for(const item of cellItems(column,Math.max(...boundaries),bottom))if(!consumed.has(item))fail('Há texto de produto fora das linhas reconhecidas. A ficha foi interrompida para evitar omissão.');
  return products;
 }
 function wrap(text,font,size,width){
  const lines=[];let line='';
  for(const word of text.replace(/\s+/g,' ').trim().split(' ')){
   if(font.widthOfTextAtSize(word,size)>width){
    if(line){lines.push(line);line='';}let part='';for(const char of word){if(font.widthOfTextAtSize(part+char,size)>width){lines.push(part);part='';}part+=char;}line=part;
   }else if(line&&font.widthOfTextAtSize(line+' '+word,size)>width){lines.push(line);line=word;}else line+=(line?' ':'')+word;
  }
  if(line)lines.push(line);return lines;
 }
 const W=100/25.4*72,H=150/25.4*72,MARGIN=12;
 const CONTENT_TOP=H-65,CONTENT_BOTTOM=30,CONTENT_HEIGHT=CONTENT_TOP-CONTENT_BOTTOM;
 const MAX_ITEMS=4,MIN_DESCRIPTION_SIZE=10;
 async function plan(invoices,output,rows=[]){
  const records=invoices.map(invoice=>{
   const errors=invoice.pages.filter(p=>p.productError);
   if(errors.length)fail(`NF ${invoice.invoiceNumber}: ${errors[0].productError} Use o DANFE completo ou envie um PDF com a tabela de produtos reconhecível.`);
   const sales=rows.find(row=>row.invoice.key===invoice.key)?.sales;
   return {key:invoice.key,name:'NF '+invoice.invoiceNumber,products:sales?sales.products:invoice.pages.flatMap(p=>p.products||[]),sales:Boolean(sales)};
  });
  return planRecords(records,output);
 }
 async function planOrders(rows,output){
  return planRecords(rows.map(({order})=>({key:order.key,name:'Pedido '+order.id,products:order.products,sales:true,order:true})),output);
 }
 async function planRecords(records,output){
  const {StandardFonts}=root.PDFLib,regular=await output.embedFont(StandardFonts.Helvetica),bold=await output.embedFont(StandardFonts.HelveticaBold);
  const layouts=new Map();
  for(const record of records){
   const {products}=record;if(!products.length)fail(`${record.name}: nenhum produto encontrado.`);
   function cardAt(index,size){
    const p=products[index],match=variantMatch(p.description);
    // Move an explicit variation to its own line without printing it twice.
    // Keep the source product intact, including quantity, SKU and kit contents.
    const title=match&&match[1].trim()===p.variation
     ?p.description.slice(0,match.index).replace(/\s*[-·|:]\s*$/,'').trim()||p.description
     :p.description;
    const width=W-2*MARGIN,description=wrap(title,bold,size,width);
    const variantSize=p.variation?Math.min(11,size-1):8.5,variantFont=p.variation?bold:regular;
    const variantText=p.variationSource==='sales'?(p.variation?'COR / AROMA: '+p.variation:'Conferir personalização no pedido'):match&&match[1].trim()===p.variation
     ?match[0].trim():'COR / VAR.: '+(p.variation||'Não informada na NF; conferir no pedido');
    const variant=wrap(variantText,variantFont,variantSize,width);
    const sku=wrap('CÓDIGO: '+p.code,regular,7,width);
    const quantity=p.quantity+' '+p.unit.toUpperCase();
    const quantitySize=Math.min(size+3,16,110/bold.widthOfTextAtSize(quantity,1));
    if(quantitySize<10)fail(`${record.name}: quantidade ou unidade extensa demais para a ficha.`);
    const height=29+description.length*(size+1)+variant.length*(variantSize+1)+sku.length*8+2;
    return {product:p,index,description,variant,variantSize,variantFont,sku,quantity,quantitySize,size,height};
   }
   const sheets=[];
   for(let start=0;start<products.length;){
    let count=Math.min(MAX_ITEMS,products.length-start),sheet;
    // Prefer more whole items per sheet. Never shrink product text below 10 pt,
    // truncate a description, merge variations or split one item across pages.
    for(;count>0;count--){
     sheet=Array.from({length:count},(_,i)=>cardAt(start+i,MIN_DESCRIPTION_SIZE));
     if(sheet.reduce((sum,card)=>sum+card.height,0)<=CONTENT_HEIGHT)break;
    }
    if(!count)fail(`${record.name}, item ${start+1}: descrição longa demais para uma ficha legível. Confira este pedido separadamente.`);
    const largest=count<=2?14:count===3?13:12;
    for(let size=largest;size>MIN_DESCRIPTION_SIZE;size--){
     const candidate=Array.from({length:count},(_,i)=>cardAt(start+i,size));
     if(candidate.reduce((sum,card)=>sum+card.height,0)<=CONTENT_HEIGHT){sheet=candidate;break;}
    }
    sheets.push(sheet);start+=count;
   }
   layouts.set(record.key,{products,sheets,sales:record.sales,order:record.order});
  }
  return {regular,bold,layouts};
 }
 function draw(output,row,layout){
  const {rgb}=root.PDFLib,black=rgb(0,0,0),{regular,bold}=layout;
  const invoiceLayout=layout.layouts.get(row.order?.key||row.invoice.key),pages=[];
  for(let si=0;si<invoiceLayout.sheets.length;si++){
   const page=output.addPage([W,H]);pages.push(page);
   const text=(value,x,y,size,font=regular)=>page.drawText(value,{x,y,size,font,color:black});
   const sheet=invoiceLayout.sheets[si];
   const right=(value,y,size,font=regular)=>text(value,W-MARGIN-font.widthOfTextAtSize(value,size),y,size,font);
   text('HARMONY STORE OFICIAL - EXPEDIÇÃO',MARGIN,H-13,7,bold);
   text('FICHA DE SEPARAÇÃO',MARGIN,H-30,13,bold);
   right(row.order?'EXCEL':'NF '+row.invoice.invoiceNumber,H-30,row.order?8:10.5,bold);
   text('ENVIO '+row.shipmentId,MARGIN,H-43,9,bold);
   right(`FICHA ${si+1}/${invoiceLayout.sheets.length}`,H-43,8,bold);
   const range=`ITENS ${sheet[0].index+1} A ${sheet.at(-1).index+1} DE ${invoiceLayout.products.length}`;
   if(row.order){text('PEDIDO '+row.order.id,MARGIN,H-55,7.5,bold);right(range,H-55,7,bold);}
   else text(range,MARGIN,H-55,7.5,bold);
   page.drawLine({start:{x:MARGIN,y:H-61},end:{x:W-MARGIN,y:H-61},thickness:0.8,color:black});
   const extra=Math.min(16,(CONTENT_HEIGHT-sheet.reduce((sum,c)=>sum+c.height,0))/sheet.length);
   let top=CONTENT_TOP;
   for(const card of sheet){
    page.drawRectangle({x:MARGIN,y:top-14,width:8,height:8,borderWidth:0.6,borderColor:black});
    text('ITEM '+(card.index+1),MARGIN+14,top-13,8.5,bold);
    const quantityX=W-MARGIN-bold.widthOfTextAtSize(card.quantity,card.quantitySize);
    const quantityLabel=row.order?'QTD. DO PEDIDO':invoiceLayout.sales?'QTD. CONFERIDA':'QTD. NA NOTA';
    text(quantityLabel,quantityX-6-bold.widthOfTextAtSize(quantityLabel,7),top-12,7,bold);
    text(card.quantity,quantityX,top-14,card.quantitySize,bold);
    let y=top-29;
    for(const line of card.description){text(line,MARGIN,y,card.size,bold);y-=card.size+1;}
    for(const line of card.variant){text(line,MARGIN,y,card.variantSize,card.variantFont);y-=card.variantSize+1;}
    for(const line of card.sku){text(line,MARGIN,y,7);y-=8;}
    top-=card.height+extra;
    page.drawLine({start:{x:MARGIN,y:top},end:{x:W-MARGIN,y:top},thickness:0.5,color:black});
   }
   text(row.order?'Produtos, quantidades e variações do relatório de vendas.':invoiceLayout.sales?'Variações do Excel. Quantidades conferidas com a NF.':'Quantidade da NF. Peças dos kits permanecem na descrição.',MARGIN,20,7);
   text('USO INTERNO - NÃO É DOCUMENTO FISCAL',MARGIN,10,7,bold);
  }
  return pages;
 }
 root.LocalPicking={extract,variation,plan,planOrders,draw};
})(globalThis);
