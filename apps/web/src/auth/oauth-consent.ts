export function authorizationIdFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get('authorization_id');
  return value && /^[a-zA-Z0-9_-]{16,128}$/.test(value) ? value : null;
}

// Destinos são devolvidos pelo servidor Auth depois de validar a URI do cliente.
// Esta verificação adicional impede esquemas executáveis e credenciais embutidas.
export function safeOAuthRedirect(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
