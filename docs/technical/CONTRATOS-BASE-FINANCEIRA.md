# Emprestimos e Contratos: base financeira v1

## Estado da entrega

Base de banco e testes isolados, preparada sobre main fc5c2d17857a0668bfc1357614fc2985b71b98f7.
Nao habilita menu, uploads, IA, PDFs, pesquisas pagas ou pagamentos bancarios.
Nao cria contratos, empresas, permissoes nem pagamentos reais.
A migracao deve passar pela auditoria/CI e por aplicacao controlada antes da integracao da interface.

Esta etapa nao representa conclusao do modulo completo. O prototipo visual permanece separado.
Nao aplicar um db push abrangente para publicar somente esta migracao.

## Modelo e significado dos valores

- financial_entities: separacao de empresas, sem misturar credores ou saldos entre elas.
- financial_permissions: leitura/escrita delegada por empresa, somente para administradores ativos.
- financial_contracts: compromisso em BRL; total calculado no servidor pela soma das parcelas.
- contract_schedule_versions: cronograma original imutavel, versao 1.
- contract_installments: valores variaveis, entrada e parcelas extraordinarias.
- contract_payments: lancamento humano, data efetiva, data do registro, autoria e chave de repeticao.
- contract_payment_allocations: distribuicao do mesmo pagamento entre uma ou varias parcelas.
- contract_payment_reversals: estorno contabil, com motivo, sem apagar o pagamento.
- contract_audit_events: trilha financeira restrita, separada do historico operacional.

Saldo = soma das parcelas menos alocacoes de pagamentos nao estornados.
O saldo NAO e uma cotacao de quitacao antecipada do credor.
Entrada prevista NAO e entrada paga. Nao inferir juros, descontos, correcao monetaria ou amortizacao.
Um registro manual NAO comprova liquidacao bancaria nem aciona transferencia.
O campo effective_date identifica quando o pagamento ocorreu; created_at identifica quando foi registrado.
Lancamentos futuros sao rejeitados; comprovantes de agendamento nao podem ser baixados como pagamentos.
Valores devem ser positivos, decimais exatos, com no maximo duas casas. Nenhum arredondamento silencioso.
O cronograma original aceita de 1 a 600 itens. As datas explicitas permitem valores e intervalos variaveis.
A funcao interna financial_month_date preserva o dia-ancora, inclusive apos fevereiro, e foi preparada
para a futura geracao mensal; nao e uma rotina de calculo de juros.

A v1 permite uma versao de cronograma e nao permite reescrever contratos ou parcelas.
Renegociacao, cancelamento e ajuste de cronograma exigem outra etapa com invariantes de migracao
das alocacoes. Nao inserir uma versao 2 por SQL manual: os saldos v1 contemplam o cronograma original.

## Acesso e integridade

Administrador principal ativo tem acesso financeiro. Outros administradores precisam de delegacao
explicita por empresa. Colaboradoras, recebedores, gestores operacionais e contas inativas nao
herdam acesso. O status e o papel sao lidos da tabela profiles, nao de metadados enviados pelo cliente.

RLS habilitada nas nove tabelas. authenticated recebe somente SELECT com politica por empresa;
escritas passam por RPCs com guarda de acesso, transacao, revisao e search_path vazio.
anon nao recebe leitura nem execucao. service_role recebe SELECT para backup, nao DML ou RPCs
financeiras. Os helpers internos nao sao expostos para obter totais de outra empresa.

Permissoes e gravacoes usam trava da empresa; pagamentos tambem bloqueiam o contrato.
Isto serializa a conferencia de duplicidade entre contratos da mesma empresa.
A revisao esperada impede confirmar uma decisao feita sobre saldo antigo.
Revogacao usa a mesma trava e as escritas reconferem acesso apos adquiri-la.
O teste isolado cobre revisao obsoleta; nao substitui teste concorrente de duas conexoes no staging.

Pagamentos, alocacoes, estornos, parcelas, versoes e auditoria bloqueiam UPDATE/DELETE/TRUNCATE
tambem por trigger. Um administrador de banco ainda pode alterar o schema deliberadamente:
isto nao e uma garantia contra comprometimento do proprietario do banco.

## RPCs para a futura interface

- financial_access(): empresas permitidas e can_write.
- create_financial_entity(p_id UUID, p_name): principal; UUID do pedido permite repeticao segura.
- set_financial_permission(p_entity_id, p_profile_id, p_access): principal; read, write ou revoked.
- create_financial_contract(p_input): entity_id, idempotency_key, title, creditor_name, reference,
  contract_date, notes, installments[{amount,due_date,kind}]. reference e notes sao opcionais.
