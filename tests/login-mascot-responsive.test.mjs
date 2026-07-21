import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const [enhancements,css,worker]=await Promise.all([
  readFile(new URL('../enhancements.js',import.meta.url),'utf8'),
  readFile(new URL('../styles.css',import.meta.url),'utf8'),
  readFile(new URL('../service-worker.js',import.meta.url),'utf8'),
]);

test('desktop and tablet never render the mobile mascot inside the login card',()=>{
  assert.match(enhancements,/const mobile=matchMedia\('\(max-width:720px\)'\)\.matches/);
  assert.match(enhancements,/if\(!mobile\)\{box\?\.querySelector\('\.login-mascot-mobile'\)\?\.remove\(\);return\}/);
  assert.match(css,/@media\(min-width:721px\)\{\.login-box>\.login-mascot-mobile,\.login-box>\.brand-message-mobile\{display:none!important\}\}/);
  assert.doesNotMatch(css,/\.login-box>img\{display:block/);
});

test('mobile composition remains available and reacts to viewport changes',()=>{
  assert.match(enhancements,/if\(box&&!box\.querySelector\('\.login-mascot-mobile'\)\)/);
  assert.match(enhancements,/addEventListener\('change',\(\)=>\{enhanceLoginMessage\(\);enhanceLoginMascot\(\)\}\)/);
  assert.match(css,/@media\(max-width:720px\)[\s\S]*\.login-mascot-mobile\{/);
  assert.match(worker,/harmony-store-v25-19/);
});
