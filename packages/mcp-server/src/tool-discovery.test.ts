import { describe, expect, it } from 'vitest';
import { isResearchPresentationTool } from '@forgelex/legal-tools';
import { EXTERNAL_MCP_TOOL_NAMES } from './external-tool-pack.js';
import { MCP_TOOL_DISCOVERY_HINTS, withDiscoveryHint } from './tool-discovery.js';

/**
 * Modelo da busca dos hosts: palavras inteiras de uma consulta procuradas, sem diferenciar maiúscula e minúscula
 * mas diferenciando acento, no nome e na descrição. Foi o que se mediu no Claude (07/11/2026): `jurisprudencia`
 * e `jurisprudência` são buscas diferentes.
 */
function matches(query: string, tool: { name: string; description: string }): boolean {
  const haystack = `${tool.name} ${tool.description}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .some((word) => word.length > 2 && haystack.includes(word));
}

describe('dicas de descoberta das ferramentas', () => {
  it('só nomeia ferramentas que existem de fato, para um erro de digitação não passar em silêncio', () => {
    for (const name of Object.keys(MCP_TOOL_DISCOVERY_HINTS)) {
      expect(EXTERNAL_MCP_TOOL_NAMES.includes(name as never) || isResearchPresentationTool(name), name).toBe(true);
    }
  });

  it('toda dica diz ForgeLex e, nas de jurisprudência, traz a palavra com e sem acento', () => {
    for (const [name, hint] of Object.entries(MCP_TOOL_DISCOVERY_HINTS)) {
      expect(hint.startsWith('ForgeLex:'), name).toBe(true);
      if (name.startsWith('research.')) {
        expect(hint, name).toContain('jurisprudência');
        expect(hint, name).toContain('jurisprudencia');
      }
    }
  });

  it('mantém a descrição original intacta depois do prefixo, e não o repete', () => {
    const original = 'Pesquisa jurisprudência oficial e precedentes qualificados.';
    const once = withDiscoveryHint('research.search_case_law', original);
    expect(once.endsWith(original)).toBe(true);
    expect(once.startsWith(MCP_TOOL_DISCOVERY_HINTS['research.search_case_law']!)).toBe(true);
    expect(withDiscoveryHint('research.search_case_law', once)).toBe(once);
  });

  it('ferramenta sem dica própria ganha só "ForgeLex:" e não duplica o nome do produto', () => {
    expect(withDiscoveryHint('case.get_context', 'Lê o contexto aprovado.')).toBe('ForgeLex: Lê o contexto aprovado.');
    const already = 'Confirma o acesso ao ForgeLex sem consumir créditos.';
    expect(withDiscoveryHint('forgelex.connection_status', already)).toBe(already);
  });

  it('a busca em português, sem acento, acha a pesquisa do ForgeLex (antes só achava o enam-estudo)', () => {
    const search = {
      name: 'research.search_case_law',
      description: withDiscoveryHint(
        'research.search_case_law',
        'Pesquisa jurisprudência oficial e precedentes qualificados em tribunais superiores.',
      ),
    };
    for (const query of [
      'buscar jurisprudencia furto',
      'jurisprudencia',
      'jurisprudência',
      'pesquisa STJ',
      'forgelex',
    ]) {
      expect(matches(query, search), query).toBe(true);
    }
    // Sem o prefixo, a consulta sem acento não casava: é a regressão que este teste guarda.
    const antes = { name: search.name, description: 'Pesquisa jurisprudência oficial e precedentes qualificados.' };
    expect(matches('buscar jurisprudencia furto', antes)).toBe(false);
  });

  it('a busca pelo nome do produto acha qualquer ferramenta, em qualquer caixa', () => {
    const tool = { name: 'case.get_context', description: withDiscoveryHint('case.get_context', 'Lê o contexto.') };
    for (const query of ['forgelex', 'FORGELEX', 'ForgeLex']) expect(matches(query, tool), query).toBe(true);
  });
});
