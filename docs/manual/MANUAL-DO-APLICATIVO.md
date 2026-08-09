# Manual do Harmony Store Oficial

## Acesso e perfis

- **Colaboradora:** solicita matéria-prima, edita pedidos pendentes, acompanha sua produção conferida e vê pagamentos semanais já consolidados.
- **Recebimento:** solicita suprimentos do e-commerce e registra conferências de produção, sem acesso aos valores.
- **ADM:** administra produtos, solicitações, colaboradores, recebimentos, pagamentos, fornecedores, relatórios e Saúde do Sistema.
- **ADM principal:** além das funções de ADM, protege as operações sensíveis envolvendo outros administradores.

Cada pessoa deve usar sua própria conta. Senhas temporárias precisam ser trocadas no primeiro acesso. O menu **Perfil** permite atualizar dados, foto, senha e encerrar a sessão.

## Solicitações de matéria-prima

1. Abra **Nova solicitação**.
2. Adicione um ou mais produtos e qualquer quantidade necessária.
3. Confira a lista e envie.
4. Enquanto estiver pendente, a própria solicitante pode editar ou cancelar.
5. O ADM confere a separação, pode ajustar quantidades ou remover itens, define uma única data de entrega e registra quem entregou e quem recebeu.

A colaboradora acessa somente as próprias solicitações. O ADM pode excluir definitivamente registros criados por engano quando a regra administrativa permitir.

### Check-up da separação

Cada item de uma solicitação aberta precisa terminar em uma destas situações:

- **Separado:** o item fica verde e está pronto para seguir.
- **Sem estoque:** use somente após conferir fisicamente. O estoque do produto é zerado, o item fica vermelho, a data e o ADM são registrados e uma reposição é criada automaticamente.

O botão **Finalizar separação** permanece bloqueado enquanto existir qualquer item aguardando conferência. No cadastro do produto, **Tipo de reposição** define se a falta abre uma compra de fornecedor ou uma produção interna. Em **Produtos > Conferência de estoque**, os ADMs acompanham divergências e reposições, registram a conclusão da análise e exportam os dados em Excel ou PDF.

## Produtos e fornecedores

O ADM cadastra nome, categoria, unidade, cor, quantidade, foto, tipo de reposição e campos personalizados. Também define a **finalidade operacional**: matéria-prima de produção, suprimento do e-commerce ou produção e e-commerce. Cada material pode ser vinculado ao fornecedor já cadastrado na área de Inteligência; a mesma relação é reutilizada nos relatórios e pedidos de compra.

Produtos exclusivos da embalagem devem ser classificados como **Suprimento do e-commerce**. Matérias-primas exclusivas aparecem apenas para colaboradoras de produção. Quando o mesmo produto é usado pelos dois setores, classifique como **Produção e e-commerce**: ele aparecerá nos dois catálogos usando o mesmo estoque, custo e fornecedor. Na Inteligência, o consumo compartilhado é atribuído ao setor de quem solicitou. Reclassificar não apaga estoque, fornecedor, custo, movimentações ou solicitações antigas.

## Ordens de produção

O ADM cria a ordem semanal com colaboradora, prazo, modelos, cores, quantidades, fotos e orientações. A colaboradora recebe a ordem no próprio painel e usa **Confirmar que recebi a lista** para registrar sua ciência.

Quando a confirmação ocorrer fora do aplicativo, o ADM pode abrir uma ordem enviada ou visualizada e usar **Registrar confirmação externa**. É obrigatório informar se a confirmação chegou por WhatsApp, telefone, pessoalmente ou por outro meio. O sistema registra data, horário, ADM responsável e observação, altera a ordem para **Confirmada pelo ADM** e remove a pendência do **Meu Dia na Harmony**.

Essa ação confirma somente que a colaboradora recebeu as orientações. Ela não registra produtos acabados, não altera a contagem oficial e não calcula pagamentos. O recebimento físico continua exclusivamente no módulo **Recebimento de produção**.

## Recebimento de produção

Uma coleta reúne vários itens da mesma colaboradora. Em cada item informe modelo, cor, quantidade declarada na folha e quantidade oficial conferida. A diferença fica visível e o cálculo usa sempre a quantidade oficial.

