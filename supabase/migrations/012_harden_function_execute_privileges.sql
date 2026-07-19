-- Harmony Store Oficial — fecha a execução anônima de funções privilegiadas.
-- Mantém as funções de negócio disponíveis somente para usuários autenticados.

begin;

do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format(
      'revoke execute on function %s from public, anon',
      v_function
    );
  end loop;

  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prorettype <> 'pg_catalog.trigger'::regtype
  loop
    execute format(
      'grant execute on function %s to authenticated',
      v_function
    );
  end loop;
end;
$$;

-- Esta função é usada somente pelo trigger interno de criação de usuários.
revoke execute on function public.create_profile_for_new_auth_user() from authenticated;

notify pgrst, 'reload schema';

commit;
