# Plano de ensaio SQL no CI — dados sintéticos

Nível 1 executado e aprovado em 01/10/2026: 15 cenários no PostgreSQL descartável do CI, com evidência registrada abaixo. O workflow e o executor são restritos a dados sintéticos. **Não há importador SQL de backups reais.** O executor de recuperação remota permanece bloqueado antes de qualquer gravação.

## Objetivo e alcance

O ensaio verifica mecanismos de carga e falha em PostgreSQL descartável dentro do GitHub Actions, sem projeto Supabase externo, credenciais de produção ou dados reais. Um serviço PostgreSQL no runner Linux fornece bancos isolados por cenário. O consumo de minutos e armazenamento permanece sujeito ao plano e às cotas do repositório; não requer contratar um projeto Supabase pago. [GitHub: serviços PostgreSQL no Actions](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers).

Há três níveis diferentes de evidência:

| Nível | Ambiente e entrada | O que permite afirmar |
| --- | --- | --- |
| 1 — fixture PostgreSQL | Banco efêmero, schema reduzido explícito e dados sintéticos versionados | Os mecanismos cobertos de SQL, transação, constraints, gatilhos e sequências funcionam nesses casos. |
| 2 — stack Supabase local | Docker e CLI fixados, schema reconciliado e dados sintéticos | O fluxo funciona nos objetos, Auth, RLS e Storage efetivamente ensaiados nesse ambiente. |
| 3 — recuperação fiel | Destino dedicado aprovado, schema/configuração conferidos e pacote real autorizado | O pacote e as dependências examinados foram recuperados e reconciliados; RTO/RPO podem ser medidos com seus limites. |

A aprovação de um nível não aprova o seguinte. O nível 1 não cobre as 85 tabelas exportadas, as dependências externas ou os efeitos reais dos gatilhos da empresa. Nenhum resultado sintético autoriza marcar `recovery_ready` ou `recovery_verified` como verdadeiro em `system_backup_runs`, nem classificar a recuperação de produção como comprovada.

## Implementação executável do nível 1

O workflow [recovery-sql-fixtures.yml](../../.github/workflows/recovery-sql-fixtures.yml) roda automaticamente em PRs que alteram seus arquivos, também em pushes correspondentes à main e por acionamento manual. Usa PostgreSQL `16.15-bookworm` fixado por digest, Node 22 e ações fixadas por SHA. O cliente `psql` precisa existir no runner Ubuntu 24.04; a etapa inicial verifica essa dependência, sem instalação global. A versão do servidor e do cliente entram no relatório. Não se declara equivalência com a versão ou o schema de produção.

Os arquivos em [scripts/recovery-sql](../../scripts/recovery-sql/) são `schema.sql` (schema reduzido, seeds e evidência de sequência), `prepare.sql` (preflight/transação), `load.sql` (entrada literal sintética), `finish.sql` (reativação/avanço de sequências/commit), `observe.sql` (leitura independente) e `run.mjs` (orquestração e asserções). [recovery-sql-fixtures.test.mjs](../../tests/recovery-sql-fixtures.test.mjs) verifica as guardas sem conexão. O executor REST remoto não é chamado nem substituído.

1. O serviço expõe somente `127.0.0.1:55432`, com healthcheck. Sua senha pública e descartável não é segredo operacional. O job possui somente `contents: read`, checkout sem credencial persistida e nenhum environment ou secret de produção.
2. O runner exige `RECOVERY_SQL_FIXTURE=synthetic-only-v1` e `RECOVERY_FIXTURE_PORT=55432`. Rejeita argumentos, URLs, arquivos externos e bancos fora da lista fechada; não lê `.env`. Os subprocessos recebem ambiente de conexão fechado, ignorando `DATABASE_URL`, `PGHOST`, `PGSERVICE`, `PGPASSFILE` e variáveis Supabase herdadas.
3. Antes do schema, o preflight confirma banco/role fixos, PostgreSQL 16 e ausência de relações ou schemas de usuário além de `public`. A rotina SQL exige marcador sintético, seeds exatos, destino vazio, gatilhos nomeados e evidência das três sequências. Nenhum dado real pode ser passado como entrada.
4. Cada carga usa uma conexão e uma transação com timeouts, locks nas tabelas da fixture, listas explícitas de colunas e `psql -X -v ON_ERROR_STOP=1`. Apenas o gatilho `record_parent` é temporariamente desativado; o guard de catálogo, FKs e checks permanecem ativos.
5. Os cenários de erro usam bancos independentes. O runner exige SQLSTATE esperado e saída de erro SQL, distinguindo falha de conexão. Observa as linhas, eventos, constraints, gatilhos e sequências por novo processo/conexão. O encerramento do serviço pelo Actions descarta todos os bancos, inclusive após falha.
6. Somente `outputs/recovery-sql-fixtures/report.json` é publicado por 14 dias. Contém SHA, versões, hash dos cinco arquivos SQL, cenários, valores sintéticos esperados/observados, estado dos gatilhos/sequências e duração da fixture. Mantém `recovery_ready: false` e `recovery_verified: false`. Não contém DSN, ambiente, senha, stderr arbitrário ou pacote real. A duração não é RTO.

