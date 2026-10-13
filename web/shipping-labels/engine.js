(function(root){
'use strict';
const MAX=100*1024*1024, enc=new TextEncoder();
function fail(message){throw Error(message)}
function join(parts){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length}return out}
async function inflate(data,format,limit=MAX){const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream(format)).getReader();let total=0;const parts=[];try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit){await reader.cancel();fail('O arquivo descomprimido ultrapassa o limite permitido.')}parts.push(value)}}finally{reader.releaseLock()}return join(parts)}
function crc32(data){let c=0xffffffff;for(const b of data){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
async function unzip(bytes){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);const u16=p=>view.getUint16(p,true),u32=p=>view.getUint32(p,true);let end=-1;for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--){if(u32(p)===0x06054b50&&p+22+u16(p+20)===bytes.length){end=p;break}}if(end<0)fail('ZIP inválido ou incompleto.');if(u16(end+4)||u16(end+6)||u16(end+8)!==u16(end+10))fail('ZIP dividido em volumes não é suportado.');const count=u16(end+10);let at=u32(end+16),total=0;const entries=[];entries.ignoredFiles=[];if(count===65535)fail('ZIP64 não é suportado.');for(let i=0;i<count;i++){if(u32(at)!==0x02014b50)fail('Diretório ZIP inválido.');const flags=u16(at+8),method=u16(at+10),crc=u32(at+16),packed=u32(at+20),size=u32(at+24),nl=u16(at+28),xl=u16(at+30),cl=u16(at+32),offset=u32(at+42);const name=new TextDecoder().decode(bytes.subarray(at+46,at+46+nl));at+=46+nl+xl+cl;if(name.startsWith('__MACOSX/')||name.endsWith('/'))continue;if(!/\.(txt|zpl)$/i.test(name)){entries.ignoredFiles.push(name);continue;}if(flags&1)fail('Remova a senha do ZIP antes de converter.');total+=size;if(total>MAX||size===0xffffffff)fail('Limite de 100 MB descomprimidos excedido.');if(u32(offset)!==0x04034b50)fail('Entrada ZIP inválida.');const start=offset+30+u16(offset+26)+u16(offset+28);if(start+packed>bytes.length)fail('ZIP truncado.');let data=bytes.subarray(start,start+packed);if(method===8)data=await inflate(data,'deflate-raw',size);else if(method!==0)fail('Método de compressão ZIP não suportado.');if(data.length!==size||crc32(data)!==crc)fail('O ZIP está corrompido: '+name);entries.push({name,text:new TextDecoder().decode(data)})}if(!entries.length)fail('O ZIP não contém arquivos .zpl ou .txt.');return entries}
function decodeAsciiGraphic(payload,total,stride){
  const nibbles=new Uint8Array(total*2),row=stride*2;
  let at=0,repeat=0;
  const put=(value,count)=>{if(at+count>nibbles.length)fail('Gráfico ASCII ultrapassa o tamanho informado.');nibbles.fill(value,at,at+count);at+=count;};
  for(const char of payload.replace(/\s/g,'')){
    if(/[G-Y]/.test(char)){repeat+=char.charCodeAt(0)-70;continue;}
    if(/[g-z]/.test(char)){repeat+=(char.charCodeAt(0)-102)*20;continue;}
    if(/^[0-9a-fA-F]$/.test(char)){put(parseInt(char,16),repeat||1);repeat=0;continue;}
    if(repeat)fail('Repetição ASCII inválida.');
    if(char===','||char==='!'){put(char===','?0:15,row-(at%row));continue;}
    if(char===':'){if(at<row||at%row)fail('Repetição de linha ASCII inválida.');if(at+row>nibbles.length)fail('Gráfico ASCII ultrapassa o tamanho informado.');nibbles.copyWithin(at,at-row,at);at+=row;continue;}
    fail('Caractere inválido em gráfico ASCII.');
  }
  if(repeat||at!==nibbles.length)fail('Gráfico ASCII incompleto.');
  const raw=new Uint8Array(total);for(let i=0;i<total;i++)raw[i]=(nibbles[i*2]<<4)|nibbles[i*2+1];return raw;
}
async function graphic(total,stride,payload){
  total=Number(total);stride=Number(stride);
  if(!total||!stride||total%stride||total>20*1024*1024||stride>8192)fail('Dimensões de imagem inválidas.');
  let raw;
  if(payload.startsWith(':Z64:')){
    const match=payload.match(/^:Z64:([A-Za-z0-9+/=\s]+):[\da-fA-F]{4}$/);if(!match)fail('Imagem Z64 inválida.');
    const b=atob(match[1].replace(/\s/g,''));raw=await inflate(Uint8Array.from(b,c=>c.charCodeAt(0)),'deflate',total);
  }else raw=decodeAsciiGraphic(payload,total,stride);
  if(raw.length!==total)fail('O tamanho da imagem não corresponde ao ZPL.');
  return {raw,width:stride*8,height:total/stride,stride,kind:'bitmap'};
}
// Only explicit field values are used for matching; never infer an invoice
// from page order, a name, or digits in the graphic payload.
function labelMetadata(block){
  const fields=[];let encoding=28,indicator=null;
  for(const m of block.matchAll(/\^([A-Z0-9]{2})([^\^~]*)/g)){
    if(m[1]==='CI')encoding=Number(m[2]);
    if(m[1]==='FH')indicator=m[2].trim()[0]||'_';
    if(m[1]==='FD')fields.push(root.ZplDrawing?root.ZplDrawing.decodeText(m[2],indicator,encoding):m[2]);
    if(m[1]==='FS')indicator=null;
  }
  const text=fields.join('\n'),unique=values=>[...new Set(values)];
  const invoiceNumbers=unique([...text.matchAll(/\bNF\s*:\s*([\d.]+)(?!\d)/gi)].map(m=>m[1].replace(/\D/g,'').replace(/^0+/,'')));
  const postcodes=unique([...text.matchAll(/\bCEP\s*:\s*(\d{5})-?(\d{3})(?!\d)/gi)].map(m=>m[1]+m[2]));
  const shipmentIds=unique(fields.flatMap(field=>{
    const code=field.match(/^>[:;](\d+)$/);if(code)return [code[1]];
    const qr=field.match(/^[A-Z]A,(\{.*\})$/);if(!qr)return [];
    try{const data=JSON.parse(qr[1]);return /^\d+$/.test(data.id)?[String(data.id)]:[];}catch{return [];}
  }));
  return {invoiceNumbers,postcodes,shipmentIds,invoiceNumber:invoiceNumbers.length===1?invoiceNumbers[0]:null,postcode:postcodes.length===1?postcodes[0]:null,shipmentId:shipmentIds.length===1?shipmentIds[0]:null};
}
async function parseZpl(text,options={}){
  if((text.match(/\^XA/g)||[]).length!==(text.match(/\^XZ/g)||[]).length)fail('ZPL incompleto: etiqueta sem fechamento.');
  const graphics=new Map(),pages=[];
  const events=/~DG([^,]+),(\d+),(\d+),([\s\S]*?)(?=[~^]|$)|\^XA([\s\S]*?)\^XZ/g;
  let end=0,stored=0,labelIndex=0;
  const labelTotal=(text.match(/\^XA/g)||[]).length;
  for(const m of text.matchAll(events)){
    if(text.slice(end,m.index).trim())fail('Comandos fora da etiqueta ZPL não suportados.');
    end=m.index+m[0].length;
    if(m[1]){const image=await graphic(m[2],m[3],m[4].trim());stored+=image.raw.length;if(stored>MAX)fail('Imagens descomprimidas ultrapassam 100 MB.');graphics.set(m[1].trim().toUpperCase(),image);continue;}
    const block=m[5];
    if(/^\s*\^ID[^\^]*\^FS\s*$/.test(block))continue;
    const refs=[...block.matchAll(/\^XG([^,^]+),(\d+),(\d+)/g)],gf=[...block.matchAll(/\^GFA,(\d+),(\d+),(\d+),([^\^~]+)/g)];
    const rasterCommands=new Set(['MM','PO','MN','FO','XG','FS','PQ','GF','PW','LL','LH','LT','LS','CI']);
    const rasterOnly=refs.length+gf.length===1 && [...block.matchAll(/\^([A-Z0-9]{2})/g)].every(c=>rasterCommands.has(c[1]));
    let image,copies;
    if(rasterOnly){
      if(/\^PO(?!N)/.test(block)||/\^(?:LH|FO)(?!0,0(?:\D|$))/.test(block)||/\^(?:LT|LS)(?!0(?:\D|$))/.test(block))fail('Rotação ou deslocamento da imagem não suportado.');
      if(refs.length){if(refs[0][2]!=='1'||refs[0][3]!=='1')fail('Ampliação por comando ^XG não suportada.');image=graphics.get(refs[0][1].trim().toUpperCase());if(!image)fail('Imagem referenciada não encontrada.');}
      else image=await graphic(gf[0][2],gf[0][3],gf[0][4].trim());
      copies=Number(block.match(/\^PQ(\d+)/)?.[1]||1);
    }else{
      if(!root.ZplDrawing)fail('O renderizador local de ZPL não foi carregado. Extraia todos os arquivos do conversor.');
      image=await root.ZplDrawing.render(block,graphics,graphic);copies=image.copies;
      stored+=image.raw.length;if(stored>MAX)fail('Imagens descomprimidas ultrapassam 100 MB.');
    }
    if(copies<1||pages.length+copies>1000)fail('Limite de 1.000 páginas excedido.');
    image={...image,metadata:labelMetadata(block)};
    for(let i=0;i<copies;i++)pages.push(image);
    options.onProgress?.(++labelIndex,labelTotal);
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(text.slice(end).trim())fail('Trecho ZPL incompleto ou não suportado.');
  if(!pages.length)fail('Nenhuma etiqueta ZPL compatível encontrada.');
  return pages;
}
function pdfNumber(value){if(!Number.isFinite(value))fail('Coordenada PDF inválida.');return Number(value.toFixed(6)).toString();}
function dimensions(image,dpi,size){const w=image.width/dpi*72,h=image.height/dpi*72;if(size==='original'&&image.defaultSize)size=image.defaultSize;if(size==='original')return {pw:w,ph:h,w,h,x:0,y:0};const pw=size==='a4'?595.2756:100/25.4*72,ph=size==='a4'?841.8898:150/25.4*72;const scale=size==='a4'?Math.min(1,(pw-28.35)/w,(ph-28.35)/h):Math.min(pw/w,ph/h);return {pw,ph,w:w*scale,h:h*scale,x:(pw-w*scale)/2,y:(ph-h*scale)/2}}
async function createPdf(pages,dpi,size,onProgress=()=>{}){if(!pages.length||![203,300,600].includes(dpi))fail('Configuração de PDF inválida.');const e=s=>enc.encode(s),objects=[];const obj=(n,b)=>join([e(`${n} 0 obj\n`),b,e('\nendobj\n')]);const stream=(dict,data)=>join([e(`<< ${dict} /Length ${data.length} >>\nstream\n`),data,e('\nendstream')]);objects.push(obj(1,e('<< /Type /Catalog /Pages 2 0 R >>')),obj(2,e(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`)));for(let i=0;i<pages.length;i++){const image=pages[i],n=3+i*3,d=dimensions(image,dpi,size);const compressed=new Uint8Array(await new Response(new Blob([image.raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());objects.push(obj(n,e(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfNumber(d.pw)} ${pdfNumber(d.ph)}] /Resources << /XObject << /Im ${n+1} 0 R >> >> /Contents ${n+2} 0 R >>`)),obj(n+1,stream(`/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceGray /BitsPerComponent 1 /Decode [1 0] /Filter /FlateDecode /Interpolate false`,compressed)),obj(n+2,stream('',e(`q ${pdfNumber(d.w)} 0 0 ${pdfNumber(d.h)} ${pdfNumber(d.x)} ${pdfNumber(d.y)} cm /Im Do Q`))));onProgress(i+1,pages.length)}const header=e('%PDF-1.4\n%LocalZPL\n'),offsets=[0];let cursor=header.length;for(const o of objects){offsets.push(cursor);cursor+=o.length}return new Blob([header,...objects,e(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF`)],{type:'application/pdf'})}
root.LocalZpl={unzip,parseZpl,createPdf,dimensions,decodeAsciiGraphic,labelMetadata};
})(globalThis);
