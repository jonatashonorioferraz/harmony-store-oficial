# Auditoria — importações Shopee v25.87

Data: 15/08/2026

## Risco corrigido

A tela anterior apresentava inclusão e substituição dentro do mesmo cartão. Isso aumentava a chance de o operador interpretar uma correção como o caminho normal para enviar uma nova semana.

## Controles implementados

- áreas visualmente separadas para inclusão, consulta e correção;
- cartões de último período agora são somente leitura;
- correção disponível apenas no histórico auditável;
- confirmação identifica relatório, período e arquivo atual;
- validação obrigatória do período esperado também no servidor;
- recusa atômica antes de qualquer gravação quando o período não coincide;
- textos responsivos em português do Brasil para computador, tablet e celular.

## Escopo não alterado

Não foram modificadas regras de estoque, produção, pagamentos, autenticação, RLS ou outros módulos do aplicativo.

