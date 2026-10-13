import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';

const files=['vendor/pdf-lib.js','vendor/code128.js','engine.js','picking.js','invoices.js','batch-review.js','recovery.js'];
const sources=[];
for(const name of files)sources.push(await readFile(new URL('../shipping-labels/'+name,import.meta.url),'utf8'));
function environment(){const context=vm.createContext({Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,Blob,Response,CompressionStream,DecompressionStream,setTimeout,atob,btoa,crypto:webcrypto,fetch(){throw Error('Network forbidden');}});for(const source of sources)vm.runInContext(source,context);return context;}
function key(number,series=1){const prefix='3526100000000000010055'+String(series).padStart(3,'0')+String(number).padStart(9,'0')+'1'+'12345678';let sum=0,weight=2;for(let i=42;i>=0;i--){sum+=Number(prefix[i])*weight;weight=weight===9?2:weight+1;}const r=sum%11;return prefix+(r<2?0:11-r);}
function invoice(number,series=1){return {key:key(number,series),invoiceNumber:String(number),series:String(series),issuer:'00000000000100',postcode:'01234567',pages:[{source:'synthetic.pdf',fileIndex:0,pageIndex:0,sheet:1,products:[{code:'TEST',description:'Kit de mini sabonetes - COR: ROSA',quantity:'1',unit:'UN',variation:'ROSA'}]}]};}
const label=n=>({width:8,height:8,raw:new Uint8Array(8).fill(255),metadata:{invoiceNumber:String(n),postcode:'01234567',shipmentId:String(10000000000+n)}});
const read=notes=>({documents:[],invoices:notes,problems:[],recovered:[]});
const file=(name,body)=>({name,size:new TextEncoder().encode(body).length,arrayBuffer:async()=>new TextEncoder().encode(body).buffer});
const clone=value=>JSON.parse(JSON.stringify(value));

