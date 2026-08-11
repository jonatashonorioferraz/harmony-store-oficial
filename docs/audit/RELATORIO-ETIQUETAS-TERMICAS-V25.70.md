# Relatório de auditoria — Etiquetas térmicas v25.70

## Escopo

Implementação da identificação física 100 × 150 mm para caixas do Inventário de Produção, com QR Code, pré-cadastro, confirmação física, cancelamento, reimpressão auditada e continuidade operacional.

## Controles adotados

- backup ZIP e tag Git anteriores à alteração;
- migração aditiva e transacional;
- nenhuma renumeração das caixas existentes;
- saldo bloqueado enquanto a etiqueta estiver pendente;
- auditoria de geração, impressão, reimpressão, confirmação e cancelamento;
- autorização restrita a ADM e Recebimento no frontend e no banco;
- QR Code opaco, sem dados empresariais ou pessoais expostos;
- saída térmica isolada para não imprimir a interface do aplicativo;
- biblioteca de QR Code local, fixada e sem comunicação externa.

## Resultado esperado

Uma caixa só passa a contar como disponível depois que o responsável confirma que a etiqueta foi aplicada. Falhas de impressão ou fechamento do aplicativo não criam saldo sem identificação física, e toda pendência pode ser retomada.

## Evidências de validação

- antes e depois da migração: 45 caixas cadastradas, maior código `CX-000050` e sequência interna em 50;
- próxima geração preservada como `CX-000051`, salvo se outro usuário gerar uma caixa antes;
- zero estados de etiqueta inválidos no banco;
- sete colunas, sete RPCs e RLS da auditoria confirmados;
- índice de cobertura criado para caixa e responsável pela impressão;
- 55 arquivos oficiais espelhados e build concluído;
- 276 testes automatizados aprovados, sem falhas;
- nenhum pré-cadastro de teste foi gravado nos dados oficiais.

Os avisos do consultor de segurança sobre RPCs `SECURITY DEFINER` são esperados neste projeto: as tabelas permanecem sem acesso direto e cada RPC valida `private.can_manage_production_inventory()` antes de executar qualquer ação.
