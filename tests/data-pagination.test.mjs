import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const [app,webApp,supplies,intelligence,bills,timeline]=await Promise.all([
  read('app.js'),read('web/app.js'),read('internal-supplies.js'),read('intelligence.js'),read('bills.js'),read('collaborator-timeline.js')
]);

function paginationSource(){
  const start=app.indexOf('// DATA_PAGINATION_START');
  const end=app.indexOf('// DATA_PAGINATION_END');
  assert.ok(start>=0&&end>start,'marcadores da paginação devem existir');
  return app.slice(start,end);
}

test('REST pagination joins every page and preserves caller headers',async()=>{
  const calls=[],pages=[[{id:1},{id:2}],[{id:3},{id:4}],[{id:5}]];
  const context={rest:async(path,options)=>{calls.push({path,options});return pages.shift()}};
  vm.runInNewContext(paginationSource(),context);
  const rows=await context.restAll('records?select=*&order=id.asc',{headers:{Prefer:'count=exact'}},2);
  assert.equal(Array.from(rows,item=>item.id).join(','),'1,2,3,4,5');
  assert.deepEqual(calls.map(call=>call.options.headers.Range),['0-1','2-3','4-5']);
  assert.ok(calls.every(call=>call.options.headers.Prefer==='count=exact'));
});

test('REST pagination rejects an unexpected non-list response',async()=>{
  const context={rest:async()=>({message:'unexpected'})};
  vm.runInNewContext(paginationSource(),context);
  await assert.rejects(context.restAll('records?select=*'),/lista válida/);
});

test('high-volume operational collections use deterministic pagination',()=>{
  assert.equal(app,webApp);
  assert.match(app,/restAll\('products\?select=\*&order=name\.asc,id\.asc'/);
  assert.match(app,/restAll\('requests\?select=\*&order=created_at\.desc,id\.desc'/);
  for(const source of [supplies,intelligence,bills,timeline])assert.match(source,/restAll\(/);
  assert.match(supplies,/internal_supply_request_items\?select=\*&order=id\.asc/);
  assert.match(intelligence,/improvement_idea_events\?select=\*&order=created_at\.desc,id\.desc/);
  assert.match(bills,/bills\?select=\*&order=due_date\.asc,created_at\.desc,id\.desc/);
});

test('timeline requests are filtered in Supabase without replacing the global request list',()=>{
  assert.match(timeline,/requested_by=eq\./);
  assert.match(timeline,/created_at=gte\./);
  assert.match(timeline,/CT\.requests=requests/);
  assert.doesNotMatch(timeline,/S\.requests=requests/);
  assert.match(timeline,/CT\.requests\.find\(item=>item\.id===id\)\|\|S\.requests\.find/);
});
