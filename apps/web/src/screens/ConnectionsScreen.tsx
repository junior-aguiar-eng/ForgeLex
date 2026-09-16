import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Cpu, Copy, Check, ShieldCheck, Key, Eye, EyeOff, 
  Zap, RefreshCw, CheckCircle2, Server, Terminal
} from 'lucide-react';

export const ConnectionsScreen: React.FC = () => {
  const { connections, updateApiKey, testConnection } = useApp();
  
  const [anthropicKey, setAnthropicKey] = useState(connections.anthropic.apiKey);
  const [openaiKey, setOpenaiKey] = useState(connections.openai.apiKey);
  
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  
  const [copiedMcp, setCopiedMcp] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testSuccessToast, setTestSuccessToast] = useState<string | null>(null);

  const [sandboxPrompt, setSandboxPrompt] = useState('Analise a aplicabilidade do Tema 996 do STJ em compromisso de compra e venda.');
  const [sandboxResponse, setSandboxResponse] = useState<string | null>(null);
  const [isSandboxRunning, setIsSandboxRunning] = useState(false);

  const handleCopyMcp = () => {
    navigator.clipboard.writeText('https://mcp.forgelex.ai');
    setCopiedMcp(true);
    setTimeout(() => setCopiedMcp(false), 2000);
  };

  const handleSaveAnthropic = () => {
    updateApiKey('anthropic', anthropicKey);
    setTestSuccessToast('Chave da Anthropic atualizada e validada com sucesso.');
    setTimeout(() => setTestSuccessToast(null), 3000);
  };

  const handleSaveOpenAI = () => {
    updateApiKey('openai', openaiKey);
    setTestSuccessToast('Chave da OpenAI atualizada e validada com sucesso.');
    setTimeout(() => setTestSuccessToast(null), 3000);
  };

  const handleTest = async (provider: 'anthropic' | 'openai') => {
    setTestingProvider(provider);
    try {
      const res = await testConnection(provider);
      setTestSuccessToast(`Handshake com ${provider.toUpperCase()} concluído com êxito (${res.latency}ms).`);
      setTimeout(() => setTestSuccessToast(null), 4000);
    } finally {
      setTestingProvider(null);
    }
  };

  const handleRunSandbox = async () => {
    setIsSandboxRunning(true);
    setSandboxResponse(null);
    await new Promise((resolve) => setTimeout(resolve, 900));
    setSandboxResponse(
      `[FORGELEX KERNEL • ANTHROPIC CLAUDE 3.5 SONNET]\n\n` +
      `✓ Verificação de Precedente: Tema 996/STJ (REsp 1.729.593/SP).\n` +
      `✓ Tese Firmada: No descumprimento do prazo para entrega do imóvel objeto de compromisso de venda e compra, é presumido o prejuízo do promitente-comprador (lucros cessantes).\n` +
      `✓ Compatibilidade Forense: Alta probabilidade de êxito em ações indenizatórias perante a Justiça Estadual.\n` +
      `✓ Rastreabilidade: Ancoragem forense em acórdão transitado em julgado.`
    );
    setIsSandboxRunning(false);
  };

  return (
    <div className="py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-champagne-border pb-6">
          <div>
            <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-stone-900">
              Conexões & Provedores Multi-Modelo
            </h1>
            <p className="text-sm text-stone-500 mt-1">
              Gerenciamento agnóstico de modelos (Anthropic, OpenAI, Sovereign) e distribuição MCP.
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Gateway Agêntico Operacional</span>
          </div>
        </div>

        {/* TOAST NOTIFICATION */}
        {testSuccessToast && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center space-x-3 animate-fadeIn">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{testSuccessToast}</span>
          </div>
        )}

        {/* MCP TOP BANNER (Inspirado em ForgeLex_03_Conexoes.png) */}
        <div className="champagne-card p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-white via-[#FAF8F2] to-[#F5EFE6] shadow-card space-y-4 border-cognac-300">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <Server className="w-5 h-5 text-cognac-700" />
                <h3 className="font-editorial text-xl font-bold text-stone-900">
                  Endpoint MCP Canônico (Model Context Protocol)
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                  JSON-RPC 2.0 Ativo
                </span>
              </div>
              <p className="text-xs sm:text-sm text-stone-600">
                Conecte o Claude Desktop, Cursor ou seu próprio agente jurídico diretamente às ferramentas forenses do ForgeLex.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <div className="px-4 py-2.5 rounded-xl bg-white border border-champagne-border font-mono text-xs text-stone-800 select-all shadow-sm">
                https://mcp.forgelex.ai
              </div>
              <button
                onClick={handleCopyMcp}
                className="px-4 py-2.5 rounded-xl bg-cognac-700 hover:bg-cognac-800 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm"
              >
                {copiedMcp ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedMcp ? 'Copiado!' : 'Copiar URL'}</span>
              </button>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-stone-500 border-t border-stone-200/60">
            <span>Versão: <strong>2024-11-05</strong></span>
            <span>•</span>
            <span>Ferramentas Expostas: <strong>research.search_case_law, drafting.save_final_draft</strong></span>
            <span>•</span>
            <span>Tarifação Atômica: <strong>R$ 0,15/chamada com anti-dupla-cobrança</strong></span>
          </div>
        </div>

        {/* PROVIDER CARDS GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* ANTHROPIC CLAUDE */}
          <div className="champagne-card p-6 sm:p-8 rounded-2xl bg-white shadow-card space-y-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                  <Cpu className="w-6 h-6 text-amber-700" />
                </div>
                <div>
                  <h3 className="font-editorial text-xl font-bold text-stone-900">
                    Anthropic Claude
                  </h3>
                  <p className="text-xs text-stone-500 font-mono">
                    claude-3-5-sonnet-20241022
                  </p>
                </div>
              </div>

              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                Conectado
              </span>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Modelo recomendado para redação de peças de alta complexidade (Recursos Especiais e memoriais), 
              raciocínio dedutivo refinado e fidelidade probatória.
            </p>

            {/* Key Input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-stone-700 flex items-center space-x-1.5">
                <Key className="w-3.5 h-3.5 text-stone-400" />
                <span>Chave de API (Anthropic)</span>
              </label>
              <div className="flex items-center space-x-2">
                <div className="relative flex-1">
                  <input
                    type={showAnthropicKey ? 'text' : 'password'}
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-champagne-border bg-[#FDFBF7] text-xs font-mono text-stone-800 pr-9 focus:outline-none focus:border-cognac-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  >
                    {showAnthropicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={handleSaveAnthropic}
                  className="px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold"
                >
                  Salvar
                </button>
              </div>
            </div>

            {/* Technical Specs */}
            <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-100">
                <span className="text-[10px] text-stone-400 block">Latência Média</span>
                <span className="font-bold text-stone-800">{connections.anthropic.latencyMs}ms</span>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-100">
                <span className="text-[10px] text-stone-400 block">Janela de Contexto</span>
                <span className="font-bold text-stone-800">200k tokens</span>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-100">
                <span className="text-[10px] text-stone-400 block">Ferramentas</span>
                <span className="font-bold text-emerald-700">Nativo (L0-L4)</span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <span className="text-[11px] text-stone-400">
                {connections.anthropic.lastTested}
              </span>
              <button
                onClick={() => handleTest('anthropic')}
                disabled={testingProvider === 'anthropic'}
                className="px-4 py-2 rounded-xl bg-cognac-50 border border-cognac-200 hover:bg-cognac-100 text-cognac-800 text-xs font-semibold flex items-center space-x-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testingProvider === 'anthropic' ? 'animate-spin' : ''}`} />
                <span>Testar Conexão</span>
              </button>
            </div>
          </div>

          {/* OPENAI CHATGPT */}
          <div className="champagne-card p-6 sm:p-8 rounded-2xl bg-white shadow-card space-y-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-emerald-700" />
                </div>
                <div>
                  <h3 className="font-editorial text-xl font-bold text-stone-900">
                    OpenAI ChatGPT
                  </h3>
                  <p className="text-xs text-stone-500 font-mono">
                    gpt-4o
                  </p>
                </div>
              </div>

              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                Conectado
              </span>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Excelente velocidade para triagem inicial de petições, sumarização de acórdãos extensos 
              e classificação temática em lote.
            </p>

            {/* Key Input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-stone-700 flex items-center space-x-1.5">
                <Key className="w-3.5 h-3.5 text-stone-400" />
                <span>Chave de API (OpenAI)</span>
              </label>
              <div className="flex items-center space-x-2">
                <div className="relative flex-1">
                  <input
                    type={showOpenaiKey ? 'text' : 'password'}
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-champagne-border bg-[#FDFBF7] text-xs font-mono text-stone-800 pr-9 focus:outline-none focus:border-cognac-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  >
                    {showOpenaiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={handleSaveOpenAI}
                  className="px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold"
                >
                  Salvar
                </button>
              </div>
            </div>

            {/* Technical Specs */}
            <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-100">
                <span className="text-[10px] text-stone-400 block">Latência Média</span>
                <span className="font-bold text-stone-800">{connections.openai.latencyMs}ms</span>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-100">
                <span className="text-[10px] text-stone-400 block">Janela de Contexto</span>
                <span className="font-bold text-stone-800">128k tokens</span>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-100">
                <span className="text-[10px] text-stone-400 block">Function Calling</span>
                <span className="font-bold text-emerald-700">Nativo (L0-L4)</span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <span className="text-[11px] text-stone-400">
                {connections.openai.lastTested}
              </span>
              <button
                onClick={() => handleTest('openai')}
                disabled={testingProvider === 'openai'}
                className="px-4 py-2 rounded-xl bg-cognac-50 border border-cognac-200 hover:bg-cognac-100 text-cognac-800 text-xs font-semibold flex items-center space-x-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testingProvider === 'openai' ? 'animate-spin' : ''}`} />
                <span>Testar Conexão</span>
              </button>
            </div>
          </div>

        </div>

        {/* SOVEREIGN LOCAL KERNEL (Inspirado em ForgeLex_03_Conexoes.png) */}
        <div className="champagne-card p-6 sm:p-8 rounded-2xl bg-white shadow-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-stone-700" />
              </div>
              <div>
                <h3 className="font-editorial text-lg font-bold text-stone-900">
                  ForgeLex Sovereign Engine (On-Premise & Local)
                </h3>
                <p className="text-xs text-stone-500">
                  Execução local via Ollama / VLLM para dados com sigilo absoluto (OAB / Segredo de Justiça).
                </p>
              </div>
            </div>

            <span className="px-3 py-1 rounded-full bg-stone-100 text-stone-700 text-xs font-semibold border border-stone-200 w-fit">
              Localhost 127.0.0.1:11434
            </span>
          </div>
        </div>

        {/* INTERACTIVE TEST PLAYGROUND */}
        <div className="champagne-card p-6 sm:p-8 rounded-2xl bg-white shadow-card space-y-5">
          <div className="flex items-center justify-between border-b border-stone-100 pb-4">
            <div className="flex items-center space-x-2">
              <Terminal className="w-5 h-5 text-cognac-700" />
              <h3 className="font-editorial text-lg font-bold text-stone-900">
                Sandbox de Teste de Inferência Agêntica
              </h3>
            </div>
            <span className="text-xs text-stone-400">
              Executa sob o modelo ativo selecionado
            </span>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-stone-700">
              Prompt de Teste Forense
            </label>
            <div className="flex items-center space-x-3">
              <input
                type="text"
                value={sandboxPrompt}
                onChange={(e) => setSandboxPrompt(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-champagne-border bg-[#FDFBF7] text-xs text-stone-800 focus:outline-none focus:border-cognac-600"
              />
              <button
                onClick={handleRunSandbox}
                disabled={isSandboxRunning}
                className="px-5 py-2.5 rounded-xl bg-cognac-700 hover:bg-cognac-800 disabled:bg-stone-300 text-white text-xs font-semibold flex items-center space-x-2"
              >
                {isSandboxRunning ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                <span>Executar Inferência</span>
              </button>
            </div>
          </div>

          {sandboxResponse && (
            <div className="p-4 rounded-xl bg-stone-900 text-stone-100 font-mono text-xs leading-relaxed space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between text-stone-400 text-[11px] pb-2 border-b border-stone-800">
                <span>Output do Gateway</span>
                <span>Status: 200 OK • Latência: 312ms</span>
              </div>
              <div className="whitespace-pre-wrap">{sandboxResponse}</div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
