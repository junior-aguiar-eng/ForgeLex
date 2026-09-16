import { describe, it, expect } from 'vitest';
import { CanonicalFixtureProvider } from './providers/canonical-fixture-provider.js';
import { SourceRouter } from './router/source-router.js';
import { LegalSourceProvider } from './contracts/legal-source-provider.js';
import { JurisprudenceDocument } from '@forgelex/legal-data';

describe('SourceRouter & Providers (Deduplicação e Roteamento de Jurisprudência)', () => {
  it('deve buscar precedentes qualificados através do CanonicalFixtureProvider', async () => {
    const provider = new CanonicalFixtureProvider();
    const results = await provider.search('LGPD dano moral');

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].court).toBe('STJ');
    expect(results[0].provenance.verified).toBe(true);
    expect(results[0].snapshot.contentHash.length).toBe(64);
  });

  it('deve reconciliar e eliminar duplicatas de múltiplos provedores através da dedupeKey', async () => {
    const router = new SourceRouter();
    const canonical = new CanonicalFixtureProvider();
    router.registerProvider(canonical);

    // Simula um segundo provedor (ex: conector de scraping ou API comercial)
    // que retorna o mesmo acórdão do STJ porém com data de descoberta mais recente
    const mockExternalProvider: LegalSourceProvider = {
      id: 'provider_commercial_scraper',
      name: 'Scraper Comercial STJ',
      isOfficial: false,
      supportsCourt: (court) => court.toUpperCase() === 'STJ',
      search: async () => {
        const baseDocs = await canonical.search('vazamento');
        return baseDocs.map((d) => ({
          ...d,
          id: 'duplicate_different_uuid',
          lastSeenAt: '2026-09-16T12:00:00.000Z', // Visto 12 horas depois
        }));
      },
    };

    router.registerProvider(mockExternalProvider);

    // Consulta que atinge ambos os provedores
    const results = await router.search('vazamento', { court: 'STJ' });

    // Invariante de ouro: Mesmo com 2 provedores retornando o acórdão,
    // o resultado final deve conter apenas 1 item único (deduplicado pela dedupeKey)
    expect(results.length).toBe(1);
    expect(results[0].court).toBe('STJ');
    expect(results[0].lastSeenAt).toBe('2026-09-16T12:00:00.000Z');
  });

  it('deve respeitar limites e filtros de tribunal', async () => {
    const router = new SourceRouter();
    router.registerProvider(new CanonicalFixtureProvider());

    const results = await router.search('dados', { court: 'STF', limit: 1 });
    expect(results.length).toBe(1);
    expect(results[0].court).toBe('STF');
  });
});
