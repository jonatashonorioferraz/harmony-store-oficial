# Harmony Studio — Fase 6: Integração com a API OpenAI

Status: concluída, aguardando aprovação  
Escopo: adaptadores OpenAI, modelos, contratos, orçamento, telemetria e erros; sem ativar o fluxo completo na interface

## Entregas

- Cliente HTTP OpenAI isolado da aplicação e do domínio.
- Executor compatível com a porta criada na Fase 5.
- GPT-5.6 Sol para as sete etapas textuais e de visão.
- Responses API com Structured Outputs e JSON Schema estrito.
- GPT Image 2 pela Image API direta para a produção visual.
- Exatamente uma imagem gerada por tentativa.
- Quatro imagens de referência obrigatórias na edição visual.
- Persistência imediata da imagem cobrada no R2 antes do retorno ao fluxo.
- Registro dos metadados da candidata no D1.
- Orçamento máximo por etapa e teto global por projeto.
- Livro-razão persistente de reservas de consumo.
- Tokens, modelo, identificador da requisição e parâmetros registrados por etapa.
- Erros normalizados por categoria e possibilidade de repetição.
- Repetição limitada somente para falhas transitórias.
- Mesma chave de idempotência preservada em cada repetição de transporte.

## Política de modelos

- `gpt-5.6-sol`: análise profissional complexa, estratégia, copy e revisão.
- `gpt-image-2`: geração e edição visual com as quatro referências reais.
- Esforço `low` para triagem e `medium` para etapas de julgamento profissional.
- Limites de saída e teto estimado definidos separadamente por etapa.
- A Image API direta evita o custo adicional de um modelo conversacional antes da imagem.

## Saídas estruturadas

Cada etapa possui um JSON Schema próprio, com:

- campos obrigatórios;
- enums para decisões;
- limites para notas;
- propriedades extras proibidas;
- parsing determinístico;
- falha explícita quando o provedor não respeita o contrato.

Isso substitui a extração frágil de JSON por expressão regular usada no fluxo legado.

## Proteção financeira

- Toda chamada reserva seu teto antes de alcançar a API.
- A mesma chave não cria duas reservas.
- O total reservado do projeto não pode ultrapassar o limite configurado.
- Uma produção visual solicita `n=1`.
- Uma resposta de imagem paga é armazenada imediatamente.
- Retentativas de rede reutilizam a mesma chave de idempotência.
- Crédito esgotado, limite financeiro e rate limit são problemas distintos.

## Erros normalizados

- autenticação;
- limite de requisições;
- créditos esgotados;
- limite financeiro da organização ou projeto;
- requisição inválida;
- segurança;
- timeout;
- indisponibilidade temporária;
- resposta inválida;
- orçamento interno excedido.

Somente timeout, rate limit e indisponibilidade transitória são automaticamente repetíveis.

## Validação executada

- Seleção dos modelos corretos.
- JSON Schema estrito na Responses API.
- Registro de tokens e identificador externo.
- Repetição transitória com a mesma chave.
- Diferenciação de erros HTTP 429.
- Uma única edição visual com quatro referências.
- Persistência imediata da imagem retornada.
- Livro-razão e migração D1 inspecionados.
- Regressão das Fases 2 a 5.
- Build completo de produção.

Resultado: 23 testes aprovados, 0 falhas e nenhuma chamada cobrada durante os testes.

## Referências oficiais consultadas

- OpenAI Model Guidance — GPT-5.6.
- OpenAI Structured Outputs.
- OpenAI Image Generation — GPT Image 2.
- OpenAI API Error Codes.

## Limites intencionais desta fase

- O novo executor ainda não está exposto pela interface pública.
- O fluxo legado permanece funcionando sem alterações.
- Não foi realizada chamada real paga durante os testes automatizados.
- A ativação ponta a ponta pertence à Fase 7.
- O painel de configuração pertence à Fase 8.

## Arquivos

- `db/studio-schema.ts`
- `drizzle/0002_daily_stranger.sql`
- `drizzle/meta/0002_snapshot.json`
- `drizzle/meta/_journal.json`
- `src/harmony-studio/application/ports/usage-budget.ts`
- `src/harmony-studio/application/ports/generated-asset-sink.ts`
- `src/harmony-studio/domain/orchestration/workflow-plan.ts`
- `src/harmony-studio/application/orchestration/workflow-orchestrator.ts`
- `src/harmony-studio/infrastructure/openai/openai-error.ts`
- `src/harmony-studio/infrastructure/openai/model-policy.ts`
- `src/harmony-studio/infrastructure/openai/stage-output-schemas.ts`
- `src/harmony-studio/infrastructure/openai/openai-http-client.ts`
- `src/harmony-studio/infrastructure/openai/openai-stage-executor.ts`
- `src/harmony-studio/infrastructure/persistence/d1-usage-budget.ts`
- `src/harmony-studio/infrastructure/persistence/d1-orchestration-repository.ts`
- `src/harmony-studio/infrastructure/storage/d1-r2-generated-asset-sink.ts`
- `tests/harmony-studio-openai-integration.test.mjs`
- `docs/architecture/HARMONY-STUDIO-FASE-6.md`

## Gate para aprovação

A Fase 6 está pronta se forem aceitos:

1. GPT-5.6 Sol nas etapas profissionais;
2. GPT Image 2 diretamente na etapa visual;
3. JSON Schema estrito em todas as saídas textuais;
4. teto financeiro e reserva antes da chamada;
5. uma única imagem por tentativa;
6. persistência imediata da imagem cobrada;
7. ativação do fluxo completo somente na Fase 7.
