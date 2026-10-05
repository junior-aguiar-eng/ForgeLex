import { describe, it, expect } from 'vitest';
import { SessionOAuthClientDirectory } from './oauth-client-directory.js';
describe('Aplicativos OAuth', () => {
  it('directory_failure_fails_closed', async () => {
    const directory = new SessionOAuthClientDirectory(
      'https://auth.example',
      'public',
      async () => new Response('{}', { status: 503 }),
    );
    await expect(directory.list('session')).rejects.toThrow('OAUTH_DIRECTORY_UNAVAILABLE');
  });
  it('retorna somente metadados de concessões válidas da sessão', async () => {
    const directory = new SessionOAuthClientDirectory('https://auth.example', 'public', async (url, init) => {
      expect(String(url)).toBe('https://auth.example/auth/v1/user/oauth/grants');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer session' });
      return new Response(
        JSON.stringify([
          {
            client: { id: 'app', name: 'Aplicativo', secret: 'NEVER' },
            granted_at: '2026-10-05T10:00:00.000Z',
            scopes: ['email'],
          },
        ]),
      );
    });
    expect(await directory.list('session')).toEqual([
      { clientId: 'app', displayName: 'Aplicativo', grantedAt: '2026-10-05T10:00:00.000Z' },
    ]);
  });
});
