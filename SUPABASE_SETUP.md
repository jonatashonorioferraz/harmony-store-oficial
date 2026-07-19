# Ativação do Supabase — Harmony Store Oficial

1. O projeto Supabase já foi criado e conectado localmente com a URL e a chave pública.
2. Troque a senha do banco que foi compartilhada na conversa e guarde a nova senha em um gerenciador de senhas. Ela não será usada nem armazenada no projeto.
3. No **SQL Editor**, execute `supabase/migrations/001_harmony_store.sql` inteiro.
4. Em **Authentication > Users**, crie o primeiro usuário com:
   - e-mail: `admin.principal@auth.harmonylembrancinhas.com.br`
   - senha: uma senha temporária forte escolhida pela proprietária
   - metadado `full_name`: `Administrador Principal`
5. No SQL Editor, promova somente esse usuário para administrador principal:

```sql
update public.profiles p
set role = 'admin', full_name = 'Administrador Principal', username = 'admin.principal',
    is_primary_admin = true, must_change_password = true, status = 'active', updated_at = now()
from auth.users u
where p.id = u.id
  and u.email = 'admin.principal@auth.harmonylembrancinhas.com.br';
```

6. A URL e a chave **Publishable** já estão configuradas nas variáveis locais do aplicativo.

A chave `service_role` nunca deve ser enviada por mensagem nem colocada em variável `NEXT_PUBLIC`. Ela será configurada apenas como segredo na hospedagem para o administrador criar, editar e excluir acessos.

## Domínio

O endereço final previsto é `harmonylembrancinhas.com.br`. A conexão do domínio será feita depois da publicação privada e dos testes do login, sem liberar o acesso às colaboradoras.
