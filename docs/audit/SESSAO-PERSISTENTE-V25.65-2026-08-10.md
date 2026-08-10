# Sessão persistente — v25.65

Data: 10/08/2026
Escopo: autenticação, continuidade da sessão e experiência diária de ADMs, colaboradoras e perfil de recebimento.

## Decisão operacional

O bloqueio local que encerrava a sessão administrativa depois de 30 minutos sem interação foi removido. O Harmony Store é utilizado em vários momentos do dia, com intervalos naturais entre as atividades, e a expiração artificial prejudicava esse fluxo.

## Novo comportamento

- A sessão permanece no aparelho e é restaurada quando o PWA é reaberto.
- Quando o token de acesso estiver próximo de vencer, o aplicativo usa o `refresh_token` para renová-lo silenciosamente.
- A sessão somente é encerrada quando a pessoa toca em **Sair do aplicativo**, quando o cadastro deixa de estar ativo ou quando a sessão do Supabase deixa de ser válida.
- A chave legada `harmony.admin.last_activity` é apagada automaticamente no próximo login ou na próxima restauração.

## Proteções preservadas

- A confirmação recente da senha continua obrigatória para ações administrativas críticas.
- A confirmação continua válida por apenas 10 minutos e é validada na interface, na Edge Function e no banco.
- Papéis, permissões, RLS, estoque, pagamentos, notificações e módulos operacionais não foram alterados.
- A saída manual continua revogando a sessão no Supabase e limpando os dados locais do aparelho.

## Compatibilidade e risco

Esta alteração é somente no ciclo local de autenticação do PWA e não exige migration. O risco de uma sessão permanecer aberta em aparelho compartilhado é tratado pela orientação de usar **Sair do aplicativo** nesses aparelhos e pela confirmação de senha nas operações sensíveis.

## Validação automatizada

O contrato de segurança verifica que:

1. não existe temporizador nem bloqueio por inatividade;
2. a restauração utiliza a renovação segura da sessão;
3. a saída explícita continua disponível;
4. a confirmação recente de senha e as proteções no servidor permanecem ativas;
5. os clientes oficiais da raiz e de `web/` são idênticos.
