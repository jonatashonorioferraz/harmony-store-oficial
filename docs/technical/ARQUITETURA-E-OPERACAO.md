# Arquitetura e operação técnica

## Visão geral

```mermaid
flowchart LR
  U["PWA no navegador"] -->|"HTTPS + JWT"| API["Supabase Data API"]
  U -->|"HTTPS + JWT"| E["Edge Functions"]
  API --> DB["Postgres + RLS + RPCs"]
  E --> DB
  E --> ST["Storage privado/público controlado"]
  E --> PUSH["Web Push"]
  GH["GitHub Actions"] -->|"chave secreta exclusiva"| BK["Backup criptografado"]
  BK --> MON["system_backup_runs"]
```

O frontend é uma PWA estática publicada pelo GitHub Pages no domínio oficial. A chave publicável identifica o projeto, mas não concede acesso por si só. Autenticação, RLS, privilégios explícitos e RPCs transacionais formam a autorização efetiva.

## Limites de confiança

- O navegador nunca recebe chave secreta, senha do banco, chave VAPID privada ou segredo HMAC.
- `anon` não possui privilégios de negócio na Data API.
- `authenticated` acessa somente os objetos explicitamente concedidos; RLS limita cada linha.
- `service_role` existe apenas em Edge Functions e automações protegidas.
- Mudanças administrativas importantes são executadas por RPCs `security definer` que revalidam o perfil.
- Logs do cliente aceitam somente código, tela e versão saneados; não armazenam CPF, senha ou conteúdo livre.

## Fluxos principais

```mermaid
sequenceDiagram
  participant C as Colaboradora
  participant A as Aplicativo
  participant D as Banco/RPC
  participant M as ADM
  C->>A: Cria solicitação
  A->>D: create_own_request
  D-->>A: Protocolo
  A-->>M: Notificação
  M->>D: Confere e agenda
  D-->>C: Status atualizado
  M->>D: Registra entrega e recebimento
  D-->>A: Solicitação concluída
```

```mermaid
sequenceDiagram
  participant R as Recebimento
  participant D as Banco/RPC
  participant A as ADM
  R->>D: Coleta com vários itens
  D->>D: Calcula diferenças pela contagem oficial
  A->>D: Fecha semana segunda-domingo
  D->>D: Calcula quantidade × 2,50 / 100
  A->>D: Marca pagamento
```

```mermaid
sequenceDiagram
  participant M as ADM
  participant A as Aplicativo
  participant D as Banco com RLS
  participant S as Storage privado
  M->>A: Registra uma ideia
  A->>S: Envia imagem opcional
  A->>D: Salva ideia
  D->>D: Registra histórico e auditoria
  M->>A: Preparar para o Codex
  A-->>M: Texto estruturado copiado
```

As tabelas `improvement_ideas` e `improvement_idea_events` e o bucket privado `idea-attachments` são exclusivos de administradores. O autor original não pode ser substituído, exclusões não são concedidas e cada alteração gera histórico automático. Preparar uma ideia apenas organiza e copia o texto; não autoriza nem executa mudanças no sistema.

```mermaid
sequenceDiagram
  participant P as ADM principal
  participant R as RPC segura
  participant D as Banco
  participant E as Edge Function
  participant C as Colaboradora
  P->>R: Envia aviso global ou individual
  R->>R: Revalida ADM principal e destinatárias ativas
  R->>D: Persiste mensagem, destinatárias e auditoria
  D-->>P: ID e quantidade de destinatárias
  P->>E: Solicita push pelo ID persistido
  E->>D: Carrega mensagem e assinaturas
  E-->>C: Push com identidade Harmony
  C->>D: Abre aviso e confirma leitura
```

`app_notifications` guarda o conteúdo imutável do comunicado e `app_notification_recipients` registra a lista de destinatárias e a leitura individual. O envio é exclusivo de `private.is_primary_admin()`. Colaboradoras não recebem privilégios de escrita direta; a confirmação de leitura passa por RPC que atualiza somente a linha de `auth.uid()`. O push complementa, mas não substitui, a mensagem persistente: falhas de permissão, aparelho offline ou assinatura ausente não apagam o aviso interno.

## Componentes versionados

- `web/`: fonte estática publicada.
- `supabase/migrations/`: esquema, índices, RLS, privilégios e RPCs.
- `supabase/functions/`: usuários, notificações e diagnóstico.
- `tests/`: regressão funcional e segurança.
- `.github/workflows/quality.yml`: build e testes de cada mudança.
- `.github/workflows/backup.yml`: exportação diária, verificação, criptografia e retenção.
- `CHANGELOG.md`: histórico funcional legível também dentro do aplicativo.
- Tags `vN` geram automaticamente uma versão no GitHub com notas calculadas a partir das mudanças publicadas.

## Saúde do Sistema

Somente ADMs veem o painel. A Edge Function valida o JWT e o perfil ativo antes de consultar banco, domínio oficial, Storage, notificações, erros saneados e o último backup. Verde indica operação normal, amarelo exige acompanhamento e vermelho exige ação. O painel nunca expõe mensagens SQL, tokens ou dados pessoais.

## Estratégia de mudanças

1. Criar migration aditiva e rollback quando aplicável.
2. Rodar build e todos os testes.
3. Aplicar banco antes do frontend compatível.
4. Publicar Edge Functions com verificação JWT.
5. Publicar a PWA e validar produção.
6. Registrar versão, evidências e plano de retorno.

Mudanças destrutivas exigem backup válido, janela de manutenção e aprovação específica.
