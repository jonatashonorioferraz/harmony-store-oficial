# Relatório de conclusão técnica v25

Data: 19/07/2026

## Resultado executivo

As três etapas finais foram concluídas sem alterar os dados oficiais: validação funcional e responsiva, monitoramento externo e restauração completa em ambiente isolado.

## Aplicativo e fluxos

- Build oficial aprovado.
- 63 testes automatizados aprovados, sem falhas.
- Fluxo transacional isolado aprovado: criação da solicitação pela colaboradora, separação pelo ADM, agendamento, entrega, baixa de estoque e trilha de auditoria.
- O fluxo foi executado dentro de transação com `rollback`, sem deixar registros de teste.
- Login verificado em 1440 x 900 e 390 x 844, sem rolagem horizontal, erros de console ou perda dos elementos da marca.
- PWA, manifesto, orientação retrato, cache offline, ícones e paridade dos arquivos oficiais continuam protegidos por testes.

## Monitoramento externo

- Verificação automática a cada seis horas.
- Aplicação, manifesto, Data API, Auth e Storage responderam corretamente no primeiro ensaio.
- O resultado saneado aparece na aba Saúde do Sistema.
- Falhas tornam a execução do GitHub Actions vermelha e registram evento técnico sem segredos nem dados pessoais.

Execução aprovada: https://github.com/jonatashonorioferraz/harmony-store-oficial/actions/runs/29688189878

## Recuperação isolada

- Todas as 16 migrations foram reaplicadas em ordem no projeto isolado.
- Backup atual validado por hashes antes da importação.
- 17 tabelas restauradas, totalizando 120 registros.
- 2 usuários Auth recriados com identificadores remapeados.
- 30 objetos do Storage restaurados em 2 buckets.
- Reconciliação independente confirmou 2 perfis, 6 categorias, 26 produtos, 61 eventos de auditoria e 30 objetos.
- A referência da produção é bloqueada no restaurador; URL, projeto, confirmação e destino vazio são exigidos antes de qualquer escrita.

Execução aprovada: https://github.com/jonatashonorioferraz/harmony-store-oficial/actions/runs/29688712865

## Auditoria final

Os avisos de funções `SECURITY DEFINER` são esperados porque as operações do app usam RPCs com validação interna obrigatória de usuário e função administrativa. As tabelas técnicas de backup e eventos têm RLS sem políticas de leitura de propósito: ficam fechadas para o navegador e são acessadas somente pelo backend autorizado. Índices ainda classificados como não usados devem ser mantidos até existir histórico representativo de uso; removê-los agora reduziria a proteção de consultas futuras sem benefício comprovado.
