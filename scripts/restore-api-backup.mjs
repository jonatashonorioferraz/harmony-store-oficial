import { inspectBackup, requireCurrentCoverage, recoveryPlan } from './backup-contract.mjs';
const args = process.argv.slice(2);
const dir = args.find(arg => !arg.startsWith('--')) || process.env.BACKUP_DIR;
if (!dir) throw new Error('Informe a pasta descriptografada do backup.');
const inspection = await inspectBackup(dir);
if (args.includes('--require-current')) requireCurrentCoverage(inspection);
console.log(JSON.stringify({ ...inspection.report, ...recoveryPlan(inspection) }));
