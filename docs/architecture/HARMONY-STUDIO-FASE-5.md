# Harmony Studio — Fase 5: Orquestrador

Status: concluída, aguardando aprovação  
Escopo: coordenação determinística, isolamento de contexto, idempotência e reprocessamento; sem chamadas reais à OpenAI

## Entregas

- Plano padrão com oito etapas e oito responsabilidades especializadas.
- Dependências explícitas entre as etapas.
- Máquina de estados persistente para execução e tentativas.
- Montagem de contexto por lista positiva de campos permitidos.
- Conhecimento publicado e compatível obrigatório para executar uma etapa.
- Seleção limitada de até três referências relevantes da Biblioteca de Excelência.
- Chave de idempotência única por execução, etapa e tentativa.
- Registro do hash do contexto utilizado.
- Falhas normalizadas, auditadas e classificadas quanto à possibilidade de repetição.
- Reprocessamento exclusivo da última tentativa falha.
- Retomada a partir do estado persistido sem repetir etapas concluídas.
- Porta de execução independente do provedor de IA.

## Fluxo coordenado

1. Triagem.
2. Análise visual.
3. Estratégia de marketplace.
4. Copy.
5. Direção de arte.
6. Produção visual.
7. Revisão de conformidade.
8. Direção de qualidade.

Cada etapa recebe somente os objetos estruturados permitidos em seu contrato. Conversas completas, raciocínio interno e dados irrelevantes não são encaminhados.

## Isolamento de contexto

O `ContextBundle` contém apenas:

- identidade da etapa e do agente;
- versão publicada do conhecimento;
- missão, regras, proibições e checklist do agente;
- campos de entrada selecionados por caminho explícito;
- referências excelentes filtradas quando a etapa permite;
- contrato esperado de saída.

Uma propriedade presente no projeto, mas ausente da lista permitida, não entra no contexto.

## Idempotência e recuperação

- A primeira tentativa usa a chave `workflow:etapa:1`.
- Uma repetição válida cria `workflow:etapa:2` e preserva a tentativa anterior.
- Etapas concluídas não são recriadas.
- Dependências precisam estar concluídas antes de a próxima etapa ser liberada.
- Execuções sem conhecimento publicado ficam bloqueadas sem chamar integração externa.
- O estado é reconstituído a partir do D1, não da aba do navegador.

## Validação executada

- Confirmação dos oito agentes em contextos separados.
- Verificação de que um campo privado não autorizado não vaza para o agente.
- Referências excelentes presentes somente nas etapas autorizadas.
- Simulação de falha na estratégia.
- Nova tentativa apenas da estratégia.
- Preservação da triagem e da análise visual concluídas.
- Nova chave de idempotência para a repetição.
- Retomada completa a partir do estado persistido.
- Confirmação de que uma execução concluída não repete chamadas.
- Regressão das Fases 2, 3 e 4.
- Build completo de produção.

Resultado: 18 testes aprovados, 0 falhas.

## Limites intencionais desta fase

- A porta de execução usa simuladores nos testes.
- Nenhuma nova chamada à OpenAI foi adicionada.
- Modelos, limites, consumo e custos pertencem à Fase 6.
- A interface pública ainda utiliza o fluxo legado.
- A ativação integral dos agentes pertence à Fase 7.

## Arquivos

- `src/harmony-studio/domain/workflows/workflow-run.ts`
- `src/harmony-studio/domain/orchestration/workflow-plan.ts`
- `src/harmony-studio/domain/orchestration/context-bundle.ts`
- `src/harmony-studio/application/ports/orchestration-repository.ts`
- `src/harmony-studio/application/ports/stage-executor.ts`
- `src/harmony-studio/application/orchestration/workflow-orchestrator.ts`
- `src/harmony-studio/infrastructure/persistence/d1-orchestration-repository.ts`
- `src/harmony-studio/infrastructure/persistence/d1-workflow-run-repository.ts`
- `tests/harmony-studio-orchestrator.test.mjs`
- `docs/architecture/HARMONY-STUDIO-FASE-5.md`

## Gate para aprovação

A Fase 5 está pronta se forem aceitos:

1. oito etapas determinísticas;
2. seleção de contexto exclusivamente por lista permitida;
3. conhecimento publicado obrigatório;
4. idempotência por tentativa;
5. repetição somente da etapa falha;
6. integração real com OpenAI somente na Fase 6.
