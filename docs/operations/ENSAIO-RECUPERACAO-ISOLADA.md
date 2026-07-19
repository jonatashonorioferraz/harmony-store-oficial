# Ensaio de recuperação isolada

O workflow manual `Recuperação completa isolada` executa uma restauração real no projeto exclusivo de recuperação. Ele cria um backup atual da produção, valida todos os hashes, recria os usuários com identificadores remapeados e senhas temporárias aleatórias, restaura as 17 tabelas e repõe os objetos do Storage. Ao final, compara as contagens do destino com o manifesto.

## Proteções obrigatórias

- O destino deve ser `jwluqaycxoeyraxsleri`, separado da produção.
- URL e referência do projeto devem coincidir.
- A referência oficial `tyzfznwvjzmudxtcbbaf` é bloqueada no código.
- O destino deve estar vazio, exceto pelas categorias-padrão criadas nas migrations.
- A execução depende do ambiente protegido `recovery` e de segredos próprios do destino.
- Nenhuma senha original é exportada ou recuperada.

## Configuração

O ambiente `recovery` do GitHub utiliza `RECOVERY_SUPABASE_URL` e `RECOVERY_SUPABASE_SECRET_KEY`. A chave deve pertencer exclusivamente ao projeto isolado e ser revogada caso esse ambiente seja descartado.

## Resultado esperado

O ensaio somente termina com sucesso quando as contagens de usuários e de todas as tabelas são iguais ao manifesto. Uma divergência ou a presença de dados prévios interrompe a execução sem prosseguir para uma nova restauração.
