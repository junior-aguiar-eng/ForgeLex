import { useEffect, useState } from 'react';
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js';
import { Scale, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../auth/supabase-client';
import { authorizationIdFromSearch, safeOAuthRedirect } from '../auth/oauth-consent';
import AuthScreen from './AuthScreen';

export function OAuthConsentScreen() {
  const { status, account } = useAuth();
  const authorizationId = authorizationIdFromSearch(window.location.search);
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Autorizar conexão · ForgeLex';
    if (status !== 'authenticated' || !authorizationId || !supabase) return;
    let active = true;
    void supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error: authError }) => {
      if (!active) return;
      if (authError || !data) { setError('A solicitação expirou ou não pôde ser verificada. Volte ao aplicativo e inicie a conexão novamente.'); return; }
      if ('redirect_url' in data) {
        const destination = safeOAuthRedirect(data.redirect_url);
        if (destination) window.location.assign(destination);
        else setError('O endereço de retorno do aplicativo não é seguro.');
      } else setDetails(data);
    }).catch(() => { if (active) setError('Não foi possível carregar a solicitação. Tente novamente.'); });
    return () => { active = false; };
  }, [status, authorizationId]);

  async function decide(approve: boolean) {
    if (!supabase || !authorizationId || !details || busy) return;
    setBusy(true); setError(null);
    try {
      const { data, error: authError } = approve
        ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
      const destination = data && safeOAuthRedirect(data.redirect_url);
      if (authError || !destination) throw new Error('Falha na autorização');
      window.location.assign(destination);
    } catch { setError('Não foi possível confirmar a conclusão. Consulte os aplicativos autorizados em Conectar IA antes de iniciar outra tentativa.'); setBusy(false); }
  }

  if (!authorizationId) return <main className="page-container py-16"><h1 className="font-editorial text-3xl">Solicitação inválida</h1><p className="mt-4 text-stone-600">Inicie a conexão pelo ChatGPT ou Claude para autorizar o aplicativo correto.</p><a className="btn-secondary mt-6" href="/conectar">Voltar às conexões</a></main>;
  if (status !== 'authenticated') return <AuthScreen initialView="sign_in" status={status} />;
  return <main className="min-h-screen bg-[#FBF9F5] px-4 py-10 sm:py-16"><div className="mx-auto max-w-xl">
    <a href="/" className="inline-flex items-center gap-3 font-editorial text-2xl font-bold text-stone-900"><Scale aria-hidden="true" className="h-7 w-7 text-cognac-800" />ForgeLex</a>
    <section className="surface mt-8 space-y-6 p-6 sm:p-8" aria-labelledby="consent-title">
      <header><p className="eyebrow">Autorização de acesso</p><h1 id="consent-title" className="mt-2 font-editorial text-3xl font-bold text-stone-900">{details ? `Conectar ${details.client.name || 'aplicativo externo'}` : 'Verificando solicitação…'}</h1><p className="mt-3 text-sm text-stone-600">Conta ForgeLex: {account?.user.email}</p></header>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</p>}
      {details && <><div className="rounded-xl border border-stone-200 bg-stone-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Aplicativo solicitante</p><p className="mt-2 font-semibold text-stone-900">{details.client.name || 'Nome não informado'}</p><p className="mt-1 break-all text-sm text-stone-600">Retorno: {new URL(details.redirect_uri).origin}</p><p className="mt-2 text-xs text-stone-500">Confira se este é o aplicativo no qual você iniciou a conexão.</p></div>
        <div><h2 className="font-semibold text-stone-900">O que você está autorizando</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-stone-700"><li>Identificar sua conta com os dados solicitados: {details.scope.split(' ').map((scope) => ({ email: 'e-mail', profile: 'nome e perfil', openid: 'identidade da conta', phone: 'telefone' }[scope] ?? scope)).join(', ')}.</li><li>Pesquisar jurisprudência do STJ e abrir ou verificar autoridades em seu nome.</li><li>Debitar os créditos ForgeLex das pesquisas válidas. Abrir e verificar autoridades são gratuitos. Confira a tarifa vigente na sua conta antes de pesquisar.</li></ul></div>
        <p className="flex gap-3 border-t border-stone-200 pt-5 text-sm leading-6 text-stone-600"><ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-cognac-800" aria-hidden="true" />Você pode revogar o acesso em Conectar IA. Esta conexão não autoriza administrar sua conta, criar chaves ou encerrar seu acesso.</p>
        <div className="flex flex-col gap-3 sm:flex-row"><button className="btn-primary min-h-11 flex-1 justify-center" disabled={busy} onClick={() => void decide(true)}>{busy ? 'Concluindo…' : 'Autorizar conexão'}</button><button className="btn-secondary min-h-11 flex-1 justify-center" disabled={busy} onClick={() => void decide(false)}>Recusar</button></div>
      </>}
    </section>
  </div></main>;
}
