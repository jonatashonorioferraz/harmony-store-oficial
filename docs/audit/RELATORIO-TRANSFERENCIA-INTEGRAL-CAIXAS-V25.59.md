# Relatório de auditoria — transferência integral de caixas v25.59

## Controles verificados

- inexistência de campo de quantidade na interface de transferência;
- confirmação explícita com código, saldo e destino;
- bloqueio de retirada parcial no banco;
- bloqueio de segunda transferência;
- bloqueio de ajuste de saldo após a saída física;
- movimentação integral com saldo final zero;
- preservação da caixa e do código no histórico;
- identificação da transferência nos detalhes e no PDF;
- autorização restrita a ADM e Recebimento;
- isolamento de pagamentos, recebimentos e matérias-primas.

## Compatibilidade

Clientes da v25.58 continuam consultando as caixas. Se tentarem uma retirada parcial, recebem uma mensagem segura para atualizar o aplicativo; uma retirada exatamente igual ao saldo é registrada como transferência integral.

## Critérios de aceite

1. Uma caixa com 150 unidades transfere exatamente 150 unidades.
2. Uma tentativa de retirar 149 unidades falha sem movimentar saldo.
3. A transferência válida deixa saldo zero e situação `ecommerce`.
4. Repetir a transferência falha.
5. Ajustar a quantidade depois da transferência falha.
6. Data, usuário, código e quantidade permanecem consultáveis.
7. O ensaio transacional termina com zero dados artificiais.
