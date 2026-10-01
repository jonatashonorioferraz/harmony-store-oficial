# Central Operacional — piloto B0 em observação

Este documento define o recorte incremental autorizado em 01/10/2026, sobre a base `9188067`. O B0 reúne condições atuais de boletos e solicitações para todos os perfis administrativos ativos. Não constitui a entrega da memória histórica ou do briefing automático da proposta maior, nem significa que as fundações de recuperação estejam concluídas.

## Uso e limites do produto

Ao abrir a Central ou atualizar a consulta, o ADM recebe uma avaliação calculada no servidor, com data de referência de São Paulo, fontes consultadas, até três prioridades de leitura e a lista completa de condições. Cada condição explica a regra e identifica o objeto por protocolo e fatos de data. O botão “Abrir boletos” ou “Abrir solicitações” atualiza e abre a lista do módulo existente; o ADM localiza o protocolo informado. O B0 não promete abertura direta do detalhe. Alterações e decisões continuam nos módulos operacionais e sob suas permissões atuais.

O horizonte de vencimento é **hoje e amanhã em `America/Sao_Paulo`**. A idade das solicitações é tempo corrido desde `created_at`, sem calendário de trabalho, feriados ou SLA presumido. O relógio do aparelho não define o resultado.

A consulta é somente leitura: não cria ocorrências, tarefas, notificações, lançamentos ou históricos, não chama RPC de operação e não envia WhatsApp, push ou e-mail. Não agenda execução às 07:30 e não chama IA. Não mantém memória persistida da avaliação, reconhecimento por ADM, responsável, episódios ou comparação com consultas anteriores. A condição pode desaparecer na consulta seguinte quando sua origem mudar; isso não cria um evento histórico de resolução.

Todos os ADMs ativos têm acesso, incluindo administradores futuros. O acesso não é limitado aos dois usuários atuais nem ao administrador principal. Perfis inativos, colaboradores, recebedores e gestores de e-commerce que não sejam ADM não têm acesso. Ocultar o menu é conveniência da interface; a autorização é obrigatória no servidor.

## Regras `b0.1`

| Regra | Condição verificável | Significado e limite |
| --- | --- | --- |
| FIN-01 | Boleto `pending` com `due_date` anterior à data de referência | Vencido e ainda pendente no app. Não comprova dívida em aberto no banco nem falha de pagamento. |
| FIN-02 | Boleto `pending` com `due_date` igual a hoje ou amanhã | Atenção ao vencimento cadastrado. Hoje e amanhã são categorias distintas; o mesmo boleto não aparece também em FIN-01. |
| REQ-01 | Solicitação em `pending`, `separating` ou `scheduled` | Exibe tempo corrido desde a criação. Não afirma ausência de leitura pelo ADM, tempo em cada etapa ou SLA descumprido. |
| REQ-02 | Solicitação `scheduled` com `scheduled_for` anterior ao instante de avaliação | Agendamento ultrapassado; conferir andamento. Compara instantes, não apenas a data, e não prova atraso físico na entrega. |
| DAT-01 | Fonte indisponível, inválida ou incompleta | A avaliação daquele domínio é desconhecida. Erro, truncamento ou campo inválido não equivale a zero pendências. |

Boletos `paid` e `cancelled` ficam fora das condições financeiras. Solicitações `delivered` e `cancelled` ficam fora das condições abertas. Valores monetários, nomes de pessoas, CPF/CNPJ, documentos, telefone e descrição livre não são necessários a este recorte nem retornam na avaliação.

REQ-01 e REQ-02 podem coexistir para uma solicitação. Contagens de objetos e contagens de condições têm nomes distintos; a mesma solicitação não duplica o total de abertas ou ocupa duas posições nas três prioridades. A ordenação é determinística: qualidade da fonte, FIN-01, REQ-02, FIN-02 de hoje, FIN-02 de amanhã e, por fim, REQ-01 das mais antigas. Empates usam uma chave estável. Essa ordem orienta a leitura, sem representar criticidade financeira, impacto econômico ou prioridade formal da empresa.

## Contrato de leitura

O endpoint `operational-central` recebe uma consulta autenticada (`POST` sem comandos operacionais). Usa o JWT do solicitante, confirma o usuário e o perfil ADM ativo, lê com as políticas RLS existentes e revalida o perfil antes de devolver o resultado. Não usa a chave de serviço para contornar a autorização. Respostas e caches intermediários não devem conservar fatos para outros usuários.

Campos mínimos das origens:

- `bills`: `id`, `protocol`, `status`, `due_date` e `updated_at`.
- `requests`: `id`, `protocol`, `status`, `created_at`, `scheduled_for` e `updated_at`.

O contrato de resposta inclui `schema_version`, `rules_version`, `evaluation_id`, `evaluated_at`, `business_date`, `timezone`, `capture_started_at`, `capture_finished_at`, `atomic_snapshot: false`, `sources`, `summary`, `priorities` e `conditions`. As versões iniciais são `b0.1`; mudanças de significado devem alterar a versão das regras. `evaluated_at` é o instante de avaliação e `business_date` a data de São Paulo derivada dele. Os campos `capture_started_at` e `capture_finished_at` informam o intervalo das leituras. A consulta de tabelas e páginas é sequencial e não oferece snapshot transacional, mesmo quando as contagens se mantêm iguais. `evaluation_id` identifica esta resposta; não é uma chave de histórico persistido.

