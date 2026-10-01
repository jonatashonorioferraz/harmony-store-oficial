# Comunicação da Central — preparação do piloto WhatsApp

## Estado desta entrega

A Central oferece uma prévia do resumo da consulta atual. O envio automático permanece desativado. O texto vem das mesmas regras de boletos e solicitações do B0, com cobertura e data explícitas; não é um briefing histórico armazenado nem uma mensagem já agendada.

`central-briefing.mjs` compõe o conteúdo de modo determinístico. A chave diária identifica o resumo lógico do dia e não comprova persistência ou entrega. Duas consultas podem produzir textos diferentes para essa mesma chave; um futuro publicador deve congelar o primeiro briefing validado, antes de reservar destinatários. Mudar versão de regras ou atualizar a tela não deve gerar reenvio.

`supabase/functions/_shared/whatsapp-cloud.mjs` contém funções de transporte e conciliação para uso futuro no servidor. Não possui `Deno.serve`, endpoint publicado, credencial, acesso ao banco, scheduler ou chamada automática. Não é incluído no app estático. Seus testes usam exclusivamente respostas e contatos sintéticos.

Ainda não há outbox durável, webhook público, registro de consentimento, configuração de conta Meta ou envio às 07:30. Nenhuma migration é introduzida. O [ensaio SQL sintético](PLANO-ENSAIO-SQL-CI.md) não substitui a recuperação fiel de produção requerida em [Central em observação](CENTRAL-OBSERVACAO.md).

## Piloto com um destinatário

O primeiro teste foi delimitado a um destinatário que receberá no seu WhatsApp existente. A empresa ainda não possui número remetente ou conta Meta de desenvolvedor. O telefone do destinatário não pertence ao código ou à documentação pública.

