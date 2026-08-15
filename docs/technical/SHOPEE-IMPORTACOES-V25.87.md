# Shopee Analytics — importações v25.87

## Objetivo

Separar de forma inequívoca a inclusão de datas novas da correção excepcional de um período já importado.

## Fluxo de inclusão

1. O ADM escolhe um dos três tipos de relatório na seção **Adicionar dados de uma nova data ou período**.
2. O cliente envia `import_mode=append`.
3. A Edge Function valida autenticação, perfil, extensão, tamanho, assinatura do XLSX, estrutura e período.
4. `service_commit_shopee_import_v2` inclui somente os dias ausentes e preserva datas já registradas.
5. O dashboard muda para o período reconhecido e informa dias adicionados ou ignorados.

## Fluxo de correção

1. O ADM seleciona **Corrigir período** em uma linha do histórico auditável.
2. A interface exibe relatório, período e arquivo atual.
3. O cliente envia `import_mode=replace`, `expected_period_start` e `expected_period_end`.
4. A Edge Function compara o período lido da planilha com o período escolhido antes do upload e do commit.
5. Se os períodos forem diferentes, retorna `PERIODO_DA_CORRECAO_DIFERENTE` e nenhum dado é alterado.
6. Quando coincidem, somente as datas do período confirmado são substituídas.

## Garantias preservadas

- acesso somente para perfil ADM ativo;
- chave de serviço permanece exclusivamente no servidor;
- armazenamento privado e histórico auditável;
- uma fonte canônica por tipo de relatório e por dia;
- nenhuma alteração em estoque, pagamentos, solicitações ou permissões.

