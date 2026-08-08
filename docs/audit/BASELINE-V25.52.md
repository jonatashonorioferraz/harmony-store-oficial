# Linha de base protegida — v25.52

Data: 08/08/2026

## Ponto de retorno

- Commit oficial: `f88ba96183313225dc639300a09ebee63d3ee7ea`.
- Backup remoto manual aprovado: execução `31267709297`.
- Conteúdo do backup: banco de dados, inventário de usuários do Auth e arquivos do Storage.
- Proteção: pacote criptografado, hash SHA-256 e validação de restauração antes da retenção privada por 30 dias.
- Snapshot local independente: histórico Git completo e 542 arquivos do diretório de trabalho, incluindo arquivos ainda não publicados.

## Estado funcional de referência

- Build estático oficial concluído.
- 188 testes automatizados aprovados, sem falhas.
- Lint concluído sem erros; avisos existentes foram inventariados e não bloqueiam a versão atual.
- Aplicativo oficial permanece na arquitetura PWA estática descrita no README.

## Fluxos que não podem sofrer regressão

1. Login, troca obrigatória de senha, perfil e encerramento de sessão.
2. Isolamento dos dados de cada colaboradora e permissões dos perfis administrativos.
3. Solicitação, edição, separação, agendamento, entrega e movimentação de estoque.
4. Check-up item a item, falta de estoque, divergência e reposição.
5. Ordens e recebimentos de produção, conferência oficial e pagamentos.
6. Suprimentos internos, leitura de cupom, boletos e documentos privados.
7. Notificações individuais/globais, confirmação de leitura e push.
8. Relatórios e PDFs em computador, celular e tablet.
9. Instalação PWA, atualização, cache e recuperação offline.
10. Backup, Saúde do Sistema, auditoria e recuperação isolada.

Qualquer mudança estrutural deve comparar seu resultado com esta linha de base e preservar as mesmas regras de autorização e integridade.
