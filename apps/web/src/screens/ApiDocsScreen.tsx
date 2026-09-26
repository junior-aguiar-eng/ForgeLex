import React, { useState } from 'react';
import { Check, Code2, Copy, FileCode2, Info, Play, Terminal } from 'lucide-react';
import { resolveApiOrigin } from '../api-client';

type Endpoint = 'mcp' | 'jurisprudencias' | 'verify_authority' | 'tribunals' | 'health';
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
const rawSnippets: Record<Endpoint, Record<Language, string> & { example: object }> = {
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
    example: { demonstracao: true, observacao: 'A resposta depende do ambiente e da credencial autenticada.' },
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
    example: { demonstracao: true, results: [], observacao: 'Resultados reais dependem da fonte e da consulta.' },
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
    example: { demonstracao: true, status: 'NOT_FOUND', observacao: 'Substitua o número pelo processo a verificar.' },
  },
  tribunals: {
    curl: `curl ${apiUrl}/api/v2/tribunals -H "Authorization: Bearer ${token}"`,
    node: `const response = await fetch('${apiUrl}/api/v2/tribunals', {
  headers: { 'Authorization': 'Bearer ${token}' },
});
console.log(await response.json());`,
    python: `import httpx
print(httpx.get('${apiUrl}/api/v2/tribunals', headers={'Authorization': 'Bearer ${token}'}).json())`,
    example: { demonstracao: true, tribunals: [], observacao: 'O catálogo é retornado pelo ambiente autenticado.' },
  },
  health: {
    curl: `curl ${apiUrl}/healthz`,
    node: `const response = await fetch('${apiUrl}/healthz');
console.log(await response.json());`,
    python: `import httpx
print(httpx.get('${apiUrl}/healthz').json())`,
    example: { demonstracao: true, status: 'ok', observacao: 'Exemplo de estrutura; não é uma leitura ao vivo.' },
  },
};

export const snippets = Object.fromEntries(
  Object.entries(rawSnippets).map(([endpoint, values]) => [endpoint, {
    ...values,
    curl: values.curl.replaceAll('http://localhost:3001', apiUrl),
    node: values.node.replaceAll('http://localhost:3001', apiUrl),
    python: values.python.replaceAll('http://localhost:3001', apiUrl),
  }]),
) as Record<Endpoint, Record<Language, string> & { example: object }>;

const endpointLabels: Record<Endpoint, string> = { mcp: 'MCP', jurisprudencias: 'Jurisprudência', verify_authority: 'Verificar autoridade', tribunals: 'Tribunais', health: 'Saúde do serviço' };

