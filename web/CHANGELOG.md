# Changelog

> Continuidade: restauração completa real ensaiada em projeto Supabase isolado, com bloqueio explícito da produção, remapeamento de usuários e reconciliação de tabelas e Storage.
> Validação final: 63 testes aprovados, fluxo de solicitação/entrega validado com rollback e monitoramento externo confirmado em produção.

Todas as mudanças relevantes do Harmony Store Oficial são registradas aqui.

## [v25.60] - 09/08/2026

### Galeria visual e contador ao vivo de caixas

- A nova aba **Caixas em estoque** apresenta cada caixa física em formato de papelão, com placa permanente e informações alinhadas.
- A galeria usa a foto original do modelo e mostra cor, quantidade, colaboradora e data de entrada.
- As caixas são ordenadas da última cadastrada para a primeira pelo código permanente `CX`.
- O botão rosa **Transferir caixa** abre a confirmação da saída integral para o estoque do e-commerce.
- Um contador verde aparece no topo de todas as telas do módulo e inclui somente caixas disponíveis.
- O contador diminui no mesmo momento da transferência e sincroniza alterações feitas em outros dispositivos.
- Novos modelos, cores e colaboradoras são atualizados automaticamente a partir dos cadastros oficiais, inclusive com o formulário de entrada aberto.
- Banco, permissões, auditoria, relatórios e regras de transferência integral permanecem protegidos.

## [v25.59] - 09/08/2026

### Transferência integral da caixa para o e-commerce

- A retirada do Inventário de Produção passa a ser sempre da caixa completa, sem digitação de quantidade.
- A confirmação mostra código permanente, saldo integral, data e destino **Estoque do e-commerce**.
- O Supabase bloqueia retiradas parciais, inclusive por clientes antigos ou chamadas manipuladas.
- A transferência zera o saldo e registra data, horário, usuário, destino e quantidade movimentada.
- A caixa permanece no histórico com a situação **Transferida ao e-commerce** e o mesmo código permanente.
- Ajustes de contagem continuam disponíveis antes da transferência e são bloqueados depois dela.
- PDFs e histórico de movimentações identificam a transferência sem alterar pagamentos, recebimentos ou matérias-primas.

## [v25.58] - 09/08/2026

### Código único e permanente por caixa

- Cada entrada do Inventário de Produção passa a representar obrigatoriamente uma nova caixa física.
- O botão **Gerar código** cria identificadores sequenciais no padrão `CX-000001`.
- O banco bloqueia códigos vazios, negativos, duplicados e qualquer tentativa posterior de alteração.
- Um código gerado nunca é reutilizado, inclusive quando o cadastro é cancelado ou a caixa fica sem saldo.
- Caixas esvaziadas permanecem no histórico, vinculadas à colaboradora, ao modelo, à cor, à data e às movimentações realizadas.
- A localização física é um dado separado e editável; o código de rastreabilidade é permanente.
- Telas, relatórios em PDF, ajuda rápida, manual, backup e recuperação foram atualizados para preservar o novo identificador.
- A mudança é aditiva e mantém compatibilidade com registros e versões anteriores do aplicativo.

## [v25.57] - 09/08/2026

### Inventário de Produção rastreável

- Novo módulo interno para controlar o saldo de mini sabonetes acabados por modelo e cor.
- O catálogo existente de modelos, fotos e cores é reutilizado, sem criar cadastros duplicados.
- Cada entrada registra colaboradora de produção, data, quantidade, caixa, observação e responsável pelo lançamento.
- Saídas são vinculadas ao lote exato, preservando a origem mesmo quando apenas parte da caixa é retirada.
- Ajustes de contagem exigem motivo e geram uma movimentação auditada; saldos anteriores nunca são apagados.
- A consulta por colaboradora apresenta modelos, cores, entradas e saldo identificado sem expor valores financeiros.
- Relatórios de saldo, movimentações, detalhe do lote e produção por colaboradora podem ser gerados em PDF no computador, tablet e celular.
- O acesso é restrito a ADMs e Recebimento; colaboradoras de produção não veem menu, atalho, dados ou relatórios.
- A Home recebeu um único botão compacto **Inventário de Produção**, com brilho leve, respeito à preferência de movimento reduzido e acesso em um toque.
- O módulo não altera pagamentos, recebimentos oficiais, matérias-primas, suprimentos ou seus relatórios.

## [v25.56] - 08/08/2026

### Home mais compacta e organizada

- “Solicitações recentes” passa a iniciar somente com os registros da semana atual, de segunda-feira a domingo.
- A lista mostra no máximo cinco registros inicialmente, evitando que a página inicial fique excessivamente longa.
- Um botão permite abrir todas as solicitações do período e recolher novamente a lista.
- Foram adicionados filtros de período: hoje, ontem, semana atual, últimos 7 dias, últimos 30 dias, mês, ano e histórico completo.
- O filtro de situação permite visualizar todas, em andamento, pendentes, em separação, agendadas, entregues ou canceladas.
- A tela completa de Solicitações permanece sem limitação e continua acessível pelo menu.
- Os controles foram adaptados para computador, tablet e celular.

## [v25.55] - 08/08/2026

### Inteligência operacional usando dados existentes

