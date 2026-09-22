import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { ApiRequestError, createApiKey, listApiKeys, revokeApiKey, type PublicApiKey } from '../api-client';

const scopeProfiles = [
  {
    id: 'mcp',
    label: 'MCP de pesquisa',
    description: 'Para conectar ChatGPT ou Claude às ferramentas de pesquisa do ForgeLex.',
    scopes: ['mcp', 'research:read'],
  },
  {
    id: 'research',
    label: 'API de pesquisa',
    description: 'Para integrar a pesquisa jurisprudencial a um software próprio.',
    scopes: ['research:read'],
  },
] as const;

type ScopeProfileId = typeof scopeProfiles[number]['id'];

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value));
}

function messageFor(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : 'Não foi possível concluir a operação agora.';
}

export const ApiKeysScreen: React.FC = () => {
  const [keys, setKeys] = useState<PublicApiKey[]>([]);
  const [name, setName] = useState('');
  const [profile, setProfile] = useState<ScopeProfileId>('mcp');
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listApiKeys();
      setKeys(result.items);
      setError(null);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadKeys(); }, [loadKeys]);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedProfile = scopeProfiles.find((item) => item.id === profile)!;
    setCreating(true);
    try {
      const result = await createApiKey({ name: name.trim(), scopes: [...selectedProfile.scopes] });
      const { token, ...publicKey } = result.key;
      setKeys((current) => [publicKey, ...current]);
      setCreatedSecret(token);
      setName('');
      setError(null);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (key: PublicApiKey) => {
    if (!window.confirm(`Revogar a chave “${key.name}”? Ela deixará de autenticar imediatamente.`)) return;
    setRevokingId(key.id);
    try {
      const result = await revokeApiKey(key.id);
      setKeys((current) => current.map((item) => item.id === result.key.id ? result.key : item));
      setError(null);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setRevokingId(null);
    }
  };

  const copySecret = async () => {
    if (!createdSecret) return;
    await navigator.clipboard.writeText(createdSecret);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return <div className="py-8 md:py-12"><div className="page-container space-y-8">
    <header className="border-b border-champagne-border pb-6"><p className="eyebrow">Integrações</p><h1 className="font-editorial text-3xl font-bold text-stone-900 sm:text-4xl">Chaves de API</h1><p className="mt-1 max-w-3xl text-sm leading-relaxed text-stone-500">Crie chaves para integrações ou software próprio. Para conectar ChatGPT ou Claude sem programar, use <strong className="font-semibold text-stone-700">Conectar IA</strong>.</p></header>

    {error && <div role="alert" className="surface-subtle flex items-start gap-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><p>{error}</p></div>}

    {createdSecret && <section className="surface border-emerald-200 bg-emerald-50/40 p-5 sm:p-6"><div className="flex items-start gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" /><div className="min-w-0"><h2 className="font-editorial text-xl font-bold text-stone-900">Copie agora: o segredo não será exibido novamente</h2><p className="mt-1 text-sm leading-relaxed text-stone-600">Guarde a chave em um gerenciador de segredos. A lista abaixo mostra apenas o prefixo de identificação.</p></div></div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-stone-900 px-4 py-3 text-sm text-stone-100">{createdSecret}</code><button type="button" className="btn-secondary inline-flex items-center justify-center gap-2" onClick={() => void copySecret()}><Copy className="h-4 w-4" aria-hidden="true" />{copied ? 'Copiado' : 'Copiar chave'}</button></div></section>}

    <section className="surface p-5 sm:p-6"><div className="flex items-center gap-2"><Plus className="h-5 w-5 text-cognac-700" aria-hidden="true" /><h2 className="font-editorial text-xl font-bold text-stone-900">Criar chave</h2></div><form className="mt-5 space-y-5" onSubmit={(event) => void create(event)}><label className="block text-sm font-semibold text-stone-700">Nome da chave<input required value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Ex.: integração do escritório" className="mt-2 block w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none ring-cognac-500 focus:ring-2" /></label><fieldset><legend className="text-sm font-semibold text-stone-700">Perfil de acesso</legend><div className="mt-2 grid gap-3 sm:grid-cols-2">{scopeProfiles.map((item) => <label key={item.id} className={`cursor-pointer rounded-xl border p-4 ${profile === item.id ? 'border-cognac-500 bg-cognac-50' : 'border-stone-200 bg-white'}`}><input className="sr-only" type="radio" name="profile" value={item.id} checked={profile === item.id} onChange={() => setProfile(item.id)} /><span className="block text-sm font-bold text-stone-800">{item.label}</span><span className="mt-1 block text-xs leading-relaxed text-stone-500">{item.description}</span><span className="mt-2 block font-mono text-[11px] text-stone-500">{item.scopes.join(' · ')}</span></label>)}</div></fieldset><button type="submit" disabled={creating || !name.trim()} className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60">{creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}{creating ? 'Criando chave…' : 'Criar chave'}</button></form></section>

    <section className="surface p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="font-editorial text-xl font-bold text-stone-900">Chaves existentes</h2><p className="mt-1 text-sm text-stone-500">O segredo não é recuperável depois da criação.</p></div>{loading && <Loader2 className="h-5 w-5 animate-spin text-stone-400" aria-label="Carregando chaves" />}</div>{!loading && keys.length === 0 && <p className="mt-5 rounded-xl border border-dashed border-stone-200 p-5 text-sm text-stone-500">Nenhuma chave criada ainda.</p>}<ul className="mt-5 divide-y divide-stone-100">{keys.map((key) => <li key={key.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-stone-800">{key.name}</p><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${key.revokedAt ? 'bg-stone-100 text-stone-500' : 'bg-emerald-50 text-emerald-800'}`}>{key.revokedAt ? 'Revogada' : 'Ativa'}</span></div><p className="mt-1 font-mono text-xs text-stone-500">{key.keyPrefix}…</p><p className="mt-1 text-xs text-stone-500">{key.scopes.join(' · ')} · criada em {formatDate(key.createdAt)}</p></div>{!key.revokedAt && <button type="button" disabled={revokingId === key.id} onClick={() => void revoke(key)} className="btn-secondary inline-flex shrink-0 items-center justify-center gap-2 border-red-200 text-red-800 hover:bg-red-50 disabled:opacity-60"><Trash2 className="h-4 w-4" aria-hidden="true" />{revokingId === key.id ? 'Revogando…' : 'Revogar'}</button>}</li>)}</ul></section>
  </div></div>;
};
