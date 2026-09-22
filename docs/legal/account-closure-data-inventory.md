# Inventário executável de dados para encerramento de conta

**Versão:** `2026-09-22.v1`

**Escopo:** tenant pessoal com um único membro proprietário

**Estado:** contrato técnico interno; retenções fiscal/contábil e publicação externa continuam sujeitas a revisão humana

**Especificação vinculante:** `docs/superpowers/specs/2026-09-22-incremento-7-encerramento-retencao-design.md`

Este inventário é a lista de permissão da saga de encerramento. Tabela ausente,
chave de seleção ambígua ou dependência não reconciliada impede o estado
`COMPLETED`. Nenhuma regra autoriza selecionar por e-mail, nome, texto de
consulta ou outro conteúdo livre.

## Regras de execução

- `DELETE_PRIVATE`: revogar quando aplicável e excluir do armazenamento ativo
  em até sete dias; credenciais são bloqueadas imediatamente.
- `MINIMIZE_FINANCIAL`: conservar apenas prova comercial/fiscal mínima sob
  pseudônimo pelo prazo interno provisório de cinco anos, sujeito a revisão
  fiscal/contábil por categoria e termo inicial.
- `DELETE_OPERATIONAL`: excluir identidade operacional após o expurgo das
  dependências, em até sete dias.
- `MINIMIZE_OPERATIONAL`: conservar apenas logs de acesso abrangidos pelo art.
  15 do Marco Civil por seis meses; auditoria interna sem esse enquadramento
  não herda automaticamente o prazo.
- `CONTROL_PLANE`: conservar recibo técnico pseudônimo e tombstone, sem
  conteúdo jurídico, pelo prazo interno provisório de cinco anos; exceções
  ativas são revistas no máximo a cada 90 dias.
- `OUT_OF_SCOPE_GLOBAL`: não selecionar nem alterar em razão do encerramento de
  uma conta. A verificação residual deve provar que o corpus global permaneceu
  intacto.

## DELETE_PRIVATE