- A Inteligência passa a comparar produção planejada e oficialmente recebida por colaboradora, modelo e cor.
- O comparativo identifica saldo pendente, recebimento parcial, conclusão, produção acima do planejado e recebimento sem ordem no período.
- O cálculo é exclusivamente gerencial e não altera pagamentos, estoque, ordens ou recebimentos.
- Uma nova seção de qualidade aponta produtos sem foto ou fornecedor, fornecedores sem contato, cores fora do padrão e divergências de contagem.
- Cada indicador abre o módulo responsável pela correção, sem criar um novo menu principal.
- O relatório planejado versus recebido pode ser exportado em CSV compatível com Excel.
- As sugestões de compra existentes foram preservadas e agora explicam que nenhuma alteração de estoque ocorre sem aprovação e recebimento do ADM.

## [v25.54] - 08/08/2026

### Proteção reforçada para a administração

- Ações administrativas irreversíveis passam a exigir uma confirmação recente da senha.
- A confirmação vale por 10 minutos, evitando solicitações repetitivas durante o trabalho normal.
- Exclusões de produtos, solicitações, categorias e campos personalizados são protegidas também no banco, não apenas na interface.
- Criação, alteração e remoção de acessos são validadas novamente pela função segura do servidor.
- Sessões administrativas abandonadas são bloqueadas após 30 minutos sem atividade, sem remover as notificações do aparelho.
- A renovação automática da sessão não substitui a confirmação real da senha.
- Auditorias de exclusão registram que a identidade administrativa foi confirmada.

## [v25.53] - 08/08/2026

### Paginação e histórico preparado para crescimento

- Produtos, solicitações, perfis e configurações deixam de depender do limite padrão de linhas do Supabase.
- Inteligência, fornecedores, pedidos de compra, ideias, suprimentos internos, cupons e boletos passam a carregar todas as páginas de forma autenticada e determinística.
- A Linha do Tempo consulta no servidor somente a colaboradora e o período selecionados, reduzindo dados desnecessários sem substituir a lista global do ADM.
- A paginação preserva cabeçalhos, sessão, renovação de acesso, ordenação e permissões existentes.
- Novos testes simulam múltiplas páginas, respostas inválidas e o isolamento dos dados da Linha do Tempo.

## [v25.52] - 07/08/2026

### Check-up obrigatório de separação

- Cada item das solicitações de produção e materiais do e-commerce pode ser confirmado como **Separado** ou **Sem estoque**.
- A separação só pode ser finalizada depois que todos os itens forem conferidos, evitando produtos esquecidos.
- Itens separados recebem destaque verde; faltas de estoque recebem destaque vermelho e identificação permanente do responsável e horário.
- A ação **Sem estoque** zera o saldo físico de forma transacional, registra a divergência e cria ou atualiza automaticamente uma solicitação de reposição, sem duplicidades.
- O cadastro do produto define se a reposição é uma compra de fornecedor ou uma produção interna.
- O novo painel **Conferência de estoque** reúne divergências e reposições, permite concluir verificações e exportar relatórios em Excel ou PDF.
- As novas tabelas participam do backup e da recuperação do sistema, com acesso administrativo e histórico de auditoria.

## [v25.51] - 06/08/2026

### Central de notificações mais pessoal e organizada

- A página inicial não exibe mais o histórico de notificações enviadas pelo administrador principal para outras pessoas.
- Colaboradoras e equipe de recebimento visualizam na página inicial somente avisos não lidos vinculados à própria conta.
- Cada aviso recebeu a ação **Marcar como lida**; depois da confirmação ele sai imediatamente da página inicial, mas permanece no histórico da Central de Notificações.
- O painel desaparece quando não há avisos pendentes, mantendo a tela inicial limpa no celular, tablet e computador.

## [v25.50] - 04/08/2026

### Corrigido em 06/08/2026

- A conclusão de uma entrega agora reconcilia automaticamente reservas históricas fora de sincronia.
- O estoque comprometido com outras solicitações abertas continua protegido e uma falta real informa o produto e as quantidades envolvidas.
- O Harmony Studio passou a ter repositório e hospedagem independentes, sem rotas ou serviços ativos dentro do aplicativo de gestão.
- Uma verificação automática protege a separação entre os dois produtos e impede a reintrodução acidental de código exclusivo do Studio.
- A versão do pacote e do arquivo de dependências foi sincronizada para tornar instalações e auditorias reproduzíveis.

### Adicionado

- Nova Linha do Tempo da Colaboradora, reunindo solicitações de materiais, entregas, ordens de produção, recebimentos e fechamentos de pagamento.
- Filtros por colaboradora e período para administradores; colaboradoras e equipe de recebimento visualizam somente o próprio histórico.
- Atalhos em cada evento para abrir diretamente o registro no módulo responsável.

### Segurança e experiência

- Consultas preservam as permissões do Supabase e não exibem valores financeiros na linha do tempo.
- Cache isolado por conta, atualização manual dos dados e layout responsivo para celular, tablet e computador.

## [v25.49] - 04/08/2026

### Câmera e galeria para documentos

- Cupons fiscais e boletos agora oferecem ações independentes para tirar uma foto ou escolher uma imagem da galeria.
- O boleto também mantém a seleção de arquivos PDF já salvos.
- O arquivo escolhido é identificado na tela antes do envio para a leitura inteligente.

## [v25.48] - 04/08/2026

### Correção do PDF de solicitações no celular

- O documento agora é montado em uma área temporária exclusiva, contendo somente a solicitação selecionada.
- O menu, o painel e o modal posicionados atrás da lista não entram mais nas páginas geradas.
- A área temporária é removida automaticamente depois que a impressão termina.

