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

### Estoque individual por colaboradora

Use esta opção somente para materiais personalizados que não podem ser compartilhados, como etiquetas impressas com o nome de cada colaboradora.

1. Abra **Produtos e estoque** e edite o produto.
2. Em **Controle do estoque**, escolha **Individual por colaboradora**. Para fazer a primeira ativação, o saldo compartilhado físico e reservado precisa estar zerado.
3. Salve o produto e use **Gerenciar estoques**.
4. Informe o estoque físico contado e o estoque mínimo de cada colaboradora. O campo reservado é calculado pelo sistema e não deve ser alterado manualmente.
5. Informe o motivo da entrada ou do ajuste e salve.

Na solicitação, cada colaboradora vê somente o próprio saldo. A mensagem **Sem estoque para você** não revela o estoque das demais. O ADM vê o total e pode abrir os saldos individuais. Ao separar, entregar, cancelar ou corrigir uma solicitação, o sistema usa a colaboradora identificada no item e nunca desconta o material personalizado de outra pessoa.

Ao usar **Sem estoque** durante a separação, somente o saldo daquela colaboradora é zerado. A divergência e a reposição automática também recebem o nome dela. Produtos comuns devem continuar como **Compartilhado entre os perfis**.

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
6. Use **Salvar pré-cadastro** para continuar depois ou **Gerar etiqueta 150 × 100** para abrir a identificação imediatamente.
7. Na prévia, use **Gerar PDF 150 × 100** para baixar um documento real de uma única página, já configurado em paisagem no tamanho físico da etiqueta. Abra o PDF baixado para imprimir, sem alterar a escala. Não imprima o PNG diretamente pela tela do Gmail, pois o serviço acrescenta cabeçalhos, rodapés e margens que podem criar uma segunda página.
8. Use **Baixar PNG** somente quando o aplicativo próprio da impressora pedir uma imagem. O PNG possui 1200 × 800 px, usa o logotipo oficial e inclui uma miniatura térmica do produto em alto contraste.
9. Cole a etiqueta na caixa física e somente então toque em **Confirmar etiqueta aplicada**.

O pré-cadastro reserva o código, porém mantém a quantidade fora do saldo e do contador. Se o aplicativo for fechado ou a impressão falhar, abra novamente o módulo e retome a caixa no quadro **Etiquetas pendentes**. O saldo só é liberado pela confirmação física. Se o pré-cadastro for cancelado, o motivo, a data e o responsável ficam auditados e o código não volta à fila.

Cada cadastro representa uma única caixa física. A numeração continua exatamente a sequência que já existia antes desta função; nada é zerado ou reiniciado. O código é exclusivo e permanente: não pode ser repetido, editado ou reutilizado, mesmo depois que o saldo chegar a zero.

O QR Code leva a um identificador opaco da caixa. Ao escanear, o aplicativo continua exigindo login e permite a consulta somente a **ADM** ou **Recebimento**. Nenhum nome, quantidade ou dado da colaboradora é colocado diretamente no endereço do QR Code.

### Gerar novamente uma etiqueta existente

Para substituir uma etiqueta danificada ou identificar uma caixa cadastrada antes do sistema de etiquetas:

1. Abra **Inventário de Produção** e permaneça em **Saldo atual**.
2. Entre nos detalhes do modelo e da cor.
3. Localize a caixa disponível pelo código permanente e toque em **Gerar / reimprimir etiqueta**.
4. Selecione o motivo. Em **Outro motivo**, escreva uma explicação curta.
5. Gere o PDF, PNG ou use a impressão direta.

A nova via preserva o mesmo código `CX-NNNNNN`, o mesmo QR Code e os dados da caixa. Ela não cria outra caixa, não modifica a quantidade e não registra entrada ou saída de estoque. O motivo, o formato, a pessoa responsável e o horário ficam na auditoria. A opção aparece somente enquanto a caixa estiver disponível no estoque.

A tela **Saldo atual** apresenta somente foto, modelo, cor e quantidade e mantém os modelos em ordem alfabética.

### Visualizar as caixas disponíveis

A aba **Caixas em estoque** representa cada caixa física em um desenho de papelão com a placa do código permanente, a foto original do modelo, a cor, a quantidade, a colaboradora e a data de entrada. A ordenação é sempre da caixa mais nova para a mais antiga.

O contador verde no topo aparece em todas as telas do módulo e considera somente caixas com saldo disponível e ainda não transferidas. Ele diminui imediatamente após uma transferência feita no aparelho atual e também se sincroniza automaticamente quando outro ADM ou Recebimento movimenta uma caixa em outro dispositivo.

