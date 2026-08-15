# Auditoria — Shopee Analytics v25.84

## Escopo revisado

- Banco, RLS, privilégios e funções `security definer`.
- Upload, parsing, limites e prevenção de duplicidade.
- Isolamento dos módulos existentes.
- Uso da OpenAI, orçamento, cache, evidências e indisponibilidade.
- Responsividade em computador, tablet e celular.
- Backup, recuperação, ajuda, manual e changelog.

## Riscos e controles

| Risco | Controle |
|---|---|
| Importar o arquivo no cartão errado | assinatura de abas e colunas obrigatórias |
| Somar a mesma semana duas vezes | SHA-256, índices únicos e lote atual por período |
| Duas importações simultâneas | bloqueio transacional com `pg_advisory_xact_lock` |
| Arquivo malformado ou excessivo | extensão, assinatura, 12 MB, 30 abas e 100 mil linhas |
| Gravação parcial | uma RPC transacional grava todo o lote |
| Exposição das planilhas | bucket privado e acesso apenas pelo servidor |
| IA inventar métricas | snapshot do banco, JSON Schema e evidências obrigatórias |
| Custo descontrolado | orçamento mensal, intervalo, cache e contagem de tokens |
| Indisponibilidade da IA | gráficos determinísticos permanecem disponíveis |
| Regressão em módulos existentes | arquivos isolados, tela administrativa e testes automatizados |

## Garantias funcionais

O módulo é somente analítico. Não há comandos para criar, editar ou concluir pedidos da Shopee, nem para alterar produtos, estoque, solicitações, produção ou pagamentos da Harmony.

## Evidências de validação

- 315 testes automatizados aprovados, sem falhas.
- 10 tabelas Shopee com RLS e política administrativa ativa.
- Bucket `shopee-imports` privado e limitado a 12 MB por arquivo.
- Duas Edge Functions publicadas com verificação obrigatória de JWT.
- Nenhuma chave estrangeira nova sem índice após a revisão do Supabase.
- Avisos genéricos sobre RPCs `security definer` foram revisados: são intencionais, têm `search_path` fixo, privilégio mínimo e validação explícita de ADM dentro de cada função.
- Índices recém-criados podem aparecer temporariamente como “não utilizados” até que os primeiros relatórios sejam importados; isso não representa falha.