Se uma caixa misturada for localizada depois que o recebimento já foi salvo, o **ADM principal**, o **ADM normal** ou o perfil de **Recebimento** pode abrir a coleta original e usar **Reabrir e editar**. Novos modelos, cores e quantidades entram no mesmo recebimento e na mesma data. Quando a semana já estiver fechada, a colaboradora e a data permanecem bloqueadas e os totais são recalculados automaticamente. Um pagamento já marcado como realizado não pode ser alterado retroativamente; nesse caso, registre o ajuste em uma nova coleta.

O pagamento é proporcional: `quantidade oficial × R$ 2,50 ÷ 100`. Assim, qualquer quantidade é aceita; 150 unidades resultam em R$ 3,75. A semana vai de segunda-feira a domingo.

Colaboradoras não veem valores ainda em conferência em **Minha produção**. Depois do fechamento, consultam o pagamento em **Meus pagamentos**.

## Inventário de Produção

O **Inventário de Produção** controla exclusivamente mini sabonetes acabados que ficam no estoque interno. Ele reutiliza os modelos, as fotos e as cores já cadastrados no módulo de Produção; não cadastre novamente esses itens e não use o catálogo de matérias-primas ou de suprimentos internos.

O acesso é permitido somente a **ADM principal**, **ADM normal** e **Recebimento**. Colaboradoras de produção não visualizam o menu, o botão da tela inicial, saldos, lotes ou relatórios.

### Registrar uma nova caixa

1. Abra **Inventário de Produção** pelo menu ou pelo botão de acesso rápido da tela inicial.
2. Toque em **Registrar nova caixa**.
3. Toque em **Gerar código**. O sistema reserva automaticamente um identificador no padrão `CX-000001`.
4. Selecione o modelo, a cor e a colaboradora de produção já cadastrados.
5. Informe a quantidade inteira, a data de entrada e, se desejar, a localização física, como **Prateleira A**.
6. Revise a foto, o código e salve.

Cada cadastro representa uma única caixa física. O código é exclusivo e permanente: não pode ser repetido, editado ou reutilizado, mesmo depois que o saldo chegar a zero. Se um código for gerado e o cadastro for cancelado, ele também não volta à fila. Isso preserva a rastreabilidade e evita localizar duas caixas diferentes pelo mesmo número.

A tela **Saldo atual** apresenta somente foto, modelo, cor e quantidade e mantém os modelos em ordem alfabética.

### Registrar saída e preservar a origem

Abra o modelo e a cor desejados. A tela detalhada mostra quanto cada colaboradora produziu e todas as caixas vinculadas. Escolha o código da caixa que realmente será retirado, informe a quantidade e o motivo. Uma saída parcial mantém o restante na mesma caixa; uma caixa zerada continua no histórico como **Esvaziada**.

### Corrigir uma conferência

Use **Ajustar contagem** somente após contar fisicamente a caixa. Informe o saldo encontrado e o motivo obrigatório. O sistema cria uma movimentação positiva ou negativa, registra data e responsável e nunca apaga o saldo anterior. Para corrigir apenas colaboradora, data, localização física ou observação, use **Editar dados**. O código permanente não é editável.

### Consultas e relatórios

- **Saldo atual:** posição física por modelo e cor.
- **Movimentações:** entradas, saídas e ajustes por período.
- **Por colaboradora:** modelos, cores e quantidades produzidas, sem valores financeiros.
- **PDF:** relatório isolado e ajustado para A4 em computador, celular e tablet.

O Inventário não calcula pagamentos, não modifica o recebimento oficial da produção e não movimenta matérias-primas. Uma integração automática com recebimentos poderá ser adicionada futuramente sem trocar o modelo de dados atual.

## Relatórios e inteligência

O ADM filtra dados por colaboradora, produto/modelo, cor, semana, mês ou ano. Relatórios de consumo usam materiais efetivamente entregues, e relatórios de produção usam quantidades oficiais. Os demonstrativos semanais podem ser gerados em PDF para conferência e pagamento.

## Suprimentos e compras internas

O menu **Suprimentos e Compras** é exclusivo dos perfis ADM e Recebimento. Ele controla itens usados pela operação do e-commerce, como café, papel higiênico e produtos de limpeza, sem misturá-los com a matéria-prima das artesãs.

## Boletos

