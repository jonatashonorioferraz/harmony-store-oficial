# Caixas únicas no Inventário de Produção — v25.58

## Objetivo

Cada entrada do Inventário de Produção representa uma caixa física independente. O identificador permanente `CX-NNNNNN` permite localizar a caixa, acompanhar saídas parciais e preservar sua origem mesmo depois de esvaziada.

## Regras de negócio

1. O número da caixa é positivo, único e global dentro do inventário.
2. O botão **Gerar código** consome o próximo valor de uma sequência sem ciclo.
3. Valores consumidos não retornam à sequência, ainda que o formulário seja fechado sem salvar.
4. O banco rejeita duplicidade e impede alteração do número depois da criação.
5. Zerar o saldo não exclui a entrada nem suas movimentações.
6. A localização física permanece editável e é independente do código permanente.
7. Somente perfis ativos `admin` e `receiver` podem gerar códigos, criar caixas ou consultar os dados.

## Modelo de dados

`production_inventory_entries.box_number bigint not null` recebe o valor da sequência `production_inventory_box_number_seq`. Um índice único garante exclusividade, uma restrição exige valor positivo e o gatilho `production_inventory_box_number_immutable` bloqueia mudanças.

O identificador visual não é armazenado separadamente. As RPCs retornam `box_code` calculado como `CX-` mais seis dígitos, evitando divergência entre número e texto.

```mermaid
flowchart LR
  A["ADM ou Recebimento"] --> B["Gerar código"]
  B --> C["Sequência sem reutilização"]
  C --> D["CX-000001"]
  D --> E["Salvar nova caixa"]
  E --> F["Entrada imutável"]
  F --> G["Saídas e ajustes vinculados"]
  G --> H["Saldo zero: caixa permanece no histórico"]
```

## Contratos da API

- `generate_production_inventory_box_number()` gera e audita um novo número.
- `create_production_inventory_entry_v2(...)` valida o código e cria entrada, movimentação e auditoria na mesma transação.
- `list_production_inventory_entries_v2(...)` retorna `box_number` e `box_code` nos detalhes.
- `list_production_inventory_movements_v2(...)` retorna o mesmo identificador em consultas e relatórios.

As RPCs anteriores continuam disponíveis para clientes em cache. Novas entradas criadas por elas recebem o número automaticamente pelo padrão da coluna, garantindo compatibilidade durante a atualização do PWA.

## Segurança e auditoria

- As RPCs são `security definer` com `search_path` vazio.
- A autorização reaproveita `private.can_manage_production_inventory()`.
- `anon` e `public` não recebem execução ou acesso à sequência.
- A geração e a criação produzem eventos em `audit_logs`.
- Duplicidades são impedidas no banco, inclusive sob concorrência.

## Backup e recuperação

O backup já inclui `production_inventory_entries` e `production_inventory_movements`. A restauração preserva `box_number` e omite apenas a coluna gerada `protocol`. O gerador procura o próximo número ainda não usado, portanto caixas restauradas não colidem com entradas futuras.

## Compatibilidade

A alteração não modifica pagamentos, recebimentos oficiais, matérias-primas, suprimentos, solicitações ou regras de perfis. O layout possui tratamento específico para computador, tablet e celular e respeita o isolamento já usado pelos PDFs do inventário.