## [v25.47] - 04/08/2026

### Correção geral dos PDFs

- Os cinco fluxos de PDF agora usam modos de impressão independentes, impedindo que o estilo de um módulo esconda o conteúdo de outro.
- Foram corrigidos a lista visual de materiais, as ordens de produção, os demonstrativos de pagamento, os relatórios de Inteligência e os relatórios de Suprimentos.
- Computador, Android, iPhone/iPad e tablet preservam o conteúdo até o encerramento da visualização de impressão.
- O cache do PWA foi renovado para distribuir os arquivos corrigidos sem reutilizar estilos antigos.
- Testes de regressão verificam a visibilidade do documento, o isolamento entre módulos e a disponibilidade offline.

## [v25.46] - 04/08/2026

### Confirmação externa das ordens de produção

- ADMs podem registrar que a colaboradora confirmou a ordem por WhatsApp, telefone, pessoalmente ou por outro meio.
- O registro guarda data, horário, meio, observação e ADM responsável, com o evento `production_order.admin_acknowledged` na auditoria.
- Ordens confirmadas externamente ficam verdes como **Confirmada pelo ADM** e deixam de gerar pendência no **Meu Dia na Harmony**.
- A confirmação trata somente da ciência da ordem e permanece totalmente separada do recebimento físico, da contagem oficial e dos pagamentos.
- O formulário foi adaptado para computador, celular, tablet e impressão, mantendo as permissões existentes.

## [v25.45] - 27/07/2026

### Resumo completo dos boletos

- A página de boletos agora mostra quantidade e valor acumulado para todos os registros, pendentes, pagos, cancelados, atrasados, vencendo hoje e vencendo amanhã.
- Cada total funciona como atalho de filtro e abre imediatamente os boletos daquela situação.
- O seletor da lista também ganhou os filtros de atrasados, vencendo hoje e vencendo amanhã.
- O resumo foi organizado para desktop, tablet e celular sem alterar banco, pagamentos ou permissões.

## [v25.44] - 27/07/2026

### Reativação segura de boletos cancelados

- Boletos cancelados agora podem ser reativados pelo próprio registro, preservando protocolo, linha digitável, documento e histórico.
- A reativação é exclusiva para ADMs, aceita somente boletos cancelados, usa bloqueio transacional e registra o evento `bill.reactivated` na auditoria.
- O boleto reativado volta ao estado pendente e reaparece automaticamente nos totais e alertas de vencimento do “Meu dia na Harmony”.
- A proteção contra duplicidade permanece ativa; ao tentar cadastrar uma linha já existente, o aplicativo abre o boleto correto e orienta a reativação.
- Um novo documento enviado por engano durante a tentativa duplicada é descartado, evitando arquivos órfãos no armazenamento privado.

## [v25.43] - 27/07/2026

### Filtros escritos e sugestões de busca

- Os filtros escritos agora executam a pesquisa ao pressionar Enter no computador ou o botão de pesquisa do teclado do celular.
- Campos de produto exibem sugestões com os nomes reais cadastrados, e os demais módulos sugerem os principais nomes disponíveis em cada lista.
- A comparação passou a ignorar diferenças entre letras maiúsculas, minúsculas e acentos, evitando falhas ao pesquisar nomes.
- O comportamento foi padronizado no catálogo, solicitações, produtos, equipe, cadastros, produção, inteligência, ajuda e ideias.
- Nenhuma mudança de banco, autenticação, pagamentos ou permissões foi necessária.

## [v25.42] - 27/07/2026

### Privacidade das ordens ao trocar de conta

- O cache das ordens semanais agora pertence explicitamente à sessão que realizou a consulta e é apagado no logout.
- Ao entrar com outra colaboradora no mesmo navegador ou PWA, o aplicativo descarta imediatamente os dados da sessão anterior e consulta somente as ordens da nova conta.
- Uma segunda validação no cliente impede listar ou abrir uma ordem cujo `worker_id` não corresponda à colaboradora conectada; ADMs preservam a visão administrativa completa.
- As políticas RLS e a RPC de produção foram auditadas em produção e já bloqueavam corretamente leituras de outras colaboradoras, portanto nenhuma mudança de banco ou permissão foi necessária.

## [v25.41] - 25/07/2026

### Produtos compartilhados

- O cadastro de produtos agora oferece a finalidade “Produção e e-commerce”.
- Um produto compartilhado usa um único cadastro, estoque, custo e fornecedor, mas aparece para colaboradoras de produção e de recebimento.
- A Inteligência mostra o produto nas duas áreas e atribui o consumo ao setor de quem realizou a solicitação, sem duplicar o consumo consolidado.
- ADMs podem reclassificar produtos existentes manualmente; nenhum item é alterado automaticamente.
- O banco valida os dois catálogos e impede que produtos internos sejam incluídos nessas solicitações.

## [v25.40] - 25/07/2026

### Produção e e-commerce separados

- O cadastro de produtos agora permite definir “Matéria-prima de produção” ou “Suprimento do e-commerce”.
- Colaboradoras de produção veem apenas matérias-primas; o perfil de recebimento solicita apenas suprimentos do e-commerce.
- A Inteligência ganhou uma aba exclusiva para e-commerce, com consumo, estoque, previsão, custo e exportação separados.
- ADMs continuam administrando os dois catálogos, enquanto suprimentos internos permanecem isolados.
- Estoques, fornecedores, custos e históricos existentes são preservados ao reclassificar um produto.