Os modelos, as cores e as colaboradoras vêm dos cadastros oficiais do aplicativo. Novos cadastros são sincronizados automaticamente, inclusive na janela **Registrar nova caixa**, sem criar listas paralelas.

### Transferir uma caixa para o estoque do e-commerce

Abra a aba **Caixas em estoque** e toque no botão rosa **Transferir caixa** da caixa física escolhida. Também é possível abrir o modelo e a cor em **Saldo atual** e transferir pelo histórico detalhado.

Não é necessário digitar quantidade: o sistema mostra e utiliza automaticamente todo o saldo conferido da caixa. Revise código, modelo, cor, quantidade, destino e data antes de confirmar. Retiradas parciais são bloqueadas também no banco de dados, inclusive se alguém tentar usar uma versão antiga do aplicativo.

Depois da confirmação, o saldo da caixa fica zerado e ela permanece no histórico como **Transferida ao e-commerce**, com data e responsável. Essa transferência registra o destino físico; ela não cria um segundo estoque de produtos acabados nem altera o estoque de matérias-primas.

### Corrigir uma conferência

Use **Ajustar contagem** somente após contar fisicamente a caixa e antes de transferi-la. Informe o saldo encontrado e o motivo obrigatório. O sistema cria uma movimentação positiva ou negativa, registra data e responsável e nunca apaga o saldo anterior. Depois da transferência, ajustes de quantidade ficam bloqueados para preservar a história da caixa. Para corrigir apenas colaboradora, data, localização física ou observação, use **Editar dados**. O código permanente não é editável.

### Consultas e relatórios

- **Saldo atual:** posição física por modelo e cor.
- **Caixas em estoque:** galeria visual das caixas disponíveis, com as mais recentes primeiro.
- **Movimentações:** entradas, saídas e ajustes por período.
- **Por colaboradora:** modelos, cores e quantidades produzidas, sem valores financeiros.
- **PDF:** relatório isolado e ajustado para A4 em computador, celular e tablet.

O Inventário não calcula pagamentos, não modifica o recebimento oficial da produção e não movimenta matérias-primas. Uma integração automática com recebimentos poderá ser adicionada futuramente sem trocar o modelo de dados atual.

## Relatórios e inteligência

O ADM filtra dados por colaboradora, produto/modelo, cor, semana, mês ou ano. Relatórios de consumo usam materiais efetivamente entregues, e relatórios de produção usam quantidades oficiais. Os demonstrativos semanais podem ser gerados em PDF para conferência e pagamento.

### Central de Inteligência e Inventário com IA

A área **Inteligência** é exclusiva dos ADMs e foi organizada em quatro entradas principais para evitar informações repetidas:

- **Painel inteligente:** estatísticas ao vivo, gráficos reais do Inventário de Produção, insights e histórico do GPT-5.6 Terra.
- **Operação:** resumo, matérias-primas, e-commerce, colaboradoras, planejado × recebido e qualidade dos dados, escolhidos em um seletor interno.
- **Compras e parceiros:** pedidos de compra, fornecedores e planejamento de reposição.
- **Ideias e evolução:** registro e acompanhamento das propostas de melhoria.

Os relatórios antigos não foram apagados. Eles continuam disponíveis nas áreas internas, com os mesmos filtros, exportações e regras; somente deixaram de competir visualmente com o painel executivo.

- Os saldos, quantidades, datas, entradas, transferências, ajustes e ordens são calculados pelo Supabase. A IA não faz contas livres nem consulta o banco diretamente.
- A análise prioriza risco estimado de falta por modelo e cor, caixas antigas, excesso de estoque, dados sem localização, ajustes frequentes, fluxo de entradas e saídas e concentração por colaboradora.
- Abra **Por que a IA sugeriu isso?** para conferir os números usados como evidência. Projeções aparecem identificadas como estimativas.
- Use **Marcar como conferido** depois da verificação humana. O histórico guarda análise, modelo, custo estimado, data e responsável.
- A IA somente recomenda. Ela nunca altera estoque, transfere caixas, cria ordens, muda pagamentos ou edita cadastros.
- Abrir a página e consultar análises anteriores não gera nova cobrança. Nesta versão, o uso da API ocorre somente quando um ADM confirma **Analisar agora com IA**.
- O ADM principal controla habilitação, intervalo manual e orçamento mensal. O padrão inicial é **US$ 5 por mês**; ao atingir o limite, a IA pausa e todos os indicadores e relatórios tradicionais continuam funcionando.

O painel atual é automático e não possui campo de perguntas ou perguntas programadas. A intenção é apresentar prioridades úteis sem acrescentar uma tarefa manual à rotina.

