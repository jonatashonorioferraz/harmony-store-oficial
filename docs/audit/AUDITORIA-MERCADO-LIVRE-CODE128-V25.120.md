# Mercado Livre: Code 128 e etiqueta sem NF — v25.120

Data: 2026-10-14. Base: main `55c62a56397439eccf55149226d45ef8f27527b5`.

## Problema e resultado

Um modelo de etiqueta de transporte contém um segundo Code 128 com `^BCN,140,N,N,N,A`. O renderizador só aceitava o modo N, interrompendo a leitura do arquivo inteiro. O modo A agora aceita conteúdo exclusivamente numérico, usa subset C para sequências de quatro ou mais dígitos e muda para B no último dígito ímpar. Preserva zeros iniciais, conteúdo e checksum. Textos, invocações explícitas e variantes não implementadas continuam bloqueados. O comportamento do modo N permanece igual.

Referência primária: [Zebra, comando ^BC](https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-bc.html). A implementação cobre o caso numérico verificado; não declara suporte integral a todos os modos e conteúdos do comando.

Outra etiqueta do lote não traz número de NF. O DANFE original não contém seu número de envio; esse número na ficha gerada é copiado da etiqueta depois do vínculo. O sistema não usa a própria ficha como prova da associação, nem escolhe por exclusão ou somente por CEP.

## Confirmação pelo ADM

O cartão da pendência oferece notas com chave válida e CEP compatível, sem duplicidade de número fiscal ou conflito com outras etiquetas. Nenhuma opção é pré-selecionada. O ADM consulta o envio na plataforma, seleciona a nota, marca a confirmação e aciona **Confirmar vínculo e conferir lote**. Trocar a seleção desmarca a confirmação. A geração continua sendo uma ação separada.

- A confirmação usa WeakMap vinculada ao objeto original lido, envio, CEP e chave exata da nota. Metadados do ZPL e bytes dos arquivos não são modificados.
- Nova leitura ou seleção cria objetos sem confirmação. Alterar identidade da etiqueta ou chave da nota bloqueia a composição.
- O relatório e a relação de pedidos identificam a confirmação humana. O matcher revalida a associação na geração.
- Duplicidades, CEP divergente, números fiscais ambíguos, páginas sem identidade, produtos ilegíveis e limites existentes continuam protegidos. Geração parcial conserva consentimento separado.
- Controles verificam sessão ADM, relatório atual, processamento e descarte da tela. Não há novo upload, persistência, integração, migration ou mudança de permissões.

## Validação

- 777 testes aprovados, incluindo 12 cenários novos de código de barras, identidade, ambiguidade, confirmação explícita, troca de seleção, relatório antigo, acesso revogado e ausência de geração automática.
- Build aprovado; 121 arquivos oficiais sincronizados; versões do cache e dos recursos avançadas sem recuar outros módulos.
- ESLint: zero erros; 19 avisos legados. Auditoria de dependências de produção: zero vulnerabilidades.
- Lote real processado exclusivamente no computador: 8 etiquetas, 8 notas, 12 linhas de produtos, 16 páginas de 100 × 150 mm. Sete associações automáticas e uma confirmada expressamente pelo usuário. Inverter a ordem das notas preserva os vínculos.
- PDF renderizado com Poppler a 203 DPI e inspecionado visualmente, incluindo a etiqueta com dois códigos e sua ficha seguinte. ZXing-C++ leu os 9 Code 128 e os 8 QR Codes, comparados integralmente com os dados dos ZPLs. Isso verifica o arquivo digital; não substitui teste na impressora física.
- Navegador local com código de produção: leitura do ZIP e do PDF, bloqueio sem escolha/consentimento, confirmação da nota, resumo completo e geração das 16 páginas. Nenhum erro no console; aviso habitual de execução do leitor sem worker.
- Arquivos de clientes, PDF final, capturas, utilitários de QA e decodificador independente permaneceram fora do Git e da publicação. Testes versionados usam apenas dados fictícios.

Publicação condicionada ao CI aprovado e ao deploy do commit integrado.
