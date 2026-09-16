import React, { useState } from 'react';
import { Cpu, Eye, EyeOff, Key, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';

type Provider = 'anthropic' | 'openai';

const providerNames: Record<Provider, string> = { anthropic: 'Anthropic', openai: 'OpenAI' };

export const ConnectionsScreen: React.FC = () => {
  const { connections, updateApiKey, testConnection } = useApp();
  const [keys, setKeys] = useState<Record<Provider, string>>({ anthropic: connections.anthropic.apiKey, openai: connections.openai.apiKey });
  const [visible, setVisible] = useState<Record<Provider, boolean>>({ anthropic: false, openai: false });
  const [busy, setBusy] = useState<Provider | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const save = (provider: Provider) => {
    updateApiKey(provider, keys[provider]);
    setNotice(keys[provider].trim() ? `Credencial da ${providerNames[provider]} guardada nesta sessão. A conexão ainda não foi verificada.` : `Credencial da ${providerNames[provider]} removida.`);
    setTimeout(() => setNotice(null), 4000);
  };

  const test = async (provider: Provider) => {
    setBusy(provider);
    const result = await testConnection(provider);
    setBusy(null);
    setNotice(result.success ? `Conexão com a ${providerNames[provider]} verificada.` : `Não foi possível confirmar a conexão com a ${providerNames[provider]} neste ambiente.`);
    setTimeout(() => setNotice(null), 4000);
  };

  return <div className="py-8 md:py-12"><div className="page-container space-y-8">
    <div className="flex flex-col gap-4 border-b border-champagne-border pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Área técnica</p><h1 className="font-editorial text-3xl font-bold text-stone-900 sm:text-4xl">Modelos e integrações</h1><p className="mt-1 max-w-2xl text-sm text-stone-500">Informe credenciais somente quando quiser conectar um provedor. Nenhum provedor é tratado como conectado sem verificação.</p></div><span className="inline-flex w-fit items-center gap-2 rounded-full border border-stone-200 bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-600"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />Estado da conta</span></div>
    {notice && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{notice}</div>}
    <section className="surface space-y-4 p-5 sm:p-6"><div className="flex items-start gap-3"><Server className="mt-0.5 h-5 w-5 shrink-0 text-cognac-700" aria-hidden="true" /><div><h2 className="font-editorial text-xl font-bold text-stone-900">Integrações disponíveis</h2><p className="mt-1 text-sm text-stone-500">A área técnica aceita configurações locais. O endpoint e a autenticação do ambiente devem ser confirmados antes do uso.</p></div></div><div className="surface-subtle p-4 text-sm text-stone-600"><strong className="text-stone-800">MCP e API:</strong> a documentação com exemplos e contratos permanece em <span className="font-semibold text-cognac-800">Área técnica → Documentação da API</span>. O endereço público não é presumido neste ambiente.</div></section>
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">{(['anthropic', 'openai'] as Provider[]).map((provider) => { const connection = connections[provider]; const ProviderIcon = provider === 'anthropic' ? Cpu : Key; return <section key={provider} className="surface space-y-5 p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cognac-50 text-cognac-700"><ProviderIcon className="h-5 w-5" aria-hidden="true" /></div><div><h2 className="font-editorial text-xl font-bold text-stone-900">{providerNames[provider]}</h2><p className="text-xs text-stone-500">Provedor de modelo</p></div></div><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${connection.status === 'configured' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-stone-200 bg-stone-100 text-stone-600'}`}>{connection.status === 'configured' ? 'Configurado' : 'Não configurado'}</span></div><p className="text-sm leading-relaxed text-stone-600">A credencial é mantida apenas na sessão do navegador. O ForgeLex não confirma disponibilidade do provedor sem uma integração real.</p><label className="block text-xs font-semibold text-stone-700"><span className="mb-1.5 inline-flex items-center gap-1.5"><Key className="h-3.5 w-3.5 text-stone-400" aria-hidden="true" />Credencial do provedor</span><div className="relative"><input type={visible[provider] ? 'text' : 'password'} value={keys[provider]} onChange={(event) => setKeys((current) => ({ ...current, [provider]: event.target.value }))} placeholder="Cole a credencial somente se necessário" className="input-control pr-10 font-mono text-xs" /><button type="button" onClick={() => setVisible((current) => ({ ...current, [provider]: !current[provider] }))} className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400" aria-label={visible[provider] ? 'Ocultar credencial' : 'Mostrar credencial'}>{visible[provider] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label><div className="flex flex-wrap gap-2"><button type="button" onClick={() => save(provider)} className="btn-secondary">Salvar configuração</button><button type="button" onClick={() => void test(provider)} disabled={busy === provider || !keys[provider].trim()} className="btn-quiet disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${busy === provider ? 'animate-spin' : ''}`} aria-hidden="true" />Verificar conexão</button></div></section>; })}</div>
    <section className="surface-subtle p-5 text-sm text-stone-600"><h2 className="font-editorial text-lg font-bold text-stone-800">Sem conexão local configurada</h2><p className="mt-1">Um modelo local só deve aparecer aqui depois que o ambiente fornecer uma configuração verificável. Nenhum modelo local é apresentado como ativo por padrão.</p></section>
  </div></div>;
};
