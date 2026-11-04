import { expect, it } from 'vitest';
import { safeAgentFailure, safeAgentFailureDetails } from './agent-failure.js';
it('classifies nested transport, schema and resource failures without retaining private text', () => {
  const error = new Error('private prompt', { cause: Object.assign(new Error('secret URL'), { code: 'ECONNRESET' }) });
  expect(safeAgentFailure(error)).toMatchObject({ failureClass: 'TRANSIENT_TRANSPORT', transportCode: 'ECONNRESET' });
  expect(safeAgentFailure({ name: 'ZodError', message: 'private document' })).toMatchObject({
    failureClass: 'CONTRACT',
  });
  expect(safeAgentFailure(new Error('BUDGET_EXCEEDED'))).toMatchObject({ failureClass: 'RESOURCE_LIMIT' });
  expect(
    safeAgentFailure(Object.assign(new Error('COMMERCIAL_HTTP_FAILED'), { status: 503, requestId: 'req_abc123' })),
  ).toMatchObject({ failureClass: 'TRANSIENT_TRANSPORT', httpStatus: 503, requestId: 'req_abc123' });
  expect(JSON.stringify(safeAgentFailure(error))).not.toMatch(/private|secret/);
  expect(
    safeAgentFailureDetails({
      errorType: 'Error',
      failureClass: 'secret',
      transportCode: 'secret',
      requestId: 'Bearer secret',
    }),
  ).toEqual({ errorType: 'Error' });
});
it('recognizes a nested budget error without retaining arbitrary messages or SDK details', () => {
  const error = new Error('Bearer private-key; document text', { cause: new Error('BUDGET_EXCEEDED') });
  expect(safeAgentFailure(error)).toEqual({
    errorType: 'Error',
    failureCode: 'BUDGET_EXCEEDED',
    failureClass: 'RESOURCE_LIMIT',
  });
  expect(
    safeAgentFailureDetails({ errorType: 'private-key', failureCode: 'secret document', stack: 'private prompt' }),
  ).toEqual({ errorType: 'OTHER' });
  const cycle: any = { name: 'Unknown', message: 'sensitive' };
  cycle.cause = cycle;
  expect(safeAgentFailure(cycle)).toEqual({ errorType: 'OTHER' });
});

it('retains allowlisted correlation and stage but rejects arbitrary diagnostic text', () => {
  const id = '11111111-2222-4333-8444-555555555555';
  const diagnostic = safeAgentFailure({ name: 'Error', clientRequestId: id, status: 200, failureStage: 'PARSE_USAGE' });
  expect(safeAgentFailureDetails(diagnostic as any)).toEqual({
    errorType: 'Error',
    clientRequestId: id,
    httpStatus: 200,
    failureStage: 'PARSE_USAGE',
  });
  expect(
    safeAgentFailureDetails({ clientRequestId: 'private prompt', failureStage: 'private prompt', httpStatus: 999 }),
  ).toEqual({ errorType: 'OTHER' });
});

it('allows only bounded identifier diagnostics', () => {
  expect(
    safeAgentFailureDetails({ errorType: 'Error', publicField: 'statement', identifierHash: 'a'.repeat(64) }),
  ).toMatchObject({ publicField: 'statement', identifierHash: 'a'.repeat(64) });
  expect(safeAgentFailureDetails({ publicField: 'private text', identifierHash: 'private-id' })).toEqual({
    errorType: 'OTHER',
  });
});
