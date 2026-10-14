# Auditoria do conversor: entrega e itens sem variação

Data: 2026-10-14. Versão: 25.123.

## Comportamento

- O CEP explícito da seção Local de entrega tem prioridade sobre o CEP do destinatário. Ambos permanecem registrados na leitura e a origem do CEP usado é identificada. Se o campo de entrega estiver vazio ou a seção estiver ausente, usa-se o destinatário.
- A leitura fica limitada à seção identificada e à célula CEP. Emitente, transportador, retirada isolada e tabelas seguintes não fornecem o endereço de entrega. Um valor preenchido mas ilegível, múltiplos CEPs ou conflitos entre folhas permanecem como pendências.
- A agregação por chave fiscal conserva o CEP de entrega quando ele aparece somente na primeira folha. A mesma regra atende a conferência complementar, o vínculo fiscal e as opções de confirmação manual já existentes. CEP sozinho não cria vínculo fiscal.
- Itens sem variação do Excel mostram: “Siga a descrição. Se personalizado, confira o pedido.” A mensagem é compartilhada entre ficha, detalhes e avisos. A descrição e a variação original não são reescritas nem inferidas a partir do título.

## Validação

- 805 testes aprovados, incluindo prioridade de entrega, campo vazio com legenda FONE/FAX próxima, retirada, CEP inválido ou ambíguo, notas de várias folhas, recusa de conflitos e preservação de quatro itens sem variação na mesma ficha.
- Build aprovado; 122 arquivos oficiais sincronizados antes do build e após os testes; validação da base de versões aprovada.
- Lint: zero erros, 19 avisos preexistentes. Auditoria das dependências de produção: zero vulnerabilidades. Nenhuma dependência alterada.
- Lote real processado localmente: 45 etiquetas, 45 DANFEs, 45 pedidos, 50 linhas de produtos e 90 páginas de 100 × 150 mm. O aviso de CEP causado pela diferença entre destinatário e entrega foi eliminado. Os outros avisos de origem continuam presentes.
- Leitura independente dos produtos do Excel e do texto do PDF confirmou os 50 itens, as quantidades, as 31 variações preenchidas e a nova orientação nos 19 itens sem variação. As fichas mantêm o pedido e o envio corretos.
- PDF renderizado a 203 DPI; os 46 Code 128 e 45 QR Codes foram decodificados. Revisão visual das fichas com a nova orientação confirmou descrição, quantidade e mensagem legíveis.
- Teste no navegador com os três arquivos originais confirmou 45/45 pedidos, 45 notas, 50 itens, 90 páginas e a nova mensagem, sem o aviso indevido de CEP. Os documentos permaneceram locais; somente casos sintéticos integram os testes versionados.

## Limites preservados

A leitura depende de texto pesquisável e das seções reconhecidas do DANFE. Não há OCR remoto, associação por nome/posição ou preenchimento de cores ausentes. A validação foi digital, sem impressão física. O acesso continua restrito aos ADMs e o processamento dos arquivos permanece no navegador.