O menu **Boletos** é exclusivo dos ADMs. Um boleto pode ser cadastrado manualmente ou enviado como foto/PDF para leitura inteligente.

Antes de salvar, confira obrigatoriamente beneficiário, valor, vencimento e todos os números da linha digitável. A automação apenas preenche uma sugestão e não realiza pagamentos.

Use **Copiar código para pagar** e, no aplicativo do banco, confira novamente beneficiário e valor antes de confirmar. Depois do pagamento, use **Marcar como pago** e anexe o comprovante se desejar.

Boletos que vencem amanhã, vencem hoje ou estão atrasados aparecem no “Meu dia na Harmony”. Boletos pagos deixam de gerar alerta automaticamente.

1. O perfil de Recebimento abre **Solicitar** e marca somente quais itens estão faltando. Não informa quantidade nem valor.
2. O ADM abre a solicitação depois da compra e seleciona **Anexar cupom da compra**.
3. A foto é armazenada de forma privada. A leitura inteligente preenche estabelecimento, data, itens, quantidades e valores para conferência administrativa.
4. Nada é confirmado automaticamente: o ADM revisa, corrige, vincula cada linha ao catálogo e só então salva.
5. Se o cupom contiver um item novo, o ADM pode mantê-lo como **Criar novo produto automaticamente**.
6. Uma compra que não nasceu de pedido é registrada em **Compras e cupons > Registrar compra direta**. Ela entra nos dados sem criar uma solicitação fictícia.

Solicitações ficam como **Aguardando compra**, **Compra parcial** ou **Compra concluída** conforme os produtos encontrados nos cupons vinculados. Somente ADMs veem fotos, fornecedores, preços e relatórios financeiros; Recebimento continua sem acesso a valores.

Em **Relatórios**, o período selecionado mostra quantidade comprada, valor gasto, consumo vindo de solicitações, estoque e evolução do preço unitário. Para cada item são exibidos preço anterior, preço atual, aumento ou redução em reais e porcentagem, preço médio, menor e maior preço. A exportação para Excel inclui os mesmos campos.

### Ideias e Evolução

Somente administradores acessam esta aba. Registre a melhoria com título, área, prioridade, descrição, problema observado e, se necessário, uma imagem privada de apoio. O sistema mantém o histórico de criação e alterações; ideias que não serão executadas devem receber o status **Descartada**, preservando a rastreabilidade.

O botão **Preparar para o Codex** transforma a ideia em uma solicitação organizada que pede análise de impacto nas funcionalidades existentes, segurança, banco de dados, experiência no celular, riscos e um plano antes da implementação. O texto é copiado para a área de transferência e pode ser colado nesta tarefa do Codex. Nenhuma mudança é aplicada automaticamente apenas por preparar o texto.

## Notificações e instalação

O app pode ser instalado pelo navegador no Android e iPhone. Notificações avisam os ADMs quando há nova solicitação ou alteração e avisam a colaboradora quando o status muda. Se o app já estiver instalado, o navegador normalmente deixa de exibir novamente o convite de instalação.

### Central de Notificações

Todas as usuárias possuem **Notificações** no menu. Avisos ainda não abertos aparecem com contador e também ganham destaque na tela inicial. Ao abrir um aviso, a leitura fica confirmada no sistema; o botão **Marcar todas como lidas** organiza avisos antigos.

Somente o ADM principal pode criar comunicados:

1. Em **Colaboradoras**, use **Notificar** no cadastro para um aviso individual.
2. Use **Aviso global** para alcançar todas as colaboradoras ativas de produção e recebimento.
3. Escolha um modelo rápido ou escreva título e mensagem, defina a prioridade e, quando necessário, informe o prazo.
4. Revise a prévia e envie. O aviso fica salvo imediatamente no aplicativo e o push é encaminhado aos aparelhos que ativaram a permissão.

Avisos urgentes devem ser usados apenas para prazos ou mudanças que exigem ação rápida. Mesmo sem permissão de push ou com o celular offline, a mensagem interna continuará disponível no próximo acesso.

## Ajuda e suporte

Use o botão **Ajuda** dentro de cada tela para instruções rápidas. O menu **Central de ajuda** permite pesquisar todos os módulos. Se algo falhar, informe ao ADM qual tela estava aberta e o horário aproximado; não envie senhas nem códigos secretos.
