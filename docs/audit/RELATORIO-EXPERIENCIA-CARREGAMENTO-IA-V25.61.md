# Relatório de auditoria — experiência de carregamento e IA v25.61

## Escopo validado

- navegação entre módulos;
- captura por câmera e seleção pela galeria;
- cupom fiscal em JPG, PNG ou WebP;
- boleto em imagem ou PDF;
- sucesso, falha e nova tentativa;
- responsividade e acessibilidade;
- cache do PWA e espelhamento `raiz/web`.

## Impacto funcional

Nenhuma permissão, regra de estoque, pagamento, compra, solicitação ou auditoria foi alterada. A mudança é restrita à apresentação do tempo de espera e ao tratamento visual da tentativa de leitura.

## Controles preventivos

- o indicador global é instalado depois dos módulos existentes;
- operações rápidas não exibem a camada;
- a camada oculta usa `display:none!important` e ignora eventos do ponteiro, impedindo qualquer bloqueio invisível da interface;
- o fechamento usa `finally` para não deixar a interface bloqueada;
- a IA não pode exibir 100% antes da resposta;
- falhas reabilitam câmera, galeria, preenchimento manual e nova tentativa;
- arquivos privados enviados em tentativas malsucedidas são apagados.

## Resultado esperado

O usuário entende que o aplicativo continua trabalhando, reconhece a etapa em andamento e sempre chega à revisão obrigatória antes de qualquer gravação definitiva.
