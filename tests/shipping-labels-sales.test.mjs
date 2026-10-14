import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {deflateRawSync} from 'node:zlib';
import {DOMParser} from '@xmldom/xmldom';

const files=['vendor/pdf-lib.js','vendor/code128.js','engine.js','picking.js','invoices.js','sales.js','batch-review.js','recovery.js'];
const sources=await Promise.all(files.map(f=>readFile(new URL('../shipping-labels/'+f,import.meta.url),'utf8')));
function env(){const c=vm.createContext({DOMParser,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,Blob,Response,CompressionStream,DecompressionStream,setTimeout,atob,btoa,fetch(){throw Error('Network forbidden');}});for(const s of sources)vm.runInContext(s,c);return c;}
const clone=o=>JSON.parse(JSON.stringify(o));
const row=(number,values)=>({number,cells:Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value:String(value),type:'s',formula:false}]))});
const headers=()=>[row(5,{A:'Vendas',W:'Anúncios',AI:'Compradores',AQ:'Envios',AW:'Devoluções'}),row(6,{A:'N.º de venda',D:'Estado',F:'Pacote de diversos produtos',H:'Unidades',W:'SKU',X:'# de anúncio',Y:'Título do anúncio',Z:'Variação',AN:'Estado',AO:'CEP',AU:'Número de rastreamento',AW:'Unidades',BB:'Número de rastreamento'})];
const data=(i,extra={})=>({A:String(2000000000000000n+BigInt(i)),D:'Pronto para coleta',F:'Não',H:'1.0',W:'MLB123_111'+i,X:'MLB123',Y:'100 Mini Corações',Z:'CORES E AROMAS PADRAO : LILÁS - LAVANDA',AO:'01234567',AU:'MEL'+(10000000000+i)+'FMXDF01',...extra});
const label=i=>({width:8,height:8,raw:new Uint8Array(8).fill(255),metadata:{invoiceNumber:String(i),postcode:'01234567',shipmentId:String(10000000000+i),saleId:String(2000000000000000n+BigInt(i))}});
const invoice=(i,count=1)=>({key:'synthetic-'+i,invoiceNumber:String(i),series:'1',postcode:'01234567',pages:[{source:'synthetic.pdf',pageIndex:0,products:Array.from({length:count},()=>({code:'MLB123_111',description:'100 Mini Coracoes',quantity:'1',unit:'UNID',variation:null}))}]});
function pack(){return [...headers(),row(7,data(1,{D:'Pacote de 4 produtos',X:'',Y:'',H:'',W:'',Z:''})),...['Lilás - Lavanda','Verde BB - Capim limão','Rosa BB - Mamãe e bebê','Azul BB - Mamãe e bebê'].map((v,i)=>row(8+i,data(10+i,{F:'Sim',AO:'',AU:'',Z:'CORES E AROMAS PADRAO : '+v})))];}
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function zip(parts){const local=[],central=[];let offset=0;for(const [name,text] of parts){const n=Buffer.from(name),data=Buffer.from(text),body=deflateRawSync(data),h=Buffer.alloc(30),c=Buffer.alloc(46);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(8,8);h.writeUInt32LE(crc(data),14);h.writeUInt32LE(body.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(n.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(8,10);c.writeUInt32LE(crc(data),16);c.writeUInt32LE(body.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);local.push(h,n,body);central.push(c,n);offset+=h.length+n.length+body.length;}const end=Buffer.alloc(22),dir=Buffer.concat(central);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(parts.length,8);end.writeUInt16LE(parts.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,dir,end]);}
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
function workbook(grid=pack()){
 const strings=[],rows=grid.map(r=>'<row r="'+r.number+'">'+Object.entries(r.cells).map(([col,c])=>{strings.push(c.value);return '<c r="'+col+r.number+'" t="s"><v>'+(strings.length-1)+'</v></c>';}).join('')+'</row>').join('');
 return [['xl/workbook.xml',`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Vendas BR" sheetId="1" r:id="rId1"/></sheets></workbook>`],['xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'],['xl/worksheets/sheet1.xml',`<worksheet xmlns="${ns}"><sheetData>${rows}</sheetData></worksheet>`],['xl/sharedStrings.xml',`<sst xmlns="${ns}">${strings.map(s=>'<si><t>'+escape(s)+'</t></si>').join('')}</sst>`]];
}
const file=parts=>{const b=new Uint8Array(zip(parts));return {name:'vendas.xlsx',size:b.length,arrayBuffer:async()=>b.slice().buffer};};

test('reads a compressed Excel locally, preserves long IDs and scopes duplicate headers by section',async()=>{
 const c=env(),sales=await c.LocalSales.read(file(workbook()));assert.equal(sales.groups.length,1);assert.equal(sales.products,4);assert.equal(sales.groups[0].id,'2000000000000001');assert.equal(sales.groups[0].shipmentId,'10000000001');assert.equal(sales.groups[0].products[0].variation,'CORES E AROMAS PADRAO : Lilás - Lavanda');
 const inline=workbook();
 inline[2][1]=inline[2][1].replace(/<c r="Z8"[^]*?<\/c>/,'<c r="Z8" t="inlineStr"><is><t>COR: ROSA</t></is></c>');
 assert.equal((await c.LocalSales.read(file(inline))).groups[0].products[0].variation,'COR: ROSA');
});

test('reads complete or split sale/pack IDs from explicit label fields without numeric precision loss',async()=>{
 const c=env();c.ZplDrawing={decodeText:s=>s,render:async()=>({raw:new Uint8Array(8),width:8,height:8,copies:1})};
 for(const field of ['^FDVenda: 2000000000000001^FS','^FDPack ID: 20000^FS^FO200,120^FD00000000001^FS']){
  const [parsed]=await c.LocalZpl.parseZpl('^XA'+field+'^XZ');assert.equal(parsed.metadata.saleId,'2000000000000001');
 }
 const [ambiguous]=await c.LocalZpl.parseZpl('^XA^FDVenda: 2000000000000001^FS^FDVenda: 2000000000000002^FS^XZ');assert.equal(ambiguous.metadata.saleId,null);assert.equal(ambiguous.metadata.saleIds.length,2);
});

test('rejects unsafe, duplicate, incomplete and formula-based workbook input',async()=>{
 const api=env().LocalSales;
 await assert.rejects(api.read({...file(workbook()),name:'sales.xls'}),/xlsx/);
 await assert.rejects(api.read({...file(workbook()),size:21*1024*1024}),/20 MB/);
 const duplicate=workbook();duplicate.push(duplicate[0]);await assert.rejects(api.read(file(duplicate)),/duplicadas/);
 const doctype=workbook();doctype[0][1]='<!DOCTYPE workbook>'+doctype[0][1];await assert.rejects(api.read(file(doctype)),/declaração/);
 const external=workbook();external[1][1]=external[1][1].replace('Target=','TargetMode="External" Target=');await assert.rejects(api.read(file(external)),/Aba de vendas inválida/);
 const formula=workbook();formula[2][1]=formula[2][1].replace('<c r="H8" t="s">','<c r="H8" t="s"><f>1+1</f>');await assert.rejects(api.read(file(formula)),/fórmula/);
 const imprecise=workbook();imprecise[2][1]=imprecise[2][1].replace(/<c r="A7"[^]*?<\/c>/,'<c r="A7"><v>2000000000000001</v></c>');await assert.rejects(api.read(file(imprecise)),/precisão/);
 const missing=workbook();missing[2][1]=missing[2][1].replace(/<row r="11"[^]*?<\/row>/,'');await assert.rejects(api.read(file(missing)),/incompleta/);
 const mismatch=workbook();mismatch[2][1]=mismatch[2][1].replace('r="A7"','r="A8"');await assert.rejects(api.read(file(mismatch)),/Referência/);
 let n=0;await assert.rejects(api.read(file(workbook()),()=>{if(++n===2)throw Error('Revoked');}),/Revoked/);
});

test('pack children stay inside their declared group and a standalone Sim row uses its own tracking',()=>{
 const c=env(),grid=pack();grid.push(row(12,data(2,{F:'Sim',Z:''})));const sales=c.LocalSales.parse(grid);assert.equal(sales.groups.length,2);assert.equal(sales.groups[1].shipmentId,'10000000002');assert.equal(sales.groups[1].products[0].variation,null);
 for(const change of [g=>g.pop(),g=>g.splice(3,1),g=>g[3].cells.AO.value='99999999',g=>g[3].cells.AU.value='MEL99999999999FMXDF01',g=>g[4].cells.A.value=g[3].cells.A.value]){const altered=pack();change(altered);assert.throws(()=>c.LocalSales.parse(altered));}
});

test('reconciles repeated truncated fiscal codes as a whole, preserving all four order variations and fiscal originals',()=>{
 const c=env(),note=invoice(1,4),before=clone(note),sales=c.LocalSales.parse(pack()),result=c.LocalSales.productsFor(label(1),note,sales);
 assert.deepEqual(clone(result.products.map(p=>p.variation)),['Lilás - Lavanda','Verde BB - Capim limão','Rosa BB - Mamãe e bebê','Azul BB - Mamãe e bebê']);assert.equal(new Set(result.products.map(p=>p.code)).size,4);assert.deepEqual(note,before);
 const reversed=c.LocalSales.productsFor(label(1),note,{...sales,groups:[...sales.groups].reverse()});assert.deepEqual(clone(reversed),clone(result));
});

test('requires agreement of shipment, sale/pack, CEP, product, title and quantities; never fills by leftover or truncated SKU',()=>{
 for(const [change,reason] of [
  [(s,l)=>l.metadata.shipmentId='99999999999',/não encontrado/],[(s,l)=>l.metadata.saleId='2000000000000002',/venda\/pacote/],[(s,l)=>l.metadata.saleIds=['1','2'],/ambíguos/],
  [s=>s.groups.push(clone(s.groups[0])),/repetido/],[s=>s.groups[0].postcode='99999999',/CEP/],[s=>s.groups[0].products[0].itemId='MLB999',/anúncio/],
  [s=>s.groups[0].products[0].title='200 Mini Corações',/descrição/],[s=>s.groups[0].products[0].quantity=2,/quantidade/],[s=>s.groups[0].products[0].status='Venda cancelada',/cancelamento/],
 ]){const c=env(),sales=c.LocalSales.parse(pack()),l=label(1);change(sales,l);assert.throws(()=>c.LocalSales.productsFor(l,invoice(1,4),sales),reason);}
});

test('checks explicit fiscal variations without reusing the first color in all product descriptions',()=>{
 const c=env(),sales=c.LocalSales.parse(pack()),note=invoice(1,4);
 note.pages[0].products.forEach((p,i)=>{p.variation=c.LocalPicking.variation(sales.groups[0].products[i].variation);p.description+=' - COR: '+p.variation;});
 const result=c.LocalSales.productsFor(label(1),note,sales);assert.ok(result.products.every(p=>p.description==='100 Mini Coracoes'));
 sales.groups[0].products[0].variation='COR: VERMELHO';assert.throws(()=>c.LocalSales.productsFor(label(1),note,sales),/variação.*diverge/);
});

test('blank variation prints the personalization instruction without blocking and all four variations fit on one sheet',async()=>{
 const c=env(),sales=c.LocalSales.parse([...pack(),row(12,data(2,{Z:''}))]),notes=[invoice(1,4),invoice(2)],labels=[label(1),label(2)],read={invoices:notes,sales};
 const report=await c.LocalBatchRecovery.analyze(labels,read);assert.equal(report.ready,true);assert.equal(report.counts.pages,4);assert.match(report.warnings.join(' '),/Se personalizado, confira o pedido/);
 const output=await c.PDFLib.PDFDocument.create(),layout=await c.LocalPicking.planOrders(report.rows,output);
 assert.equal(layout.layouts.get(report.rows[0].order.key).sheets[0].length,4);assert.deepEqual(clone(layout.layouts.get(report.rows[1].order.key).sheets[0][0].variant),['Siga a descrição. Se personalizado, confira o pedido.']);
 const result=await c.LocalInvoices.createPairedPdf(labels,read,report.rows,203,()=>{},'picking');assert.equal(result.sequence.length,4);
 sales.groups[0].id='2000000000000999';await assert.rejects(c.LocalInvoices.createPairedPdf(labels,read,report.rows,203,()=>{},'picking'),/venda\/pacote/);
});

test('blank Excel variations preserve fixed-color and personalized titles without inventing a variation',async()=>{
 const c=env(),grid=pack(),titles=['Sabonete Pezinho Verde','Sagu Lilás com perfume Lavanda','Sabonete personalizado com nome','Lembrancinha para presente'];
 for(let i=0;i<4;i++){grid[i+3].cells.Y.value=titles[i];grid[i+3].cells.Z.value='';}
 const sales=c.LocalSales.parse(grid),before=clone(sales),report=await c.LocalBatchRecovery.analyze([label(1)],{sales,invoices:[]});
 const layout=await c.LocalPicking.planOrders(report.rows,await c.PDFLib.PDFDocument.create());
 const sheets=layout.layouts.get(report.rows[0].order.key).sheets;
 assert.equal(sheets.length,1);assert.equal(sheets[0].length,4);
 assert.deepEqual(clone(sheets[0].map(card=>card.description.join(' '))),titles);
 assert.ok(sheets[0].every(card=>!card.product.variation&&card.variant.join(' ')==='Siga a descrição. Se personalizado, confira o pedido.'));
 assert.match(report.warnings.join(' '),/4 item\(ns\) sem variação no Excel/);assert.deepEqual(clone(sales),before);
});

test('report gaps isolate the affected order and preserve Excel for explicit partial generation',async()=>{
 const c=env(),sales=c.LocalSales.parse([...headers(),row(7,data(1))]),read={invoices:[invoice(1),invoice(2)],sales},report=await c.LocalBatchRecovery.analyze([label(1),label(2)],read);
 assert.equal(report.ready,false);assert.equal(report.partialReady,true);assert.equal(report.items[1].code,'sales');assert.equal(report.subset.read.sales,sales);
 const result=await c.LocalInvoices.createPairedPdf(report.subset.labels,report.subset.read,[],203,()=>{},'picking');assert.equal(result.sequence.length,2);assert.equal(result.rows[0].sales.products[0].variation,'LILÁS - LAVANDA');
});

test('100 orders reconcile by identity regardless of report or DANFE order, including extra sales',async()=>{
 const c=env(),grid=[...headers(),...Array.from({length:101},(_,i)=>row(i+7,data(i+1)))],sales=c.LocalSales.parse(grid),labels=Array.from({length:100},(_,i)=>label(i+1)),notes=Array.from({length:100},(_,i)=>invoice(100-i));sales.groups.reverse();
 const report=await c.LocalBatchRecovery.analyze(labels,{invoices:notes,sales});assert.equal(report.ready,true);assert.equal(report.counts.pages,200);
 assert.deepEqual(clone(report.rows.map(r=>r.sales.id)),labels.map(l=>l.metadata.saleId));
});

test('without Excel the original conversion remains available; no network or storage is added',async()=>{
 const c=env(),report=await c.LocalBatchRecovery.analyze([label(1)],{invoices:[invoice(1)]});assert.equal(report.ready,true);assert.match(report.warnings.join(' '),/sem cor\/variação/);
 assert.doesNotMatch(sources[5],/\b(?:fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB)\s*[.(]/);
});

test('50 labels select only their orders from 95 sales without DANFE or invoice numbers',async()=>{
 const c=env(),sales=c.LocalSales.parse([...headers(),...Array.from({length:95},(_,i)=>row(i+7,data(i+1)))]),labels=Array.from({length:50},(_,i)=>label(i+1));
 for(const l of labels)delete l.metadata.invoiceNumber;
 sales.groups.reverse();const read={invoices:[],sales},report=await c.LocalBatchRecovery.analyze(labels,read);
 assert.equal(report.ready,true);assert.equal(report.pendingCount,0);assert.deepEqual(clone(report.scope),{total:95,matched:50,ignored:45});assert.equal(report.counts.products,50);assert.equal(report.counts.pages,100);
 assert.ok(report.rows.every(r=>r.order&&!r.invoice));
 const result=await c.LocalInvoices.createPairedPdf(labels,read,report.rows,203,()=>{},'picking');
 assert.equal(result.sequence.length,100);assert.equal((await c.PDFLib.PDFDocument.load(result.bytes)).getPageCount(),100);
 assert.deepEqual(clone(result.rows.map(r=>r.order.id)),labels.map(l=>l.metadata.saleId));
 for(let i=0;i<100;i++)assert.equal(result.sequence[i].kind,i%2?'picking':'label');
});

test('DANFE gaps, custom SKU, quantity, variation and CEP disagreements are complementary, never fiscal associations',async()=>{
 const c=env(),sales=c.LocalSales.parse([...headers(),...Array.from({length:5},(_,i)=>row(i+7,data(i+1)))]),labels=Array.from({length:5},(_,i)=>label(i+1)),notes=Array.from({length:4},(_,i)=>invoice(i+1));
 notes[0].pages[0].products[0].code='CUSTOM SKU';notes[1].pages[0].products[0].quantity='9';notes[2].postcode='99999999';notes[3].pages[0].products[0].variation='VERMELHO';
 const read={invoices:notes,sales,problems:[{source:'unreadable.pdf',message:'Unreadable',uncertain:true}]},before=clone(read),report=await c.LocalBatchRecovery.analyze(labels,read);
 assert.equal(report.ready,true);assert.equal(report.counts.pages,10);assert.equal(report.counts.products,5);assert.ok(report.rows.every(r=>!r.invoice&&r.order.products[0].quantity==='1'));
 assert.match(report.warnings.join(' '),/CEP diferente/);assert.match(report.warnings.join(' '),/não encontrada/);assert.match(report.warnings.join(' '),/quantidade.*diverge/);assert.deepEqual(clone(read),before);
 const fiscal=await c.LocalBatchRecovery.analyze(labels,read,{mode:'danfe'});assert.equal(fiscal.ready,false);
 await assert.rejects(c.LocalInvoices.createPairedPdf(labels,read,report.rows,203,()=>{},'danfe'),/vincular/);
});

test('Excel authority still rejects missing, ambiguous, conflicting and duplicate order identities',async()=>{
 for(const change of [l=>delete l.metadata.saleId,l=>l.metadata.saleIds=['2000000000000001','2000000000000002'],l=>l.metadata.shipmentId='99999999999',l=>l.metadata.saleId='2000000000000099',l=>l.metadata.postcode='99999999']){
  const c=env(),sales=c.LocalSales.parse([...headers(),row(7,data(1))]),l=label(1);change(l);
  const report=await c.LocalBatchRecovery.analyze([l],{sales,invoices:[]});assert.equal(report.ready,false);assert.equal(report.confirmedCount,0);
  await assert.rejects(c.LocalInvoices.createPairedPdf([l],{sales,invoices:[]},[],203,()=>{},'picking'));
 }
 const c=env(),sales=c.LocalSales.parse([...headers(),row(7,data(1)),row(8,data(2))]);
 let report=await c.LocalBatchRecovery.analyze([label(1),label(1),label(2)],{sales,invoices:[]});assert.equal(report.confirmedCount,1);assert.equal(report.pendingCount,2);assert.equal(report.partialReady,true);
 sales.groups[1].products[0].status='Venda cancelada';report=await c.LocalBatchRecovery.analyze([label(2)],{sales,invoices:[]});assert.equal(report.ready,false);assert.match(report.issues.join(' '),/cancelamento/);
});

test('ten variants remain separate and sequential across picking sheets with source and order clearly printed',async()=>{
 const c=env(),grid=[...headers(),row(7,data(1,{D:'Pacote de 10 produtos',X:'',Y:'',H:'',W:'',Z:''})),...Array.from({length:10},(_,i)=>row(8+i,data(20+i,{F:'Sim',AO:'',AU:'',Z:'COR: ROSA '+i})))],sales=c.LocalSales.parse(grid),report=await c.LocalBatchRecovery.analyze([label(1)],{sales,invoices:[]});
 assert.equal(report.ready,true);assert.equal(report.counts.pages,4);const output=await c.PDFLib.PDFDocument.create(),layout=await c.LocalPicking.planOrders(report.rows,output);
 assert.deepEqual(clone(layout.layouts.get(report.rows[0].order.key).sheets.map(s=>s.length)),[4,4,2]);
 const printed=[];c.LocalPicking.draw({addPage:()=>({drawText:t=>printed.push(t),drawLine(){},drawRectangle(){}})},report.rows[0],layout);
 const text=printed.join('\n');assert.match(text,/PEDIDO 2000000000000001/);assert.match(text,/ENVIO 10000000001/);assert.match(text,/QTD. DO PEDIDO/);assert.match(text,/NÃO É DOCUMENTO FISCAL/);assert.doesNotMatch(text,/NF |conferidas com a NF/);
 for(let i=0;i<10;i++)assert.match(text,new RegExp('COR / AROMA: ROSA '+i));
});
