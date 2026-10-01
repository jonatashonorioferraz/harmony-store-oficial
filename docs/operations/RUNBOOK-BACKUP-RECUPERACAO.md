# Backup: cobertura, verificação e recuperação

A cópia externa diária é uma exportação lógica por API. Sucesso significa arquivos íntegros, descriptografia verificada e cobertura do catálogo revisado. **Não significa restauração comprovada.** A captura usa leituras sequenciais, não um snapshot transacional do PostgreSQL.

## Cobertura e retenção

O contrato único está em `scripts/backup-catalog.mjs`, auditado nos metadados de produção em 01/10/2026. Abrange 86 tabelas públicas: 85 exportadas e uma exclusão explícita. Inclui lotes e eventos, códigos de colaborador, calendário comercial, telemetria, transferências e `internal_supply_request_item_fulfillments`.

`commercial_calendar_validation_authorizations` contém autorização temporária de execução. Não é exportada nem reproduzida. O destino deve receber autorização nova, com prazo novo, depois de ativado pelo procedimento próprio. A exclusão consta do manifesto; nenhuma permissão de produção é ampliada para exportá-la.

`system_events` e `system_backup_runs` exportam todas as linhas retidas. `app_usage_sessions` exporta o que ainda existe após a retenção de 180 dias da aplicação. As demais tabelas exportam todas as linhas presentes. Esta entrega não elimina dados de produção. O artefato criptografado permanece 30 dias no GitHub Actions; retenção do artefato e retenção na origem são políticas diferentes.

As 85 tabelas tinham SELECT para service_role na auditoria; o exportador falha se qualquer leitura/paginação falhar. Várias tabelas não permitem INSERT direto. Leitura autorizada não autoriza nem garante restauração pela Data API.

## Rotina automática

1. Executa às 03:17 UTC, sob demanda e após mudanças relevantes na main.
2. Confere o catálogo contra os nomes e o conteúdo das migrations versionadas antes de qualquer leitura remota. Mudanças de schema exigem revisar metadados, políticas e digest no catálogo.
3. Exporta por chave primária determinística, verifica a contagem exata em cada página e captura o inventário Auth e arquivos Storage. Inteiros sem precisão segura em JSON interrompem a captura.
4. Inclui os SQL das migrations, contagens, janela de captura, política de exclusão e SHA-256 de cada arquivo no manifesto v2. Objetos Storage usam caminhos locais derivados por hash, preservando o nome original no manifesto.
5. Verifica hashes, tamanhos, contagens, chaves primárias simples/compostas, IDs Auth, referências FK conhecidas e objetos Storage. Uma FK órfã interrompe o backup; aprovação destas verificações não prova consistência temporal ou regras de negócio.
6. Compacta e criptografa com AES-256-CBC/PBKDF2, descriptografa uma cópia temporária e verifica novamente a cobertura atual.
7. Guarda somente o artefato criptografado por 30 dias e registra estatísticas de cobertura, integridade e `recovery_ready: false`. O próprio registro desta execução ocorre após a captura e estará numa próxima cópia.

Segredos necessários: `SUPABASE_BACKUP_SECRET_KEY` e `BACKUP_ENCRYPTION_PASSWORD`. Não são conteúdo de documentação, log ou commit. A troca desses segredos é uma operação separada. Não foi realizada exportação de produção durante os testes desta alteração.

## Verificação local sem gravação remota

Em pasta administrativa protegida, baixe o artefato, confira o hash e descriptografe. Execute:

```text
node scripts/verify-api-backup.mjs PASTA --require-current
node scripts/restore-api-backup.mjs PASTA --require-current
```

O primeiro comando valida os arquivos e o catálogo atual. O segundo gera um plano de leitura, dependências e bloqueios; não solicita credenciais, não usa rede e não altera o banco.

Um pacote v1 pode ser examinado omitindo `--require-current`. Ele informa cobertura histórica/incompleta e nunca recebe prontidão de restauração. Migrations antigas listadas apenas pelo nome não demonstram a identidade do schema. Não complete um pacote antigo com tabelas vazias para fazê-lo passar como atual.

A classificação separa `integrity_valid`, `coverage.complete_for_current_catalog` e `recovery_ready`. Nenhum verificador desta entrega informa restauração pronta. O workflow manual de recuperação falha no preflight antes de buscar dados da produção, até existir um caminho SQL isolado revisado.

## Limites e resposta a incidentes

A rotina diária tem objetivo de frequência de 24 horas, mas o RPO efetivo depende do último artefato válido e da consistência da captura. O antigo objetivo de RTO de oito horas não está comprovado: medir em ensaio real antes de assumir compromisso.

A API não preserva o estado das sequências, as senhas Auth, configuração externa de Auth/Storage, secrets de Edge Functions, Vault, cron e integrações. Fontes SQL das migrations ajudam a reconstruir schema, mas não substituem backup nativo consistente nem provam que não houve mudança manual no banco. Avaliar um dump transacional administrado em procedimento separado.

Se hashes, contagens, cobertura ou referências falharem, não registrar sucesso nem usar o pacote para promover um destino. Preservar evidências e investigar; voltar a um pacote anterior exige avaliar suas lacunas. Backup com mais de 30 horas demanda revisão; inexistente ou mais de 48 horas demanda correção da rotina. Não executar comandos de importação na produção.

A restauração real depende do [procedimento de recuperação isolada](ENSAIO-RECUPERACAO-ISOLADA.md). Excluir cópias descriptografadas após o uso conforme a política administrativa.
