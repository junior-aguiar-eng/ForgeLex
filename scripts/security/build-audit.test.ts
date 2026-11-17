import { describe, expect, it } from 'vitest';
import { evaluateBuildAudit as evaluateAudit } from './evaluate-build-audit.mjs';

const evaluateBuildAudit = (input: unknown) => evaluateAudit(input, new Date('2026-10-09T12:00:00Z'));

const report = (advisories: unknown, high = 1, moderate = 0) => ({
  advisories,
  metadata: { vulnerabilities: { info: 0, low: 0, moderate, high, critical: 0 } },
});
const mitigated = {
  module_name: 'braces',
  github_advisory_id: 'GHSA-vfj7-8cjw-p6xm',
  severity: 'high',
  findings: [{ version: '3.0.3', paths: ['apps__web>tailwindcss>fast-glob>micromatch>braces'] }],
};

const picomatch = {
  module_name: 'picomatch',
  github_advisory_id: 'GHSA-fc5q-39xc-vjpf',
  severity: 'high',
  findings: [
    { version: '4.0.7', paths: ['.>@eslint-react/eslint-plugin>tinyglobby>fdir>picomatch'] },
    { version: '2.3.2', paths: ['apps__web>tailwindcss>chokidar>anymatch>picomatch'] },
  ],
};

describe('complete build dependency audit gate', () => {
  it('reports the explicitly mitigated advisory without treating it as patched upstream', () => {
    expect(evaluateBuildAudit(report({ 1: mitigated }))).toEqual({
      knownMitigated: [mitigated],
      actionable: [],
      reviewBefore: '2026-11-08T00:00:00Z',
    });
  });

  it('rejects a new high advisory even for the same dependency', () => {
    const newAlert = { ...mitigated, github_advisory_id: 'GHSA-new-alert' };
    expect(evaluateBuildAudit(report({ 1: mitigated, 2: newAlert }, 2)).actionable).toEqual([newAlert]);
  });

  it('does not accept the known id for a different dependency', () => {
    const newAlert = { ...mitigated, module_name: 'other-package' };
    expect(evaluateBuildAudit(report({ 1: newAlert })).actionable).toEqual([newAlert]);
  });

  it('rejects moderate alerts in development dependencies', () => {
    const newAlert = { module_name: 'build-tool', github_advisory_id: 'GHSA-another-alert', severity: 'moderate' };
    expect(evaluateBuildAudit(report({ 1: newAlert }, 0, 1)).actionable).toEqual([newAlert]);
  });

  it.each([{}, { error: { message: 'registry unavailable' } }, report(null), report({ 1: {} })])(
    'fails closed when the audit report is unavailable or malformed',
    (input) => {
      expect(() => evaluateBuildAudit(input)).toThrow();
    },
  );

  it('accepts a complete report with no advisories', () => {
    expect(evaluateBuildAudit(report({}, 0))).toEqual({ knownMitigated: [], actionable: [], reviewBefore: null });
  });

  it('requires review again when the temporary mitigation expires', () => {
    expect(evaluateAudit(report({ 1: mitigated }), new Date('2026-11-08T00:00:00Z')).actionable).toEqual([mitigated]);
  });

  it('rejects an empty advisory list when the registry reports a high vulnerability', () => {
    expect(() => evaluateBuildAudit(report({}))).toThrow();
  });

  it.each([
    'broken',
    null,
    {},
    { info: 0, low: 0, moderate: 0, high: -1, critical: 0 },
    { info: 0, low: 0, moderate: 0, high: 0.5, critical: 0 },
  ])('rejects invalid vulnerability counts', (counts) => {
    expect(() => evaluateBuildAudit({ advisories: {}, metadata: { vulnerabilities: counts } })).toThrow();
  });

  it.each([
    [{ version: '3.0.2', paths: ['new-build-tool>braces'] }],
    [
      { version: '3.0.3', paths: ['build>braces'] },
      { version: '3.0.2', paths: ['other>braces'] },
    ],
    [],
    undefined,
  ])('does not exempt occurrences outside the patched version', (findings) => {
    const uncovered = { ...mitigated, findings };
    expect(evaluateBuildAudit(report({ 1: uncovered })).actionable).toEqual([uncovered]);
  });

  describe('picomatch ReDoS (GHSA-fc5q-39xc-vjpf), no patched release published yet', () => {
    const before = new Date('2026-11-17T12:00:00Z');

    it('reports it as mitigated while the review date has not passed', () => {
      expect(evaluateAudit(report({ 1: picomatch }), before)).toMatchObject({
        knownMitigated: [picomatch],
        actionable: [],
      });
    });

    it('requires review again on the review date', () => {
      expect(evaluateAudit(report({ 1: picomatch }), new Date('2026-11-24T00:00:00Z')).actionable).toEqual([picomatch]);
    });

    it('rejects an occurrence in a version other than the two reviewed', () => {
      const other = {
        ...picomatch,
        findings: [...picomatch.findings, { version: '3.0.2', paths: ['new-tool>picomatch'] }],
      };
      expect(evaluateAudit(report({ 1: other }), before).actionable).toEqual([other]);
    });

    it('rejects an occurrence with no findings', () => {
      const none = { ...picomatch, findings: [] };
      expect(evaluateAudit(report({ 1: none }), before).actionable).toEqual([none]);
    });

    it('does not accept another advisory for the same package', () => {
      const other = { ...picomatch, github_advisory_id: 'GHSA-other-pico' };
      expect(evaluateAudit(report({ 1: other }), before).actionable).toEqual([other]);
    });

    it('does not accept the id with a higher severity', () => {
      const critical = { ...picomatch, severity: 'critical' };
      expect(
        evaluateAudit(
          {
            advisories: { 1: critical },
            metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 1 } },
          },
          before,
        ).actionable,
      ).toEqual([critical]);
    });

    it('exposes the review date of each mitigation', () => {
      expect(evaluateAudit(report({ 1: picomatch }), before).knownMitigated[0]).toBe(picomatch);
      expect(evaluateAudit(report({ 1: picomatch }), before).reviewBefore).toBe('2026-11-24T00:00:00Z');
    });
  });
});
