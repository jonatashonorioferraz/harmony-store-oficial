# Changelog

Todas as mudanças relevantes do Harmony Store Oficial são registradas aqui.

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