O agendamento periódico está tecnicamente preparado, mas não foi ativado nesta versão porque a função foi publicada mantendo a verificação JWT padrão do Supabase. Isso evita reduzir uma camada de segurança sem autorização específica.

## Suprimentos e compras internas

O menu **Suprimentos e Compras** é exclusivo dos perfis ADM e Recebimento. Ele controla itens usados pela operação do e-commerce, como café, papel higiênico e produtos de limpeza, sem misturá-los com a matéria-prima das artesãs.

## Boletos

O menu **Boletos** é exclusivo dos ADMs. Um boleto pode ser cadastrado manualmente ou enviado como foto/PDF para leitura inteligente.

Depois de selecionar o arquivo, a barra de progresso acompanha **Envio**, **Leitura** e **Conferência**. O percentual da interpretação é estimado porque o serviço de inteligência não transmite um percentual interno; por segurança, ele não chega a 100% antes de a resposta ser recebida. Se ocorrer uma falha, o documento continua selecionado para uma nova tentativa ou substituição.

Antes de salvar, confira obrigatoriamente beneficiário, valor, vencimento e todos os números da linha digitável. A automação apenas preenche uma sugestão e não realiza pagamentos.

Use **Copiar código para pagar** e, no aplicativo do banco, confira novamente beneficiário e valor antes de confirmar. Depois do pagamento, use **Marcar como pago** e anexe o comprovante se desejar.

Boletos que vencem amanhã, vencem hoje ou estão atrasados aparecem no “Meu dia na Harmony”. Boletos pagos deixam de gerar alerta automaticamente.

1. O perfil de Recebimento abre **Solicitar** e marca somente quais itens estão faltando. Não informa quantidade nem valor.
2. O ADM abre a solicitação depois da compra e seleciona **Anexar cupom da compra**.
3. A foto é armazenada de forma privada. A leitura inteligente preenche estabelecimento, data, itens, quantidades e valores para conferência administrativa.
   Durante o processamento, a tela mostra as etapas de envio, preparação, leitura e conferência. Em caso de falha, a mesma imagem permanece selecionada e o envio incompleto é removido do armazenamento privado.
4. Nada é confirmado automaticamente: o ADM revisa, corrige, vincula cada linha ao catálogo e só então salva.
5. Se o cupom contiver um item novo, o ADM pode mantê-lo como **Criar novo produto automaticamente**.
6. Uma compra que não nasceu de pedido é registrada em **Compras e cupons > Registrar compra direta**. Ela entra nos dados sem criar uma solicitação fictícia.
7. Se o mercado usar uma descrição diferente e o item continuar como **Aguardando compra**, abra a solicitação e selecione **Vincular item do cupom**. Escolha a linha correta, registre o motivo e confirme. A descrição original e o produto efetivamente comprado permanecem preservados; o vínculo apenas comprova que a compra atende ao pedido.
8. Para desfazer uma associação manual, selecione **Revisar vínculo > Remover vínculo** e informe o motivo. O status é recalculado sem apagar o cupom ou seu histórico.

Solicitações ficam como **Aguardando compra**, **Compra parcial** ou **Compra concluída** conforme os produtos encontrados nos cupons vinculados. Somente ADMs veem fotos, fornecedores, preços e relatórios financeiros; Recebimento continua sem acesso a valores.

Na tela inicial, ADMs possuem os atalhos **Registrar compra direta com IA** e **Cadastrar boleto com IA**, que abrem diretamente a captura e a revisão obrigatória. ADM e Recebimento também possuem o atalho **Inventário de Produção**. Os atalhos não ampliam permissões: apenas reduzem o número de toques até funções já autorizadas para cada perfil.

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
## Agenda Harmony (somente ADMs)

A Agenda Harmony é a secretária administrativa do aplicativo. Ela reúne suas tarefas e as datas que já existem em boletos, solicitações, ordens de produção, compras internas e inventário.

Na página inicial administrativa, a **Central de pendências** é o único painel que lista solicitações abertas de matéria-prima, materiais do e-commerce e suprimentos. Logo abaixo, a **Agenda inteligente** apresenta um calendário aberto dos próximos sete dias somente com tarefas planejadas, compromissos e boletos; datas sem atividade continuam visíveis como **Sem compromissos**. Toque em uma data para abrir a Agenda completa já filtrada naquele dia. A faixa **Inteligência do dia** mostra no máximo três orientações úteis sem repetir as solicitações da Central. A lista **Solicitações recentes** continua disponível com filtros por período e situação.

