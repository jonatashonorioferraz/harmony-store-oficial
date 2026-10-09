# Central de Emprestimos e Contratos

Entrega operacional v1: menu administrativo, empresas separadas, delegacao financeira,
dashboard integral, busca e paginacao, cronograma original, pagamentos manuais parciais
ou distribuidos, estornos com motivo, historico e originais privados.

Os valores sao compromissos informados pelo administrador, nao cotacao bancaria.
Nao executa transferencias. Nao calcula juros ou amortizacao presumida. O cronograma
original e imutavel nesta versao. IA de extracao e renegociacao nao estao disponiveis.
Nao cadastrar dados de demonstracao em producao.

## Documentos e PDF

PDF/PNG/JPEG de ate 8 MB, hash SHA-256 calculado pela Edge Function autenticada.
Bucket privado sem permissoes de INSERT/UPDATE/DELETE para clientes. Upload sem upsert.
Finalizacao exclusiva do servidor, com permissao atual do autor reconferida sob trava
da empresa, FK composta e existencia/tamanho do original confirmados. Duplicidade de
hash por empresa e bloqueada; anexos nao baixam parcelas. Tentativas interrompidas
podem preservar um objeto ainda nao vinculado; nao apagar automaticamente os originais.

Downloads usam a sessao autenticada, sem URL publica ou cache offline de documentos.
O PDF e um resumo textual multipagina com parcelas, todos os pagamentos/estornos,
auditoria e indice dos anexos. Originais permanecem separados e nao sao incorporados.
A interface lista ate 1000 anexos por contrato e oferece ate 50 pagamentos recentes
no seletor de vinculo; anexos de pagamentos antigos podem ser guardados no contrato.

## Backup e limites

O catalogo inclui as dez tabelas financeiras com FKs e triggers conferidos em testes.
A captura existente de Storage deve incluir o bucket privado; nao disparar backup
ou monitor de saude de producao como teste desta entrega. Retencao externa de longo
prazo e restauracao certificada ainda nao foram entregues. Manter copias externas dos
originais e relatorios. Nao prometer garantia de recuperacao por anos.

## Publicacao

Base: main fc5c2d17857a0668bfc1357614fc2985b71b98f7. Aplicar somente as duas migracoes
financeiras, registrar versoes no historico e publicar contract-documents com validacao
de usuario em codigo (getUser), depois integrar PR aprovado. Nenhum db push abrangente.
Verificar metadados/RLS/ACL sem criar empresas, contratos ou pagamentos reais.

## Testes

scripts/test-financial-contracts-sql.mjs: invariantes do livro financeiro.
scripts/test-financial-workspace-sql.mjs: agregados, filtros, isolamento, documentos e ACL.
tests/financial-contracts.test.mjs: centavos exatos, datas, distribuicao, PDF e espelhos.
Ambos os testes SQL usam PGLite isolado. Nao substituem ensaio de concorrencia real de
duas conexoes ou restauracao de desastre; essas limitacoes permanecem documentadas.

Referencias: https://supabase.com/docs/guides/storage/security/access-control
e https://supabase.com/docs/guides/database/functions.
