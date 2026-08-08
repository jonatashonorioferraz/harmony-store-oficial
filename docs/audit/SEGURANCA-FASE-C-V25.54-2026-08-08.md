# Segurança Administrativa — Fase C — v25.54

Data: 08/08/2026
Escopo: autenticação administrativa, sessão, operações irreversíveis e gestão de acessos.

## Resultado

A versão 25.54 acrescenta confirmação recente da senha para operações críticas sem modificar os papéis existentes, os dados das colaboradoras ou os fluxos operacionais normais.

## Proteções implementadas

1. **Confirmação de identidade por senha**
   - Uma autenticação por senha realizada nos últimos 10 minutos autoriza a ação crítica.
   - Depois de confirmada, a administradora pode continuar trabalhando nesse intervalo sem novos pedidos de senha.
   - A senha existe somente durante a requisição de autenticação e nunca é gravada no navegador ou no banco do aplicativo.

2. **Verificação em profundidade**
   - O aplicativo verifica o método `password` e seu horário no campo AMR do token autenticado.
   - A Edge Function `manage-user` repete a validação depois de confirmar o usuário com o Supabase Auth.
   - O banco repete a validação em exclusões definitivas protegidas por RPC ou RLS.
   - Uma renovação automática de token não substitui a autenticação real por senha.

3. **Operações cobertas**
   - Exclusão definitiva de produtos.
   - Exclusão definitiva de solicitações.
   - Exclusão de categorias.
   - Exclusão de campos personalizados e seus valores.
   - Criação, alteração, promoção, desativação e remoção de acessos da equipe.

4. **Bloqueio por inatividade**
   - Sessões administrativas são bloqueadas após 30 minutos sem interação.
   - O bloqueio é local e não remove a inscrição de notificações do aparelho.
   - Perfis de colaboradora e de recebimento mantêm o comportamento atual.

5. **Auditoria e recuperação**
   - Exclusões protegidas indicam no histórico que houve confirmação recente da senha.
   - A migration possui rollback emergencial versionado.
   - O backup externo continua incluindo o inventário das migrations.

## Compatibilidade

- Nenhuma tabela de negócio foi removida ou renomeada.
- Nenhum cálculo de estoque, pagamento, produção ou compra foi alterado.
- Nenhum papel ganhou ou perdeu acesso funcional.
- A interface de confirmação é responsiva para celular, tablet e computador.
- O PWA continua sendo a aplicação oficial publicada pelo GitHub Pages.

## Arquivos principais

- `app.js` e `web/app.js`: confirmação, bloqueio administrativo e interface.
- `styles.css` e `web/styles.css`: apresentação responsiva.
- `supabase/functions/manage-user/index.ts`: validação da confirmação no servidor.
- `supabase/migrations/20260808140000_admin_recent_password_protection.sql`: proteção no banco.
- `supabase/rollbacks/20260808140000_admin_recent_password_protection.sql`: retorno emergencial.
- `tests/admin-security.test.mjs`: contrato automatizado da Fase C.

## Validação

- Construção estática concluída.
- 203 testes automatizados aprovados.
- 49 arquivos oficiais espelhados e idênticos.
- ESLint sem erros; permanecem apenas avisos conhecidos de código legado e do protótipo Next não publicado.

## Risco residual e próxima evolução

O aplicativo passa a exigir uma nova prova de senha para ações críticas. Como evolução futura, pode-se cadastrar MFA por aplicativo autenticador para administradoras e exigir `aal2`. Essa etapa precisa de implantação assistida para evitar que uma administradora fique sem acesso.
