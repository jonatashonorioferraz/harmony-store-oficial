import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {htmlAssets,workerAssets} from '../scripts/lib/release-assets.mjs';

const [enhancements,webEnhancements,index,webIndex,worker,pkg]=await Promise.all([
  readFile(new URL('../enhancements.js',import.meta.url),'utf8'),
  readFile(new URL('../web/enhancements.js',import.meta.url),'utf8'),
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  readFile(new URL('../web/index.html',import.meta.url),'utf8'),
  readFile(new URL('../service-worker.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8'),
]);

test('golden brand enhancement does not rewrite unchanged text nodes',()=>{
  assert.match(enhancements,/name&&name\.textContent!=='Harmony Store Oficial'/);
  assert.match(enhancements,/subtitle&&subtitle\.textContent!=='Gestão de produção'/);
});

test('interface observer cannot observe mutations produced by its own enhancement pass',()=>{
  assert.match(enhancements,/harmonyEnhancementObserver\.disconnect\(\)/);
  assert.match(enhancements,/try\{improveApp\(\)\}finally\{harmonyEnhancementObserver\.observe/);
  assert.doesNotMatch(enhancements,/new MutationObserver\(improveApp\)/);
});

test('fixed assets are mirrored and force a fresh PWA cache',()=>{
  assert.equal(webEnhancements,enhancements);
  assert.equal(webIndex,index);
  const appVersion=htmlAssets(index).get('app.js')?.version;
  assert.match(appVersion||'',/^\d+\.\d+\.\d+$/);
  assert.equal(workerAssets(worker).get('app.js')?.version,appVersion);
  assert.match(index,/enhancements\.js\?v=25\.69/);
  assert.match(worker,/\bconst\s+CACHE\s*=\s*['"]harmony-store-v\d+(?:-\d+)*-r\d+['"]/);
  assert.match(worker,/enhancements\.js\?v=25\.69/);
  assert.match(JSON.parse(pkg).version,/^\d+\.\d+\.\d+$/);
});
