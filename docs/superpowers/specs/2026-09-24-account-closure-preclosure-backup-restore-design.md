# Proteção contra restauração anterior ao encerramento — desenho

Estado: desenho implementado e validado **somente em ambiente local descartável** em 24/09/2026. Este documento não autoriza migration, deploy, criação de bucket, ativação da função nem teste com conta real.

## Objetivo e limite

Uma restauração de backup anterior a um encerramento aceito não pode reabrir o acesso, reativar credenciais ou disponibilizar conteúdo privado que já deveria ter sido expurgado. O ensaio atual em `scripts/verify-account-closure-restore.mjs` usa um dump posterior ao encerramento: ele demonstra preservação do tombstone no próprio backup, não a reaplicação de um tombstone ausente dele.

O trabalho desta etapa é desenhar e validar localmente, com identidades e bancos descartáveis, uma fonte de recuperação independente do Cloud SQL. Não inclui publicação, conta real ou alteração de configuração remota. O telefone de suporte e os demais gates de publicação permanecem fora desta etapa.

## Alternativas consideradas

1. **Diário externo, imutável e reaplicável — escolhido.** Cada solicitação produz eventos mínimos fora do banco antes de alterar a conta. Uma restauração isolada consulta o diário, bloqueia acesso e reaplica expurgo e minimização antes de liberar tráfego. Exige uma dependência de armazenamento e um procedimento de recuperação explícito, mas cobre backups anteriores ao encerramento.
2. **Apenas cópia periódica da tabela `account_closures`.** Mais simples, porém uma cópia atrasada pode perder uma solicitação aceita entre sincronizações; não satisfaz o bloqueio imediato após restauração.
3. **Proibir restauração de qualquer backup anterior ao último encerramento.** Evita a ressurreição somente se todos os operadores obedecerem à restrição, mas pode eliminar a única opção de recuperação diante de perda do banco. Não atende ao requisito original de reaplicar tombstones.

## Fonte de recuperação

O contrato `AccountClosureJournal` usa criação condicional de eventos e leitura/listagem consistente. O adaptador GCS implementado requer bucket dedicado, independente do Cloud SQL, com objetos criados uma única vez (`ifGenerationMatch: 0`), sem permissão de exclusão para a identidade de execução. O armazenamento precisa conservar cada evento por **42 dias**, cobrindo o máximo previsto de 35 dias de backups mais sete dias de margem operacional. Qualquer backup ou snapshot restaurável por mais de 35 dias impede o descarte do evento correspondente e exige revisão da retenção antes de ativar o serviço. A política de retenção imutável do bucket, por ser irreversível, constitui gate remoto separado; nada foi provisionado nesta etapa.

Um objeto-âncora com ID fixo e MAC, configurado separadamente do banco, é obrigatório: bucket vazio, âncora ausente ou substituída não passam no gate. A âncora **não prova sozinha** que todos os eventos históricos continuam no bucket. Exclusão seletiva de um objeto só pode ser excluída por retenção/IAM adequados e inventário externo auditável; esses controles não foram validados localmente e impedem ativação remota sem revisão operacional.

