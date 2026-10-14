# Fichas internas pelo Excel e lotes parciais do Mercado Livre — v25.122

Data: 2026-10-14. Base inicial: main `7a3146f26f2d50b8bf370c4ca394e9813eb5cff1`. Entrega compatibilizada com main `bc9bcc9a76852052ac9c80d11f41013da4a9508f`, preservando o logo transparente publicado na v25.121.1.

## Problema e comportamento

O exportador de etiquetas/DANFEs limita lotes, enquanto o Excel pode conter todas as vendas do período. Além disso, notas ausentes, etiquetas sem número fiscal, SKUs internos e CEP divergente no DANFE impediam a ficha interna mesmo quando o pedido estava completo no Excel. O usuário autorizou explicitamente usar o Excel como fonte da ficha de separação.

No modo ficha de separação com Excel, as etiquetas delimitam o lote e o relatório fornece produtos, quantidades comerciais, SKU e variações. DANFE passa a ser opcional e complementar. O modo DANFE completo e a ficha sem Excel preservam a associação fiscal estrita anterior. Nenhuma nota é inventada ou associada por exclusão.

## Associação e impressão

- Cada etiqueta deve conter um único pedido/pacote, envio e CEP em texto. Os três precisam coincidir com um único grupo do Excel. Identificadores permanecem strings, sem conversão numérica de IDs longos.
- Todas as etiquetas afetadas por envio/pedido duplicado ficam pendentes. Pacotes incompletos, cancelamentos/devoluções, IDs ambíguos, pedido ausente e CEP divergente entre etiqueta e Excel continuam bloqueados.
- Vendas adicionais no relatório ficam fora do PDF. O resumo informa total no Excel, pedidos conferidos e vendas não utilizadas. A planilha pode ser selecionada novamente em outro lote.
- DANFE ausente, número fiscal ausente da etiqueta, falha de leitura da nota, código fiscal não comparável e divergências entre nota e Excel são avisos complementares neste modo. Não alteram produtos ou quantidades do relatório e não constituem confirmação fiscal.
- A ficha identifica pedido, envio e fonte Excel. Quantidade é rotulada “QTD. DO PEDIDO”. Até quatro linhas por folha de 100 × 150 mm; descrições longas podem ocupar mais espaço. Todas as fichas do pedido seguem sua etiqueta. Kits permanecem na descrição, sem multiplicação artificial de unidades.
- Variação vazia imprime “Conferir personalização no pedido”. Nenhuma cor ou aroma é deduzido. Busca por pedido funciona sem apresentá-lo como número de NF.
- A composição revalida os identificadores e a fonte atual. Parcial mantém consentimento explícito e identificação do PDF. Troca/remoção de arquivo invalida conferência; novo lote limpa também o Excel.
- Na revisão visual, um campo de cidade com `^FB` e espaçamento de 1.000 pontos fez a fonte equivalente quebrar uma palavra para uma segunda linha muito distante, reduzindo toda a etiqueta. Um ajuste limitado condensa apenas campos que excedem pouco a largura (até 15%), possuem espaçamento excepcional e extrapolariam o papel. Texto integral, quebras explícitas, espaçamentos normais e códigos permanecem preservados. Há regressão automatizada específica.

## Validação

- 799 testes aprovados, incluindo ZPL + Excel sem PDF, 50 etiquetas contra 95 vendas, 100 pedidos, pacotes com dez variações, dados fiscais divergentes sem associação indevida, cancelamentos, duplicidades, revalidação na geração, identificação impressa e busca exata por pedido.
- Build estático aprovado; 122 espelhos oficiais sincronizados antes do build e depois dos testes. Versões de recursos/cache avançadas e validadas contra a base. ESLint: zero erros e 19 avisos legados. Auditoria de dependências de produção: zero vulnerabilidades. Nenhuma dependência alterada.
- Arquivos reais processados somente no computador: 50 etiquetas, 45 notas e relatório com 95 pedidos. Antes: 39 pedidos liberados. Depois: 50 pedidos conferidos, 56 linhas de produtos e 100 páginas. As outras 45 vendas não entram no PDF. Resultado idêntico dos produtos com e sem DANFE. 23 linhas com variação e 33 sem variação explicitada no relatório.
- Texto das 56 linhas confrontado com o PDF gerado: descrição completa, variação/personalização, quantidade, pedido e envio. Todas as páginas têm 100 × 150 mm. Inspeção visual das 100 páginas renderizadas com Poppler; 54 Code 128 e 50 QR Codes decodificados a 203 DPI com ZXing-C++ e comparados integralmente ao ZPL, após corrigir o campo de cidade. Sem alegar teste físico de impressão.
- Navegador local: seleção dos três arquivos e geração de 100 páginas; seleção de apenas ZIP + Excel, conferência dos 50 pedidos e geração de 100 páginas; busca por pedido retornando etiqueta e ficha correspondentes. O processamento mantém CSP `connect-src 'none'` e acesso restrito a ADM.
- Documentos reais, PDFs produzidos, capturas e ferramentas temporárias ficam fora do Git e da publicação. Fixtures versionadas são fictícias. Sem APIs externas, armazenamento dos documentos, mudanças de banco ou de permissões.

Publicação condicionada ao CI aprovado e ao deploy do commit integrado.
