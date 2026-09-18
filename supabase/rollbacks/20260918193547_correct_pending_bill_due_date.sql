-- Plano de recuperação: publicar primeiro a interface anterior, sem o botão
-- Corrigir vencimento para pendentes. Executar somente se necessário/autorizado.
-- Corresponde à migração de produção 20260918193547.
-- Datas já corrigidas e auditoria devem ser preservadas, nunca revertidas em lote.
begin;
drop function if exists public.admin_correct_pending_bill_due_date(uuid, date);
notify pgrst, 'reload schema';
commit;