- record_contract_payment(p_contract_id, p_expected_revision, p_input): idempotency_key, amount,
  effective_date, kind, transaction_reference, notes, duplicate_reason, allocations[{installment_id,amount}].
- reverse_contract_payment(p_payment_id, p_expected_revision, p_idempotency_key, p_reason).
- financial_contracts_list(p_entity_id, p_limit=50, p_offset=0): pagina com count independente.
- financial_contract_detail(p_contract_id, p_payment_offset=0, p_audit_offset=0): todas as parcelas,
  totais calculados, paginas independentes de 50 pagamentos/eventos e contagens completas.

Reenviar exatamente o mesmo payload/chave apos timeout. Chave reutilizada com dados diferentes falha.
Retries de pagamentos posteriormente estornados retornam o registro original com reversed=true;
nao recriam automaticamente uma baixa.

Referencia de transacao normalizada (espacos externos e caixa) bloqueia repeticao ativa na empresa.
Apos estorno e possivel relancar a referencia, mantendo a cadeia original.
Mesmo credor normalizado por nome, valor e data gera suspeita entre contratos da mesma empresa:
so prossegue com justificativa explicita de pelo menos 12 caracteres, preservada no historico.
Credores com grafias diferentes podem nao ser detectados nesta etapa; hash e identificador fiscal
de documentos entram na etapa documental, sem prometer deduplicacao infalivel.

A soma das alocacoes deve ser igual ao pagamento; nenhuma parcela pode ficar com saldo negativo.
As FKs compostas impedem cruzar empresa/contrato/parcela. Falhas fazem rollback do lancamento inteiro.
Relatorios e interface devem distinguir parcela paga de progresso monetario.
Listas paginadas nao podem ser usadas como se fossem o total completo.

## Backup e publicacao

Catalogo ampliado com PKs, FKs compostas, triggers e concessoes exatas das nove tabelas.
Digest das migracoes atualizado sem desativar verificacao de cobertura.
Captura criptografada inclui todos os registros financeiros retidos, inclusive requests e auditoria.
O prazo atual de 30 dias dos artefatos de backup continua insuficiente como unica garantia de anos.
Restauracao ainda bloqueada ate ensaio isolado e reconciliacao; esta entrega nao muda recovery_ready.
Nenhum backup/monitor de saude de producao e acionado pelos testes.

Antes de aplicar em producao: revisar compatibilidade com profiles e private.is_primary_admin;
confirmar destino e executar somente a migracao aprovada; verificar metadados/RLS/ACL de forma
somente leitura. Nao cadastrar empresas, permissoes ou contratos reais automaticamente.
Sincronizar deploy/codigo de backup com schema: nao executar o catalogo novo contra schema antigo.
Depois de aplicar a migracao, uma reversao do frontend nao deve excluir o livro financeiro.

## Validacao isolada

PGLITE_ROOT deve apontar para instalacao isolada de @electric-sql/pglite@0.3.14.
Executar node scripts/test-financial-contracts-sql.mjs.
O teste usa PostgreSQL em memoria, perfis sinteticos, sem URL de Supabase, sem chave e sem rede.
CI instala a versao fixada no diretorio temporario e executa o mesmo roteiro.
Cobertura: grants/RLS, papeis, empresas, decimal, entrada, parcial, distribuicao, duplicidade,
idempotencia, atomicidade, estorno, auditoria, datas mensais, 84 parcelas, paginacao e catalogo.
Staging com duas conexoes, Storage, navegador e PDF ainda sera necessario nas etapas correspondentes.

## Proximas etapas

1. Integrar painel e formularios aprovados ao app, consumindo estas RPCs, com estados de erro claros.
2. Guardar originais em bucket privado imutavel, finalizacao e hash no servidor; nao apagar por erro de IA.
3. Extracao assistida usando infraestrutura existente, revisao humana e orcamento autorizado.
4. Ajustes versionados de cronograma, cancelamento e amortizacao negociada sem formulas inventadas.
5. PDFs/dossie em processamento apropriado, backup externo duradouro e ensaio de restauracao.
6. Testes completos de interface/mobile, piloto administrativo e publicacao via PR/CI/deploy.

Referencias tecnicas utilizadas:
https://supabase.com/docs/guides/database/postgres/row-level-security
https://supabase.com/docs/guides/database/functions
