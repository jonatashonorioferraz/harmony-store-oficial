# Kits compostos e reserva do Inventário — v25.83

## Objetivo

Integrar o Planejamento de envios ao Inventário de Produção sem duplicar produtos, sem baixar estoque antes da conferência física e sem alterar o histórico de planos antigos.

## Tipos de item

- `catalog`: modelo oficial de `finished_product_models`.
- `exclusive`: item reutilizável apenas do Planejamento de envios.
- `kit`: composição reutilizável com dois ou mais pares de modelo e cor oficiais.

`shipping_kit_templates` guarda o catálogo ativo dos kits. `shipping_kit_template_components` guarda sua composição editável. Ao salvar um plano, `shipping_plan_item_components` recebe uma cópia histórica dos componentes e quantidades; por isso a remoção lógica de um kit não modifica planos anteriores. Um kit ainda usado por plano ativo não pode ser arquivado; após o plano ser encerrado ou cancelado, ele pode sair do catálogo sem apagar seu histórico.

## Fotos

`shipping_kit_templates.image_path` é opcional e usa o bucket público `shipping-planning-images`, protegido pelas políticas já existentes do módulo. Sem capa própria, a interface usa a foto do primeiro componente. Cada componente continua referenciando `finished_product_models.image_path` e é exibido com a foto oficial.

## Reserva e transferência

1. A Gerente de e-commerce ou o ADM principal seleciona caixas inteiras para os componentes de um plano FULL.
2. `reserve_shipping_inventory_boxes` valida plano, item, componente, modelo, cor, saldo e concorrência dentro de uma transação.
3. Um índice único parcial impede duas reservas ativas da mesma caixa.
4. A caixa reservada deixa de aparecer em `list_available_production_inventory_boxes` e no contador ao vivo, mas mantém seu saldo.
5. ADM ou Recebimento executa `confirm_shipping_inventory_request_transfer` após a conferência física.
6. A confirmação chama a movimentação oficial de retirada da caixa completa e registra o vínculo no pedido.
7. O cancelamento preenche `released_at`, libera as caixas e preserva a trilha de auditoria.

## Segurança

- As cinco tabelas novas têm RLS habilitada.
- Acesso direto de `public`, `anon` e `authenticated` foi revogado.
- O aplicativo acessa os dados exclusivamente por RPC autenticada.
- Funções privilegiadas definem `search_path=''`, validam `auth.uid()` e verificam o perfil em funções privadas.
- Gerente de e-commerce e ADM principal administram planos, kits e reservas.
- ADM e Recebimento conferem e confirmam a transferência física.
- Índices de apoio cobrem as novas chaves estrangeiras para manter consultas e exclusões consistentes em escala.
- Nenhuma chave secreta é exposta no cliente.

## Compatibilidade

Planos existentes são convertidos para os tipos `catalog` ou `exclusive`. Itens simples oficiais recebem uma fotografia histórica de seu componente quando aplicável. Combinações antigas de cores continuam funcionando, mas não podem reservar uma caixa exata porque não representam uma única cor física.

## Recuperação

O backup criptografado inclui, em ordem de dependência, kits, componentes, planos, snapshots, entradas do Inventário, solicitações e caixas reservadas. O ensaio de recuperação restaura as caixas antes dos vínculos de reserva.
