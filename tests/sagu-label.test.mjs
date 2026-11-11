import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
const c=vm.createContext({Uint8Array,TextEncoder,Blob});
for(const f of ['shipping-labels/vendor/pdf-lib.js','shipping-labels/vendor/code128.js','sagu-label.js'])vm.runInContext(await readFile(new URL('../'+f,import.meta.url),'utf8'),c);
const label=c.HarmonySaguLabel;
test('sagu preserves label information, optional real date and separate 24-month shelf life',()=>{
 const blank=label.svg();assert.match(blank,/24 MESES/);assert.match(blank,/____\/____\/______/);assert.match(blank,/HS-SAGU-001/);assert.doesNotMatch(blank,/7898765432109/);
 for(const text of ['Bolinhas de fécula','NÃO INGERIR','44.967.294/0001-09','0350055270','Rua Gramado, 399','93950-000'])assert.ok(blank.includes(text),text);
 assert.match(label.svg({date:'2026-11-11'}),/11\/11\/2026/);
 for(const options of [{dpi:600},{copies:0},{copies:1.5},{copies:100001},{date:'2026-02-30'},{date:'<script>'}])assert.throws(()=>label.svg(options));
});
test('sagu ZPL and lossless one-page PDF contain identical pixels at exact 100 x 150 mm',async()=>{
 const width=9,height=2,pixels=new Uint8Array(width*height*4).fill(255);for(const i of [0,8,10])pixels[i*4]=pixels[i*4+1]=pixels[i*4+2]=0;
 const canvas={width,height,getContext:()=>({getImageData:()=>({data:pixels})})};
 const zpl=label.zpl(canvas,7);assert.match(zpl,/\^PW9\n\^LL2/);assert.match(zpl,/\^PQ7/);assert.match(zpl,/\^GFA,4,4,2,80804000/);
 const doc=await c.PDFLib.PDFDocument.load(new Uint8Array(await label.pdf(canvas).arrayBuffer()));assert.equal(doc.getPageCount(),1);assert.ok(Math.abs(doc.getPage(0).getWidth()*25.4/72-100)<.001);assert.ok(Math.abs(doc.getPage(0).getHeight()*25.4/72-150)<.001);
 const stream=doc.context.enumerateIndirectObjects().map(([,o])=>o).find(o=>o instanceof c.PDFLib.PDFRawStream&&o.dict.get(c.PDFLib.PDFName.of('Subtype'))?.toString()==='/Image');
 assert.deepEqual([...stream.getContents()],[127,127,191,255]);assert.equal(stream.dict.get(c.PDFLib.PDFName.of('BitsPerComponent')).asNumber(),1);
});
test('sagu is integrated into lots module with mirrored local assets and no stock or lot writes',async()=>{
 const source=await readFile(new URL('../sagu-label.js',import.meta.url),'utf8');assert.doesNotMatch(source,/\brpc\(|\bfetch\(|localStorage|sessionStorage/);
 const lots=await readFile(new URL('../label-lots.js',import.meta.url),'utf8');assert.match(lots,/HarmonySaguLabel\?\.mount/);
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');assert.ok(html.indexOf('shipping-labels/vendor/code128.js')<html.indexOf('sagu-label.js'));assert.ok(html.indexOf('sagu-label.js')<html.indexOf('label-lots.js'));
 const worker=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');assert.match(worker,/sagu-label\.js\?v=/);
});
