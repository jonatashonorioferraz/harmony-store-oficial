-- Harmony Store Oficial — índice da auditoria de configuração de pagamentos.
-- Acesso continua exclusivamente pelas RPCs autenticadas.

begin;

create index if not exists production_payment_schedules_configured_by_idx
  on public.production_payment_schedules(configured_by);

commit;
