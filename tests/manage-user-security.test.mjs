import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../supabase/functions/manage-user/index.ts', import.meta.url), 'utf8');

test('primary administrator credentials are protected from other admins', () => {
  assert.match(source, /target\.is_primary_admin\s*&&\s*!isSelf/);
  assert.match(source, /credenciais da administradora principal só podem ser alteradas por ela mesma/i);
  assert.match(source, /target\.role\s*===\s*["']admin["']\s*&&\s*!caller\.is_primary_admin\s*&&\s*!isSelf/);
});

test('only the primary administrator can create or promote another admin', () => {
  assert.match(source, /requestedRole\s*===\s*["']admin["']\s*&&\s*!caller\.is_primary_admin/);
  assert.match(source, /target\.role\s*!==\s*["']admin["']\s*&&\s*requestedRole\s*===\s*["']admin["']\s*&&\s*!caller\.is_primary_admin/);
});

test('primary role and own active status remain protected', () => {
  assert.match(source, /const protectedRole\s*=\s*target\.is_primary_admin/);
  assert.match(source, /const protectedStatus\s*=\s*target\.is_primary_admin\s*\|\|\s*isSelf/);
});

test('manage-user rejects methods other than POST and OPTIONS', () => {
  assert.match(source, /req\.method\s*!==\s*["']POST["']/);
  assert.match(source, /Método não permitido/);
});

test('every active user can change only their own password', () => {
  const ownAction = source.indexOf('action === "change-own-password"');
  const adminGate = source.indexOf('caller.role !== "admin"');
  assert.ok(ownAction > -1 && adminGate > ownAction);
  assert.match(source, /Authorization:\s*`Bearer \$\{token\}`/);
  assert.match(source, /body:\s*JSON\.stringify\(\{ password \}\)/);
  assert.match(source, /\.update\(\{ must_change_password: false \}\)/);
  assert.match(source, /\.eq\("id", authData\.user\.id\)/);
});

test('temporary passwords follow the strong policy and admin resets require a new change', () => {
  assert.match(source, /password\.length < 10/);
  assert.match(source, /\!\/\[a-z\]\//);
  assert.match(source, /\!\/\[A-Z\]\//);
  assert.match(source, /patch\.must_change_password\s*=\s*!isSelf/);
});