1. Abra **Agenda Harmony** no menu administrativo.
2. Use **Nova tarefa** para registrar um compromisso, prazo, prioridade, lembrete e lista de verificação.
3. Se preferir, escreva uma anotação e toque em **Organizar anotação com IA**. Revise todos os campos antes de salvar.
4. Nas ordens de produção, use **Concluir na Agenda** quando o acompanhamento já tiver sido resolvido. A ordem original e seu histórico permanecem intactos no módulo de produção.
5. Para consultar ou desfazer essa ação, selecione **Ordens concluídas na Agenda** e toque em **Reabrir na Agenda**.
6. Clique em um item de boleto, solicitação, ordem ou compra para abrir o módulo oficial e concluir a operação ali.
7. Use **Analisar meu dia com IA** somente quando desejar um resumo executivo; abrir o calendário não gera custo.
8. O ADM principal pode abrir **Configurar limite da IA** para ativar ou pausar análises e definir o orçamento mensal. O padrão da Agenda é **US$ 2 por mês**.

A ação **Concluir na Agenda** não confirma entrega, recebimento ou pagamento. A IA nunca paga boletos, altera estoque, conclui solicitações ou modifica ordens. Os lembretes exigem notificações ativas no aparelho. Colaboradoras e Recebimento não visualizam este módulo.

## Planejamento de envios

O módulo **Planejamento de envios** organiza antecipadamente os envios do e-commerce. Ele é exibido somente para a pessoa marcada como **Gerente de e-commerce** e para o ADM principal em situações de contingência e auditoria. Essa permissão é concedida pelo ADM principal no cadastro da pessoa e não altera as outras permissões do perfil.

1. Use **Novo plano** e informe nome, plataforma, conta, data, horário e orientações gerais.
2. Marque **Envio na modalidade FULL** quando necessário. Mercado Livre e Shopee recebem identificação visual própria.
3. Use **Produto do catálogo** para reutilizar os modelos de produção, incluindo a foto atual, sem criar cadastros duplicados.
4. Use **Item exclusivo** para um produto próprio do Planejamento de envios. Ao salvar, ele passa a integrar um catálogo interno reutilizável, com nome, foto, cor e padrões; esse catálogo nunca é misturado ao cadastro oficial de Produção, Solicitações ou Inventário.
5. Use **Kit composto** quando um anúncio reúne dois ou mais modelos e cores oficiais. Informe a quantidade de cada componente por kit e salve a composição para reutilização em outros envios.
6. O kit pode receber uma **foto de capa opcional**. Sem foto própria, o sistema usa automaticamente a imagem do primeiro componente; nos detalhes, cada componente continua exibindo sua foto oficial.
7. A ação **Excluir** no catálogo de kits é segura: o kit deixa de aparecer em novos planos, mas os planos antigos preservam nome, componentes, fotos e quantidades para auditoria.
8. A quantidade de volumes continua específica de cada envio, e o total é calculado automaticamente a partir da composição salva.

### Solicitar caixas do Inventário em um envio FULL

1. Abra o plano FULL e toque em **Solicitar caixas do Inventário de Produção** no produto ou kit desejado.
2. Para cada componente, o sistema mostra somente caixas disponíveis com o mesmo modelo e a mesma cor.
3. Selecione as caixas físicas exatas. O resumo informa quantidade necessária, selecionada, sobra ou falta.
4. Ao confirmar, as caixas ficam **reservadas** e saem imediatamente do contador e da lista de caixas disponíveis. O saldo físico ainda não é baixado.
5. Um ADM ou colaborador de **Recebimento** deve conferir as caixas e confirmar a transferência física para o e-commerce. Somente nessa etapa cada caixa é baixada por inteiro.
6. Cancelar uma reserva antes da transferência libera todas as caixas e as devolve à disponibilidade.

A mesma caixa não pode participar de duas reservas ativas. Todas as reservas, liberações e transferências registram usuário, data e vínculo com o plano de envio. Itens exclusivos sem modelo oficial não podem reservar caixas do Inventário.

### Combinações de cores dos kits

- No campo **Cor**, escolha uma cor oficial ou selecione **Nova combinação de cores**.
- Uma combinação aceita de **2 a 4 cores oficiais diferentes**. O sistema monta o nome automaticamente, por exemplo `Rosa BB / Azul BB`, mostra as tonalidades e salva a combinação para outros planos.
- As combinações pertencem somente ao **Planejamento de envios**. Elas não criam, duplicam ou alteram cores nos cadastros de Produção, Inventário, Recebimento ou Solicitações.
- Planos antigos de uma única cor continuam funcionando sem conversão. Na visualização e no PDF, combinações mostram o nome completo e todos os indicadores de cor.
- Criar ou alterar uma combinação em um item já conferido reabre somente aquele item para nova conferência. A ação registra usuário, data e conteúdo no histórico de auditoria.