export const ApiDocsScreen: React.FC = () => {
  const [endpoint, setEndpoint] = useState<Endpoint>('mcp');
  const [language, setLanguage] = useState<Language>('curl');
  const [copied, setCopied] = useState(false);
  const [example, setExample] = useState<object | null>(null);
  const code = snippets[endpoint][language];

  const copy = async (value: string) => { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return <div className="py-8 md:py-12"><div className="page-container space-y-8">
    <div className="border-b border-champagne-border pb-6"><p className="eyebrow">Área técnica</p><h1 className="font-editorial text-3xl font-bold text-stone-900 sm:text-4xl">API para desenvolvedores</h1><p className="mt-1 max-w-3xl text-sm leading-relaxed text-stone-500">Use esta área para integrar um software próprio. Para usar o ForgeLex diretamente no ChatGPT ou Claude, siga o caminho <strong className="font-semibold text-stone-700">Conectar IA</strong>, sem precisar programar.</p></div>
    <div className="surface-subtle flex items-start gap-3 p-4 text-sm text-stone-600"><Info className="mt-0.5 h-5 w-5 shrink-0 text-cognac-700" aria-hidden="true" /><p><strong className="text-stone-800">Demonstração:</strong> nenhum endpoint é chamado por esta tela. Para testar, copie o exemplo, substitua o token e execute no ambiente autorizado.</p></div>
    <section className="surface space-y-4 p-5 sm:p-6"><h2 className="font-editorial text-xl font-bold text-stone-900">Roteiro de integração</h2><ol className="grid gap-3 text-sm leading-relaxed text-stone-600 sm:grid-cols-2">{developerWorkflow.map((step, index) => <li key={step} className="flex gap-3 rounded-xl border border-stone-100 bg-[#FDFBF7] p-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cognac-100 text-xs font-bold text-cognac-800">{index + 1}</span><span>{step}</span></li>)}</ol><p className="text-sm leading-relaxed text-stone-500"><strong className="text-stone-700">Erros:</strong> 401 credencial ausente, inválida ou revogada; 402 crédito indisponível para operação cobrável; 403 escopo insuficiente; 409 conflito; 422 entrada inválida; 429 limite de requisições; 503 dependência indisponível.</p></section>
    <section className="surface space-y-5 p-5 sm:p-6"><div className="flex items-center gap-2"><FileCode2 className="h-5 w-5 text-cognac-700" aria-hidden="true" /><h2 className="font-editorial text-xl font-bold text-stone-900">Recursos documentados</h2></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{(Object.keys(endpointLabels) as Endpoint[]).map((item) => <button key={item} type="button" onClick={() => { setEndpoint(item); setExample(null); }} className={`rounded-xl border px-3 py-3 text-left text-xs font-semibold ${endpoint === item ? 'border-cognac-500 bg-cognac-50 text-cognac-900' : 'border-stone-200 bg-white text-stone-600 hover:border-cognac-300'}`}>{endpointLabels[item]}</button>)}</div></section>
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2"><section className="surface min-w-0 space-y-5 p-5 sm:p-6"><div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-3"><div className="flex items-center gap-2"><Code2 className="h-4 w-4 text-stone-500" aria-hidden="true" /><h2 className="text-sm font-bold text-stone-800">Exemplo em {language === 'curl' ? 'cURL' : language === 'node' ? 'Node.js' : 'Python'}</h2></div><div className="flex gap-1 rounded-lg bg-stone-100 p-1">{(['curl', 'node', 'python'] as Language[]).map((item) => <button key={item} type="button" onClick={() => setLanguage(item)} className={`rounded-md px-2 py-1 text-[11px] font-semibold ${language === item ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-700'}`}>{item === 'curl' ? 'cURL' : item === 'node' ? 'Node.js' : 'Python'}</button>)}</div></div><div className="relative min-w-0"><pre className="max-h-80 overflow-x-auto rounded-xl bg-stone-900 p-4 text-xs leading-relaxed text-stone-100"><code>{code}</code></pre><button type="button" onClick={() => void copy(code)} className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-lg bg-stone-800 px-2.5 py-1 text-[11px] text-stone-300">{copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />} {copied ? 'Copiado' : 'Copiar'}</button></div><button type="button" onClick={() => setExample(snippets[endpoint].example)} className="btn-secondary inline-flex items-center gap-2"><Play className="h-3.5 w-3.5" aria-hidden="true" />Exibir exemplo de resposta</button></section>
      <section className="surface min-w-0 space-y-4 p-5 sm:p-6"><div className="flex items-center gap-2 border-b border-stone-100 pb-3"><Terminal className="h-4 w-4 text-cognac-700" aria-hidden="true" /><h2 className="text-sm font-bold text-stone-800">Resposta de demonstração</h2></div><div className="min-h-64 overflow-x-auto rounded-xl border border-champagne-border bg-[#FDFBF7] p-4 font-mono text-xs text-stone-700">{example ? <pre className="whitespace-pre-wrap leading-relaxed">{JSON.stringify(example, null, 2)}</pre> : <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-center text-stone-600"><Terminal className="h-8 w-8 text-stone-300" aria-hidden="true" /><p>Escolha “Exibir exemplo de resposta”. O conteúdo será identificado como demonstração.</p></div>}</div></section></div>
    <section className="surface-subtle space-y-2 p-5 text-sm text-stone-600"><h2 className="font-editorial text-lg font-bold text-stone-800">Autenticação, cobrança e privacidade</h2><p>As rotas protegidas usam API key ou credencial Bearer e os escopos definidos pelo ambiente. {operationalDisclosure} O MCP não acessa conversas, arquivos ou histórico do host.</p></section>
  </div></div>;
};