## [v25.39] - 25/07/2026

### Boletos a pagar

- ADMs agora podem cadastrar boletos por foto, PDF ou preenchimento manual em uma área financeira separada.
- A leitura inteligente sugere beneficiário, valor, vencimento e linha digitável, mas exige revisão humana antes de salvar.
- A linha digitável passa por validação independente da IA e pode ser copiada rapidamente para pagamento.
- Boletos vencendo amanhã, hoje ou atrasados aparecem no “Meu dia na Harmony”.
- Pagamentos podem ser confirmados com comprovante opcional; cadastro, correção, pagamento e cancelamento são auditados.
- Documentos ficam em bucket privado e nenhuma funcionalidade realiza pagamentos ou acessa contas bancárias.

## [v25.38] - 25/07/2026

### Meu dia mais compacto

- “Meu dia na Harmony” agora inicia como uma faixa resumida, reduzindo a repetição visual com a Central de Pendências.
- O ADM pode ampliar ou recolher os detalhes, e essa preferência fica salva somente no navegador para o seu usuário.
- Ao ampliar, as solicitações não são repetidas em cartões; elas continuam detalhadas na Central de Pendências logo abaixo.
- Produção, estoque e compras permanecem disponíveis no resumo e nos detalhes, sem alterar dados, permissões ou regras de negócio.

## [v25.37] - 25/07/2026

### Correção preventiva dos botões de atualização

- A validação em produção identificou e corrigiu a perda da referência do botão após operações assíncronas.
- Os botões de atualização do painel de uso e de “Meu dia na Harmony” agora preservam seu estado com segurança até o fim da consulta.
- O navegador passou a receber explicitamente a logotipo colorida oficial como favicon, com versão própria para eliminar o ícone genérico em cache.
- Nenhum dado, permissão ou regra de negócio foi alterado.

## [v25.36] - 25/07/2026

### Meu dia na Harmony

- A página inicial agora organiza automaticamente as ações mais importantes de cada perfil.
- Colaboradoras veem avisos não lidos, ordens de produção que precisam de confirmação e suas solicitações em andamento.
- ADMs veem solicitações abertas ou atrasadas, ordens sem confirmação, estoque baixo e compras internas pendentes.
- Cada cartão abre diretamente o fluxo oficial correspondente, sem duplicar regras nem ampliar permissões.
- A central usa somente os dados que o perfil já podia consultar e não altera Auth, pagamentos, banco ou RLS.

## [v25.35] - 25/07/2026

### Painel de uso mais vivo, compacto e pessoal

- O acompanhamento de uso agora permanece minimizado e pode ser ampliado pelos ADMs para consultar todos os detalhes.
- O resumo compacto destaca quantidade de colaboradoras, uso recente e pessoas que podem precisar de apoio.
- As fotos privadas já cadastradas nos perfis aparecem no resumo e na lista detalhada, mantendo as iniciais como alternativa.
- O visual recebeu cores, profundidade, estados de interação e tratamento responsivo sem alterar coleta, autenticação ou permissões.

## [v25.34] - 25/07/2026

### Acompanhamento acolhedor de uso

- A tela de Colaboradoras ganhou um painel compacto de acessos para todos os ADMs.
- O painel mostra último acesso, tempo aproximado de hoje e dos últimos 7 dias e dias ativos no período de 30 dias.
- A coleta considera somente o aplicativo visível e com interação recente; não registra telas, conteúdo, IP ou localização.
- A tabela de telemetria não possui acesso direto pelo aplicativo: colaboradoras registram apenas o próprio heartbeat e somente ADMs ativos consultam o resumo.
- Os dados começam nesta versão, têm retenção de 180 dias e foram incluídos nos fluxos de backup e recuperação isolada.

## [v25.33] - 24/07/2026

### Busca visual de modelos nas ordens de produção

- Cada opção de modelo agora exibe a miniatura do produto junto ao nome.
- A busca sugere modelos enquanto o ADM digita e ignora diferenças entre acentos e letras maiúsculas.
- As listas de modelos e cores permanecem roláveis por mouse e toque em computador, tablet e celular.
- A seleção também oferece navegação acessível por teclado.

## [v25.32] - 24/07/2026

### Paleta visual completa nas ordens de produção

- Ao abrir o campo Cor, todas as opções exibem o nome e a amostra exata da tonalidade cadastrada.
- A paleta usa duas colunas no computador e uma coluna adaptada no celular e tablet.
- A seleção continua integrada ao cadastro oficial de cores, ao salvamento da ordem e ao PDF.
- Navegação por teclado, foco visível e fechamento pela tecla Escape foram preservados para acessibilidade.

## [v25.31] - 24/07/2026

### Inclusão rápida na ordem de produção

- Cada produto adicionado entra no topo da lista de produção, mantendo os controles recém-criados imediatamente visíveis.
- O campo de modelo recebe foco automaticamente para agilizar o preenchimento de listas extensas.
- A ordem dos itens já existentes, o salvamento, a edição, o PDF e as regras de pagamento permanecem inalterados.

## [v25.30] - 22/07/2026

### Indisponibilidade temporária de matérias-primas

