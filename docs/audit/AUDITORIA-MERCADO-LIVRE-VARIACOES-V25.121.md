# Variações do relatório de vendas nas fichas — v25.121

Data: 2026-10-14. Base: main `f81042c0669ab60bdc9a026cf22e0dd3c74c896f`.

## Problema e comportamento

Alguns DANFEs repetem a descrição do anúncio e um SKU truncado, omitindo cor e aroma. O conversor agora aceita o relatório original `.xlsx` de vendas do Mercado Livre junto às etiquetas ZIP/ZPL e aos DANFEs. A ficha interna recebe as variações do Excel após conferir o pedido. A nota fiscal original não é modificada.

Variação vazia no relatório é permitida: a ficha imprime **Conferir personalização no pedido**, conforme a rotina de personalização manual da expedição. Sem Excel, permanece a conversão baseada apenas na NF, com os avisos já existentes. DANFE completo permanece original. Shopee não utiliza Excel retido de outra plataforma.

## Leitura e associação

- ZIP/CRC e descompressão locais, DOMParser nativo e XML sem DTD/entidades externas. Aba única `Vendas BR`, relações internas e células validadas. Limites de 20 MB de Excel, 20.000 linhas e 1.500.000 células, além dos limites do lote e da descompressão existentes.
- Cabeçalhos por texto e seção: `Estado` e `Unidades` de Vendas; rastreamento de Envios. Colunas homônimas de Compradores, Devoluções e Reclamações não são usadas no lugar das colunas de venda/envio.
- IDs são strings. IDs longos gravados como números e fórmulas nas colunas usadas são recusados. Nenhuma fórmula é executada.
- Pacotes mantêm a estrutura do exportador: cabeçalho com quantidade declarada, seguido exatamente das respectivas linhas filhas. Não se ordenam/removem linhas internas. Uma venda marcada `Sim` que já possui seu próprio envio é tratada como pedido independente.
- Correspondência exata por envio/rastreamento; venda/pacote explícito da etiqueta, quando disponível, deve concordar. O leitor reconhece também o ID de 16 dígitos impresso em campos de 5 + 11 dígitos. CEP do relatório deve coincidir com o DANFE já vinculado.
- Produtos conferidos por ID do anúncio e descrição normalizada, com soma das quantidades comerciais por produto. Não se atribui uma variação a uma linha fiscal pela ordem, pelo SKU truncado ou por exclusão. As linhas do pedido são reconciliadas como conjunto com a NF; depois recebem SKU completo e variação do relatório.
- Variações explícitas na NF devem concordar com o relatório. Cancelamento/devolução, produto diferente, quantidade divergente, envio ausente/duplicado ou identidade conflitante deixam o pedido pendente. Outras vendas no relatório não precisam pertencer ao lote.
- Fonte, aba e linha ficam no resultado da reconciliação; a tela identifica o Excel utilizado. A geração revalida os dados. Subconjuntos preservam a mesma fonte e continuam exigindo consentimento explícito para geração parcial.
- A nota ausente da etiqueta continua exigindo a confirmação do ADM já implementada: o Excel não contém número fiscal que justifique associá-la automaticamente.

## Interface e privacidade

O terceiro campo aparece no Mercado Livre dentro de Arquivos. Adicionar, trocar ou remover o Excel invalida o resultado anterior. Iniciar novo lote e encerrar a central limpam o arquivo; leituras tardias não restauram dados após descarte. A lista da sessão inclui o Excel. Acesso ADM e CSP `connect-src 'none'` permanecem.

Sem servidor, API externa, persistência dos documentos, alteração de permissões, banco ou integração. `@xmldom/xmldom` é uma dependência exclusiva de desenvolvimento para testar o mesmo leitor XML no Node; não é distribuída ao navegador. Nenhuma outra dependência foi atualizada.

## Evidências

- 790 testes aprovados, incluindo leitor XLSX comprimido, cabeçalhos repetidos, IDs longos/split, pacotes incompletos, fórmulas, XML externo, duplicidades, divergências, variantes explícitas, personalizados sem variação, parcial, revalidação na geração e descarte tardio. Cenário de 100 pedidos com notas/relatório invertidos e venda extra aprovado.
- Build estático aprovado; 122 arquivos oficiais sincronizados. Cache e recursos avançados sem recuar módulos. ESLint sem erros e 19 avisos legados; auditoria de produção sem vulnerabilidades.
- Lote real processado somente no computador: 8 etiquetas, 8 notas e 12 linhas de produtos. Dez linhas com variação no relatório e duas sem variação. PDF com 16 páginas de 100 × 150 mm, alternando etiqueta e ficha. As quatro variações do primeiro pedido cabem juntas em uma ficha legível.
- Inspeção das 16 páginas renderizadas com Poppler. Nove Code 128 e oito QR Codes decodificados com ZXing-C++ a 203 DPI, comparados integralmente aos ZPLs. Teste digital, sem alegar impressão física.
- Navegador local com os três arquivos reais: conferência, confirmação de NF já autorizada pelo usuário, geração de 16 páginas, prévia da ficha com quatro variações e reinício removendo os três arquivos. Sem erros de console; aviso habitual do leitor PDF sem worker. Campos verificados em desktop e largura de celular.
- Documentos de clientes, PDF gerado, capturas, analisadores temporários e arquivos de QA ficam fora do Git/publicação. Testes versionados contêm somente dados fictícios.

Publicação condicionada ao CI aprovado e ao deploy do commit integrado.
