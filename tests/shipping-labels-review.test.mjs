import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const read=name=>readFile(new URL('../shipping-labels/'+name,import.meta.url),'utf8');
const context=vm.createContext({Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,Blob,Response,CompressionStream,DecompressionStream,setTimeout,atob,btoa,
  fetch(){throw Error('Network is forbidden');}});
for(const name of ['vendor/pdf-lib.js','vendor/code128.js','engine.js','picking.js','invoices.js','batch-review.js'])vm.runInContext(await read(name),context);
const {LocalBatchReview,LocalInvoices}=context;
const clone=value=>JSON.parse(JSON.stringify(value));
const product=()=>({code:'MESMO-SKU',quantity:'1',unit:'UN',description:'Kit de mini sabonetes - COR: AZUL',variation:'AZUL'});
const invoice=(number,count=1)=>({key:'synthetic-'+number,invoiceNumber:String(number),series:'1',postcode:'01234567',
  pages:[{source:'synthetic.pdf',pageIndex:0,products:Array.from({length:count},product)}]});
const label=number=>({width:8,height:8,raw:new Uint8Array(8).fill(255),
  metadata:{invoiceNumber:String(number),postcode:'01234567',shipmentId:String(10000000000+number)}});

test('review predicts compact picking pages without generating a PDF or mutating source values',async()=>{
  const labels=[label(1),label(2)],notes=[invoice(2),invoice(1,10)],before=clone(notes);
  const report=await LocalBatchReview.inspect(labels,{invoices:notes});
  assert.equal(report.ready,true);
  assert.deepEqual(clone(report.counts),{labels:2,invoices:2,products:11,pages:6});
  assert.deepEqual(clone(report.rows.map(row=>[row.labelPage,row.invoiceStart,row.invoiceEnd])),[[1,2,4],[5,6,6]]);
  assert.deepEqual(clone(report.rows.map(row=>row.invoice.invoiceNumber)),['1','2']);
  assert.deepEqual(clone(notes),before);
  assert.equal(report.blob,undefined);
});

test('warnings preserve missing variation and ignored filenames without blocking a valid batch',async()=>{
  const note=invoice(1);note.pages[0].products[0].description='Kit de mini sabonetes';note.pages[0].products[0].variation=null;
  const report=await LocalBatchReview.inspect([label(1)],{invoices:[note]},{ignored:['Controle.pdf','<img src=x onerror=alert(1)>.pdf']});
  assert.equal(report.ready,true);assert.equal(report.issues.length,0);assert.equal(report.warnings.length,3);
  assert.match(report.warnings[2],/sem cor\/variação/);assert.equal(note.pages[0].products[0].variation,null);
  assert.ok(report.warnings[1].includes('<img src=x onerror=alert(1)>'));
});

test('missing, extra, repeated, ambiguous or mismatched notes block the complete batch',async()=>{
  for(const [labels,notes] of [
    [[label(1),label(2)],[invoice(1)]],
    [[label(1)],[invoice(1),invoice(2)]],
    [[label(1),label(1)],[invoice(1)]],
    [[label(1)],[invoice(1),{...invoice(1),key:'other-series',series:'2'}]],
    [[{...label(1),metadata:{...label(1).metadata,postcode:'99999999'}}],[invoice(1)]],
    [[{...label(1),metadata:{}}],[invoice(1)]],
  ]){
    const report=await LocalBatchReview.inspect(labels,{invoices:notes});
    assert.equal(report.ready,false);assert.ok(report.issues.length);assert.equal(report.rows.length,0);assert.equal(report.counts.pages,null);
  }
});

test('unreadable products block picking but are a warning for the unchanged full DANFE mode',async()=>{
  const note=invoice(1);note.pages[0].productError='Tabela não reconhecida';delete note.pages[0].products;
  const picking=await LocalBatchReview.inspect([label(1)],{invoices:[note]});
  assert.equal(picking.ready,false);assert.equal(picking.counts.products,null);assert.match(picking.issues[0],/Tabela não reconhecida/);
  const danfe=await LocalBatchReview.inspect([label(1)],{invoices:[note]},{mode:'danfe'});
  assert.equal(danfe.ready,true);assert.equal(danfe.counts.products,null);assert.equal(danfe.counts.pages,2);assert.ok(danfe.warnings.length);
});

