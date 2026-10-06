import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../apps/api/dist/app.js';
import { DurableMatterPurgeJournal } from '../apps/api/dist/matters/matter-purge-journal.js';
import { OAuthTokenVault } from '../apps/api/dist/auth/oauth-token-vault.js';
import { BillingOperationsService } from '../apps/api/dist/billing/billing-operations.js';
import { BillingService, LedgerService } from '../packages/billing-ledger/dist/index.js';
import { JurisprudenceIngestionService } from '../packages/legal-data/dist/index.js';
import {
  AccountRepository, createDatabase, IngestionRunRepository, JurisprudenceRepository,
  MatterRepository, runPersistenceMigrations,
} from '../packages/persistence/dist/index.js';
import { CanonicalFixtureProvider, SourceRouter } from '../packages/source-providers/dist/index.js';

const databaseUrl = process.env.FORGELEX_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgres://forgelex:forgelex@127.0.0.1:55432/forgelex';
const authUrl = process.env.FORGELEX_E2E_AUTH_URL ?? 'http://127.0.0.1:54321';
const webOrigin = process.env.FORGELEX_E2E_WEB_ORIGIN ?? 'http://127.0.0.1:3000';
const apiPort = Number(process.env.FORGELEX_E2E_API_PORT ?? 3001);
const authPort = Number(new URL(authUrl).port);
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(authUrl) || !Number.isSafeInteger(authPort) || authPort < 1024) {
  throw new Error('E2E_AUTH_URL_MUST_BE_LOCAL');
}
const token = 'phase7-e2e-access-token';
const executionId = randomUUID();
const identity = {
  id: `phase7-e2e-user-${executionId}`, email: `fase7-${executionId}@forgelex.test`,
  email_confirmed_at: '2026-09-20T12:00:00.000Z',
  confirmed_at: '2026-09-20T12:00:00.000Z',
  user_metadata: { full_name: 'Operação Fase 7' },
  app_metadata: { provider: 'email', providers: ['email'] }, identities: [],
  created_at: '2026-09-20T12:00:00.000Z', updated_at: '2026-09-20T12:00:00.000Z',
  last_sign_in_at: '2026-09-20T12:00:00.000Z', is_anonymous: false,
  aud: 'authenticated', role: 'authenticated',
};
const session = { access_token: token, refresh_token: 'phase7-e2e-refresh-token', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: identity };
const caseAi = process.env.FORGELEX_E2E_CASE_AI === 'true';
const oauthKey=Buffer.alloc(32,7).toString('base64');
const oauthVault=new OAuthTokenVault(oauthKey,`${webOrigin}/mcp`);
const oauthGrants=caseAi?['app-one','app-two'].map(id=>({client:{id,name:id==='app-one'?'Minha conexão de teste':'Outra conexão'},scopes:['openid','email'],granted_at:'2026-10-05T10:00:00.000Z'})):[];
const nativeTokens=new Map(oauthGrants.map(g=>{const jwt=`${Buffer.from('{"alg":"fixture"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:identity.id,client_id:g.client.id,session_id:executionId,iss:authUrl+'/auth/v1',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.fixture`;return [g.client.id,jwt];}));

function send(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json', 'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
  });
  response.end(JSON.stringify(body));
}

