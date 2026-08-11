-- Índice de cobertura da auditoria de etiquetas por responsável pela impressão.

begin;

create index if not exists production_inventory_label_prints_printed_by_idx
  on public.production_inventory_label_prints(printed_by,printed_at desc);

commit;
