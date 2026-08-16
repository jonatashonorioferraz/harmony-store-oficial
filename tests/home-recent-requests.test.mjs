import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');

async function loadHomeFilters(){
  const source=await read('app.js');
  const start=source.indexOf('const HOME_REQUESTS_LIMIT=');
  const end=source.indexOf('function requestRows',start);
  assert.ok(start>=0&&end>start,'home request helpers should be present');
  const context={
    S:{profile:{id:'admin-1'},requests:[
      {id:'current-pending',created_at:'2026-08-08T12:00:00-03:00',status:'pending'},
      {id:'current-delivered',created_at:'2026-08-03T08:00:00-03:00',status:'delivered'},
      {id:'current-cancelled',created_at:'2026-08-07T08:00:00-03:00',status:'cancelled'},
      // Meio-dia evita que o mesmo domingo atravesse para segunda-feira em ambientes UTC,
      // preservando o objetivo do teste sem depender do fuso do executor.
      {id:'previous',created_at:'2026-08-02T12:00:00-03:00',status:'pending'}
    ]},
    Date,
    console
  };
  vm.runInNewContext(source.slice(start,end)+';globalThis.homeTest={HOME_REQUESTS_LIMIT,homeRequestView,homeRequestRange,filteredHomeRequests};',context);
  return {source,api:context.homeTest};
}

test('home starts compact with the current Monday-to-Sunday week',async()=>{
  const {api}=await loadHomeFilters();
  assert.equal(api.HOME_REQUESTS_LIMIT,5);
  assert.equal(api.homeRequestView.period,'week');
  assert.equal(api.homeRequestView.expanded,false);
  const range=api.homeRequestRange('week',new Date('2026-08-08T15:00:00-03:00'));
  assert.equal(range.from.getDay(),1);
  assert.equal(range.to.getDay(),1);
  assert.equal((range.to-range.from)/(24*60*60*1000),7);
  assert.deepEqual(Array.from(api.filteredHomeRequests(new Date('2026-08-08T15:00:00-03:00')),row=>row.id),['current-pending','current-delivered','current-cancelled']);
});

test('period and status filters preserve completed, cancelled and open history',async()=>{
  const {api}=await loadHomeFilters();
  const now=new Date('2026-08-08T15:00:00-03:00');
  api.filteredHomeRequests(now);
  api.homeRequestView.status='open';
  assert.deepEqual(Array.from(api.filteredHomeRequests(now),row=>row.id),['current-pending']);
  api.homeRequestView.status='delivered';
  assert.deepEqual(Array.from(api.filteredHomeRequests(now),row=>row.id),['current-delivered']);
  api.homeRequestView.period='all';
  api.homeRequestView.status='cancelled';
  assert.deepEqual(Array.from(api.filteredHomeRequests(now),row=>row.id),['current-cancelled']);
});

test('home controls expand safely and stay responsive without changing full requests view',async()=>{
  const [root,web,css]=await Promise.all([read('app.js'),read('web/app.js'),read('styles.css')]);
  assert.equal(root,web);
  assert.match(root,/rows\.slice\(0,HOME_REQUESTS_LIMIT\)/);
  assert.match(root,/id="homeRequestPeriod"/);
  assert.match(root,/id="homeRequestStatus"/);
  assert.match(root,/id="toggleHomeRequests"/);
  assert.match(root,/else if\(S\.view==='requests'\).*requestRows\(\)/s);
  assert.match(css,/\.home-request-filters/);
  assert.match(css,/@media\(max-width:420px\)\{\.home-request-filters/);
});
