export function backupHealthItem({ backup, attempt, queryError, now = Date.now() }) {
  const item = { key: 'backup', label: 'Backup externo', checked_at: attempt?.completed_at || backup?.completed_at || null };
  if (queryError) return { ...item, status: 'red', value: 'Sem resposta', detail: 'O histórico de backups não respondeu ao diagnóstico.' };
  if (!backup) return { ...item, status: 'red', value: 'Aguardando primeiro backup', detail: 'A rotina de backup ainda não registrou uma cópia válida.' };
  const age = (now - Date.parse(backup.completed_at)) / 3600000;
  if (!Number.isFinite(age) || age < -5 / 60) return { ...item, status: 'red', value: 'Data não verificável', detail: 'Não foi possível confirmar a idade da última cópia.' };
  const elapsed = age < 1 ? 'há menos de 1 hora' : 'há ' + Math.floor(age) + (Math.floor(age) === 1 ? ' hora' : ' horas');
  const covered = backup.stats?.coverage?.complete_for_current_catalog === true;
  const restored = backup.stats?.recovery_ready === true && backup.stats?.recovery_verified === true;
  const recovery = !covered ? 'A cobertura das tabelas precisa ser verificada; recuperação fiel ainda não comprovada.' :
    !restored ? 'Cobertura do catálogo registrada. A restauração fiel em ambiente isolado ainda não foi comprovada.' :
      'Cobertura do catálogo e ensaio de recuperação registrados para esta cópia.';
  if (age > 48) return { ...item, status: 'red', value: 'Cópia desatualizada', detail: 'A última cópia foi concluída ' + elapsed + '. ' + recovery };
  if (attempt?.status === 'failed') return { ...item, status: 'yellow', value: 'Falha na última tentativa', detail: 'A última cópia válida foi concluída ' + elapsed + '. ' + recovery };
  return { ...item, status: age > 30 || !covered || !restored ? 'yellow' : 'green', value: 'Concluído ' + elapsed, detail: recovery };
}
