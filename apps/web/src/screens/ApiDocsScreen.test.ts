import { describe, expect, it } from 'vitest';
import { developerWorkflow, snippets, operationalDisclosure, freeDocumentationRequest } from './ApiDocsScreen';

describe('documentação de API', () => {
  it('limita execução pela tela a leitura gratuita e nunca dispara pesquisas', () => {
    expect(freeDocumentationRequest('jurisprudencias')).toBeNull();
    expect(freeDocumentationRequest('verify_authority')).toBeNull();
    expect(JSON.parse(String(freeDocumentationRequest('mcp')?.init.body))).toMatchObject({ method: 'tools/list' });
    expect(freeDocumentationRequest('health')?.path).toBe('/healthz');
  });
  it('não inclui marcadores de patch nos exemplos cURL', () => {
    const curlExamples = Object.values(snippets).map((snippet) => snippet.curl);

    expect(curlExamples.some((example) => example.includes('\\n+'))).toBe(false);
  });

  it('atribui modelo e contexto ao host e limita a cobrança à busca STJ', () => {
    expect(operationalDisclosure).toContain('host fornece o modelo e o contexto');
    expect(operationalDisclosure).toContain('busca jurisprudencial no STJ');
    expect(operationalDisclosure).not.toContain('R$ 0,20');
    expect(operationalDisclosure).not.toContain('cartão salvo');
    expect(operationalDisclosure).not.toContain('recarga automática');
  });

  it('organiza o roteiro técnico e documenta respostas operacionais', () => {
    expect(developerWorkflow).toEqual([
      'Criar uma chave',
      'Listar tribunais',
      'Pesquisar jurisprudência',
      'Abrir autoridade',
      'Tratar erros 401, 402, 403, 409, 422, 429 e 503',
    ]);
  });
});
