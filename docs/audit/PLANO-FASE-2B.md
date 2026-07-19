# Fase 2B — integridade, privacidade e auditoria

Atualizado em: 19/07/2026

## Objetivo

Eliminar escritas administrativas fragmentadas no navegador, tornar a trilha de
auditoria confiável, proteger fotos pessoais e fortalecer o tratamento de CPF,
sem interromper o aplicativo oficial.

## Estratégia de implantação

A publicação foi dividida em dois estágios:

1. **Preparação compatível:** cria RPCs transacionais, auditoria imutável,
   paginação no servidor e versão do hash de CPF, mantendo temporariamente os
   acessos usados pelo app v23.
2. **Aplicação v24 e endurecimento:** publica a interface e a Edge Function
   compatíveis; somente depois revoga escritas diretas, fecha a auditoria e torna
   o bucket de fotos de perfil privado.

Essa ordem evita indisponibilidade durante a propagação do GitHub Pages e mantém
um rollback operacional compatível com as versões v23 e v24.

## Mudanças implementadas

- Produto, estoque, fornecedor preferencial e campos personalizados são salvos
  pela função transacional `admin_save_product`.
- Exclusão de produto e parâmetros de planejamento passam por RPCs administrativas.
- Eventos de auditoria possuem origem, correlação, estado anterior e posterior.
- `audit_logs` bloqueia `UPDATE`, `DELETE` e `TRUNCATE`, inclusive para chamadas
  comuns do backend; manutenção excepcional exige sessão `postgres` e sinalização
  explícita.
- Consulta de auditoria é administrativa, filtrável e paginada no servidor.
- Fotos de perfil são carregadas por requisição autenticada; URLs públicas deixam
  de ser usadas.
- CPF novo ou alterado usa HMAC-SHA-256 com segredo exclusivo da Edge Function,
  preservando detecção de cadastros legados em SHA-256.
- Erros internos da Edge Function não são enviados ao navegador; o usuário recebe
  mensagem segura e um identificador de erro.

## Evidências de validação

- Build estático aprovado.
- 51 testes automatizados aprovados.
- Simulação transacional em produção criou e removeu um produto, consultou a
  auditoria paginada e confirmou o bloqueio de adulteração; a transação foi revertida.
- Segredo `CPF_HMAC_SECRET` criado no Supabase sem exposição no repositório.
- Edge Function `manage-user` v10 publicada com verificação JWT e resposta `401`
  confirmada para chamada sem sessão.

## Impacto, risco e benefício

| Área | Impacto | Risco residual | Benefício |
|---|---|---|---|
| Produtos | Escrita via RPC | Baixo | Salva tudo ou nada; evita estoque parcial |
| Auditoria | Somente fontes confiáveis | Baixo | Histórico verificável e não adulterável |
| Fotos pessoais | Leitura autenticada | Baixo | Remove exposição por URL pública |
| CPF | HMAC versionado | Baixo | Dificulta ataques por tabela de hashes |
| Interface | Cache PWA v24 | Baixo | Atualização controlada e compatível |

## Recuperação

O rollback em
`supabase/rollbacks/20260719060830_phase_2b_integrity_privacy.sql` reabre
temporariamente os acessos do app v23 e a leitura pública de avatares. As colunas
e RPCs aditivas são preservadas para que o app v24 continue funcionando durante
uma recuperação.

