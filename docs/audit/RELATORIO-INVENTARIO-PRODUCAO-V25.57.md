# Relatório de auditoria — Inventário de Produção v25.57

Data: 09/08/2026
Escopo: banco, autenticação, autorização, integridade, interface, responsividade, PDF, continuidade e regressão.

## Resultado executivo

O módulo foi projetado como uma extensão independente. Ele reutiliza modelos, fotos, cores e colaboradoras já cadastrados, mas não modifica recebimentos oficiais, pagamentos, matérias-primas, suprimentos ou pedidos existentes.

## Controles avaliados

| Área | Controle | Resultado |
|---|---|---|
| Autorização | ADM e Recebimento ativos | Aprovado |
| Isolamento | Colaboradora sem menu, atalho ou RPC | Aprovado |
| Catálogo | Reuso de modelos, fotos e cores oficiais | Aprovado |
| Origem | Colaboradora, data e caixa por lote | Aprovado |
| Concorrência | Saída e ajuste com bloqueio `FOR UPDATE` | Aprovado |
| Saldo | Proibida saída maior que o lote | Aprovado |
| Auditoria | Entrada, saída, ajuste e correção de dados | Aprovado |
| Histórico | Sem exclusão de entradas ou movimentos | Aprovado |
| Privacidade | Sem valores financeiros | Aprovado |
| PDF | Documento isolado em PC, tablet e celular | Aprovado |
| Continuidade | Tabelas incluídas no backup e recuperação | Aprovado |
| Acessibilidade | Toque amplo e movimento reduzido respeitado | Aprovado |

## Riscos e mitigação

1. **Duplo lançamento manual:** o campo de caixa e o histórico facilitam detectar duplicidade. A integração automática com recebimentos ficou preparada, mas não foi ativada para não alterar o fluxo financeiro existente.
2. **Retirada no lote errado:** a saída exige escolha explícita da caixa e mostra colaboradora, data e saldo antes da confirmação.
3. **Correção sem justificativa:** ajustes exigem motivo no cliente e no banco.
4. **Concorrência entre aparelhos:** a RPC bloqueia o lote antes de recalcular o saldo.
5. **PDF contendo a tela inteira:** o modo de impressão exclusivo oculta a aplicação e mantém somente o documento temporário.
6. **Poluição da Home:** foi adicionado somente um botão compacto, sem indicadores, imagens ou outros atalhos.

## Compatibilidade preservada

- cálculo proporcional e agenda individual de pagamentos;
- recebimentos e reabertura de coletas;
- ordens de produção;
- estoque e reserva de matérias-primas;
- solicitações e check-up de separação;
- suprimentos, cupons, boletos e inteligência;
- notificações, Saúde do Sistema e PWA.

## Evidências automatizadas

- teste dedicado `tests/production-inventory.test.mjs`;
- suíte de isolamento de PDF ampliada;
- auditoria global de RPCs e privilégios ampliada;
- verificação do cache offline v25.57;
- verificação de espelhamento entre raiz e `web/`;
- build estático oficial.

## Implantação

1. Executar `supabase/migrations/20260809103000_production_inventory.sql` no projeto oficial.
2. Publicar os arquivos estáticos v25.57.
3. Abrir com ADM e validar uma entrada, saída parcial, ajuste e PDF.
4. Abrir com Recebimento e repetir a consulta sem valores.
5. Abrir com Colaboradora e confirmar ausência do módulo.
6. Executar backup pós-publicação e verificar o manifesto.
