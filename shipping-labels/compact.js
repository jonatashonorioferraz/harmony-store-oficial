/* Beta: lossless checklist glyph rearrangement, no OCR or sales writes. */
(function(root){
 'use strict';
 const bit=(p,x,y)=>x>=0&&y>=0&&x<p.width&&y<p.height&&!!(p.raw[y*p.stride+(x>>3)]&(128>>(x%8)));
 const blank=(width,height)=>({width,height,stride:Math.ceil(width/8),raw:new Uint8Array(Math.ceil(width/8)*height),kind:'bitmap'});
 const put=(p,x,y)=>{if(x<0||y<0||x>=p.width||y>=p.height)throw Error('A lista não cabe em uma página. Use o conversor normal para este pedido.');p.raw[y*p.stride+(x>>3)]|=128>>(x%8);};
 function cut(p,x,y,w,h){const out=blank(w,h);for(let j=0;j<h;j++)for(let i=0;i<w;i++)if(bit(p,x+i,y+j))put(out,i,j);return out;}
 function paste(out,p,x,y,scale=1,scaleY=scale){for(let j=0;j<Math.round(p.height*scaleY);j++)for(let i=0;i<Math.round(p.width*scale);i++)if(bit(p,Math.floor(i/scale),Math.floor(j/scaleY)))put(out,x+i,y+j);}
 function trim(p){let l=p.width,r=-1,t=p.height,b=-1;for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++)if(bit(p,x,y)){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}return r<0?blank(0,0):cut(p,l,t,r-l+1,b-t+1);}
 function bands(values){const runs=[];for(const n of values){const last=runs.at(-1);if(last&&n===last[1]+1)last[1]=n;else runs.push([n,n]);}return runs;}
 // Split only word-sized blank gaps. Every source ink pixel is copied unchanged.
 function words(p){const ys=[];for(let y=0;y<p.height;y++){for(let x=0;x<p.width;x++)if(bit(p,x,y)){ys.push(y);break;}}
  const result=[];for(const [a,b] of bands(ys)){const xs=[];for(let x=0;x<p.width;x++)for(let y=a;y<=b;y++)if(bit(p,x,y)){xs.push(x);break;}
   const letters=bands(xs),parts=[];for(const r of letters){const last=parts.at(-1);if(last&&r[0]-last[1]<7)last[1]=r[1];else parts.push([...r]);}
   for(const [l,r] of parts)result.push(cut(p,l,a,r-l+1,b-a+1));
  }return result;
 }
 const key=p=>p.width+'x'+p.height+':'+Array.from(p.raw).join(',');
 function lines(p,width){const out=[];let row=[],w=0;for(const word of words(p)){if(word.width>width)throw Error('Texto extenso demais para o formato compacto. Use o conversor normal.');if(w&&w+8+word.width>width){out.push(row);row=[];w=0;}row.push(word);w+=(w?8:0)+word.width;}if(row.length)out.push(row);return out;}
 function lineHeight(row){return Math.max(...row.map(w=>w.height));}
 function drawLines(out,rows,x,y,gap=5){for(const row of rows){let px=x;const h=lineHeight(row);for(const word of row){paste(out,word,px,y+h-word.height);px+=word.width+8;}y+=h+gap;}return y;}
 function planList(groups,gaps){
  let y=1038,bottom=y;const operations=[];
  const height=rows=>rows.reduce((n,row)=>n+lineHeight(row)+gaps.line,0);
  for(const group of groups){const title=lines(group.title,768),th=height(title);operations.push({rows:title,x:24,y});bottom=Math.max(bottom,y+th-gaps.line);y+=th;
   for(const v of group.variants){const rows=lines(v.variation,650),h=Math.max(v.quantity.height,height(rows),15);
    operations.push({rows,x:46,y,quantity:v.quantity});bottom=Math.max(bottom,y+h);y+=h+gaps.variant;
   }y+=gaps.group;
  }return {operations,end:y,bottom,gap:gaps.line};
 }
 function inlineList(groups){
  let y=1038,bottom=y;const operations=[];
  const separator=blank(2,14);for(let j=0;j<14;j++){put(separator,0,j);put(separator,1,j);}
  for(const group of groups)for(const v of group.variants){
   const tokens=[...words(group.title),...(v.variation.width?[separator,...words(v.variation)]:[])];
   const rows=[];let row=[],width=0;const quantityX=792-v.quantity.width;
   // Keep quantity beside the first line; subsequent lines use the full width.
   for(const word of tokens){const limit=rows.length?746:quantityX-46-12;
    if(word.width>limit)return null;
    if(width&&width+8+word.width>limit){rows.push(row);row=[];width=0;}
    row.push(word);width+=(width?8:0)+word.width;
   }if(row.length)rows.push(row);
   const h=rows.reduce((n,r)=>n+lineHeight(r)+3,0);
   operations.push({rows,x:46,y,quantity:v.quantity,quantityX});bottom=y+Math.max(h-3,v.quantity.height);y+=Math.max(h,v.quantity.height)+5;
  }
  return bottom<=1200&&y<=1208?{operations,end:y,bottom,gap:3,inline:true}:null;
 }
 function fitList(groups){
  for(const gaps of [{line:5,variant:7,group:4},{line:2,variant:3,group:3}]){const plan=planList(groups,gaps);if(plan.bottom<=1200&&plan.end<=1208)return plan;}
  return inlineList(groups);
 }
 function barcodeModel(p){
  if(p.width!==816||p.height!==1218)throw Error('Tamanho de etiqueta ainda não suportado no beta. Use o conversor normal.');
  let bars=0;for(let x=0;x<816;x++){const value=bit(p,x,1079);if(value)bars++;for(let y=1080;y<=1139;y++)if(bit(p,x,y)!==value)throw Error('Modelo de código DANFE diferente do testado. Use o conversor normal.');}
  if(bars<100||bars>450)throw Error('Código DANFE não identificado no modelo testado.');
  for(let x=0;x<816;x++)if((x<64||x>=752)&&bit(p,x,1079))throw Error('Barras do DANFE fora da área suportada. Use o conversor normal.');
  for(let y=1140;y<p.height;y++)for(let x=0;x<p.width;x++)if(bit(p,x,y))throw Error('Conteúdo adicional abaixo do DANFE. Use o conversor normal.');
 }

 function pacParts(label){
  // PAC Industrial has three linear codes and two square codes above the DANFE.
  // Keep every code at native horizontal resolution, with explicit model guards.
  const upper=cut(label,0,0,816,1075);
  const specs=[
   {rect:[35,100,144,144],x:88,y:86,square:true},
   {rect:[74,263,660,147],x:70,y:226},
   {rect:[460,488,338,147],x:453,y:413},
   {rect:[11,862,626,109],x:25,y:726,height:80},
   {rect:[654,860,145,145],x:650,y:718,square:true}
  ];
  const codes=specs.map(spec=>{const [x,y,w,h]=spec.rect,p=cut(label,x,y,w,h);
   if(!spec.square){let count=0;for(let i=0;i<w;i++)if(bit(p,i,10))count++;
    if(count<50||count>w*.8)throw Error('Código PAC Industrial não identificado. Use o conversor normal.');
    for(let j=5;j<h-5;j++)for(let i=0;i<w;i++)if(bit(p,i,j)!==bit(p,i,10))throw Error('Modelo PAC Industrial diferente do testado. Use o conversor normal.');
   }
   for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)upper.raw[j*upper.stride+(i>>3)]&=~(128>>(i%8));
   return {...spec,p,height:spec.height||(spec.square?h:Math.round(h*.85))};
  });return {upper,codes,pac:true};
 }
 function shippingParts(label){
  if(root.LocalShopee.glyphId(label,'pac'))return pacParts(label);
  const upper=cut(label,0,0,816,1075),tracking=cut(label,40,690,496,115);
  let count=0;for(let x=0;x<tracking.width;x++)if(bit(tracking,x,20))count++;
  if(count<50||count>350)throw Error('Barras de rastreamento não identificadas no modelo testado.');
  for(let y=3;y<111;y++)for(let x=0;x<tracking.width;x++)if(bit(tracking,x,y)!==bit(tracking,x,20))throw Error('Modelo de barras de rastreamento diferente do testado. Use o conversor normal.');
  for(let y=690;y<805;y++)for(let x=40;x<536;x++)upper.raw[y*upper.stride+(x>>3)]&=~(128>>(x%8));
  return {upper,tracking};
 }
 function compose(label,checklist){
  barcodeModel(label);const table=root.LocalShopee.layout(checklist);if(!table||!table.rows.length)throw Error('Checklist não reconhecido.');
  const id=root.LocalShopee.glyphId(label,'shipping');if(!id||id!==root.LocalShopee.glyphId(checklist,'checklist'))throw Error('IDs da etiqueta e do checklist não coincidem.');
  const groups=[];for(const row of table.rows){const cells=[0,1,2].map(i=>trim(cut(checklist,table.columns[i]+3,row.top,table.columns[i+1]-table.columns[i]-6,row.bottom-row.top)));
   if(!cells[0].width||!cells[2].width)throw Error('Produto ou quantidade ausente no checklist.');
   const titleKey=key(cells[0]);let group=groups.at(-1);if(!group||group.key!==titleKey){group={key:titleKey,title:cells[0],variants:[]};groups.push(group);}group.variants.push({variation:cells[1],quantity:cells[2]});
  }
  const out=blank(816,1224);
  const {upper,tracking,codes,pac}=shippingParts(label);
  const native=816*25.4/(203*100);
  paste(out,upper,61,4,.85);
  if(pac)for(const c of codes)paste(out,c.p,Math.round(c.x*native),Math.round(c.y*native),native,c.height/c.p.height*native);
  else paste(out,tracking,Math.round(40*native),591,native,.85);
  // Native 203 dpi bar widths; the 816-pixel source is slightly wider than 100 mm.
  paste(out,cut(label,64,1075,688,70),Math.round(55*native),918,native);
  for(let x=24;x<792;x++)put(out,x,998);
  paste(out,trim(pac?cut(label,380,82,260,18):cut(label,0,250,450,30)),24,1007);
  paste(out,trim(cut(checklist,950,233,55,30)),744,1007);
  const plan=fitList(groups);
  if(!plan)throw Error('Pedido '+id+': a lista não cabe sem reduzir a leitura, mesmo com espaçamento compacto. Use o conversor normal para este pedido.');
  for(const op of plan.operations){drawLines(out,op.rows,op.x,op.y,plan.gap);
   if(op.quantity){paste(out,op.quantity,op.quantityX??760,op.y);for(let i=0;i<12;i++){put(out,24+i,op.y+3);put(out,24+i,op.y+14);put(out,24,op.y+3+i);put(out,35,op.y+3+i);}}
  }
  return {page:out,label,id,items:table.rows.length};
 }
 function convert(batch){
  if(!batch.length||batch.length>40)throw Error('Selecione até 20 pedidos com etiqueta e checklist neste beta.');
  const labels=new Map(),lists=new Map();
  for(const [index,page] of batch.entries()){const rotated=root.LocalShopee.rotate(page),table=root.LocalShopee.layout(rotated),kind=table?'checklist':'shipping',p=table?rotated:page,id=root.LocalShopee.glyphId(p,kind),map=table?lists:labels;
   if(!id)throw Error('ID não reconhecido no '+(table?'checklist':'envio')+' da página '+(index+1)+'. Nenhum vínculo será presumido pela ordem das páginas. Use o conversor normal.');
   if(map.has(id))throw Error('Pedido repetido no arquivo: '+id+'. Selecione uma única cópia.');map.set(id,p);
  }
  if(labels.size!==lists.size||!labels.size)throw Error('Falta etiqueta ou checklist no arquivo.');
  return [...labels].map(([id,p])=>{if(!lists.has(id))throw Error('Checklist ausente para '+id);return compose(p,lists.get(id));});
 }
 async function createPdf(results){
  const mm=72/25.4,doc=await root.PDFLib.PDFDocument.create();
  for(const result of results){
   // Embed source at its final PDF scale, avoiding two successive raster reductions.
   const lower=cut(result.page,0,0,816,1224);lower.raw.fill(0,0,990*lower.stride);
   // Restore tracking bar widths too: 85% can collapse narrow modules at 203 dpi.
   const {upper,tracking,codes,pac}=shippingParts(result.label);
   if(pac){
    const danfe=cut(result.label,64,1075,688,70);
    const images=await root.LocalZpl.createPdf([lower,upper,danfe,...codes.map(c=>c.p)],203,'original');
    const embeds=await doc.embedPdf(await images.arrayBuffer(),Array.from({length:3+codes.length},(_,i)=>i));
    const page=doc.addPage([100*mm,150*mm]),dot=72/203,height=1075*85/816;
    page.drawPage(embeds[0],{x:0,y:0,width:100*mm,height:150*mm});
    page.drawPage(embeds[1],{x:7.5*mm,y:(150-.5-height)*mm,width:85*mm,height:height*mm});
    page.drawPage(embeds[2],{x:55*dot,y:150*mm-969*dot,width:688*dot,height:70*dot});
    codes.forEach((c,i)=>page.drawPage(embeds[i+3],{x:c.x*dot,y:150*mm-(c.y+c.height)*dot,width:c.p.width*dot,height:c.height*dot}));
    continue;
   }
   const danfe=cut(result.label,64,1075,688,70);
   const images=await root.LocalZpl.createPdf([lower,upper,tracking,danfe],203,'original');
   const [bottom,top,bars,fiscal]=await doc.embedPdf(await images.arrayBuffer(),[0,1,2,3]);
   const page=doc.addPage([100*mm,150*mm]);
   page.drawPage(bottom,{x:0,y:0,width:100*mm,height:150*mm});
   const height=1075*85/816;
   page.drawPage(top,{x:7.5*mm,y:(150-.5-height)*mm,width:85*mm,height:height*mm});
   // Align bar widths and their left edges to native 203 dpi dots. Resizing the
   // 816 px source to 100 mm otherwise drops dots from some Code 128 modules.
   const dot=72/203;
   page.drawPage(bars,{x:40*dot,y:150*mm-674*dot,width:496*dot,height:96*dot});
   page.drawPage(fiscal,{x:55*dot,y:150*mm-969*dot,width:688*dot,height:70*dot});
  }return new Blob([await doc.save()],{type:'application/pdf'});
 }
 root.ShopeeCompact=Object.freeze({convert,compose,createPdf,barcodeModel,shippingParts,cut,trim,words,lines,fitList});
})(globalThis);
