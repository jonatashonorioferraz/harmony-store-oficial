import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
const ctx=vm.createContext({Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,Blob,Response,CompressionStream,DecompressionStream,setTimeout,atob,btoa});
for(const f of ['vendor/pdf-lib.js','engine.js','compact.js'])vm.runInContext(await readFile(new URL('../shipping-labels/'+f,import.meta.url),'utf8'),ctx);
const {ShopeeCompact:C}=ctx;
const image=(w,h)=>({width:w,height:h,stride:Math.ceil(w/8),raw:new Uint8Array(Math.ceil(w/8)*h)});
const dot=(p,x,y)=>p.raw[y*p.stride+(x>>3)]|=128>>(x%8);
const ink=p=>Array.from(p.raw).reduce((n,v)=>n+v.toString(2).replaceAll('0','').length,0);
function pair(id='261029ABCDEFGH',count=3){
 const label=image(816,1218),list=image(1218,816);label.id=list.id=id;list.table={columns:[75,560,949,1007],rows:[]};
 for(let x=85;x<726;x+=3)for(let y=1079;y<1140;y++)dot(label,x,y);
 for(let i=0;i<count;i++){const top=268+i*95;list.table.rows.push({top,bottom:top+60});for(let y=0;y<18;y++)for(let x=0;x<100;x+=3){dot(list,79+x,top+y);dot(list,565+x,top+y);}for(let y=0;y<18;y++)dot(list,954,top+y);}
 return {label,list};
}
ctx.LocalShopee={layout:p=>p.table,glyphId:p=>p.id||'',rotate:p=>p};
test('compact output keeps original DANFE pixels, exact IDs, quantities and thermal page count',async()=>{
 const {label,list}=pair();const r=C.compose(label,list);
 assert.equal(r.id,label.id);assert.equal(r.items,3);
 assert.deepEqual(C.cut(r.page,0,918,816,70).raw,C.cut(label,0,1075,816,70).raw);
 const doc=await ctx.PDFLib.PDFDocument.load(await (await C.createPdf([r])).arrayBuffer());
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
 const c=pair('261029ABCDEFGH',6);assert.throws(()=>C.compose(c.label,c.list),/não cabe|extensa/);
 assert.throws(()=>C.convert(Array(42).fill(a.label)),/20 pedidos/);
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