As propriedades pressupostas do armazenamento estão documentadas pelo Google: [precondições de criação](https://docs.cloud.google.com/storage/docs/request-preconditions), [consistência de leitura e listagem](https://docs.cloud.google.com/storage/docs/consistency) e [irreversibilidade do Bucket Lock](https://docs.cloud.google.com/storage/docs/bucket-lock). A validação local provará o contrato do adaptador descartável, não essas propriedades no projeto remoto.

O caminho do objeto conterá somente um HMAC do par subject/chave de idempotência. O corpo versionado terá `closureId`, versão da política, instante, hashes de subject/usuário/tenant, hash do token de acompanhamento, hash da chave de idempotência e fingerprint da solicitação. IDs necessários para excluir a identidade externa e localizar registros restaurados serão cifrados com AES-256-GCM sob segredo próprio, distinto dos segredos de token e de hash. Não guardar e-mail, senha, token em claro, consulta, documento ou payload jurídico. O segredo de cifra e suas versões devem permanecer disponíveis enquanto houver evento ou backup restaurável que dependa deles; rotação exige recriptografia ou leitura multiversão testada.

Eventos são anexados, não substituídos: `PREPARED`, `ACCEPTED` e, quando a transação comprovadamente não ocorreu, `ABORTED`. Mesmo o `ABORTED` permanece no diário até vencer a janela de recuperação, para que uma falha de escrita ou uma corrida não seja ocultada por exclusão.

## Aceite e falhas entre sistemas

1. O serviço valida sessão, confirmação, política, reautenticação e chave de idempotência como hoje. Antes da transação de bloqueio, cria `PREPARED` no diário. Nome determinístico e criação condicional permitem repetir a requisição sem criar outra intenção; conflito de fingerprint é rejeitado.
2. Se a gravação de `PREPARED` falhar, a transação **não começa** e nenhuma solicitação é aceita. Se ela passar, `AccountClosureRepository.begin` usa o mesmo `closureId` do evento.
3. Depois do commit, o serviço tenta anexar `ACCEPTED`. Uma falha nessa segunda gravação não desfaz o bloqueio: o evento `PREPARED` já durável permanece como pendência operacional. A resposta conserva o recibo da closure efetivamente aceita; a pendência é alertada sem registrar segredo. Um retry com a mesma chave ou a verificação na inicialização confere o tombstone exato e completa o evento. Não se infere `ACCEPTED` apenas da existência de perfil ou de um hash parecido.
4. Se a transação falhar, só se anexa `ABORTED` após verificar que não existe closure aceita com aquele subject e fingerprint. Se a verificação ou a gravação falhar, a intenção permanece não resolvida. Uma intenção não resolvida impede a liberação de qualquer restauração; o operador reconcilia com evidência antes de classificá-la. Ela nunca é presumida abortada.

O diário é uma fonte de recuperação, não substitui a transação local. A indisponibilidade dele antes de `PREPARED` impede novas solicitações, mas não pode desabilitar o acompanhamento das closures já aceitas nem interromper o reconciliador existente. A flag de novas solicitações e a obrigação de proteger restaurações são controles distintos.

## Restauração e bloqueio de tráfego

Uma restauração só ocorre em banco isolado, com entrada pública e worker suspensos, seguida de reinício da API contra o banco restaurado. Antes de disponibilizá-lo, o procedimento confere a âncora, lê os eventos listados, valida versões e integridade e resolve `PREPARED` sem terminal. A listagem não atesta ausência de exclusões seletivas; isso depende dos controles do bucket acima. Falha de leitura, evento inválido ou intenção ambígua mantém o ambiente fechado.

Para cada `ACCEPTED` ausente do backup, a reaplicação é idempotente: recria um tombstone de bloqueio por hashes mesmo se o perfil não existir no backup; quando há perfil, desabilita usuário e tenant, revoga memberships e chaves, recria a saga e reexecuta as etapas idempotentes de exclusão da identidade externa, expurgo, minimização financeira e verificação residual. Não se marca `COMPLETED` por inserção direta. O hash do token de acompanhamento e o `closureId` preservam a possibilidade de consulta do recibo. A ausência de perfil não autoriza recriar identidade ou dispensar a exclusão externa pendente.

O acesso autenticado deve consultar também os tombstones reaplicados. A prontidão do serviço permanece fechada até confirmar que o banco contém os bloqueios de todos os `ACCEPTED` aplicáveis e que não há intenção ambígua. Para tombstones pendentes, verifica-se bloqueio de usuário, tenant, vínculos e credenciais. Para os completos, também se conferem as cinco etapas, remoção da identidade local, ausência de conteúdo privado e minimização financeira. O replay restaurado usa um marcador durável até completar a saga; uma closure normal ainda pendente não derruba todo o site. A verificação é mantida em cache depois do startup; uma perda/reconexão observável do banco a invalida. **Trocar o banco por baixo de um processo ainda saudável não é coberto**: a operação exige isolamento, parada/reinício da API e execução do gate antes de reabrir tráfego. A checagem de prontidão é uma segunda barreira, não licença para restaurar diretamente o banco em serviço.

Nenhuma escrita de recuperação altera uma conta real na validação local. O futuro procedimento remoto exigirá autorização própria, isolamento comprovado, inventário dos objetos aplicáveis, registro do operador, contagens sem PII e liberação explícita após as verificações.

## Validação local exigida

Um adaptador descartável de diário, fora dos bancos temporários, implementará o mesmo contrato do adaptador produtivo. O ensaio cria apenas subject, tenant, API key, matéria e compra sintéticos. Ele tira o dump **antes** da solicitação; no banco de origem executa o encerramento e as etapas com administrador de identidade falso; restaura o dump em outro banco temporário. Antes do replay, demonstra que o backup contém dados e chave anteriores. O gate de prontidão deve negar tráfego. Depois do replay, comprova tombstone, login/JWT e API key negados, conteúdo privado ausente, registros financeiros minimizados, exclusão externa simulada, recibo consultável e segunda execução sem efeitos adicionais.

Casos de falha obrigatórios: diário indisponível antes de `PREPARED` sem mudança no banco; falha após `PREPARED` e antes do commit; commit concluído com falha em `ACCEPTED`; evento corrompido; evento `ACCEPTED` sem perfil no backup; replay interrompido e retomado. Os testes usam apenas banco PostgreSQL local descartável e diretório temporário validado antes do cleanup. A suíte existente de restauração pós-encerramento continua separada, pois prova outra propriedade.

Passar no ensaio local não comprova IAM, retenção do bucket, disponibilidade do Cloud Storage, configuração dos segredos, migration remota ou operação real. Esses gates permanecem necessários antes de publicar a função.

## Resultado local observado

O gate `pnpm verify:account-closure-preclosure-restore` usou PostgreSQL 18 em cluster temporário `127.0.0.1:55439`, dois bancos `forgelex_closure_restore_<UUID>` e diário em diretório temporário separado. O dump ocorreu antes da solicitação; no banco restaurado, antes do replay, havia matéria privada e chave ativa, sem tombstone. A rota de negócio retornou 503. O replay reconstituiu o tombstone, concluiu as cinco etapas com Auth falso, revogou a chave, removeu a matéria, minimizou a compra, negou bootstrap e preservou a consulta ao recibo sintético. Uma interrupção após a primeira etapa manteve a barreira fechada; a retomada concluiu as quatro restantes. Uma terceira execução não reaplicou nada. Os bancos do ensaio foram removidos.

Os testes unitários cobrem falha antes de `PREPARED` sem início da transação, falha de `ACCEPTED` após commit preservando o recibo, commit ambíguo mantido como intenção pendente, reconciliação posterior pelo tombstone, intenção `ABORTED`, conflito de fingerprint, cifra adulterada, chave desconhecida, âncora ausente/errada, listagem indisponível, restauração parcial com identidade reaparecida e criação condicional simulada do objeto GCS. Após as correções finais, `pnpm format:check`, `pnpm lint`, `pnpm typecheck` e `pnpm test` passaram; a suíte completa registrou 95 arquivos aprovados, 1 ignorado, 477 testes aprovados e 4 ignorados. O ensaio PostgreSQL de backup anterior também passou novamente. O adaptador GCS foi testado com cliente falso; não foi acessado bucket real.
