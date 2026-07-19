import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');

test('business data is not loaded while the temporary password flag is active', () => {
  assert.match(app, /if\(!S\.profile\.must_change_password\)await loadData\(\)/);
  assert.match(app, /if\(S\.profile\?\.must_change_password\)return renderRequiredPasswordChange\(\)/);
});

test('the forced flow changes the own password and only then loads the application', () => {
  assert.match(app, /edge\(\{action:'change-own-password',password\}\)/);
  assert.match(app, /S\.profile\.must_change_password=false;await loadData\(\)/);
  assert.match(app, /Salvar nova senha e continuar/);
  assert.match(app, /passwordGateLogout/);
});

test('the same password policy is visible and enforced in the client', () => {
  assert.match(app, /password\.length<10/);
  assert.match(app, /Letra maiúscula e minúscula/);
  assert.match(app, /Número e símbolo/);
  assert.match(app, /As senhas não coincidem/);
});