- Produtos sem estoque no fornecedor continuam visíveis para colaboradoras e colaboradoras de recebimento, evitando que sejam esquecidos.
- Uma sinalização profissional informa o motivo e, quando cadastrada, a previsão de retorno.
- Os controles de quantidade ficam bloqueados para novas solicitações enquanto o produto estiver indisponível.
- Solicitações pendentes antigas permitem remover o item indisponível, mas impedem seu aumento pela solicitante.
- ADM principal e demais ADMs mantêm permissão integral para editar solicitações, produtos e disponibilidade.
- O Supabase valida a regra mesmo quando a chamada não parte da interface, com registro de auditoria das mudanças.

## [v25.29] - 22/07/2026

### Lista visual das solicitações

- Toda solicitação de matéria-prima ganhou uma visualização simplificada com fotos maiores, nomes e quantidades solicitadas.
- A lista visual está disponível para administradores e para a própria pessoa solicitante, inclusive no histórico.
- O PDF A4 contém somente os produtos pedidos e preserva uma apresentação compacta para listas extensas.
- A visualização abre sobre a separação sem alterar ou descartar dados ainda não salvos.
- Os estilos de impressão foram isolados para não interferirem nas ordens de produção nem nos relatórios de recebimento.

## [v25.28] - 22/07/2026

### Correção do PDF no celular

- A ordem de produção usa o fluxo nativo da própria página em celulares e tablets, evitando o travamento do Android em "Preparando visualização".
- O layout A4 compacto, com fotos, cores e vários produtos por página, foi preservado também no fluxo móvel.
- O fluxo em janela exclusiva continua ativo no computador, mantendo a compatibilidade já validada.

## [v25.27] — 22/07/2026

### Diagnóstico de notificações no Android

- A ativação atualiza o service worker antes de solicitar a inscrição no serviço push.
- Erros genéricos do Android passam a ser explicados em português com um roteiro seguro de correção no aparelho.
- Falhas de conexão, permissão, serviço Android e gravação no banco são diferenciadas.
- A Central de Notificações interna permanece disponível mesmo quando o push do aparelho não pode ser ativado.

## [v25.26] — 21/07/2026

### Listas de produção recolhíveis

- Cada coleta recebida começa recolhida e pode ser aberta individualmente para facilitar a navegação entre muitas listas.
- O resumo, a situação e as ações permanecem visíveis enquanto os produtos ficam ocultos.
- A opção está disponível para todos os perfis autorizados a visualizar recebimentos e não altera dados ou pagamentos.

## [v25.25] — 21/07/2026

### Classificação das solicitações pelo perfil

- Toda solicitação criada pelo perfil de recebimento aparece em “Material do e-commerce”, independentemente dos produtos escolhidos.
- Solicitações das colaboradoras de produção continuam em “Matéria-prima”.
- Suprimentos internos permanecem separados e a nova regra reduz uma consulta desnecessária ao banco.

## [v25.24] — 21/07/2026

### Central administrativa de solicitações

- A tela inicial dos ADMs reúne as solicitações abertas de matéria-prima, materiais do e-commerce e suprimentos internos.
- Os indicadores funcionam como filtros e cada pendência abre diretamente o registro no módulo de origem.
- Prioridade, situação, solicitante e tempo de espera ficam visíveis sem navegar por diversos menus.
- A consulta reaproveita as regras de acesso existentes e possui falha isolada, sem bloquear a tela inicial.
- O painel foi adaptado para celular, tablet e computador.

## [v25.23] — 21/07/2026

### Pagamentos da produção com agenda individual

- Cada colaboradora pode ter seu próprio dia e horário de corte e seu próprio dia de pagamento.
- Recebimentos abertos são organizados automaticamente na próxima data válida, sem alterar históricos já fechados.
- O ADM ganhou prévia detalhada, fechamento seguro, movimentação auditada e PDF por ciclo de pagamento.
- A colaboradora continua vendo valores apenas depois do fechamento; o perfil de recebimento permanece sem acesso financeiro.
- Backup, restauração, responsividade e auditoria foram atualizados para o novo cadastro de agendas.

## [v25.22] — 21/07/2026

### Conferência segura da data dos cupons

- A compra direta #0004 foi corrigida para a data em que foi registrada, restaurando sua soma no painel de julho.
- A conferência do cupom agora destaca datas mais de sete dias distantes de hoje.
- Antes de salvar uma data incomum, o ADM precisa confirmá-la explicitamente.
- O campo de data e hora passou a respeitar corretamente o horário local do aparelho.

## [v25.21] — 20/07/2026

### Saúde do Sistema em português e backup corrigido

- Todos os textos do diagnóstico foram normalizados para português do Brasil com codificação UTF-8 explícita.
- A falha do backup ganhou mensagem própria e deixou de aparecer novamente como erro genérico do aplicativo.
- O painel explica quando nenhum aparelho mantém notificações push ativas, preservando a central interna de avisos.
- O backup recebeu acesso de leitura exclusivo às novas tabelas e passou a incluir ideias, notificações, suprimentos internos, cores e ordens de produção.
- A correção mantém RLS e não amplia permissões de colaboradoras ou usuários comuns.

## [v25.20] — 20/07/2026

### PDF em janela própria e atualização forçada

- A ordem de produção passa a ser impressa em uma janela exclusiva, evitando a prévia branca causada pelo contexto de impressão do Chrome.
- A versão dos arquivos de ordens foi fixada na URL para impedir que o PWA reutilize o gerador antigo armazenado em cache.
- O A4 compacto mantém fotos, cores, quantidades, totais e assinaturas, distribuindo listas maiores em duas colunas e novas páginas.
- Nenhum dado, status ou regra de negócio da ordem foi alterado.

