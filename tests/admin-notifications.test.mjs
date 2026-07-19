import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('notification schema restricts sending to the primary admin and reading to recipients', async () => {
  const sql = await read('supabase/migrations/20260719193000_admin_notifications.sql');
  assert.match(sql, /create table if not exists public\.app_notifications/i);
  assert.match(sql, /create table if not exists public\.app_notification_recipients/i);
  assert.match(sql, /private\.is_primary_admin\(\)/i);
  assert.match(sql, /recipient_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /revoke all on table public\.app_notifications from anon, authenticated/i);
  assert.match(sql, /grant select on table public\.app_notifications to authenticated/i);
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete).*app_notifications.*authenticated/i);
});

test('notification RPC snapshots active recipients, records audit and supports read confirmation', async () => {
  const sql = await read('supabase/migrations/20260719193000_admin_notifications.sql');
  assert.match(sql, /status = 'active' and role in \('collaborator', 'receiver'\)/i);
  assert.match(sql, /app_notification\.sent/i);
  assert.match(sql, /create or replace function public\.mark_app_notification_read/i);
  assert.match(sql, /set read_at = coalesce\(read_at, now\(\)\)/i);
  assert.match(sql, /create or replace function public\.mark_all_app_notifications_read/i);
});

test('admin push validates primary admin and uses persisted notification recipients', async () => {
  const edge = await read('supabase/functions/send-push/index.ts');
  assert.match(edge, /event === "admin_message"/);
  assert.match(edge, /!caller\.is_primary_admin/);
  assert.match(edge, /from\("app_notification_recipients"\)/);
  assert.match(edge, /priority === "urgent" \? "high" : "normal"/);
  assert.match(edge, /icon: "\.\/icon-192-v2\.png"/);
});

test('notification center provides global, individual, unread and responsive flows', async () => {
  const [js, css, html, worker] = await Promise.all([
    read('notifications.js'), read('notifications.css'), read('index.html'), read('service-worker.js'),
  ]);
  assert.match(js, /Central de Notificações/);
  assert.match(js, /Aviso global/);
  assert.match(js, /data-notify-user/);
  assert.match(js, /mark_all_app_notifications_read/);
  assert.match(js, /Lembrete de solicitação/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /priority-urgent/);
  assert.match(html, /notifications\.css/);
  assert.match(html, /notifications\.js/);
  assert.match(worker, /harmony-store-v25-6/);
  assert.match(worker, /requireInteraction:data\.priority==='urgent'/);
});

test('notification data participates in backup and documentation', async () => {
  const [backup, manual, technical, changelog] = await Promise.all([
    read('scripts/create-api-backup.mjs'),
    read('docs/manual/MANUAL-DO-APLICATIVO.md'),
    read('docs/technical/ARQUITETURA-E-OPERACAO.md'),
    read('CHANGELOG.md'),
  ]);
  assert.match(backup, /'app_notifications', 'app_notification_recipients'/);
  assert.match(manual, /Central de Notificações/);
  assert.match(technical, /app_notification_recipients/);
  assert.match(changelog, /\[v25\.3\]/);
});
