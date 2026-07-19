# Rollback — permissões explícitas da Data API

Migration relacionada:
`supabase/migrations/20260719053406_explicit_data_api_grants.sql`

## Quando usar

Somente se, após a implantação, uma operação autenticada legítima retornar o erro
PostgREST `42501` (`permission denied`) e não houver tempo para corrigir o `GRANT`
específico.

## O que o rollback faz

- restaura privilégios amplos para `authenticated` e `service_role` nos objetos
  públicos atuais;
- mantém RLS ativa e todas as políticas existentes;
- mantém o papel `anon` bloqueado;
- mantém a função interna de criação de perfil fora da API autenticada.

## Procedimento

1. Registrar horário, usuário, tela e operação que falhou.
2. Executar no SQL Editor o arquivo
   `supabase/rollbacks/20260719053406_explicit_data_api_grants.sql`.
3. Testar login, catálogo, nova solicitação, recebimento e pagamentos.
4. Corrigir o privilégio ausente na migration e reaplicar o pacote revisado.

O rollback é transacional. Uma falha antes do `commit` não deixa privilégios
parcialmente aplicados.
