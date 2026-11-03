import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import {inflateSync} from 'node:zlib';
const ctx=vm.createContext({Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,Blob,Response,CompressionStream,DecompressionStream,setTimeout,atob,btoa});
for(const f of ['vendor/pdf-lib.js','engine.js','compact.js'])vm.runInContext(await readFile(new URL('../shipping-labels/'+f,import.meta.url),'utf8'),ctx);
const {ShopeeCompact:C}=ctx;
const image=(w,h)=>({width:w,height:h,stride:Math.ceil(w/8),raw:new Uint8Array(Math.ceil(w/8)*h)});
const dot=(p,x,y)=>p.raw[y*p.stride+(x>>3)]|=128>>(x%8);
const ink=p=>Array.from(p.raw).reduce((n,v)=>n+v.toString(2).replaceAll('0','').length,0);
function pair(id='261029ABCDEFGH',count=3){
 const label=image(816,1218),list=image(1218,816);label.id=list.id=id;list.table={columns:[75,560,949,1007],rows:[]};
 for(let x=85;x<726;x+=3)for(let y=1079;y<1140;y++)dot(label,x,y);
 for(let x=54;x<516;x+=3)for(let y=693;y<801;y++)dot(label,x,y);
 for(let i=0;i<count;i++){const top=268+i*95;list.table.rows.push({top,bottom:top+60});for(let y=0;y<18;y++)for(let x=0;x<100;x+=3){dot(list,79+x,top+y);dot(list,565+x,top+y);}for(let y=0;y<18;y++)dot(list,954,top+y);}
 return {label,list};
}
ctx.LocalShopee={layout:p=>p.table,glyphId:(p,kind)=>kind==='pac'?(p.pac?p.id:''):p.id||'',rotate:p=>p};
test('compact output keeps original DANFE pixels, exact IDs, quantities and thermal page count',async()=>{
 const {label,list}=pair();const r=C.compose(label,list);
 assert.equal(r.id,label.id);assert.equal(r.items,3);
 const parts=C.shippingParts(label);assert.deepEqual(parts.tracking.raw,C.cut(label,40,690,496,115).raw);
 assert.equal(ink(C.cut(parts.upper,40,690,496,115)),0);
 const doc=await ctx.PDFLib.PDFDocument.load(await (await C.createPdf([r])).arrayBuffer());
 const {PDFName,PDFRawStream}=ctx.PDFLib;
 const fiscal=doc.context.enumerateIndirectObjects().map(([,obj])=>obj).find(obj=>obj instanceof PDFRawStream&&obj.dict.get(PDFName.of('Width'))?.asNumber()===688&&obj.dict.get(PDFName.of('Height'))?.asNumber()===70);
 assert.ok(fiscal);assert.deepEqual(new Uint8Array(inflateSync(fiscal.getContents())),C.cut(label,64,1075,688,70).raw);
 assert.equal(doc.getPageCount(),1);assert.ok(Math.abs(doc.getPage(0).getWidth()-100/25.4*72)<.001);assert.ok(Math.abs(doc.getPage(0).getHeight()-150/25.4*72)<.001);
});
test('identity matching is independent of page order and rejects missing, duplicate or conflicting IDs',()=>{
 const a=pair(),b=pair('261029IJKLMNOP');assert.equal(C.convert([b.list,a.label,a.list,b.label]).length,2);
 assert.throws(()=>C.convert([a.label,a.list,a.label]),/repetido/);
 assert.throws(()=>C.convert([a.label,b.list]),/ausente/);
 b.list.id='';assert.throws(()=>C.convert([b.label,b.list]),/ID não reconhecido/);
 assert.throws(()=>C.compose(a.label,b.list),/IDs/);
});
test('unsupported barcode geometry and excessive lists fail closed',()=>{
 const a=pair();dot(a.label,100,1160);assert.throws(()=>C.compose(a.label,a.list),/adicional/);
 const b=pair();dot(b.label,101,1080);assert.throws(()=>C.compose(b.label,b.list),/diferente/);
 const c=pair('261029ABCDEFGH',6);for(let i=0;i<c.list.table.rows.length;i++)dot(c.list,180+i,c.list.table.rows[i].top);assert.throws(()=>C.compose(c.label,c.list),/não cabe|extensa/);
 assert.throws(()=>C.convert(Array(42).fill(a.label)),/20 pedidos/);
 const d=pair();dot(d.label,55,710);assert.throws(()=>C.compose(d.label,d.list),/rastreamento diferente/);
});
test('tight spacing fits longer lists without changing glyph pixels, barcode or quantities',()=>{
 const {label,list}=pair('261029ABCDEFGH',6);
 const r=C.compose(label,list);assert.equal(r.items,6);
 assert.deepEqual(C.shippingParts(r.label).tracking.raw,C.cut(label,40,690,496,115).raw);
 const title=C.trim(C.cut(list,78,268,476,60)),variation=C.trim(C.cut(list,563,268,383,60)),quantity=C.trim(C.cut(list,952,268,52,60));
 const plan=C.fitList([{title,variants:Array.from({length:6},()=>({variation,quantity}))}]);
 assert.equal(plan.gap,2);assert.ok(plan.bottom<=1200);assert.equal(plan.operations.filter(o=>o.quantity).length,6);
 const titleInk=plan.operations[0].rows.flat().reduce((n,p)=>n+ink(p),0);assert.equal(titleInk,ink(title));
 for(const op of plan.operations.slice(1)){assert.equal(op.rows.flat().reduce((n,p)=>n+ink(p),0),ink(variation));assert.deepEqual(op.quantity.raw,quantity.raw);}
});
test('reflow preserves all ink pixels and never shrinks words',()=>{
 const p=image(60,50);for(const [x,y] of [[2,2],[3,2],[25,2],[26,2],[2,30],[3,30]])dot(p,x,y);
 const words=C.words(p);assert.equal(words.reduce((n,w)=>n+ink(w),0),ink(p));
 assert.equal(C.lines(p,10).length,3);
});
test('beta is separately gated and cannot record operational history',async()=>{
 const ui=await readFile(new URL('../shipping-labels/compact-ui.js',import.meta.url),'utf8');
 const html=await readFile(new URL('../shipping-labels/compact.html',import.meta.url),'utf8');
 assert.match(html,/access\.js/);assert.match(ui,/HarmonyConverterAccess/);
 assert.doesNotMatch(ui,/recordConversion|historyAccount|fetch\(|localStorage|Tesseract/);
 assert.match(ui,/revokeObjectURL/);assert.match(html,/personalizados/);
});


test('PAC Industrial keeps all five code crops and DANFE with one thermal page',async()=>{
 const {label,list}=pair();label.pac=true;
 for(const [x,y,w,h]of [[74,263,660,147],[460,488,338,147],[11,862,626,109]])for(let j=4;j<h-4;j++)for(let i=8;i<w-8;i+=3)dot(label,x+i,y+j);
 for(const [x,y]of [[45,110],[670,880]])for(let j=0;j<100;j+=3)for(let i=0;i<100;i+=3)dot(label,x+i,y+j);
 const parts=C.shippingParts(label);assert.equal(parts.pac,true);assert.equal(parts.codes.length,5);
 for(const c of parts.codes){assert.deepEqual(c.p.raw,C.cut(label,...c.rect).raw);assert.equal(ink(C.cut(parts.upper,...c.rect)),0);}
 const r=C.compose(label,list),pdf=await ctx.PDFLib.PDFDocument.load(await(await C.createPdf([r])).arrayBuffer());assert.equal(pdf.getPageCount(),1);
 const {PDFRawStream,PDFName}=ctx.PDFLib,streams=pdf.context.enumerateIndirectObjects().map(([,o])=>o).filter(o=>o instanceof PDFRawStream&&o.dict.get(PDFName.of('Subtype'))?.toString()==='/Image');
 for(const c of parts.codes){assert.ok(streams.some(o=>o.dict.get(PDFName.of('Width'))?.asNumber()===c.p.width&&o.dict.get(PDFName.of('Height'))?.asNumber()===c.p.height&&Buffer.from(inflateSync(o.getContents())).equals(Buffer.from(c.p.raw))));}
 dot(label,83,280);assert.throws(()=>C.shippingParts(label),/diferente/);
});
