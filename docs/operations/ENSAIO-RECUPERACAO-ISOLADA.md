# Recuperação isolada: procedimento pendente de ensaio real

O importador REST anterior foi desativado. Ele não preservava com segurança identidades e sequências e podia repetir efeitos de gatilhos ao inserir históricos. Contagens iguais e hashes válidos não demonstram restauração fiel.

`scripts/execute-api-recovery.mjs` é um bloqueio explícito: verifica configuração e, quando recebe um pacote atual, exibe os impedimentos, termina com erro e faz zero gravações. O workflow manual `Preflight da recuperação isolada (SQL pendente)` falha antes de criar uma nova cópia de produção. Não remover esse bloqueio para obter um workflow verde.

## Destino e autorização

A produção `tyzfznwvjzmudxtcbbaf` é sempre bloqueada. O antigo destino fixo `jwluqaycxoeyraxsleri` também é bloqueado: na consulta de 01/10/2026 estava INACTIVE e sem confirmação de reserva exclusiva para recuperação. Não o reativar, reutilizar ou escrever nele por este procedimento.

Antes de qualquer ensaio real, confirmar um projeto ativo, dedicado e descartável, sua organização, responsável, custo e ausência de uso operacional. Configurar a variável `RECOVERY_PROJECT_REF`, o segredo `RECOVERY_SUPABASE_URL` e a confirmação `RESTORE_ISOLATED_HARMONY` no ambiente protegido `recovery`. Essas variáveis não desbloqueiam o importador. Credenciais SQL administrativas específicas do destino e um plano aprovado ainda são necessários; não ampliar GRANTs da produção para contornar o bloqueio.

## Evidências exigidas antes da primeira gravação

- Artefato íntegro, cobertura atual e SQL versionado correspondente. Um pacote v1 ou sem tabela não pode iniciar restauração.
- Schema real do destino comparado a colunas, tipos, defaults, identity/generated, FKs, índices únicos, funções, RLS, grants, seeds e migrations da origem. O manifesto atual não comprova ausência de drift no banco vivo.
- Inventário de todas as tabelas com contagem independente da existência de uma coluna `id`: configurações singleton e tabelas com chave composta precisam funcionar. Reconciliar explicitamente seeds de categorias, configurações de IA, cores e demais dados criados nas migrations; não aceitar um destino pré-povoado por suposição.
- Plano de Auth que preserve IDs ou remapeie todas as referências, inclusive perfis e nomes/URLs de objetos Storage. O inventário Auth não contém senhas recuperáveis nem substitui sua configuração. Definir recuperação de acesso e testar RLS por perfil.
- Inventário separado de configurações de Storage, Auth, Edge Functions, secrets, Vault, cron e integrações. Manter agendas, push, notificações, e-mail e outras saídas desativadas no ambiente isolado até aprovação.
- Relatório de inconsistências da extração sequencial. As FKs locais são verificadas no pacote atual, mas saldos, métricas derivadas e alterações simultâneas ainda precisam de reconciliação.

## Caminho SQL a preparar e revisar

Este documento não é um importador SQL executável. Uma etapa futura deve preparar scripts para o destino dedicado e testá-los com fixtures antes de dados reais:

1. Isolar saídas externas e registrar o estado inicial. Preparar schema e seeds de modo reproduzível.
2. Preservar os valores de identity/protocolos existentes, tratar colunas generated segundo o schema e não deixar o banco criar outros IDs. Não remover `protocol` ou IDs de eventos para fazer INSERT passar.
3. Definir controle explícito dos gatilhos de negócio e auditoria durante a carga, com restauração garantida de suas configurações. Não usar replay das ações de negócio para importar o estado final. Há dependências além de FK: itens de compra validam vínculo fornecedor/produto e recebimentos validam catálogo de cores por nome. Movimentos e guards dependem do estado atual.
4. Usar a ordem de FKs do catálogo como insumo inicial, revisar dependências não declaradas e revalidar restrições. Não supor que todas as FKs são deferrable nem que ausência de ciclo torna o replay seguro.
5. Importar os dados públicos em transação SQL e provocar uma falha deliberada numa fixture para provar ROLLBACK sem linhas ou eventos residuais. Reconciliar eventos, auditoria, notificações, ledger de atendimento, lotes, calendário e saldos sem duplicá-los.
6. Preservar/avançar sequências segundo seu estado original. Inclui a sequência independente `production_inventory_box_number_seq`: o maior `box_number` ainda visível não prova o maior número já emitido. Linhas excluídas e tentativas revertidas podem ter consumido números. A API não captura esse estado; obter evidência própria ou bloquear promoção para evitar reutilização.
7. Auth e Storage não participam da mesma transação SQL. Planejar compensação/descarte do destino se uma fase falhar. Conferir bytes/hashes por objeto, nomes originais, referências e acesso por perfil.
8. Após a carga, comparar chaves e conteúdo relevante, contagens, FKs, checks, unicidade e invariantes funcionais. Só então medir RTO/RPO do ensaio, registrar responsável e decidir sobre eventual promoção em uma autorização separada.

## O que foi testado nesta entrega

Testes locais usam dados sintéticos e chamadas de API simuladas. Cobrem inclusão das tabelas novas, chaves compostas/singleton, hashes, paginação, FK órfã, paths Storage, pacotes históricos, regressão de schema e bloqueio antes de qualquer gravação. A análise seca independe de conexão ou credenciais.

**Não houve restauração real, teste de ROLLBACK em PostgreSQL, medição de RTO, cópia de dados pessoais ou validação de um destino dedicado.** O teste de pacote anterior comprova rejeição de cobertura incompleta; não comprova rollback transacional. A base mantém esse limite explícito até a execução do procedimento isolado.

## Próxima etapa planejada — fixture SQL em CI

O [plano de ensaio SQL no CI](PLANO-ENSAIO-SQL-CI.md) separa três níveis: mecanismos em PostgreSQL sintético, stack Supabase local sintética e recuperação fiel autorizada. O primeiro pode rodar num serviço descartável do GitHub Actions sem projeto externo pago; não usa segredos ou dados da produção e não desbloqueia o executor atual.

O teste de falha previsto no passo 5 deve comprovar reversão de linhas e eventos transacionais, não reversão de sequências: `nextval` e `setval` podem deixar o estado avançado após ROLLBACK. A aceitação exige não reutilizar números consumidos. O estado da sequência independente de caixas continua sendo uma lacuna do pacote API que precisa de evidência adicional antes de promoção real.

Este acréscimo registra um plano concretamente executável em entrega posterior. Nenhum desses níveis foi realizado por este documento; permanecem válidos os limites da seção anterior. Uma eventual recuperação fiel em ambiente local dedicado também precisará de autorização, proteção dos dados, capacidade, configuração e reconciliação equivalentes; não é autorizada a importação de dados reais em CI.
