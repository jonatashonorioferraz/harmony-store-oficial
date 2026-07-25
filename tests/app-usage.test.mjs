import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');

test('app usage schema is private, bounded and admin-only',async()=>{
  const sql=await read('supabase/migrations/20260725174925_collaborator_app_usage.sql');
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/revoke all privileges on table public\.app_usage_sessions from public, anon, authenticated/i);
  assert.match(sql,/auth\.jwt\(\)->>'session_id'/);
  assert.match(sql,/least\(90,/);
  assert.match(sql,/if not \(select private\.is_admin\(\)\)/);
  assert.match(sql,/where usage_date < v_usage_date - 180/);
  assert.doesNotMatch(sql,/ip_address|user_agent|page_url|route_history/i);
});

test('usage UI records only workers and explains approximate data',async()=>{
  const source=await read('app-usage.js');
  assert.match(source,/\['collaborator','receiver'\]/);
  assert.match(source,/document\.visibilityState!=='visible'/);
  assert.match(source,/Date\.now\(\)-lastActivity>120000/);
  assert.match(source,/admin_list_app_usage_summary/);
  assert.match(source,/tempo é aproximado/i);
});

test('usage assets are mirrored, versioned, cached and responsive',async()=>{
  const [rootJs,webJs,rootCss,webCss,html,worker]=await Promise.all([
    read('app-usage.js'),read('web/app-usage.js'),read('app-usage.css'),read('web/app-usage.css'),
    read('index.html'),read('service-worker.js')
  ]);
  assert.equal(rootJs,webJs);
  assert.equal(rootCss,webCss);
  assert.match(html,/app-usage\.css\?v=25\.34/);
  assert.match(html,/app-usage\.js\?v=25\.34/);
  assert.match(worker,/app-usage\.js\?v=25\.34/);
  assert.match(rootCss,/@media\(max-width:720px\)/);
});