O executor desse nível é deliberadamente incapaz de importar um pacote de produção. Seu helper de sequências aceita apenas três nomes sintéticos, incremento 1, cache 1 e ausência de ciclo. A evolução para schema real exige nova revisão, não apenas remover o teste do nome do banco; também precisa tratar concorrência, configurações de sequência e dependências reais.

## Fixture e critérios verificáveis

| Caso | Preparação e verificação independente |
| --- | --- |
| Identidades e protocolos | Colunas `GENERATED ALWAYS AS IDENTITY` recebem os IDs originais com `OVERRIDING SYSTEM VALUE`; preservar UUID, protocolo e vínculos. Um caso sem a opção deve falhar, comprovando que o teste exercita a restrição. |
| Colunas calculadas | Uma coluna generated deriva um valor numérico. O executor omite essa coluna da carga; o resultado deve corresponder ao valor esperado, sem tentar sobrescrever o cálculo. |
| Chaves diferentes | Incluir tabela singleton e tabela com PK composta sem coluna `id`. Comparar conjunto de chaves e conteúdo, além da contagem. |
| FKs imediatas | Importar pai antes de filho, mantendo constraints ativas. Incluir referência órfã e ordem inválida que devem falhar; não pressupor FKs deferrable. |
| Seeds | Declarar seeds esperados e um conflito deliberado. Um seed inesperado deve bloquear a carga; a política aprovada de reconciliação deve ser explícita e testada, sem apagar dados por suposição. |
| Gatilhos de negócio/auditoria | Inserção normal gera evento na fixture. Durante a importação do estado e dos eventos já existentes, aplicar controle somente aos gatilhos de negócio nomeados e conferidos; validar ausência de eventos duplicados e restauração da configuração no sucesso e na falha. Manter FKs e checks ativos; proibir desabilitação global de gatilhos. |
| Dependência além de FK | Simular validação de vínculo de catálogo ou fornecedor/produto. Ordem topológica não basta: o pré-requisito ausente precisa falhar de forma explicada. |
| Falha no meio da carga | Após inserir pai, filho e evento, provocar erro de constraint antes do COMMIT. Nova conexão deve ver exatamente as linhas e os eventos anteriores à tentativa, sem resíduos da transação. |
| Sequências | Incluir identity e sequência independente análoga a `production_inventory_box_number_seq`. Consumir número alto e retirar a linha correspondente: `max(coluna)` deve ficar menor que o maior número emitido. A recuperação precisa do estado explícito da sequência e o próximo número deve superar o já consumido. |
| Sequências na falha | Consumir `nextval` e executar `setval` numa tentativa que termina em ROLLBACK. Verificar que linhas/eventos revertem, mas os números consumidos não são reutilizados e o estado da sequência pode permanecer avançado. |
| Valores e tempo | Preservar UUID, `numeric` como valor exato, datas e `timestamptz`, sem transformar inteiros grandes em `Number` impreciso nem ajustar vencimento por fuso do runner. |
| Reexecução e destino | Repetir a tentativa num destino já carregado deve falhar no preflight de destino não vazio, salvo contrato explícito posterior de idempotência; não duplicar histórico nem fazer UPSERT silencioso. |

