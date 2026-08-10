import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const [ui,css,migration,reactivation,edge,html,worker,backup,recovery]=await Promise.all([
  read('bills.js'),read('bills.css'),read('supabase/migrations/20260725212141_admin_bills.sql'),
  read('supabase/migrations/20260727160000_bill_reactivation.sql'),
  read('supabase/functions/analyze-bill/index.ts'),read('index.html'),read('service-worker.js'),
  read('scripts/create-api-backup.mjs'),read('scripts/execute-api-recovery.mjs')
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
  assert.match(html,/bills\.css\?v=25\.49/);
  assert.match(html,/bills\.js\?v=25\.66/);
  assert.match(worker,/bills\.js\?v=25\.66/);
});

test('cancelled bills can be safely reactivated without bypassing duplicate protection',()=>{
  assert.match(ui,/admin_reactivate_bill/);
  assert.match(ui,/Reativar boleto/);
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
  assert.match(backup,/'bills', 'bill_ai_runs'/);
  assert.match(recovery,/'bills', 'bill_ai_runs'/);
  assert.match(recovery,/bills: \['protocol'\]/);
  assert.match(recovery,/bill_ai_runs: \['id'\]/);
});

test('Meu dia loads due bills only for admins',async()=>{
  const myDay=await read('my-day.js');
  assert.match(myDay,/role\(\)==='admin'\?window\.HarmonyBills\?\.load/);
  assert.match(myDay,/item\.status==='pending'/);
  assert.match(myDay,/HarmonyBills\.dueState\(item\)!=='pending'/);
  assert.match(myDay,/action:'bills'/);
});
