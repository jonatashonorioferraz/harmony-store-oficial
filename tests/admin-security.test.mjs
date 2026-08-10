import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const [app,webApp,manageUser,migration,rollback]=await Promise.all([
  read('app.js'),
  read('web/app.js'),
  read('supabase/functions/manage-user/index.ts'),
  read('supabase/migrations/20260808140000_admin_recent_password_protection.sql'),
  read('supabase/rollbacks/20260808140000_admin_recent_password_protection.sql'),
]);

test('official clients keep persistent sessions without weakening administrative step-up security',()=>{
  assert.equal(app,webApp);
  assert.match(app,/ADMIN_REAUTH_WINDOW_MS=10\*60\*1000/);
  assert.doesNotMatch(app,/ADMIN_IDLE_LIMIT_MS|adminSessionExpired|lockIdleAdminSession|ADMIN_IDLE_LOCK/);
  assert.match(app,/async function restore\(\)[\s\S]*await ensureSession\(\)[\s\S]*await loadAccount\(\)/);
  assert.match(app,/async function refreshSession\(\)[\s\S]*grant_type=refresh_token/);
  assert.match(app,/async function logout\(\)[\s\S]*\/auth\/v1\/logout/);
  assert.match(app,/localStorage\.removeItem\('harmony\.admin\.last_activity'\)/);
});

test('step-up authentication uses a fresh password grant without persisting the password',()=>{
  assert.match(app,/function lastPasswordAuthentication\(\)[\s\S]*item\?\.method==='password'/);
  assert.match(app,/async function passwordSignIn\(password\)[\s\S]*grant_type=password/);
  assert.match(app,/function requireRecentAdminAuth\(reason=/);
  assert.match(app,/A confirmação valerá por 10 minutos/);
  assert.doesNotMatch(app,/localStorage\.setItem\([^\n]*password/);
});

test('irreversible catalog and request actions require recent administrator confirmation',()=>{
  assert.match(app,/requireRecentAdminAuth\('excluir definitivamente este produto'\)/);
  assert.match(app,/requireRecentAdminAuth\('excluir esta categoria'\)/);
  assert.match(app,/requireRecentAdminAuth\('excluir este campo e seus valores'\)/);
  assert.match(app,/requireRecentAdminAuth\('excluir definitivamente esta solicitação'\)/);
  assert.match(app,/body\?\.action!=='change-own-password'\)await requireRecentAdminAuth/);
});

test('user management validates the verified JWT password timestamp at the server',()=>{
  assert.match(manageUser,/admin\.auth\.getUser\(token\)/);
  assert.match(manageUser,/function hasRecentPasswordAuthentication\(token: string, maxAgeSeconds = 600\)/);
  assert.match(manageUser,/item\.method === "password"/);
  assert.match(manageUser,/code: "ADMIN_REAUTH_REQUIRED"/);
});

test('database enforces recent password authentication beyond the interface',()=>{
  assert.match(migration,/auth\.jwt\(\)->'amr'/);
  assert.match(migration,/entry->>'method' = 'password'/);
  assert.match(migration,/perform private\.require_recent_password_auth\(600\)/g);
  assert.match(migration,/create policy "category: recent admin delete"/);
  assert.match(migration,/create policy "field definition: recent admin delete"/);
  assert.match(migration,/create policy "request: recent admin delete"/);
  assert.match(migration,/recent_password_confirmed', true/);
  assert.match(rollback,/drop function if exists private\.require_recent_password_auth/);
  assert.match(rollback,/create policy "request: admin delete"/);
});