PostgreSQL exige tratamento específico de identidades e colunas geradas em INSERT. O plano deve usar o schema inspecionado, não remover IDs para contornar o erro. [PostgreSQL: INSERT](https://www.postgresql.org/docs/16/sql-insert.html).

**ROLLBACK não desfaz avanços de `nextval` ou alterações de `setval`.** A garantia testável é reversão das linhas e dos eventos transacionais, com não reutilização dos números consumidos. Não declarar “zero efeitos” globais e não rebobinar sequências para imitar o estado anterior à tentativa. A API atual não exporta esse estado; sem sua obtenção e reconciliação, promoção real continua bloqueada. [PostgreSQL: funções de sequência](https://www.postgresql.org/docs/current/functions-sequence.html).

## Passagem ao Supabase local e à recuperação fiel

A CLI pode iniciar uma stack Supabase local com Docker, inclusive em CI. Isso oferece um caminho de nível 2 sem projeto remoto pago. A configuração local deve ser criada numa pasta temporária dedicada, com CLI/imagens fixadas e serviços limitados ao ambiente de ensaio. Ainda é preciso preparar e revisar essa configuração; as migrations da empresa não devem ser aplicadas indiscriminadamente a PostgreSQL puro como se Auth, Storage e extensões já estivessem presentes. [Supabase: desenvolvimento local e CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).

Antes desse nível, inventariar requisitos das migrations, extensões, esquemas `auth`/`storage`, grants, RLS, seeds, funções e gatilhos. Conferir que cron, webhooks, notificações, e-mail e integrações ficam desativados ou substituídos por destinos de teste locais. Testar perfis sintéticos autorizados e não autorizados e bytes/hashes de objetos Storage; Auth e Storage exigem compensação ou descarte do destino quando a fase SQL falha.

O nível 3 permanece condicionado ao [procedimento isolado](ENSAIO-RECUPERACAO-ISOLADA.md): autorização do pacote real e destino, comparação do schema vivo, estado de sequências, dependências externas, proteção dos dados e reconciliação operacional. Um ambiente local dedicado também pode ser avaliado para essa finalidade, com isolamento e capacidade comprovados; isso não autoriza copiar dados reais para runners públicos ou artefatos de CI. O custo e a adequação do destino serão decididos com evidências, sem usar a ausência de projeto remoto pago para bloquear o piloto de leitura da Central.

## Estado registrado

O catálogo e a integridade do backup têm verificações automatizadas; o importador REST permanece desativado. Nesta implementação, os cinco testes Node de guardas passaram e o lint dos arquivos JavaScript passou localmente. O computador de trabalho não dispõe de PostgreSQL/psql ou Docker para executar o ensaio; nenhuma dependência global foi instalada.

**Execução SQL aprovada:** [run 36933716057, job postgres-fixtures](https://github.com/jonatashonorioferraz/harmony-store-oficial/actions/runs/36933716057/job/110608913207), concluído em 01/10/2026 às 22:13 UTC. Os logs e o relatório confirmam 15 resultados aprovados: gatilho normal, carga fiel da fixture, reexecução bloqueada, próximos números, dez falhas controladas e sequência já adiantada. As cinco verificações Node também passaram no runner.

| Evidência | Valor observado |
| --- | --- |
| PR e head de origem | PR #99, `c9165b69ef22f7bb5bc8d1156c16eefed21e272b` |
| Commit efetivamente ensaiado | `4a9c467bc3e5801fbc3a37db89e4480e7e440c96`, merge temporário do PR sobre `80f516d8c80c8171267871ef303affcb88807bc3` |
| Servidor | PostgreSQL `16.15 (Debian 16.15-1.pgdg12+2)` |
| Cliente | `psql (PostgreSQL) 16.15 (Ubuntu 16.15-1.pgdg24.04+2)` |
| SHA-256 dos cinco arquivos SQL normalizados | `da10fb304f5190dcb9cf880649eb1e8e4b68fbb749bc71a1a7519ef62811c47a` |
| Relatório | [recovery-sql-fixtures-36933716057, artefato 11196204045](https://github.com/jonatashonorioferraz/harmony-store-oficial/actions/runs/36933716057/artifacts/11196204045), expiração prevista em 15/10/2026 |
| Duração do executor sintético | 3263 ms; não representa RTO operacional |

No caso `check_rollback`, a nova conexão confirmou reversão das linhas e eventos, restauração da configuração dos gatilhos e sequência ainda em 9000; a asserção do próximo número 9001 passou. No caso da caixa excluída, a captura preservou o maior número consumido 7777 apesar de o maior número visível ser 400, e o próximo número observado foi 7778. Uma sequência de destino já em 9500 permaneceu avançada e produziu 9501.

Essa evidência aprova os mecanismos do nível 1 para os arquivos e o commit indicados. O relatório mantém `recovery_ready: false` e `recovery_verified: false`. **Recuperação fiel das 85 tabelas, Auth, Storage, RLS e gatilhos de produção, RTO e RPO continuam não comprovados**; novos commits precisam dos próprios checks, e este registro histórico não os substitui.
