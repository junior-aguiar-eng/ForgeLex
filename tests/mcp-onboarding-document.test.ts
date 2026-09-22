import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('contrato de onboarding MCP', () => {
  it('fixa públicos, cobrança, estados de conexão e privacidade dos eventos', () => {
    const document = readFileSync(resolve(process.cwd(), 'docs/product/mcp-onboarding.md'), 'utf8');

    expect(document).toContain('Advogado');
    expect(document).toContain('Desenvolvedor');
    expect(document).toContain('`research.search_case_law`');
    expect(document).toContain('R$ 0,20');
    expect(document).toContain('`research.verify_authority`');
    expect(document).toContain('Conectado');
    expect(document).toContain('`connection_verified`');
    expect(document).toContain('número processual');
    expect(document).toContain('`Authorization`');
  });
});
