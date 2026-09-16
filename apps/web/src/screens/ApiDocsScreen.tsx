import React, { useState } from 'react';
import { 
  Terminal, Copy, Check, Play, 
  Code2, Layers, Key
} from 'lucide-react';

export const ApiDocsScreen: React.FC = () => {
  const [selectedEndpoint, setSelectedEndpoint] = useState<'mcp' | 'jurisprudencias' | 'verify_authority' | 'tribunals' | 'health'>('mcp');
  const [selectedLang, setSelectedLang] = useState<'curl' | 'node' | 'python'>('curl');
  
  const [apiKey, setApiKey] = useState('flx_live_9a87f2e410b3849cd5e8103721');
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [responseOutput, setResponseOutput] = useState<any>(null);
  const [responseMeta, setResponseMeta] = useState<{ status: number; timeMs: number } | null>(null);

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopySnippet = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const handleGenerateKey = () => {
    const newKey = `flx_live_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    setApiKey(newKey);
  };

  // Mock code snippets for each endpoint and language
  const snippets = {
    mcp: {
      curl: `curl -X POST https://api.forgelex.ai/mcp \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
    "jsonrpc": "2.0",
    "id": "req-1",
    "method": "tools/call",
    "params": {
      "name": "research.search_case_law",
      "arguments": {
        "query": "Tema 996 STJ atraso imóvel",
        "court": "STJ"
      }
    }
  }'`,
      node: `import fetch from 'node-fetch';

const response = await fetch('https://api.forgelex.ai/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ${apiKey}',
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 'req-1',
    method: 'tools/call',
    params: {
      name: 'research.search_case_law',
      arguments: {
        query: 'Tema 996 STJ atraso imóvel',
        court: 'STJ',
      },
    },
  }),
});

const data = await response.json();
console.log(data);`,
      python: `import httpx

payload = {
    "jsonrpc": "2.0",
    "id": "req-1",
    "method": "tools/call",
    "params": {
        "name": "research.search_case_law",
        "arguments": {
            "query": "Tema 996 STJ atraso imóvel",
            "court": "STJ"
        }
    }
}

headers = {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json"
}

response = httpx.post("https://api.forgelex.ai/mcp", json=payload, headers=headers)
print(response.json())`,
      sampleResponse: {
        jsonrpc: "2.0",
        id: "req-1",
        result: {
          content: [
            {
              type: "text",
              text: "Jurisprudência identificada com proveniência:\n1. STJ - REsp 1.823.450/SP (Min. Marco Aurélio Bellizze) [Precedente Vinculante]\n   DedupeKey: stj_resp1823450sp_20230418\n   Hash SHA-256: 7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069"
            }
          ],
          isError: false,
          _billing: {
            charged: true,
            costCents: 15,
            currency: "BRL"
          }
        }
      }
    },
    jurisprudencias: {
      curl: `curl -X GET "https://api.forgelex.ai/api/v2/jurisprudencias?q=juros+capitalizados&court=STJ" \\
  -H "Authorization: Bearer ${apiKey}"`,
      node: `import fetch from 'node-fetch';

const response = await fetch(
  'https://api.forgelex.ai/api/v2/jurisprudencias?q=juros+capitalizados&court=STJ',
  {
    headers: { 'Authorization': 'Bearer ${apiKey}' }
  }
);
const data = await response.json();
console.log(data);`,
      python: `import httpx

response = httpx.get(
    "https://api.forgelex.ai/api/v2/jurisprudencias",
    params={"q": "juros capitalizados", "court": "STJ"},
    headers={"Authorization": "Bearer ${apiKey}"}
)
print(response.json())`,
      sampleResponse: {
        success: true,
        count: 1,
        results: [
          {
            court: "STJ",
            processNumber: "REsp 1.823.450/SP",
            relator: "Min. Marco Aurélio Bellizze",
            judgmentDate: "18/04/2023",
            dedupeKey: "stj_resp1823450sp_20230418",
            isBinding: true,
            sourceLocator: {
              url: "https://processo.stj.jus.br/processo/julgados/resp1823450",
              verified: true
            }
          }
        ]
      }
    },
    verify_authority: {
      curl: `curl -X POST "https://api.forgelex.ai/api/v2/research/verify-authority" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Idempotency-Key: verify-req-1" \\
  -d '{"court":"STJ","processNumber":"REsp 1.823.450/SP","judgmentDate":"2023-04-18"}'`,
      node: `const response = await fetch('https://api.forgelex.ai/api/v2/research/verify-authority', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ${apiKey}',
    'Idempotency-Key': 'verify-req-1',
  },
  body: JSON.stringify({
    court: 'STJ',
    processNumber: 'REsp 1.823.450/SP',
    judgmentDate: '2023-04-18',
  }),
});
console.log(await response.json());`,
      python: `import httpx

response = httpx.post(
    "https://api.forgelex.ai/api/v2/research/verify-authority",
    json={"court": "STJ", "processNumber": "REsp 1.823.450/SP", "judgmentDate": "2023-04-18"},
    headers={"Authorization": "Bearer ${apiKey}", "Idempotency-Key": "verify-req-1"}
)
print(response.json())`,
      sampleResponse: {
        status: "VERIFIED_OFFICIAL",
        providerId: "provider_stj_scon",
        checkedAt: "2026-09-16T12:00:00.000Z",
        authority: { court: "STJ", processNumber: "REsp 1.823.450/SP" }
      }
    },
    tribunals: {
      curl: `curl -X GET https://api.forgelex.ai/api/v2/tribunals \\
  -H "Authorization: Bearer ${apiKey}"`,
      node: `import fetch from 'node-fetch';

const response = await fetch('https://api.forgelex.ai/api/v2/tribunals', {
  headers: { 'Authorization': 'Bearer ${apiKey}' }
});
const data = await response.json();
console.log(data);`,
      python: `import httpx

response = httpx.get(
    "https://api.forgelex.ai/api/v2/tribunals",
    headers={"Authorization": "Bearer ${apiKey}"}
)
print(response.json())`,
      sampleResponse: {
        success: true,
        tribunals: [
          { code: "STF", name: "Supremo Tribunal Federal", type: "SUPERIOR", hasBindingPrecedents: true },
          { code: "STJ", name: "Superior Tribunal de Justiça", type: "SUPERIOR", hasBindingPrecedents: true },
          { code: "TST", name: "Tribunal Superior do Trabalho", type: "SUPERIOR", hasBindingPrecedents: true },
          { code: "TJSP", name: "Tribunal de Justiça de São Paulo", type: "STATE", hasBindingPrecedents: false },
          { code: "TRF3", name: "Tribunal Regional Federal da 3ª Região", type: "FEDERAL", hasBindingPrecedents: false }
        ]
      }
    },
    health: {
      curl: `curl -X GET https://api.forgelex.ai/health`,
      node: `const res = await fetch('https://api.forgelex.ai/health');
console.log(await res.json());`,
      python: `import httpx
print(httpx.get("https://api.forgelex.ai/health").json())`,
      sampleResponse: {
        status: "ok",
        service: "forgelex-api",
        version: "2.0.0",
        uptimeSeconds: 84320,
        timestamp: "2026-09-16T03:30:00.000Z"
      }
    }
  };

  const handleExecuteRequest = async () => {
    setIsLoading(true);
    setResponseOutput(null);
    setResponseMeta(null);

    const start = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 450));
    const duration = Math.round(performance.now() - start);

    setResponseMeta({ status: 200, timeMs: duration });
    setResponseOutput(snippets[selectedEndpoint].sampleResponse);
    setIsLoading(false);
  };

  return (
    <div className="py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-champagne-border pb-6">
          <div>
            <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-stone-900">
              Documentação da API & Playground
            </h1>
            <p className="text-sm text-stone-500 mt-1">
              Referência técnica para integração agêntica via MCP (JSON-RPC 2.0) e REST APIs.
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs font-semibold text-stone-700 bg-stone-100 px-3 py-1.5 rounded-full border border-stone-200">
            <Layers className="w-3.5 h-3.5 text-stone-500" />
            <span>OpenAPI 3.1 & Model Context Protocol v2024-11-05</span>
          </div>
        </div>

        {/* API KEY MANAGEMENT (Inspirado em ForgeLex_05_API_Documentacao.png) */}
        <div className="champagne-card p-6 rounded-2xl bg-white shadow-card space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <Key className="w-5 h-5 text-cognac-700" />
                <h3 className="font-editorial text-lg font-bold text-stone-900">
                  Sua Chave de API de Produção
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase">
                  Ativa • Permissão Total (L0-L4)
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Utilize esta chave no header <code>Authorization: Bearer</code> para autenticar chamadas REST e MCP.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <div className="px-4 py-2 rounded-xl bg-stone-50 border border-stone-200 font-mono text-xs text-stone-800 select-all shadow-inner">
                {apiKey}
              </div>
              <button
                onClick={handleCopyKey}
                className="px-3.5 py-2 rounded-xl bg-cognac-50 border border-cognac-200 hover:bg-cognac-100 text-cognac-800 text-xs font-semibold flex items-center space-x-1.5"
              >
                {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey ? 'Copiada' : 'Copiar'}</span>
              </button>
              <button
                onClick={handleGenerateKey}
                className="px-3.5 py-2 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-semibold"
              >
                Gerar Nova
              </button>
            </div>
          </div>
        </div>

        {/* INTERACTIVE PLAYGROUND (Inspirado em ForgeLex_05_API_Documentacao.png) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* ENDPOINT SELECTOR & CODE SNIPPET (7 COLS) */}
          <div className="lg:col-span-7 champagne-card p-6 sm:p-8 rounded-2xl bg-white shadow-card space-y-6">
            
            {/* Endpoint Tabs */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Selecione o Endpoint
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  onClick={() => { setSelectedEndpoint('mcp'); setResponseOutput(null); }}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center space-x-1.5 transition-colors ${
                    selectedEndpoint === 'mcp'
                      ? 'border-cognac-600 bg-cognac-50 text-cognac-900 shadow-sm'
                      : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  <span className="font-bold text-amber-700">POST</span>
                  <span>/mcp</span>
                </button>

                <button
                  onClick={() => { setSelectedEndpoint('verify_authority'); setResponseOutput(null); }}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center space-x-1.5 transition-colors ${
                    selectedEndpoint === 'verify_authority'
                      ? 'border-cognac-600 bg-cognac-50 text-cognac-900 shadow-sm'
                      : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  <span className="font-bold text-amber-700">POST</span>
                  <span>/verify</span>
                </button>

                <button
                  onClick={() => { setSelectedEndpoint('jurisprudencias'); setResponseOutput(null); }}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center space-x-1.5 transition-colors ${
                    selectedEndpoint === 'jurisprudencias'
                      ? 'border-cognac-600 bg-cognac-50 text-cognac-900 shadow-sm'
                      : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  <span className="font-bold text-emerald-700">GET</span>
                  <span>/juris</span>
                </button>

                <button
                  onClick={() => { setSelectedEndpoint('tribunals'); setResponseOutput(null); }}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center space-x-1.5 transition-colors ${
                    selectedEndpoint === 'tribunals'
                      ? 'border-cognac-600 bg-cognac-50 text-cognac-900 shadow-sm'
                      : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  <span className="font-bold text-emerald-700">GET</span>
                  <span>/tribunals</span>
                </button>

                <button
                  onClick={() => { setSelectedEndpoint('health'); setResponseOutput(null); }}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center space-x-1.5 transition-colors ${
                    selectedEndpoint === 'health'
                      ? 'border-cognac-600 bg-cognac-50 text-cognac-900 shadow-sm'
                      : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  <span className="font-bold text-emerald-700">GET</span>
                  <span>/health</span>
                </button>
              </div>
            </div>

            {/* Language Selector */}
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2">
                <Code2 className="w-4 h-4 text-stone-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Exemplo de Código
                </span>
              </div>
              <div className="flex items-center space-x-1 bg-stone-100 p-1 rounded-lg">
                <button
                  onClick={() => setSelectedLang('curl')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold ${
                    selectedLang === 'curl' ? 'bg-white shadow text-stone-900' : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  cURL
                </button>
                <button
                  onClick={() => setSelectedLang('node')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold ${
                    selectedLang === 'node' ? 'bg-white shadow text-stone-900' : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  Node.js
                </button>
                <button
                  onClick={() => setSelectedLang('python')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold ${
                    selectedLang === 'python' ? 'bg-white shadow text-stone-900' : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  Python
                </button>
              </div>
            </div>

            {/* Code Snippet Box */}
            <div className="relative">
              <pre className="p-4 rounded-xl bg-stone-900 text-stone-100 font-mono text-xs overflow-x-auto leading-relaxed max-h-72">
                <code>{snippets[selectedEndpoint][selectedLang]}</code>
              </pre>
              <button
                onClick={() => handleCopySnippet(snippets[selectedEndpoint][selectedLang])}
                className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 text-[11px] font-medium flex items-center space-x-1 shadow"
              >
                {copiedSnippet ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSnippet ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>

            {/* Send Request Trigger */}
            <div className="flex justify-end pt-2">
              <button
                onClick={handleExecuteRequest}
                disabled={isLoading}
                className="px-6 py-2.5 rounded-xl bg-cognac-700 hover:bg-cognac-800 disabled:bg-stone-300 text-white font-semibold text-xs shadow-md shadow-cognac-900/10 flex items-center space-x-2"
              >
                {isLoading ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>Executar Chamada no Playground</span>
              </button>
            </div>

          </div>

          {/* RESPONSE VIEWER (5 COLS) */}
          <div className="lg:col-span-5 champagne-card p-6 sm:p-8 rounded-2xl bg-white shadow-card space-y-4 flex flex-col">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-cognac-700" />
                <h3 className="font-editorial text-lg font-bold text-stone-900">
                  Resposta do Servidor
                </h3>
              </div>
              {responseMeta && (
                <div className="flex items-center space-x-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                    HTTP {responseMeta.status} OK
                  </span>
                  <span className="text-stone-400 font-mono">
                    {responseMeta.timeMs}ms
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1 min-h-[300px] p-4 rounded-xl bg-[#FDFBF7] border border-champagne-border font-mono text-xs text-stone-800 overflow-x-auto">
              {responseOutput ? (
                <pre className="whitespace-pre-wrap leading-relaxed">
                  {JSON.stringify(responseOutput, null, 2)}
                </pre>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-stone-400 py-16 space-y-2">
                  <Play className="w-8 h-8 text-stone-300" />
                  <p className="text-xs">
                    Clique em "Executar Chamada" para disparar uma requisição ao vivo e inspecionar os cabeçalhos e JSON retornado.
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* CANONICAL SPECS ACCORDION / REFERENCE */}
        <div className="champagne-card p-6 sm:p-8 rounded-2xl bg-white shadow-card space-y-4">
          <h3 className="font-editorial text-lg font-bold text-stone-900">
            Níveis de Impacto Agêntico (Classificação Forense)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <span className="font-bold text-stone-800 block">L0_OBSERVATION</span>
              <span className="text-stone-500 text-[11px]">Leitura passiva sem consumo de recursos.</span>
            </div>
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <span className="font-bold text-stone-800 block">L1_ANALYSIS</span>
              <span className="text-stone-500 text-[11px]">Busca de jurisprudência e sumarização de peças.</span>
            </div>
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <span className="font-bold text-stone-800 block">L2_DRAFT</span>
              <span className="text-stone-500 text-[11px]">Geração de minutas em memória de sessão.</span>
            </div>
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <span className="font-bold text-stone-800 block">L3_INTERNAL_MUTATION</span>
              <span className="text-stone-500 text-[11px]">Gravação em banco e checkpointing interno.</span>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300">
              <span className="font-bold text-amber-900 block">L4_EXTERNAL_EFFECT</span>
              <span className="text-amber-800 text-[11px]">Aprovação humana mandatória via token.</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
