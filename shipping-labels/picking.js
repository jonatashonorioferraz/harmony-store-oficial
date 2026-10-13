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
 function variation(description){
  const match=description.match(/(?:COR(?:ES)?\s+E\s+AROMAS?(?:\s+PADR[ÃA]O)?|COR(?:ES)?|VARIA[ÇC][ÃA]O|AROMA|TAMANHO)\s*:\s*(.+)$/i);
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
 async function plan(invoices,output){
  const {StandardFonts}=root.PDFLib,regular=await output.embedFont(StandardFonts.Helvetica),bold=await output.embedFont(StandardFonts.HelveticaBold);
  const layouts=new Map();
  for(const invoice of invoices){
   const errors=invoice.pages.filter(p=>p.productError);
   if(errors.length)fail(`NF ${invoice.invoiceNumber}: ${errors[0].productError} Use o DANFE completo ou envie um PDF com a tabela de produtos reconhecível.`);
   const products=invoice.pages.flatMap(p=>p.products||[]);if(!products.length)fail(`NF ${invoice.invoiceNumber}: nenhum produto encontrado.`);
   const cards=products.map((p,index)=>{
    const description=wrap(p.description,bold,13,251),sku=wrap('CÓDIGO: '+p.code,regular,8,251);
    const variant=wrap(p.variation||'Não informada na nota — conferir no pedido',bold,11,251);
    const height=20+description.length*16+7+sku.length*10+19+variant.length*14+45;
    if(height>278)fail(`NF ${invoice.invoiceNumber}, item ${index+1}: descrição longa demais para uma ficha legível. Use o DANFE completo para este pedido.`);
    return {product:p,index,description,sku,variant,height};
   });
   const sheets=[];let sheet=[],used=0;
   for(const card of cards){if(sheet.length&&used+card.height+12>278){sheets.push(sheet);sheet=[];used=0;}sheet.push(card);used+=card.height+12;}
   if(sheet.length)sheets.push(sheet);layouts.set(invoice.key,{products,sheets});
  }
  return {regular,bold,layouts};
 }
 function draw(output,row,layout){
  const {rgb}=root.PDFLib,W=100/25.4*72,H=150/25.4*72,black=rgb(0,0,0),{regular,bold}=layout;
  const invoiceLayout=layout.layouts.get(row.invoice.key),pages=[];
  for(let si=0;si<invoiceLayout.sheets.length;si++){
   const page=output.addPage([W,H]);pages.push(page);
   const text=(value,x,y,size,font=regular)=>page.drawText(value,{x,y,size,font,color:black});
   text('HARMONY STORE OFICIAL · EXPEDIÇÃO',16,H-20,8,bold);
   text('FICHA DE SEPARAÇÃO',16,H-44,18,bold);
   text('NF '+row.invoice.invoiceNumber,16,H-64,13,bold);
   const counter=`${si+1}/${invoiceLayout.sheets.length}`;text(counter,W-16-regular.widthOfTextAtSize(counter,10),H-64,10);
   text('ENVIO '+row.shipmentId,16,H-82,10,bold);
   page.drawLine({start:{x:16,y:H-93},end:{x:W-16,y:H-93},thickness:1,color:black});
   let y=H-105;
   for(const card of invoiceLayout.sheets[si]){
    text(`ITEM ${card.index+1} DE ${invoiceLayout.products.length}`,16,y-8,8,bold);y-=27;
    for(const line of card.description){text(line,16,y,13,bold);y-=16;}
    y-=2;for(const line of card.sku){text(line,16,y,8);y-=10;}
    y-=9;text('COR / VARIAÇÃO NA DESCRIÇÃO',16,y,8,bold);y-=16;
    for(const line of card.variant){text(line,16,y,11,bold);y-=14;}
    y-=8;text('QTD. NA NOTA',16,y-5,9,bold);
    const quantity=card.product.quantity+' '+card.product.unit.toUpperCase();
    const size=Math.min(22,140/bold.widthOfTextAtSize(quantity,1));
    if(size<10)fail(`NF ${row.invoice.invoiceNumber}: quantidade ou unidade extensa demais para a ficha.`);
    text(quantity,112,y-8,size,bold);y-=29;
    page.drawLine({start:{x:16,y},end:{x:W-16,y},thickness:0.6,color:black});y-=12;
   }
   text('Quantidade conforme a NF. Composição na descrição.',16,29,7.5);
   text('USO INTERNO · NÃO É DOCUMENTO FISCAL',16,15,7.5,bold);
  }
  return pages;
 }
 root.LocalPicking={extract,variation,plan,draw};
})(globalThis);
