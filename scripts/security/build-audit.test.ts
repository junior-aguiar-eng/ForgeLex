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

describe('complete build dependency audit gate', () => {
  it('reports the explicitly mitigated advisory without treating it as patched upstream', () => {
    expect(evaluateBuildAudit(report({ 1: mitigated }))).toEqual({
      knownMitigated: [mitigated],
      actionable: [],
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
    expect(evaluateBuildAudit(report({}, 0))).toEqual({ knownMitigated: [], actionable: [] });
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
});
