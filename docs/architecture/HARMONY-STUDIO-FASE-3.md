# Harmony Studio — Fase 3: Persistência e Banco de Conhecimento

Status: concluída, aguardando aprovação  
Escopo: persistência durável, armazenamento de arquivos, recuperação e auditoria; sem alterar o fluxo visual atual

## Entregas

- Banco D1 isolado por tabelas com prefixo `studio_`.
- Armazenamento R2 dedicado às fotos e aos artefatos binários.
- Migração inicial versionada com nove tabelas.
- Repositório D1 para projetos, conhecimento dos agentes, ativos, execuções e auditoria.
- Serviço transacional de ativos: grava o arquivo no R2 e os metadados no D1.
- Compensação automática: remove o arquivo do R2 se a gravação dos metadados falhar.
- Hash SHA-256 para verificar integridade e detectar conteúdo duplicado.
- Consulta da execução mais recente que pode ser recuperada após fechamento do navegador.
- Serviço de criação de projeto com evento obrigatório de auditoria.
- Bindings lógicos `DB` e `STUDIO_ASSETS`, sem dependência direta do domínio.

## Modelo persistente

1. Projetos de anúncio.
2. Versões imutáveis dos dados do produto.
3. Fotos e arquivos de origem.
4. Execuções completas do fluxo.
5. Etapas e tentativas idempotentes.
6. Versões do conhecimento de cada agente.
7. Candidatos de texto e imagem.
8. Decisões de revisão.
9. Eventos de auditoria.

## Decisões arquiteturais

- O D1 é a fonte de verdade para estado estruturado.
- O R2 armazena os binários; o D1 guarda somente referências e metadados.
- IndexedDB permanece apenas como cache local de conveniência.
- Todas as tabelas desta solução usam o prefixo `studio_`, evitando conflito com o banco já existente no repositório.
- As camadas de domínio e aplicação continuam independentes de Cloudflare e OpenAI.
- As operações externas são acessadas somente por portas e adaptadores.
- Cada tentativa de etapa possui chave de idempotência única para impedir duplicação em reprocessamentos.

## Validação executada

- Migração gerada pelo Drizzle com as nove tabelas previstas.
- Verificação automática dos bindings D1 e R2.
- Teste de criação e auditoria de projeto.
- Teste de gravação combinada R2 + metadados.
- Teste de compensação quando o D1 falha.
- Testes da Fase 2 executados novamente para evitar regressões.
- Build completo de produção concluído.

Resultado: 8 testes aprovados, 0 falhas.

## Limites intencionais desta fase

- A interface pública ainda não consome esses repositórios.
- Não há painel administrativo nesta fase.
- Não há orquestração de agentes nesta fase.
- Não há novas chamadas à API da OpenAI.
- O acervo de materiais aprovados pertence à Fase 4.

## Arquivos

- `.openai/hosting.json`
- `drizzle.studio.config.ts`
- `db/studio-schema.ts`
- `drizzle/0000_next_kat_farrell.sql`
- `drizzle/meta/0000_snapshot.json`
- `drizzle/meta/_journal.json`
- `src/harmony-studio/domain/projects/ad-project.ts`
- `src/harmony-studio/domain/workflows/workflow-run.ts`
- `src/harmony-studio/application/ports/ad-project-repository.ts`
- `src/harmony-studio/application/ports/asset-storage.ts`
- `src/harmony-studio/application/ports/audit-event-repository.ts`
- `src/harmony-studio/application/ports/source-asset-repository.ts`
- `src/harmony-studio/application/ports/workflow-run-repository.ts`
- `src/harmony-studio/application/projects/project-service.ts`
- `src/harmony-studio/application/assets/source-asset-service.ts`
- `src/harmony-studio/infrastructure/persistence/d1-types.ts`
- `src/harmony-studio/infrastructure/persistence/d1-ad-project-repository.ts`
- `src/harmony-studio/infrastructure/persistence/d1-agent-knowledge-repository.ts`
- `src/harmony-studio/infrastructure/persistence/d1-audit-event-repository.ts`
- `src/harmony-studio/infrastructure/persistence/d1-source-asset-repository.ts`
- `src/harmony-studio/infrastructure/persistence/d1-workflow-run-repository.ts`
- `src/harmony-studio/infrastructure/storage/r2-asset-storage.ts`
- `src/harmony-studio/infrastructure/runtime/studio-bindings.ts`
- `tests/harmony-studio-persistence.test.mjs`
- `docs/architecture/HARMONY-STUDIO-FASE-3.md`

## Gate para aprovação

A Fase 3 está pronta se forem aceitos:

1. D1 como fonte de verdade do estado estruturado;
2. R2 para fotos e demais arquivos;
3. trilha de auditoria obrigatória;
4. recuperação de execuções interrompidas;
5. biblioteca curada de materiais aprovados somente na Fase 4.
