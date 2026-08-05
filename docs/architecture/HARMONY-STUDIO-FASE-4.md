# Harmony Studio — Fase 4: Biblioteca de Excelência

Status: concluída, aguardando aprovação  
Escopo: acervo curado de materiais aprovados; sem orquestração automática de agentes

## Entregas

- Entidade de referência excelente com procedência completa.
- Entrada permitida somente para candidato aprovado e decisão formal de revisão aprovada.
- Registro obrigatório do contexto, decisões criativas e motivo da aprovação.
- Classificação por tipo de material, marketplace, categoria, agente e etiquetas.
- Prevenção de duplicidade: um candidato só pode originar uma referência.
- Retirada reversível do acervo, sem apagar o histórico.
- Busca somente entre referências ativas, com limite protegido.
- Auditoria obrigatória para inclusão e retirada.
- Repositórios D1 independentes da camada de aplicação.
- Migração incremental da décima tabela do Harmony Studio.

## Critério de entrada

Um item só entra na Biblioteca quando todas as condições forem verdadeiras:

1. existe um candidato produzido e persistido;
2. o candidato está com status `approved`;
3. existe uma decisão de revisão com resultado `approved`;
4. o contexto de utilização foi registrado;
5. as decisões que levaram ao bom resultado foram explicadas;
6. há um motivo claro de aprovação;
7. autor e data da curadoria são conhecidos.

## Uso futuro

- O acervo fornece exemplos relevantes ao orquestrador.
- A busca pode ser filtrada por tipo, marketplace, categoria e agente.
- Os itens servem como referência contextual, não como instrução fixa.
- Referências retiradas permanecem auditáveis, mas não aparecem em buscas ativas.
- A seleção dinâmica dessas referências pertence à Fase 5.

## Modelo persistente

Tabela `studio_excellence_items`, relacionada a:

- projeto de origem;
- candidato aprovado;
- decisão de revisão;
- tipo do artefato;
- contexto e decisões;
- motivo de aprovação;
- responsável pela curadoria.

Índices foram criados para as consultas reais por tipo, marketplace, categoria e estado.

## Validação executada

- Inclusão de candidato formalmente aprovado.
- Bloqueio de candidato ainda pendente.
- Bloqueio de decisão que solicita alterações.
- Bloqueio de duplicidade.
- Normalização e deduplicação de etiquetas.
- Retirada sem exclusão do registro.
- Exclusão de itens retirados das buscas ativas.
- Inspeção da migração e dos índices.
- Regressão das Fases 2 e 3.
- Build completo de produção.

Resultado: 14 testes aprovados, 0 falhas.

## Limites intencionais desta fase

- A biblioteca ainda não é consultada automaticamente por agentes.
- Nenhuma seleção de contexto foi implementada.
- Nenhuma chamada adicional à OpenAI foi criada.
- A interface administrativa pertence à Fase 8.
- O orquestrador pertence à Fase 5.

## Arquivos

- `db/studio-schema.ts`
- `drizzle/0001_many_king_cobra.sql`
- `drizzle/meta/0001_snapshot.json`
- `drizzle/meta/_journal.json`
- `src/harmony-studio/domain/excellence/excellence-item.ts`
- `src/harmony-studio/application/ports/excellence-library-repository.ts`
- `src/harmony-studio/application/ports/excellence-source-reader.ts`
- `src/harmony-studio/application/excellence/excellence-library-service.ts`
- `src/harmony-studio/infrastructure/persistence/d1-excellence-library-repository.ts`
- `src/harmony-studio/infrastructure/persistence/d1-excellence-source-reader.ts`
- `tests/harmony-studio-excellence-library.test.mjs`
- `docs/architecture/HARMONY-STUDIO-FASE-4.md`

## Gate para aprovação

A Fase 4 está pronta se forem aceitos:

1. entrada somente após aprovação formal;
2. procedência e motivo de aprovação obrigatórios;
3. referências como inspiração contextual, nunca regra fixa;
4. retirada sem apagamento do histórico;
5. seleção dinâmica do acervo somente na Fase 5.
