# Harmony Studio — Fase 2: Centro de Inteligência

Status: concluída, aguardando aprovação  
Escopo: domínio, contratos, versionamento e catálogo inicial; sem OpenAI e sem persistência externa

## Entregas

- Entidade versionada de conhecimento por agente.
- Estados `draft`, `published` e `archived`.
- Validação de missão, regras, checklists e contratos.
- Publicação imutável com arquivamento automático da versão anterior.
- Porta de repositório independente da tecnologia de armazenamento.
- Implementação em memória para validar os casos de uso antes do D1.
- Catálogo inicial dos oito agentes aprovados na Fase 1.
- Separação explícita de contexto permitido e proibido.
- Contratos estruturados de entrada e saída.
- Testes do isolamento arquitetural e do ciclo de versionamento.

## Regras implementadas

1. Somente rascunhos podem ser publicados.
2. Somente versões publicadas podem ser arquivadas.
3. Publicar uma nova versão arquiva a versão ativa anterior.
4. Toda versão exige autor e motivo da alteração.
5. Missão, contexto permitido, regras, proibições, checklist e contratos são obrigatórios.
6. O domínio não depende de OpenAI, React, Next.js, Cloudflare, banco ou armazenamento.
7. O repositório é uma porta substituível; D1 será um adaptador da Fase 3.

## Agentes cadastrados

1. Triagem.
2. Analista visual.
3. Estrategista de marketplace.
4. Copywriter.
5. Diretor de arte.
6. Fotógrafo virtual.
7. Revisor de conformidade.
8. Diretor de qualidade.

## Validação executada

- Criação de primeira versão como rascunho.
- Publicação e recuperação da versão ativa.
- Criação de segunda versão.
- Publicação da segunda versão.
- Arquivamento automático da primeira.
- Recuperação do histórico completo.
- Confirmação de ausência de dependência com IA no Centro de Inteligência.
- Build de produção concluído.

Resultado: 3 testes aprovados, 0 falhas.

## Limites intencionais desta fase

- O repositório em memória não é usado pela aplicação publicada.
- Nenhum endpoint administrativo foi exposto.
- Nenhuma chamada de IA foi adicionada.
- Nenhum dado foi migrado.
- D1 e R2 continuam desativados até aprovação da Fase 3.
- A interface atual permanece inalterada.

## Arquivos

- `src/harmony-studio/domain/intelligence/agent-knowledge.ts`
- `src/harmony-studio/application/ports/agent-knowledge-repository.ts`
- `src/harmony-studio/application/intelligence/intelligence-center.ts`
- `src/harmony-studio/infrastructure/intelligence/in-memory-agent-knowledge-repository.ts`
- `src/harmony-studio/intelligence/catalog/default-agents.ts`
- `tests/harmony-studio-intelligence-center.test.mjs`
- `tsconfig.json`
- `docs/architecture/HARMONY-STUDIO-FASE-2.md`

## Gate para aprovação

A Fase 2 está pronta se forem aceitos:

1. os oito papéis iniciais;
2. o contrato comum de conhecimento;
3. versionamento imutável após publicação;
4. arquivamento automático da versão anterior;
5. implementação de persistência somente na Fase 3.

