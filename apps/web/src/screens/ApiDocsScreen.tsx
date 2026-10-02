import React, { useState } from 'react';
import { Check, Copy, Play } from 'lucide-react';
import { ApiRequestError, requestApiResponse, resolveApiOrigin } from '../api-client';

type Endpoint = 'mcp' | 'jurisprudencias' | 'verify_authority' | 'get_authority' | 'tribunals' | 'health';
type Language = 'curl' | 'node' | 'python';

const token = '<SEU_TOKEN_DA_API>';
const apiUrl = resolveApiOrigin();
export const operationalDisclosure = 'O host fornece o modelo e o contexto; o ForgeLex cobra apenas a busca jurisprudencial no STJ, conforme o preço exibido na conta, e não cobra tokens de IA.';
export const developerWorkflow = [
  'Criar uma chave',
  'Listar tribunais',
  'Pesquisar jurisprudência',
  'Abrir autoridade',
  'Tratar erros 401, 402, 403, 409, 422, 429 e 503',
] as const;
const rawSnippets: Record<Exclude<Endpoint, 'get_authority'>, Record<Language, string>> = {
  mcp: {
    curl: `curl -X POST http://localhost:3001/mcp \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ${token}" \\\n  -d '{"jsonrpc":"2.0","id":"req-1","method":"tools/list"}'`,
    node: `const response = await fetch('${apiUrl}/mcp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ${token}' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 'req-1', method: 'tools/list' }),
});
console.log(await response.json());`,
    python: `import httpx

response = httpx.post(
    '${apiUrl}/mcp',
    json={'jsonrpc': '2.0', 'id': 'req-1', 'method': 'tools/list'},
    headers={'Authorization': 'Bearer ${token}'}
)
print(response.json())`,
  },
  jurisprudencias: {
    curl: `curl -G http://localhost:3001/api/v2/jurisprudencias \\\n  --data-urlencode "q=juros capitalizados" --data-urlencode "court=STJ" \\\n  -H "Authorization: Bearer ${token}" -H "Idempotency-Key: pesquisa-stj-001"`,
    node: `const params = new URLSearchParams({ q: 'juros capitalizados', court: 'STJ' });
const response = await fetch('${apiUrl}/api/v2/jurisprudencias?' + params, {
  headers: { 'Authorization': 'Bearer ${token}', 'Idempotency-Key': 'pesquisa-stj-001' },
});
console.log(await response.json());`,
    python: `import httpx

response = httpx.get(
    '${apiUrl}/api/v2/jurisprudencias',
    params={'q': 'juros capitalizados', 'court': 'STJ'},
    headers={'Authorization': 'Bearer ${token}', 'Idempotency-Key': 'pesquisa-stj-001'}
)
print(response.json())`,
  },
  verify_authority: {
    curl: `curl -X POST http://localhost:3001/api/v2/research/verify-authority \\\n  -H "Content-Type: application/json" -H "Authorization: Bearer ${token}" -H "Idempotency-Key: verifica-stj-001" \\\n  -d '{"court":"STJ","processNumber":"<NUMERO_DO_PROCESSO>"}'`,
    node: `const response = await fetch('${apiUrl}/api/v2/research/verify-authority', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ${token}', 'Idempotency-Key': 'verifica-stj-001' },
  body: JSON.stringify({ court: 'STJ', processNumber: '<NUMERO_DO_PROCESSO>' }),
});
console.log(await response.json());`,
    python: `import httpx

response = httpx.post(
    '${apiUrl}/api/v2/research/verify-authority',
    json={'court': 'STJ', 'processNumber': '<NUMERO_DO_PROCESSO>'},
    headers={'Authorization': 'Bearer ${token}', 'Idempotency-Key': 'verifica-stj-001'}
)
print(response.json())`,
  },
  tribunals: {
    curl: `curl ${apiUrl}/api/v2/tribunals -H "Authorization: Bearer ${token}"`,
    node: `const response = await fetch('${apiUrl}/api/v2/tribunals', {
  headers: { 'Authorization': 'Bearer ${token}' },
});
console.log(await response.json());`,
    python: `import httpx
print(httpx.get('${apiUrl}/api/v2/tribunals', headers={'Authorization': 'Bearer ${token}'}).json())`,
  },
  health: {
    curl: `curl ${apiUrl}/healthz`,
    node: `const response = await fetch('${apiUrl}/healthz');
console.log(await response.json());`,
    python: `import httpx
print(httpx.get('${apiUrl}/healthz').json())`,
  },
};

