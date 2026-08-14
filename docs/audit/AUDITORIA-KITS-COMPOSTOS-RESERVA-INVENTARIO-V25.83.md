# Auditoria — Kits compostos e reserva do Inventário — v25.83

## Escopo validado

- Persistência reutilizável de kits compostos.
- Foto própria opcional e fallback para foto oficial.
- Exclusão lógica sem quebra de histórico.
- Snapshot de componentes por plano.
- Reserva concorrente de caixas inteiras por modelo e cor.
- Contador e lista de disponibilidade excluindo reservas ativas.
- Confirmação física exclusiva de ADM e Recebimento.
- Cancelamento com liberação auditada.
- Layout responsivo em computador, tablet e celular.
- Inclusão no cache PWA, build estático, backup e recuperação.

## Invariantes

1. Uma caixa possui no máximo uma reserva ativa.
2. Reserva não reduz `current_quantity`.
3. Transferência reduz a caixa inteira e somente após confirmação autorizada.
4. Um componente só aceita caixas do mesmo `model_id` e `color_id`.
5. Kit arquivado não aparece em novos planos e não altera snapshots antigos.
6. Itens exclusivos não acessam o Inventário.
7. Regras de pagamento e recebimento permanecem inalteradas.

## Matriz de permissão

| Operação | Gerente e-commerce | ADM principal | ADM | Recebimento |
|---|---:|---:|---:|---:|
| Criar/excluir logicamente kit | Sim | Sim | Não | Não |
| Reservar/cancelar caixas pelo plano | Sim | Sim | Não | Não |
| Visualizar solicitação no Inventário | Não | Sim | Sim | Sim |
| Confirmar transferência física | Não | Sim | Sim | Sim |

## Evidências esperadas

- Migrações `20260814170000`, `20260814173000`, `20260814174500` e `20260814175500` aplicadas.
- Índices de apoio das chaves estrangeiras e bloqueio de arquivamento de kit em plano ativo validados.
- Testes de sintaxe dos dois scripts do módulo.
- Testes automatizados de banco, segurança, integração, PWA e backup.
- Advisors de segurança e desempenho executados após a alteração estrutural.
- Build estático contendo o novo integrador.
