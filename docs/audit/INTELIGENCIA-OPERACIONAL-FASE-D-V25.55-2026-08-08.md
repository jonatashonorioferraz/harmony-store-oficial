# Inteligência Operacional — Fase D — v25.55

Data: 08/08/2026

## Objetivo

Transformar dados que já existem no Harmony Store em informações gerenciais, sem criar novos processos, menus ou alterações automáticas em estoque e pagamentos.

## Entregas

1. **Planejado versus recebido**
   - Compara ordens de produção enviadas com recebimentos oficiais do período.
   - Agrupa por colaboradora, modelo e cor, normalizando diferenças de acentuação e maiúsculas.
   - Mostra planejado, recebido, saldo, prazo e situação.
   - Ignora rascunhos e ordens canceladas.
   - Não participa do cálculo de pagamento.

2. **Qualidade dos dados**
   - Produtos ativos sem foto.
   - Produtos sem fornecedor vinculado.
   - Fornecedores ativos sem telefone, e-mail ou site.
   - Recebimentos com cor fora do catálogo ativo.
   - Divergências entre quantidade informada e contagem oficial.

3. **Planejamento de compra preservado**
   - A sugestão atual por consumo, prazo, estoque de segurança e pedidos em aberto foi mantida.
   - O painel esclarece que a sugestão nunca modifica estoque automaticamente.

## Arquitetura e segurança

- A funcionalidade utiliza as RPCs autenticadas já existentes para ordens, recebimentos e cores.
- A área Inteligência permanece exclusiva para administradores.
- Nenhuma tabela, policy, grant, Edge Function ou migration foi necessária.
- Nenhum dado financeiro de colaboradora foi adicionado ao comparativo.
- Os filtros de período e colaboradora são enviados ao Supabase antes da renderização.

## Limite consciente

O comparativo é do período selecionado. Como o recebimento ainda não possui ligação direta obrigatória com uma ordem específica, o sistema não afirma que uma coleta pertence a determinada ordem: ele compara totais equivalentes por colaboradora, modelo e cor no intervalo. Isso evita associações falsas e preserva o fluxo simples de conferência.

## Compatibilidade

- Computador, celular e tablet.
- PWA instalado e navegador.
- Exportação para Excel sem dependências novas.
- Sem alteração nos módulos de recebimento, pagamento, estoque e ordem de produção.

## Testes

- Agrupamento por colaboradora, modelo e cor.
- Normalização de nomes de cores.
- Situações completa e parcial.
- Ausência de escrita em estoque ou pagamento.
- Detecção dos cinco tipos de qualidade.
- Paridade entre arquivos oficiais da raiz e de `web/`.