test('review uses the original long-description layout and rejects content that cannot fit',async()=>{
  const note=invoice(1,4);note.pages[0].products[0].description='Descrição completa com detalhes do produto. '.repeat(22).trim();note.pages[0].products[0].variation=null;
  let report=await LocalBatchReview.inspect([label(1)],{invoices:[note]});assert.equal(report.ready,true);assert.ok(report.counts.pages>2);
  note.pages[0].products[0].description='Texto '.repeat(2000);
  report=await LocalBatchReview.inspect([label(1)],{invoices:[note]});assert.equal(report.ready,false);assert.match(report.issues[0],/longa demais/);
});

test('labels-only review never claims invoice or product validation',async()=>{
  const report=await LocalBatchReview.inspect([label(1),label(2)]);
  assert.equal(report.paired,false);assert.equal(report.mode,'labels');assert.equal(report.ready,true);
  assert.deepEqual(clone(report.counts),{labels:2,invoices:0,products:null,pages:2});assert.equal(report.rows.length,0);
});

test('empty batches, oversized batches and unsupported modes cannot pass review',async()=>{
  for(const [labels,read,options] of [[[],null,{}],[Array.from({length:1001},(_,i)=>label(i+1)),null,{}],[[label(1)],{invoices:[invoice(1)]},{mode:'invalid'}]]){
    const report=await LocalBatchReview.inspect(labels,read,options);assert.equal(report.ready,false);assert.ok(report.issues.length);
  }
});

test('review counts final picking sheets instead of only original DANFE pages for the page limit',async()=>{
  const labels=Array.from({length:500},(_,i)=>label(i+1)),notes=labels.map((_,i)=>invoice(i+1,7));
  const report=await LocalBatchReview.inspect(labels,{invoices:notes});
  assert.equal(report.ready,false);assert.equal(report.counts.pages,1500);assert.match(report.issues[0],/1.000/);assert.equal(report.rows.length,0);
});

test('composition still refuses stale reviewed rows if the actual invoice batch is inconsistent',async()=>{
  const labels=[label(1)],read={invoices:[invoice(1)]};const report=await LocalBatchReview.inspect(labels,read);
  read.invoices[0].postcode='99999999';
  await assert.rejects(LocalInvoices.createPairedPdf(labels,read,report.rows,203,()=>{},'picking'),error=>error.issues.some(message=>message.includes('diferente')));
});

const controller=await read('app.js');
function element(){
  return {children:[],events:{},classList:{toggle(){}},value:'',hidden:false,textContent:'',
    addEventListener(type,fn){this.events[type]=fn;},setAttribute(key,value){this[key]=value;},removeAttribute(key){delete this[key];},
    append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},focus(){this.focused=true;},scrollIntoView(){},getContext(){return {};},
    set innerHTML(value){throw Error('Unsafe HTML insertion: '+value);}};
}
const syntheticFile=()=>({name:'synthetic.zpl',size:10,text:async()=>'^XA^XZ'});
function environment(){
  const nodes=new Map(),calls={parse:0,generate:0,paired:0,urls:0,revoked:0};
  const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  get('dpi').value='203';get('size').value='100x150';get('document-mode').value='picking';
  const report={ready:true,partialReady:false,paired:false,mode:'labels',rows:[],issues:[],warnings:[],counts:{labels:1,invoices:0,products:null,pages:1},confirmedCount:1,pendingCount:0,items:[],unmatchedInvoices:[],invoiceProblems:[],sourceProblems:[],duplicates:[],uncertain:false};
  const context=vm.createContext({Uint8Array,Blob,CompressionStream,DecompressionStream,
    document:{getElementById:get,createElement:element},addEventListener(){},HarmonyConverterAccess:{allowed:()=>true},
    URL:{createObjectURL(){calls.urls++;return 'blob:synthetic';},revokeObjectURL(){calls.revoked++;}},
    LocalBatchReview:{inspect:async()=>report.partialReady?report.subset.report:report},
    LocalBatchRecovery:{guardSize(files){if(files.reduce((n,f)=>n+f.size,0)>100*1024*1024)throw Error('Limite de 100 MB');},duplicateFiles:async()=>[],readInvoices:(...args)=>context.LocalInvoices.readInvoices(...args),analyze:async()=>report},
    LocalZpl:{parseZpl:async()=>{calls.parse++;return [label(1)];},createPdf:async()=>{calls.generate++;return new Blob(['synthetic']);},dimensions:()=>({pw:283,ph:425})},
    LocalInvoices:{readInvoices:async()=>({invoices:[invoice(1)]}),
      createPairedPdf:async(batch,read,rows)=>{calls.paired++;return {blob:new Blob(['synthetic']),rows,sequence:[{kind:'label',row:rows[0]},{kind:'picking',row:rows[0],sheet:1,totalSheets:1}]};},
      openPdf:async()=>({destroy:async()=>{},getPage:async()=>({getViewport:({scale})=>({width:283*scale,height:425*scale}),render:()=>({promise:Promise.resolve(),cancel(){}}),cleanup(){}})})},
  });
  context.window=context;vm.runInContext(controller,context);
  const select=(files=[syntheticFile()])=>get('files').events.change({target:{files}});
  return {context,get,calls,report,select};
}

