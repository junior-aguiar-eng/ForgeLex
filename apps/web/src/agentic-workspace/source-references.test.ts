import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { SourceReferences } from './ContextSummary';
it('mostra vínculo, versão, hash e limite da identidade normativa sem afirmar aplicabilidade', () => {
  const html = renderToStaticMarkup(
    React.createElement(SourceReferences, {
      label: 'Fontes da afirmação',
      sourceIds: ['norm:1'],
      sources: [
        {
          id: 'norm:1',
          kind: 'NORM',
          versionId: 'snapshot-v1',
          contentHash: 'a'.repeat(64),
          identityStatus: 'CURATED_SNAPSHOT_NOT_APPLICABILITY',
          extent: 'PROVISION',
          url: 'https://www.planalto.gov.br/',
        },
      ],
      matterId: null,
      onRead: () => {},
    }),
  );
  expect(html).toContain('snapshot-v1');
  expect(html).toContain('a'.repeat(64));
  expect(html).toContain('não confirma aplicabilidade');
  expect(html).toContain('https://www.planalto.gov.br/');
});
it('referência ausente não toma emprestada uma fonte diferente', () => {
  const html = renderToStaticMarkup(
    React.createElement(SourceReferences, {
      label: 'Fontes da afirmação',
      sourceIds: ['absent'],
      sources: [{ id: 'other', kind: 'NORM', url: 'https://example.test/' }],
      matterId: null,
      onRead: () => {},
    }),
  );
  expect(html).toContain('Referência indisponível');
  expect(html).not.toContain('https://example.test/');
});
