import assert from 'node:assert/strict';
import test from 'node:test';
import { htmlAssets, releaseIssues } from '../scripts/lib/release-assets.mjs';

function snapshot({ app = '25.100.1', bills = '25.101.1', report = '7', cache = '3', extra = '' } = {}) {
  return {
    html: '<script src="app.js?v=' + app + '"></script><script src="bills.js?v=' + bills +
      '"></script><link href="weekly-report.css?v=' + report + '" rel="stylesheet">' + extra,
    worker: "const CACHE='harmony-store-v25-101-r" + cache + "';\nconst SHELL=['./app.js?v=" +
      app + "','./bills.js?v=" + bills + "'];",
  };
}

test('an unchanged release remains valid', () => {
  assert.deepEqual(releaseIssues(snapshot(), snapshot()), []);
});

test('older local app, bill and report versions are rejected even when mirrors agree', () => {
  const issues = releaseIssues(snapshot(), snapshot({ app: '25.100', bills: '25.101', report: '6' }));
  for (const file of ['app.js', 'bills.js', 'weekly-report.css']) assert.ok(issues.some(value => value.includes(file)));
});

test('numeric versions and cache revisions can advance from 9 to 10', () => {
  assert.deepEqual(releaseIssues(snapshot({ report: '9', cache: '9' }), snapshot({ report: '10', cache: '10' })), []);
});

test('new modules do not require changing unrelated release expectations', () => {
  const extra = '<script defer src="label-lots.js?v=1"></script>';
  assert.deepEqual(releaseIssues(snapshot(), snapshot({ extra })), []);
});

test('an older cache namespace is rejected', () => {
  assert.ok(releaseIssues(snapshot(), snapshot({ cache: '2' })).some(value => value.includes('cache principal')));
});

test('the document and service worker must agree on shared resources', () => {
  const candidate = snapshot();
  candidate.worker = candidate.worker.replace('bills.js?v=25.101.1', 'bills.js?v=25.102');
  assert.ok(releaseIssues(snapshot(), candidate).some(value => value.includes('versoes diferentes')));
});

test('removing version metadata cannot bypass the regression guard', () => {
  const candidate = snapshot();
  candidate.html = candidate.html.replace('app.js?v=25.100.1', 'app.js');
  assert.ok(releaseIssues(snapshot(), candidate).some(value => value.includes('perdeu a versao')));
});

test('external assets are ignored and query parameters can be reordered', () => {
  const assets = htmlAssets('<script src="https://cdn.example.com/app.js?v=1"></script><script src="./app.js?mode=pwa&v=25.100.1"></script>');
  assert.equal(assets.size, 1);
  assert.equal(assets.get('app.js').version, '25.100.1');
});

test('a missing main cache fails with an actionable error', () => {
  const candidate = snapshot();
  candidate.worker = candidate.worker.replace('const CACHE=', 'const OTHER=');
  assert.ok(releaseIssues(snapshot(), candidate).some(value => value.includes('identificar a versao do cache')));
});


test('versioned ESM module preload participates in asset release and cache synchronization', () => {
  const candidate=snapshot({extra:'<link rel="modulepreload" href="central-briefing.mjs?v=1.2.0">'});
  candidate.worker+="\nSHELL.push('./central-briefing.mjs?v=1.2.0');";
  assert.equal(htmlAssets(candidate.html).get('central-briefing.mjs').version,'1.2.0');assert.deepEqual(releaseIssues(snapshot(),candidate),[]);
  candidate.worker=candidate.worker.replace('central-briefing.mjs?v=1.2.0','central-briefing.mjs?v=1.1.0');
  assert.ok(releaseIssues(snapshot(),candidate).some(value=>value.includes('central-briefing.mjs')&&value.includes('versoes diferentes')));
});
