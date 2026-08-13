# Planejamento de Envios - Especificacao viva

> Status: implementacao concluida localmente na versao 25.79; aguardando validacao final e publicacao.
>
> Objetivo: registrar todas as decisoes do modulo antes da implementacao, evitando perda de contexto, divergencias e retrabalho.

## 1. Objetivo do modulo

Criar um modulo chamado **Planejamento de envios** para dar a gerente de e-commerce visibilidade antecipada dos envios, permitindo organizar kits, caixas, produtos, prazos e microtarefas com poucos cliques.

O modulo deve ter linguagem visual compativel com o aplicativo Harmony Store atual, ser rapido e funcionar corretamente em computador, tablet e celular.

## 2. Acesso e responsabilidade

- Perfil operacional previsto: **Gerente de e-commerce**.
- A coluna visivel **Responsavel** foi removida, pois existe uma unica responsavel operacional pelo modulo.
- O sistema deve registrar automaticamente, para auditoria, o usuario e o horario de criacao, edicao, conclusao e mudanca de etapa.
- Decisao aprovada: a gerente de e-commerce possui acesso operacional exclusivo e o ADM Principal mantem acesso excepcional para auditoria e contingencia. Os demais ADMs e perfis nao recebem acesso automaticamente.

## 3. Estrutura principal

O modulo tera organizacao semelhante a um quadro Trello, com cartoes distribuidos entre etapas:

1. **Proximos envios**
2. **Em preparacao**
3. **Em conferencia**
4. **Prontos para coleta**

O quadro deve ser limpo, compacto e priorizar os envios futuros.

## 4. Capa do cartao

Cada cartao deve apresentar somente as informacoes essenciais:

- Logotipo da plataforma.
- Nome do plano de envio.
- Plataforma.
- Conta utilizada na plataforma.
- Data e horario previstos.
- Quantidade total de kits.
- Quantidade total de caixas.
- Quantidade total calculada de unidades.
- Percentual de conclusao.
- Barra visual de progresso.
- Indicacao de prazo proximo ou necessidade de atencao.

Exemplo:

```text
[LOGO MERCADO LIVRE]
Envio Mercado Livre - Cha de Bebe
12/08/2026 - 16:00
Conta Harmony Principal

64 kits - 6 caixas - 5.900 unidades
25% concluido
```

## 5. Plataformas e logotipos

- O usuario nao deve enviar uma imagem de logotipo em cada cartao.
- A plataforma sera escolhida em um campo padronizado.
- Ao selecionar a plataforma, o sistema aplicara automaticamente a logotipo correspondente:
  - na capa do cartao;
  - no cabecalho do plano aberto;
  - na versao de impressao/PDF, quando fizer sentido.
- Plataformas iniciais confirmadas:
  - Mercado Livre;
  - Shopee.
- Deve existir uma opcao generica para outras plataformas.
- A estrutura deve permitir Amazon, Correios, site proprio e outras integracoes futuras.
- Os arquivos visuais devem ficar compactados no proprio aplicativo para nao depender de links externos.
- O banco deve salvar o codigo da plataforma, nao uma copia da imagem em cada envio.

## 6. Abertura do cartao

Ao clicar em qualquer area do cartao, o sistema abrira um **Plano de Envio Digital**.

Esse plano sera inspirado na organizacao visual do PDF de preparacao do Mercado Livre, mas sem codigos, textos repetitivos ou instrucoes que nao fazem parte da rotina da Harmony.

No computador, o plano podera abrir em um painel amplo lateral ou em uma pagina dedicada. No celular e tablet, deve abrir em blocos verticais responsivos, sem tabela cortada e sem rolagem horizontal desnecessaria.

## 7. Cabecalho do plano aberto

O cabecalho deve mostrar:

- Logotipo e nome da plataforma.
- Numero interno do plano.
- Nome do envio.
- Conta da plataforma.
- Data e horario.
- Total de kits.
- Total de caixas.
- Total calculado de unidades.
- Status atual.
- Barra e percentual de progresso.
- Observacoes gerais do envio.

