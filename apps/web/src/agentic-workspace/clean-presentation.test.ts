import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ResultCard } from './ResultCard';
import { SideTable } from './SideTable';
import { presentDelivery } from './present-delivery';
import type { Delivery, Execution } from './execution-model';

const delivery: Delivery = {
  id: 'delivery-1',
  delivery: {
    action: 'create_document',
    status: 'LIMITED',
    humanReviewRequired: true,
    legalAssessment: 'NOT_EVALUATED',
    issues: [],
    claims: [],
    requirements: [],
    findings: [
      {
        id: 'UNSUPPORTED_SECTION:1',
        code: 'UNSUPPORTED_SECTION',
        statement: 'Fundamentos',
        severity: 'BLOCKING',
        sourceIds: [],
      },
      {
        id: 'LEGAL_APPLICABILITY_NOT_EVALUATED:2',
        code: 'LEGAL_APPLICABILITY_NOT_EVALUATED',
        statement: 'x',
        severity: 'BLOCKING',
        sourceIds: [],
      },
    ],
    sources: [
      {
        id: 'doc-1',
        kind: 'DOCUMENT',
        documentId: 'document-id-123',
        versionId: 'version-id-456',
        contentHash: 'deadbeefcafe0123456789',
        extent: 'EXCERPT',
      },
      {
        id: 'norm-1',
        kind: 'NORM',
        versionId: 'norm-version-789',
        contentHash: 'feedfacefeed9876543210',
        identityStatus: 'CURATED_SNAPSHOT_NOT_APPLICABILITY',
      },
    ],
    document: {
      title: 'Requerimento',
      documentType: 'x',
      sections: [{ title: 'Fatos', content: 'A parte relata o fato.', sourceIds: ['doc-1', 'norm-1'] }],
    },
  },
};
const run = {
  id: 'execution-id-999',
  matterId: 'matter-id-111',
  history: [],
  context: {
    text: 'Contexto',
    origin: 'USER',
    documents: [{ documentId: 'document-id-123', versionId: 'version-id-456' }],
  },
} as unknown as Execution;
const technical =
  /deadbeef|feedface|version-id|norm-version|document-id|execution-id|matter-id|UNSUPPORTED_SECTION|LEGAL_APPLICABILITY|hash|CURATED_SNAPSHOT/i;

it('apresenta a ressalva concreta nos pontos a conferir sem expor classificação de orquestração', () => {
  const statement = 'O pagamento não foi demonstrado; não concluir quitação.';
  const item = {
    ...delivery.delivery,
    findings: [
      {
        id: 'DELIVERY_INFORMATION_LIMITED:internal',
        code: 'DELIVERY_INFORMATION_LIMITED',
        statement,
        severity: 'BLOCKING',
        sourceIds: ['doc-1'],
      },
    ],
  };
  const view = presentDelivery(item);
  expect(view.pending).toEqual([statement]);
  const noop = () => {};
  const side = renderToStaticMarkup(
    React.createElement(SideTable, {
      tab: 'pending',
      onTab: noop,
      onClose: noop,
      view,
      activeSource: null,
      run,
      context: run.context,
      titles: {},
      onRead: noop,
      onEditor: noop,
    }),
  );
  expect(side).toContain(statement);
  expect(side).not.toMatch(/DELIVERY_INFORMATION_LIMITED|deliveryImpact|BLOCKING|LIMITATION|orchestrator/);
  expect(side).not.toMatch(technical);
});

it('mostra texto aprovado e trechos apenas nas fontes, sem controles ou metadados novos', () => {
  const item = {
    ...delivery.delivery,
    sources: [
      {
        id: 'approved-1',
        kind: 'CASE_FACT',
        approvedItem: {
          text: 'Pagamento alegado e contestado.',
          status: 'DISPUTED',
          receiptHash: 'deadbeef',
          decidedBy: 'internal-user',
          sources: [
            {
              documentId: 'document-id-123',
              versionId: 'version-id-456',
              anchorId: 'anchor-secret',
              quote: 'Recebimento contestado.',
              relation: 'CONTRADICTS',
            },
          ],
        },
      },
    ],
    document: {
      title: 'Minuta',
      documentType: 'x',
      sections: [{ title: 'Fatos', content: 'A parte alega pagamento.', sourceIds: ['approved-1'] }],
    },
  };
  const view = presentDelivery(item);
  expect(view.sources[0].label).toBe('Fato do caso');
  const side = renderToStaticMarkup(
    React.createElement(SideTable, {
      tab: 'sources',
      onTab: () => {},
      onClose: () => {},
      view,
      activeSource: 1,
      run,
      context: run.context,
      titles: {},
      onRead: () => {},
      onEditor: () => {},
    }),
  );
  expect(side).toContain('Pagamento alegado e contestado.');
  expect(side).toContain('Recebimento contestado.');
  expect(side).toContain('Abrir documento');
  expect(side).not.toMatch(technical);
  expect(side).not.toMatch(/internal-user|anchor-secret|Selecionar|snapshot|receiptHash/);
});

it('o resultado lido pelo advogado não expõe hash, versões, identificadores nem códigos internos', () => {
  const view = presentDelivery(delivery.delivery);
  const noop = () => {};
  const card = renderToStaticMarkup(
    React.createElement(ResultCard, {
      run,
      delivery,
      view,
      activeSource: null,
      onSource: noop,
      onPending: noop,
      onSources: noop,
      onEditor: noop,
    }),
  );
  expect(card).toContain('A parte relata o fato.');
  expect(card).toContain('2 pontos a conferir');
  expect(card).not.toMatch(technical);
  for (const tab of ['sources', 'pending', 'context'] as const) {
    const side = renderToStaticMarkup(
      React.createElement(SideTable, {
        tab,
        onTab: noop,
        onClose: noop,
        view,
        activeSource: 1,
        run,
        context: run.context,
        titles: { 'document-id-123': 'Contrato para leitura' },
        onRead: noop,
        onEditor: noop,
      }),
    );
    expect(side).not.toMatch(technical);
    if (tab === 'sources') expect(side).toContain('Contrato para leitura');
  }
});
