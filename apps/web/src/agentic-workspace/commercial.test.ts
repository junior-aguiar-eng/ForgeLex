import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceClient } from './client';
import { CommercialPriceReview, CommercialReceiptDetails } from './CommercialPanel';
import { requestApi } from '../api-client';
import { statusText } from './execution-model';
import { Conversation } from './Conversation';
import { observeCommercialReceipt } from './commercial-receipt-observer';
import type { CommercialReceipt } from './commercial-model';

vi.mock('../api-client', () => ({ requestApi: vi.fn(), requestApiStream: vi.fn() }));
const quote = {
  currency: 'BRL' as const,
  policyVersion: 'v1',
  minCostCents: 50,
  maxCostCents: 500,
  availableCents: 2000,
  dailyLimitCents: 2000,
  monthlyLimitCents: 10000,
};
beforeEach(() => vi.mocked(requestApi).mockReset());
it('consulta preço e comprovante sem iniciar nem debitar trabalho', async () => {
  const client = new WorkspaceClient();
  await client.commercialQuote();
  await client.commercialReceipt('work/1');
  expect(requestApi).toHaveBeenNthCalledWith(1, '/api/agentic/commercial/quote', {}, { sessionOnly: true });
  expect(requestApi).toHaveBeenNthCalledWith(
    2,
    '/api/agentic/commercial/executions/work%2F1/receipt',
    {},
    { sessionOnly: true },
  );
});
it('envia autorização versionada e preserva a chave nas tentativas e continuações', async () => {
  const client = new WorkspaceClient(),
    authorization = { confirmed: true as const, policyVersion: 'v1' };
  for (let i = 0; i < 2; i++) await client.commercialStart({ objective: 'Conferir', ...authorization }, 'same-key');
  await client.continue('work', 'next-key', authorization);
  const calls = vi.mocked(requestApi).mock.calls;
  expect(calls[0]).toEqual(calls[1]);
  expect(calls[0][0]).toBe('/api/agentic/commercial/executions');
  expect(JSON.parse(calls[0][1]!.body as string)).toEqual({ objective: 'Conferir', ...authorization });
  expect(calls[0][1]!.headers).toEqual({ 'Idempotency-Key': 'same-key' });
  expect(JSON.parse(calls[2][1]!.body as string)).toEqual(authorization);
});
it('exibe o preço e uma ação clara antes da autorização, sem detalhes internos', () => {
  const html = renderToStaticMarkup(
    React.createElement(CommercialPriceReview, { quote, busy: false, onConfirm: () => {} }),
  );
  expect(html).toMatch(/Este trabalho custa até R\$\s*5,00/);
  expect(html).toContain('O saldo não utilizado será liberado');
  expect(html).toContain('Iniciar trabalho');
  expect(html).toContain('serão enviados à OpenAI para processamento');
  expect(html).toContain('href="/legal/privacidade.html"');
  expect(html.indexOf('serão enviados à OpenAI')).toBeLessThan(html.indexOf('Iniciar trabalho'));
  expect(html).not.toMatch(/USD|token|gpt-|policyVersion|framework/i);
  const unavailable = renderToStaticMarkup(
    React.createElement(CommercialPriceReview, {
      quote: { ...quote, availableCents: 499 },
      busy: false,
      onConfirm: () => {},
    }),
  );
  expect(unavailable).toContain('disabled');
  expect(unavailable).toContain('Saldo insuficiente');
});
it('comprovante distingue reserva, cobrança e liberação em reais', () => {
  const html = renderToStaticMarkup(
    React.createElement(CommercialReceiptDetails, {
      receipt: { currency: 'BRL', reservedCents: 500, chargedCents: 50, releasedCents: 450, status: 'COMPLETED' },
    }),
  );
  expect(html).toContain('Reservado');
  expect(html).toContain('Cobrado');
  expect(html).toContain('Liberado');
  expect(html).toContain('0,50');
  expect(html).toContain('4,50');
  expect(html).not.toContain('COMPLETED');
});
it('limites comerciais mostram uma orientação compreensível e preservam o pedido', () => {
  expect(statusText('FAILED', 'COMMERCIAL_DAILY_LIMIT')).toContain('limite diário');
  expect(statusText('FAILED', 'COMMERCIAL_MONTHLY_LIMIT')).toContain('limite mensal');
  expect(statusText('FAILED', 'COMMERCIAL_EXECUTION_ACTIVE')).toContain('trabalho em andamento');
  expect(statusText('FAILED', 'COMMERCIAL_RECONCILIATION_REQUIRED')).toContain('conferência');
  expect(statusText('FAILED', 'COMMERCIAL_POLICY_MISMATCH')).toContain('preço');
});
it('comprovante mostra crédito expirado somente quando há valor expirado', () => {
  const receipt = {
    currency: 'BRL' as const,
    reservedCents: 500,
    chargedCents: 50,
    releasedCents: 350,
    expiredPromoCents: 100,
    status: 'COMPLETED',
  };
  const html = renderToStaticMarkup(React.createElement(CommercialReceiptDetails, { receipt }));
  expect(html).toContain('Crédito expirado');
  expect(html).toContain('1,00');
  expect(html).toContain('3,50');
  expect(
    renderToStaticMarkup(
      React.createElement(CommercialReceiptDetails, { receipt: { ...receipt, expiredPromoCents: 0 } }),
    ),
  ).not.toContain('Crédito expirado');
});
it('comprovante ativo deixa explícito que os valores ainda aguardam fechamento', () => {
  const html = renderToStaticMarkup(
    React.createElement(CommercialReceiptDetails, {
      receipt: { currency: 'BRL', reservedCents: 500, chargedCents: 0, releasedCents: 0, status: 'ACTIVE' },
    }),
  );
  expect(html).toContain('Valores em atualização');
});
it('consulta novamente reserva ativa até o fechamento mesmo sem novo evento de execução', async () => {
  vi.useFakeTimers();
  try {
    const active: CommercialReceipt = {
      currency: 'BRL',
      reservedCents: 500,
      chargedCents: 0,
      releasedCents: 0,
      status: 'ACTIVE',
    };
    const finalized: CommercialReceipt = { ...active, chargedCents: 50, releasedCents: 450, status: 'COMPLETED' };
    const read = vi.fn().mockResolvedValueOnce(active).mockResolvedValue(finalized),
      received = vi.fn(),
      failed = vi.fn();
    const stop = observeCommercialReceipt(read, received, failed);
    await vi.advanceTimersByTimeAsync(0);
    expect(received).toHaveBeenLastCalledWith(active);
    await vi.advanceTimersByTimeAsync(1500);
    expect(received).toHaveBeenLastCalledWith(finalized);
    await vi.advanceTimersByTimeAsync(30000);
    expect(read).toHaveBeenCalledTimes(2);
    expect(failed).not.toHaveBeenCalled();
    stop();
  } finally {
    vi.useRealTimers();
  }
});
it('falhas de comprovante têm tentativas limitadas e uma nova consulta pode recuperar', async () => {
  vi.useFakeTimers();
  try {
    const read = vi.fn().mockRejectedValue(new Error('offline')),
      received = vi.fn(),
      failed = vi.fn();
    const stop = observeCommercialReceipt(read, received, failed);
    await vi.advanceTimersByTimeAsync(30000);
    expect(read).toHaveBeenCalledTimes(3);
    expect(failed).toHaveBeenCalledTimes(1);
    stop();
    const receipt: CommercialReceipt = {
      currency: 'BRL',
      reservedCents: 500,
      chargedCents: 0,
      releasedCents: 500,
      status: 'CANCELLED',
    };
    read.mockResolvedValue(receipt);
    const retry = observeCommercialReceipt(read, received, failed);
    await vi.advanceTimersByTimeAsync(0);
    expect(received).toHaveBeenLastCalledWith(receipt);
    retry();
  } finally {
    vi.useRealTimers();
  }
});
it('troca de trabalho cancela a consulta antiga e ignora seu retorno tardio', async () => {
  let resolve!: (receipt: CommercialReceipt) => void;
  const oldReceived = vi.fn(),
    newReceived = vi.fn();
  const stopOld = observeCommercialReceipt(
    () =>
      new Promise<CommercialReceipt>((done) => {
        resolve = done;
      }),
    oldReceived,
    vi.fn(),
  );
  stopOld();
  const receipt: CommercialReceipt = {
    currency: 'BRL',
    reservedCents: 500,
    chargedCents: 50,
    releasedCents: 450,
    status: 'COMPLETED',
  };
  const stopNew = observeCommercialReceipt(async () => receipt, newReceived, vi.fn());
  resolve({ ...receipt, status: 'ACTIVE' });
  await Promise.resolve();
  expect(oldReceived).not.toHaveBeenCalled();
  expect(newReceived).toHaveBeenCalledWith(receipt);
  stopNew();
});
it('duas respostas históricas ficam bloqueadas enquanto a correção aguarda autorização', () => {
  const question = (id: string) => ({
    id,
    version: 1,
    contextRevision: 1,
    prompt: id,
    selection: 'free_text' as const,
    options: [],
    allowFreeText: true,
    allowUnknown: true,
    reason: '',
  });
  const messages = ['A', 'B'].flatMap((id) => [
    { id: `q-${id}`, role: 'assistant', createdAt: '', question: question(id) },
    {
      id: `a-${id}`,
      role: 'user',
      createdAt: '',
      answer: { questionId: id, questionVersion: 1, contextRevision: 1, selectedOptionIds: [], freeText: id },
    },
  ]);
  const html = renderToStaticMarkup(
    React.createElement(Conversation, {
      question: null,
      messages,
      busy: true,
      onAnswer: () => {},
      onCorrect: () => {},
    }),
  );
  expect(html.match(/disabled=""/g)).toHaveLength(2);
});
