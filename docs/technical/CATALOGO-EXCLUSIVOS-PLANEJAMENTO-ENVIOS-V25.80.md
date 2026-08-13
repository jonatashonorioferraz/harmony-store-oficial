# Catálogo de exclusivos do Planejamento de envios — v25.80

## Objetivo

Permitir a reutilização de produtos próprios de kits e envios sem misturá-los aos modelos oficiais usados em Produção, Solicitações e Inventário.

## Arquitetura

- `shipping_exclusive_products`: catálogo interno com nome, foto, cor e padrões operacionais.
- `shipping_plan_items`: continua armazenando a fotografia histórica de cada item no plano.
- `list_shipping_exclusive_products()`: lista somente itens ativos para perfis autorizados.
- `save_shipping_exclusive_product(...)`: cria ou atualiza o catálogo, valida dados e registra auditoria.
- O catálogo não possui chave estrangeira para `finished_product_models`; portanto, não pode aparecer nos fluxos oficiais de produção.

## Segurança

- RLS habilitado na nova tabela.
- Acesso validado por `private.can_manage_shipping_planning()`.
- Tabela sem privilégios diretos para `anon` e `authenticated`.
- RPCs sem execução para `PUBLIC` e `anon`; somente `authenticated` autorizado e `service_role` podem executar.
- As RPCs `SECURITY DEFINER` repetem a verificação de autorização antes de ler ou alterar dados.
- Caminhos de imagem são validados; fotos já salvas no catálogo podem ser reutilizadas por outra pessoa autorizada sem liberar caminhos arbitrários.

## Continuidade

`shipping_exclusive_products`, `shipping_plans` e `shipping_plan_items` participam do backup criptografado e da recuperação isolada. O produto temporário usado no teste foi criado dentro de uma transação e removido por `ROLLBACK`.

## Validação

- 303 testes automatizados aprovados.
- RLS ativo e política presente.
- Leitura e gravação por RPC confirmadas para perfil autorizado.
- Acesso anônimo e leitura direta da tabela bloqueados.
- Nenhum dado de teste permaneceu no banco oficial.
