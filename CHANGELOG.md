# Changelog

> Continuidade: restauração completa real ensaiada em projeto Supabase isolado, com bloqueio explícito da produção, remapeamento de usuários e reconciliação de tabelas e Storage.
> Validação final: 63 testes aprovados, fluxo de solicitação/entrega validado com rollback e monitoramento externo confirmado em produção.

Todas as mudanças relevantes do Harmony Store Oficial são registradas aqui.

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
