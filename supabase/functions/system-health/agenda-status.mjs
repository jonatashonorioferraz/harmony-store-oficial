/** Diagnose execution freshness independently of the last delivery outcome. */
export function agendaHealthItem({ event = null, queryError = null, now = Date.now() } = {}) {
  const item = { key: 'agenda_automation', label: 'Automação da Agenda', checked_at: event?.created_at || null };
  const result = (status, value, detail) => ({ ...item, status, value, detail });
  if (queryError) return result('red', 'Sem resposta', 'O histórico da automação não respondeu ao diagnóstico.');
  if (!event) return result('yellow', 'Aguardando verificação', 'A rotina ainda não registrou sua primeira execução monitorada.');
  const time = Date.parse(event.created_at);
  const age = Number(now) - time;
  if (!Number.isFinite(time) || !Number.isFinite(age) || age < -60000) {
    return result('yellow', 'Horário não confirmado', 'O horário da última execução não pôde ser validado.');
  }
  if (event.level === 'error') return result('red', 'Falha detectada', age > 3600000 ? 'A última execução falhou e não há verificação recente. Confira a automação da Agenda.' : 'A rotina encontrou uma falha e exige verificação administrativa.');
  if (age > 3600000) return result('red', 'Execução atrasada', 'Não há execução registrada há mais de uma hora. O último resultado não confirma que os lembretes atuais foram verificados.');
  if (age > 1800000) return result('yellow', 'Verificação atrasada', 'Não há execução registrada nos últimos 30 minutos. Confira o agendamento da automação.');
  if (event.level === 'warning') return result('yellow', 'Envio parcial', 'Há aparelhos ou entregas que precisam de acompanhamento.');
  if (event.level !== 'info' || !['agenda_reminder_idle', 'agenda_reminder_sent'].includes(event.code)) {
    return result('yellow', 'Resultado não confirmado', 'A execução foi registrada, mas seu resultado exige conferência.');
  }
  return result('green', 'Execução recente', event.code === 'agenda_reminder_idle' ? 'Não havia lembretes elegíveis ou administradores ativos na última verificação.' : 'A rotina de lembretes foi executada recentemente. A execução não comprova a leitura das notificações.');
}
