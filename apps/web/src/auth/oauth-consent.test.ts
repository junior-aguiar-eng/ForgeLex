import { describe, expect, it } from 'vitest';
import { authorizationIdFromSearch, safeOAuthRedirect } from './oauth-consent';

describe('autorização do conector', () => {
  it('exige um identificador válido e preserva o retorno após login', () => {
    expect(authorizationIdFromSearch('?authorization_id=123e4567-e89b-12d3-a456-426614174000')).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(authorizationIdFromSearch('?authorization_id=../token')).toBeNull();
    expect(authorizationIdFromSearch('')).toBeNull();
  });
  it('não permite redirecionar para esquemas executáveis ou endereços sem HTTPS', () => {
    expect(safeOAuthRedirect('javascript:alert(1)')).toBeNull();
    expect(safeOAuthRedirect('https://chatgpt.com/callback?code=example')).toBe('https://chatgpt.com/callback?code=example');
    expect(safeOAuthRedirect('https://user:password@example.com')).toBeNull();
  });
});
