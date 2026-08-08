import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const web = resolve(root, 'web');
const mirrored = [];
const mismatches = [];

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
  if (!rootContent.equals(webContent)) mismatches.push(entry.name);
}

if (mirrored.length < 40) {
  throw new Error(`Inventário incompleto: somente ${mirrored.length} arquivos espelhados foram encontrados.`);
}

if (mismatches.length) {
  throw new Error(`Cópias oficiais divergentes: ${mismatches.join(', ')}`);
}

console.log(`${mirrored.length} arquivos oficiais sincronizados entre a raiz e web/.`);
