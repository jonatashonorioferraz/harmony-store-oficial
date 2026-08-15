# Shopee Analytics — histórico filtrável v25.88

## Objetivo

Manter o histórico de planilhas auditável e utilizável mesmo após anos de importações, sem alterar a fonte de dados nem o fluxo protegido de correção.

## Regras funcionais

- A ordenação é decrescente por `period_end`, seguida de `imported_at` para desempate.
- O filtro de categoria mapeia `shop_stats` para **Visão geral**, `product_funnel` para **Produtos** e `promotions` para **Marketing**.
- O intervalo de datas utiliza sobreposição de períodos: um arquivo permanece visível quando o período importado intercepta o intervalo escolhido.
- A data final não pode ser anterior à inicial.
- Os filtros são locais e não executam escrita no Supabase.
- O botão **Corrigir período** mantém os identificadores e a validação de período exato da versão 25.87.

## Interface e desempenho

- A tabela usa uma janela de até 500 px com rolagem interna.
- O cabeçalho permanece fixo durante a rolagem.
- Computador, tablet e celular possuem reorganização específica dos filtros.
- A filtragem e a ordenação operam sobre o conjunto já carregado pelo dashboard, sem novas chamadas ao banco.

## Compatibilidade

Nenhuma tabela, função RPC, Edge Function, política RLS ou estrutura de dados foi modificada.
