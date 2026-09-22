import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccountClosureStatusView, isTerminalClosureStatus, receiptForDownload } from './AccountClosureStatusScreen';

describe('acompanhamento do encerramento', () => {
  const receipt = {
    closureId: 'closure-1',
    statusToken: 'flx_close_secret',
    requestedAt: '2026-09-22T00:00:00Z',
    policyVersion: '2026-09-22.v1' as const,
  };

  it('não expõe token e mostra referência de suporte em reconciliação', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AccountClosureStatusView, {
        receipt,
        status: {
          closureId: 'closure-1',
          status: 'RECONCILIATION_REQUIRED',
          requestedAt: receipt.requestedAt,
          updatedAt: receipt.requestedAt,
        },
      }),
    );
    expect(markup).toContain('closure-1');
    expect(markup).toContain('suporte');
    expect(markup).not.toContain(receipt.statusToken);
    expect(isTerminalClosureStatus('RECONCILIATION_REQUIRED')).toBe(true);
    expect(isTerminalClosureStatus('ACCESS_BLOCKED')).toBe(false);
  });

  it('só declara conclusão quando API informa COMPLETED', () => {
    const pending = renderToStaticMarkup(
      React.createElement(AccountClosureStatusView, {
        receipt,
        status: {
          closureId: 'closure-1',
          status: 'RETAINED_ONLY',
          requestedAt: receipt.requestedAt,
          updatedAt: receipt.requestedAt,
        },
      }),
    );
    expect(pending).not.toContain('Encerramento concluído');
    const complete = renderToStaticMarkup(
      React.createElement(AccountClosureStatusView, {
        receipt: {
          closureId: receipt.closureId,
          requestedAt: receipt.requestedAt,
          policyVersion: receipt.policyVersion,
          completedAt: receipt.requestedAt,
        },
        status: null,
      }),
    );
    expect(complete).toContain('Encerramento concluído');
    expect(complete).not.toContain(receipt.statusToken);
  });

  it('remove o token do arquivo mesmo se a limpeza local falhar após COMPLETED', () => {
    const status = {
      closureId: 'closure-1',
      status: 'COMPLETED' as const,
      requestedAt: receipt.requestedAt,
      updatedAt: receipt.requestedAt,
      completedAt: receipt.requestedAt,
    };
    expect(JSON.stringify(receiptForDownload(receipt, status))).not.toContain(receipt.statusToken);
    expect(receiptForDownload(receipt, status)).toMatchObject({
      closureId: receipt.closureId,
      completedAt: status.completedAt,
    });
  });
});
