import React, { useMemo, useState } from 'react';
import { ChevronDown, LockKeyhole, ShieldCheck } from 'lucide-react';
import { ConnectionChecklist } from './connections/ConnectionChecklist';
import { FirstUseExamples } from './connections/FirstUseExamples';
import { PlatformConnectionCard } from './connections/PlatformConnectionCard';
import { createPlatformConnection, platformName, resolveMcpUrl, type HostPlatform } from './connections/connection-model';

export const ConnectionsScreen: React.FC = () => {
  const [platform, setPlatform] = useState<HostPlatform>('chatgpt');
  const [copied, setCopied] = useState(false);
  const mcpUrl = useMemo(() => resolveMcpUrl(), []);
  const connections = useMemo(() => (['chatgpt', 'claude'] as const).map((item) => createPlatformConnection(item, mcpUrl)), [mcpUrl]);
  const selectedConnection = connections.find((connection) => connection.platform === platform) ?? connections[0];

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(selectedConnection.mcpUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
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