Cada fonte declara `status` (`evaluated`, `unavailable`, `invalid` ou `incomplete`), `complete`, `row_count` ou `null`, `fetched_at` e `error_code` seguro, quando aplicável. `fetched_at` indica leitura da fonte; não comprova que toda atividade física foi lançada recentemente. `updated_at` é um campo mutável da origem, não o histórico imutável das transições. As condições identificam regra e objeto e incluem somente os fatos necessários à explicação e ao acesso à origem.

A leitura usa paginação ordenada, contagem conferida e limite explícito de 10.000 registros por fonte. Página incompleta, contagem divergente, chave duplicada, limite excedido ou campo obrigatório inválido impedem a avaliação do domínio afetado. Datas inválidas e criação no futuro não devem virar idade negativa ou zero artificial. A outra fonte pode continuar avaliada. Contadores de um domínio não avaliado são `null`, apresentados como indisponíveis, acompanhados de DAT-01. Uma fonte completa com zero registros pode, legitimamente, produzir zero condições.

Consultas concorrentes podem mudar conteúdo sem mudar contagem. O B0 não detecta toda essa mudança; informa a janela e o limite de consistência. Não chamar seu resultado de fotografia atômica, fechamento financeiro ou prova do estado passado.

## Interface e isolamento

A tela identifica o modo de observação, a data de referência, a hora da consulta e o estado de cada fonte. Distingue carregamento, fonte vazia, falha e resultado parcial. A ausência de condições só pode ser apresentada como tal para uma fonte avaliada integralmente. Uma atualização manual substitui o resultado; não existe polling, rotina automática ou histórico oculto neste recorte.

O módulo participa do isolamento de sessão existente: limpar fatos e tela no encerramento ou troca da sessão, ignorar respostas tardias, impedir resposta de outra conta e não guardar o conteúdo em `localStorage`. Ao abrir um módulo de origem, confirmar a sessão atual e atualizar sua lista sob as permissões vigentes; não executar uma operação pelo simples ato de abrir a Central. Protocolos e identificadores devem ser tratados como texto na renderização.

## Aceite da entrega

Os itens abaixo são requisitos de validação; esta lista não declara testes executados ou publicação concluída.

- Autorizar todos os ADMs ativos no servidor; negar ausência/expiração de JWT, perfil inativo e função inadequada, inclusive acesso direto ao endpoint.
- Usar a mesma data de São Paulo perto da meia-noite, com dispositivo em outro fuso; excluir pagos/cancelados e separar hoje, amanhã e vencidos sem sobreposição.
- Calcular idade a partir de `created_at`; comparar `scheduled_for` como instante; tratar valores inválidos sem fabricar atraso, leitura ou SLA.
- Agrupar condições da mesma solicitação nas prioridades; produzir ordenação repetível com a mesma entrada e instante.
- Buscar além da primeira página; recusar avaliação parcial em contagem divergente, duplicidade, falha de página ou limite excedido. Preservar `null` para fonte desconhecida.
- Manter o domínio saudável quando o outro falhar e explicar a qualidade antes das prioridades operacionais.
- Não reapresentar dados após logout, troca de conta, perda de permissão ou resolução tardia de uma consulta. Atualizar e abrir o módulo de origem somente na sessão válida, com o protocolo identificável na condição.
- Confirmar ausência de gravações, envio, cron, IA, migrations e persistência da avaliação. Validar contrato, UI, lint, build, espelhos e versões de recursos segundo o processo do repositório.

## Evolução e recuperação

O B0 pode operar sem um destino de restauração porque não introduz persistência ou mutações operacionais. Isso não elimina os limites do backup nem libera mudanças estruturais da memória histórica.

Antes de persistir ocorrências, histórico de avaliações ou entregas de briefing, concluir o caminho de recuperação isolada e seu ensaio fiel, revisar modelo de eventos, retenção, autorização e migrações. O [plano de ensaio SQL no CI](PLANO-ENSAIO-SQL-CI.md) prepara um primeiro teste sintético; ele não substitui a [recuperação isolada real](ENSAIO-RECUPERACAO-ISOLADA.md). Briefing às 07:30, WhatsApp, atribuição, reconhecimento, IA e novos domínios dependem de entregas posteriores explícitas.

## Pendências da base: automação da Agenda

A investigação de 01/10/2026 encontrou o workflow da Agenda ativo (`332459989`), configurado a cada 15 minutos (`*/15`). Na janela examinada, havia 13 execuções desde 29/09, todas com conclusão `success`. A última execução observada ocorreu às 17:06 UTC (14:06 de São Paulo), com `sent: 0`, `failed: 0` e uma tarefa examinada; as anteriores registradas em 01/10 foram às 10:28 e 03:42 UTC. [Execução observada 36896887026](https://github.com/jonatashonorioferraz/harmony-store-oficial/actions/runs/36896887026).

As lacunas observadas ocorrem antes da chamada da Edge Function. Sua causa interna no agendador do GitHub não foi determinada; o resultado `success` de uma execução não comprova frequência de 15 minutos nem entrega ou leitura de lembretes. Agendamentos do Actions podem sofrer atrasos, conforme a [documentação do GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Nesta entrega, o diagnóstico separa resultado da última execução de sua atualidade: após 30 minutos informa verificação atrasada e após uma hora, execução atrasada. Uma execução antiga não é descrita como “Operacional”. Essa correção de diagnóstico não conserta o agendamento e a investigação não disparou envios.

Trocar ou adicionar scheduler exige primeiro reserva de trabalho e idempotência antes do envio, para evitar entregas duplicadas em execuções concorrentes. As falhas de consulta hoje tratadas de forma insuficiente pelo fluxo de lembretes também precisam de correção própria. O B0 não depende dessa automação e não adiciona uma segunda rotina de envio.