export const snippets = Object.fromEntries(
  Object.entries({ ...rawSnippets, get_authority: Object.fromEntries(Object.entries(rawSnippets.verify_authority).map(([language, code]) => [language, code.replaceAll('verify-authority', 'get-authority').replaceAll('verifica-stj-001', 'autoridade-stj-001')])) }).map(([endpoint, values]) => [endpoint, {
    ...values,
    curl: values.curl.replaceAll('http://localhost:3001', apiUrl),
    node: values.node.replaceAll('http://localhost:3001', apiUrl),
    python: values.python.replaceAll('http://localhost:3001', apiUrl),
  }]),
) as Record<Endpoint, Record<Language, string>>;

const endpointLabels: Record<Endpoint, string> = { mcp: 'MCP', jurisprudencias: 'Jurisprudência', verify_authority: 'Verificar autoridade', get_authority: 'Abrir autoridade', tribunals: 'Tribunais', health: 'Saúde do serviço' };

const contracts: Record<Endpoint, { method: string; path: string; scope: string; description: string; fields: string; cost: string }> = {
  mcp: { method: 'POST', path: '/mcp', scope: 'mcp', description: 'Transporte JSON-RPC para descobrir e chamar ferramentas jurídicas.', fields: 'jsonrpc: "2.0" · id: identificador da requisição · method: tools/list. Use tools/call com name e arguments para executar uma ferramenta.', cost: 'Listar ferramentas é gratuito. A cobrança depende da ferramenta chamada.' },
  jurisprudencias: { method: 'GET', path: '/api/v2/jurisprudencias', scope: 'research:read', description: 'Pesquisa jurisprudência do STJ e retorna os documentos encontrados.', fields: 'q: consulta obrigatória · court: STJ · limit: quantidade de resultados. Retorno: query, court, total e results.', cost: 'Pesquisa faturável, conforme a tarifa vigente na conta.' },
  verify_authority: { method: 'POST', path: '/api/v2/research/verify-authority', scope: 'research:read', description: 'Verifica a correspondência de uma referência com a fonte oficial.', fields: 'court: STJ · processNumber: número obrigatório · judgmentDate: data opcional. A ausência de correspondência não prova que o processo inexiste.', cost: 'Gratuito. Exige Idempotency-Key.' },
  get_authority: { method: 'POST', path: '/api/v2/research/get-authority', scope: 'research:read', description: 'Obtém a autoridade e os metadados disponíveis na fonte consultada.', fields: 'court: STJ · processNumber: número obrigatório · judgmentDate: data opcional. Retorno: status, checkedAt e, quando disponível, authority.', cost: 'Gratuito. Exige Idempotency-Key.' },
  tribunals: { method: 'GET', path: '/api/v2/tribunals', scope: 'research:read', description: 'Consulta o catálogo de tribunais e suas capacidades no ambiente atual.', fields: 'Sem corpo. Retorno: tribunals e total. Confira as capacidades antes de pesquisar em um tribunal.', cost: 'Gratuito.' },
  health: { method: 'GET', path: '/healthz', scope: 'Público', description: 'Verifica se o serviço HTTP está respondendo.', fields: 'Sem corpo ou autenticação. A resposta não comprova a disponibilidade de todas as dependências.', cost: 'Gratuito.' },
};

export function freeDocumentationRequest(endpoint: Endpoint): { path: string; init: RequestInit } | null {
  if (endpoint === 'health') return { path: '/healthz', init: {} };
  if (endpoint === 'tribunals') return { path: '/api/v2/tribunals', init: {} };
  if (endpoint === 'mcp') return { path: '/mcp', init: { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 'documentation-tools', method: 'tools/list' }) } };
  return null;
}

export const responseExamples = {
  jurisprudencias: { query: 'juros capitalizados', court: 'STJ', total: 0, results: [] },
  verify_authority: { status: 'NOT_FOUND', checkedAt: '2026-10-02T12:00:00.000Z' },
  get_authority: { status: 'NOT_FOUND', checkedAt: '2026-10-02T12:00:00.000Z' },
} as const;

