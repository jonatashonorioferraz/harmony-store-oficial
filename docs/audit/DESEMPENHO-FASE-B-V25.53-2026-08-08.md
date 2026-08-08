# Desempenho de dados — Fase B da v25.53

Data: 08/08/2026

## Objetivo

Eliminar a dependência do limite padrão de linhas do Supabase e preparar o aplicativo para históricos maiores, sem alterar a experiência das telas ou as permissões existentes.

## Implementação

- Criada paginação REST autenticada em blocos de até 1.000 registros.
- Preservados cabeçalhos adicionais, renovação de sessão e tratamento de erros já utilizados pelo aplicativo.
- Adicionada ordenação determinística para impedir repetição ou perda entre páginas.
- Aplicada paginação a produtos, solicitações, perfis, categorias, campos personalizados, Inteligência, fornecedores, compras, ideias, suprimentos internos, cupons e boletos.
- A Linha do Tempo passou a filtrar no Supabase a colaboradora e o período selecionados.
- Os dados específicos da Linha do Tempo ficaram isolados e não substituem mais a lista global de solicitações do ADM.
- Atualizado o cache instalável para a versão 25.53.

## Compatibilidade

- Nenhuma migration de banco foi necessária.
- Nenhuma regra de negócio, cálculo, permissão ou layout foi modificado.
- As consultas continuam protegidas pelas mesmas políticas RLS e pela sessão autenticada atual.
- Computador, Android, iPhone/iPad e tablet recebem os arquivos renovados pelo PWA.

## Validação

- Build oficial aprovado.
- 198 testes aprovados, nenhuma falha.
- ESLint com 0 erros e 14 avisos conhecidos.
- 49 arquivos oficiais sincronizados entre raiz e `web/`.
- Testes novos cobrem múltiplas páginas, preservação de cabeçalhos, resposta inválida, ordenação e isolamento da Linha do Tempo.

## Resultado

Listas com mais de 1.000 registros deixam de ser silenciosamente truncadas. A aplicação permanece visualmente igual, mas passa a carregar o histórico completo de forma previsível e segura.
