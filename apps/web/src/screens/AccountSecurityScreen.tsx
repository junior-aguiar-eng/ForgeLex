import React, { useEffect, useRef, useState } from 'react';
import { CircleAlert, KeyRound, Loader2, LogOut, ShieldCheck, Trash2 } from 'lucide-react';
import { getAccountClosurePolicy, requestAccountClosure, type AccountClosureAccepted, type AccountClosurePolicy } from '../api-client';
import { ensureClosureReceiptStorage, saveClosureReceipt, type ClosureReceipt } from '../account-closure-storage';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../auth/supabase-client';
import { routeForTab } from '../navigation/routes';

interface ClosureFormState {
  policy: AccountClosurePolicy | null;
  loading: boolean;
  stage: 'explanation' | 'password' | 'confirmation';
  personalConfirmed: boolean;
  password: string;
  confirmation: string;
}

interface AccountSecurityViewProps {
  email?: string;
  busy: 'password' | 'session' | 'closure' | null;
  message: { tone: 'success' | 'error'; text: string } | null;
  onRequestPasswordChange: () => void;
  onSignOut: () => void;
  closure?: ClosureFormState;
  onPersonalConfirmedChange?: (value: boolean) => void;
  onClosurePasswordChange?: (value: string) => void;
  onClosureConfirmationChange?: (value: string) => void;
  onContinueClosure?: () => void;
  onConfirmClosurePassword?: () => void;
  onRequestClosure?: () => void;
}

interface ClosureSubmission {
  enabled: boolean;
  personalConfirmed: boolean;
  confirmation: string;
  accessToken: string;
}

interface ClosureSubmissionDependencies {
  request: (input: { confirmation: string }, token: string, idempotencyKey: string) => Promise<AccountClosureAccepted>;
  save: (receipt: ClosureReceipt) => void;
  ensureStorage: () => void;
  signOut: () => Promise<void>;
  navigate: () => void;
  idempotencyKey?: string;
}

export async function submitAccountClosure(input: ClosureSubmission, deps: ClosureSubmissionDependencies): Promise<void> {
  if (!input.enabled) throw new Error('O encerramento ainda não está habilitado.');
  if (!input.personalConfirmed) throw new Error('Confirme que o espaço é pessoal.');
  if (input.confirmation !== 'ENCERRAR MINHA CONTA') throw new Error('O texto de confirmação não confere.');
  if (!input.accessToken) throw new Error('Confirme sua senha novamente antes de prosseguir.');
  deps.ensureStorage();
  const accepted = await deps.request({ confirmation: input.confirmation }, input.accessToken, deps.idempotencyKey ?? crypto.randomUUID());
  deps.save({ closureId: accepted.closureId, statusToken: accepted.statusToken, requestedAt: accepted.requestedAt, policyVersion: accepted.policyVersion });
  try { await deps.signOut(); } finally { deps.navigate(); }
}

const retentionLabels: Record<string, string> = {
  identity: 'Identidade: eliminação em até 24 horas',
  private_content: 'Conteúdo privado: eliminação em até 7 dias',
  access_logs: 'Registros de acesso: minimização e retenção por até 180 dias',
  financial_records: 'Registros financeiros: minimização e retenção provisória por 5 anos',
  backups: 'Cópias de segurança: expiração em até 35 dias',
};

