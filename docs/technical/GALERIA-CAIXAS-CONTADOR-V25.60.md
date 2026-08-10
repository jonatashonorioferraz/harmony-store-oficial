# Galeria de caixas e contador ao vivo — v25.60

## Objetivo

Disponibilizar uma visão operacional das caixas físicas ainda presentes no Inventário de Produção e um contador consistente em todas as telas do módulo.

## Fonte dos dados

- `list_available_production_inventory_boxes()` retorna somente registros com `current_quantity > 0` e `transferred_at is null`.
- A ordenação usa `box_number desc`, mantendo a última caixa cadastrada no início.
- `get_production_inventory_available_box_count()` calcula a quantidade diretamente no banco.
- Ambas as funções usam `security definer`, validam `private.can_manage_production_inventory()` e são concedidas apenas a `authenticated` e `service_role`.

## Interface

- A aba `boxes` desenha uma caixa de papelão por registro físico.
- A imagem vem de `finished_product_models.image_path`, pelo mesmo Storage já usado no catálogo oficial.
- Os cartões têm alturas e áreas de texto fixas para evitar desalinhamento entre nomes diferentes.
- A grade usa três colunas em telas amplas, duas em tablet e uma em celular.
- O botão de transferência usa o rosa principal da Harmony; verde permanece reservado para disponibilidade e sucesso.

## Sincronização

O carregamento inicial consulta a lista e o contador. Depois disso, uma verificação leve do contador ocorre a cada 20 segundos enquanto o módulo permanece aberto. A transferência feita no próprio aparelho atualiza a lista e o contador imediatamente, sem aguardar o próximo ciclo.

No mesmo ciclo, o aplicativo sincroniza os catálogos oficiais de modelos, cores e colaboradoras. Se a janela de cadastro de caixa estiver aberta, as opções são renovadas e qualquer seleção ainda válida é preservada.

## Compatibilidade

Nenhuma regra de pagamento, recebimento, matéria-prima ou estoque de solicitações foi alterada. A transferência continua integral e transacional no banco.
