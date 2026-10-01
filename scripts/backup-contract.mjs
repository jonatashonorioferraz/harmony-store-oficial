import { createHash } from 'node:crypto';
import { readFile, realpath, readdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { TABLE_CATALOG, CAPTURE_TABLES, EXCLUDED_TABLES, CATALOG_VERSION, MIGRATIONS_SHA256, recoveryOrder } from './backup-catalog.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const integer = value => Number.isSafeInteger(value) && value >= 0;
function requireValue(value, message) { if (!value) throw new Error(message); }
export function relativePath(value) {
  requireValue(typeof value === 'string' && value.length > 0 && !value.includes('\\') &&
    !value.includes(':') && !value.startsWith('/') && value.split('/').every(part => part && part !== '.' && part !== '..'),
  'Caminho inseguro no manifesto.');
  return value;
}
export function storageBackupPath(bucket, name) {
  return 'storage/' + sha256(bucket) + '/' + sha256(name) + '.bin';
}
const legacySegment = value => String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
export function migrationDigest(files) {
  return sha256(files.map(file => file.name + '\0' + file.content.replace(/\r\n/g, '\n')).join('\n'));
}
export async function sourceMigrations() {
  const root = new URL('../supabase/migrations/', import.meta.url);
  return Promise.all((await readdir(root)).filter(name => name.endsWith('.sql')).sort().map(async name =>
    ({ name, content: await readFile(new URL(name, root), 'utf8') })));
}
export function assertCatalogMatchesMigrations(files) {
  requireValue(migrationDigest(files) === MIGRATIONS_SHA256, 'Migrations mudaram: revise metadados, permissões e catálogo antes do backup.');
  const names = new Set(files.flatMap(file => [...file.content.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_0-9]+)/gi)].map(match => match[1])));
  requireValue(names.size === TABLE_CATALOG.length && TABLE_CATALOG.every(table => names.has(table.name)), 'Cobertura do catálogo diverge das tabelas declaradas.');
}
export function coverageFor(manifest) {
  const found = new Set(manifest.tables.map(table => table.table));
  const expected = new Set(CAPTURE_TABLES.map(table => table.name));
  const missing = [...expected].filter(name => !found.has(name));
  const unexpected = [...found].filter(name => !expected.has(name));
  const policy = manifest.coverage;
  const contractMatches = manifest.format === 'harmony-api-backup-v2' &&
    policy?.catalog_version === CATALOG_VERSION &&
    policy?.migrations_sha256 === MIGRATIONS_SHA256 &&
    JSON.stringify(policy?.excluded_tables) === JSON.stringify(EXCLUDED_TABLES.map(table => ({ table: table.name, reason: table.retention })));
  return {
    catalog_tables: TABLE_CATALOG.length, expected_data_tables: expected.size, captured_tables: found.size,
    excluded_tables: EXCLUDED_TABLES.map(table => ({ table: table.name, reason: table.retention })),
    missing_tables: missing, unexpected_tables: unexpected,
    contract_matches_current: contractMatches,
    complete_for_current_catalog: contractMatches && !missing.length && !unexpected.length,
    legacy: manifest.format === 'harmony-api-backup-v1',
  };
}
export async function inspectBackup(directory) {
  const root = await realpath(resolve(directory));
  async function bytesAt(name) {
    relativePath(name);
    const file = await realpath(resolve(root, ...name.split('/')));
    requireValue(file.startsWith(root + sep), 'Arquivo fora da pasta do backup.');
    return readFile(file);
  }
  const manifest = JSON.parse((await bytesAt('manifest.json')).toString('utf8'));
  requireValue(['harmony-api-backup-v1', 'harmony-api-backup-v2'].includes(manifest.format), 'Formato de backup incompatível.');
  requireValue(Array.isArray(manifest.files) && manifest.files.length && Array.isArray(manifest.tables) &&
    manifest.tables.length && Array.isArray(manifest.migrations) && manifest.migrations.length &&
    Array.isArray(manifest.buckets) && integer(manifest.auth_users), 'Manifesto incompleto.');
  const listed = new Map();
  for (const expected of manifest.files) {
    relativePath(expected.path);
    requireValue(!listed.has(expected.path) && integer(expected.size) && /^[a-f0-9]{64}$/.test(expected.sha256), 'Entrada de arquivo inválida ou duplicada.');
    const data = await bytesAt(expected.path);
    requireValue(data.length === expected.size && sha256(data) === expected.sha256, 'Falha de integridade: ' + expected.path);
    listed.set(expected.path, data);
  }
  function jsonAt(name) {
    requireValue(listed.has(name), 'Arquivo ausente no inventário: ' + name);
    return JSON.parse(listed.get(name).toString('utf8'));
  }
  const tables = new Map();
  for (const item of manifest.tables) {
    requireValue(typeof item.table === 'string' && /^[a-z][a-z0-9_]*$/.test(item.table) &&
      !tables.has(item.table) && integer(item.rows), 'Tabela inválida ou duplicada no manifesto.');
    const rows = jsonAt('tables/' + item.table + '.json');
    requireValue(Array.isArray(rows) && rows.length === item.rows && rows.every(row => row && typeof row === 'object' && !Array.isArray(row)), 'Contagem ou conteúdo inválido: ' + item.table);
    const spec = TABLE_CATALOG.find(table => table.name === item.table);
    if (spec) {
      const ids = new Set();
      for (const row of rows) {
        requireValue(spec.primaryKey.every(key => row[key] !== undefined && row[key] !== null), 'Chave primária ausente: ' + item.table);
        const id = JSON.stringify(spec.primaryKey.map(key => row[key]));
        requireValue(!ids.has(id), 'Chave primária duplicada: ' + item.table);
        ids.add(id);
      }
    }
    tables.set(item.table, rows);
  }
  for (const name of listed.keys()) if (name.startsWith('tables/')) {
    requireValue(tables.has(name.slice(7, -5)) && name.endsWith('.json'), 'Tabela não declarada no manifesto.');
  }
  const users = jsonAt('auth-users.json');
  requireValue(Array.isArray(users) && users.length === manifest.auth_users, 'Contagem divergente de usuários Auth.');
  const userIds = new Set();
  for (const user of users) {
    requireValue(user && typeof user.id === 'string' && user.id.length && !userIds.has(user.id), 'Usuário Auth inválido ou duplicado.');
    userIds.add(user.id);
  }
  const bucketIds = new Set(), objectPaths = new Set();
  let objectCount = 0;
  for (const bucket of manifest.buckets) {
    requireValue(typeof bucket.id === 'string' && !bucketIds.has(bucket.id) && Array.isArray(bucket.files) &&
      integer(bucket.objects) && bucket.objects === bucket.files.length, 'Bucket inválido no manifesto.');
    bucketIds.add(bucket.id);
    const names = new Set();
    let byteCount = 0;
    for (const file of bucket.files) {
      requireValue(typeof file.name === 'string' && file.name.length && !names.has(file.name) && integer(file.size), 'Objeto inválido ou duplicado.');
      names.add(file.name);
      const path = manifest.format === 'harmony-api-backup-v2' ? file.backup_path :
        ['storage', legacySegment(bucket.id), ...file.name.split('/').map(legacySegment)].join('/');
      relativePath(path);
      if (manifest.format === 'harmony-api-backup-v2') {
        requireValue(path === storageBackupPath(bucket.id, file.name), 'Mapeamento de objeto Storage inválido.');
      }
      requireValue(!objectPaths.has(path), 'Colisão entre caminhos de objetos Storage.');
      objectPaths.add(path);
      requireValue(listed.has(path) && listed.get(path).length === file.size, 'Objeto Storage ausente ou inválido.');
      byteCount += file.size; objectCount++;
    }
    requireValue(integer(bucket.bytes) && byteCount === bucket.bytes, 'Contagem de bytes Storage divergente.');
  }
  const migrationNames = new Set(manifest.migrations);
  requireValue(migrationNames.size === manifest.migrations.length && manifest.migrations.every(name =>
    typeof name === 'string' && /^[0-9]+_[a-zA-Z0-9_-]+\.sql$/.test(name)), 'Inventário de migrations inválido.');
  if (manifest.format === 'harmony-api-backup-v2') {
    const files = manifest.migrations.map(name => {
      const path = 'migrations/' + name;
      requireValue(listed.has(path), 'Fonte de migration ausente: ' + name);
      return { name, content: listed.get(path).toString('utf8') };
    });
    requireValue(migrationDigest(files) === manifest.coverage?.migrations_sha256, 'Fontes SQL divergem do contrato do pacote.');
  }
  const coverage = coverageFor(manifest);
  const references = { checked_relations: 0, checked_rows: 0, skipped_relations: 0 };
  // Historical schemas are readable, but cannot claim the current FK contract.
  if (coverage.contract_matches_current) {
    for (const table of CAPTURE_TABLES) {
      if (!tables.has(table.name)) continue;
      for (const fk of table.foreignKeys) {
        const parent = fk.schema === 'auth' && fk.table === 'users' ? users :
          fk.schema === 'public' ? tables.get(fk.table) : undefined;
        if (!parent) { references.skipped_relations++; continue; }
        const keys = new Set(parent.map(row => JSON.stringify(fk.targetColumns.map(column => row[column]))));
        let missing = 0;
        for (const row of tables.get(table.name)) {
          requireValue(fk.columns.every(column => Object.hasOwn(row, column)), 'Coluna de FK ausente: ' + table.name);
          const values = fk.columns.map(column => row[column]);
          if (values.some(value => value === null)) continue;
          references.checked_rows++;
          if (!keys.has(JSON.stringify(values))) missing++;
        }
        requireValue(!missing, 'Referências órfãs na captura: ' + table.name + ' -> ' + fk.schema + '.' + fk.table + ' (' + missing + ').');
        references.checked_relations++;
      }
    }
  } else references.skipped_relations = CAPTURE_TABLES.reduce((sum, table) => sum + table.foreignKeys.length, 0);
  return {
    manifest, tables, users,
    report: {
      integrity_valid: true, format: manifest.format, generated_at: manifest.generated_at,
      coverage, files: listed.size, rows: manifest.tables.reduce((sum, table) => sum + table.rows, 0),
      auth_users: users.length, objects: objectCount,
      capture_window: manifest.capture_window || null, references,
      consistency: manifest.consistency || { mode: 'legacy-unspecified', transactionally_consistent: false },
      recovery_ready: false,
    },
  };
}
export function requireCurrentCoverage(inspection) {
  requireValue(inspection.report.coverage.complete_for_current_catalog,
    'Cobertura incompleta ou histórica: restauração bloqueada antes de qualquer gravação. Tabelas ausentes: ' +
    inspection.report.coverage.missing_tables.join(', '));
}
export function recoveryPlan(inspection) {
  const order = recoveryOrder();
  return {
    mode: 'read-only-plan', recovery_ready: false,
    coverage_complete: inspection.report.coverage.complete_for_current_catalog,
    restore_order: order.map(table => table.name),
    preserve_identity_columns: order.filter(table => table.generated.some(column => column.identity))
      .map(table => ({ table: table.name, columns: table.generated.filter(column => column.identity).map(column => column.column) })),
    blockers: [
      { code: 'ISOLATED_SQL_REQUIRED', reason: 'A Data API não preserva com segurança identidades, sequências, seeds e efeitos de triggers nesta base.' },
      { code: 'SERVICE_INSERT_NOT_GRANTED', tables: CAPTURE_TABLES.filter(table => !table.serviceInsert).map(table => table.name) },
      { code: 'TRIGGER_REPLAY_REQUIRES_REVIEW', tables: CAPTURE_TABLES.filter(table => table.triggers.length).map(table => table.name) },
      { code: 'TARGET_SCHEMA_AND_SEEDS_NOT_VERIFIED', reason: 'Exige destino dedicado, schema correspondente e tratamento de seeds em transação SQL revisada.' },
      { code: 'AUTH_STORAGE_RECONCILIATION_REQUIRED', reason: 'Preservar/remapear IDs Auth e referências inclusive Storage, definir novas credenciais e reconciliar arquivos.' },
      { code: 'NON_TRANSACTIONAL_EXPORT', reason: 'Exportação REST contém leituras sequenciais. Comparar invariantes/FKs antes de promover um destino.' },
      { code: 'SEQUENCE_STATE_NOT_CAPTURED', reason: 'A API não exporta estado de sequências; preservar também production_inventory_box_number_seq e números já emitidos, inclusive linhas removidas.' },
    ],
    recovery_procedure: 'docs/operations/ENSAIO-RECUPERACAO-ISOLADA.md',
  };
}