## 8. Lista de produtos

A lista nao tera a coluna **Responsavel**.

Ordem definida dos campos:

1. **Concluido**
2. **Anuncio**
3. **Produto com foto**
4. **Cor**
5. **Volumes**
6. **Total calculado**
7. **Observacao**

Exemplo:

| Concluido | Anuncio | Produto | Cor | Volumes | Total | Observacao |
| --- | ---: | --- | --- | ---: | ---: | --- |
| Sim | 100 un. | Mini Sabonete Coracao 2g | Rosa BB | 30 kits | 3.000 un. | Separar por kit |
| Nao | 50 un. | Mini Sabonete Ursinho | Azul BB | 24 kits | 1.200 un. | Conferir acabamento |
| Nao | 200 un. | Mini Sabonete Rosinhas 3g | Lilas | 6 caixas | 1.200 un. | Usar caixa reforcada |
| Nao | 50 un. | Berco personalizado | Azul candy | 10 kits | 500 un. | Exclusivo deste envio |

### 8.1 Fotos na lista de tarefas

- Cada produto deve aparecer com uma miniatura visual ao lado do nome.
- Para produtos do catalogo de producao, a imagem deve ser consumida automaticamente do cadastro ja existente.
- A foto nao deve ser duplicada no banco nem enviada novamente ao criar um plano.
- Quando a foto original do produto for atualizada, os planos devem passar a exibir a imagem atualizada automaticamente.
- A miniatura deve ser compacta, nitida e manter a lista legivel em computador, tablet e celular.
- Quando um produto do catalogo ainda nao possuir foto, o sistema deve exibir o placeholder visual padrao da Harmony sem quebrar o alinhamento da lista.
- Para produtos exclusivos do envio, deve existir a possibilidade de adicionar uma foto opcional vinculada somente aquele item/plano, sem criar um novo produto no catalogo principal.
- A foto e o nome devem permanecer visiveis na tela de preparacao e na visualizacao do plano. A inclusao das fotos no PDF sera definida na etapa de desenho do modelo de impressao, considerando espaco e quantidade de itens.

## 9. Fluxo de cadastro de cada item

O preenchimento deve seguir esta ordem:

```text
Quantidade do anuncio
  -> Produto
  -> Cor
  -> Quantidade de volumes
  -> Tipo do volume: caixa ou kit
  -> Total calculado
  -> Observacao
```

Exemplo de calculo:

```text
100 unidades por anuncio x 30 kits = 3.000 unidades planejadas
```

### 9.1 Anuncio

- O campo **Anuncio** representa a quantidade de unidades contida naquela apresentacao comercial.
- Sugestoes iniciais: 50, 100 e 200 unidades.
- Deve existir opcao de quantidade personalizada.

### 9.2 Volumes

- A gerente informa uma quantidade numerica.
- O tipo do volume deve ser selecionado entre **Caixa** e **Kit**.
- Kits e caixas sao informacoes diferentes e devem permanecer separadas nos totais.

### 9.3 Total automatico

- O total de unidades nao deve ser digitado manualmente.
- O sistema deve calcular automaticamente `unidades por anuncio x quantidade de volumes`.
- O total deve aparecer na linha, no cabecalho e no cartao.

## 10. Reutilizacao do cadastro existente

- O campo **Produto** deve consumir automaticamente o cadastro de modelos ja utilizado no modulo de solicitacao/ordem de producao.
- O modulo nao deve criar uma segunda copia dos produtos existentes.
- Nome, fotografia e demais informacoes reutilizaveis devem vir do cadastro principal.
- A lista deve atualizar automaticamente quando um produto novo for cadastrado no catalogo de producao.
- Produtos normais podem receber a identificacao discreta **Cadastro da producao**.

## 11. Produtos exclusivos do envio

