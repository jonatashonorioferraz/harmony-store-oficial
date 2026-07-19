# Progresso da Fase 2A

Atualizado em: 19/07/2026

## Concluído e validado

- Senha do banco rotacionada pelo responsável do projeto.
- Cópia lógica de emergência criada, validada por hash e guardada fora do workspace.
- Conta do ADM principal protegida contra alteração por outro ADM.
- Criação e promoção de administradores limitada ao ADM principal.
- Função Edge `manage-user` publicada com autenticação JWT ativa.
- Execução anônima revogada das 31 funções `SECURITY DEFINER` do esquema `public`.
- Funções de negócio mantidas para usuários autenticados.
- Gatilho interno de criação de perfil removido da API autenticada.
- Suíte padrão corrigida para executar todos os testes.
- Build aprovado e 28 testes automatizados aprovados.
- Testes funcionais confirmados no aplicativo: edição de colaboradora e edição do próprio perfil.

## Próximo pacote proposto

Troca obrigatória da senha temporária no primeiro acesso.

Impacto identificado: as duas contas ativas atuais estão marcadas com
`must_change_password = true`. A publicação desse pacote solicitará uma nova senha
ao ADM principal e à colaboradora no próximo acesso autenticado.

Estado atual:

- Implementação concluída.
- Build aprovado e suíte ampliada para 33 testes aprovados.
- Layout validado em 1280 × 800 e 390 × 844, sem rolagem horizontal.
- Edge Function `manage-user` versão 6 publicada e ativa com verificação JWT.
- Pacote do site v22 publicado e confirmado no domínio oficial.
- Troca obrigatória concluída pelo ADM principal.
- Banco confirmou o ADM principal liberado e o evento de auditoria registrado.
- Teste funcional da conta colaboradora ainda pendente.
- Dependências Edge fixadas: `supabase-js 2.110.7` e `web-push 3.6.7`.
- Funções oficiais republicadas e verificadas: `manage-user` v8 e `send-push` v5.
- Exclusão segura implementada: cadastro sem movimento é removido; cadastro com
  histórico é bloqueado e desativado, preservando solicitações, produção e pagamentos.
- Reativação sincroniza o perfil com o bloqueio do Supabase Auth.
- Build aprovado e suíte ampliada para 39 testes aprovados.
- Pacote do site v23 publicado no GitHub e implantado com sucesso pelo GitHub Pages.
- Domínio oficial validado entregando `harmony-store-v23`.
- Proteção administrativa confirmada em produção: remoção de acesso e
  desativação segura quando o cadastro possui histórico operacional.
- Página de login validada em produção sem erros no console.
- Commits de publicação: `59803f0` (`app.js`) e `3698c48` (`service-worker.js`).
- Migration de privilégios explícitos da Data API aplicada com sucesso.
- Papel `anon` confirmado com zero privilégios em tabelas, sequências e funções
  do schema `public`; rota REST sem login respondeu `401`.
- Acessos autenticados mínimos declarados para tabelas, sequências e RPCs usados
  pelo app; `service_role` preservado para o backend confiável.
- Objetos futuros criados pelo papel `postgres` passaram a exigir `GRANT` explícito.
- Smoke tests de ADM, colaboradora e recebimento aprovados; simulação de
  recebimento revertida sem alterar cadastros reais.
- Rollback operacional criado, validado por transação com `ROLLBACK` e documentado.
- Build aprovado e suíte ampliada para 45 testes aprovados.
- Advisors executados após a mudança: nenhuma função `SECURITY DEFINER` permanece
  executável por `anon`; pendências de Storage, auditoria e performance seguem
  registradas para as próximas fases.
- Repositório Git local reconstruído e vinculado ao histórico oficial do GitHub.
- Branch `main` integrou o site publicado com fontes, migrations, rollbacks,
  testes e documentação no commit `7dd31f5`, sem alterar os arquivos ativos do site.
- `.env.local`, backups, builds, pacotes e cache confirmados fora do Git.
- Repositório sincronizado com o GitHub e GitHub Pages validado no domínio oficial.

## Fase 2B iniciada e validada

- Migração de preparação aplicada sem remover a compatibilidade do app v23.
- Auditoria imutável, correlacionada e paginada no servidor.
- RPCs transacionais de produto, exclusão e planejamento validadas em transação
  revertida, sem deixar dados de teste.
- Segredo HMAC do CPF criado no Supabase sem exposição no código-fonte.
- Edge Function `manage-user` v10 publicada com JWT obrigatório e erros sanitizados.
- Build aprovado e suíte ampliada para 51 testes aprovados.
- Plano, riscos, evidências e rollback documentados em `PLANO-FASE-2B.md`.
