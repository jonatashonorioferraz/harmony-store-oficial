import { assertCapturedAndPlannedTables, assertPreservedIdentity } from './backup-assertions.mjs';
import { htmlAssets, workerAssets } from '../scripts/lib/release-assets.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const [ui,css,migration,reactivation,correction,pendingCorrection,edge,html,worker]=await Promise.all([
  read('bills.js'),read('bills.css'),read('supabase/migrations/20260725212141_admin_bills.sql'),
  read('supabase/migrations/20260727160000_bill_reactivation.sql'),
  read('supabase/migrations/20260819190000_bill_due_date_correction_reactivation.sql'),
  read('supabase/migrations/20260918193547_correct_pending_bill_due_date.sql'),
  read('supabase/functions/analyze-bill/index.ts'),read('index.html'),read('service-worker.js'),
]);

test('bill data and documents are admin-only, private and audited',()=>{
  assert.match(migration,/create table public\.bills/i);
  assert.match(migration,/enable row level security/gi);
  assert.match(migration,/private\.is_admin\(\)/i);
  assert.match(migration,/values\('bill-documents','bill-documents',false/i);
  assert.match(migration,/bill\.created/);
  assert.match(migration,/bill\.updated/);
  assert.match(migration,/bill\.paid/);
  assert.match(migration,/bill\.cancelled/);
  assert.match(migration,/create unique index bills_digit_line_unique\s+on public\.bills\(digit_line\)/i);
  assert.match(ui,/Este boleto já está cadastrado/);
  assert.match(migration,/revoke all on function public\.admin_create_bill\(jsonb\) from public,anon,authenticated/i);
  assert.doesNotMatch(migration,/role in \('admin','receiver'\)/i);
});

test('bill AI uses authenticated private files, structured output and human review',()=>{
  assert.match(edge,/admin\.auth\.getUser\(token\)/);
  assert.match(edge,/caller\.role !== "admin"/);
  assert.match(edge,/Deno\.env\.get\("OPENAI_API_KEY"\)/);
  assert.match(edge,/store: false/);
  assert.match(edge,/type: "json_schema"/);
  assert.match(edge,/type: "input_file"/);
  assert.match(edge,/type: "input_image"/);
  assert.match(edge,/file\.size > 10485760/);
  assert.match(edge,/count \|\| 0\) >= 20/);
  assert.match(ui,/REVISÃO OBRIGATÓRIA/);
  assert.match(ui,/Confira novamente o beneficiário e o valor/);
  assert.doesNotMatch(ui,/OPENAI_API_KEY|service_role/i);
});

test('digit line is checked independently of AI before saving',()=>{
  const context={S:{profile:{role:'admin'}},window:{},renderApp(){},renderPage(){},document:{},setTimeout,clearTimeout};
  context.window=context;
  vm.runInNewContext(ui,context);
  const valid='00190500954014481606906809350314337370000000100';
  assert.equal(context.HarmonyBills.validDigitLine(valid),true);
  assert.equal(context.HarmonyBills.validDigitLine(valid.slice(0,-1)+'1'),false,'the general check digit also protects the amount');
  assert.equal(context.HarmonyBills.validDigitLine('00191500954014481606906809350314337370000000100'),false);
  assert.equal(context.HarmonyBills.validDigitLine('11111111111111111111111111111111111111111111111'),false);
  assert.match(ui,/if\(!validDigitLine\(line\.value\)\)return alert/);
  assert.match(migration,/digit_line text not null check \(digit_line ~ '\^\[0-9\]\{44\}\$\|\^\[0-9\]\{47\}\$\|\^\[0-9\]\{48\}\$'\)/);
});

test('bill workflow supports upload, quick copy, payment proof and due alerts',()=>{
  assert.match(ui,/application\/pdf,image\/jpeg,image\/png,image\/webp/);
  assert.match(ui,/navigator\.clipboard\.writeText\(item\.digit_line\)/);
  assert.match(ui,/admin_mark_bill_paid/);
  assert.match(ui,/payment_proof_path/);
  assert.match(ui,/dueState/);
  assert.match(css,/\.bill-status\.overdue/);
  assert.match(css,/@media\(max-width:600px\)/);
  for (const name of ['bills.css', 'bills.js']) {
    const asset = htmlAssets(html).get(name);
    assert.ok(asset?.version, name + ' must be versioned');
    assert.equal(workerAssets(worker).get(name)?.version, asset.version);
  }



});

