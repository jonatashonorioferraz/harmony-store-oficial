import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('tablet breakpoint preserves navigation and usable content width',async()=>{
  const css=await read('styles.css');
  assert.match(css,/@media\(min-width:721px\) and \(max-width:1100px\)/);
  assert.match(css,/\.sidebar\{width:104px/);
  assert.match(css,/\.content\{margin-left:104px;width:calc\(100% - 104px\)\}/);
  assert.match(css,/\.table-wrap\{max-width:100%;overflow-x:auto/);
  assert.match(css,/\.modal-box\{max-width:calc\(100vw - 28px\)\}/);
});

test('install action is visible on tablets and handles modern iPad identification',async()=>{
  const [css,pwa,worker]=await Promise.all([read('styles.css'),read('pwa.js'),read('service-worker.js')]);
  assert.match(css,/@media\(max-width:1100px\),\(hover:none\) and \(pointer:coarse\)\{\.install-app\{display:flex\}\}/);
  assert.match(css,/@media\(display-mode:standalone\)\{\.install-app\{display:none!important\}\}/);
  assert.match(pwa,/navigator\.platform==='MacIntel'&&navigator\.maxTouchPoints>1/);
  assert.match(pwa,/Safari do iPhone ou iPad/);
  assert.match(pwa,/Chrome do celular ou tablet/);
  assert.match(pwa,/aria-label','Instalar Harmony Store neste aparelho'/);
  assert.match(worker,/harmony-store-v25-14/);
});

test('mobile admin menu scrolls without overlapping its many tabs',async()=>{
  const [css,enhancements]=await Promise.all([read('styles.css'),read('enhancements.js')]);
  assert.match(css,/overflow-x:auto;overflow-y:hidden;scroll-snap-type:x proximity/);
  assert.match(css,/flex:0 0 clamp\(66px,20vw,78px\)/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/\.sidebar nav::-webkit-scrollbar\{display:none\}/);
  assert.match(enhancements,/active\.scrollIntoView\(\{behavior:'smooth',block:'nearest',inline:'center'\}\)/);
});
