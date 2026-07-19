import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dir = resolve(process.argv[2] || process.env.BACKUP_DIR || '');
if (!process.argv[2] && !process.env.BACKUP_DIR) throw new Error('Informe a pasta descriptografada do backup.');
const manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8'));
if (manifest.format !== 'harmony-api-backup-v1') throw new Error('Formato de backup incompatível.');
for (const expected of manifest.files) {
  const bytes = await readFile(resolve(dir, expected.path));
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== expected.size || hash !== expected.sha256) throw new Error(`Falha de integridade: ${expected.path}`);
}
const tableFiles = new Set(manifest.files.filter(file => file.path.startsWith('tables/')).map(file => file.path));
for (const table of manifest.tables) {
  if (!tableFiles.has(`tables/${table.table}.json`)) throw new Error(`Tabela ausente: ${table.table}`);
}
if (!tableFiles.size || !manifest.migrations?.length) throw new Error('Backup incompleto.');

// A restauração é propositalmente somente leitura. Aplicar um backup sobre a
// produção exige um projeto Supabase vazio, revisão humana e o runbook oficial.
// Isso impede que um comando acidental substitua dados válidos.
console.log(JSON.stringify({
  recovery_ready: true,
  mode: 'dry-run',
  generated_at: manifest.generated_at,
  project_host: manifest.project_host,
  tables: manifest.tables.length,
  rows: manifest.tables.reduce((sum, item) => sum + item.rows, 0),
  auth_users: manifest.auth_users,
  objects: manifest.buckets.reduce((sum, item) => sum + item.objects, 0),
  next_step: 'Siga docs/operations/RUNBOOK-BACKUP-RECUPERACAO.md em um projeto de recuperação isolado.',
}));
