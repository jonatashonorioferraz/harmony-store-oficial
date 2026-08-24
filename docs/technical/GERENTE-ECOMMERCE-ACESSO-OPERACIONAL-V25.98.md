# Gerente de e-commerce — acesso operacional v25.98

## Objetivo

O perfil reúne as capacidades operacionais de uma colaboradora de produção e de uma colaboradora de recebimento, somadas aos módulos gerenciais já aprovados, sem promoção ao papel administrativo.

## Representação segura

No banco, a gerente permanece com `role='collaborator'` e `is_ecommerce_manager=true`. A aplicação nunca grava `role='admin'` para esse perfil. Funções administrativas continuam protegidas por `private.is_admin()` ou `private.is_primary_admin()`.

## Capacidades liberadas

- solicitações dos catálogos `production`, `ecommerce` e `shared`;
- conferência de produção e correção dos próprios lançamentos;
- suprimentos internos sem acesso ao painel financeiro de compras;
- Inventário de Produção;
- Planejamento de Envios;
- Central de Transferências, incluindo expedição e recebimento;
- Saúde do Sistema;
- ajuda operacional correspondente aos módulos liberados.

## Restrições preservadas

- sem cadastro, edição ou exclusão de usuários;
- sem gestão administrativa do catálogo, fornecedores ou campos personalizados;
- sem auditoria administrativa;
- sem valores de produção, agenda de pagamentos ou fechamento financeiro;
- sem envio global de notificações;
- sem elevação implícita de papel no banco.

## Banco e privacidade

As funções de leitura de recebimentos retornam valores somente para `role='admin'`. A gerente pode conferir quantidades, modelos e cores, mas `rate_per_100` e `amount` permanecem nulos. Ela também é excluída da lista de colaboradoras produtoras e do painel administrativo de pagamentos.

## Testes de aceitação

1. Gerente visualiza produtos de produção, e-commerce e compartilhados.
2. Gerente registra uma conferência e visualiza as conferências sem valores.
3. Gerente acessa suprimentos, inventário, planejamento, transferências e Saúde do Sistema.
4. Gerente não visualiza gestão de usuários, auditoria ou valores de pagamento.
5. Colaboradora comum e Recebimento mantêm exatamente os catálogos anteriores.
6. ADM mantém todas as permissões existentes.
