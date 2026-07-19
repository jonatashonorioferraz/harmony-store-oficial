# Harmony Store Oficial — Gestão de Produção

Aplicativo web instalável (PWA) para solicitação de matéria-prima, gestão de
estoque, recebimento de produção artesanal, pagamentos semanais e inteligência
de compras da Harmony Store Oficial.

Produção: <https://app.harmonylembrancinhas.com.br/>

## Perfis

- **Colaboradora:** solicita materiais e acompanha apenas seus próprios dados.
- **Recebimento:** possui as funções da colaboradora e confere a produção sem
  visualizar valores em aberto.
- **ADM:** administra produtos, solicitações, recebimentos, pagamentos e compras.
- **ADM principal:** possui também os controles sensíveis de administradores e
  continuidade.

## Arquitetura oficial

- `web/`: aplicação PWA publicada.
- `supabase/migrations/`: schema, RLS, RPCs e privilégios versionados.
- `supabase/functions/`: funções Edge de usuários e notificações.
- `supabase/rollbacks/`: rollback operacional das mudanças sensíveis.
- `tests/`: testes automatizados de regras de negócio e segurança.
- `docs/audit/`: auditoria, matriz de permissões, fases e evidências.
- `docs/manual/`: manual completo por módulos e perfis.
- `docs/technical/`: arquitetura, fluxos e operação técnica.
- `docs/operations/`: backup, recuperação e resposta a incidentes.
- `scripts/`: build e servidor estático local.

O frontend usa somente a chave publicável. Chaves administrativas, senha do
banco e VAPID privada nunca devem ser adicionadas ao repositório.

## Verificação local

Requer Node.js 22 ou superior.

```bash
npm install
npm test
```

`npm test` reconstrói o site e executa toda a suíte automatizada. O resultado
deve ficar totalmente verde antes de uma publicação.

## Publicação

Os arquivos gerados em `dist/` correspondem ao conteúdo estático publicado no
GitHub Pages. O domínio personalizado é definido por `web/CNAME`.

Mudanças de banco devem ser criadas como migrations, testadas em transação com
`ROLLBACK`, acompanhadas de plano de recuperação e aplicadas ao projeto correto
do Supabase.

## Segurança

- Todas as tabelas públicas usam RLS.
- O papel anônimo não possui acesso às tabelas, sequências ou RPCs de negócio.
- RPCs privilegiadas validam identidade e função no banco.
- O ADM principal é protegido contra alterações por outros administradores.
- Usuários com histórico são desativados em vez de apagados fisicamente.
- Backups, arquivos `.env`, builds e pacotes de publicação são ignorados pelo Git.

Consulte [o plano por fases](docs/audit/PLANO-POR-FASES.md) e
[a matriz de permissões](docs/audit/MATRIZ-DE-PERMISSOES.md) antes de mudanças
estruturais.

Também estão disponíveis o [manual do aplicativo](docs/manual/MANUAL-DO-APLICATIVO.md),
a [documentação técnica](docs/technical/ARQUITETURA-E-OPERACAO.md) e o
[runbook de recuperação](docs/operations/RUNBOOK-BACKUP-RECUPERACAO.md).
