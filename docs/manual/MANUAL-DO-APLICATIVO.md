# Manual do Harmony Store Oficial

## Acesso e perfis

- **Colaboradora:** solicita matéria-prima, edita pedidos pendentes, acompanha sua produção conferida e vê pagamentos semanais já consolidados.
- **Recebimento:** possui as funções da colaboradora e registra conferências de produção, sem acesso aos valores.
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

## Produtos e fornecedores

O ADM cadastra nome, categoria, unidade, cor, quantidade, foto e campos personalizados. Campos podem ser adicionados, removidos ou adaptados ao tipo de produto. Cada matéria-prima pode ser vinculada ao fornecedor já cadastrado na área de Inteligência; a mesma relação é reutilizada nos relatórios e pedidos de compra.

Produtos usados apenas na embalagem do e-commerce podem continuar ativos sem poluir o catálogo das artesãs. No cadastro ou na edição, marque **Ocultar para colaboradoras de produção**. O item continuará visível e administrável pelo ADM principal, demais ADMs e colaboradoras de recebimento, mas deixará de aparecer em novas solicitações do perfil comum de colaboradora. A opção não apaga estoque, fornecedor, relatórios nem solicitações antigas.

## Recebimento de produção

Uma coleta reúne vários itens da mesma colaboradora. Em cada item informe modelo, cor, quantidade declarada na folha e quantidade oficial conferida. A diferença fica visível e o cálculo usa sempre a quantidade oficial.

Se uma caixa misturada for localizada depois que o recebimento já foi salvo, o **ADM principal**, o **ADM normal** ou o perfil de **Recebimento** pode abrir a coleta original e usar **Reabrir e editar**. Novos modelos, cores e quantidades entram no mesmo recebimento e na mesma data. Quando a semana já estiver fechada, a colaboradora e a data permanecem bloqueadas e os totais são recalculados automaticamente. Um pagamento já marcado como realizado não pode ser alterado retroativamente; nesse caso, registre o ajuste em uma nova coleta.

O pagamento é proporcional: `quantidade oficial × R$ 2,50 ÷ 100`. Assim, qualquer quantidade é aceita; 150 unidades resultam em R$ 3,75. A semana vai de segunda-feira a domingo.

Colaboradoras não veem valores ainda em conferência em **Minha produção**. Depois do fechamento, consultam o pagamento em **Meus pagamentos**.

## Relatórios e inteligência

O ADM filtra dados por colaboradora, produto/modelo, cor, semana, mês ou ano. Relatórios de consumo usam materiais efetivamente entregues, e relatórios de produção usam quantidades oficiais. Os demonstrativos semanais podem ser gerados em PDF para conferência e pagamento.

## Suprimentos e compras internas

O menu **Suprimentos e Compras** é exclusivo dos perfis ADM e Recebimento. Ele controla itens usados pela operação do e-commerce, como café, papel higiênico e produtos de limpeza, sem misturá-los com a matéria-prima das artesãs.

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
