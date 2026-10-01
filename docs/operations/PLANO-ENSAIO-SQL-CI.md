# Plano de ensaio SQL no CI — dados sintéticos

Planejamento registrado em 01/10/2026. **Não há importador SQL, workflow deste ensaio ou restauração real implementados por este documento.** O executor de recuperação atual permanece bloqueado antes de qualquer gravação remota.

## Objetivo e alcance

A próxima entrega pode provar mecanismos de carga e falha em PostgreSQL descartável dentro do GitHub Actions, sem projeto Supabase externo, credenciais de produção ou dados reais. Um serviço PostgreSQL no runner Linux fornece um banco isolado por execução. O consumo de minutos e armazenamento permanece sujeito ao plano e às cotas do repositório; não requer contratar um projeto Supabase pago. [GitHub: serviços PostgreSQL no Actions](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers).

Há três níveis diferentes de evidência:

| Nível | Ambiente e entrada | O que permite afirmar |
| --- | --- | --- |
| 1 — fixture PostgreSQL | Banco efêmero, schema reduzido explícito e dados sintéticos versionados | Os mecanismos cobertos de SQL, transação, constraints, gatilhos e sequências funcionam nesses casos. |
| 2 — stack Supabase local | Docker e CLI fixados, schema reconciliado e dados sintéticos | O fluxo funciona nos objetos, Auth, RLS e Storage efetivamente ensaiados nesse ambiente. |
| 3 — recuperação fiel | Destino dedicado aprovado, schema/configuração conferidos e pacote real autorizado | O pacote e as dependências examinados foram recuperados e reconciliados; RTO/RPO podem ser medidos com seus limites. |

A aprovação de um nível não aprova o seguinte. O nível 1 não cobre as 85 tabelas exportadas, as dependências externas ou os efeitos reais dos gatilhos da empresa. Nenhum resultado sintético autoriza marcar `recovery_ready` ou `recovery_verified` como verdadeiro em `system_backup_runs`, nem classificar a recuperação de produção como comprovada.

## Entrega executável proposta para o nível 1

Preparar em PR separado um workflow dedicado e três grupos de arquivos: schema/entrada sintéticos, executor SQL restrito à fixture e verificações independentes. Nomes sugeridos: `tests/fixtures/recovery-sql/`, `scripts/test-recovery-sql.mjs` e `.github/workflows/recovery-sql-fixture.yml`. Esses arquivos ainda não existem como resultado deste plano e não devem substituir o executor remoto bloqueado.

1. Criar um serviço PostgreSQL num runner Linux limpo, com imagem e versão fixadas, healthcheck e porta somente no contexto isolado da execução. Registrar `server_version` e o digest da imagem; a versão principal da produção precisa ser verificada antes de declarar equivalência. O primeiro ensaio é de mecanismos SQL, sem essa alegação.
2. Usar credencial descartável exclusiva do banco `harmony_recovery_fixture`. O executor deve aceitar somente o serviço local declarado pelo workflow, confirmar nome do banco e marcador da fixture, e falhar antes de escrever se faltar qualquer condição. Não carregar `.env`, aceitar URL arbitrária, conectar à produção, buscar backups remotos ou receber segredos do ambiente `recovery`.
3. Conceder ao workflow apenas as permissões de repositório necessárias para ler código. Usar ações fixadas em revisões auditadas; não executar esta tarefa privilegiada em `pull_request_target` com código não confiável. Não fornecer credenciais de serviço, destinos reais, integrações ou saídas operacionais.
4. Criar uma fixture reproduzível, carregar o caso de sucesso e verificar os invariantes descritos abaixo. Usar listas explícitas de colunas e tipos, uma conexão por transação e falha de SQL propagada ao processo (`psql -X -v ON_ERROR_STOP=1`, ou cliente com comportamento equivalente).
5. Executar os cenários de erro em bancos descartáveis independentes. Depois de cada erro, verificar o estado por nova conexão, sem confiar apenas na exceção capturada pelo executor. Descartar o banco ao final, inclusive em falha.
6. Publicar somente relatório sintético com SHA do commit, versões, hash da fixture, cenários, contagens esperadas/observadas, invariantes, configuração de gatilhos e estado de sequências. Não publicar DSN, senhas, dados pessoais ou artefato real. Registrar a duração como duração da fixture, nunca como RTO operacional.

O executor desse nível deve ser deliberadamente incapaz de importar um pacote de produção. A evolução para schema real exige nova revisão, não apenas remover o teste do nome do banco.

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

O catálogo e a integridade do backup têm verificações automatizadas; o importador REST permanece desativado. Este documento torna concreta a próxima entrega de ensaio SQL sintético. **Ainda não comprova execução de SQL de restauração, ROLLBACK em PostgreSQL, recuperação fiel, RTO ou RPO.** Registrar a execução futura com seus artefatos e escopo antes de alterar esse estado.
