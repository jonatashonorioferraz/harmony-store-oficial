import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');
const [sql,stateSql,ui,css,edge,reminders,index,worker,help,backup,recovery,pkg]=await Promise.all([
  read('supabase/migrations/20260812130000_admin_agenda_harmony.sql'),
  read('supabase/migrations/20260812183000_admin_agenda_production_order_state.sql'),
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

test('production orders can be completed only in Agenda without mutating the original order',()=>{
  for(const table of ['admin_agenda_production_order_states','admin_agenda_production_order_events']){
    assert.match(stateSql,new RegExp(`create table if not exists public\.${table}`));
    assert.match(stateSql,new RegExp(`alter table public\.${table} enable row level security`));
  }
  assert.match(stateSql,/create or replace function public\.admin_set_agenda_production_order_state/);
  assert.match(stateSql,/security invoker/);
  assert.match(stateSql,/if not \(select private\.is_admin\(\)\)/);
  assert.match(stateSql,/agenda_status in \('open','completed'\)/);
  assert.match(stateSql,/admin_agenda_production_order_events/);
  assert.doesNotMatch(stateSql,/update\s+public\.production_orders\s+set/i);
  assert.doesNotMatch(stateSql,/delete\s+from\s+public\.production_orders/i);
  assert.match(ui,/data-agenda-order-state=/);
  assert.match(ui,/isOpen\(item\)\?'completed':'open'/);
  assert.match(ui,/Reabrir na Agenda/);
  assert.match(ui,/p_status:status/);
  assert.match(ui,/admin_set_agenda_production_order_state/);
  assert.match(ui,/O módulo de produção não foi alterado/);
});

test('Home calendar separates planned work from operational requests',()=>{
  assert.match(ui,/Agenda inteligente/);
  assert.match(ui,/function homeAgendaItems\(\)/);
  assert.match(ui,/\['manual','bill'\]\.includes\(item\.source_type\)/);
  assert.match(ui,/function homeCalendarWeek\(items\)/);
  assert.match(ui,/Sem compromissos/);
  assert.match(ui,/data-agenda-home-preview-day/);
  assert.match(ui,/function homeAiInsights\(items\)/);
  assert.match(ui,/INTELIGÊNCIA DO DIA/);
  assert.match(ui,/IA ATIVA/);
  assert.match(ui,/solicita.*ordem de produ/i);
  assert.doesNotMatch(ui,/Seu dia conectado/);
  assert.doesNotMatch(ui,/function timelineItem\(item\)/);
  assert.match(ui,/priority:'normal',status:agendaState/);
  assert.match(css,/\.agenda-week-grid/);
  assert.match(css,/\.agenda-home-intelligence/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.doesNotMatch(ui,/\b(Open|Completed|Reopen|View module)\b/);
});

test('Agenda preserves request panels, replaces only the old day panel and keeps collaborator home',()=>{
  assert.match(ui,/if\(!isAdmin\(\)\|\|S\.view!=='home'\)return/);
  assert.match(ui,/querySelector\('\.my-day-panel'\)/);
  assert.match(ui,/oldDayPanel\.hidden=true/);
  assert.match(ui,/\['#adminRequestHub','\.home-requests'\]/);
  assert.match(ui,/element\.hidden=false/);
  assert.doesNotMatch(ui,/\.remove\(\).*my-day|adminRequestHub.*remove/);
  assert.match(ui,/S\?\.profile\?\.role==='admin'/);
  assert.match(ui,/function homeCalendarWeek\(items\)/);
  assert.match(ui,/function homeAgendaItems\(\)/);
  assert.match(ui,/data-agenda-home-preview-day/);
  assert.match(ui,/data-agenda-home-day/);
  assert.match(ui,/Sem compromissos/);
  assert.match(css,/\.agenda-week/);
  assert.match(css,/scroll-snap-type:x proximity/);
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
  assert.match(edge,/não repita a lista/i);
  assert.match(edge,/Priorize tarefas planejadas, compromissos, boletos/i);
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
  assert.match(reminders,/source: "edge"/);
  assert.match(reminders,/agenda_reminder_idle/);
  assert.match(reminders,/agenda_reminder_failed/);
  assert.doesNotMatch(reminders,/source: "agenda"/);
  assert.doesNotMatch(reminders,/role.*collaborator|role.*receiver/);
});

test('desktop, tablet, mobile, offline and help assets are complete',()=>{
  assert.match(css,/@media\(max-width:1100px\)/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/@media\(max-width:430px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(index,/agenda-harmony\.css\?v=25\.78/);
  assert.match(index,/agenda-harmony\.js\?v=25\.78/);
  assert.match(worker,/harmony-store-v25-85-r1/);
  assert.match(worker,/agenda-harmony\.css\?v=25\.78/);
  assert.match(worker,/agenda-harmony\.js\?v=25\.78/);
  assert.match(help,/id:'agenda-harmony'/);
  assert.match(help,/calendário semanal da Agenda/);
  assert.match(help,/Central de Pendências/);
  assert.equal(JSON.parse(pkg).version,'25.85.0');
});

test('backup and isolated recovery include every Agenda table',()=>{
  for(const source of [backup,recovery])for(const table of ['admin_agenda_tasks','admin_agenda_task_events','admin_agenda_reminder_deliveries','admin_agenda_ai_settings','admin_agenda_ai_runs','admin_agenda_production_order_states','admin_agenda_production_order_events'])assert.match(source,new RegExp(`'${table}'`));
});