## [v25.19] — 20/07/2026

### Impressão isolada e resistente a conflitos

- O PDF da ordem passa a ser montado em um documento A4 isolado do restante do aplicativo.
- A geração aguarda o carregamento das fotos e das fontes antes de abrir a prévia de impressão.
- Menus, modais e regras de relatórios antigos não conseguem mais ocultar o conteúdo da ordem.
- O documento temporário é removido automaticamente após a impressão, sem alterar ou duplicar dados da ordem.

## [v25.18] — 20/07/2026

### Correção do PDF das ordens de produção

- A prévia de impressão deixa de ser ocultada pelas regras antigas do relatório de recebimentos.
- Rascunhos, ordens enviadas e ordens confirmadas geram o mesmo documento completo em A4.
- A impressão remove a rolagem e os limites da janela, preservando cabeçalho, itens, fotos, cores, totais e assinaturas.
- Um teste de regressão protege a compatibilidade entre os PDFs de recebimentos e ordens de produção.

## [v25.17] — 20/07/2026

### Ordens semanais de produção

- ADMs podem criar uma lista individual para cada colaboradora reutilizando modelos, fotos e o catálogo global de cores.
- Cada ordem aceita vários modelos, cores, quantidades e orientações, com rascunho, envio, visualização, confirmação e cancelamento auditado.
- A colaboradora recebe uma notificação urgente e visualiza somente as próprias ordens, com interface responsiva no celular e tablet.
- A ordem pode ser editada, duplicada para a semana seguinte e gerada em PDF com identidade visual da Harmony Store.
- O planejamento permanece totalmente separado da conferência: não calcula valores e não altera pagamentos, estoque ou contagens oficiais.
- RLS, funções autenticadas e índices específicos protegem os dados e mantêm o histórico operacional.

## [v25.16] — 20/07/2026

### Catálogos separados e fotos em suprimentos

- Solicitações de matéria-prima agora aceitam exclusivamente itens classificados como produção, inclusive para o perfil Recebimento.
- O Supabase bloqueia vínculos cruzados entre matérias-primas, suprimentos internos e itens lidos em cupons fiscais.
- A edição de solicitações pendentes utiliza o mesmo catálogo filtrado da criação, evitando que café, limpeza e outros insumos apareçam nessa lista.
- O cadastro de suprimentos internos ganhou foto com prévia, substituição e remoção segura em JPG, PNG ou WebP.
- Fotos aparecem no catálogo, na solicitação interna e nos detalhes das solicitações de matéria-prima, com ajuste para celular e tablet.
- A migração preserva produtos, solicitações, compras, estoque e relatórios históricos existentes.

## [v25.15] — 20/07/2026

### Edição completa de solicitações pelo ADM principal

- O ADM principal pode adicionar, restaurar ou remover produtos e corrigir quantidades solicitadas e enviadas em pedidos pendentes, separados, agendados ou entregues.
- Solicitações entregues geram ajustes proporcionais no estoque físico e atualizam automaticamente os relatórios de consumo.
- Solicitações separadas ou agendadas recalculam as reservas sem alterar o status, a data ou os responsáveis.
- Toda correção exige motivo e registra estado anterior, estado posterior e responsável no histórico imutável.
- ADM normal, colaboradora e Recebimento mantêm exatamente as permissões anteriores.

## [v25.14] — 20/07/2026

### Conclusão imediata de solicitações já entregues

- Solicitações em separação agora oferecem o botão verde **Concluir entrega agora**.
- O ADM informa quem entregou e quem recebeu sem precisar criar um agendamento retroativo.
- A separação visível é salva antes da conclusão, evitando perder ajustes de quantidades ou itens.
- Estoque, movimentação, responsáveis, auditoria e status Entregue são atualizados com as mesmas regras seguras do fluxo agendado.
- O agendamento continua disponível normalmente para entregas futuras.

## [v25.13] — 20/07/2026

### Login sem mascote duplicada no computador e tablet

- A mascote interna do cartão de acesso agora é criada exclusivamente na versão celular.
- Computadores e tablets mantêm somente a mascote principal no painel artesanal, eliminando a área branca duplicada.
- A troca de orientação e o redimensionamento da tela atualizam a composição automaticamente.
- Uma proteção adicional impede que estilos antigos do PWA exibam a mascote móvel em telas maiores.

## [v25.12] — 20/07/2026

### Catálogo global e visual de cores da produção

- O ADM cadastra cada cor uma única vez, com nome, tonalidade visual, ordem e situação ativa/inativa.
- Toda cor ativa fica disponível automaticamente em todos os modelos atuais e futuros, sem repetição de cadastro por produto.
- No recebimento, a cor agora é selecionada em uma lista padronizada com amostra visual, eliminando variações de digitação.
- Cores já registradas em modelos e recebimentos são migradas para o catálogo, preservando o histórico.
- Cores utilizadas não podem ser apagadas definitivamente; podem ser desativadas para manter relatórios e pagamentos íntegros.

## [v25.11] — 19/07/2026

### Exclusão no catálogo interno e login reforçado

