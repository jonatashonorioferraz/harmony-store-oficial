import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dir = resolve(process.argv[2] || process.env.BACKUP_DIR || '');
if (!process.argv[2] && !process.env.BACKUP_DIR) throw new Error('Informe a pasta do backup.');
const manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8'));
if (manifest.format !== 'harmony-api-backup-v1') throw new Error('Formato de backup incompatível.');
for (const expected of manifest.files) {
  const data = await readFile(resolve(dir, expected.path));
  const hash = createHash('sha256').update(data).digest('hex');
  if (data.length !== expected.size || hash !== expected.sha256) throw new Error(`Falha de integridade: ${expected.path}`);
}
if (!manifest.tables?.length || !manifest.migrations?.length) throw new Error('Manifesto incompleto.');
console.log(JSON.stringify({ valid: true, generated_at: manifest.generated_at, files: manifest.files.length, tables: manifest.tables.length, rows: manifest.tables.reduce((sum, item) => sum + item.rows, 0), objects: manifest.buckets.reduce((sum, item) => sum + item.objects, 0) }));

