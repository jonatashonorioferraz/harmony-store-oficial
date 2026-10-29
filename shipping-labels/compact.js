/* Beta: lossless checklist glyph rearrangement, no OCR or sales writes. */
(function(root){
 'use strict';
 const bit=(p,x,y)=>x>=0&&y>=0&&x<p.width&&y<p.height&&!!(p.raw[y*p.stride+(x>>3)]&(128>>(x%8)));
 const blank=(width,height)=>({width,height,stride:Math.ceil(width/8),raw:new Uint8Array(Math.ceil(width/8)*height),kind:'bitmap'});
 const put=(p,x,y)=>{if(x<0||y<0||x>=p.width||y>=p.height)throw Error('A lista não cabe em uma página. Use o conversor normal para este pedido.');p.raw[y*p.stride+(x>>3)]|=128>>(x%8);};
 function cut(p,x,y,w,h){const out=blank(w,h);for(let j=0;j<h;j++)for(let i=0;i<w;i++)if(bit(p,x+i,y+j))put(out,i,j);return out;}
 function paste(out,p,x,y,scale=1){for(let j=0;j<Math.round(p.height*scale);j++)for(let i=0;i<Math.round(p.width*scale);i++)if(bit(p,Math.floor(i/scale),Math.floor(j/scale)))put(out,x+i,y+j);}
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
 function drawLines(out,rows,x,y){for(const row of rows){let px=x;const h=lineHeight(row);for(const word of row){paste(out,word,px,y+h-word.height);px+=word.width+8;}y+=h+5;}return y;}
 function barcodeModel(p){
  if(p.width!==816||p.height!==1218)throw Error('Tamanho de etiqueta ainda não suportado no beta. Use o conversor normal.');
  let bars=0;for(let x=0;x<816;x++){const value=bit(p,x,1079);if(value)bars++;for(let y=1080;y<=1139;y++)if(bit(p,x,y)!==value)throw Error('Modelo de código DANFE diferente do testado. Use o conversor normal.');}
  if(bars<100||bars>450)throw Error('Código DANFE não identificado no modelo testado.');
  for(let y=1140;y<p.height;y++)for(let x=0;x<p.width;x++)if(bit(p,x,y))throw Error('Conteúdo adicional abaixo do DANFE. Use o conversor normal.');
 }
 function compose(label,checklist){
  barcodeModel(label);const table=root.LocalShopee.layout(checklist);if(!table||!table.rows.length)throw Error('Checklist não reconhecido.');
  const id=root.LocalShopee.glyphId(label,'shipping');if(!id||id!==root.LocalShopee.glyphId(checklist,'checklist'))throw Error('IDs da etiqueta e do checklist não coincidem.');
  const groups=[];for(const row of table.rows){const cells=[0,1,2].map(i=>trim(cut(checklist,table.columns[i]+3,row.top,table.columns[i+1]-table.columns[i]-6,row.bottom-row.top)));
   if(!cells[0].width||!cells[2].width)throw Error('Produto ou quantidade ausente no checklist.');
   const titleKey=key(cells[0]);let group=groups.at(-1);if(!group||group.key!==titleKey){group={key:titleKey,title:cells[0],variants:[]};groups.push(group);}group.variants.push({variation:cells[1],quantity:cells[2]});
  }
  const out=blank(816,1224);
  paste(out,cut(label,0,0,816,1075),61,4,.85);
  // 1:1 source pixels, at the original physical width of 100 mm.
  paste(out,cut(label,0,1075,816,70),0,918);
  for(let x=24;x<792;x++)put(out,x,998);
  paste(out,trim(cut(label,0,250,450,30)),24,1007);
  paste(out,trim(cut(checklist,950,233,55,30)),744,1007);
  let y=1038;
  for(const group of groups){y=drawLines(out,lines(group.title,768),24,y);
   for(const v of group.variants){const rows=lines(v.variation,650),h=Math.max(v.quantity.height,rows.reduce((n,r)=>n+lineHeight(r)+5,0));
    if(y+h>1200)throw Error('Pedido '+id+': a lista não cabe sem reduzir a leitura. Use o conversor normal para este pedido.');
    drawLines(out,rows,46,y);paste(out,v.quantity,760,y);
    for(let i=0;i<12;i++){put(out,24+i,y+3);put(out,24+i,y+14);put(out,24,y+3+i);put(out,35,y+3+i);}y+=h+7;
   }y+=4;
  }
  if(y>1208)throw Error('Pedido '+id+': lista extensa demais. Use o conversor normal.');
  return {page:out,label,id,items:table.rows.length};
 }
 function convert(batch){
  if(!batch.length||batch.length>40)throw Error('Selecione até 20 pedidos com etiqueta e checklist neste beta.');
  const labels=new Map(),lists=new Map();
  for(const page of batch){const rotated=root.LocalShopee.rotate(page),table=root.LocalShopee.layout(rotated),kind=table?'checklist':'shipping',p=table?rotated:page,id=root.LocalShopee.glyphId(p,kind),map=table?lists:labels;
   if(!id)throw Error('ID não reconhecido. Nenhum vínculo será presumido pela ordem das páginas. Use o conversor normal.');
   if(map.has(id))throw Error('Pedido repetido no arquivo: '+id+'. Selecione uma única cópia.');map.set(id,p);
  }
  if(labels.size!==lists.size||!labels.size)throw Error('Falta etiqueta ou checklist no arquivo.');
  return [...labels].map(([id,p])=>{if(!lists.has(id))throw Error('Checklist ausente para '+id);return compose(p,lists.get(id));});
 }
 async function createPdf(results){
  const mm=72/25.4,doc=await root.PDFLib.PDFDocument.create();
  for(const result of results){
   // Embed source at its final PDF scale, avoiding two successive raster reductions.
   const lower=cut(result.page,0,0,816,1224);lower.raw.fill(0,0,918*lower.stride);
   const upper=cut(result.label,0,0,816,1075);
   const images=await root.LocalZpl.createPdf([lower,upper],203,'original');
   const [bottom,top]=await doc.embedPdf(await images.arrayBuffer(),[0,1]);
   const page=doc.addPage([100*mm,150*mm]);
   page.drawPage(bottom,{x:0,y:0,width:100*mm,height:150*mm});
   const height=1075*85/816;
   page.drawPage(top,{x:7.5*mm,y:(150-.5-height)*mm,width:85*mm,height:height*mm});
  }return new Blob([await doc.save()],{type:'application/pdf'});
 }
 root.ShopeeCompact=Object.freeze({convert,compose,createPdf,barcodeModel,cut,trim,words,lines});
})(globalThis);

