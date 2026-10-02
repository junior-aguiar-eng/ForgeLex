import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { isLocalMcpUrl, platformName, type HostPlatform } from './connection-model';
import { hostInstallationSteps, hostReferences } from './host-installation-steps';

export function HostInstallationGuide({ platform, mcpUrl }: { platform: HostPlatform; mcpUrl: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const reference = hostReferences[platform];
  const local = isLocalMcpUrl(mcpUrl);
  async function copy() {
    try { await navigator.clipboard.writeText(mcpUrl); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  }
  return <section className="surface overflow-hidden" aria-label={`Instruções para ${platformName(platform)}`}>
    <header className="flex flex-col gap-4 border-b border-stone-200 p-6 sm:flex-row sm:items-start sm:justify-between sm:p-8"><div><p className="eyebrow">Instalação por plataforma</p><h2 className="mt-2 font-editorial text-2xl font-bold text-stone-900">Conectar ao {platformName(platform)}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">Configure uma vez. Depois, selecione as ferramentas ForgeLex nas conversas em que pretende usá-las.</p></div><a className="btn-primary shrink-0 gap-2" href={reference.href} target="_blank" rel="noreferrer">{reference.label}<ExternalLink className="h-4 w-4" aria-hidden="true" /></a></header>
    <div className="grid min-w-0 gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <ol className="space-y-6">{hostInstallationSteps[platform].map((step, index) => <li key={step.title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3"><span className="pt-0.5 font-mono text-sm text-cognac-800">{String(index + 1).padStart(2, '0')}</span><div><h3 className="font-semibold text-stone-900">{step.title}</h3><p className="mt-2 text-sm leading-6 text-stone-600">{step.text}</p></div></li>)}</ol>
      <aside className="min-w-0 space-y-5"><div className="rounded-xl border border-champagne-border bg-[#FDFBF7] p-5"><h3 className="text-sm font-semibold text-stone-900">Dados da conexão</h3><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-stone-500">Nome</dt><dd className="mt-1 font-medium text-stone-900">ForgeLex</dd></div><div><dt className="text-stone-500">Autenticação</dt><dd className="mt-1 font-medium text-stone-900">OAuth · sua conta ForgeLex</dd></div><div><dt className="text-stone-500">URL do servidor MCP</dt><dd className="mt-2"><code className="block break-all rounded-lg border border-stone-200 bg-white p-3 text-xs leading-6 text-stone-800">{mcpUrl}</code></dd></div></dl><button className="btn-secondary mt-4 w-full justify-center gap-2" disabled={local} onClick={() => void copy()}>{copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}{copied ? 'URL copiada' : 'Copiar URL MCP'}</button><p className="mt-3 text-xs leading-5 text-stone-600" role="status">{local ? 'Esta URL é local e não pode ser usada pelo ChatGPT ou Claude. Use um endereço HTTPS público.' : copyError ? 'Não foi possível copiar. Selecione e copie o endereço acima.' : 'Cole somente este endereço. Não inclua senha, token ou chave na URL.'}</p></div>
        <div className="border-l-2 border-cognac-700 pl-4"><h3 className="text-sm font-semibold text-stone-900">Resultado esperado</h3><p className="mt-2 text-sm leading-6 text-stone-600">A autorização retorna ao aplicativo e as ferramentas aparecem na conversa. Abrir este guia ou copiar a URL não confirma a instalação.</p></div>
        <a className="inline-flex items-center gap-2 text-xs font-semibold text-cognac-800 underline" href={reference.docs} target="_blank" rel="noreferrer">Documentação oficial da plataforma<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a><p className="text-xs leading-5 text-stone-500">Revisado em 2 de outubro de 2026. O formulário ChatGPT foi observado na conta de teste; o roteiro Claude segue a documentação oficial e ainda requer validação no host.</p>
      </aside>
    </div>
  </section>;
}