- A gerente pode criar um item que nao existe no cadastro principal.
- Esse item sera usado apenas em kits ou preparacoes especificas daquele envio.
- O item deve receber a identificacao **Exclusivo deste envio**.
- Ele nao deve ser incluido automaticamente no cadastro principal de produtos.
- Um item exclusivo nao pode exibir simultaneamente a identificacao **Cadastro da producao**.

## 12. Conclusao e progresso

- Cada linha tera um checkbox.
- Quando marcada, a linha deve receber destaque verde discreto.
- O sistema deve recalcular imediatamente:
  - quantidade de itens concluidos;
  - percentual de conclusao;
  - barra de progresso do plano aberto;
  - barra de progresso do cartao externo.
- O progresso deve ser consistente com a quantidade real de itens marcados.
- Nenhum item deve ser esquecido ao finalizar o envio.

## 13. Acoes previstas

Dentro do plano:

- Adicionar produto.
- Adicionar produto exclusivo.
- Editar item.
- Remover item.
- Salvar plano.
- Gerar PDF.
- Imprimir.
- Mover para preparacao.
- Mover para conferencia.
- Marcar como pronto para coleta.
- Finalizar/arquivar envio.

As acoes disponiveis devem variar de acordo com a etapa, evitando botoes desnecessarios.

## 14. PDF e impressao

- O plano digital continuara sendo a tela principal e interativa.
- A opcao **Gerar PDF** criara uma versao limpa, sem menus, campos de edicao ou botoes.
- O PDF deve ser ajustado para A4 e funcionar em computador, tablet e celular.
- Deve conter apenas as informacoes do envio aberto.
- O PDF nao pode capturar a tela inteira do aplicativo.

## 15. Usabilidade

- Minimo de cliques.
- Cartoes compactos.
- Hierarquia visual clara.
- Texto legivel.
- Sem excesso de cores ou emojis.
- Identidade Harmony preservada: candy colors, rosa, azul claro, branco e detalhes dourados discretos.
- Logotipos das plataformas ajudam na identificacao rapida sem poluir a tela.
- A experiencia deve ser consistente em computador, tablet e celular.

## 16. Arquitetura futura

O codigo devera ser modular e preparado para:

- novas plataformas;
- modelos recorrentes de planos de envio;
- integracoes com APIs de marketplaces;
- historico e auditoria completos;
- alertas de prazo;
- notificacoes;
- filtros por plataforma, conta, periodo e status;
- relatorios de kits, caixas e produtos enviados.

Essas expansoes nao devem ser implementadas automaticamente se aumentarem a complexidade atual. A arquitetura apenas deve permitir sua inclusao futura.

## 17. Estado atual da decisao

- Direcao visual: em analise conjunta.
- Imagem de referencia do quadro e do plano aberto: criada, ainda nao implementada.
- Implementacao no aplicativo oficial: **nao iniciada**.
- Banco de dados: **nao alterado**.
- Permissoes: **nao alteradas**.
- Publicacao: **nenhuma alteracao publicada**.

## 18. Registro das decisoes

### 12/08/2026

- Definido o nome **Planejamento de envios**.
- Definido o quadro em estilo Trello.
- Definida a abertura do cartao em modo de Plano de Envio Digital inspirado no PDF do Mercado Livre.
- Removida a coluna **Responsavel**.
- Adicionado o campo **Anuncio** para registrar unidades por apresentacao.
- Definido o fluxo anuncio -> produto -> cor -> caixas/kits -> total automatico -> observacao.
- Confirmada a reutilizacao do cadastro existente de produtos da producao.
- Mantida a possibilidade de produtos exclusivos do envio.
- Confirmados logotipos automaticos para Mercado Livre e Shopee na capa e no plano aberto.
- Confirmada a exibicao de miniaturas dos produtos na lista de tarefas, reutilizando automaticamente as fotos ja cadastradas no catalogo de producao.
- Definida foto opcional e exclusiva para itens criados somente dentro de um plano de envio.
