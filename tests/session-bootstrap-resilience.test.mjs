import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {htmlAssets,workerAssets} from '../scripts/lib/release-assets.mjs';

const [app,webApp,index,webIndex,worker,pkg]=await Promise.all([
  readFile(new URL('../app.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app.js',import.meta.url),'utf8'),
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  readFile(new URL('../web/index.html',import.meta.url),'utf8'),
  readFile(new URL('../service-worker.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8'),
]);

test('core requests abort instead of leaving login and startup pending forever',()=>{
  assert.match(app,/const API_REQUEST_TIMEOUT_MS=15000/);
  assert.match(app,/new AbortController\(\)/);
  assert.match(app,/controller\.abort\(\)/);
  assert.match(app,/error\?\.name==='AbortError'/);
  assert.match(app,/A conexão demorou mais que o esperado\. Tente novamente\./);
  assert.equal((app.match(/\bfetch\(/g)||[]).length,1,'all core requests must pass through apiFetch');
});

test('startup ignores obsolete restores and delegates other failures to the guarded login',()=>{
  assert.match(app,/restore\(\)\.then\(ok=>ok\?renderApp\(\):renderLogin\(\)\)\.catch\(error=>\{if\(error\?\.code==='SESSION_CHANGED'\)return;clearLocalSession\(\);renderLogin\(\)\}\)/);
});

test('login gives immediate feedback and always restores its button after failure',()=>{
  assert.match(app,/e\.submitter\|\|e\.currentTarget\.querySelector\('button\.primary'\)/);
  assert.match(app,/b\.setAttribute\('aria-busy','true'\);b\.textContent='Entrando…'/);
  assert.match(app,/b\.disabled=false;b\.removeAttribute\('aria-busy'\);b\.textContent='Entrar no sistema'/);
});

test('official mirrors and PWA assets publish the recovery patch together',()=>{
  assert.equal(webApp,app);
  assert.equal(webIndex,index);
  const appVersion=htmlAssets(index).get('app.js')?.version;
  assert.match(appVersion||'',/^\d+\.\d+\.\d+$/);
  assert.equal(workerAssets(worker).get('app.js')?.version,appVersion);
  assert.match(worker,/\bconst\s+CACHE\s*=\s*['"]harmony-store-v\d+(?:-\d+)*-r\d+['"]/);
  assert.match(JSON.parse(pkg).version,/^\d+\.\d+\.\d+$/);
});