No cabeçalho, **Nome da outra plataforma** aparece somente quando a opção **Outra plataforma** for selecionada. Para Mercado Livre e Shopee, informe apenas a **Conta da plataforma** usada pela empresa.
5. Em **Anúncio**, escolha 50, 100 ou 200 unidades, ou use uma quantidade personalizada. Informe o número de kits ou caixas; o sistema calcula `unidades do anúncio × volumes`.
6. Marque o produto quando a microtarefa estiver concluída. A linha fica verde e a barra de progresso é atualizada.
7. Mova o cartão por **Próximos envios**, **Em preparação**, **Em conferência** e **Prontos para coleta**. Nenhum plano pode ficar pronto ou ser arquivado com item pendente.
8. Use **Gerar PDF** dentro do plano. A impressão contém somente a lista aberta e foi preparada para folha A4 em computador, tablet e celular.
9. Planos finalizados ou cancelados permanecem no **Histórico**. Criação, edição, conclusão e mudança de etapa registram usuário e horário para auditoria.

Produtos e cores desativados continuam preservados em planos históricos. Alterar a foto de um produto oficial atualiza sua visualização nos planos sem duplicar o produto.

## Shopee Analytics (somente ADMs)

O **Shopee Analytics** transforma três relatórios oficiais em uma visão executiva única, sem alterar nenhuma informação dentro da Shopee. Ele fica em **Inteligência → Shopee Analytics**.

Na **Visão geral**, escolha **Faturamento (R$)** para conferir o valor realizado e pago em cada dia ou **Pedidos** para comparar as quantidades. No computador, passe o mouse sobre os pontos; no celular e tablet, toque no dia. A faixa abaixo do gráfico mantém todos os valores diários disponíveis sem poluir o desenho.

### Importar um dia ou uma semana

1. Abra **Importações**.
2. Selecione o cartão correspondente ao arquivo: **Estatísticas da Loja**, **Funil de Produtos** ou **Promoções e Descontos**.
3. Escolha a planilha `.xlsx` exportada pela Shopee.
4. Na seção **Adicionar dados de uma nova data ou período**, use **Selecionar nova planilha**. O sistema registra somente os dias ainda ausentes e preserva automaticamente os dias que já estavam no dashboard.
5. Ao terminar, o painel abre o período reconhecido no arquivo e informa quantos dias foram adicionados ou ignorados.
6. Repita o processo para os outros dois relatórios do mesmo período.

Não existe fila de processamento: depois da mensagem de sucesso, os dados já estão disponíveis. Se os números parecerem antigos, confira o período exibido no filtro. Uma planilha diária pode ser enviada primeiro e depois complementada pela planilha semanal; o mesmo dia nunca é somado duas vezes.

Os cartões de **Últimos períodos recebidos** servem apenas para consulta e nunca substituem arquivos. Use **Corrigir período** somente pelo **Histórico auditável** e somente quando a Shopee tiver fornecido um arquivo corrigido. A janela de confirmação identifica relatório, período e arquivo atual; o servidor só aceita a substituição quando a nova planilha possui exatamente o mesmo período escolhido. Se houver diferença, nenhum dado é alterado.

O sistema identifica arquivos iguais pelo hash e também controla uma única fonte oficial por tipo de relatório e por dia. Reenvios ou sobreposições entre relatórios diários e semanais não duplicam vendas, pedidos ou funil. Nunca renomeie um relatório para tentar transformá-lo em outro tipo; o conteúdo também é validado.

### Interpretar as áreas

- **Visão geral:** vendas realizadas e pagas, diferença, pedidos, compradores, evolução diária e alertas calculados.
- **Produtos:** jornada da visita ao carrinho e ao pagamento, além dos anúncios com maior resultado.
- **Marketing:** fontes de tráfego, impressões, cliques, CTR, conversão e receita atribuída.
- **Promoções:** desempenho por formato e por campanha.
- **Importações:** situação dos três arquivos, períodos, responsáveis e histórico.

Os números e gráficos são calculados no banco e não consomem créditos da OpenAI. O botão **Analisar agora com IA** é opcional: ele envia apenas o consolidado do período ao serviço protegido, recebe uma resposta estruturada em português e apresenta recomendações com evidências. A IA não altera planilhas, produtos, campanhas, estoque, pedidos ou pagamentos.

O ADM principal pode configurar orçamento e intervalo entre análises. Se a IA estiver indisponível ou o limite for atingido, todos os dados e gráficos continuam funcionando normalmente.