A Meta fornece conta e número remetente de teste. O início rápido permite adicionar um destinatário e enviar o modelo de demonstração `hello_world`. Não é necessário transferir o WhatsApp do destinatário para a API. Os recursos de teste permitem modelos sem forma de pagamento cadastrada; isso não define preços ou condições de uso do futuro remetente de produção. Ver [recursos de teste](https://developers.facebook.com/docs/whatsapp/cloud-api/overview) e [início rápido](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started).

O cadastro e as verificações de identidade devem ser concluídos pelo titular na Meta. Não solicitar senhas, códigos de verificação ou tokens no chat, nem salvá-los em Git. O teste de conexão com `hello_world` é distinto da ativação do resumo operacional automático e não deve ser apresentado como esta última.

## Contrato do transporte preparado

O adaptador exige canal explicitamente habilitado, versão Graph explícita, identificador do remetente, token fornecido somente no servidor e modelo aprovado de utilidade em `pt_BR`, com validade configurada de 30 a 3.600 segundos. Esses são valores informados pelo futuro serviço; o helper não consulta nem comprova por si só a situação atual da conta ou do modelo.

A integração deve confirmar na Meta o formato **posicional**, exatamente dois parâmetros de texto no corpo: `{{1}}` = data e `{{2}}` = resumo, sem outros parâmetros obrigatórios em cabeçalho/botões. Exemplo de corpo a submeter, sem garantia prévia de aprovação ou categoria:

> Resumo operacional da Harmony Store para {{1}}.
> {{2}}
> Consulte os detalhes no app: https://app.harmonylembrancinhas.com.br/
> Envio solicitado pelo administrador.

O compositor limita o texto a 850 caracteres. O transporte normaliza espaços e quebras para um parâmetro de uma linha; essa é uma escolha de implementação. Revisar o texto final e os limites do modelo antes da submissão. Modelo de demonstração e modelo operacional têm contratos distintos; `hello_world` não utiliza este adaptador de dois parâmetros.

A chamada recebe conteúdo já congelado, data do dia em São Paulo, prazo de validade, consentimento vigente e uma entrega no estado `dispatching`. O helper valida esses campos, mas **não cria a reserva no banco**. O futuro worker precisa confirmar a reserva durável antes de chamar a API.

O identificador de Graph não usa o limite de tamanho do telefone. Telefone vai no formato internacional explícito; não há inferência de país nem alteração heurística do nono dígito. Quando a resposta identifica `contacts.input` como o destinatário solicitado, guarda-se `contacts.wa_id` como identificação canônica do provedor. Sem associação verificável, um status de telefone diferente permanece sem conciliação automática.

Há uma única tentativa HTTP, com timeout e redirecionamentos bloqueados. Resultado `accepted` ou `held_for_quality_assessment` confirma aceitação/retenção pelo provedor, não entrega. Rejeição definida registra somente código numérico seguro. Timeout, erro de rede, resposta inválida ou falha de servidor deixam resultado `unknown`, sem nova tentativa automática. `biz_opaque_callback_data` correlaciona a entrega; não é uma chave de idempotência da Meta.

O parser verifica HMAC-SHA256 sobre os bytes recebidos, com App Secret, antes de ler JSON. Confere conta e remetente e projeta somente status, identificadores e códigos necessários; ignora conteúdo de mensagens recebidas. O limite é 3 MiB. Não implementa ainda o endpoint GET de verificação ou POST público.

A conciliação exige identificação da mensagem/destinatário ou correlação segura de uma tentativa ambígua. Eventos repetidos e fora de ordem não apagam evidência de leitura/entrega. `read` pode chegar antes de `delivered`; não se inventa uma hora de entrega intermediária. Leitura no WhatsApp não significa reconhecimento administrativo nem resolução de uma pendência.

## Requisitos para ativar a rotina

1. Concluir e validar a recuperação isolada fiel antes da nova persistência; revisar migrations, catálogo de backup e restauração das tabelas de comunicação.
2. Criar configuração protegida e vínculos explícitos de ADMs ativos com destinatários e consentimento por finalidade. Telefone de perfil não é consentimento.
3. Gravar um briefing imutável e as entregas na mesma transação, com chave única por data/agenda/destinatário/canal. Mudança de versão não autoriza segundo envio no dia.
4. Reservar trabalho atomicamente e confirmar `dispatching` antes da chamada externa. Uma tentativa abandonada após reinício vira `unknown`; expiração de lease não deve disparar outro POST. Reenvio manual exige tentativa própria auditada e decisão explícita.
5. Guardar eventos recebidos e deduplicá-los em transação antes de responder HTTP200. Validar assinatura, escopo da conta, IDs e destinatário. Implementar verificação GET separada e limitar acesso ao servidor.
6. Conferir periodicamente status/categoria/validade do modelo na Meta e pausar diante de recategorização ou mudança incompatível. O template pode perder TTL personalizado após recategorização.
7. Usar um agendador no backend e relógio de São Paulo, com horário nominal 07:30 e limite para disparo tardio. Guardar horário previsto e efetivo; não prometer chegada exata às 07:30. Evitar duplicar a rotina existente da Agenda.
8. Testar consentimento revogado, ADM desativado, dois workers concorrentes, reinício, fonte desconhecida, perda da resposta, webhook repetido, indisponibilidade e troca de sessão. Confirmar envio e entrega no único destinatário autorizado antes de ampliar.

Segredos ficam somente no backend/gerenciador apropriado. O canal continua desativado enquanto esses requisitos não forem cumpridos. Não registrar tokens, telefones, conteúdo operacional ou erros brutos em logs.

## Referências oficiais consultadas em 01/10/2026

- [Política de mensagens e consentimento](https://whatsappbusiness.com/policy/): modelo aprovado fora da janela de 24 horas, opt-in e respeito ao opt-out.
- [Permissões](https://developers.facebook.com/documentation/business-messaging/whatsapp/permissions) e [tokens](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens).
- [Modelos](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview), [validade](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/time-to-live) e [aceitação/retenção](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-pacing/).
- [Envio](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages), [assinatura do webhook](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint/), [repetições](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview) e [status/correlação](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status).

Outbox, corte de horário, retenção e política de tentativas são decisões de engenharia da Harmony, não garantias da Meta.