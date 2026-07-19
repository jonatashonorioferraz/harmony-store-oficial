# Changelog

> Continuidade: restauração completa real ensaiada em projeto Supabase isolado, com bloqueio explícito da produção, remapeamento de usuários e reconciliação de tabelas e Storage.
> Validação final: 63 testes aprovados, fluxo de solicitação/entrega validado com rollback e monitoramento externo confirmado em produção.

Todas as mudanças relevantes do Harmony Store Oficial são registradas aqui.

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