test('bill upload gets a longer timeout without changing ordinary API requests',async()=>{
  const app=await read('app.js');
  const apiSource=app.match(/^async function apiFetch\(url,opt=\{\}\)\{.*$/m)?.[0];
  const uploadSource=ui.match(/^async function uploadDocument\(file,prefix='document'\)\{.*$/m)?.[0];
  assert.ok(apiSource);
  assert.ok(uploadSource);
  const delays=[];
  const apiContext={API_REQUEST_TIMEOUT_MS:15000,AbortController,fetch:async()=>({ok:true}),setTimeout:(_callback,delay)=>{delays.push(delay);return 1},clearTimeout:()=>{}};
  vm.runInNewContext(apiSource+';globalThis.callApi=apiFetch',apiContext);
  await apiContext.callApi('/ordinary');
  await apiContext.callApi('/bill-upload',{timeoutMs:120000});
  assert.deepEqual(delays,[15000,120000]);
  const uploads=[];
  const uploadContext={S:{profile:{id:'admin-id'}},crypto:{randomUUID:()=> 'test-id'},encodedStoragePath:path=>path,storageFetch:async(path,options)=>{uploads.push({path,options});return{ok:true}}};
  vm.runInNewContext(uploadSource+';globalThis.uploadBill=uploadDocument',uploadContext);
  await uploadContext.uploadBill({type:'image/webp',size:1024});
  assert.equal(uploads[0].options.timeoutMs,120000);
  assert.match(uploads[0].path,/bill-documents\/admin-id\/document-test-id\.webp$/);
});
test('cancelled bills can be safely reactivated without bypassing duplicate protection',()=>{
  assert.match(ui,/existing\.status==='cancelled'/);
  assert.match(ui,/return detail\(existing\)/);
  assert.match(reactivation,/^begin;/m);
  assert.match(reactivation,/^commit;/m);
  assert.match(reactivation,/private\.is_admin\(\)/);
  assert.match(reactivation,/for update/);
  assert.match(reactivation,/v_bill\.status <> 'cancelled'/);
  assert.match(reactivation,/set status = 'pending'/);
  assert.match(reactivation,/cancelled_at = null/);
  assert.match(reactivation,/bill\.reactivated/);
  assert.match(reactivation,/revoke all on function public\.admin_reactivate_bill\(uuid\) from public, anon, authenticated/);
  assert.match(reactivation,/grant execute on function public\.admin_reactivate_bill\(uuid\) to authenticated, service_role/);
  assert.doesNotMatch(reactivation,/delete from public\.bills/i);
});

test('cancelled bill due date is corrected and reactivated atomically with an audit trail',()=>{
  assert.match(ui,/Corrigir vencimento e reativar/);
  assert.match(ui,/billDueDateCorrectionForm/);
  assert.match(ui,/admin_correct_bill_due_date_and_reactivate/);
  assert.match(ui,/p_due_date:dueDate/);
  assert.match(ui,/histórico será preservado/i);
  assert.match(correction,/^begin;/m);
  assert.match(correction,/^commit;/m);
  assert.match(correction,/private\.is_admin\(\)/);
  assert.match(correction,/for update/);
  assert.match(correction,/v_bill\.status <> 'cancelled'/);
  assert.match(correction,/set due_date = p_due_date,\s+status = 'pending'/);
  assert.match(correction,/cancelled_at = null/);
  assert.match(correction,/bill\.due_date_corrected_and_reactivated/);
  assert.match(correction,/'previous_due_date', v_bill\.due_date/);
  assert.match(correction,/'new_due_date', p_due_date/);
  assert.match(correction,/revoke all on function public\.admin_correct_bill_due_date_and_reactivate\(uuid, date\) from public, anon, authenticated/);
  assert.match(correction,/grant execute on function public\.admin_correct_bill_due_date_and_reactivate\(uuid, date\) to authenticated, service_role/);
  assert.doesNotMatch(correction,/delete from public\.bills/i);
});

test('pending and overdue bills can correct only the due date with locking and audit',()=>{
  assert.match(ui,/pendingDueDateCorrectionModal/);
  assert.match(ui,/correctPendingBillDueDate/);
  assert.match(ui,/Somente a data será alterada/);
  assert.match(ui,/admin_correct_pending_bill_due_date/);
  assert.match(ui,/item\?\.status!=='pending'/);
  assert.match(ui,/dueDate===item\.due_date/);
  assert.match(pendingCorrection,/^begin;/m);
  assert.match(pendingCorrection,/^commit;/m);
  assert.match(pendingCorrection,/private\.is_admin\(\)/);
  assert.match(pendingCorrection,/for update/);
  assert.match(pendingCorrection,/v_bill\.status <> 'pending'/);
  assert.match(pendingCorrection,/set due_date = p_due_date,\s+updated_by = v_actor/);
  assert.match(pendingCorrection,/bill\.pending_due_date_corrected/);
  assert.match(pendingCorrection,/'previous_due_date', v_bill\.due_date/);
  assert.match(pendingCorrection,/'new_due_date', p_due_date/);
  assert.match(pendingCorrection,/revoke all on function public\.admin_correct_pending_bill_due_date\(uuid, date\) from public, anon, authenticated/);
  assert.match(pendingCorrection,/grant execute on function public\.admin_correct_pending_bill_due_date\(uuid, date\) to authenticated, service_role/);
  const updateClause=pendingCorrection.match(/update public\.bills([\s\S]*?)where id/)?.[1]||'';
  assert.doesNotMatch(updateClause,/amount\s*=/i);
  assert.doesNotMatch(updateClause,/digit_line\s*=/i);
  assert.doesNotMatch(updateClause,/status\s*=/i);
});

test('bill dashboard summarizes counts and amounts and uses every total as a filter',()=>{
  for(const group of ['all','pending','paid','cancelled','overdue','today','tomorrow']){
    assert.match(ui,new RegExp(`card\\('${group}'`));
  }
  assert.match(ui,/items\.length\.toLocaleString\('pt-BR'\)/);
  assert.match(ui,/items\.reduce\(\(sum,item\)=>sum\+Number\(item\.amount\),0\)/);
  assert.match(ui,/data-bill-metric-filter/);
  assert.match(ui,/matchesBillFilter/);
  assert.match(ui,/button\.dataset\.billMetricFilter/);
  assert.match(css,/\.bill-metric\.active/);
  assert.match(css,/\.bill-metric\.total\{grid-column:1\/-1\}/);
});

test('bill assets are mirrored and included in backup and recovery',async()=>{
  assert.equal(ui,await read('web/bills.js'));
  assert.equal(css,await read('web/bills.css'));
  assertCapturedAndPlannedTables(["bills","bill_ai_runs"]);
  assertPreservedIdentity('bills', 'protocol');
  assertPreservedIdentity('bill_ai_runs', 'id');
});

test('Meu dia loads due bills only for admins',async()=>{
  const myDay=await read('my-day.js');
  assert.match(myDay,/role\(\)==='admin'\?window\.HarmonyBills\?\.load/);
  assert.match(myDay,/item\.status==='pending'/);
  assert.match(myDay,/HarmonyBills\.dueState\(item\)!=='pending'/);
  assert.match(myDay,/action:'bills'/);
});

// Execute the actual financial classifier with fixed instants around São Paulo midnight.
test('bill due classification follows São Paulo date after 21h and midnight',()=>{
  for(const [instant,expected] of [
    ['2026-10-01T23:59:59Z','today'],
    ['2026-10-02T00:00:00Z','today'],
    ['2026-10-02T02:59:59Z','today'],
    ['2026-10-02T03:00:00Z','overdue'],
  ]){
    class FixedDate extends Date{constructor(...args){super(...(args.length?args:[instant]))}static now(){return Date.parse(instant)}}
    const context={S:{profile:{role:'admin'}},window:{},Date:FixedDate,Intl,renderApp(){},renderPage(){},document:{},setTimeout,clearTimeout};
    context.window=context;vm.runInNewContext(ui,context);
    assert.equal(context.HarmonyBills.dueState({status:'pending',due_date:'2026-10-01'}),expected,instant);
    assert.equal(context.HarmonyBills.dueState({status:'paid',due_date:'2026-10-01'}),'paid');
    assert.equal(context.HarmonyBills.dueState({status:'cancelled',due_date:'2026-10-01'}),'cancelled');
  }
});
