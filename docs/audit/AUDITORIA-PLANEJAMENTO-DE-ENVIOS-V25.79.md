# Auditoria — Planejamento de Envios v25.79

## Escopo

Banco, autenticação, autorização, Storage, integração com catálogo, cálculo, conclusão, responsividade, impressão e continuidade.

## Controles verificados

- Permissão específica não amplia automaticamente nenhum perfil existente.
- ADM principal é o único que concede a função de gerente de e-commerce.
- RLS ativa nas duas tabelas e privilégios diretos removidos de `anon` e `authenticated`.
- RPCs validam sessão, perfil ativo, limites, referências, etapa e propriedade dos itens.
- Produto oficial é referenciado, não copiado; produto exclusivo fica isolado.
- Fotos exclusivas aceitam somente JPEG, PNG ou WebP até 2 MB.
- Pronto para coleta e arquivamento exigem 100% dos itens concluídos.
- Cancelamento exige motivo e preserva histórico.
- Toda mutação relevante registra ator e horário em `audit_logs`.
- PDF usa conteúdo isolado e não imprime menus ou dados de outras telas.

## Compatibilidade

O módulo é aditivo. Não altera solicitações, produção, recebimentos, inventário, estoque de matérias-primas, pagamentos, boletos ou Agenda Harmony.

## Evidências esperadas antes da publicação

- suíte automatizada completa aprovada;
- teste transacional de criação, cálculo, bloqueio de finalização, conclusão e arquivamento;
- teste negativo com perfil sem permissão;
- assessores de segurança e desempenho revisados;
- validação visual em desktop, tablet e celular;
- backup criptografado pós-publicação concluído.
