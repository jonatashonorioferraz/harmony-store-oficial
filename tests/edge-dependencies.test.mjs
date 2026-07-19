import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [manageUser, sendPush, analyzeReceipt] = await Promise.all([
  readFile(new URL('../supabase/functions/manage-user/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/send-push/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/analyze-internal-receipt/index.ts', import.meta.url), 'utf8'),
]);

test('Supabase client is pinned to the same exact version in every Edge Function', () => {
  const expected = 'npm:@supabase/supabase-js@2.110.7';
  assert.match(manageUser, new RegExp(expected.replaceAll('.', '\\.')));
  assert.match(sendPush, new RegExp(expected.replaceAll('.', '\\.')));
  assert.match(analyzeReceipt, new RegExp(expected.replaceAll('.', '\\.')));
  assert.doesNotMatch(manageUser, /supabase-js@2["']/);
  assert.doesNotMatch(sendPush, /supabase-js@2["']/);
  assert.doesNotMatch(analyzeReceipt, /supabase-js@2["']/);
});

test('web-push remains pinned to an exact version', () => {
  assert.match(sendPush, /npm:web-push@3\.6\.7/);
});
