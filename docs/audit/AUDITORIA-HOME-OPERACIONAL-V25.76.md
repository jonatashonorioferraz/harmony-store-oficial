# Auditoria — Home operacional 25.76

## Motivo

A versão 25.75 ocultava visualmente a Central de pendências e as Solicitações recentes ao montar a Agenda Harmony. Os dados e as funções não haviam sido removidos.

## Correção

- A Agenda oculta somente o painel antigo `Meu dia`.
- `#adminRequestHub` permanece visível para solicitações abertas de matéria-prima, material do e-commerce e suprimentos.
- `.home-requests` permanece visível com filtros por período e situação.
- Foi incluído um calendário compacto dos próximos sete dias, com navegação direta para a Agenda.
- A Home de colaboradoras e do perfil de Recebimento não foi alterada.

## Risco e compatibilidade

A mudança é exclusivamente de apresentação e navegação. Não altera Supabase, RLS, estoque, solicitações, notificações, pagamentos ou permissões. Os componentes restaurados continuam usando suas fontes e regras oficiais.

## Testes obrigatórios

1. Central de pendências visível somente para ADM.
2. Solicitações abertas classificadas nos três grupos existentes.
3. Filtro **Hoje** e filtro de situação continuam funcionais.
4. Sete datas são exibidas no computador e têm rolagem horizontal no celular e tablet estreito.
5. Clique na data abre a Agenda com o dia selecionado.
6. Suite completa e sincronização entre raiz e `web/` aprovadas antes da publicação.