test('exact duplicate bytes are identified across filenames, not merely by filename',async()=>{
 const api=environment().LocalBatchRecovery;
 const duplicates=await api.duplicateFiles([file('a.zpl','same'),file('b.zpl','same'),file('a.zpl','different')],[file('a.pdf','same'),file('b.pdf','same')]);
 assert.deepEqual(clone(duplicates.map(d=>[d.kind,d.index,d.original])),[['labels',1,'a.zpl'],['invoices',1,'a.pdf']]);
});
test('duplicate detection stops after access is revoked and enforces the byte limit',async()=>{
 const api=environment().LocalBatchRecovery;let calls=0;
 await assert.rejects(api.duplicateFiles([file('a.zpl','x')],[],()=>{calls++;throw Error('revoked');}),/revoked/);assert.equal(calls,1);
 assert.throws(()=>api.guardSize([{size:101*1024*1024}]),/100 MB/);
});
test('complete valid lots still use the unchanged authoritative matcher and picking pagination',async()=>{
 const env=environment(),labels=[label(1),label(2)],notes=[invoice(2),invoice(1)],before=clone(notes);
 const result=await env.LocalBatchRecovery.analyze(labels,read(notes));
 assert.equal(result.ready,true);assert.equal(result.partialReady,false);assert.equal(result.counts.pages,4);assert.equal(result.confirmedCount,2);assert.deepEqual(clone(notes),before);
 assert.deepEqual(clone(result.rows.map(r=>r.invoice.invoiceNumber)),['1','2']);
});
test('a missing note leaves a named pending order and a separately validated safe subset',async()=>{
 const env=environment(),result=await env.LocalBatchRecovery.analyze([label(1),label(2)],read([invoice(1)]));
 assert.equal(result.ready,false);assert.equal(result.partialReady,true);assert.equal(result.pendingCount,1);assert.equal(result.items[1].code,'missing');assert.equal(result.items[1].invoiceNumber,'2');assert.equal(result.subset.report.counts.pages,2);assert.equal(result.counts.pages,null);
 const pdf=await env.LocalInvoices.createPairedPdf(result.subset.labels,result.subset.read,result.subset.report.rows,203,()=>{},'picking');
 assert.equal((await env.PDFLib.PDFDocument.load(pdf.bytes)).getPageCount(),2);assert.equal(pdf.rows.length,1);assert.equal(pdf.rows[0].invoice.invoiceNumber,'1');
 assert.match(env.LocalBatchRecovery.pendingText(result),/NF 2/);
});
test('CEP mismatches expose the two values and never enter a partial PDF',async()=>{
 const env=environment(),note=invoice(2);note.postcode='99999999';
 const result=await env.LocalBatchRecovery.analyze([label(1),label(2)],read([invoice(1),note]));
 assert.equal(result.items[1].code,'mismatch');assert.equal(result.items[1].labelPostcode,'01234567');assert.equal(result.items[1].candidates[0].postcode,'99999999');assert.equal(result.partialReady,true);assert.equal(result.subset.read.invoices.length,1);assert.equal(result.unmatchedInvoices[0].invoiceNumber,'2');
});
test('duplicate shipment and multiple volumes block every affected label, not just the second',async()=>{
 const env=environment();
 for(const labels of [[label(1),label(1)],[label(1),{...label(1),metadata:{...label(1).metadata,shipmentId:'20000000001'}}]]){
  const result=await env.LocalBatchRecovery.analyze(labels,read([invoice(1)]));assert.equal(result.confirmedCount,0);assert.equal(result.partialReady,false);assert.ok(result.items.every(i=>!i.ready));
 }
});
test('same NF number from distinct series or issuers is never selected by order',async()=>{
 const env=environment(),result=await env.LocalBatchRecovery.analyze([label(1)],read([invoice(1),invoice(1,2)]));
 assert.equal(result.items[0].code,'ambiguous');assert.equal(result.items[0].candidates.length,2);assert.equal(result.partialReady,false);
});
test('unknown PDF pages prevent unsafe partial association despite apparent matches',async()=>{
 const env=environment(),notes=read([invoice(1)]);notes.problems=[{code:'read',source:'image.pdf',page:1,uncertain:true,message:'No identity'}];
 const result=await env.LocalBatchRecovery.analyze([label(1)],notes);assert.equal(result.ready,false);assert.equal(result.partialReady,false);assert.equal(result.uncertain,true);assert.equal(result.counts.products,null);
});
test('a known damaged invoice quarantines its number even if another file contains a good copy',async()=>{
 const env=environment(),notes=read([invoice(1),invoice(2)]);notes.problems=[{code:'sheets',source:'incomplete.pdf',invoiceNumber:'1',message:'Missing sheet'}];
 const result=await env.LocalBatchRecovery.analyze([label(1),label(2)],notes);assert.equal(result.items[0].code,'invoice-read');assert.equal(result.confirmedCount,1);assert.equal(result.subset.read.invoices[0].invoiceNumber,'2');
});
test('unreadable products offer full DANFE without relaxing identity verification',async()=>{
 const env=environment(),note=invoice(1);note.pages[0].productError='Unknown table';note.pages[0].products=[];
 const picking=await env.LocalBatchRecovery.analyze([label(1)],read([note]),{mode:'picking'});assert.equal(picking.ready,false);assert.equal(picking.items[0].code,'products');assert.equal(picking.counts.products,null);
 const danfe=await env.LocalBatchRecovery.analyze([label(1)],read([note]),{mode:'danfe'});assert.equal(danfe.ready,true);assert.equal(danfe.counts.pages,2);
 note.postcode='99999999';const bad=await env.LocalBatchRecovery.analyze([label(1)],read([note]),{mode:'danfe'});assert.equal(bad.ready,false);assert.equal(bad.items[0].code,'mismatch');
});
test('unmatched invoices remain named in the pending list while the safe subset is selectable',async()=>{
 const env=environment(),result=await env.LocalBatchRecovery.analyze([label(1)],read([invoice(1),invoice(2)]));
 assert.equal(result.partialReady,true);assert.equal(result.unmatchedInvoices[0].invoiceNumber,'2');assert.match(env.LocalBatchRecovery.pendingText(result),/NF 2, serie 1/);
});
test('file duplicates require explicit removal before full or partial generation',async()=>{
 const env=environment(),result=await env.LocalBatchRecovery.analyze([label(1)],read([invoice(1)]),{duplicates:[{kind:'invoices',index:1,name:'copy.pdf',original:'original.pdf'}]});
 assert.equal(result.ready,false);assert.equal(result.partialReady,false);assert.match(result.issues.join(' '),/cópias idênticas/);
});
test('labels-only mode does not invent invoice or product checks',async()=>{
 const env=environment(),result=await env.LocalBatchRecovery.analyze([label(1)],null);
 assert.equal(result.ready,true);assert.equal(result.paired,false);assert.equal(result.counts.invoices,0);assert.equal(result.counts.products,null);assert.equal(result.counts.pages,1);
});
test('failed label files stay explicit when the user can opt for the readable files',async()=>{
 const env=environment(),result=await env.LocalBatchRecovery.analyze([label(1)],null,{sourceProblems:[{source:'broken.zpl',message:'Truncated'}]});
 assert.equal(result.partialReady,true);assert.equal(result.ready,false);assert.match(env.LocalBatchRecovery.pendingText(result),/broken.zpl/);
});
function identityItems(number=1){const item=(str,x,y,width=5)=>({str,width,transform:[1,0,0,1,x,y]});return [item(key(number),10,700,220),item('DESTINATARIO / REMETENTE',10,600,150),item('CEP',400,580,15),item('01234-567',400,567,45),item('1 de 1',200,660,30)];}
test('alternative text assembly recovers contiguous key glyphs without inventing digits',()=>{
 const env=environment(),items=identityItems();items.splice(0,1,...[...key(1)].map((str,i)=>({str,width:5,transform:[1,0,0,1,10+i*5,700]})));
 assert.throws(()=>env.LocalInvoices.pageInfo(items),/chave de acesso/);
 const repaired=env.LocalBatchRecovery.alternativeItems(items);assert.equal(env.LocalInvoices.pageInfo(repaired).key,key(1));assert.equal(items.length,48);
 const distant=items.map(i=>({...i,transform:i.transform.slice()}));for(let i=0;i<44;i++)distant[i].transform[4]=10+i*20;
 assert.throws(()=>env.LocalInvoices.pageInfo(env.LocalBatchRecovery.alternativeItems(distant)),/chave de acesso/);
});
test('invoice reader retries locally, preserves source bytes, and releases PDF resources',async()=>{
 const env=environment();let reads=0,cleanups=0,destroys=0;
 const original=identityItems(),fragmented=[...[...key(1)].map((str,i)=>({str,width:5,transform:[1,0,0,1,10+i*5,700]})),...original.slice(1)];
 env.LocalPicking.extract=()=>invoice(1).pages[0].products;
 env.LocalInvoices.openPdf=async()=>({numPages:1,getPage:async()=>({getTextContent:async()=>{reads++;return {items:fragmented};},getOperatorList:async()=>({}),cleanup(){cleanups++;}}),async destroy(){destroys++;}});
 const result=await env.LocalBatchRecovery.readInvoices([file('original.pdf','original bytes')]);
 assert.equal(reads,2);assert.equal(cleanups,1);assert.equal(destroys,1);assert.equal(result.invoices.length,1);assert.equal(result.recovered.length,1);assert.equal(new TextDecoder().decode(result.documents[0].bytes),'original bytes');
});
test('unreadable pages are reported by file and page instead of being silently skipped',async()=>{
 const env=environment();env.LocalPicking.extract=()=>invoice(1).pages[0].products;
 env.LocalInvoices.openPdf=async()=>({numPages:2,getPage:async n=>({getTextContent:async()=>({items:n===1?identityItems():[]}),getOperatorList:async()=>({}),cleanup(){}}),async destroy(){}});
 const result=await env.LocalBatchRecovery.readInvoices([file('mixed.pdf','bytes')]);assert.equal(result.invoices.length,1);assert.equal(result.problems.length,1);assert.equal(result.problems[0].source,'mixed.pdf');assert.equal(result.problems[0].page,2);assert.equal(result.problems[0].uncertain,true);
});
test('recovery code never transmits or persists documents and controls partial generation explicitly',async()=>{
 const controller=await readFile(new URL('../shipping-labels/app.js',import.meta.url),'utf8');
 assert.match(controller,/partialReady&&\$\('partial-consent'\)\.checked/);assert.match(controller,/\$\('partial-consent'\)\.checked=false/);assert.match(controller,/LocalBatchReview\.inspect\(batch,read/);assert.match(controller,/-PARCIAL-/);assert.match(controller,/selectInvoices\(files\)\{invoiceFiles\.push/);
 for(const source of [sources.at(-1),controller])assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB)\s*[.(]/);
});
