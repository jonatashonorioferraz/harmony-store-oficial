import test from 'node:test';
import assert from 'node:assert/strict';
import { agendaHealthItem } from '../supabase/functions/system-health/agenda-status.mjs';

const now=Date.parse('2026-10-01T21:17:00Z');
const event=(minutes,level='info',code='agenda_reminder_sent')=>({level,code,created_at:new Date(now-minutes*60000).toISOString()});
test('Agenda reports stale success or idle as late, never operational',()=>{
  for(const code of ['agenda_reminder_sent','agenda_reminder_idle']){
    const stale=agendaHealthItem({event:event(251,'info',code),now});
    assert.equal(stale.status,'red');assert.equal(stale.value,'Execução atrasada');
    assert.doesNotMatch(stale.detail,/está em dia|foram processados/);
    assert.equal(agendaHealthItem({event:event(31,'info',code),now}).status,'yellow');
    assert.equal(agendaHealthItem({event:event(15,'info',code),now}).status,'green');
  }
});
test('Agenda keeps query failures, delivery failures and missing or invalid evidence visible',()=>{
  assert.equal(agendaHealthItem({queryError:true,now}).value,'Sem resposta');
  assert.equal(agendaHealthItem({now}).status,'yellow');
  assert.equal(agendaHealthItem({event:event(1,'error','agenda_reminder_failed'),now}).status,'red');
  assert.equal(agendaHealthItem({event:event(1,'warning','agenda_reminder_partial'),now}).value,'Envio parcial');
  for(const created_at of ['invalid','2026-10-02T00:00:00Z'])assert.equal(agendaHealthItem({event:{...event(1),created_at},now}).value,'Horário não confirmado');
  assert.equal(agendaHealthItem({event:event(1,'info','new_unknown_code'),now}).status,'yellow');
});
