import React, { useState } from 'react';
import { CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, Scale, UserRound } from 'lucide-react';
import { useAuth, type AuthStatus, type AuthView } from '../auth/AuthContext';

function inputError(value: string, label: string): string | undefined {
  return value.trim() ? undefined : `${label} é obrigatório.`;
}

const AuthScreen: React.FC<{ initialView?: AuthView; status: AuthStatus }> = ({ initialView = 'sign_in', status }) => {
  const { signUp, signIn, signOut, sendPasswordReset, updatePassword } = useAuth();
  const [view, setView] = useState<AuthView>(initialView);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const switchView = (nextView: AuthView) => {
    setView(nextView);
    setError('');
    setSuccess('');
    setPassword('');
    setPasswordConfirmation('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (view === 'confirmation') return;
    if (view === 'sign_up' && inputError(displayName, 'Nome')) return setError(inputError(displayName, 'Nome')!);
    if (view !== 'reset_password' && inputError(email, 'E-mail')) return setError(inputError(email, 'E-mail')!);
    if (view === 'sign_up' || view === 'reset_password') {
      if (password.length < 12) return setError('Escolha uma senha com pelo menos 12 caracteres.');
      if (password !== passwordConfirmation) return setError('As senhas precisam ser iguais.');
    }

    setBusy(true);
    try {
      if (view === 'sign_up') {
        const result = await signUp({ displayName, email, password });
        if (result.confirmationRequired) {
          setView('confirmation');
          setSuccess('Enviamos uma mensagem para confirmar seu e-mail.');
        }
      } else if (view === 'sign_in') {
        await signIn(email, password);
      } else if (view === 'forgot_password') {
        await sendPasswordReset(email);
        setSuccess('Se houver um acesso para este e-mail, enviaremos as instruções para recuperá-lo.');
      } else if (view === 'reset_password') {
        await updatePassword(password);
        setSuccess('Sua senha foi atualizada.');
        setView('sign_in');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível concluir a operação.');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'unconfigured') {
    return <AuthLayout><MessageState title="O acesso ainda não está disponível" body="Esta área ainda está sendo preparada. Tente novamente quando o acesso estiver liberado." /></AuthLayout>;
  }
  if (status === 'loading') {
    return <AuthLayout><MessageState title="Carregando seu acesso" body="Só um instante. Estamos preparando seu espaço." /></AuthLayout>;
  }
  if (status === 'error') {
    return <AuthLayout><MessageState title="Não foi possível carregar seu acesso" body="Tente novamente em instantes." action={<button type="button" className="btn-primary w-full" onClick={() => window.location.reload()}>Tentar novamente</button>} /></AuthLayout>;
  }
  if (status === 'disabled') {
    return <AuthLayout><MessageState title="Sua conta está indisponível" body="Procure o responsável pelo seu acesso para saber como continuar." /></AuthLayout>;
  }
  if (status === 'expired') {
    return <AuthLayout><MessageState title="Sua sessão terminou" body="Entre novamente para continuar." action={<button type="button" className="btn-primary w-full" onClick={() => { void signOut(); switchView('sign_in'); }}>Entrar novamente</button>} /></AuthLayout>;
  }
  if (view === 'confirmation') {
    return <AuthLayout><MessageState icon={<CheckCircle2 className="h-8 w-8 text-emerald-600" />} title="Confira seu e-mail" body="Enviamos um link para confirmar seu acesso. Depois de confirmar, volte aqui para entrar." action={<button type="button" className="btn-primary w-full" onClick={() => switchView('sign_in')}>Voltar para entrar</button>} /></AuthLayout>;
  }

  const isSignUp = view === 'sign_up';
  const isForgot = view === 'forgot_password';
  const isReset = view === 'reset_password';
  const title = isSignUp ? 'Crie seu acesso' : isForgot ? 'Recupere seu acesso' : isReset ? 'Escolha uma nova senha' : 'Entre no ForgeLex';
  const submitLabel = isSignUp ? 'Criar acesso' : isForgot ? 'Enviar instruções' : isReset ? 'Salvar nova senha' : 'Entrar';

  return (
    <AuthLayout>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-cognac-700 text-[#FBF9F5]"><Scale className="h-6 w-6" aria-hidden="true" /></div>
        <p className="eyebrow mb-2">ForgeLex</p>
        <h1 className="font-editorial text-3xl font-bold text-stone-900">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-stone-500">{isSignUp ? 'Um espaço simples para organizar seu trabalho jurídico.' : isForgot ? 'Enviaremos uma mensagem para ajudar você a voltar.' : isReset ? 'Use uma senha nova com pelo menos 12 caracteres.' : 'Acesse seu espaço de trabalho.'}</p>
      </div>

      {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-800">{error}</div>}
      {success && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-5 text-emerald-800">{success}</div>}

      <form className="space-y-4" onSubmit={submit}>
        {isSignUp && <Field icon={<UserRound className="h-4 w-4" />} label="Nome" value={displayName} onChange={setDisplayName} placeholder="Como podemos chamar você?" autoComplete="name" />}
        {!isReset && <Field icon={<Mail className="h-4 w-4" />} label="E-mail" value={email} onChange={setEmail} placeholder="voce@exemplo.com" type="email" autoComplete="email" />}
        {!isForgot && <div>
          <label className="mb-1.5 block text-sm font-semibold text-stone-700" htmlFor="forgelex-password">Senha</label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
            <input id="forgelex-password" className="input-control pr-11 pl-10" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isReset ? 'new-password' : isSignUp ? 'new-password' : 'current-password'} placeholder="Sua senha" />
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-stone-500 hover:bg-stone-100" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          {(isSignUp || isReset) && <p className="mt-1.5 text-xs text-stone-500">Pelo menos 12 caracteres.</p>}
        </div>}
        {(isSignUp || isReset) && <Field icon={<LockKeyhole className="h-4 w-4" />} label="Confirme a senha" value={passwordConfirmation} onChange={setPasswordConfirmation} type="password" autoComplete="new-password" placeholder="Digite novamente" />}
        <button type="submit" disabled={busy} className="btn-primary w-full disabled:cursor-wait disabled:opacity-60">{busy ? 'Aguarde…' : submitLabel}</button>
      </form>

      <div className="mt-6 space-y-3 text-center text-sm">
        {view === 'sign_in' && <><button type="button" className="font-semibold text-cognac-800 hover:underline" onClick={() => switchView('forgot_password')}>Esqueci minha senha</button><p className="text-stone-500">Ainda não tem acesso? <button type="button" className="font-semibold text-cognac-800 hover:underline" onClick={() => switchView('sign_up')}>Criar agora</button></p></>}
        {(isSignUp || isForgot) && <button type="button" className="font-semibold text-cognac-800 hover:underline" onClick={() => switchView('sign_in')}>Voltar para entrar</button>}
      </div>
      <p className="mt-8 text-center text-xs leading-5 text-stone-400">Confirmaremos seu e-mail para proteger o acesso. Sua senha não fica visível para o ForgeLex.</p>
    </AuthLayout>
  );
};

const Field: React.FC<{ icon: React.ReactNode; label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string; autoComplete?: string }> = ({ icon, label, value, onChange, placeholder, type = 'text', autoComplete }) => (
  <div>
    <label className="mb-1.5 block text-sm font-semibold text-stone-700" htmlFor={`forgelex-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{label}</label>
    <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden="true">{icon}</span><input id={`forgelex-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`} className="input-control pl-10" type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete} /></div>
  </div>
);

const AuthLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => <main className="flex min-h-screen items-center justify-center bg-[#FBF9F5] px-4 py-10"><section className="surface w-full max-w-md px-6 py-8 sm:px-10" aria-label="Acesso ao ForgeLex">{children}</section></main>;

const MessageState: React.FC<{ icon?: React.ReactNode; title: string; body: string; action?: React.ReactNode }> = ({ icon, title, body, action }) => <div className="text-center"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cognac-100 text-cognac-800">{icon ?? <Mail className="h-7 w-7" aria-hidden="true" />}</div><h1 className="font-editorial text-2xl font-bold text-stone-900">{title}</h1><p className="mt-3 text-sm leading-6 text-stone-500">{body}</p>{action && <div className="mt-6">{action}</div>}</div>;

export default AuthScreen;
