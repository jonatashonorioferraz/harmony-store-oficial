// The previous REST importer regenerated identities and replayed business triggers.
// Keep its entry point fail-closed until a dedicated SQL restoration is reviewed.
import { inspectBackup, requireCurrentCoverage, recoveryPlan } from './backup-contract.mjs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export function validateRecoveryTarget(env = process.env) {
  const ref = String(env.RECOVERY_PROJECT_REF || '');
  const url = String(env.RECOVERY_SUPABASE_URL || '');
  if (!ref || !url) throw new Error('Configure um projeto dedicado de recuperação.');
  if (ref === 'tyzfznwvjzmudxtcbbaf' || url.includes('tyzfznwvjzmudxtcbbaf')) throw new Error('BLOQUEADO: restauração nunca pode usar o projeto de produção.');
  if (ref === 'jwluqaycxoeyraxsleri') throw new Error('O antigo destino não está confirmado como projeto dedicado de recuperação.');
  if (!/^[a-z0-9]{20}$/.test(ref) || url !== 'https://' + ref + '.supabase.co') throw new Error('URL e referência do destino não correspondem.');
  if (env.RECOVERY_CONFIRM !== 'RESTORE_ISOLATED_HARMONY') throw new Error('Confirmação explícita da restauração isolada ausente.');
  return ref;
}
async function main() {
  validateRecoveryTarget();
  if (process.argv.includes('--preflight-config')) {
    throw new Error('Restauração REST desativada: prepare e aprove o plano SQL no destino isolado antes de capturar dados para o ensaio.');
  }
  const dir = process.argv[2] || process.env.BACKUP_DIR;
  if (!dir) throw new Error('Informe a pasta descriptografada do backup.');
  const inspection = await inspectBackup(dir);
  requireCurrentCoverage(inspection);
  console.log(JSON.stringify({ ...recoveryPlan(inspection), restored: false, writes_performed: 0 }));
  throw new Error('Restauração bloqueada antes de qualquer gravação: siga o plano SQL isolado.');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
