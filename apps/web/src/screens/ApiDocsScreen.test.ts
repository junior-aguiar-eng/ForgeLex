import { describe, expect, it } from 'vitest';
import { snippets } from './ApiDocsScreen';

describe('documentação de API', () => {
  it('não inclui marcadores de patch nos exemplos cURL', () => {
    const curlExamples = Object.values(snippets).map((snippet) => snippet.curl);

    expect(curlExamples.some((example) => example.includes('\\n+'))).toBe(false);
  });
});
