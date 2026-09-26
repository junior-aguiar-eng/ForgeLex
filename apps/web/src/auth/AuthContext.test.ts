import { describe, expect, it, vi } from 'vitest';
import { reauthenticateClosureIdentity, signOutAfterClosure } from './AuthContext';

function jwt(amr: unknown): string {
  return `header.${btoa(JSON.stringify({ amr })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.signature`;
}

describe('reautenticação de encerramento', () => {
  const account = { id: 'person-1', email: 'person@example.test' };

  it('exige senha da identidade corrente e JWT recente com amr=password', async () => {
    const token = jwt([{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }]);
    const auth = {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: account.id }, access_token: 'old' } } }),
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: { id: account.id }, session: { user: { id: account.id }, access_token: token } },
        error: null,
      }),
    };
    await expect(reauthenticateClosureIdentity(auth, account, 'correct-password')).resolves.toBe(token);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: account.email, password: 'correct-password' });
  });

  it('rejeita senha incorreta, identidade divergente, sessão ausente e amr sem senha', async () => {
    const auth = {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: account.id } } } }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: new Error('bad') }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    };
    await expect(reauthenticateClosureIdentity(auth, account, 'bad')).rejects.toThrow();
    auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    await expect(reauthenticateClosureIdentity(auth, account, 'any')).rejects.toThrow();
    auth.signInWithPassword.mockResolvedValueOnce({
      data: {
        user: { id: 'other' },
        session: {
          user: { id: 'other' },
          access_token: jwt([{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }]),
        },
      },
      error: null,
    });
    await expect(reauthenticateClosureIdentity(auth, account, 'any')).rejects.toThrow();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    auth.signInWithPassword.mockResolvedValueOnce({
      data: {
        user: { id: account.id },
        session: {
          user: { id: account.id },
          access_token: jwt([{ method: 'oauth', timestamp: Math.floor(Date.now() / 1000) }]),
        },
      },
      error: null,
    });
    await expect(reauthenticateClosureIdentity(auth, account, 'any')).rejects.toThrow();
  });

  it('faz apenas logout local depois da resposta 202', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    await signOutAfterClosure({ signOut });
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
