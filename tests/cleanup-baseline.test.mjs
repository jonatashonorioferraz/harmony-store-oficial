import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const supplies = await readFile(new URL('../internal-supplies.js', import.meta.url), 'utf8');
const backup = await readFile(new URL('../scripts/create-api-backup.mjs', import.meta.url), 'utf8');

test('legacy internal supply modals stay removed from the official runtime', () => {
  assert.doesNotMatch(supplies, /function (prepareModal|scheduleModal|completeModal)\s*\(/);
});

test('the backup script imports only path helpers it uses', () => {
  assert.doesNotMatch(backup, /\bbasename\b/);
});

test('the reliability migration has one authoritative copy', async () => {
  await access(new URL('../supabase/migrations/007_reliability_improvements.sql', import.meta.url));
  await assert.rejects(access(new URL('../007_reliability_improvements.sql', import.meta.url)));
});

test('the current request detail flow remains the V2 implementation', () => {
  assert.match(app, /function bindRequests\(\)[\s\S]*requestModalV2/);
  assert.match(app, /async function requestModalV2\s*\(/);
});
