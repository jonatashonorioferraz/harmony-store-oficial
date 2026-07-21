-- Permissões mínimas para o backup externo criptografado.
-- A chave de backup recebe somente leitura; usuários do aplicativo não ganham novos acessos.

begin;

grant select on table
  public.improvement_ideas,
  public.improvement_idea_events,
  public.app_notifications,
  public.app_notification_recipients,
  public.internal_supply_requests,
  public.internal_supply_request_items,
  public.internal_purchase_receipts,
  public.internal_purchase_receipt_items
to service_role;

commit;
