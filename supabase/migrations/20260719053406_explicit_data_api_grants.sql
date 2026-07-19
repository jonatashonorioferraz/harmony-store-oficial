-- Harmony Store Oficial — privilégios explícitos e reproduzíveis da Data API.
-- RLS continua sendo a autorização por linha; GRANT define quais objetos cada
-- papel consegue alcançar antes de as políticas serem avaliadas.

begin;

-- Fecha a exposição automática dos objetos atuais do schema público.
revoke usage on schema public from anon;
revoke all privileges on all tables in schema public from public, anon, authenticated;
revoke all privileges on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Evita que migrations futuras criadas pelo papel postgres exponham objetos
-- automaticamente. Cada nova migration deverá declarar seus GRANTs.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

grant usage on schema public to authenticated, service_role;

-- Leitura de conta e catálogo para todos os usuários autenticados.
grant select on table public.profiles to authenticated;
grant select on table public.categories to authenticated;
grant select on table public.products to authenticated;
grant select on table public.custom_field_definitions to authenticated;
grant select on table public.custom_field_values to authenticated;
grant select on table public.requests to authenticated;
grant select on table public.request_items to authenticated;

-- Escritas usadas diretamente pelo app. As políticas RLS limitam essas ações
-- aos perfis e registros corretos.
grant insert on table public.requests to authenticated;
grant insert on table public.request_items to authenticated;
grant select, insert on table public.audit_logs to authenticated;

-- Gestão administrativa executada diretamente pela interface.
grant insert, update, delete on table public.categories to authenticated;
grant insert, update, delete on table public.products to authenticated;
grant insert, update, delete on table public.custom_field_definitions to authenticated;
grant insert, update, delete on table public.custom_field_values to authenticated;
grant select, insert on table public.stock_movements to authenticated;
grant select, insert, update, delete on table public.finished_product_models to authenticated;
grant select, insert, update, delete on table public.suppliers to authenticated;
grant select, insert, update, delete on table public.supplier_products to authenticated;
grant select on table public.purchase_orders to authenticated;
grant select on table public.purchase_order_items to authenticated;

-- Sequências necessárias somente para inserts diretos preservados por
-- compatibilidade. As demais são usadas dentro de RPCs SECURITY DEFINER.
grant usage, select on sequence public.requests_protocol_seq to authenticated;
grant usage, select on sequence public.audit_logs_id_seq to authenticated;

-- RPCs que compõem a API autenticada do aplicativo. Cada função valida
-- internamente ADM, recebimento ou propriedade do registro.
grant execute on function public.admin_cancel_purchase_order(uuid) to authenticated;
grant execute on function public.admin_cancel_request(uuid,text) to authenticated;
grant execute on function public.admin_close_production_week(uuid,date) to authenticated;
grant execute on function public.admin_complete_request(uuid,text,text) to authenticated;
grant execute on function public.admin_create_purchase_order(uuid,timestamp with time zone,text,jsonb) to authenticated;
grant execute on function public.admin_delete_request(uuid) to authenticated;
grant execute on function public.admin_mark_production_week_paid(uuid,text) to authenticated;
grant execute on function public.admin_mark_purchase_order_ordered(uuid) to authenticated;
grant execute on function public.admin_prepare_request(uuid,jsonb,text) to authenticated;
grant execute on function public.admin_production_statement(uuid) to authenticated;
grant execute on function public.admin_receive_purchase_order(uuid) to authenticated;
grant execute on function public.admin_reopen_production_week(uuid) to authenticated;
grant execute on function public.admin_schedule_request(uuid,text,timestamp with time zone) to authenticated;
grant execute on function public.cancel_own_pending_request(uuid) to authenticated;
grant execute on function public.create_finished_production_collection(uuid,date,text,text,jsonb) to authenticated;
grant execute on function public.create_finished_production_receipt(uuid,uuid,text,bigint,date,text) to authenticated;
grant execute on function public.create_own_request(text,jsonb) to authenticated;
grant execute on function public.delete_finished_production_collection(uuid) to authenticated;
grant execute on function public.delete_finished_production_receipt(uuid) to authenticated;
grant execute on function public.list_finished_product_models() to authenticated;
grant execute on function public.list_finished_production_receipts(date,date,uuid) to authenticated;
grant execute on function public.list_production_weekly_closings(date,date,uuid) to authenticated;
grant execute on function public.list_production_workers() to authenticated;
grant execute on function public.remove_own_push_subscription(text) to authenticated;
grant execute on function public.save_own_push_subscription(text,text,text,text) to authenticated;
grant execute on function public.update_finished_production_collection(uuid,uuid,date,text,text,jsonb) to authenticated;
grant execute on function public.update_finished_production_receipt(uuid,uuid,uuid,text,bigint,date,text) to authenticated;
grant execute on function public.update_own_avatar(text) to authenticated;
grant execute on function public.update_own_pending_request(uuid,text,jsonb) to authenticated;
grant execute on function public.update_own_profile(text,text,text) to authenticated;

-- Helpers privados usados pelas políticas RLS.
revoke all privileges on function private.is_admin() from public, anon;
revoke all privileges on function private.is_primary_admin() from public, anon;
revoke all privileges on function private.is_production_receiver() from public, anon;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_primary_admin() to authenticated;
grant execute on function private.is_production_receiver() to authenticated;

-- O backend confiável permanece capaz de administrar todos os objetos atuais.
grant all privileges on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

notify pgrst, 'reload schema';

commit;

