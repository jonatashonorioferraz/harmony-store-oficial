# Harmony Studio — Fase 8: Painel Administrativo

## Entrega

O aplicativo recebeu um painel administrativo protegido para governar o Centro de Inteligência sem alterar código-fonte.

## Capacidades

- Visualização dos oito especialistas e da versão publicada de cada um.
- Edição orientada de missão, regras obrigatórias, proibições, boas práticas e checklist.
- Criação de rascunho antes de publicar mudanças.
- Publicação imutável com arquivamento automático da versão anterior.
- Consulta e retirada de referências da Biblioteca de Excelência.
- Configuração versionada de marca, limite de título, nota mínima e orçamento por anúncio.
- Histórico consolidado de ações administrativas.

## Segurança e governança

- O painel e suas APIs exigem usuário autenticado e e-mail presente na lista administrativa do servidor.
- O navegador não decide permissões.
- Toda alteração relevante registra autor, horário, entidade e tipo de evento.
- Versões anteriores são preservadas e nunca sobrescritas.
- A edição de um agente não altera o conhecimento de outro agente.

## Persistência

A migração `0003_studio_admin.sql` adiciona configurações globais versionadas com índices para a versão ativa e unicidade por chave/versão.

## Validação

- 27 testes automatizados aprovados.
- Compilação de produção aprovada.
- A tela principal contém acesso visível ao painel em `/admin`.
