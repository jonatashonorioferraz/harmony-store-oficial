import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(new URL('../supabase/migrations/012_harden_function_execute_privileges.sql', import.meta.url), 'utf8');

test('security definer functions are revoked from public and anon', () => {
  assert.match(sql, /n\.nspname\s*=\s*'public'/i);
  assert.match(sql, /p\.prosecdef/i);
  assert.match(sql, /revoke execute on function %s from public, anon/i);
});

test('authenticated users retain non-trigger business functions', () => {
  assert.match(sql, /p\.prorettype\s*<>\s*'pg_catalog\.trigger'::regtype/i);
  assert.match(sql, /grant execute on function %s to authenticated/i);
  assert.match(sql, /revoke execute on function public\.create_profile_for_new_auth_user\(\) from authenticated/i);
});

test('privilege migration is transactional and reloads the API schema', () => {
  assert.match(sql, /begin;/i);
  assert.match(sql, /notify pgrst, 'reload schema'/i);
  assert.match(sql, /commit;/i);
});
