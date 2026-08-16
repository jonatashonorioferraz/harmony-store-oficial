# Auditoria — Central de Transferências v25.92

Data: 16/08/2026

## Escopo validado

- continuidade do fluxo existente de reservas FULL;
- solicitações diretas sem duplicar catálogo;
- caixas completas, reservas parciais e prevenção de dupla reserva;
- papéis da gerente, ADM principal, ADM, Recebimento e colaboradora;
- compatibilidade de PWA em cache;
- responsividade em computador, tablet e celular;
- backup, recuperação, manual, ajuda e changelog.

## Controles de segurança

- RLS ativado na nova tabela de itens.
- Escrita direta revogada para `anon` e `authenticated`.
- Funções com verificação explícita de perfil e `search_path` vazio.
- Restrições de origem, prioridade, finalidade e ciclo de vida no banco.
- Índices únicos impedem reserva concorrente da mesma caixa e solicitação FULL ativa duplicada.
- Caixa em transferência não pode ser alterada por outro fluxo.

## Compatibilidade funcional

- Nenhuma regra de pagamento foi alterada.
- Nenhuma ordem de produção ou recebimento de produção foi recalculado.
- Modelos, cores, fotos e caixas continuam vindo dos cadastros oficiais.
- O Planejamento FULL passa a abrir a Central, mas mantém o mesmo vínculo histórico.
- Funções legadas são adaptadas para o novo motor, evitando falhas em celulares com cache anterior.

## Critérios de aceite

- criar solicitação direta com múltiplos itens;
- criar/abrir solicitação por item FULL, inclusive kit composto;
- sugerir somente caixas correspondentes ao modelo e à cor;
- ordenar opções mais antigas primeiro;
- impedir dupla reserva em concorrência;
- ocultar reservas parciais do contador e da galeria de disponibilidade;
- despachar a caixa completa e confirmar recebimento;
- cancelar antes do despacho e devolver a disponibilidade;
- manter histórico recolhido por padrão;
- exportar CSV sem dados pessoais sensíveis.

O resultado final deve ser registrado após a bateria automatizada, os consultores de segurança do Supabase e a validação visual responsiva.

## Resultado final da validação

- Build estático concluído sem erro.
- 332 testes automatizados aprovados, com 0 falhas, 0 cancelamentos e 0 testes ignorados.
- Migrações `transfer_center_v25_92` e `transfer_center_fk_indexes_v25_92` aplicadas com sucesso.
- Consultor de desempenho do Supabase sem chaves estrangeiras não indexadas para a Central.
- Avisos de índices ainda não utilizados são informativos e esperados antes do uso real do módulo.
- As funções expostas ao aplicativo permanecem `SECURITY DEFINER` de forma intencional: cada RPC valida internamente o perfil autenticado, utiliza `search_path` vazio e a escrita direta nas tabelas segue revogada.
- Conferência ao vivo confirmou que a base existente não possuía solicitações da Central; portanto, nenhum registro operacional anterior foi recalculado ou alterado durante a implantação.
