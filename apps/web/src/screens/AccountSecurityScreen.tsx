import React, { useState } from 'react';
import { CircleAlert, KeyRound, Loader2, LogOut, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

interface AccountSecurityViewProps {
  email?: string;
  busy: 'password' | 'session' | null;
  message: { tone: 'success' | 'error'; text: string } | null;
  onRequestPasswordChange: () => void;
  onSignOut: () => void;
}

export const AccountSecurityView: React.FC<AccountSecurityViewProps> = ({ email, busy, message, onRequestPasswordChange, onSignOut }) => <div className="py-8 md:py-12"><div className="page-container space-y-8">
  <div className="border-b border-champagne-border pb-6"><p className="eyebrow">Conta</p><h1 className="font-editorial text-3xl font-bold text-stone-900 sm:text-4xl">Segurança da conta</h1><p className="mt-1 max-w-2xl text-sm leading-relaxed text-stone-500">Gerencie sua senha e a sessão atual sem expor credenciais ao ForgeLex.</p></div>
  {message && <div role={message.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-4 text-sm ${message.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{message.text}</div>}
  <section className="surface flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-cognac-700" aria-hidden="true" /><h2 className="font-editorial text-xl font-bold text-stone-900">Alterar senha</h2></div><p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">Enviaremos um link de uso único para {email ?? 'o e-mail da conta'}. A senha é alterada no fluxo protegido de autenticação.</p></div><button type="button" onClick={onRequestPasswordChange} disabled={!email || busy !== null} className="btn-secondary shrink-0">{busy === 'password' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}Enviar link para alterar senha</button></section>
  <section className="surface flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-cognac-700" aria-hidden="true" /><h2 className="font-editorial text-xl font-bold text-stone-900">Sessão atual</h2></div><p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">Encerre o acesso neste navegador. Para continuar, será necessário entrar novamente.</p></div><button type="button" onClick={onSignOut} disabled={busy !== null} className="btn-secondary shrink-0">{busy === 'session' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}Encerrar esta sessão</button></section>
  <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6"><div className="flex gap-3"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" /><div className="flex-1"><h2 className="font-editorial text-xl font-bold text-stone-900">Encerramento ainda indisponível</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-stone-600">O encerramento só será disponibilizado depois da aprovação da política de retenção, com definição do que será apagado, anonimizado ou preservado por obrigação legal. Até lá, nenhuma ação destrutiva é executada por esta interface.</p><button type="button" disabled className="btn-secondary mt-4 cursor-not-allowed opacity-60"><Trash2 className="h-4 w-4" aria-hidden="true" />Solicitação indisponível</button></div></div></section>
</div></div>;

export const AccountSecurityScreen: React.FC = () => {
  const { account, requestPasswordChange, signOut } = useAuth();
  const [busy, setBusy] = useState<AccountSecurityViewProps['busy']>(null);
  const [message, setMessage] = useState<AccountSecurityViewProps['message']>(null);

  const requestChange = async () => {
    setBusy('password');
    setMessage(null);
    try {
      await requestPasswordChange();
      setMessage({ tone: 'success', text: 'Enviamos um link de uso único para alterar sua senha.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível enviar o link.' });
    } finally {
      setBusy(null);
    }
  };

  const endSession = async () => {
    setBusy('session');
    setMessage(null);
    try {
      await signOut();
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível encerrar a sessão.' });
      setBusy(null);
    }
  };

  return <AccountSecurityView email={account?.user.email} busy={busy} message={message} onRequestPasswordChange={() => void requestChange()} onSignOut={() => void endSession()} />;
};
