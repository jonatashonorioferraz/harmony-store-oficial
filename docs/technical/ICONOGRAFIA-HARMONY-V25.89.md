# Iconografia Harmony — v25.89

## Objetivo

Padronizar a navegação do aplicativo com símbolos profissionais, únicos e semanticamente coerentes, sem modificar a arquitetura de rotas ou as permissões existentes.

## Implementação

- `harmony-icons.js` contém a biblioteca vetorial e aplica os símbolos conforme `data-view` e `data-intel-area`.
- `harmony-icons.css` controla proporções, estados ativo/hover e adaptações para computador, tablet e celular.
- Um observador acompanha módulos inseridos dinamicamente e aplica o ícone correto sem recriar botões ou manipuladores de clique.
- Os SVGs são internos, monocromáticos e herdam `currentColor`, evitando arquivos de imagem, requisições adicionais e dependências externas.

## Compatibilidade

- Nenhuma rota, permissão ou regra de negócio foi alterada.
- Nenhum dado do Supabase foi modificado.
- Os textos e a ordem dos menus continuam definidos pelos módulos originais.
