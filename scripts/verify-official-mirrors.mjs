import { access, readFile, readdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const web = resolve(root, 'web');
const mirrored = [];
const mismatches = [];
const textExtensions = new Set(['.css', '.html', '.js', '.md', '.svg', '.webmanifest']);

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

if (mirrored.length < 40) {
  throw new Error(`Inventário incompleto: somente ${mirrored.length} arquivos espelhados foram encontrados.`);
}

if (mismatches.length) {
  throw new Error(`Cópias oficiais divergentes: ${mismatches.join(', ')}`);
}

console.log(`${mirrored.length} arquivos oficiais sincronizados entre a raiz e web/.`);
