-- Harmony Store Oficial — índices de integridade da Inteligência Shopee.
-- Complemento aditivo após validação automática do Supabase.

begin;

create index if not exists shopee_import_batches_imported_by_idx
  on public.shopee_import_batches(imported_by);
create index if not exists shopee_ai_settings_updated_by_idx
  on public.shopee_ai_settings(updated_by);
create index if not exists shopee_ai_analyses_created_by_idx
  on public.shopee_ai_analyses(created_by);
create index if not exists shopee_ai_insights_reviewed_by_idx
  on public.shopee_ai_insights(reviewed_by);
create index if not exists shopee_ai_insights_dismissed_by_idx
  on public.shopee_ai_insights(dismissed_by);

commit;
