import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inspectBackup, requireCurrentCoverage } from './backup-contract.mjs';

const API = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SECRET = String(process.env.SUPABASE_SECRET_KEY || '');
const dir = resolve(process.env.BACKUP_DIR || 'backups/current');
if (!API || !SECRET) throw new Error('Configuração de backup ausente.');
const inspection = await inspectBackup(dir);
requireCurrentCoverage(inspection);
const { manifest, report } = inspection;
const hash = String(await readFile('harmony-backup.tar.gz.enc.sha256', 'utf8')).trim().split(/\s+/)[0];
const encrypted = await stat('harmony-backup.tar.gz.enc');
const body = {
  p_status: 'success', p_artifact_sha256: hash, p_byte_size: encrypted.size,
  p_stats: { tables: manifest.tables.length, rows: report.rows, auth_users: report.auth_users, objects: report.objects, files: report.files,
    integrity_valid: report.integrity_valid, coverage: report.coverage, consistency: report.consistency,
    capture_window: report.capture_window, format: report.format, recovery_ready: false, recovery_verified: false },
  p_started_at: manifest.capture_window?.started_at || manifest.generated_at,
};
const response = await fetch(`${API}/rest/v1/rpc/service_record_backup_result`, { method: 'POST', headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
if (!response.ok) throw new Error(`Falha ao registrar backup: HTTP ${response.status}`);
console.log(JSON.stringify({ recorded: true, sha256: hash.slice(0, 12), bytes: encrypted.size }));