| Tabela | Chave de seleção | Dependência/ordem | Destino e prazo | Campos proibidos após o prazo |
| --- | --- | --- | --- | --- |
| `sessions` | `tenant_id` | após mensagens, aprovações e checkpoints | excluir até D+7 | toda a linha |
| `session_messages` | `session_id` das sessões do tenant | antes de `sessions` | excluir até D+7 | `content`, `metadata`, toda a linha |
| `approvals` | `session_id` das sessões do tenant | antes de `sessions` | excluir até D+7 | token, ação, parâmetros, decisão |
| `checkpoints` | `session_id` das sessões do tenant | antes de `sessions` | excluir até D+7 | `state_snapshot`, toda a linha |
| `matters` | `tenant_id` | pai final do grafo jurídico | excluir até D+7 | título, descrição, cliente, toda a linha |
| `legal_documents` | `tenant_id` | após versões e âncoras | excluir até D+7 | nome, hash, metadados, toda a linha |
| `document_versions` | `document_id` dos documentos do tenant | após âncoras e vínculos | excluir até D+7 | `content`, hash, toda a linha |
| `document_anchors` | `document_version_id` das versões do tenant | antes das versões | excluir até D+7 | `text`, offsets, hash, toda a linha |
| `facts` | `tenant_id` | após vínculos de fonte/prova | excluir até D+7 | `statement`, categoria, toda a linha |
| `fact_source_links` | `tenant_id` | antes de fatos/âncoras | excluir até D+7 | nota e vínculos, toda a linha |
| `evidence_items` | `tenant_id` | após vínculos | excluir até D+7 | título, descrição, toda a linha |
| `evidence_source_links` | `tenant_id` | antes de provas/âncoras | excluir até D+7 | nota e vínculos, toda a linha |
| `evidence_links` | `tenant_id` | antes de fatos/provas | excluir até D+7 | nota e vínculos, toda a linha |
| `timeline_events` | `tenant_id` | antes de matters/âncoras | excluir até D+7 | título, descrição, datas, toda a linha |
| `drafts` | `tenant_id` | após versões, seções e revisões | excluir até D+7 | título, conteúdo derivado, toda a linha |
| `draft_versions` | `tenant_id` | após seções/revisões | excluir até D+7 | fonte, notas, hash, toda a linha |
| `draft_sections` | `tenant_id` | antes de versões | excluir até D+7 | título, conteúdo e IDs vinculados |
| `citation_anchors` | `tenant_id` | antes de seções/versões | excluir até D+7 | citação e alvos, toda a linha |
| `draft_review_findings` | `tenant_id` | antes de versões | excluir até D+7 | mensagem, alvo, toda a linha |
| `draft_approval_requests` | `tenant_id` | após decisões e tokens | excluir até D+7 | ação, decisão, motivo, toda a linha |
| `draft_approval_decisions` | `tenant_id` ou `request_id` | antes da solicitação | excluir até D+7 | decisão, motivo, identidade, toda a linha |
| `draft_approval_tokens` | `tenant_id` ou `request_id` | antes da solicitação | excluir até D+7 | `token_hash`, toda a linha |
| `matter_authorities` | `tenant_id` | após verificações | excluir até D+7 | snapshot, notas e vínculo privado |
| `matter_authority_verifications` | `tenant_id` | antes de authorities | excluir até D+7 | motivo, snapshot, toda a linha |
| `legal_issues` | `tenant_id` | após memos e teses dependentes | excluir até D+7 | pergunta, análise, toda a linha |
| `research_memos` | `tenant_id` | antes de issues/matters | excluir até D+7 | síntese, conteúdo, toda a linha |
| `legal_theses` | `tenant_id` | antes de issues/matters | excluir até D+7 | tese, fundamento e vínculos |
| `workflow_checkpoints` | `tenant_id` | antes de matters | excluir até D+7 | `state_json`, idempotência, toda a linha |
| `research_search_history` | `tenant_id` | independente; antecipar retenção ordinária | excluir até D+7 | `query`, operação e toda a linha |
| `webhook_endpoints` | `tenant_id` | após deliveries/events | excluir até D+7 | URL, segredo cifrado, toda a linha |
| `webhook_events` | `tenant_id` | após deliveries | excluir até D+7 | `payload_json`, tipo, toda a linha |
| `webhook_deliveries` | `tenant_id` | antes de events/endpoints | excluir até D+7 | resposta, erro e toda a linha |
| `api_keys` | `tenant_id` e `subject_id` | revogar na transação inicial | revogação imediata; excluir hash até D+7 | `token_hash`, prefixo, escopos, toda a linha |

## MINIMIZE_FINANCIAL

| Tabela | Chave de seleção | Dependência/ordem | Destino e prazo provisório | Campos que não podem sobreviver |
| --- | --- | --- | --- | --- |
| `ledger_accounts` | `tenant_id` | pai de entries/lots/operations | pseudonimizar tenant; 5 anos | tenant original e qualquer texto jurídico |
| `usage_events` | `tenant_id` | antes da desvinculação de usuário/sessão | pseudonimizar tenant; 5 anos | `user_id`, `session_id`, `model`, prompt, consulta ou resultado |
| `ledger_entries` | `account_id` do tenant | após minimizar uso | conservar valores e espécie; 5 anos | `operation_result_snapshot` e conteúdo jurídico |
| `billing_accounts` | `tenant_id` | pai comercial | pseudonimizar tenant; 5 anos | customer direto, método padrão e autorrecarga ativa |
| `billing_purchases` | `tenant_id` | pai de pagamentos/invoices/lots/reembolsos | pseudonimizar tenant/usuário; 5 anos | URLs de checkout/recibo e texto livre |
| `billing_payments` | `tenant_id` | por purchase/provider | conservar referência financeira; 5 anos | identificador pessoal ou conteúdo jurídico |
| `billing_webhook_events` | `tenant_id` após migration de ownership | não atribuir silenciosamente eventos legados | conservar envelope mínimo; 5 anos se necessário | `payload`, `error_message`, segredo ou conteúdo jurídico |
| `billing_invoices` | `tenant_id` | por purchase | conservar número, valores e datas; 5 anos | URL com credencial e conteúdo jurídico |
| `billing_refund_requests` | `tenant_id` | por purchase | pseudonimizar solicitante; 5 anos | `reason`, `reviewed_by` e identificadores diretos |
| `billing_credit_lots` | `tenant_id` | por purchase/account | conservar valores e referências; 5 anos | tenant original e conteúdo jurídico |
| `billing_operations` | `tenant_id` | por account/idempotência | conservar prova comercial mínima; 5 anos | `result_snapshot`, lease owner e texto de erro livre |

