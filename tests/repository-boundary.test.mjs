import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const packageLock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
const eslintConfig = await readFile(new URL('eslint.config.mjs', root), 'utf8');

const forbiddenStudioPaths = [
  'app/api/studio',
  'app/api/agents',
  'db/studio-schema.ts',
  'drizzle.studio.config.ts',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'src/harmony-studio',
];

async function exists(relativePath) {
  try {
    await access(new URL(relativePath, root));
    return true;
  } catch {
    return false;
  }
}

test('Harmony Studio remains outside the management application repository', async () => {
  const present = [];
  for (const relativePath of forbiddenStudioPaths) {
    if (await exists(relativePath)) present.push(relativePath);
  }

  assert.deepEqual(
    present,
    [],
    `Studio-only paths must stay in its independent repository: ${present.join(', ')}`,
  );
});

test('package metadata and lockfile identify the same official release', () => {
  assert.equal(packageLock.name, packageJson.name);
  assert.equal(packageLock.version, packageJson.version);
  assert.equal(packageLock.packages[''].name, packageJson.name);
  assert.equal(packageLock.packages[''].version, packageJson.version);
});

test('transitive nanoid dependency includes the denial-of-service security fix', () => {
  const nanoid = packageLock.packages['node_modules/nanoid'];
  assert.ok(nanoid, 'nanoid must remain represented in the reproducible lockfile');
  assert.equal(nanoid.version, '3.3.17');
  assert.match(nanoid.resolved, /nanoid-3\.3\.17\.tgz$/);
});

test('official build remains the static management PWA', () => {
  assert.equal(packageJson.scripts.build, 'node scripts/build-static.mjs');
  assert.equal(packageJson.scripts.dev, 'node scripts/serve-static.mjs');
  assert.equal(packageJson.scripts.start, 'node scripts/serve-static.mjs');
  assert.doesNotMatch(JSON.stringify(packageJson.scripts), /studio/i);
});

test('lint ignores generated, private and temporary work directories', () => {
  for (const directory of ['dist/**', 'outputs/**', 'tmp/**', 'work/**', 'backups/**']) {
    assert.match(eslintConfig, new RegExp(`"${directory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  }
});
