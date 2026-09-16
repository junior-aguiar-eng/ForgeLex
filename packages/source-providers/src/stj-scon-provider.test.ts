import { describe, expect, it, vi } from 'vitest';
import { StjSconProvider, parseStjSconResults } from './providers/stj-scon-provider.js';
import { SourceRouter } from './router/source-router.js';

const officialResultHtml = `
  <html><body>
    <article class="resultado-acordao">
      <a href="/SCON/GetInteiroTeorDoAcordao?num_registro=202401234567">REsp 2.147.374/SP</a>
      <div class="ementa">CIVIL E PROCESSUAL CIVIL. CONTRATO BANCÁRIO. REVISÃO DE ENCARGOS. EMENTA OFICIAL.</div>
      <p>Relator: Ministro Antonio Carlos Ferreira</p>
      <p>Órgão julgador: Quarta Turma</p>
      <p>Data do julgamento: 12/03/2025</p>
      <p>Data de publicação: 18/03/2025</p>
    </article>
  </body></html>
`;

describe('StjSconProvider', () => {
  it('deve converter o resultado HTML oficial em documento com proveniência e hash', () => {
    const pageUrl = 'https://scon.stj.jus.br/SCON/jurisprudencia/toc.jsp?livre=contrato';
    const results = parseStjSconResults(officialResultHtml, pageUrl);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      processNumber: 'REsp 2.147.374/SP',
      rapporteur: 'Ministro Antonio Carlos Ferreira',
      chamber: 'Quarta Turma',
      judgmentDate: '12/03/2025',
      publicationDate: '18/03/2025',
    });
  });

  it('deve consultar a URL do SCON e preservar a seleção oficial', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => officialResultHtml,
    }));
    const provider = new StjSconProvider({ fetch: fetcher, timeoutMs: 1000 });
    const router = new SourceRouter();
    router.registerProvider(provider);

    const results = await router.search('contrato bancário', { court: 'STJ', limit: 1 });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toContain('/SCON/jurisprudencia/toc.jsp');
    expect(results[0].provenance.source.provider).toBe('provider_stj_scon');
    expect(results[0].provenance.source.sourceUrl).toContain('GetInteiroTeorDoAcordao');
    expect(results[0].snapshot.contentHash).toHaveLength(64);

    const verification = await provider.verifyAuthority({
      court: 'STJ',
      processNumber: 'REsp 2.147.374/SP',
      judgmentDate: '2025-03-12',
    });
    expect(verification.status).toBe('VERIFIED_OFFICIAL');
  });

  it('deve falhar fechado quando a página protegida não contém resultados reconhecíveis', () => {
    expect(() => parseStjSconResults('<html><title>Checking your browser</title></html>', 'https://scon.stj.jus.br/'))
      .toThrow('SOURCE_PROVIDER_PARSE_FAILED');
  });
});
