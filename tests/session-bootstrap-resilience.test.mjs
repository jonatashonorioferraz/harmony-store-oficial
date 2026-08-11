import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

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

test('startup always falls back to a usable login after an unexpected restore failure',()=>{
  assert.match(app,/restore\(\)\.then\(ok=>ok\?renderApp\(\):renderLogin\(\)\)\.catch\(\(\)=>\{clearLocalSession\(\);renderLogin\(\)\}\)/);
});

test('login gives immediate feedback and always restores its button after failure',()=>{
  assert.match(app,/e\.submitter\|\|e\.currentTarget\.querySelector\('button\.primary'\)/);
  assert.match(app,/b\.setAttribute\('aria-busy','true'\);b\.textContent='Entrando…'/);
  assert.match(app,/b\.disabled=false;b\.removeAttribute\('aria-busy'\);b\.textContent='Entrar no sistema'/);
});

test('official mirrors and PWA assets publish the recovery patch together',()=>{
  assert.equal(webApp,app);
  assert.equal(webIndex,index);
  assert.match(index,/app\.js\?v=25\.70/);
  assert.match(worker,/harmony-store-v25-72/);
  assert.match(worker,/app\.js\?v=25\.70/);
  assert.equal(JSON.parse(pkg).version,'25.72.0');
});
