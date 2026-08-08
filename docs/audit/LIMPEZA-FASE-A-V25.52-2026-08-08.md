# Limpeza comprovável — Fase A da v25.52

Data: 08/08/2026

## Objetivo

Reduzir código e arquivos redundantes sem modificar interface, permissões, banco oficial ou regras de negócio.

## Alterações aplicadas

- Removidos os modais antigos e sem chamadas de separação, agendamento e conclusão de suprimentos internos.
- Mantido o fluxo atual de solicitações e compras internas.
- Removida a importação não utilizada `basename` do backup.
- Removida a cópia SQL da raiz; a migration oficial permanece em `supabase/migrations/007_reliability_improvements.sql`.
- Tornado explícito o tratamento de erro da Central de Pendências, sem alterar seu comportamento.
- Removido um parâmetro de erro não utilizado na exclusão de modelos de produção.
- Adicionados quatro testes de proteção para a limpeza.

## Validação

- Build oficial aprovado.
- 194 testes aprovados e nenhuma falha.
- ESLint sem erros; avisos reduzidos de 23 para 14.
- 49 arquivos oficiais sincronizados entre raiz e `web/`.

## Avisos preservados intencionalmente

Os objetos globais consumidos entre scripts e a função de encerramento das notificações continuam aparecendo como não utilizados no lint isolado. Eles são usados em tempo de execução por outros arquivos e não foram removidos. Os avisos da estrutura Next/React experimental também permanecem isolados do PWA oficial.

## Resultado

A aplicação mantém o mesmo comportamento publicado, com menos código antigo, menos ambiguidade operacional e uma base de testes ampliada.