- O catálogo de Suprimentos e Compras agora apresenta os botões Editar e Excluir em cada item cadastrado.
- A exclusão utiliza a rotina administrativa auditada e é bloqueada quando o item possui histórico, preservando compras, solicitações, estoque e relatórios.
- O alinhamento central do logotipo, da saudação e da orientação do login foi reforçado inclusive para estruturas antigas temporariamente mantidas no cache do PWA.

## [v25.10] — 19/07/2026

### Tela de login centralizada

- Logotipo, acesso restrito, boas-vindas e mensagem de orientação agora ficam centralizados em uma composição única.
- Formulário ganhou um cartão mais sofisticado e equilibrado, mantendo os rótulos dos campos alinhados para facilitar a leitura.
- Espaçamentos foram adaptados para celular, tablet, computador e aparelhos com pouca altura de tela.
- Identidade visual, mascote, frase institucional e funcionamento do login foram preservados.

## [v25.9] — 19/07/2026

### Menu móvel para perfis administrativos

- Ícones e nomes das muitas abas do ADM agora ocupam cartões de largura fixa e não se sobrepõem.
- Navegação inferior ganhou rolagem horizontal suave, encaixe por item e posicionamento automático da aba ativa.
- Espaçamento respeita a área segura de Android e iPhone sem cobrir conteúdo, alertas ou o botão de instalação.
- Cores, emojis e identidade visual já aprovados foram preservados.

## [v25.8] — 19/07/2026

### Exclusão segura de cupons de teste

- O ADM principal pode excluir definitivamente um cupom criado por engano ou somente para teste.
- A operação exige confirmação digitada e motivo, estorna o estoque, remove a foto privada e preserva uma trilha de auditoria.
- Produtos criados automaticamente pelo cupom podem ser removidos junto quando estiverem sem estoque e sem qualquer outro vínculo.
- ADMs normais continuam com a opção de cancelar e estornar, sem permissão para exclusão definitiva.

## [v25.7] — 19/07/2026

### Suprimentos e compras internas

- Novo módulo exclusivo para ADM e Recebimento, separado da matéria-prima de produção.
- Solicitação simples por lista de itens, sem exigir quantidade ou valor do perfil de Recebimento.
- Compra vinculada à solicitação e compra direta sem criação de registros fictícios.
- Catálogo interno com estoque mínimo, fornecedor preferencial e criação de novos itens durante a conferência do cupom.

### Cupom fiscal e inteligência

- Foto privada do cupom com leitura estruturada por IA e revisão obrigatória pelo ADM antes de salvar.
- Registro de estabelecimento, documento, data, chave fiscal, itens, quantidades, valores e forma de pagamento.
- Limite de uso, medição de tokens e estimativa de custo da leitura sem expor a chave da API no aplicativo.

### Relatórios e segurança

- Relatório mensal de compras, consumo solicitado, estoque e gastos.
- Evolução por produto com preço anterior e atual, diferença em reais e percentual, preço médio, menor e maior valor.
- Exportação dos indicadores para Excel e impressão em PDF.
- RLS, RPCs transacionais, Storage privado, trilha de auditoria e separação de valores: Recebimento não acessa informações financeiras.

## [v25.6] — 19/07/2026

### Tablets e instalação

- Novo layout intermediário entre 721 e 1100 pixels, com menu lateral compacto, área útil ampliada, tabelas roláveis e formulários ajustados para tablets.
- Botão **Instalar aplicativo** agora aparece também em tablets e aparelhos com tela sensível ao toque, não apenas em celulares pequenos.
- Orientação de instalação reconhece iPads modernos que se identificam como computador e explica corretamente o processo pelo Safari.
- Android tablets usam o instalador nativo quando o navegador oferece o evento de instalação e mantêm instrução alternativa pelo menu do Chrome.

### Compatibilidade

- O modo já instalado continua escondendo o botão de instalação.
- O comportamento existente de celular e computador foi preservado.

## [v25.5] — 19/07/2026

### Adicionado

- Ação **Reabrir e editar** nas coletas de produção já fechadas, disponível para ADM principal, ADM normal e perfil de Recebimento.
- Inclusão de caixas encontradas posteriormente dentro do recebimento original, mantendo colaboradora e data da coleta.
- Recálculo automático da contagem oficial e do total semanal quando uma coleta fechada é corrigida.

### Segurança e rastreabilidade

- Pagamentos já marcados como realizados continuam bloqueados contra alterações retroativas.
- Toda correção registra responsável, quantidade anterior e nova quantidade de itens no histórico de auditoria.
- O perfil de Recebimento continua sem acesso a valores, mesmo ao reabrir e corrigir a coleta.

### Validação

- Permissões dos quatro perfis, recálculo financeiro, bloqueio após pagamento, responsividade e cache offline cobertos por testes.

## [v25.4] — 19/07/2026

### Adicionado

- Opção **Ocultar para colaboradoras de produção** dentro do cadastro e da edição de cada produto.
- Produtos marcados continuam ativos para estoque, fornecedores, relatórios, ADM principal, demais ADMs e colaboradoras de recebimento.
- O catálogo de novas solicitações da colaboradora comum mostra somente as matérias-primas liberadas pelo ADM.

### Compatibilidade e segurança

- Produtos ocultos não são excluídos e permanecem vinculados ao histórico de solicitações, estoque e compras.
- Uma solicitação pendente antiga conserva itens que tenham sido ocultados depois do envio, evitando perda involuntária ao editar.
- A alteração de visibilidade é validada por RPC administrativa, salva junto com o produto e registrada na auditoria.

