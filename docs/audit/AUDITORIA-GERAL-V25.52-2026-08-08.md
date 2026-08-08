# Auditoria geral do Harmony Store Oficial — v25.52

Data: 08/08/2026  
Escopo: código publicado, arquitetura, Supabase, autenticação, permissões, continuidade, desempenho, PWA, experiência responsiva e manutenibilidade.

## 1. Parecer executivo

O aplicativo está operacionalmente saudável e possui uma base de proteção incomum para um sistema deste porte. A compilação oficial foi aprovada e a suíte atual executou **190 testes, sem falhas**. Não foi identificado defeito crítico ativo nem segredo privado versionado no repositório.

O risco principal deixou de ser uma função isolada e passou a ser o crescimento da complexidade: o aplicativo oficial carrega muitos módulos de uma vez, mantém duas representações do frontend e consulta alguns históricos completos. Isso ainda funciona com o volume atual, mas tende a aumentar tempo de carregamento, custo de manutenção e possibilidade de regressão conforme os dados crescem.

Recomendação executiva: **não adicionar novos menus por enquanto**. O melhor próximo investimento é simplificar a base, paginar dados e conectar melhor informações já existentes.

## 2. Evidências verificadas

- Backup criptografado remoto concluído e artefatos locais restauráveis preservados.
- GitHub Actions de qualidade, segurança e publicação aprovados.
- Build estático oficial aprovado.
- 190 testes aprovados, 0 falhas.
- 49 arquivos oficiais espelhados e protegidos contra divergência, inclusive no Windows.
- ESLint: 0 erros e 23 avisos; parte dos avisos aparece duas vezes por causa do espelhamento raiz/`web`.
- Nenhuma chave OpenAI, senha de banco, connection string ou chave `service_role` real encontrada nos arquivos versionados.
- Cache inicial offline: aproximadamente **2,09 MB**, correspondente a 46 arquivos e 87% do limite preventivo de 2,5 MB.
- Código JavaScript carregado pelo aplicativo: aproximadamente **429 KB**, distribuídos em 18 arquivos, com cerca de 414 funções.
- Banco versionado por 39 migrations oficiais e cinco Edge Functions.

## 3. O que está forte e deve ser preservado

1. **Permissões por perfil:** colaboradora, recebimento, ADM e ADM principal possuem testes específicos.
2. **Operações críticas transacionais:** estoque, separação, pagamento, cadastro e auditoria possuem proteção no banco.
3. **Histórico e auditoria:** registros sensíveis são preservados em vez de apagados indiscriminadamente.
4. **Continuidade:** backup de dados, Auth e Storage, verificação por hash e restauração isolada já existem.
5. **PWA e responsividade:** instalação, orientação, tablet, celular, modo offline e PDFs possuem testes de regressão.
6. **Segredos fora do navegador:** OpenAI e chaves administrativas permanecem em funções seguras.
7. **Separação dos catálogos:** produção, e-commerce e suprimentos internos possuem regras testadas.

## 4. Funções repetidas ou sem necessidade comprovada

### 4.1 Estrutura Next/React paralela — alta prioridade de organização

A pasta `app/`, juntamente com `worker/`, `db/`, `drizzle/` e parte das dependências de Next/React/Vite, não participa do build oficial. A produção continua sendo a PWA estática copiada de `web/`.

Essa estrutura paralela contém uma versão antiga e incompleta da gestão e pode induzir alguém a corrigir a tela errada. Ela também amplia atualizações automáticas de dependências e a superfície de manutenção.

**Ação recomendada:** arquivar ou transferir essa estrutura para um repositório experimental depois de um inventário final. Não remover diretamente da branch oficial.

### 4.2 Espelhamento raiz e `web/` — repetido, mas necessário hoje

Existem 49 arquivos duplicados entre a raiz e `web/`. A repetição é real, porém o processo atual de publicação depende dela e agora existe uma verificação automática de paridade.

**Decisão:** não remover nesta etapa. Primeiro deve ser criado um único diretório-fonte e ajustados build, testes, cache offline e GitHub Pages em uma mudança isolada.

### 4.3 Código antigo provavelmente substituído — limpeza de baixo risco, com testes

- `requestModal` em `app.js` foi substituído pelo fluxo `requestModalV2`.
- `prepareModal` e `completeModal` em `internal-supplies.js` não possuem chamada ativa.
- A importação `basename` no script de backup não é utilizada.
- O arquivo `007_reliability_improvements.sql` da raiz é cópia exata da migration oficial.
- Ícones antigos sem sufixo `-v2` e `app-icon-master.png` não participam do cache inicial nem do manifesto atual, embora alguns ainda sejam exigidos por testes históricos.

**Ação recomendada:** remover um item por vez em branch de limpeza, atualizando testes somente após confirmar que não há uso no build, no PWA ou em documentação operacional.

### 4.4 Avisos que não representam código morto

Objetos globais como `HarmonyNotifications` e `HarmonyAppUsage` são consumidos entre scripts pelo navegador. O analisador não enxerga esse contrato e os marca como não utilizados. Não devem ser apagados apenas para zerar avisos.

## 5. Melhorias necessárias

### Prioridade alta

