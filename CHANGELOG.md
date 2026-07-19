# Changelog

Todas as mudanças relevantes do Harmony Store Oficial são registradas aqui.

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
