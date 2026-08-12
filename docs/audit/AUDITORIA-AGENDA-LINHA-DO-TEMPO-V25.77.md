# Auditoria — Seu dia conectado 25.77

Data: 12/08/2026

## Escopo verificado

- preservação das ordens de produção originais;
- acesso exclusivo de ADMs;
- trilha de conclusão e reabertura;
- prioridade visual da Home;
- responsividade em computador, tablet e celular;
- continuidade de backup e recuperação;
- idioma integral em português do Brasil.

## Controles

1. A migração é somente aditiva.
2. O RPC administrativo usa `SECURITY INVOKER` e valida `private.is_admin()`.
3. As tabelas novas têm RLS e privilégios explícitos; `anon` não possui acesso.
4. O SQL não executa `UPDATE` ou `DELETE` em `production_orders`.
5. Cada mudança de estado gera evento com ADM, data, situação anterior e protocolo.
6. A lista de produção continua sendo aberta no módulo oficial para qualquer ação operacional.
7. A Home das colaboradoras e do perfil de Recebimento não é alterada.

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Confundir conclusão da Agenda com produção entregue | confirmação explícita e mensagem informando que a ordem original não muda |
| Esconder uma ordem por engano | filtro de concluídas e ação Reabrir na Agenda |
| Uma ordem antiga dominar a Home | agrupamento semanal e prioridade normal |
| Divergência entre ADMs | estado compartilhado e auditado no Supabase |
| Quebra em telas pequenas | regras específicas para 900 px, 720 px e 430 px |

## Critério de aprovação

A versão somente pode ser publicada após a suíte completa passar, os espelhos oficiais estarem idênticos, a migração remota ser validada e os consultores de segurança e desempenho do Supabase serem revisados.
