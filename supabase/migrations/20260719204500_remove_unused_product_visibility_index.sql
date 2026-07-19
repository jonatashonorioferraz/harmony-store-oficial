-- Remove índice experimental: o catálogo atual é pequeno e carregado integralmente pela PWA.
begin;
drop index if exists public.products_collaborator_catalog_idx;
commit;
