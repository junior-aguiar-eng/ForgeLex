import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)));

function fontes(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return fontes(caminho);
    return caminho.endsWith('.ts') && !caminho.endsWith('.test.ts') ? [caminho] : [];
  });
}

/** Infra compartilhada permitida, e só os símbolos de infraestrutura listados. */
const PERMITIDO: Record<string, readonly string[]> = {
  '@forgelex/agent-core': ['ToolRegistry', 'AgentTool', 'ToolExecutionContext'],
  '@forgelex/domain': ['DomainError', 'getErrorCode'],
  '@forgelex/persistence': ['runMigrations', 'assertMigrationsApplied', 'SqlMigration', 'Client'],
  '@forgelex/billing-ledger': ['LedgerService', 'encodeResultSnapshot', 'decodeResultSnapshot'],
};

describe('independência do produto atual', () => {
  const arquivos = fontes(raiz);

  it('só importa a infraestrutura compartilhada permitida', () => {
    expect(arquivos.length).toBeGreaterThan(5);
    for (const arquivo of arquivos) {
      const codigo = readFileSync(arquivo, 'utf8');
      for (const m of codigo.matchAll(/import\s+(?:type\s+)?(?:\{([^}]*)\}|\*\s+as\s+\w+|\w+)\s+from\s+'([^']+)'/g)) {
        const origem = m[2]!;
        if (origem.startsWith('.') || origem.startsWith('node:') || origem === 'zod') continue;
        expect(Object.keys(PERMITIDO), `${arquivo} importa ${origem}`).toContain(origem);
        const simbolos = (m[1] ?? '')
          .split(',')
          .map(
            (s) =>
              s
                .replace(/^\s*type\s+/, '')
                .trim()
                .split(/\s+as\s+/)[0]!,
          )
          .filter(Boolean);
        for (const simbolo of simbolos)
          expect(PERMITIDO[origem], `${arquivo}: ${origem} → ${simbolo}`).toContain(simbolo);
      }
    }
  });

  it('não referencia tools, bancos ou namespaces do produto atual', () => {
    const proibidos = [
      /@forgelex\/legal-tools/,
      /@forgelex\/legal-data/,
      /@forgelex\/source-/,
      /@forgelex\/mcp-server/,
      /\bresearch[._]\w+/,
      /\bcase[._](get|list|read)\w*/,
      /\bdraft[._]\w+/,
      /\bworkflow[._]\w+/,
      /jurisprudence/i,
      /getForgeLexBillingPolicy/,
      /\bmatters?\b/,
    ];
    for (const arquivo of arquivos) {
      const codigo = readFileSync(arquivo, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      for (const padrao of proibidos) expect(codigo, `${arquivo} casa ${padrao}`).not.toMatch(padrao);
    }
  });

  it('só toca tabelas com prefixo analise_ (e as de infraestrutura de saldo via LedgerService)', () => {
    for (const arquivo of arquivos) {
      const codigo = readFileSync(arquivo, 'utf8');
      for (const m of codigo.matchAll(
        /\b(?:FROM|INTO|UPDATE|TABLE(?: IF NOT EXISTS)?|INDEX [\w]+ ON)\s+([a-z_]+)\b/g,
      )) {
        expect(m[1], `${arquivo}`).toMatch(/^analise_/);
      }
    }
  });
});
