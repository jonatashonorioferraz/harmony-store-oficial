# Auditoria de mudança — Combinações de cores v25.82

Data: 13/08/2026  
Módulo: Planejamento de envios

## Escopo preservado

- Cadastro oficial de cores e produtos.
- Permissões existentes do Planejamento de envios.
- Planos anteriores de uma única cor.
- Regras de cálculo, conclusão, progresso, histórico e PDF.
- Demais módulos operacionais e financeiros.

## Controles implementados

- Catálogo isolado e reutilizável de combinações.
- Vínculos por UUID com cores oficiais, sem texto livre.
- Limite de 2 a 4 cores e bloqueio de repetição.
- Assinatura canônica e índice único contra duplicações concorrentes.
- RLS, privilégio mínimo, função autorizadora existente e auditoria.
- Índices de pesquisa e de chaves estrangeiras.
- Inclusão no backup e na ordem correta de recuperação.
- Interface responsiva e indicadores múltiplos de tonalidade no PDF.

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Quebrar planos antigos | Coluna opcional e API legada preservada |
| Misturar catálogos | Tabelas exclusivas do módulo e FK para o catálogo oficial |
| Duplicar a mesma combinação | Assinatura canônica, índice único e tratamento de concorrência |
| Item concluído continuar válido após edição | Trigger reabre somente o item alterado |
| Perder os novos dados em recuperação | Backup e recuperação incluem as duas tabelas antes dos planos |
| Expor dados a perfis indevidos | RLS e RPCs autorizadas pela função central do módulo |

## Evidências finais

- Migração `20260813210448_shipping_color_combinations.sql` aplicada com sucesso no Supabase oficial.
- RLS habilitada nas novas tabelas, privilégios diretos revogados de `anon` e `authenticated` e acesso realizado por RPC protegida.
- Usuários anônimos não executam as novas RPCs; somente perfis autenticados autorizados pelo módulo.
- Advisors do Supabase sem novo alerta de segurança associado à mudança.
- Informações de índices ainda não utilizados são esperadas enquanto o catálogo permanece vazio e foram mantidas para as futuras consultas.
- Compilação estática: aprovada.
- Espelhos oficiais raiz/`web/`: 62 arquivos sincronizados.
- Testes automatizados: **305 aprovados, 0 falhas**.
- Backup e recuperação atualizados para contemplar as novas tabelas antes dos planos de envio.

