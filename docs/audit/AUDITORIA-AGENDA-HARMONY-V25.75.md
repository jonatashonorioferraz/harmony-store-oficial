# Auditoria — Agenda Harmony 25.75

## Escopo avaliado

- Arquitetura, autenticação, RLS, permissões, Data API e Edge Functions.
- Compatibilidade com boletos, solicitações, compras internas, ordens e inventário.
- Experiência em computador, tablet, celular e PWA offline.
- IA, custo, privacidade, auditoria, backup e recuperação.

## Riscos e controles

| Risco | Controle aplicado |
|---|---|
| Duplicar ou divergir dados operacionais | Adaptadores somente leitura; a operação é concluída no módulo original. |
| Colaboradora acessar tarefas administrativas | Navegação exclusiva para ADM, RLS e validação de perfil na Edge Function. |
| IA executar ações | A função só gera JSON consultivo e não contém mutações nos módulos operacionais. |
| Custo imprevisto | Orçamento mensal, limite diário, cooldown, cache e histórico de tokens/custo. |
| Push duplicado | Chave única por tarefa/destinatário e estado de entrega idempotente. |
| Regressão da Home | Painéis antigos apenas ocultos para ADM; experiência dos demais perfis preservada. |
| Perda na recuperação | Tabelas adicionadas ao backup e ao procedimento isolado. |
| Vazamento de nomes à IA | Resumo diário envia apenas métricas e datas consolidadas, sem nomes pessoais. |

## Regra de rollback

O retorno seguro usa a tag `backup/pre-agenda-harmony-v25.74-20260812`. A interface pode ser removida sem desfazer os dados; as tabelas são aditivas e não interferem nas funções anteriores.