### Validação

- Regras dos quatro perfis, cadastro, edição de solicitação antiga, responsividade e cache do aplicativo cobertos pela suíte automatizada.

## [v25.3] — 19/07/2026

### Adicionado

- Central de Notificações interna para todas as usuárias, com contador de não lidas, histórico, confirmação de leitura e destaque na tela inicial.
- Envio individual diretamente no cadastro da colaboradora e envio global para toda a equipe ativa, exclusivos do ADM principal.
- Modelos rápidos para lembrete de solicitação, aviso de coleta e comunicado geral, com prioridade e prazo opcional.
- Push personalizado da Harmony Store para avisos administrativos; mensagens urgentes usam destaque, vibração reforçada e permanecem visíveis em aparelhos compatíveis.

### Segurança e continuidade

- Destinatárias são definidas no banco no momento do envio; RLS e RPCs impedem leitura por outras colaboradoras e envio por ADMs sem permissão principal.
- Envio, público, prioridade e quantidade de destinatárias ficam registrados na auditoria.
- Tabelas da Central de Notificações incluídas no backup criptografado e no plano de recuperação.

### Validação

- Fluxos global, individual, leitura, contador, responsividade e integração push cobertos pela suíte automatizada.
- Banco validado com teste transacional e verificações dos consultores de segurança e desempenho.

## [v25.2] — 19/07/2026

### Adicionado

- Aba administrativa **Ideias e Evolução**, com cadastro, busca, prioridades, status, histórico automático e imagem privada opcional.
- Botão **Preparar para o Codex**, que transforma cada proposta em uma solicitação estruturada para análise de impacto, segurança, banco, celular, riscos e plano por fases.
- Fotos dos produtos na conferência e separação das solicitações, com ampliação ao toque e apresentação responsiva no celular.

### Segurança e continuidade

- Acesso às ideias, histórico e anexos limitado a ADMs ativos por RLS e privilégios explícitos.
- Exclusão de ideias não concedida; o status **Descartada** preserva decisões e auditoria.
- Novas tabelas e imagens incluídas no backup criptografado e no ensaio de recuperação.

### Validação

- Banco validado com criação, alteração, histórico e auditoria em transação revertida, sem dados residuais.
- Build, segurança estática, responsividade e geração do texto para o Codex cobertos pela suíte automatizada.

## [v25.1] — 19/07/2026

### Melhorado

- Busca e filtro por categoria adicionados ao catálogo de produtos da Nova solicitação no celular e no computador.
- Controles de busca padronizados nas listas de categorias, campos, produção, pagamentos, fornecedores e compras.
- Layout móvel ajustado para manter busca, filtro e contagem visíveis, sem rolagem horizontal e com alvos de toque de 44 px.
- Cache do aplicativo instalado atualizado para distribuir a correção automaticamente.

### Validação

- Fluxos de busca por texto e filtro por categoria validados em larguras de 390 px e 360 px.
- Suíte completa aprovada com 66 testes automatizados.

## [v25] — 19/07/2026

### Adicionado

- Central de ajuda com orientação contextual, manual por módulos e documentação técnica.
- Painel administrativo Saúde do Sistema com diagnóstico de aplicação, Supabase, Storage, notificações, erros e backup.
- Pipeline automático de qualidade para build, testes, paridade dos arquivos oficiais e prevenção de segredos.
- Backup diário externo com inventário, SHA-256, criptografia, retenção e runbook de recuperação.

### Segurança e continuidade

- Dados de saúde acessíveis somente por Edge Function autenticada e ADM ativo.
- Eventos técnicos saneados, limitados e sem dados pessoais livres.
- Tabelas operacionais de monitoramento fechadas por RLS e privilégios mínimos.
- Registro resumido de notificações e falhas, sem exposição das chaves ou endpoints.
- Índices de apoio para todas as chaves estrangeiras apontadas pelo auditor e políticas RLS equivalentes sem avaliações duplicadas.

### Validação

- Build aprovado, 58 testes automatizados e bloqueio externo confirmado com HTTP 401.
- Primeiro backup criptografado validado de ponta a ponta, com hash registrado e retenção de 30 dias.
- Cada novo backup passa por descriptografia temporária e ensaio automático de recuperação somente leitura antes de ser aceito.
- GitHub Actions atualizado para os runtimes atuais, removendo dependências de execução obsoletas.
- Integridade offline do PWA, manifesto, orientação e dimensões dos ícones passam a ser verificadas automaticamente.
- Dependências de produção recebem auditoria de vulnerabilidades em toda publicação e revisão mensal agrupada.
- Monitor externo verifica aplicativo, banco, autenticação e Storage a cada seis horas e registra alertas saneados na Saúde do Sistema.

## [v24] — 19/07/2026

### Adicionado

- Operações transacionais para produtos, estoque, fornecedor e planejamento.
- Auditoria imutável com origem, correlação, filtros e paginação.
- Hash de CPF com HMAC versionado e compatibilidade com registros legados.
- Carregamento autenticado de fotos de perfil.

### Segurança

- Remoção da escrita livre de auditoria pelo navegador.
- Remoção de escritas administrativas diretas em produtos e estoque.
- Bucket de fotos de perfil privado e catálogo público sem listagem geral.
- Respostas de erro da função de usuários sanitizadas.

### Validação

- Build aprovado, 51 testes automatizados e smoke test transacional no banco.