export const AccountSecurityView: React.FC<AccountSecurityViewProps> = ({ email, busy, message, onRequestPasswordChange, onSignOut, closure, onPersonalConfirmedChange, onClosurePasswordChange, onClosureConfirmationChange, onContinueClosure, onConfirmClosurePassword, onRequestClosure }) => {
  const enabled = Boolean(closure?.policy?.enabled);
  const ready = enabled && closure?.stage === 'confirmation' && closure.personalConfirmed && closure.confirmation === closure.policy?.confirmation && busy === null;
  return <div className="py-8 md:py-12"><div className="page-container space-y-8">
    <div className="border-b border-champagne-border pb-6"><p className="eyebrow">Conta</p><h1 className="font-editorial text-3xl font-bold text-stone-900 sm:text-4xl">Segurança da conta</h1><p className="mt-1 max-w-2xl text-sm leading-relaxed text-stone-500">Gerencie sua senha e a sessão atual sem expor credenciais ao ForgeLex.</p></div>
    {message && <div role={message.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-4 text-sm ${message.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{message.text}</div>}
    <section className="surface flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-cognac-700" aria-hidden="true" /><h2 className="font-editorial text-xl font-bold text-stone-900">Alterar senha</h2></div><p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">Enviaremos um link de uso único para {email ?? 'o e-mail da conta'}. A senha é alterada no fluxo protegido de autenticação.</p></div><button type="button" onClick={onRequestPasswordChange} disabled={!email || busy !== null} className="btn-secondary shrink-0">{busy === 'password' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}Enviar link para alterar senha</button></section>
    <section className="surface flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-cognac-700" aria-hidden="true" /><h2 className="font-editorial text-xl font-bold text-stone-900">Sessão atual</h2></div><p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">Encerre o acesso neste navegador. Para continuar, será necessário entrar novamente.</p></div><button type="button" onClick={onSignOut} disabled={busy !== null} className="btn-secondary shrink-0">{busy === 'session' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}Encerrar esta sessão</button></section>
    <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6"><div className="flex gap-3"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" /><div className="flex-1 space-y-4">
      <h2 className="font-editorial text-xl font-bold text-stone-900">{enabled ? 'Encerrar conta e espaço pessoal' : 'Encerramento ainda indisponível'}</h2>
      {!enabled ? <><p className="max-w-3xl text-sm leading-relaxed text-stone-600">{closure?.loading ? 'Consultando a política de encerramento…' : 'O encerramento não está habilitado neste ambiente. Nenhuma ação destrutiva é executada por esta interface. Consulte a política de retenção antes de solicitar o encerramento.'}</p><button type="button" disabled className="btn-secondary cursor-not-allowed opacity-60"><Trash2 className="h-4 w-4" aria-hidden="true" />Solicitação indisponível</button></> : <>
        <p className="max-w-3xl text-sm leading-relaxed text-stone-700">Esta ação é irreversível. O acesso será bloqueado imediatamente. Só o tenant pessoal pode ser encerrado; vínculos ativos com espaços compartilhados impedem a solicitação até sua transferência ou saída.</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700"><li>Identidade: até {closure!.policy!.deadlines.identityHours} horas.</li><li>Conteúdo privado: até {closure!.policy!.deadlines.privateContentDays} dias.</li><li>Cópias de segurança: até {closure!.policy!.deadlines.backupDays} dias.</li>{closure!.policy!.retention.map((entry) => <li key={entry.category}>{retentionLabels[entry.category] ?? `${entry.category}: ${entry.disposition} (${entry.deadline})`}</li>)}</ul>
        <p className="max-w-3xl text-sm leading-relaxed text-stone-700">Saldo, cobranças, comprovantes e eventual reembolso seguem a política financeira e de retenção aplicável. O encerramento não apaga obrigações legais de guarda. Leia os <a className="underline hover:text-cognac-700" href="/legal/encerramento-de-conta.html">termos de encerramento</a> e a <a className="underline hover:text-cognac-700" href="/legal/retencao-pos-encerramento.html">política de destinação</a> antes de confirmar.</p>
        {closure!.stage === 'explanation' && <><label className="flex items-start gap-2 text-sm text-stone-800"><input type="checkbox" checked={closure!.personalConfirmed} onChange={(event) => onPersonalConfirmedChange?.(event.target.checked)} />Confirmo que desejo encerrar meu tenant pessoal e entendo que vínculos compartilhados podem impedir a operação.</label><button type="button" disabled={!closure!.personalConfirmed || busy !== null} onClick={onContinueClosure} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60">Continuar para confirmação de identidade</button></>}
        {closure!.stage === 'password' && <><p className="text-sm font-semibold text-stone-800">Etapa 2 de 3 · confirmação da identidade</p><label className="block max-w-lg space-y-1 text-sm text-stone-800">Confirme sua senha atual<input type="password" autoComplete="current-password" value={closure!.password} onChange={(event) => onClosurePasswordChange?.(event.target.value)} className="w-full rounded-lg border border-stone-300 bg-white p-2" /></label><button type="button" disabled={!closure!.password || busy !== null} onClick={onConfirmClosurePassword} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60">Confirmar senha</button></>}
        {closure!.stage === 'confirmation' && <><p className="text-sm font-semibold text-stone-800">Etapa 3 de 3 · confirmação irreversível</p><label className="block max-w-lg space-y-1 text-sm text-stone-800">Digite exatamente ENCERRAR MINHA CONTA<input type="text" autoComplete="off" value={closure!.confirmation} onChange={(event) => onClosureConfirmationChange?.(event.target.value)} className="w-full rounded-lg border border-stone-300 bg-white p-2" /></label><button type="button" disabled={!ready} onClick={onRequestClosure} className="btn-secondary border-red-300 text-red-800 disabled:cursor-not-allowed disabled:opacity-60">Solicitar encerramento</button></>}
      </>}
    </div></div></section>
  </div></div>;
};

export const AccountSecurityScreen: React.FC = () => {
  const { account, requestPasswordChange, signOut, signOutAfterClosure, reauthenticateForClosure } = useAuth();
  const [busy, setBusy] = useState<AccountSecurityViewProps['busy']>(null);
  const [message, setMessage] = useState<AccountSecurityViewProps['message']>(null);
  const [closure, setClosure] = useState<ClosureFormState>({ policy: null, loading: true, stage: 'explanation', personalConfirmed: false, password: '', confirmation: '' });
  const idempotencyKey = useRef<string | null>(null);
  const passwordProof = useRef<{ accessToken: string; confirmedAt: number } | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
        if (!data.session?.access_token) throw new Error('Sessão indisponível.');
        const policy = await getAccountClosurePolicy(data.session.access_token);
        if (active) setClosure((current) => ({ ...current, policy, loading: false }));
      } catch {
        if (active) setClosure((current) => ({ ...current, loading: false }));
      }
    })();
    return () => { active = false; };
  }, []);

  const requestChange = async () => {
    setBusy('password'); setMessage(null);
    try { await requestPasswordChange(); setMessage({ tone: 'success', text: 'Enviamos um link de uso único para alterar sua senha.' }); }
    catch (error) { setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível enviar o link.' }); }
    finally { setBusy(null); }
  };

  const endSession = async () => {
    setBusy('session'); setMessage(null);
    try { await signOut(); }
    catch (error) { setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível encerrar a sessão.' }); setBusy(null); }
  };

  const confirmClosurePassword = async () => {
    if (busy || closure.stage !== 'password' || !closure.password) return;
    setBusy('closure'); setMessage(null);
    try {
      ensureClosureReceiptStorage();
      const accessToken = await reauthenticateForClosure(closure.password);
      passwordProof.current = { accessToken, confirmedAt: Date.now() };
      setClosure((current) => ({ ...current, stage: 'confirmation', password: '' }));
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível confirmar a senha.' });
      setClosure((current) => ({ ...current, password: '' }));
    } finally { setBusy(null); }
  };

  const requestClosure = async () => {
    if (busy) return;
    const proof = passwordProof.current;
    if (closure.stage !== 'confirmation' || !proof || Date.now() - proof.confirmedAt > 240_000) {
      passwordProof.current = null;
      setClosure((current) => ({ ...current, stage: 'password', confirmation: '' }));
      setMessage({ tone: 'error', text: 'A confirmação de identidade expirou. Informe sua senha novamente.' });
      return;
    }
    setBusy('closure'); setMessage(null);
    try {
      idempotencyKey.current ??= crypto.randomUUID();
      await submitAccountClosure({ enabled: Boolean(closure.policy?.enabled), personalConfirmed: closure.personalConfirmed, accessToken: proof.accessToken, confirmation: closure.confirmation }, {
        request: requestAccountClosure,
        save: saveClosureReceipt,
        ensureStorage: ensureClosureReceiptStorage,
        signOut: signOutAfterClosure,
        navigate: () => { window.location.assign(routeForTab('account_closure_status').path); },
        idempotencyKey: idempotencyKey.current,
      });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível solicitar o encerramento.' });
    } finally {
      setClosure((current) => ({ ...current, confirmation: '' }));
      setBusy(null);
    }
  };

  return <AccountSecurityView email={account?.user.email} busy={busy} message={message} onRequestPasswordChange={() => void requestChange()} onSignOut={() => void endSession()} closure={closure} onPersonalConfirmedChange={(value) => setClosure((current) => ({ ...current, personalConfirmed: value }))} onClosurePasswordChange={(value) => setClosure((current) => ({ ...current, password: value }))} onClosureConfirmationChange={(value) => setClosure((current) => ({ ...current, confirmation: value }))} onContinueClosure={() => { if (closure.policy?.enabled && closure.personalConfirmed) setClosure((current) => ({ ...current, stage: 'password' })); }} onConfirmClosurePassword={() => void confirmClosurePassword()} onRequestClosure={() => void requestClosure()} />;
};
