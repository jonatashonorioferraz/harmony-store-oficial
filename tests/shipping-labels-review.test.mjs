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
function element(tag='div'){
  return {tagName:tag.toUpperCase(),click(){if(this.disabled)return;this.clicked=(this.clicked||0)+1;if(this.events.click)return this.events.click();return this.onclick?.();},children:[],events:{},classList:{toggle(){}},value:'',hidden:false,textContent:'',
    addEventListener(type,fn){this.events[type]=fn;},setAttribute(key,value){this[key]=value;},removeAttribute(key){delete this[key];},
    append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},focus(){this.focused=true;},scrollIntoView(){},getContext(){return {};},
    set innerHTML(value){throw Error('Unsafe HTML insertion: '+value);}};
}
const syntheticFile=()=>({name:'synthetic.zpl',size:10,text:async()=>'^XA^XZ'});
function environment(guide){
  const listeners={};
  const nodes=new Map(),calls={parse:0,generate:0,paired:0,urls:0,revoked:0,destroyed:0};
  const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  get('dpi').value='203';get('size').value='100x150';get('document-mode').value='picking';
  const report={ready:true,partialReady:false,paired:false,mode:'labels',rows:[],issues:[],warnings:[],counts:{labels:1,invoices:0,products:null,pages:1},confirmedCount:1,pendingCount:0,items:[],unmatchedInvoices:[],invoiceProblems:[],sourceProblems:[],duplicates:[],uncertain:false};
  const context=vm.createContext({Uint8Array,Blob,CompressionStream,DecompressionStream,
    CustomEvent:class{constructor(type,fields={}){this.type=type;Object.assign(this,fields);}},dispatchEvent(event){listeners[event.type]?.(event);},
    document:{getElementById:get,createElement:element},HarmonyLabelsGuide:guide,addEventListener(type,fn){listeners[type]=fn;},HarmonyConverterAccess:{allowed:()=>true},
    URL:{createObjectURL(){calls.urls++;return 'blob:synthetic';},revokeObjectURL(){calls.revoked++;}},
    LocalBatchReview:{inspect:async()=>report.partialReady?report.subset.report:report},
    LocalBatchRecovery:{guardSize(files){if(files.reduce((n,f)=>n+f.size,0)>100*1024*1024)throw Error('Limite de 100 MB');},duplicateFiles:async()=>[],readInvoices:(...args)=>context.LocalInvoices.readInvoices(...args),analyze:async()=>report},
    LocalZpl:{parseZpl:async()=>{calls.parse++;return [label(1)];},createPdf:async()=>{calls.generate++;return new Blob(['synthetic']);},dimensions:()=>({pw:283,ph:425})},
    LocalInvoices:{readInvoices:async()=>({invoices:[invoice(1)]}),
      createPairedPdf:async(batch,read,rows)=>{calls.paired++;return {blob:new Blob(['synthetic']),rows,sequence:[{kind:'label',row:rows[0]},{kind:'picking',row:rows[0],sheet:1,totalSheets:1}]};},
      openPdf:async()=>({destroy:async()=>{calls.destroyed++;},getPage:async()=>({getViewport:({scale})=>({width:283*scale,height:425*scale}),render:()=>({promise:Promise.resolve(),cancel(){}}),cleanup(){}})})},
  });
  context.window=context;vm.runInContext(controller,context);
  const select=(files=[syntheticFile()])=>get('files').events.change({target:{files}});
  return {context,get,calls,report,select,emit:type=>listeners[type]?.()};
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
  assert.equal(env.get('resolution-panel').hidden,false);const pendingCards=env.get('resolution-items').children.filter(node=>node.tagName==='ARTICLE');assert.equal(pendingCards.length,1);assert.match(pendingCards[0].children[0].textContent,/NF 2/);
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


const cards=env=>env.get('resolution-items').children.filter(node=>node.tagName==='ARTICLE');
const cardAction=(card,label)=>{const control=card.children.find(node=>node.tagName==='BUTTON'&&node.textContent===label);assert.ok(control,'Expected action: '+label);return control;};
async function confirmationUI(){
 const env=environment();env.calls.confirm=0;
 Object.assign(env.report,{ready:false,paired:true,confirmedCount:0,pendingCount:1,issues:['NF ausente'],items:[{labelIndex:0,ready:false,code:'missing-invoice-number',shipmentId:'10000000001',labelPostcode:'01234567',source:'synthetic.zpl',message:'NF ausente',confirmationOptions:[{key:'test-key',number:'1',series:'1',postcode:'01234567',source:'synthetic.pdf'}]}]});
 env.context.LocalInvoices.confirmMissingInvoice=(labels,notes,index,key,confirmed)=>{assert.equal(index,0);assert.equal(key,'test-key');assert.equal(confirmed,true);env.calls.confirm++;};
 env.select();env.get('invoice-files').events.change({target:{files:[{name:'synthetic.pdf',size:10}]}});await env.get('check').onclick();
 const card=cards(env)[0],choice=card.children.flatMap(n=>n.children).find(n=>n.tagName==='SELECT'),consent=card.children.flatMap(n=>n.children).find(n=>n.type==='checkbox');
 return {...env,choice,consent,action:cardAction(card,'Confirmar vínculo e conferir lote')};
}

test('confirmation requires a selected note and renewed consent, rechecks the lot and never generates automatically',async()=>{
 const env=await confirmationUI();
 assert.equal(env.choice.value,'');env.action.click();assert.equal(env.calls.confirm,0);
 env.choice.value='test-key';env.action.click();assert.equal(env.calls.confirm,0);
 env.consent.checked=true;env.choice.events.change();assert.equal(env.consent.checked,false);
 let finish;const pending=new Promise(resolve=>{finish=resolve;});
 env.context.LocalBatchRecovery.analyze=(labels,notes,options)=>{assert.equal(options.mode,'picking');assert.deepEqual(clone(options.sourceProblems),[]);return pending;};
 env.get('partial-consent').checked=true;env.consent.checked=true;env.action.click();
 assert.equal(env.calls.confirm,1);assert.equal(env.action.disabled,true);assert.equal(env.get('partial-consent').checked,false);
 env.action.events.click();assert.equal(env.calls.confirm,1);
 finish({...env.report,ready:true,items:[],issues:[],confirmedCount:1,pendingCount:0});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(env.get('convert').disabled,false);assert.equal(env.calls.paired,0);assert.equal(env.calls.generate,0);
 assert.match(env.get('status').textContent,/confirmado pelo ADM/);
 env.action.events.click();assert.equal(env.calls.confirm,1,'stale report cannot confirm again');
});

test('confirmation controls cannot act after changed files, revoked access or disposed frame',async()=>{
 for(const invalidate of [env=>env.select(),env=>{env.context.HarmonyConverterAccess.allowed=()=>false;},env=>env.context.HarmonyConverterLifecycle.dispose()]){
  const env=await confirmationUI();env.choice.value='test-key';env.consent.checked=true;
  invalidate(env);env.action.events.click();assert.equal(env.calls.confirm,0);assert.equal(env.calls.paired,0);
 }
});
const picker=card=>{const input=card.children.find(node=>node.tagName==='INPUT');assert.ok(input,'Expected replacement picker');return input;};
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
async function problemEnvironment(code='metadata',files=[syntheticFile()]){
 const env=environment();Object.assign(env.report,{ready:false,items:[{labelIndex:0,ready:false,code,source:files[0].name,invoiceNumber:'1',shipmentId:'10000000001',message:'Synthetic problem',candidates:[]}],pendingCount:1,issues:['Synthetic problem']});
 env.select(files);await env.get('check').onclick();return env;
}
test('contextual missing-note action opens the existing additive picker without changing selection',async()=>{
 const env=await problemEnvironment('missing');cardAction(cards(env)[0],'Adicionar o DANFE faltante').click();
 assert.equal(env.get('invoice-files').clicked,1);assert.equal(env.get('file-list').children.length,1);assert.equal(env.calls.generate,0);
});
test('cancelling file replacement keeps all selected files and the review intact',async()=>{
 const env=await problemEnvironment(),card=cards(env)[0],before=env.calls.parse;
 cardAction(card,'Substituir este arquivo…').click();const input=picker(card);assert.equal(input.clicked,1);
 input.files=[];input.events.change();await settle();assert.equal(env.calls.parse,before);assert.equal(env.get('resolution-panel').hidden,false);assert.match(env.get('file-list').children[0].children[0].textContent,/synthetic.zpl/);
});
test('replacement rejects wrong formats and oversized files without losing the old selection',async()=>{
 const env=await problemEnvironment(),card=cards(env)[0],input=picker(card),before=env.calls.parse;
 for(const file of [{name:'not-a-label.pdf',size:10},{name:'oversized.zpl',size:101*1024*1024}]){
  input.files=[file];input.events.change();assert.match(card.children.find(node=>node.className==='resolution-replace-status').textContent,/seleção anterior foi mantida/);
 }
 assert.equal(env.calls.parse,before);assert.match(env.get('file-list').children[0].children[0].textContent,/synthetic.zpl/);
});
test('replacing one label file automatically rechecks and preserves the other original objects',async()=>{
 const first=syntheticFile(),other={...syntheticFile(),name:'other.zpl'},env=await problemEnvironment('metadata',[first,other]);const input=picker(cards(env)[0]);
 const replacement={...syntheticFile(),name:'corrected.zpl'};input.files=[replacement];input.events.change();
 assert.equal(env.get('convert').disabled,true);await settle();assert.equal(env.calls.parse,4);assert.equal(env.calls.generate,0);
 assert.match(env.get('file-list').children[0].children[0].textContent,/corrected.zpl/);assert.match(env.get('file-list').children[1].children[0].textContent,/other.zpl/);assert.equal(first.name,'synthetic.zpl');assert.equal(other.name,'other.zpl');
 assert.equal(env.get('partial-consent').checked,false);
});
test('replacing one damaged PDF preserves other PDFs and triggers a fresh local invoice read',async()=>{
 const env=environment();Object.assign(env.report,{ready:false,invoiceProblems:[{source:'damaged.pdf',code:'read',message:'Synthetic read failure',uncertain:true}],uncertain:true,issues:['Read failure']});
 const old={name:'damaged.pdf',size:10},other={name:'keep.pdf',size:10};let seen;
 env.context.LocalInvoices.readInvoices=async files=>{seen=files;return {invoices:[]};};env.select();env.get('invoice-files').events.change({target:{files:[old,other]}});await env.get('check').onclick();
 const replacement={name:'corrected.pdf',size:10};const input=picker(cards(env)[0]);input.files=[replacement];input.events.change();await settle();
 assert.equal(seen[0],replacement);assert.equal(seen[1],other);assert.equal(old.name,'damaged.pdf');assert.equal(env.get('file-list').children.length,1);assert.equal(env.calls.generate,0);
});
test('same-named files cannot be silently selected for replacement',async()=>{
 const env=await problemEnvironment('metadata',[syntheticFile(),syntheticFile()]),card=cards(env)[0];
 assert.equal(card.children.some(node=>node.tagName==='INPUT'),false);cardAction(card,'Localizar na seleção').click();assert.equal(env.get('file-list').focused,true);
});
test('archive-entry failure targets its owning ZIP and explicitly warns about whole-archive replacement',async()=>{
 const env=environment();Object.assign(env.report,{ready:false,sourceProblems:[{source:'batch.zip / nested/broken.zpl',fileName:'batch.zip',message:'Synthetic ZIP entry failure'}],issues:['Entry failure']});
 env.context.LocalZpl.unzip=async()=>[{name:'nested/broken.zpl',text:'^XA^XZ'}];env.select([{name:'batch.zip',size:10,arrayBuffer:async()=>new ArrayBuffer(1)}]);await env.get('check').onclick();const card=cards(env)[0];
 assert.match(card.children.find(node=>node.className==='resolution-replace-note').textContent,/ZIP inteiro/);cardAction(card,'Substituir este ZIP…').click();assert.equal(picker(card).clicked,1);
});
test('revoked access, a stale report and closing prevent late replacement',async()=>{
 for(const revoke of [env=>{env.context.HarmonyConverterAccess.allowed=()=>false;},env=>env.select([{...syntheticFile(),name:'new-session.zpl'}]),env=>env.context.HarmonyConverterLifecycle.dispose()]){
  const env=await problemEnvironment(),input=picker(cards(env)[0]),before=env.calls.parse;revoke(env);input.files=[{...syntheticFile(),name:'late.zpl'}];input.events.change();await settle();
  assert.equal(env.calls.parse,before);assert.ok(env.get('file-list').children.every(node=>!node.children[0].textContent.includes('late.zpl')));
 }
});
test('a running recheck prevents other contextual actions and duplicate replacement',async()=>{
 const env=await problemEnvironment(),card=cards(env)[0],input=picker(card);let finish;const reading=new Promise(resolve=>{finish=resolve;});
 input.files=[{name:'corrected.zpl',size:10,text:()=>reading}];input.events.change();await settle();
 input.files=[{...syntheticFile(),name:'second-replacement.zpl'}];input.events.change();cardAction(card,'Substituir este arquivo…').click();
 assert.match(env.get('file-list').children[0].children[0].textContent,/corrected.zpl/);assert.equal(input.clicked,undefined);finish('^XA^XZ');await settle();assert.equal(env.calls.parse,2);
});
test('full-DANFE contextual action warns of whole-lot scope and never generates automatically',async()=>{
 const env=await problemEnvironment('products'),card=cards(env)[0];
 assert.match(card.children.find(node=>node.className==='resolution-guidance').textContent,/TODOS os pedidos/);
 cardAction(card,'Usar DANFE completo neste lote').click();await settle();assert.equal(env.get('document-mode').value,'danfe');assert.equal(env.calls.generate,0);assert.equal(env.calls.paired,0);assert.equal(env.get('partial-consent').checked,false);
});
test('mismatch and ambiguous-note cards do not offer identity overrides or a full-DANFE bypass',async()=>{
 for(const code of ['mismatch','ambiguous']){
  const env=await problemEnvironment(code),card=cards(env)[0];assert.ok(card.children.filter(node=>node.tagName==='BUTTON').every(node=>!node.textContent.includes('DANFE completo')));
  cardAction(card,'Localizar os PDFs selecionados').click();assert.equal(env.get('invoice-list').focused,true);assert.equal(env.get('convert').disabled,true);
 }
});
test('untrusted problem text and filenames are rendered as text rather than markup',async()=>{
 const env=await problemEnvironment('metadata',[{...syntheticFile(),name:'<img src=x onerror=alert(1)>.zpl'}]);
 assert.equal(env.get('resolution-panel').hidden,false);assert.ok(cards(env)[0].children.some(node=>node.textContent.includes('<img src=x onerror=alert(1)>')));
});

test('guided flow requires platform choice and Mercado Livre DANFEs even on direct actions',async()=>{
  const guide={platform:null,update(next){this.state=next;}};
  const env=environment(guide);env.select();
  assert.equal(env.get('check').disabled,true);await env.get('check').onclick();assert.equal(env.calls.parse,0);
  guide.platform='mercado-livre';env.emit('harmony-labels:platform-change');
  await env.get('check').onclick();assert.equal(env.calls.parse,0);assert.equal(env.get('check').disabled,true);
  env.get('invoice-files').events.change({target:{files:[{name:'danfes.pdf',size:10}]}});
  assert.equal(env.get('check').disabled,false);await env.get('check').onclick();assert.equal(env.calls.parse,1);
  assert.equal(guide.state.review,true);assert.equal(guide.state.generated,false);
  env.get('clear-invoices').onclick();assert.equal(env.get('check').disabled,true);await env.get('convert').onclick();assert.equal(env.calls.generate,0);assert.equal(env.calls.paired,0);
});

test('Shopee ignores retained DANFEs and preserves ZPL pages without inventing products',async()=>{
  const guide={platform:'mercado-livre',update(next){this.state=next;}};
  const env=environment(guide);env.select();
  env.get('invoice-files').events.change({target:{files:[{name:'danfes.pdf',size:10}]}});
  guide.platform='shopee';env.emit('harmony-labels:platform-change');
  env.context.LocalBatchRecovery.readInvoices=()=>{throw Error('Shopee must not read DANFEs');};
  await env.get('check').onclick();assert.equal(env.get('size').disabled,false);
  await env.get('convert').onclick();assert.equal(env.calls.generate,1);assert.equal(env.calls.paired,0);
  assert.equal(guide.state.invoices,1);assert.equal(guide.state.generated,true);
  guide.platform='mercado-livre';env.emit('harmony-labels:platform-change');
  assert.equal(env.get('actions').hidden,true);assert.equal(env.get('convert').disabled,true);
  assert.equal(env.get('invoice-list').children.length,1);assert.equal(env.get('file-list').children.length,1);
  assert.equal(env.get('check').disabled,false);assert.equal(env.calls.revoked,1);
});

test('guided controller reports busy and invalidation, without bypassing partial consent',async()=>{
  const guide={platform:'shopee',update(next){this.state=next;}};
  const env=environment(guide);env.select();
  env.report.ready=false;env.report.partialReady=true;env.report.subset={labels:[label(1)],read:null,report:{ready:true,counts:{pages:1}}};
  await env.get('check').onclick();assert.equal(guide.state.review,true);assert.equal(guide.state.ready,false);
  await env.get('convert').onclick();assert.equal(env.calls.generate,0);
  env.get('partial-consent').checked=true;env.get('partial-consent').events.change();assert.equal(guide.state.ready,true);
  env.select();assert.equal(guide.state.review,false);assert.equal(guide.state.ready,false);
});

test('new batch choice can be cancelled without losing the PDF, files or review',async()=>{
  const env=environment();env.select();await env.get('check').onclick();await env.get('convert').onclick();
  env.get('new-batch-same').onclick();assert.equal(env.calls.revoked,0,'closed confirmation must not reset');
  env.get('new-batch-open').onclick();assert.equal(env.get('new-batch-choice').hidden,false);
  assert.match(env.get('new-batch-warning').textContent,/Baixe o PDF/);
  env.get('new-batch-cancel').onclick();assert.equal(env.get('new-batch-choice').hidden,true);
  assert.equal(env.get('actions').hidden,false);assert.equal(env.get('file-list').children.length,1);
  assert.equal(env.calls.revoked,0);assert.equal(env.get('new-batch-open').focused,true);
});

test('new lot clears both uploads and old PDF, resets consent and allows a fresh conversion',async()=>{
  const guide={platform:'shopee',update(next){this.state=next;},reset(keep){this.kept=keep;if(!keep)this.platform=null;}};
  const env=environment(guide);env.select();
  env.get('invoice-files').events.change({target:{files:[{name:'retained.pdf',size:10}]}});
  env.get('dpi').value='300';env.get('document-mode').value='danfe';
  await env.get('check').onclick();await env.get('convert').onclick();
  env.get('partial-consent').checked=true;env.get('new-batch-open').onclick();env.get('new-batch-same').onclick();
  assert.equal(guide.kept,true);assert.equal(guide.platform,'shopee');
  assert.equal(env.calls.revoked,1);assert.equal(env.calls.destroyed,1);
  for(const id of ['file-list','invoice-list','resolution-items','pairing-rows','review-warnings','issues'])assert.equal(env.get(id).children.length,0,id);
  for(const id of ['new-batch','new-batch-choice','actions','navigation','batch-review','resolution-panel','pairing-report'])assert.equal(env.get(id).hidden,true,id);
  assert.equal(env.get('download').href,undefined);assert.equal(env.get('download').download,undefined);
  assert.equal(env.get('partial-consent').checked,false);assert.equal(env.get('check').disabled,true);
  assert.equal(env.get('document-mode').value,'picking');assert.equal(env.get('dpi').value,'300');
  await env.get('convert').onclick();assert.equal(env.calls.generate,1);
  env.select([{...syntheticFile(),name:'next.zpl'}]);await env.get('check').onclick();
  assert.equal(env.calls.parse,2,'only the new file is parsed in the second lot');
  await env.get('convert').onclick();assert.equal(env.calls.generate,2);assert.equal(env.get('new-batch').hidden,false);
  env.get('new-batch-open').onclick();env.get('new-batch-platform').onclick();
  assert.equal(guide.platform,null);assert.equal(env.get('file-list').children.length,0);
});

test('partial PDF restart warns about pending orders and clears the old authorization',async()=>{
  const env=environment();Object.assign(env.report,{ready:false,partialReady:true,subset:{labels:[label(1)],read:null,report:{ready:true,counts:{pages:1}}}});
  env.select();await env.get('check').onclick();env.get('partial-consent').checked=true;
  await env.get('convert').onclick();env.get('new-batch-open').onclick();
  assert.match(env.get('new-batch-warning').textContent,/parcial/);assert.match(env.get('new-batch-warning').textContent,/lista de pendências/);
  env.get('new-batch-platform').onclick();assert.equal(env.get('partial-consent').checked,false);
  env.select();await env.get('check').onclick();await env.get('convert').onclick();
  assert.equal(env.calls.generate,1,'old consent cannot authorize the next partial lot');
});

test('restart actions cannot interrupt work or run after access revocation or disposal',async()=>{
  const env=environment();env.select();await env.get('check').onclick();
  let finish;env.context.LocalZpl.createPdf=()=>new Promise(resolve=>{finish=resolve;});
  const generating=env.get('convert').onclick();await settle();
  env.get('new-batch-open').onclick();env.get('new-batch-same').onclick();
  assert.equal(env.get('file-list').children.length,1);assert.equal(env.get('new-batch-choice').hidden,true);
  finish(new Blob(['synthetic']));await generating;
  env.get('new-batch-open').onclick();env.context.HarmonyConverterAccess.allowed=()=>false;
  env.get('new-batch-same').onclick();assert.equal(env.get('file-list').children.length,1);
  env.context.HarmonyConverterAccess.allowed=()=>true;env.context.HarmonyConverterLifecycle.dispose();
  env.get('new-batch-platform').onclick();assert.equal(env.calls.revoked,1);assert.equal(env.get('actions').hidden,true);
});
