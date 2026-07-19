# Evidências das fases 3 a 5

Data: 19/07/2026

## Entregas

- Pipeline de qualidade com build, 58 testes, paridade entre raiz e `web/` e bloqueio de segredos conhecidos.
- Backup diário externo com manifesto, SHA-256, criptografia e retenção de 30 dias.
- Verificador de integridade e modo seguro de ensaio de recuperação.
- Ajuda rápida contextual, manual completo e documentação técnica.
- Changelog disponível no repositório e no aplicativo.
- Painel administrativo Saúde do Sistema com indicadores verde, amarelo e vermelho.
- Eventos saneados de cliente e notificações, sem conteúdo pessoal livre.
- Migration `system_health_and_backup_status` aplicada com RLS e privilégios mínimos.
- Edge Functions `system-health` v1 e `send-push` v7 ativas com validação JWT.

## Evidências técnicas

- Build: aprovado.
- Testes automatizados: 58 aprovados, 0 falhas.
- Banco: tabelas criadas, RLS ativo, RPC de backup negada a `authenticated` e concedida a `service_role`.
- Edge sem autenticação: HTTP 401.
- Backup inaugural executado pelo GitHub Actions no run `29678744646` em
  19/07/2026: 17 tabelas, 120 registros, 2 contas Auth, 30 objetos do Storage e
  48 arquivos verificados. O pacote criptografado possui aproximadamente 34 MB,
  hash registrado no Supabase e retenção válida até 18/08/2026.
- Ensaio automático de recuperação executado no run `29686795376` em
  19/07/2026 com GitHub Actions v7: o pacote foi descriptografado em ambiente
  temporário restrito, os 48 arquivos e hashes foram reconferidos e o modo
  somente leitura retornou `recovery_ready: true`. O artefato criptografado
  `harmony-backup-29686795376` possui 34.115.486 bytes e retenção válida até
  18/08/2026.

## Compatibilidade

As mudanças de banco são aditivas. Solicitações, produtos, recebimentos, pagamentos, perfis, notificações e relatórios mantêm suas regras existentes. O painel novo é visível apenas para ADM.
