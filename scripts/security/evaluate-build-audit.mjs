// Advisories de dependências de desenvolvimento sem versão corrigida publicada, aceitas até a data de revisão. Só vale
// para o id, a gravidade e as versões listadas; qualquer ocorrência fora disso, ou depois da data, volta a reprovar.
const MITIGATIONS = [
  {
    module: 'braces',
    id: 'GHSA-vfj7-8cjw-p6xm',
    severity: 'high',
    versions: ['3.0.3'],
    reviewBefore: '2026-11-08T00:00:00Z',
  },
  // A correção anunciada (>=4.0.8) ainda não existe no npm. As duas versões vêm de ferramentas de desenvolvimento
  // (ESLint e Tailwind/chokidar); `pnpm audit --prod` segue limpo, então nada disso entra no produto.
  {
    module: 'picomatch',
    id: 'GHSA-fc5q-39xc-vjpf',
    severity: 'high',
    versions: ['2.3.2', '4.0.7'],
    reviewBefore: '2026-11-24T00:00:00Z',
  },
];

const covers = (entry, advisory, now) =>
  advisory.module_name === entry.module &&
  advisory.github_advisory_id === entry.id &&
  advisory.severity === entry.severity &&
  Array.isArray(advisory.findings) &&
  advisory.findings.length > 0 &&
  advisory.findings.every((finding) => entry.versions.includes(finding?.version)) &&
  now.getTime() < Date.parse(entry.reviewBefore);

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
  const reviewDates = [];
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
    const mitigation = MITIGATIONS.find((entry) => covers(entry, advisory, now));
    if (mitigation) {
      knownMitigated.push(advisory);
      reviewDates.push(mitigation.reviewBefore);
    } else if (['moderate', 'high', 'critical'].includes(advisory.severity)) {
      actionable.push(advisory);
    }
  }
  if (severities.some((severity) => observed[severity] !== counts[severity])) {
    throw new Error('BUILD_AUDIT_REPORT_INVALID');
  }
  return { knownMitigated, actionable, reviewBefore: reviewDates.sort()[0] ?? null };
}
