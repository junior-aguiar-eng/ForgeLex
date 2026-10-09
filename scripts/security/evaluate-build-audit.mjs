export function evaluateBuildAudit(report, now = new Date()) {
  if (
    !report ||
    report.error ||
    !report.metadata?.vulnerabilities ||
    !report.advisories ||
    typeof report.advisories !== 'object' ||
    Array.isArray(report.advisories)
  ) {
    throw new Error('BUILD_AUDIT_REPORT_INVALID');
  }
  const knownMitigated = [];
  const actionable = [];
  const severities = ['info', 'low', 'moderate', 'high', 'critical'];
  const counts = report.metadata.vulnerabilities;
  if (
    typeof counts !== 'object' ||
    Array.isArray(counts) ||
    severities.some((severity) => !Number.isInteger(counts[severity]) || counts[severity] < 0)
  ) {
    throw new Error('BUILD_AUDIT_REPORT_INVALID');
  }
  const observed = Object.fromEntries(severities.map((severity) => [severity, 0]));
  for (const advisory of Object.values(report.advisories)) {
    if (
      !advisory ||
      typeof advisory.module_name !== 'string' ||
      typeof advisory.github_advisory_id !== 'string' ||
      !severities.includes(advisory.severity)
    ) {
      throw new Error('BUILD_AUDIT_REPORT_INVALID');
    }
    observed[advisory.severity]++;
    const coveredVersions =
      Array.isArray(advisory.findings) &&
      advisory.findings.length > 0 &&
      advisory.findings.every((finding) => finding?.version === '3.0.3');
    if (
      advisory.module_name === 'braces' &&
      advisory.github_advisory_id === 'GHSA-vfj7-8cjw-p6xm' &&
      advisory.severity === 'high' &&
      coveredVersions &&
      now.getTime() < Date.parse('2026-11-08T00:00:00Z')
    ) {
      knownMitigated.push(advisory);
    } else if (['moderate', 'high', 'critical'].includes(advisory.severity)) {
      actionable.push(advisory);
    }
  }
  if (severities.some((severity) => observed[severity] !== counts[severity])) {
    throw new Error('BUILD_AUDIT_REPORT_INVALID');
  }
  return { knownMitigated, actionable };
}
