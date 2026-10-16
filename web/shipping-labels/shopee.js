/* Shopee bitmap checklists: local OCR, never a remote recognition service. */
(function(root){
 'use strict';
 const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
 const black=(p,x,y)=>x>=0&&y>=0&&x<p.width&&y<p.height&&Boolean(p.raw[y*p.stride+(x>>3)]&(128>>(x%8)));
 const glyphKey=g=>g.width+'x'+g.height+':'+g.bits;
 function glyphId(p,kind){
  const patterns=root.ShopeeIdFonts?.[kind];if(!patterns)return '';
  if(kind==='shipping'&&(p.width!==816||p.height!==1218)||kind==='checklist'&&(p.width!==1218||p.height!==816))return '';
  const [left,top,width,height]=kind==='shipping'?[135,255,300,23]:[208,173,171,24];
  const xs=[];for(let x=left;x<left+width;x++){for(let y=top;y<top+height;y++)if(black(p,x,y)){xs.push(x);break;}}
  const columns=runs(xs),dict=new Map(patterns.map(g=>[glyphKey(g),g.text]));let text='';
  for(let i=0;i<columns.length;i++){
   if(kind==='checklist'&&i&&columns[i][0]-columns[i-1][1]>5)break;
   const [a,b]=columns[i];let min=top+height,max=top;
   for(let y=top;y<top+height;y++)for(let x=a;x<=b;x++)if(black(p,x,y)){min=Math.min(min,y);max=Math.max(max,y);}
   let bits='';for(let y=min;y<=max;y++)for(let x=a;x<=b;x++)bits+=black(p,x,y)?'1':'0';
   const value=dict.get(glyphKey({width:b-a+1,height:max-min+1,bits}));if(!value)return '';text+=value;
  }
  return /^\d{6}[A-Z0-9]{8}$/.test(text)?text:'';
 }
 function rotate(p){
  const width=p.height,height=p.width,stride=Math.ceil(width/8),raw=new Uint8Array(stride*height);
  for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++)if(black(p,x,y)){const nx=p.height-1-y;raw[x*stride+(nx>>3)]|=128>>(nx%8);}
  return {width,height,stride,raw};
 }
 function runs(values){const out=[];for(const n of values){const last=out.at(-1);if(last&&n<=last[1]+1)last[1]=n;else out.push([n,n]);}return out;}
 function layout(p){
  const ys=[];for(let y=Math.floor(p.height*.15);y<p.height*.95;y++){let n=0;for(let x=0;x<p.width;x++)if(black(p,x,y))n++;if(n>p.width*.85)ys.push(y);}
  const lines=runs(ys);if(lines.length<2)return null;
  const top=lines[0][1],bottom=lines.at(-1)[0],xs=[];
  for(let x=0;x<p.width;x++){let n=0;for(let y=top+1;y<bottom;y++)if(black(p,x,y))n++;if(n>(bottom-top-1)*.95)xs.push(x);}
  const columns=runs(xs).map(r=>r[0]);if(columns.length!==4)return null;
  const [a,b,c,d]=columns;if(a/p.width<.02||a/p.width>.15||b/p.width<.3||c<=b||d<=c)return null;
  return {columns,rows:lines.slice(0,-1).map((r,i)=>({top:r[1]+3,bottom:lines[i+1][0]-3})),top};
 }
 function crop(p,rect,scale=2){
  const x=Math.max(0,Math.round(rect.x)),y=Math.max(0,Math.round(rect.y)),w=Math.min(p.width-x,Math.round(rect.w)),h=Math.min(p.height-y,Math.round(rect.h));
  const width=w*scale+20,height=h*scale+20,data=new Uint8ClampedArray(width*height*4);data.fill(255);
  for(let j=0;j<h*scale;j++)for(let i=0;i<w*scale;i++)if(black(p,x+Math.floor(i/scale),y+Math.floor(j/scale))){const at=((j+10)*width+i+10)*4;data[at]=data[at+1]=data[at+2]=0;}
  return {data,width,height};
 }
 function canvas(image){const c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').putImageData(new ImageData(image.data,image.width,image.height),0,0);return c;}
 async function fingerprint(p){const digest=await root.crypto.subtle.digest('SHA-256',p.raw);return 'label:'+p.width+'x'+p.height+':'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
 function orderId(text){return clean(text).toUpperCase().match(/\b\d{6}[A-Z0-9]{8}\b/)?.[0]||'';}
 async function read(batch,{recognize,qr,active=()=>{},progress=()=>{}}={}){
  let worker;
  if(!recognize){
   const base=new URL('vendor/ocr/',document.baseURI).href;
   worker=await root.Tesseract.createWorker('por',1,{workerPath:base+'worker.min.js',corePath:base+'tesseract-core-simd-lstm.wasm.js',langPath:base,gzip:false,workerBlobURL:false,cacheMethod:'none'});
   recognize=async(image,kind)=>{await worker.setParameters({tessedit_pageseg_mode:kind==='id'||kind==='quantity-check'?'7':'6',tessedit_char_whitelist:kind.startsWith('quantity')?'0123456789':''});return (await worker.recognize(canvas(image))).data;};
  }
  qr=qr||root.jsQR;
  const labels=[],checklists=[],unread=[],keys=[];
  try{
   active();
   for(let index=0;index<batch.length;index++){
    active();progress(index,batch.length);const p=batch[index];keys[index]=await fingerprint(p);active();
    const rotated=rotate(p),table=layout(rotated);
    if(table){
     const heading=await recognize(crop(rotated,{x:rotated.width*.43,y:rotated.height*.07,w:rotated.width*.52,h:rotated.height*.1}),'text');active();
     if(!/checklist/i.test(heading.text)){unread.push({index,message:'Modelo de lista não reconhecido.'});continue;}
     const exactId=glyphId(rotated,'checklist');
     const id=exactId?{text:exactId}:await recognize(crop(rotated,{x:rotated.width*.17,y:table.top-rotated.height*.12,w:rotated.width*.24,h:rotated.height*.055},1),'id');active();
     const ref=orderId(id.text),products=[],warnings=[];
     for(const row of table.rows){
      const values=[];for(let col=0;col<3;col++){
       const a=table.columns[col],b=table.columns[col+1];
       const value=await recognize(crop(rotated,{x:a+3,y:row.top,w:b-a-6,h:row.bottom-row.top} ),col===2?'quantity':'text');active();values.push(value);
      }
      const [title,variation,quantity]=values.map(v=>clean(v.text));
      const [a,b]=table.columns.slice(2,4);
      const second=await recognize(crop(rotated,{x:a+3,y:row.top,w:b-a-6,h:row.bottom-row.top},1),'quantity-check');active();
      const quantityVerified=/^[1-9]\d{0,6}$/.test(quantity)&&clean(second.text)===quantity;
      if(!title||!quantityVerified){warnings.push('Não foi possível ler o título ou confirmar a quantidade nas duas leituras locais.');}
      products.push({title,variation,quantity:Number(quantity)||0,quantityVerified,sku:'',listing_id:''});
     }
     checklists.push({index,order_ref:ref,exactId:Boolean(exactId),products,warnings,source_key:keys[index],source:batch[index].source});
    }else{
     const img=crop(p,{x:0,y:0,w:p.width,h:p.height},1),code=qr?.(img.data,img.width,img.height)?.data||'';
     const exactId=glyphId(p,'shipping');
     const text=exactId?{text:exactId}:await recognize(crop(p,{x:0,y:0,w:p.width*.72,h:p.height*.28}),'text');active();
     const ref=orderId(text.text);labels.push({index,order_ref:ref,exactId:Boolean(exactId),shipment_ref:/^BR[A-Z0-9]{10,20}$/.test(code)?code:'',source_key:keys[index],source:batch[index].source});
    }
   }
   const orders=[];
   for(const checklist of checklists){
    const matches=labels.filter(l=>checklist.order_ref&&l.order_ref===checklist.order_ref&&l.source===checklist.source);
    const label=matches.length===1?matches[0]:null;
    const adjacent=labels.find(l=>l.index===checklist.index-1&&l.source===checklist.source);
    // Confidence scores of names/variants are advisory: these are operational
    // metrics, while printing preserves the original. Gate quantities with two
    // independently scaled reads and identity with exact glyphs on both pages.
    const confirmed=Boolean(label?.shipment_ref&&label.exactId&&checklist.exactId&&!checklist.warnings.length&&checklist.products.every(p=>p.title&&p.quantityVerified));
    orders.push({...checklist,label,adjacent,confirmed,warning:!label?'Confira o ID: a leitura da etiqueta e do checklist não coincidiu.':checklist.warnings.join(' ')});
   }
   return {orders,labels,unread,keys,pages:batch.length};
  }finally{if(worker)await worker.terminate();}
 }
 function render(result,batch,host,onChange=()=>{}){
  host.replaceChildren();host.hidden=false;
  const intro=document.createElement('p');intro.textContent=`${result.labels.length} etiquetas de envio · ${result.orders.length} checklists · ${result.orders.reduce((n,o)=>n+o.products.length,0)} linhas de produtos. O histórico é preenchido automaticamente ao gerar o PDF. Somente leituras incompletas ficam separadas. O PDF original é preservado.`;host.append(intro);
  const note=document.createElement('p');note.textContent='Sem variação: siga a descrição. Se personalizado, confira os detalhes no pedido. A quantidade é a coluna Qnt, sem multiplicar as peças do kit.';host.append(note);
  const count=document.createElement('p');count.setAttribute('role','status');host.append(count);
  const filterLabel=document.createElement('label');filterLabel.textContent='Mostrar checklists';const filter=document.createElement('select');filter.append(new Option('Somente leituras para revisar','pending'),new Option('Todos os checklists','all'));filterLabel.append(filter);host.append(filterLabel);const cards=[];
  const update=()=>{const ready=result.orders.filter(o=>o.confirmed).length;count.textContent=ready+' checklists prontos para o histórico · '+(result.orders.length-ready)+' para revisar. Pedidos identificados são contados uma vez; produtos pendentes podem ser complementados depois.';for(const {o,details} of cards)details.hidden=filter.value==='pending'&&o.confirmed;onChange();};filter.onchange=update;
  for(const o of [...result.orders].sort((a,b)=>Number(a.confirmed)-Number(b.confirmed))){
   const details=document.createElement('details');details.className='shopee-order';const summary=document.createElement('summary');summary.textContent=(o.confirmed?'Leitura conferida':'Revisar leitura')+' · página '+(o.index+1)+' · '+(o.order_ref||'ID precisa de conferência');details.append(summary);
   const warning=document.createElement('p');warning.textContent=o.warning||'Confira título, variação e quantidade com o original.';details.append(warning);
   const images=document.createElement('div');images.className='shopee-images';details.append(images);let drawn=false;
   details.addEventListener('toggle',()=>{if(!details.open){images.replaceChildren();drawn=false;return;}for(const card of cards)if(card.details!==details)card.details.open=false;if(drawn)return;drawn=true;const c=canvas(crop(rotate(batch[o.index]),{x:0,y:0,w:batch[o.index].height,h:batch[o.index].width},1));c.setAttribute('aria-label','Checklist original');images.append(c);if(o.label||o.adjacent){const p=batch[(o.label||o.adjacent).index],label=canvas(crop(p,{x:0,y:0,w:p.width,h:p.height*.3},1));label.setAttribute('aria-label','Etiqueta candidata: confira o ID');images.append(label);}});
   const fields=document.createElement('div');fields.className='shopee-fields';details.append(fields);
   const confirmation=document.createElement('input');confirmation.type='checkbox';confirmation.checked=o.confirmed;
   const invalidate=()=>{o.confirmed=false;confirmation.checked=false;update();};
   function input(caption,value,handler,type='text') {const label=document.createElement('label'),el=document.createElement('input');label.textContent=caption;el.type=type;el.value=value;el.maxLength=500;if(type==='number'){el.min='1';el.max='9999999';el.step='1';}el.oninput=()=>{handler(el.value);invalidate();};label.append(el);fields.append(label);return el;}
   o.reviewedId=o.order_ref||o.label?.order_ref||o.adjacent?.order_ref||'';
   const idInput=input('ID do pedido conferido no checklist e na etiqueta',o.reviewedId,v=>{o.reviewedId=clean(v).toUpperCase();});
   idInput.readOnly=Boolean(o.exactId&&o.label?.exactId);
   const choose=document.createElement('label');choose.textContent='Etiqueta correspondente';const select=document.createElement('select');select.append(new Option('Selecione a etiqueta cujo ID você conferiu',''));
   for(const l of result.labels)select.append(new Option('Página '+(l.index+1)+' · '+(l.order_ref||'ID não lido')+' · '+(l.shipment_ref||'sem rastreio'),String(l.index)));
   select.value=o.label?String(o.label.index):'';o.selectedLabel=o.label;select.disabled=Boolean(o.exactId&&o.label?.exactId);
   select.onchange=()=>{o.selectedLabel=result.labels.find(l=>String(l.index)===select.value)||null;invalidate();};choose.append(select);fields.append(choose);
   for(const p of o.products){input('Título do produto',p.title,v=>{p.title=clean(v);});input('Variação (vazio quando não informada)',p.variation,v=>{p.variation=clean(v);});input('Quantidade comercial',p.quantity,v=>{p.quantity=Number(v);},'number');}
   const consent=document.createElement('label');consent.className='shopee-consent';consent.append(confirmation,document.createTextNode('Conferi o mesmo ID na etiqueta e no checklist, os produtos, as variações e as quantidades. Incluir no histórico.'));details.append(consent);
   confirmation.onchange=()=>{const valid=/^\d{6}[A-Z0-9]{8}$/.test(o.reviewedId)&&o.selectedLabel&&o.products.length&&o.products.every(p=>p.title&&p.title.length<=500&&p.variation.length<=500&&Number.isInteger(p.quantity)&&p.quantity>0&&p.quantity<=9999999);if(confirmation.checked&&!valid){confirmation.checked=false;warning.textContent='Preencha o ID, selecione a etiqueta correspondente e confira título e quantidade.';}o.confirmed=confirmation.checked;summary.textContent=(o.confirmed?'Conferido':'Pendente')+' · checklist página '+(o.index+1)+' · '+o.reviewedId;update();};
   host.append(details);cards.push({o,details});
  }
  update();
 }
 function orders(result){
  const seen=new Map(),used=new Set();
  for(const o of result.orders.filter(o=>o.confirmed)){
   const label=o.selectedLabel;if(!label)throw Error('Confira a etiqueta correspondente ao checklist.');
   if(used.has(label.index))throw Error('Uma etiqueta foi selecionada para mais de um checklist. Confira os vínculos antes de registrar.');used.add(label.index);
   const item={key:'shopee:'+o.reviewedId,identified:true,order_ref:o.reviewedId,shipment_ref:label.shipment_ref,products:o.products.map(p=>({title:clean(p.title),variation:clean(p.variation),quantity:p.quantity,sku:'',listing_id:''})),source_keys:[label.source_key,o.source_key]};
   if(seen.has(item.key)){const prior=seen.get(item.key);if(JSON.stringify(prior.products)!==JSON.stringify(item.products))throw Error('O pedido '+o.reviewedId+' aparece com produtos diferentes. Confira os pacotes antes de registrar.');prior.source_keys=[...new Set([...prior.source_keys,...item.source_keys])];}
   else seen.set(item.key,item);
  }
  for(const o of result.orders)if(!o.confirmed&&o.exactId&&o.label?.exactId&&!used.has(o.label.index)){
   const key='shopee:'+o.order_ref;used.add(o.label.index);
   if(!seen.has(key))seen.set(key,{key,identified:true,order_ref:o.order_ref,shipment_ref:o.label.shipment_ref,products:[],source_keys:[o.label.source_key,o.source_key]});
  }
  for(const label of result.labels)if(!used.has(label.index)){
   if(label.exactId&&label.shipment_ref){const key='shopee:'+label.order_ref;if(seen.has(key)){const prior=seen.get(key);prior.source_keys=[...new Set([...prior.source_keys,label.source_key])];}else seen.set(key,{key,identified:true,order_ref:label.order_ref,shipment_ref:label.shipment_ref,products:[],source_keys:[label.source_key]});}
   else seen.set(label.source_key,{key:label.source_key,identified:false,order_ref:'',shipment_ref:'',products:[]});
  }
  return [...seen.values()];
 }
 root.LocalShopee=Object.freeze({read,render,orders,rotate,layout,crop,fingerprint,orderId,glyphId,clean});
})(globalThis);
