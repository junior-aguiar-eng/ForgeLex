import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Credenciais nativas nunca são entregues ao host. AES-GCM vincula o envelope
 * ao recurso canônico e autentica seu conteúdo antes de qualquer uso. */
export class OAuthTokenVault {
  private readonly key: Buffer;
  public constructor(key: string, private readonly resource: string) {
    this.key = Buffer.from(key, 'base64');
    if (this.key.length !== 32) throw new Error('MCP_OAUTH_ENCRYPTION_KEY_INVALID');
  }
  public seal(upstream: string, kind: 'access' | 'refresh' | 'client' | 'authorization' | 'code', expiresAt: number | null): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(Buffer.from(this.resource));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify({ upstream, kind, expiresAt }), 'utf8'), cipher.final()]);
    return `flx_oauth_v1.${Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64url')}`;
  }
  public open(token: string, kind: 'access' | 'refresh' | 'client' | 'authorization' | 'code'): string | null {
    if (!token.startsWith('flx_oauth_v1.') || token.length > 32768) return null;
    try {
      const bytes = Buffer.from(token.slice('flx_oauth_v1.'.length), 'base64url');
      if (bytes.length < 29) return null;
      const decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      decipher.setAAD(Buffer.from(this.resource));
      const data = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
      if (data.kind !== kind || typeof data.upstream !== 'string' || !data.upstream) return null;
      if (['access', 'authorization', 'code'].includes(kind) && (typeof data.expiresAt !== 'number' || data.expiresAt <= Date.now())) return null;
      return data.upstream;
    } catch { return null; }
  }
}
