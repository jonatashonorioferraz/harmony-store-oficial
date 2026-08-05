# Harmony Studio — Fase 7: fluxo completo de agentes

## Resultado

A interface principal passou a executar o fluxo persistente do Harmony Studio. Um anúncio é iniciado com quatro fotografias reais, associado ao usuário autenticado e processado por 12 etapas coordenadas entre oito papéis especialistas.

## Fluxo implementado

1. Triagem dos dados obrigatórios.
2. Análise visual das quatro referências.
3. Estratégia para o marketplace.
4. Título e descrição com contrato estruturado.
5. Direção de arte com cinco briefings distintos.
6. Cinco produções visuais independentes, uma imagem por tentativa.
7. Revisão conjunta de conformidade.
8. Portão final de qualidade.

O pacote com título, descrição e cinco imagens só é exposto para download quando o portão de qualidade devolve aprovação formal.

## Persistência e recuperação

- O projeto, os dados do produto, as etapas e os resultados ficam registrados no D1.
- Originais e imagens geradas são persistidos no R2.
- A interface mantém o identificador do trabalho localmente e recupera o estado no servidor ao reabrir o aplicativo.
- Uma falha reprocessável cria nova tentativa somente para a etapa com erro.
- Cada operação de IA utiliza chave de idempotência e contabilização de uso.

## Segurança e isolamento

- Todas as rotas identificam o usuário autenticado pelos cabeçalhos fornecidos pelo Sites.
- Consultas de estado e arquivos verificam a propriedade do projeto no servidor.
- A chave da OpenAI permanece exclusivamente no ambiente do servidor.
- Cada especialista recebe apenas os campos autorizados para sua etapa.

## Validação

- 23 testes automatizados aprovados.
- Compilação de produção aprovada.
- A interface não chama mais as rotas antigas de geração direta.

## Limite deliberado desta fase

O painel para editar agentes, regras, versões, exemplos e parâmetros globais pertence à Fase 8. A Fase 7 entrega o fluxo operacional completo usando o Centro de Inteligência já versionado.
