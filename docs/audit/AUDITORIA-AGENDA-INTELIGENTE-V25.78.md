# Auditoria — Agenda Inteligente v25.78

Data: 12/08/2026  
Escopo: página inicial administrativa e análise da Agenda Harmony.

## Objetivo

Eliminar a duplicação visual entre a Central de Pendências e a antiga linha do tempo **Seu dia conectado**, preservando a visão operacional das solicitações e oferecendo um calendário administrativo útil para tarefas, compromissos e boletos.

## Regras preservadas

- A Central de Pendências continua sendo a fonte visual das solicitações abertas.
- A Agenda completa continua reunindo itens do sistema, histórico e ordens de produção.
- Concluir um acompanhamento na Agenda não conclui entrega, recebimento, pagamento ou estoque.
- A IA não altera dados operacionais e não executa ações automaticamente.
- Colaboradoras e o perfil Recebimento não recebem o painel administrativo.
- Nenhuma tabela, política RLS ou regra de pagamento foi alterada.

## Alterações auditadas

- O painel inicial da Agenda passou a mostrar sete dias em formato de calendário aberto.
- A Home da Agenda aceita apenas tarefas manuais e boletos; solicitações e ordens permanecem fora desse resumo para evitar duplicidade.
- Dias vazios aparecem explicitamente como **Sem compromissos**.
- Clicar em uma data abre a Agenda completa com o filtro correspondente.
- No celular, os dias são navegáveis horizontalmente e o dia selecionado possui resumo compacto.
- A Inteligência do dia foi limitada a três informações e recebeu filtro contra repetição de solicitações e ordens.
- O prompt da função de análise administrativa prioriza exceções, prazos, boletos, inventário e decisões reais.

## Riscos e controles

| Risco | Controle aplicado |
|---|---|
| Ocultar uma solicitação importante | A Central de Pendências foi preservada sem mudanças. |
| A IA repetir o painel operacional | Filtro local e instrução explícita no prompt da Edge Function. |
| Perder acesso às ordens de produção | Itens seguem disponíveis na Agenda completa. |
| Alterar permissões por perfil | Montagem do painel continua condicionada ao perfil ADM. |
| Regressão no celular ou tablet | Estilos dedicados para 1100 px, 720 px e 430 px. |

## Recuperação

Não houve migração de banco. Em caso de regressão visual, a reversão exige apenas restaurar os arquivos `agenda-harmony.js`, `agenda-harmony.css`, `help-center.js`, `index.html` e `service-worker.js` da versão 25.77 e republicar a função anterior de análise.