const authServer = http.createServer((request, response) => {
  if (request.method === 'OPTIONS') return send(response, 204, {});
  const url = new URL(request.url ?? '/', authUrl);
  if (request.method === 'POST' && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') return send(response, 200, session);
  if (request.method === 'GET' && url.pathname === '/auth/v1/user' && [token,...nativeTokens.values()].some(t=>request.headers.authorization===`Bearer ${t}`)) return send(response, 200, identity);
  if (request.method === 'GET' && url.pathname === '/auth/v1/user/oauth/grants' && [token,...nativeTokens.values()].some(t=>request.headers.authorization===`Bearer ${t}`)) return send(response, 200, oauthGrants);
  if (request.method === 'POST' && url.pathname === '/auth/v1/logout') return send(response, 204, {});
  return send(response, 404, { error: 'not_found' });
});
await new Promise((resolve, reject) => authServer.listen(authPort, '127.0.0.1', resolve).once('error', reject));

const connection = await createDatabase({ url: databaseUrl });
await runPersistenceMigrations(connection.client);
const ledger = new LedgerService(connection.db, connection.client);
await ledger.runMigrations();
const account = await new AccountRepository(connection.db).bootstrap({
  supabaseUserId: identity.id, email: identity.email, displayName: identity.user_metadata.full_name,
});
await ledger.provisionAccount(account.tenant.id, { paidBalanceCents: 500, promotionalBalanceCents: 0 });
await connection.client.execute({ sql: 'DELETE FROM research_memos WHERE tenant_id = ?', args: [account.tenant.id] });

class StjFixtureProvider extends CanonicalFixtureProvider {
  supportsCourt(court) { return court.toUpperCase() === 'STJ'; }
  async search(query, options = {}) { return super.search(query, { ...options, court: 'STJ' }); }
}
const fixture = new StjFixtureProvider();
const sourceRouter = new SourceRouter();
sourceRouter.registerProvider(fixture);
const documents = await fixture.search('vazamento', { court: 'STJ', limit: 10 });
await new JurisprudenceIngestionService(
  new JurisprudenceRepository(connection.db), new IngestionRunRepository(connection.db),
).ingest({ providerId: fixture.id, court: 'STJ', documents });

const matter = await new MatterRepository(connection.db).createMatter({
  tenantId: account.tenant.id, createdBy: account.user.id, title: 'Caso E2E Fase 7',
});
let caseFixture;
if(caseAi){
 const repo=new MatterRepository(connection.db);
 const other=await repo.createMatter({tenantId:account.tenant.id,createdBy:account.user.id,title:'Outro caso E2E'});
 const document=await repo.ingestTextDocument({tenantId:account.tenant.id,createdBy:account.user.id,matterId:matter.id,title:'Contrato selecionável '+('texto longo '.repeat(15)),originalFilename:'autorizado.txt',mimeType:'text/plain',content:'Conteúdo reservado selecionado. 😀 '.repeat(300)});
 const hidden=await repo.ingestTextDocument({tenantId:account.tenant.id,createdBy:account.user.id,matterId:matter.id,title:'Documento excluído',originalFilename:'excluido.txt',mimeType:'text/plain',content:'SEGREDO EXCLUÍDO'});
 caseFixture={otherMatterId:other.id,documentId:document.document.id,hiddenDocumentId:hidden.document.id,oauthTokens:Object.fromEntries([...nativeTokens].map(([id,jwt])=>[id,oauthVault.seal(jwt,'access',Date.now()+3600000)]))};
}
const memoId = randomUUID();
const now = new Date().toISOString();
await connection.client.execute({
  sql: `INSERT INTO research_memos (id, tenant_id, matter_id, query, issue_ids, workflow_id, workflow_version, memo_json, status, idempotency_key, created_by, created_at, updated_at)
        VALUES (?, ?, ?, 'prescrição', '[]', 'legal-research-memo', '1.0.0', ?, 'PENDING_HUMAN_REVIEW', ?, ?, ?, ?)`,
  args: [memoId, account.tenant.id, matter.id, JSON.stringify({ id: memoId, title: 'Memo prescricional', query: 'prescrição', executiveSummary: 'Resumo executivo suficientemente longo para validação.', keyTheses: [], applicableAuthorities: [], riskAnalysis: 'Risco processual controlado.', recommendedAction: 'Revisar o prazo prescricional.', generatedAt: now, verifiedByHuman: false }), `e2e_${memoId}`, account.user.id, now, now],
});

class FakePaymentProvider {
  providerName = 'fixture';
  supportsAutoRecharge = false;
  async createCustomer({ tenantId }) { return { id: `customer_${tenantId}` }; }
  async createCheckout({ purchaseId }) { return { id: `checkout_${purchaseId}`, url: `${webOrigin}/?billing_purchase=${purchaseId}&status=pending` }; }
  async createPaymentMethodSetup() { return { id: 'setup_fixture', clientSecret: 'fixture' }; }
  async listPaymentMethods() { return []; }
  async createOffSessionPayment() { return { id: 'payment_fixture' }; }
  async refundPayment() { return { id: 'refund_fixture' }; }
}
const paymentProvider = new FakePaymentProvider();
const billingOperations = new BillingOperationsService(
  connection.db, connection.client, new BillingService(connection.db, connection.client), paymentProvider, webOrigin,
);
let matterPurgeJournal;
if (process.env.FORGELEX_E2E_MATTER_LIFECYCLE === 'true') {
  const objects = new Map();
  matterPurgeJournal = new DurableMatterPurgeJournal({ read: async key => objects.get(key), list: async () => [...objects.keys()], writeOnce: async (key, value) => { if (objects.has(key)) return false; objects.set(key, value); return true; } }, { key: Buffer.alloc(32, 11), macSecret: 'synthetic-only-journal-secret-32-bytes', anchorId: 'synthetic-lifecycle-anchor' });
  await matterPurgeJournal.provisionAnchor();
}
const app = await buildApp({
  matterPurgeJournal,
  database: connection.db, databaseClient: connection.client, ledgerService: ledger,
  sourceRouter, billingOperationsService: billingOperations, paymentProvider,
  environment: {
    NODE_ENV: 'test', FORGELEX_SUPABASE_URL: authUrl,
    ...(matterPurgeJournal ? { FORGELEX_MATTER_PURGE_KEY_SECRET: 'synthetic-only-operation-secret-32-bytes' } : {}),
    FORGELEX_SUPABASE_PUBLISHABLE_KEY: 'phase7-e2e-publishable', FORGELEX_ALLOWED_ORIGINS: webOrigin,
    FORGELEX_WEBHOOK_MASTER_KEY: 'phase7-e2e-master-key',
    ...(caseAi?{FORGELEX_MCP_OAUTH_ENABLED:'true',FORGELEX_PUBLIC_URL:webOrigin,FORGELEX_SUPABASE_SECRET_KEY:'fixture-secret-local-only',FORGELEX_MCP_OAUTH_ENCRYPTION_KEY:oauthKey}:{}),
  },
});
app.post('/e2e/confirm-purchase/:purchaseId', async (request, reply) => {
  const purchaseId = request.params.purchaseId;
  const purchase = await billingOperations.getPurchase(purchaseId, account.tenant.id);
  if (!purchase) return reply.status(404).send({ error: 'NOT_FOUND' });
  await billingOperations.processWebhook({
    id: `event_${purchaseId}`, type: 'payment.succeeded', provider: 'fixture',
    data: { object: { id: `payment_${purchaseId}`, provider_payment_id: `payment_${purchaseId}`, receipt_url: 'https://example.test/receipt', metadata: { purchase_id: purchaseId } } },
  });
  return { confirmed: true };
});
app.get('/e2e/state', async () => ({ tenantId: account.tenant.id, matterId: matter.id, memoId,...caseFixture }));
await app.listen({ host: '127.0.0.1', port: apiPort });

async function shutdown() {
  await app.close().catch(() => undefined);
  await new Promise((resolve) => authServer.close(resolve));
  connection.client.close();
}
process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)));
process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)));
