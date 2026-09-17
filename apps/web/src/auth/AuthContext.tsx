import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiRequestError, requestApi } from '../api-client';
import { supabase } from './supabase-client';
import type { Session } from '@supabase/supabase-js';

export interface ForgeLexAccount {
  user: {
    id: string;
    email: string;
    displayName: string;
    status: 'ACTIVE' | 'DISABLED';
    createdAt: string;
  };
  workspace: {
    id: string;
    name: string;
    status: 'ACTIVE' | 'DISABLED';
    createdAt: string;
  };
  membership: {
    role: 'OWNER' | 'MEMBER';
    status: 'ACTIVE' | 'REVOKED';
  };
}

export type AuthStatus = 'loading' | 'signed_out' | 'authenticated' | 'legacy' | 'disabled' | 'expired' | 'error' | 'unconfigured';
export type AuthView = 'sign_in' | 'sign_up' | 'forgot_password' | 'confirmation' | 'reset_password';

interface AuthContextValue {
  status: AuthStatus;
  account?: ForgeLexAccount;
  passwordRecovery: boolean;
  signUp: (input: { displayName: string; email: string; password: string }) => Promise<{ confirmationRequired: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function hasLegacyApiToken(): boolean {
  if (import.meta.env.VITE_FORGELEX_API_TOKEN) return true;
  try {
    return Boolean(window.localStorage.getItem('forgelex_api_token'));
  } catch {
    return false;
  }
}

function friendlySupabaseError(error: unknown, fallback: string): Error {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('password') && (message.includes('12') || message.includes('weak'))) {
    return new Error('Escolha uma senha com pelo menos 12 caracteres.');
  }
  if (message.includes('email not confirmed') || message.includes('not confirmed')) {
    return new Error('Confirme seu e-mail antes de entrar.');
  }
  return new Error(fallback);
}

function accountDisplayName(session: Session): string {
  const metadataName = session.user.user_metadata?.full_name;
  return typeof metadataName === 'string' && metadataName.trim().length >= 2
    ? metadataName.trim()
    : session.user.email?.split('@')[0] ?? 'Usuário ForgeLex';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>(supabase ? 'loading' : hasLegacyApiToken() ? 'legacy' : 'unconfigured');
  const [account, setAccount] = useState<ForgeLexAccount>();
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const loadAccount = useCallback(async (session: Session): Promise<void> => {
    try {
      await requestApi('/api/v2/auth/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ displayName: accountDisplayName(session) }),
      }, { sessionOnly: true });
      const currentAccount = await requestApi<ForgeLexAccount>('/api/v2/auth/me', undefined, { sessionOnly: true });
      setAccount(currentAccount);
      setStatus('authenticated');
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'ACCOUNT_DISABLED') {
        setStatus('disabled');
      } else if (error instanceof ApiRequestError && error.status === 401) {
        setStatus('expired');
      } else if (error instanceof ApiRequestError && error.status >= 500) {
        setStatus('error');
      } else {
        setStatus('signed_out');
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        void loadAccount(data.session).catch(() => undefined);
      } else {
        setStatus('signed_out');
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT' || !session) {
        setAccount(undefined);
        setStatus('signed_out');
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        void loadAccount(session).catch(() => undefined);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadAccount]);

  const signUp = useCallback(async (input: { displayName: string; email: string; password: string }) => {
    if (!supabase) throw new Error('O acesso ainda não está configurado neste ambiente.');
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: { data: { full_name: input.displayName.trim() } },
    });
    if (error) throw friendlySupabaseError(error, 'Não foi possível criar seu acesso. Confira os dados e tente novamente.');
    if (!data.session) {
      setStatus('signed_out');
      return { confirmationRequired: true };
    }
    await loadAccount(data.session);
    return { confirmationRequired: false };
  }, [loadAccount]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('O acesso ainda não está configurado neste ambiente.');
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error || !data.session) throw friendlySupabaseError(error, 'Não foi possível entrar. Confira seus dados.');
    await loadAccount(data.session);
  }, [loadAccount]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setAccount(undefined);
    setPasswordRecovery(false);
    setStatus(supabase ? 'signed_out' : 'unconfigured');
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    if (!supabase) throw new Error('O acesso ainda não está configurado neste ambiente.');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: window.location.origin });
    if (error) throw friendlySupabaseError(error, 'Não foi possível enviar a mensagem. Tente novamente em instantes.');
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) throw new Error('O acesso ainda não está configurado neste ambiente.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw friendlySupabaseError(error, 'Não foi possível atualizar sua senha.');
    setPasswordRecovery(false);
    const { data } = await supabase.auth.getSession();
    if (data.session) await loadAccount(data.session);
  }, [loadAccount]);

  const value = useMemo(() => ({ status, account, passwordRecovery, signUp, signIn, signOut, sendPasswordReset, updatePassword }), [
    status,
    account,
    passwordRecovery,
    signUp,
    signIn,
    signOut,
    sendPasswordReset,
    updatePassword,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
