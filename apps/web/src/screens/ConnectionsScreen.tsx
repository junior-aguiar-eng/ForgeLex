import React, { useMemo, useState } from 'react';
import { ChevronDown, LockKeyhole, ShieldCheck } from 'lucide-react';
import { ApiRequestError, getMcpConnectionStatus, type McpConnectionStatusResponse } from '../api-client';
import { ConnectionChecklist } from './connections/ConnectionChecklist';
import { FirstUseExamples } from './connections/FirstUseExamples';
import { PlatformConnectionCard } from './connections/PlatformConnectionCard';
import { connectionStatusErrorMessage, createPlatformConnection, deriveMcpConnectionSignals, platformName, resolveMcpUrl, type HostPlatform } from './connections/connection-model';

export const ConnectionsScreen: React.FC = () => {
  const [platform, setPlatform] = useState<HostPlatform>('chatgpt');
  const [copied, setCopied] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<McpConnectionStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [testingAvailability, setTestingAvailability] = useState(false);
  const mcpUrl = useMemo(() => resolveMcpUrl(), []);
  const activeMcpUrl = connectionStatus?.mcpUrl ?? mcpUrl;
  const connections = useMemo(() => (['chatgpt', 'claude'] as const).map((item) => createPlatformConnection(item, activeMcpUrl)), [activeMcpUrl]);
  const selectedConnection = connections.find((connection) => connection.platform === platform) ?? connections[0];
  const connectionSignals = connectionStatus ? deriveMcpConnectionSignals(connectionStatus) : [];

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(selectedConnection.mcpUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  };

  const testAvailability = async () => {
    setTestingAvailability(true);
    setStatusError(null);
    try {
      setConnectionStatus(await getMcpConnectionStatus());
    } catch (error) {
      setConnectionStatus(null);
      setStatusError(connectionStatusErrorMessage(error instanceof ApiRequestError ? error.code : 'API_UNAVAILABLE'));
    } finally {
      setTestingAvailability(false);
    }
  };

  return <div className="py-8 md:py-12">
    <div className="page-container space-y-8">
      <header className="flex flex-col gap-4 border-b border-champagne-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Conexão MCP</p>
          <h1 className="font-editorial text-3xl font-bold text-stone-900 sm:text-4xl">Conectar o ForgeLex ao ChatGPT ou Claude</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-stone-600">Escolha o host que você já usa, copie a URL MCP e siga as instruções apresentadas pelo próprio host. Esta tela não confirma uma conexão até haver verificação autenticada.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-stone-200 bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700"><ShieldCheck className="h-3.5 w-3.5 text-cognac-700" aria-hidden="true" /> Sem chaves de modelo no ForgeLex</span>
      </header>

      <section className="surface flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-cognac-700" aria-hidden="true" /><div><h2 className="font-editorial text-xl font-bold text-stone-900">Cobrança separada do host</h2><p className="mt-1 text-sm leading-relaxed text-stone-600">A assinatura do host não paga operações ForgeLex. O ForgeLex cobra somente a pesquisa jurídica faturável; comandos de abrir autoridade e verificar proveniência são gratuitos.</p></div></div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        {connections.map((connection) => <PlatformConnectionCard key={connection.platform} connection={connection} selected={connection.platform === platform} onSelect={() => setPlatform(connection.platform)} />)}
      </div>

      <ConnectionChecklist connection={selectedConnection} copied={copied} onCopyUrl={() => void copyUrl()} />

      <section className="surface space-y-4 p-5" aria-labelledby="availability-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="eyebrow">Teste gratuito</p>
            <h2 id="availability-heading" className="font-editorial text-xl font-bold text-stone-900">Testar disponibilidade</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-stone-600">Verifica a disponibilidade do ForgeLex e a credencial MCP. Nenhuma pesquisa jurídica, saldo ou crédito é consultado neste teste.</p>
          </div>
          <button type="button" className="button-secondary shrink-0" onClick={() => void testAvailability()} disabled={testingAvailability}>{testingAvailability ? 'Testando disponibilidade…' : 'Testar disponibilidade'}</button>
        </div>
        {statusError ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{statusError}</p> : null}
        {connectionSignals.length > 0 ? <dl className="grid gap-3 md:grid-cols-3">{connectionSignals.map((signal) => <div key={signal.id} className="rounded-lg border border-stone-200 bg-stone-50 p-3"><dt className={signal.tone === 'ready' ? 'font-semibold text-emerald-800' : signal.tone === 'unavailable' ? 'font-semibold text-red-800' : 'font-semibold text-stone-700'}>{signal.label}</dt><dd className="mt-1 text-xs leading-relaxed text-stone-600">{signal.detail}</dd></div>)}</dl> : null}
      </section>

      <FirstUseExamples />

      <details className="surface p-5 text-sm leading-relaxed text-stone-600">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-stone-800">Privacidade da conexão MCP<ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" /></summary>
        <p className="mt-3">O ForgeLex recebe a chamada autenticada e os argumentos da ferramenta. Ele não acessa conversas, arquivos ou histórico do ChatGPT ou Claude.</p>
        <p className="mt-2">A telemetria de ativação não inclui consulta, ementa, número processual, token, chave ou header <code>Authorization</code>.</p>
      </details>

      <p className="text-center text-xs text-stone-500">Host selecionado: {platformName(platform)}. O estado exibido permanece “Não configurado” até existir evidência de verificação.</p>
    </div>
  </div>;
};