test('UI requires a separate successful review before it creates any PDF',async()=>{
  const env=environment();env.select();assert.equal(env.get('check').disabled,false);assert.equal(env.get('convert').disabled,true);
  await env.get('convert').onclick();assert.equal(env.calls.generate,0);
  await env.get('check').onclick();assert.equal(env.calls.parse,1);assert.equal(env.calls.generate,0);assert.equal(env.calls.urls,0);
  assert.equal(env.get('convert').disabled,false);assert.equal(env.get('review-generate').disabled,false);assert.match(env.get('review-summary').textContent,/somente etiquetas/);
  await env.get('review-generate').onclick();assert.equal(env.calls.generate,1);assert.equal(env.calls.urls,1);assert.equal(env.get('review-state').textContent,'PDF GERADO');
});

test('each print configuration change invalidates review and hides a previously generated PDF',async()=>{
  const env=environment();env.select();await env.get('check').onclick();await env.get('convert').onclick();
  for(const id of ['dpi','size','document-mode']){
    env.get(id).events.change();assert.equal(env.get('convert').disabled,true);assert.equal(env.get('batch-review').hidden,true);assert.equal(env.get('actions').hidden,true);
    await env.get('check').onclick();assert.equal(env.get('convert').disabled,false);
  }
  assert.equal(env.calls.revoked,1);
  env.select();assert.equal(env.get('convert').disabled,true);
  await env.get('check').onclick();env.get('invoice-files').events.change({target:{files:[{name:'synthetic.pdf',size:10}]}});assert.equal(env.get('convert').disabled,true);
});

test('blocking issues stay separate from nonblocking warnings and cannot be bypassed by a button call',async()=>{
  const env=environment();env.report.ready=false;env.report.issues=['NF não encontrada','CEP divergente'];env.report.warnings=['<img src=x onerror=alert(1)>'];env.report.counts.pages=null;
  env.select();await env.get('check').onclick();await env.get('convert').onclick();
  assert.equal(env.calls.generate,0);assert.equal(env.get('convert').disabled,true);assert.equal(env.get('review-generate').disabled,true);
  assert.equal(env.get('issues').children.length,2);assert.equal(env.get('review-warnings').children[0].textContent,'<img src=x onerror=alert(1)>');assert.equal(env.get('review-pages').textContent,'Não calculado');
});

test('read failures show unavailable counts rather than zero and never publish old results',async()=>{
  const env=environment();env.select();await env.get('check').onclick();await env.get('convert').onclick();
  env.select([{name:'too-large.zpl',size:101*1024*1024}]);await env.get('check').onclick();
  assert.equal(env.calls.generate,1);assert.equal(env.calls.revoked,1);assert.equal(env.get('review-labels').textContent,'Não calculado');assert.equal(env.get('review-pages').textContent,'Não calculado');assert.equal(env.get('actions').hidden,true);assert.equal(env.get('convert').disabled,true);
});

test('closing during review cannot restore results or parse a late file',async()=>{
  const env=environment();let finish;const pending=new Promise(resolve=>{finish=resolve;});
  env.select([{name:'synthetic.zpl',size:10,text:()=>pending}]);const checking=env.get('check').onclick();
  env.context.HarmonyConverterLifecycle.dispose();env.context.document.getElementById=()=>null;
  finish('^XA^XZ');await checking;assert.equal(env.calls.parse,0);assert.equal(env.calls.urls,0);
});

test('closing during generation cannot restore a late PDF download',async()=>{
  const env=environment();env.select();await env.get('check').onclick();let finish;const pending=new Promise(resolve=>{finish=resolve;});
  env.context.LocalZpl.createPdf=()=>pending;const generating=env.get('convert').onclick();
  env.context.HarmonyConverterLifecycle.dispose();env.context.document.getElementById=()=>null;
  finish(new Blob(['synthetic']));await generating;assert.equal(env.calls.urls,0);
});

