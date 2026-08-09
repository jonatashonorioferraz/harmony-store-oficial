# Relatório de auditoria — caixas únicas do Inventário v25.58

## Escopo

Revisão da identificação de caixas físicas, exclusividade no banco, permissões, rastreabilidade, compatibilidade do PWA, relatórios, backup e responsividade.

## Controles implementados

- sequência positiva, crescente e sem ciclo;
- índice único para impedir duplicidade mesmo em acessos simultâneos;
- gatilho que torna o número imutável;
- código visual derivado do número, evitando dados duplicados;
- autorização somente para ADM e Recebimento ativos;
- auditoria da geração e da criação;
- preservação da caixa depois de saldo zero;
- compatibilidade com a RPC anterior durante atualização de cache;
- mensagens claras quando um código já existe;
- localização física separada do identificador permanente.

## Riscos tratados

| Risco | Tratamento |
| --- | --- |
| Duas caixas com o mesmo número | Índice único no banco |
| Alteração acidental do código | Gatilho imutável |
| Reutilização de caixa esvaziada | Registro e código não são excluídos |
| Código abandonado voltar a ser usado | Sequência não retrocede |
| Aplicativo antigo criar entrada | Valor padrão seguro no banco |
| Restauração gerar colisão | Número é preservado e o gerador ignora usados |
| Acesso por colaboradora | Autorização centralizada em ADM/Recebimento |

## Critérios de aceite

1. Dois pedidos de geração retornam números diferentes.
2. Uma tentativa de duplicidade falha no banco.
3. Uma tentativa de alterar `box_number` falha no banco.
4. Saída parcial mantém o mesmo código e o saldo restante.
5. Saldo zero mantém caixa, origem e histórico consultáveis.
6. Tela e PDF mostram o código permanente e a localização separadamente.
7. Backup e restauração preservam `box_number`.
8. Testes automatizados e validação transacional não deixam dados de teste em produção.

## Impacto em outros módulos

Nenhuma regra de pagamento, estoque de matéria-prima, solicitação, produção recebida ou suprimentos foi alterada. A evolução é aditiva e restrita ao Inventário de Produção.
