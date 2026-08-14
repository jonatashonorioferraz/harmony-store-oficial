import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

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
  assert.match(index,/app\.js\?v=25\.80/);
  assert.match(index,/enhancements\.js\?v=25\.69/);
  assert.match(worker,/harmony-store-v25-83/);
  assert.match(worker,/enhancements\.js\?v=25\.69/);
  assert.equal(JSON.parse(pkg).version,'25.83.0');
});
