-- Execute somente depois de criar o usuário no menu Authentication > Users.

update public.profiles p
set
  role = 'admin',
  full_name = 'Administrador Principal',
  username = 'admin.principal',
  is_primary_admin = true,
  must_change_password = true,
  status = 'active',
  updated_at = now()
from auth.users u
where p.id = u.id
  and u.email = 'admin.principal@auth.harmonylembrancinhas.com.br';

select
  p.full_name as nome,
  p.username as login,
  p.role as perfil,
  p.harmony_id,
  p.status,
  p.is_primary_admin as administradora_principal
from public.profiles p
join auth.users u on u.id = p.id
where u.email = 'admin.principal@auth.harmonylembrancinhas.com.br';
