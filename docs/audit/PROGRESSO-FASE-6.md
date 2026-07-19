# Fase 6 — performance preventiva e acabamento técnico

Data: 19/07/2026

## Entregas desta etapa

- Teste automático do conjunto de arquivos necessários para uso offline.
- Limite preventivo de 2,5 MB para o cache inicial do PWA.
- Verificação das dimensões reais dos ícones declarados no manifesto.
- Proteção automatizada do modo retrato, instalação, atualização do Service Worker e fallback offline.
- Auditoria de vulnerabilidades altas ou críticas nas dependências de produção a cada publicação.
- Revisão mensal agrupada de pacotes npm e componentes do GitHub Actions.

## Evidências

- Suíte local: 61 testes aprovados, 0 falhas.
- Pipeline oficial `29687776692`: build, auditoria de dependências, testes,
  paridade dos arquivos oficiais e bloqueio de segredos aprovados.
- Publicação oficial `29687776339`: concluída com sucesso.
- Nenhuma alteração foi feita nas telas, regras de negócio, permissões ou dados.

## Compatibilidade

A estrutura de compatibilidade com Sites/Cloudflare foi preservada. O aplicativo
oficial continua publicado pelo GitHub Pages e usando Supabase normalmente.