test('paired review shows predicted page ranges and generation uses the reviewed settings',async()=>{
  const env=environment(),note=invoice(1);env.report.paired=true;env.report.mode='picking';env.report.rows=[{shipmentId:'10000000001',invoice:note,labelPage:1,invoiceStart:2,invoiceEnd:2}];env.report.counts={labels:1,invoices:1,products:1,pages:2};
  env.select();env.get('invoice-files').events.change({target:{files:[{name:'synthetic.pdf',size:10}]}});await env.get('check').onclick();
  assert.match(env.get('pairing-rows').children[0].children[4].textContent,/Previsto/);assert.equal(env.calls.paired,0);
  await env.get('convert').onclick();assert.equal(env.calls.paired,1);assert.match(env.get('pairing-rows').children[0].children[4].textContent,/PDF/);
  assert.match(env.get('download').download,/fichas-de-separacao/);assert.equal(env.get('actions').hidden,false);
});


test('partial PDF requires explicit consent and preserves named pending orders after generation',async()=>{
  const env=environment(),safe={ready:true,paired:false,mode:'labels',rows:[],issues:[],warnings:[],counts:{labels:1,invoices:0,products:null,pages:1}};
  env.context.LocalZpl.parseZpl=async()=>[label(1),label(2)];
  Object.assign(env.report,{ready:false,partialReady:true,confirmedCount:1,pendingCount:1,counts:{labels:2,invoices:0,products:null,pages:null},items:[{labelIndex:0,ready:true},{labelIndex:1,ready:false,invoiceNumber:'2',shipmentId:'10000000002',source:'synthetic.zpl',message:'Nota faltante'}],issues:['NF 2 pendente'],subset:{labels:[label(1)],read:null,report:safe}});
  env.select();await env.get('check').onclick();
  assert.equal(env.get('partial-consent').checked,false);assert.equal(env.get('partial-choice').hidden,false);assert.equal(env.get('convert').disabled,true);
  await env.get('convert').onclick();assert.equal(env.calls.generate,0);
  env.get('partial-consent').checked=true;env.get('partial-consent').events.change();assert.equal(env.get('convert').disabled,false);
  await env.get('convert').onclick();assert.equal(env.calls.generate,1);assert.match(env.get('download').download,/-PARCIAL-1-de-2\.pdf$/);
  assert.equal(env.get('resolution-panel').hidden,false);assert.equal(env.get('resolution-items').children.length,1);assert.match(env.get('resolution-items').children[0].children[0].textContent,/NF 2/);
  assert.match(env.get('review-summary').textContent,/NÃO estão neste PDF/);
  env.select();assert.equal(env.get('partial-consent').checked,false);assert.equal(env.get('convert').disabled,true);assert.equal(env.get('actions').hidden,true);assert.equal(env.calls.revoked,1);
});

test('adding missing files preserves previous selection and each file can be removed without editing it',async()=>{
  const env=environment(),first=syntheticFile(),second={...syntheticFile(),name:'second.zpl'};
  env.select([first]);env.select([second]);assert.equal(env.get('file-list').children.length,2);
  await env.get('check').onclick();assert.equal(env.calls.parse,2);
  env.get('file-list').children[0].children[1].events.click();assert.equal(env.get('file-list').children.length,1);assert.match(env.get('file-list').children[0].children[0].textContent,/second.zpl/);assert.equal(env.get('convert').disabled,true);
  env.get('invoice-files').events.change({target:{files:[{name:'first.pdf',size:10}]}});env.get('invoice-files').events.change({target:{files:[{name:'second.pdf',size:10}]}});
  assert.equal(env.get('invoice-list').children.length,2);assert.equal(first.name,'synthetic.zpl');
});

test('an explicit duplicate-removal action keeps the original selection entry',async()=>{
  const env=environment();env.report.ready=false;env.report.duplicates=[{kind:'labels',index:1,name:'copy.zpl',original:'synthetic.zpl'}];env.report.issues=['Copias identicas'];
  env.select([syntheticFile(),{...syntheticFile(),name:'copy.zpl'}]);await env.get('check').onclick();assert.equal(env.get('remove-duplicates').hidden,false);assert.equal(env.get('convert').disabled,true);
  await env.get('remove-duplicates').onclick();assert.equal(env.get('file-list').children.length,1);assert.match(env.get('file-list').children[0].children[0].textContent,/synthetic.zpl/);
});
