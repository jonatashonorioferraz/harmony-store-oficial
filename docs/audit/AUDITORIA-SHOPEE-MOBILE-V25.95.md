# Auditoria responsiva — Shopee Analytics v25.95

Data: 16/08/2026

## Escopo

Revisão das cinco áreas do módulo Shopee Analytics em computador, tablet e celular:

- Visão geral;
- Produtos;
- Marketing;
- Promoções;
- Importações.

## Causas encontradas

1. Regras responsivas de versões diferentes disputavam o tamanho e o fluxo do cabeçalho.
2. O calendário alternava entre posição fixa, absoluta e integrada, causando sobreposição.
3. As cinco abas permaneciam em uma única linha no celular e a última ficava parcialmente inacessível.
4. Tabelas extensas transferiam a rolagem horizontal para a página inteira.
5. Cards executivos e áreas de importação conservavam grades de computador em telas estreitas.
6. O fim do conteúdo não reservava espaço próprio para o menu inferior fixo do aplicativo.

## Controles aplicados

- Cabeçalho móvel compacto, sem altura artificial.
- Filtro de data em primeira posição, com alvos de toque de pelo menos 42–44 px.
- Calendário integrado ao fluxo no celular e limitado à altura visível.
- Navegação das cinco abas em grade 3 + 2, sem corte lateral.
- Cards, gráficos, funis e campanhas em uma coluna no celular.
- Tabelas com rolagem horizontal interna e histórico com rolagem vertical controlada.
- Formulários de importação e correção em uma coluna.
- Espaço seguro para o menu inferior e para a área segura do aparelho.
- Sem mudanças em cálculos, importações, Supabase, inteligência artificial ou regras de duplicidade.

## Matriz de validação

| Superfície | Largura de referência | Resultado esperado |
|---|---:|---|
| Celular compacto | 390–420 px | Filtro, cinco abas e conteúdo sem rolagem lateral da página |
| Celular amplo | 421–720 px | KPIs em duas colunas e demais painéis em uma coluna |
| Tablet | 721–1100 px | Cabeçalho e ações em duas colunas, painéis adaptativos |
| Computador | acima de 1100 px | Grade executiva completa e calendário ancorado ao filtro |

## Risco residual

Baixo. A revisão é predominantemente de apresentação. A única alteração de marcação adiciona semântica acessível às abas, sem modificar os eventos existentes baseados em `data-shopee-tab`.
