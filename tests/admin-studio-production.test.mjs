import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../admin-studio.js',import.meta.url),'utf8');
function api(){
  const context={S:{profile:null},window:{},renderApp(){},renderPage:async()=>{},MutationObserver:class{observe(){}},queueMicrotask,document:{documentElement:{toggleAttribute(){},removeAttribute(){}},querySelector:()=>null,getElementById:()=>null,querySelectorAll:()=>[]}};
  vm.runInNewContext(source,context);
  return context.window.HarmonyAdminStudio;
}
test('ADM production data remains unavailable until loaded',()=>{
  const mod=api();
  for(const state of [undefined,{}, {orders:[],loaded:false},{orders:[],loaded:true,loading:true}]) {
    const result=mod.productionSnapshot(state);
    assert.equal(result,null);
  }
});
test('ADM production groups workflow states without counting cancellations',()=>{
  const result=api().productionSnapshot({loaded:true,loading:false,orders:[{status:'draft'},{status:'sent'},{status:'viewed'},{status:'acknowledged'},{status:'cancelled'}]});
  assert.equal(result.total,4);
  assert.deepEqual(Array.from(result.counts),[1,2,1]);
  assert.deepEqual(Array.from(result.percentages),[25,50,25]);
});
test('ADM empty loaded production is a real zero',()=>{
  const result=api().productionSnapshot({loaded:true,orders:[]});
  assert.equal(result.total,0);
  assert.deepEqual(Array.from(result.percentages),[0,0,0]);
});
test('ADM approved composition uses accessible real controls and preserves additional modules',()=>{
  for(const marker of ['studio-brand','studio-toolbar','studio-metrics','studio-queue','studio-calendar','studio-more','studio-extra','showModal','data-studio-route']) assert.ok(source.includes(marker),marker);
  assert.match(source,/Confirma&ccedil;&atilde;o n&atilde;o significa produ&ccedil;&atilde;o conclu&iacute;da/);
  assert.doesNotMatch(source,/localStorage|sessionStorage|fetch\s*\(/);
});
