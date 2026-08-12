# Central de Inteligência reorganizada — v25.74

## Objetivo

Reduzir a poluição visual da área administrativa sem excluir relatórios, cálculos ou recursos já utilizados pela Harmony Store Oficial.

## Arquitetura da navegação

1. **Painel inteligente** — montagem do painel `inventoryAiDashboard`, estatísticas reais do Inventário, gráficos, insights e histórico da IA.
2. **Operação** — seletor interno para resumo, matérias-primas, e-commerce, colaboradoras, planejado × recebido e qualidade dos dados.
3. **Compras e parceiros** — seletor interno para pedidos, fornecedores e planejamento de reposição.
4. **Ideias e evolução** — cadastro e acompanhamento das propostas.

O estado interno `BI.tab` foi preservado para manter filtros, exportações, modais e regras existentes. A função `areaForTab` apenas agrupa cada relatório em uma das quatro áreas principais.

## Integração da IA

`intelligence.js` cria um ponto único de montagem (`#inventoryAiDashboard`). `intelligence-ai.js` preenche esse ponto sem criar uma nova aba e evita nova renderização quando o painel já existe. Os indicadores e gráficos usam RPCs do Supabase; somente o botão **Analisar agora com IA** chama a Edge Function e pode gerar custo de API.

## Segurança e compatibilidade

- Alteração exclusivamente de interface e organização de navegação.
- Nenhuma migração, tabela, função SQL, política RLS ou Edge Function foi modificada.
- A área continua exclusiva para `role = admin`.
- A IA continua consultiva e não movimenta estoque, pagamentos, ordens ou cadastros.
- Layout preparado para computador, tablet e celular.

## Regressão obrigatória

- Confirmar quatro áreas principais e ausência de uma aba extra da IA.
- Abrir todos os relatórios internos e testar filtros, exportações e modais.
- Conferir estatísticas, gráfico de saldos e gráfico de movimentações com dados reais.
- Alternar entre as quatro áreas sem recarregamento infinito.
- Validar espelhos raiz/web, testes automatizados, PWA e domínio oficial.
