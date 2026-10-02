import { useEffect, useState } from 'react';
import type { OAuthGrant } from '@supabase/supabase-js';
import { supabase } from '../../auth/supabase-client';

export function AuthorizedApplications() {
  const [grants, setGrants] = useState<OAuthGrant[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  async function load() {
    if (!supabase) { setError('O acesso por conta não está configurado neste ambiente.'); return; }
    setError(null);
    try {
      const { data, error: authError } = await supabase.auth.oauth.listGrants();
      if (authError || !data) throw authError;
      setGrants(data); setLoaded(true);
    } catch { setError('Não foi possível consultar as autorizações. A conexão OAuth pode estar indisponível; tente atualizar.'); }
  }
  useEffect(() => { void load(); }, []);
  async function revoke(clientId: string) {
    if (!supabase) return;
    setBusy(clientId); setError(null);
    try {
      const { error: authError } = await supabase.auth.oauth.revokeGrant({ clientId });
      if (authError) throw authError;
      setGrants((current) => current.filter((grant) => grant.client.id !== clientId));
      setConfirm(null);
    } catch { setError('Não foi possível revogar o acesso. A autorização continua ativa até a confirmação do servidor.'); }
    finally { setBusy(null); }
  }
  return <section className="surface p-6 sm:p-8" aria-labelledby="authorized-apps"><header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 id="authorized-apps" className="font-editorial text-2xl font-bold text-stone-900">Aplicativos autorizados</h2><p className="mt-2 text-sm leading-6 text-stone-600">Autorizações concedidas na sua conta. Autorizar um aplicativo e executar uma ferramenta são etapas distintas.</p></div><button className="btn-secondary min-h-11 shrink-0" onClick={() => void load()}>Atualizar autorizações</button></header>
    {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</p>}
    {!loaded && !error && <p role="status" className="mt-5 text-sm text-stone-600">Consultando autorizações…</p>}
    {loaded && grants.length === 0 && <p className="mt-5 border-t border-stone-200 pt-5 text-sm text-stone-600">Nenhum aplicativo autorizado. Configure o ChatGPT ou Claude usando o roteiro acima.</p>}
    <ul className="mt-5 divide-y divide-stone-200">{grants.map((grant) => <li key={grant.client.id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold text-stone-900">{grant.client.name || 'Aplicativo sem nome'}</h3><p className="mt-1 text-sm text-stone-600">Autorizado em {new Date(grant.granted_at).toLocaleString('pt-BR')}.</p><p className="mt-1 text-xs text-stone-500">Dados de identidade: {grant.scopes.join(', ')}.</p>{confirm === grant.client.id && <p className="mt-3 text-sm text-stone-700">A revogação interrompe o acesso deste aplicativo. Para usá-lo novamente, você precisará autorizar uma nova conexão.</p>}</div><div className="flex shrink-0 gap-2">{confirm === grant.client.id ? <><button className="btn-secondary min-h-11" disabled={busy !== null} onClick={() => void revoke(grant.client.id)}>{busy === grant.client.id ? 'Revogando…' : 'Confirmar revogação'}</button><button className="btn-secondary min-h-11" disabled={busy !== null} onClick={() => setConfirm(null)}>Cancelar</button></> : <button className="btn-secondary min-h-11" onClick={() => setConfirm(grant.client.id)}>Revogar acesso</button>}</div></li>)}</ul>
  </section>;
}
