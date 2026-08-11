# Correção do PDF térmico da etiqueta - v25.71

## Problema identificado

O fluxo anterior enviava a imagem da etiqueta ao diálogo de impressão do navegador. Quando o PNG era aberto pelo Gmail, o serviço adicionava cabeçalho, rodapé, URL e margens. Como uma imagem não possui um tamanho físico de papel gravado, parte da etiqueta podia avançar para uma segunda página.

## Solução

- O botão **Gerar PDF 150 × 100** agora baixa um PDF binário real.
- O PDF contém exatamente uma página paisagem com `MediaBox` de **425,1969 × 283,4646 pontos**, equivalente a **150 × 100 mm**.
- A etiqueta de 1200 × 800 px ocupa toda a página, sem margens internas, cabeçalhos, rodapés ou conteúdo do aplicativo.
- O código permanente da caixa recebeu maior destaque e os campos foram redistribuídos para o formato paisagem.
- A foto original do modelo é convertida localmente para preto e branco de alto contraste. Uma falha na foto não bloqueia a etiqueta.
- O PNG permanece disponível apenas para aplicativos de impressoras que importam imagens.
- A impressão direta preserva o isolamento do restante do aplicativo, oculta overflow e impede quebra de página.

## Compatibilidade e segurança

O gerador é local, não envia a etiqueta a serviços externos e não altera o banco, a sequência das caixas, o saldo do inventário, as permissões ou o QR Code. A saída PDF continua registrada na auditoria já existente.

## Critérios de validação

1. PDF com uma página.
2. Tamanho físico de 150 × 100 mm, em paisagem.
3. Ausência de segunda página, cabeçalho do Gmail ou rodapé do navegador.
4. Conteúdo preenchendo a página sem corte.
5. Código da caixa maior, QR Code legível e foto opcional do produto.
6. Funcionamento em computador, tablet e celular.
