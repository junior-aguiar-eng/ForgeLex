import { expect, it, vi } from 'vitest';
import { reportAgenticFailure } from './failure-log.js';
it('logs only allowed failure diagnostics, without free-form SDK messages or checkpoint content', () => {
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  try {
    reportAgenticFailure(
      'agentic.execution.failed',
      Object.assign(new Error('OPENAI_AGENT_ERROR'), {
        diagnostic: {
          errorType: 'Error',
          failureClass: 'TRANSIENT_TRANSPORT',
          httpStatus: 503,
          requestId: 'req_synthetic',
          prompt: 'private',
          role: 'legal-orchestrator',
        },
        checkpoint: { private: 'case' },
      }),
    );
    const log = JSON.parse(String(write.mock.calls[0][0]));
    expect(log.diagnostic).toMatchObject({
      failureClass: 'TRANSIENT_TRANSPORT',
      httpStatus: 503,
      requestId: 'req_synthetic',
    });
    expect(JSON.stringify(log)).not.toMatch(/private|checkpoint|prompt/);
  } finally {
    write.mockRestore();
  }
});
