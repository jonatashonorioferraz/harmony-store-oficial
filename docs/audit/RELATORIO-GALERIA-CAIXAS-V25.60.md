# Relatório de auditoria — galeria e contador de caixas v25.60

## Escopo verificado

- Exposição somente para perfis `admin` e `receiver` ativos.
- Contagem exclusiva de caixas com saldo e sem transferência.
- Ordenação decrescente pelo código permanente.
- Uso da foto oficial do modelo, sem novo catálogo duplicado.
- Transferência integral pelo mesmo RPC protegido da v25.59.
- Atualização imediata após a retirada e sincronização entre aparelhos.
- Sincronização automática dos cadastros oficiais de modelos, cores e colaboradoras.
- Responsividade em computador, tablet e celular.

## Riscos controlados

- Clientes antigos não conseguem retirar parcialmente.
- O contador não usa filtros visuais e não inclui caixas esgotadas.
- A galeria não recebe acesso direto às tabelas.
- Falha temporária de sincronização preserva a última contagem válida e tenta novamente.
- A nova tela não modifica pagamentos, recebimentos ou matérias-primas.

## Evidências

- Migração aplicada no projeto Supabase oficial por consulta vinculada.
- Validação transacional executada com comparação entre tabela, contador e galeria, seguida de `rollback`.
- Build estático concluído.
- 239 testes automatizados aprovados, sem falhas.
- 51 arquivos oficiais conferidos entre a raiz e a pasta de publicação `web/`.
