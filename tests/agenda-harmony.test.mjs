import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');
const [sql,ui,css,edge,reminders,index,worker,help,backup,recovery,pkg]=await Promise.all([
  read('supabase/migrations/20260812130000_admin_agenda_harmony.sql'),
  read('agenda-harmony.js'),read('agenda-harmony.css'),
  read('supabase/functions/analyze-admin-agenda/index.ts'),
  read('supabase/functions/send-agenda-reminders/index.ts'),
  read('index.html'),read('service-worker.js'),read('help-center.js'),
  read('scripts/create-api-backup.mjs'),read('scripts/execute-api-recovery.mjs'),read('package.json')
]);

test('Agenda database is additive, admin-only and audited',()=>{
  assert.doesNotMatch(sql,/drop\s+table|truncate\s+table|delete\s+from\s+public\./i);
  for(const table of ['admin_agenda_tasks','admin_agenda_task_events','admin_agenda_reminder_deliveries','admin_agenda_ai_settings','admin_agenda_ai_runs']){
    assert.match(sql,new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql,/using \(\(select private\.is_admin\(\)\)\)/);
  assert.match(sql,/private\.is_primary_admin\(\)/);
  assert.match(sql,/agenda\.task_created/);
  assert.match(sql,/agenda\.task_status_changed/);
  assert.match(sql,/revoke all on function public\.admin_create_agenda_task\(jsonb\) from public,anon,authenticated/);
});

test('Agenda stores manual work but reads module items without copying them',()=>{
  assert.match(ui,/source_type:'request'/);
  assert.match(ui,/source_type:'bill'/);
  assert.match(ui,/source_type:'production_order'/);
  assert.match(ui,/source_type:'internal_supply'/);
  assert.match(ui,/window\.HarmonyBills\?\.open/);
  assert.match(ui,/window\.HarmonyInternalSupplies\?\.openRequest/);
  assert.match(ui,/window\.HarmonyProductionOrders\?\.open/);
  assert.doesNotMatch(ui,/admin_(mark_bill|complete_request|update_production_order|transfer_production_inventory)/i);
});

test('Agenda replaces repeated admin home panels visually and preserves collaborator home',()=>{
  assert.match(ui,/if\(!isAdmin\(\)\|\|S\.view!=='home'\)return/);
  assert.match(ui,/\.my-day-panel','#adminRequestHub','\.home-requests'/);
  assert.match(ui,/element\.hidden=true/);
  assert.doesNotMatch(ui,/\.remove\(\).*my-day|adminRequestHub.*remove/);
  assert.match(ui,/S\?\.profile\?\.role==='admin'/);
});

test('AI is server-side, budgeted, advisory and never mutates operational modules',()=>{
  assert.match(edge,/admin\.auth\.getUser\(bearer\)/);
  assert.match(edge,/caller\.role !== "admin"/);
  assert.match(edge,/OPENAI_API_KEY/);
  assert.match(edge,/gpt-5\.6-luna/);
  assert.match(edge,/store: false/);
  assert.match(edge,/type: "json_schema"/);
  assert.match(edge,/monthly_budget_usd/);
  assert.match(edge,/daily_analysis_limit/);
  assert.match(edge,/manual_tasks:[\s\S]*task_kind[\s\S]*starts_at/);
  assert.doesNotMatch(edge,/manual_tasks:[^\n]*title/);
  assert.match(edge,/não afirme que realizou ações/i);
  assert.doesNotMatch(edge,/\.from\("(bills|requests|production_orders|production_inventory_entries)"\)\.\s*(insert|update|delete)/i);
  assert.doesNotMatch(ui,/OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
});

test('reminders use the existing protected push infrastructure and target admins only',()=>{
  assert.match(reminders,/trustedSecretKeys/);
  assert.match(reminders,/\.eq\("role", "admin"\)\.eq\("status", "active"\)/);
  assert.match(reminders,/admin_agenda_reminder_deliveries/);
  assert.match(reminders,/scheduled_for: task\.reminder_at/);
  assert.match(reminders,/push_subscriptions/);
  assert.match(reminders,/icon: "\.\/icon-192-v2\.png"/);
  assert.doesNotMatch(reminders,/role.*collaborator|role.*receiver/);
});

test('desktop, tablet, mobile, offline and help assets are complete',()=>{
  assert.match(css,/@media\(max-width:1100px\)/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/@media\(max-width:430px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(index,/agenda-harmony\.css\?v=25\.75/);
  assert.match(index,/agenda-harmony\.js\?v=25\.75/);
  assert.match(worker,/harmony-store-v25-75/);
  assert.match(worker,/agenda-harmony\.css\?v=25\.75/);
  assert.match(worker,/agenda-harmony\.js\?v=25\.75/);
  assert.match(help,/id:'agenda-harmony'/);
  assert.equal(JSON.parse(pkg).version,'25.75.0');
});

test('backup and isolated recovery include every Agenda table',()=>{
  for(const source of [backup,recovery])for(const table of ['admin_agenda_tasks','admin_agenda_task_events','admin_agenda_reminder_deliveries','admin_agenda_ai_settings','admin_agenda_ai_runs'])assert.match(source,new RegExp(`'${table}'`));
});
