-- Rollback operacional da migration explicit_data_api_grants.
-- Restaura o acesso autenticado amplo anterior sem reabrir acesso anônimo.

begin;

grant usage on schema public to authenticated, service_role;
grant all privileges on all tables in schema public to authenticated, service_role;
grant usage, select, update on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;

-- Continua sendo uma função interna de trigger, nunca uma RPC do aplicativo.
revoke execute on function public.create_profile_for_new_auth_user() from authenticated;

notify pgrst, 'reload schema';

commit;
