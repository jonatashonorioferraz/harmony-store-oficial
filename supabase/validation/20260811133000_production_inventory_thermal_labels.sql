-- Validação pós-migração: etiquetas térmicas do Inventário de Produção.

select column_name,data_type,is_nullable,column_default
from information_schema.columns
where table_schema='public' and table_name='production_inventory_entries'
  and column_name in ('label_status','label_token','label_applied_at','label_applied_by','label_cancelled_at','label_cancelled_by','label_cancellation_reason')
order by column_name;

select relname,relrowsecurity
from pg_class
where oid='public.production_inventory_label_prints'::regclass;

select routine_name,security_type
from information_schema.routines
where routine_schema='public'
  and routine_name in (
    'create_production_inventory_entry_v3',
    'confirm_production_inventory_label_applied',
    'record_production_inventory_label_print',
    'cancel_pending_production_inventory_label',
    'list_pending_production_inventory_labels',
    'get_production_inventory_box_by_label_token',
    'list_production_inventory_entries_v4'
  )
order by routine_name;

select label_status,count(*) as caixas,sum(current_quantity) as saldo
from public.production_inventory_entries
group by label_status
order by label_status;

select count(*) as estados_invalidos
from public.production_inventory_entries
where (label_status='pending' and current_quantity<>0)
   or (label_status='cancelled' and current_quantity<>0)
   or (label_status='applied' and (label_applied_at is null or label_applied_by is null));
