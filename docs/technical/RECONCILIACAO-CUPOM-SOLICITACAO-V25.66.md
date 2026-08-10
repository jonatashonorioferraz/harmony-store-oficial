# Reconciliação de cupom com solicitação — v25.66

## Objetivo

Resolver compras físicas concluídas cuja descrição comercial do cupom difere do nome cadastrado no pedido. O fluxo não reclassifica o produto comprado nem altera movimentos de estoque: cria uma evidência auditável de que uma linha específica do cupom atende a um item específico da solicitação.

## Fluxo

1. O cupom confirmado permanece imutável com descrição, quantidade, preço e produto escolhidos na revisão.
2. Se não houver correspondência automática por `product_id`, o ADM abre **Vincular item do cupom**.
3. A interface oferece somente linhas livres dos cupons confirmados da mesma solicitação.
4. O ADM escolhe uma linha e informa a justificativa.
5. `admin_link_internal_receipt_item` valida perfil, solicitação, cupom e exclusividade do vínculo dentro de uma transação.
6. O status é recalculado: pendente sem cupom, parcial com algum item atendido ou concluído quando todos estiverem atendidos.
7. A criação ou remoção gera um registro em `audit_logs`.

## Segurança e dados

- Tabela aditiva: `internal_supply_request_item_fulfillments`.
- Um item solicitado admite no máximo um vínculo manual, e uma linha do cupom não pode atender dois itens.
- RLS permite leitura apenas a administradores autenticados.
- Escrita somente por RPCs `SECURITY DEFINER` com `private.is_admin()`, `search_path` vazio e grants explícitos.
- A descrição original do cupom e o `product_id` usado no estoque não são alterados.
- Solicitações canceladas não podem ser conciliadas.
- A tabela integra o inventário do backup criptografado.

## Compatibilidade

- Correspondências automáticas existentes continuam funcionando por `product_id`.
- Perfis, valores, fornecedores, relatórios e movimentos de estoque permanecem inalterados.
- O perfil de Recebimento continua sem acesso financeiro e sem permissão para conciliar.
- A interface possui adaptação específica para computador, tablet e celular.

## Acessos rápidos com IA

A Home administrativa ganhou acessos diretos para compra por cupom e cadastro de boleto. Eles chamam os mesmos fluxos protegidos dos módulos originais e não concedem permissões adicionais. O perfil de Recebimento recebe somente o atalho do Inventário de Produção.

## Recuperação

Em uma reversão de interface, os dados de conciliação podem permanecer sem afetar os fluxos antigos. Uma reversão de banco deve ocorrer apenas após exportação da tabela e verificação de que nenhuma solicitação depende exclusivamente de vínculo manual para estar concluída.
