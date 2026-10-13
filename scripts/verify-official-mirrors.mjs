import { access, readFile, readdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const web = resolve(root, 'web');
const mirrored = [];
const mismatches = [];
const textExtensions = new Set(['.css', '.html', '.js', '.mjs', '.md', '.svg', '.webmanifest']);

function contentsMatch(filename, rootContent, webContent) {
  if (!textExtensions.has(extname(filename))) return rootContent.equals(webContent);

  const normalizeLineEndings = (content) => content.toString('utf8').replaceAll('\r\n', '\n');
  return normalizeLineEndings(rootContent) === normalizeLineEndings(webContent);
}

for (const entry of await readdir(web, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const rootFile = resolve(root, entry.name);
  try {
    await access(rootFile);
  } catch {
    continue;
  }

  mirrored.push(entry.name);
  const [rootContent, webContent] = await Promise.all([
    readFile(rootFile),
    readFile(resolve(web, entry.name)),
  ]);
  if (!contentsMatch(entry.name, rootContent, webContent)) mismatches.push(entry.name);
}

async function compareDirectory(directory) {
  const [source, target] = await Promise.all([
    readdir(resolve(root, directory), { withFileTypes: true }),
    readdir(resolve(web, directory), { withFileTypes: true }),
  ]);
  if (source.map(e => e.name).sort().join('\n') !== target.map(e => e.name).sort().join('\n')) {
    mismatches.push(directory + ' (inventário)');
  }
  for (const entry of source) {
    const filename = directory + '/' + entry.name;
    if (entry.isDirectory()) { await compareDirectory(filename); continue; }
    const [a, b] = await Promise.all([readFile(resolve(root, filename)), readFile(resolve(web, filename))]);
    mirrored.push(filename);
    if (!contentsMatch(filename, a, b)) mismatches.push(filename);
  }
}
await compareDirectory('shipping-labels');

for (const filename of ['central-briefing.mjs', 'operational-central.js', 'operational-central.css', 'shipping-labels.js', 'shipping-labels.css']) {
  if (!mirrored.includes(filename)) throw new Error(`Espelho oficial ausente: ${filename}`);
}

if (mirrored.length < 40) {
  throw new Error(`Inventário incompleto: somente ${mirrored.length} arquivos espelhados foram encontrados.`);
}

if (mismatches.length) {
  throw new Error(`Cópias oficiais divergentes: ${mismatches.join(', ')}`);
}

console.log(`${mirrored.length} arquivos oficiais sincronizados entre a raiz e web/.`);
