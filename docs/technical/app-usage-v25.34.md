# Uso do aplicativo — v25.34

## Objetivo

Dar aos ADMs um sinal acolhedor de adoção do aplicativo para identificar colaboradoras que talvez precisem de ajuda. O indicador não deve ser usado como controle de produtividade.

## Dados coletados

- identificador interno da colaboradora;
- identificador da sessão Supabase Auth;
- data local de uso;
- primeiro e último heartbeat;
- tempo ativo aproximado;
- versão do aplicativo.

Não são coletados tela visitada, conteúdo digitado, ação individual, endereço IP, localização ou histórico de navegação.

## Cálculo

O navegador envia um heartbeat somente quando a conta é de colaboradora/recebimento, a aba está visível e houve interação nos últimos dois minutos. O servidor calcula o intervalo desde o heartbeat anterior e aceita no máximo 90 segundos por pulso. Por isso, o valor é aproximado e não equivale a jornada de trabalho.

## Permissões e segurança

- a tabela tem RLS habilitado e nenhuma política de acesso direto;
- `anon` e `authenticated` não possuem privilégios na tabela;
- colaboradoras podem executar apenas `record_own_app_usage`;
- somente um perfil ADM ativo pode executar `admin_list_app_usage_summary`;
- nenhum token ou senha é persistido na telemetria.

## Retenção e continuidade

Cada heartbeat remove agregados globais com mais de 180 dias, sem depender da identidade que originou os registros antigos. A tabela faz parte do backup e da recuperação isolada. A migração possui rollback dedicado; a coleta começa somente depois da aplicação da v25.34 e não é retroativa.
