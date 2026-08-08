import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const run = promisify(execFile);

test('every duplicated official asset stays byte-for-byte synchronized', async () => {
  const script = fileURLToPath(new URL('../scripts/verify-official-mirrors.mjs', import.meta.url));
  const { stdout, stderr } = await run(process.execPath, [script]);
  assert.equal(stderr, '');
  assert.match(stdout, /arquivos oficiais sincronizados/);
});
