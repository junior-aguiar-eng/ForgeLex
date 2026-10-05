import { z } from 'zod';
export interface OAuthApplication {
  clientId: string;
  displayName: string;
  grantedAt: string;
}
export interface OAuthClientDirectory {
  list(sessionBearer: string): Promise<OAuthApplication[]>;
}
const grants = z
  .array(
    z.object({
      client: z.object({ id: z.string().min(1), name: z.string().optional() }),
      granted_at: z.string().datetime(),
    }),
  )
  .max(1000);
export class SessionOAuthClientDirectory implements OAuthClientDirectory {
  constructor(
    private readonly baseUrl: string,
    private readonly publishableKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}
  async list(sessionBearer: string): Promise<OAuthApplication[]> {
    try {
      const response = await this.fetchImpl(this.baseUrl.replace(/\/$/, '') + '/auth/v1/user/oauth/grants', {
        headers: { apikey: this.publishableKey, Authorization: 'Bearer ' + sessionBearer },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error();
      return grants
        .parse(await response.json())
        .map((g) => ({
          clientId: g.client.id,
          displayName: g.client.name || 'Aplicativo autorizado',
          grantedAt: g.granted_at,
        }));
    } catch {
      throw new Error('OAUTH_DIRECTORY_UNAVAILABLE: Não foi possível consultar os aplicativos autorizados.');
    }
  }
}
