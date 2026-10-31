import { parseArgs } from 'node:util';
import { createDatabase } from '../packages/persistence/dist/index.js';
import { CommercialInferenceService } from '../packages/billing-ledger/dist/index.js';

// Operator tool for a commercial call left UNCERTAIN (dispatched, usage unknown), which blocks the whole account.
// Without --apply it only lists/plans. It never calls the provider, never charges a customer and has no client route.
const usage = `Uso:
  node scripts/reconcile-commercial-call.mjs --tenant T                       # lista chamadas não resolvidas (somente leitura)
  node scripts/reconcile-commercial-call.mjs --tenant T --user U --execution E --call C \\
    --evidence REF --resolve not-dispatched|usage [--input N --output N [--cached N]] [--apply]
DATABASE_URL aponta o banco. --evidence referencia a prova externa (ex.: registro de uso do provedor); sem --apply apenas confere o plano.`;
const { values } = parseArgs({
  options: {
    tenant: { type: 'string' },
    user: { type: 'string' },
    execution: { type: 'string' },
    call: { type: 'string' },
    evidence: { type: 'string' },
    resolve: { type: 'string' },
    input: { type: 'string' },
    output: { type: 'string' },
    cached: { type: 'string' },
    apply: { type: 'boolean', default: false },
  },
});
const url = process.env.DATABASE_URL;
if (!url || !values.tenant) {
  console.error(usage);
  process.exit(2);
}
const integer = (name) => {
  const n = Number(values[name]);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`--${name} deve ser inteiro não negativo`);
  return n;
};
const connection = await createDatabase({ url });
try {
  const service = new CommercialInferenceService(connection.db, connection.client);
  const unresolved = await service.listUnresolvedCalls(values.tenant);
  if (!values.resolve) {
    console.log(JSON.stringify({ tenantId: values.tenant, unresolved }, null, 2));
    process.exit(0);
  }
  for (const key of ['user', 'execution', 'call', 'evidence'])
    if (!values[key]) throw new Error(`--${key} é obrigatório com --resolve`);
  const target = unresolved.find(
    (c) => c.userId === values.user && c.executionId === values.execution && c.callId === values.call,
  );
  if (!target) throw new Error('Chamada não encontrada entre as não resolvidas deste tenant');
  if (target.status !== 'UNCERTAIN')
    throw new Error('Somente chamada UNCERTAIN pode ser conciliada; AUTHORIZED pode estar em voo');
  let resolution;
  if (values.resolve === 'not-dispatched') resolution = { kind: 'NOT_DISPATCHED' };
  else if (values.resolve === 'usage')
    resolution = {
      kind: 'USAGE',
      usage: {
        inputTokens: integer('input'),
        outputTokens: integer('output'),
        ...(values.cached === undefined ? {} : { cachedInputTokens: integer('cached') }),
      },
    };
  else throw new Error('--resolve deve ser not-dispatched ou usage');
  const plan = {
    tenantId: values.tenant,
    userId: values.user,
    executionId: values.execution,
    callId: values.call,
    evidence: values.evidence,
    resolution,
  };
  if (!values.apply) {
    console.log(JSON.stringify({ mode: 'DRY_RUN', plan }, null, 2));
    process.exit(0);
  }
  const call = await service.reconcileCall(
    { tenantId: values.tenant, userId: values.user },
    values.execution,
    values.call,
    { evidenceRef: values.evidence, resolution },
  );
  const receipt = await service.getReceipt({ tenantId: values.tenant, userId: values.user }, values.execution);
  console.log(
    JSON.stringify(
      {
        mode: 'APPLIED',
        plan,
        call: { status: call.status, actualMicroUsd: call.actualMicroUsd, reconciliation: call.reconciliation },
        receipt,
        stillUnresolved: await service.listUnresolvedCalls(values.tenant),
      },
      null,
      2,
    ),
  );
} finally {
  connection.client.close();
}
