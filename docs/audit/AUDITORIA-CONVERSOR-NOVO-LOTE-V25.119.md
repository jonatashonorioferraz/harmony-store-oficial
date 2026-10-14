# Conversor: iniciar novo lote — v25.119

Data: 2026-10-14. Base: main `613ccd749a93252c0d58a591535ca48609d105a2`.

## Comportamento

Após gerar o PDF, a central oferece **Iniciar novo lote**. Uma escolha local permite continuar na mesma plataforma, escolher outra ou cancelar. O texto lembra de salvar o PDF; em resultados parciais também informa que a lista de pendências será descartada. Não presume que houve download ou impressão.

O reinício esvazia as duas seleções, invalida a conferência e o consentimento parcial, revoga a URL temporária, libera o leitor PDF e cancela a renderização. A busca, filtros, paginação, detalhes abertos e navegação retornam ao início. DPI e tamanho da impressora são mantidos; a alternativa de DANFE completo volta a ficha de separação para o próximo lote.

## Revisão de escopo e acesso

- A operação exige resultado disponível, sessão ADM ativa, ausência de processamento e escolha aberta. Cancelar mantém os dados atuais.
- Reutiliza a invalidação da prévia e o controle de acesso existentes. Respostas antigas da prévia continuam protegidas por revisão.
- Originais no computador e PDFs baixados não são alterados. Não há persistência nova, upload, chamada de rede, migration ou mudança de permissões.
- Parsers, correspondência NF/CEP, paginação dos produtos e geração do PDF não foram alterados.
- Versões da central e do cache avançadas; fontes e cópias em `web/` sincronizadas. Fixture com arquivos fictícios ficou em `tmp/`, fora do commit e da publicação.

## Validação

- Build aprovado; 765 testes aprovados, incluindo seis novos cenários de reinício, cancelamento, novo lote, resultado parcial, bloqueio de ações e navegação/busca.
- ESLint: zero erros; 19 avisos nos mesmos arquivos e trechos legados, fora da lógica adicionada.
- Auditoria de dependências de produção: zero vulnerabilidades.
- 121 arquivos oficiais sincronizados; validação de versão contra a main aprovada.
- Navegador local: geração real de dois PDFs sintéticos consecutivos sem reload, cancelamento com PDF preservado, retorno à escolha de plataforma e Mercado Livre com campos vazios. Layout inspecionado em larguras de celular e desktop. Sem erros no console; aviso habitual do leitor sobre execução sem worker.

Publicação condicionada à aprovação do CI do PR e à conclusão do deploy do commit integrado.
