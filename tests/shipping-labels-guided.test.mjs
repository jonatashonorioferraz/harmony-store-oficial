import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { harness } from './shipping-labels-ui-harness.mjs';

const source = await readFile(new URL('../shipping-labels/guided.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../shipping-labels/index.html', import.meta.url), 'utf8');
async function setup() {
  const h = await harness({ previewTools: false });
  const children = [...h.document.body.children];
  const root = h.add(h.document.body, 'main', 'converter'); root.append(...children);
  h.document.querySelectorAll = s => h.document.body.querySelectorAll(s);
  const upload = h.query('.layout').children[0]; upload.classList.add('guide-upload');
  h.add(upload, 'section', '', 'invoice-upload'); h.add(upload, 'label', '', 'document-choice');
  h.add(root, 'section', '', 'guide-platforms');
  for (const id of ['guide-shopee','guide-ml','guide-step-1','guide-step-2','guide-step-3','guide-view','guide-back','check','add-invoices']) h.add(root,'button',id);
  for (const id of ['guide-label-title','guide-upload-description','guide-platform-note','guide-help-platform','guide-next-hint']) h.add(root,'p',id);
  vm.runInContext(source,h.context);
  const guide=h.window.HarmonyLabelsGuide;
  const state={busy:false,review:false,generated:false,labels:0,invoices:0,ready:false};
  const update=values=>{Object.assign(state,values);guide.update(state);};
  return {...h,guide,root,update};
}

test('initial wizard shows explicit platform choices, not invented sample orders',async()=>{
  const h=await setup();assert.equal(h.guide.platform,null);assert.equal(h.root.dataset.step,'1');
  assert.equal(h.query('#files').disabled,true);assert.equal(h.query('.invoice-upload').hidden,true);
  assert.equal(h.query('#guide-step-2').disabled,true);assert.equal(h.query('#guide-step-3').disabled,true);
  assert.match(html,/Shopee/);assert.match(html,/Mercado Livre/);assert.match(html,/ZPL \+ PDF/);
  assert.equal((html.match(/id="files"/g)||[]).length,1);assert.equal((html.match(/id="invoice-files"/g)||[]).length,1);
});
test('platform-specific instructions show one Shopee input or both Mercado Livre inputs',async()=>{
  const h=await setup();h.query('#guide-shopee').click();assert.equal(h.guide.platform,'shopee');
  assert.equal(h.query('.invoice-upload').hidden,true);assert.equal(h.query('#files').disabled,false);
  assert.match(h.query('#guide-platform-note').textContent,/não cria uma lista ausente/);
  h.query('#guide-ml').click();assert.equal(h.guide.platform,'mercado-livre');
  assert.equal(h.query('.invoice-upload').hidden,false);assert.equal(h.query('#invoice-files').disabled,false);
  h.update({labels:1});assert.match(h.query('#guide-next-hint').textContent,/DANFEs/);
});
test('review, generation and back navigation preserve original selection and do not auto-generate',async()=>{
  const h=await setup();h.query('#guide-shopee').click();h.update({labels:1,review:true,ready:true});
  assert.equal(h.root.dataset.step,'2');assert.equal(h.query('#guide-step-3').disabled,true);
  h.query('#guide-back').click();assert.equal(h.root.dataset.step,'1');assert.equal(h.query('#guide-step-2').disabled,false);
  h.query('#guide-step-2').click();h.update({generated:true});assert.equal(h.root.dataset.step,'3');
  h.query('#guide-back').click();assert.equal(h.root.dataset.step,'2');
  h.update({review:false,generated:false,ready:false});assert.equal(h.root.dataset.step,'1');
});
test('complete view retains phase gates and busy/disposed sessions cannot change platform',async()=>{
  const h=await setup();h.query('#guide-view').click();assert.equal(h.root.dataset.complete,'true');
  assert.equal(h.query('#guide-step-2').disabled,true);h.query('#guide-ml').click();
  h.update({busy:true});h.query('#guide-shopee').click();assert.equal(h.guide.platform,'mercado-livre');
  h.update({busy:false,disposed:true});h.query('#guide-shopee').click();assert.equal(h.guide.platform,'mercado-livre');
  assert.equal(h.query('#files').disabled,true);
});
test('retained PDFs are clearly excluded from Shopee and recovery search reveals the target stage',async()=>{
  const h=await setup();h.query('#guide-shopee').click();h.update({labels:1,invoices:2,review:true,ready:true,generated:true});
  assert.match(h.query('#guide-platform-note').textContent,/não serão usados na Shopee/);
  h.window.dispatchEvent(new h.Event('harmony-labels:guide-reveal',{detail:{target:h.query('#files')}}));
  assert.equal(h.root.dataset.step,'1');
  h.window.dispatchEvent(new h.Event('harmony-labels:guide-reveal',{detail:{target:h.query('#result-title')}}));
  assert.equal(h.root.dataset.step,'3');
});
test('guide assets load before controller and remain local without external services',()=>{
  assert.ok(html.indexOf('guided.js?')<html.indexOf('src="app.js?'));
  assert.match(html,/connect-src 'none'/);assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|indexedDB/);
});