`billing_webhook_events` ainda não possui `tenant_id` no estado inicial da
7.2. Até a migration prevista na 7.5, esses eventos são **não selecionáveis de
forma segura por conta**; o encerramento deve falhar fechado ou registrar a
lacuna, nunca inferir ownership pelo conteúdo do payload.

## DELETE_OPERATIONAL

| Tabela | Chave de seleção | Dependência/ordem | Destino e prazo | Campos proibidos após o prazo |
| --- | --- | --- | --- | --- |
| `billing_payment_methods` | `tenant_id` | antes de minimizar `billing_accounts` | excluir até D+7 | IDs do provedor, bandeira, final e validade |
| `forgelex_tenant_memberships` | `tenant_id` e `user_id` | após expurgo privado | excluir até D+7 | vínculo, papel e identidade |
| `forgelex_tenants` | `id = tenant_id` | após memberships e conteúdo | excluir até D+7 | nome e identificador original |
| `forgelex_user_profiles` | `id = user_id` / `supabase_user_id` | após memberships e identidade externa | excluir até D+7 | e-mail, nome e subject Supabase |

## MINIMIZE_OPERATIONAL

| Tabela | Chave de seleção | Dependência/ordem | Destino e prazo | Campos que não podem sobreviver |
| --- | --- | --- | --- | --- |
| `audit_logs` | `tenant_id` | antes de remover tenant/perfil | pseudonimizar somente registros de acesso legalmente abrangidos; máximo de 6 meses | tenant, usuário e sessão originais, `cost_metadata` com conteúdo, payload ou resultado jurídico |

## CONTROL_PLANE

| Tabela | Chave de seleção | Dependência/ordem | Destino e prazo provisório | Campos que não podem sobreviver |
| --- | --- | --- | --- | --- |
| `account_closures` | `id`, `subject_hash`, `tenant_hash` | registro raiz/tombstone | pseudonimizar após expurgo; 5 anos | `subject_id`, `user_id`, `tenant_id`, e-mail, confirmação, token em claro e erro livre |
| `account_closure_steps` | `closure_id` | filha da closure | conservar estado, horários e códigos; 5 anos | payload, segredo, conteúdo jurídico e mensagem livre de provedor |
| `retention_exceptions` | `closure_id` e `status` | consultada antes de cada categoria | enquanto ativa, revisão em até 90 dias; ao encerrar, eliminar responsável/referência direta em D+7 e manter só prova mínima se necessária | conteúdo retido, descrição livre, dados além da categoria/fundamento/estado |

## OUT_OF_SCOPE_GLOBAL

| Tabela | Chave de verificação | Dependência | Destino | Proibição |
| --- | --- | --- | --- | --- |
| `jurisprudence_ingestion_runs` | contagem/hash antes e depois | corpus global | não alterar | não selecionar por tenant inexistente |
| `jurisprudence_documents` | IDs e hashes antes e depois | corpus global | não alterar | não tratar como dado da conta |
| `jurisprudence_document_versions` | IDs e hashes antes e depois | documentos globais | não alterar | não excluir versões públicas pela closure |
| `jurisprudence_source_manifests` | IDs e hashes antes e depois | proveniência global | não alterar | não romper cadeia de proveniência |
| `jurisprudence_ingestion_staging` | manifesto/ordinal | ingestão global | não alterar | não incluir no expurgo do tenant |
| `forgelex_migrations` | IDs aplicados | infraestrutura | não alterar | não apagar histórico de schema |

## Critério residual

A saga só pode concluir quando:

1. todas as tabelas `DELETE_PRIVATE` e `DELETE_OPERATIONAL` retornarem zero
   linhas para as chaves originais, salvo categoria coberta por exceção ativa;
2. todas as tabelas minimizadas não contiverem IDs originais, texto jurídico,
   snapshots, URLs sensíveis ou conteúdo livre proibido;
3. as exceções estiverem vigentes, com responsável e `review_at` futuro;
4. as contagens e hashes do grupo global permanecerem inalterados;
5. lacunas de ownership, como webhook financeiro legado sem `tenant_id`,
   permanecerem explícitas e impedirem sucesso aparente.
