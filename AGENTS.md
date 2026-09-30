# Publicacao da Harmony Store Oficial

- A versao publicada de referencia e a main atual de jonatashonorioferraz/harmony-store-oficial.
- Antes de preparar uma entrega, obtenha o SHA atual da main no GitHub. Confirme a base da copia de trabalho. Se ela estiver atrasada ou contiver trabalho local, preserve-a e prepare a entrega em uma copia isolada da main atual.
- Nunca substitua um arquivo inteiro da main por uma copia local antiga para transportar uma pequena mudanca. Aplique apenas a alteracao solicitada sobre a base atual.
- A raiz contem as fontes. Arquivos espelhados em web/ devem acompanhar as alteracoes correspondentes; execute verify:mirrors antes do build e depois dos testes.
- Preserve ou avance as versoes de recursos em index.html e service-worker.js. Nunca recue as versoes do app, boletos, relatorio ou cache como efeito colateral de outra entrega.
- Testes de cache devem validar formato, sincronizacao e comportamento. Evite repetir uma versao literal do cache em testes de funcionalidades independentes.
- Para publicar, use um PR com auditoria, testes, lint e sincronizacao aprovados. Aguarde o deploy do commit integrado antes de confirmar publicacao.
- PRs integrados permanecem como historico. PRs automaticos de dependencias devem ser avaliados separadamente, sem integrar atualizacoes amplas junto de uma funcionalidade apenas para limpar a lista.
