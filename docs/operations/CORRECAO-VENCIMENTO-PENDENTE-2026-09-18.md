# Correção de vencimento de boletos pendentes — v25.101

## Escopo e impacto

Projeto: **Harmony Store Oficial**, `tyzfznwvjzmudxtcbbaf`.

O status “Atrasado” é calculado sobre um boleto `pending`; não deve impedir a
correção de uma data digitada incorretamente. O detalhe não oferecia uma ação de
edição para pendentes. A nova ação **Corrigir vencimento** usa uma RPC dedicada
que altera somente `due_date` e `updated_by`; o trigger existente atualiza
`updated_at`. Valor, código, beneficiário, anexos, status e registro original
permanecem preservados. O aplicativo não executa pagamentos bancários.

A RPC é autenticada e exige perfil ADM ativo no banco. Usa `search_path` vazio,
lock de linha, validações de status e auditoria da data anterior/nova. A execução
anônima está revogada. Não foram alterados RLS, autenticação, permissões antigas,
estoque nem a proteção contra boletos duplicados. Pagos não são editáveis por
esse fluxo; cancelados continuam na ação separada de correção e reativação.

## Evidências de banco

- Migração `20260918193547_correct_pending_bill_due_date.sql` aplicada via MCP.
- `supabase/tests/pending_bill_due_date.sql` executado no banco oficial com
  boleto fictício e `ROLLBACK` obrigatório: `correcao_validada_com_rollback`,
  `test_records_remaining = 0`.
- Validados: atraso de 365 dias, ADM ativo, rejeição de colaboradora e identidade
  ausente, preservação dos demais campos, auditoria, data nula/repetida, ID
  inexistente, pagos/cancelados bloqueados e unicidade da linha digitável.
- Nenhum boleto real foi corrigido automaticamente. O usuário deve informar a
  data correta no aplicativo após a publicação.
- A sequência da auditoria pode apresentar lacunas após testes revertidos,
  comportamento normal do Postgres. Os testes usam protocolo negativo explícito
  para não consumir a sequência dos boletos.

## Advisors e limites da validação

Os avisos anteriores foram preservados: 8 tabelas com RLS sem política (INFO),
162 RPCs SECURITY DEFINER autenticadas (WARN) e proteção contra senhas vazadas
desativada (WARN). A nova RPC acrescentou um aviso do segundo tipo, esperado
pela arquitetura existente: exposição autenticada é intencional e a checagem
de ADM é interna, verificada com os papéis reais do banco no teste transacional.
Nenhuma política foi relaxada para silenciar o advisor.

- [Advisor de RPC privilegiada](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Proteção contra senhas vazadas — melhoria separada de autenticação](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

Os testes JavaScript exercitam os handlers reais com adaptador de DOM; não são
uma sessão E2E autenticada de navegador. A suíte SQL não testa duas transações
simultâneas; a serialização é garantida pelo `FOR UPDATE` na função.

## Publicação e recuperação

Validação local em 18/09/2026: build aprovado, 376/376 testes aprovados, 70
arquivos espelhados, lint com 0 erros e 18 avisos preexistentes e auditoria npm
de produção com 0 vulnerabilidades. O diff foi conferido antes da publicação.

Publicar somente depois do build, de todos os testes, lint e verificação dos
espelhos. GitHub Pages está configurado para `main`, raiz `/`; preservar também
as cópias em `web/`. Pacote: `25.101.0`; cache: `harmony-store-v25-101-r1`;
arquivo de boletos: `bills.js?v=25.101`.

Em caso de regressão, republicar a interface anterior primeiro. Se for necessário
desativar a RPC nova, usar o rollback correspondente em `supabase/rollbacks/`,
com autorização. Ele remove somente a função adicionada, sem apagar boletos,
auditoria ou desfazer datas corrigidas por usuários. Não usar rollback de dados
em lote ou restauração completa do banco para desfazer essa mudança aditiva.