export const ApiDocsScreen: React.FC = () => {
  const [endpoint, setEndpoint] = useState<Endpoint>('mcp');
  const [language, setLanguage] = useState<Language>('curl');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [live, setLive] = useState<{ endpoint: Endpoint; data: unknown; status?: number; elapsed?: number; error?: string } | null>(null);
  const [running, setRunning] = useState(false);
  const contract = contracts[endpoint];
  const freeRequest = freeDocumentationRequest(endpoint);
  const result = live?.endpoint === endpoint ? live : null;
  async function copy() {
    try { await navigator.clipboard.writeText(snippets[endpoint][language]); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  }
  async function runFreeRequest() {
    if (!freeRequest || running) return;
    const selected = endpoint;
    const start = performance.now();
    setRunning(true);
    try {
      const response = await requestApiResponse<unknown>(freeRequest.path, freeRequest.init, { sessionOnly: true });
      setLive({ endpoint: selected, data: response.data, status: response.status, elapsed: Math.round(performance.now() - start) });
    } catch (error) {
      setLive({ endpoint: selected, data: null, status: error instanceof ApiRequestError ? error.status : undefined, error: error instanceof Error ? error.message : 'Não foi possível acessar o serviço.' });
    } finally { setRunning(false); }
  }
  return <div className="py-8 md:py-12"><div className="page-container space-y-8">
    <header className="border-b border-champagne-border pb-6"><p className="eyebrow">Integrações</p><h1 className="font-editorial text-3xl font-bold text-stone-900 sm:text-4xl">API para desenvolvedores</h1><p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600">Integre pesquisa jurisprudencial e verificação de fontes ao seu software. Envie a credencial no header Authorization e confira os requisitos de cada operação.</p><div className="mt-5 flex flex-wrap gap-3"><a href="/conta/chaves" className="btn-primary">Gerenciar chaves de API</a><a href="/conectar" className="btn-secondary">Conectar ao ChatGPT ou Claude</a><a href={`${apiUrl}/openapi.json`} target="_blank" rel="noreferrer" className="btn-secondary">Consultar OpenAPI</a></div></header>
    <section className="surface overflow-hidden" aria-label="Referência de endpoints"><nav aria-label="Endpoints da API" className="flex flex-wrap gap-1 border-b border-stone-200 p-3">{(Object.keys(endpointLabels) as Endpoint[]).map((item) => <button key={item} type="button" aria-pressed={endpoint === item} onClick={() => { setEndpoint(item); setCopied(false); setCopyError(false); }} className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold ${endpoint === item ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`}>{endpointLabels[item]}</button>)}</nav>
      <div className="space-y-6 p-5 sm:p-8"><header><div className="flex flex-wrap items-center gap-3"><span className="rounded border border-cognac-200 bg-cognac-50 px-2 py-1 font-mono text-xs font-bold text-cognac-900">{contract.method}</span><h2 className="break-all font-mono text-lg font-semibold text-stone-900">{contract.path}</h2></div><p className="mt-3 text-sm leading-6 text-stone-600">{contract.description}</p><dl className="mt-4 grid gap-4 border-y border-stone-200 py-4 text-sm sm:grid-cols-2"><div><dt className="font-semibold text-stone-800">Autenticação e escopo</dt><dd className="mt-1 text-stone-600">{contract.scope === 'Público' ? 'Acesso público' : `Bearer token · ${contract.scope}`}</dd></div><div><dt className="font-semibold text-stone-800">Cobrança</dt><dd className="mt-1 text-stone-600">{contract.cost}</dd></div></dl></header>
      <section aria-labelledby="request-fields"><h3 id="request-fields" className="font-semibold text-stone-900">Contrato da operação</h3><p className="mt-2 text-sm leading-7 text-stone-600">{contract.fields}</p>{endpoint === 'jurisprudencias' && <p className="mt-2 text-sm text-stone-600">Envie uma Idempotency-Key única para cada intenção de pesquisa. Reutilize a mesma chave ao repetir a mesma requisição; uma nova pesquisa exige outra chave.</p>}</section>
      <section aria-labelledby="code-heading"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 id="code-heading" className="font-semibold text-stone-900">Requisição</h3><div className="flex flex-wrap gap-1">{(['curl', 'node', 'python'] as Language[]).map((item) => <button key={item} aria-pressed={language === item} onClick={() => { setLanguage(item); setCopied(false); setCopyError(false); }} className={`min-h-11 rounded-lg px-3 text-sm ${language === item ? 'bg-stone-100 font-semibold text-stone-900' : 'text-stone-600'}`}>{item === 'curl' ? 'cURL' : item === 'node' ? 'Node.js' : 'Python'}</button>)}<button onClick={() => void copy()} className="btn-secondary min-h-11 gap-2">{copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}{copied ? 'Copiado' : 'Copiar código'}</button></div></div><pre className="min-w-0 rounded-xl bg-stone-900 p-5 text-xs leading-7 text-stone-100 whitespace-pre-wrap break-all"><code>{snippets[endpoint][language]}</code></pre>{copyError && <p role="alert" className="mt-2 text-sm text-red-800">Não foi possível copiar. Selecione o código e copie manualmente.</p>}</section>
      <section className="border-t border-stone-200 pt-6" aria-labelledby="response-heading"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 id="response-heading" className="font-semibold text-stone-900">{result ? 'Resposta do ambiente atual' : 'Validar a integração'}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{freeRequest ? 'Execute uma chamada gratuita com sua sessão ForgeLex. A resposta exibida será a resposta real do serviço.' : 'Execute o exemplo em seu ambiente autorizado. As requisições jurídicas não são executadas por esta tela.'}</p></div>{freeRequest && <button className="btn-secondary min-h-11 gap-2" disabled={running} onClick={() => void runFreeRequest()}><Play className="h-4 w-4" aria-hidden="true" />{running ? 'Consultando…' : 'Executar chamada gratuita'}</button>}</div>{result && <div className="mt-4"><p role="status" className="mb-3 text-xs text-stone-600">{result.status ? `HTTP ${result.status}` : 'Falha de comunicação'}{result.elapsed !== undefined ? ` · ${result.elapsed} ms` : ''}</p>{result.error ? <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-900">{result.error}</p> : <pre className="max-h-96 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-5 font-mono text-xs leading-6 whitespace-pre-wrap break-all">{JSON.stringify(result.data, null, 2)}</pre>}</div>}{(endpoint === 'jurisprudencias' || endpoint === 'verify_authority' || endpoint === 'get_authority') && <div className="mt-5 space-y-3"><h4 className="text-sm font-semibold text-stone-900">Exemplo de resposta · dados ilustrativos</h4><pre className="rounded-xl border border-stone-200 bg-stone-50 p-5 font-mono text-xs leading-6 whitespace-pre-wrap break-all">{JSON.stringify(responseExamples[endpoint], null, 2)}</pre><p className="text-sm leading-7 text-stone-600">{endpoint === 'jurisprudencias' ? 'results contém documentos com id, court, processNumber, rapporteur, judgmentDate, publicationDate, syllabus, dedupeKey e provenance. chamber e fullTextUrl são opcionais.' : 'status pode ser VERIFIED_OFFICIAL, VERIFIED_PROVIDER, UNVERIFIED, CONFLICTING_METADATA ou NOT_FOUND. providerId, authority e reason são opcionais. NOT_FOUND informa ausência de correspondência na consulta, sem provar a inexistência do processo. authority segue a estrutura de documento descrita abaixo.'}</p><details className="rounded-lg border border-stone-200 p-4"><summary className="cursor-pointer text-sm font-semibold text-stone-800">Documento e proveniência</summary><p className="mt-3 text-sm leading-7 text-stone-600">O documento contém id (UUID), court, processNumber, rapporteur, judgmentDate, publicationDate, syllabus, dedupeKey e provenance; chamber e fullTextUrl são opcionais. provenance contém id, source, verified, verificationMethod, verifiedAt, snippet e confidence (0 a 1). source contém provider e documentId; court, collection, dedupeKey, sourceUrl, pageNumber, paragraphNumber, contentHash e capturedAt são opcionais. verificationMethod pode ser OFFICIAL_SOURCE_HASH, CROSS_CHECK, MANUAL_VALIDATION ou SYNTHETIC_CANONICAL. Consulte o OpenAPI para os tipos e restrições de cada campo.</p></details></div>}</section></div>
    </section>
    <section className="grid gap-6 lg:grid-cols-2"><div><h2 className="font-editorial text-xl font-bold text-stone-900">Abrir uma autoridade</h2><p className="mt-3 text-sm leading-7 text-stone-600">Envie POST para <code>/api/v2/research/get-authority</code>, com court, processNumber e judgmentDate opcional. Use Bearer com research:read e Idempotency-Key. A operação é gratuita e devolve os dados disponíveis na fonte oficial.</p></div><div><h2 className="font-editorial text-xl font-bold text-stone-900">Tratar respostas de erro</h2><p className="mt-3 text-sm leading-7 text-stone-600">400 entrada obrigatória ausente; 401 credencial ausente, expirada ou revogada; 402 crédito indisponível; 403 escopo insuficiente; 409 conflito de idempotência; 422 tribunal ou entrada não suportados; 429 limite de requisições; 503 dependência indisponível. Confira error e message antes de repetir a chamada.</p></div></section>
    <footer className="border-t border-stone-200 pt-5 text-sm leading-7 text-stone-600"><h2 className="font-semibold text-stone-800">Autenticação, cobrança e privacidade</h2><p className="mt-2">{operationalDisclosure} O MCP recebe os argumentos enviados à ferramenta; não acessa conversas, arquivos ou histórico do host.</p></footer>
  </div></div>;
};
