# Auditoria da Inteligência com IA — v25.73

## Escopo preservado

Login, perfis, RLS existente, solicitações, produtos, estoque de matérias-primas, recebimentos, pagamentos, ordens de produção, inventário, etiquetas, PDFs, notificações, boletos e compras não tiveram regras substituídas.

## Riscos avaliados e controles

| Risco | Controle aplicado |
|---|---|
| IA inventar números | Métricas calculadas no PostgreSQL, JSON Schema estrito e evidências obrigatórias |
| Exposição de chave | Chave OpenAI somente na Edge Function |
| Exposição de pessoas | Nomes removidos antes do envio; acesso do painel somente para ADM |
| Custo inesperado | Teto mensal, frequência diária, cooldown, cache por fingerprint e histórico de tokens |
| Ação automática indevida | IA somente recomenda; nenhuma RPC de estoque é chamada pelo analisador |
| Concorrência | Uma análise em processamento por vez |
| Indisponibilidade externa | Fallback determinístico e Inteligência anterior preservada |
| Injeção de HTML | Conteúdo retornado é escapado no cliente |
| Perda em backup | Tabelas incluídas no backup e na recuperação isolada |

## Resultado esperado

O novo módulo é aditivo, administrativo, auditável, responsivo e financeiramente limitado. A publicação deve ocorrer somente depois da aprovação da suíte integral de testes e da validação do banco e da Edge Function.