1. **Paginação e colunas específicas no servidor.** Solicitações, produtos, contas, cupons internos, fornecedores e eventos de ideias ainda possuem consultas amplas com `select=*`. Com histórico grande, o login e alguns painéis ficarão progressivamente mais lentos.
2. **Ambiente de homologação com testes dos quatro perfis.** Os testes atuais são fortes, mas majoritariamente estruturais. Uma rotina E2E deve entrar, criar dados descartáveis, percorrer os fluxos principais e executar rollback.
3. **MFA ou reautenticação para ADM principal.** Exclusão definitiva, promoção de ADM, alteração de credenciais e operações financeiras merecem uma segunda confirmação de identidade.
4. **Separar a estrutura experimental do aplicativo oficial.** Reduz confusão, dependências e risco de alterações no local errado.

### Prioridade média

1. **Divisão progressiva do frontend por módulos carregados sob demanda.** Hoje os 18 scripts entram no primeiro acesso, mesmo quando o perfil não usa boa parte deles.
2. **Otimização da imagem `brand-mark.png`.** Ela possui aproximadamente 1 MB e representa quase metade do cache inicial. Deve ser convertida para uma versão menor após comparação visual.
3. **Substituição gradual de `alert`, `confirm` e `prompt`.** Um componente único de confirmação melhora acessibilidade, aparência e mensagens no celular.
4. **Contrato explícito entre módulos.** Alguns arquivos substituem funções globais como `renderPage`. Um pequeno barramento de eventos reduziria acoplamento e efeitos colaterais.
5. **Verificação automática de diferença entre migrations e banco oficial.** Impede que o código considere uma migration publicada quando ela não foi aplicada no Supabase.

### Prioridade baixa

1. Limpar imports e funções comprovadamente antigas.
2. Remover masters e ícones legados após validar instalação em Android, iPhone e tablet.
3. Formatar arquivos muito compactados para facilitar revisão, sem alterar comportamento.

## 6. Funcionalidades novas que realmente agregariam valor

### 6.1 Planejado versus recebido na produção — recomendação principal

Conectar as ordens de produção com os recebimentos já existentes, sem envolver pagamento. Para cada colaboradora, modelo e cor, mostrar:

- quantidade planejada;
- quantidade oficialmente recebida;
- saldo pendente;
- prazo da ordem;
- indicação de recebimento parcial, completo ou acima do planejado.

Benefício: elimina conferência manual entre duas áreas que já existem e mostra atrasos ou caixas pendentes sem criar um novo processo de trabalho.

### 6.2 Estoque mínimo sugerido por consumo e prazo do fornecedor

Usar consumo histórico, solicitações abertas e prazo médio do fornecedor para sugerir um estoque mínimo. A sugestão deve depender de aprovação do ADM e nunca alterar estoque automaticamente.

Benefício: transforma os relatórios atuais em decisão de compra, reduzindo faltas de matéria-prima.

### 6.3 Qualidade dos dados dentro da Inteligência

Adicionar uma pequena seção, sem novo menu, mostrando registros que precisam de revisão: produto sem fornecedor, item sem foto, cor fora do padrão, cupom com data suspeita, recebimento sem referência e divergência ainda aberta.

Benefício: mantém os relatórios confiáveis e evita que erros silenciosos se acumulem.

## 7. O que não deve ser removido

- Índices classificados como pouco usados enquanto o histórico ainda é pequeno.
- RPCs `SECURITY DEFINER` apenas por existirem; elas sustentam operações transacionais e possuem grants testados.
- Auditoria, histórico cancelado, notificações internas e registros de backup.
- A Central de Pendências e o “Meu dia” sem uma análise de fluxo: possuem objetivos diferentes e já evitam repetição visual.
- O espelhamento raiz/`web/` antes de alterar o pipeline completo.
- Compatibilidade com celular e tablet, inclusive impressão no documento atual do Android.

## 8. Plano seguro recomendado

### Etapa A — limpeza comprovável

- Remover somente código morto e duplicatas históricas comprovadas.
- Manter o mesmo HTML, CSS, banco e comportamento.
- Executar build, 190 testes, lint e paridade dos arquivos.

Risco: baixo. Benefício: manutenção mais clara.

### Etapa B — desempenho de dados

- Paginar solicitações e históricos.
- Selecionar apenas colunas necessárias.
- Preservar filtros e relatórios existentes.
- Testar volumes artificiais grandes em ambiente isolado.

Risco: médio. Benefício: alto e preventivo.

### Etapa C — autenticação administrativa reforçada

- MFA/reautenticação para ações críticas.
- Sessões e recuperação de acesso documentadas.
- Testes por papel e plano de contingência para perda do segundo fator.

Risco: médio. Benefício: alto.

### Etapa D — inteligência operacional

- Planejado versus recebido.
- Sugestão de estoque mínimo.
- Qualidade dos dados integrada à Inteligência.

Risco: médio. Benefício: alto, sem aumentar a quantidade de menus.

## 9. Conclusão

O Harmony Store não precisa de uma reconstrução. A arquitetura atual pode continuar atendendo a empresa, desde que a próxima evolução priorize simplificação e escala antes de novos módulos. A ordem mais segura é: **limpeza comprovada → paginação → autenticação reforçada → inteligência usando dados já existentes**.

