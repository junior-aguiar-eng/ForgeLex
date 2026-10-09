import { readFileSync } from 'node:fs';
import { evaluateBuildAudit } from './evaluate-build-audit.mjs';

try {
  const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const result = evaluateBuildAudit(report);
  const summarize = (alert) => ({ package: alert.module_name, id: alert.github_advisory_id, severity: alert.severity });
  process.stdout.write(
    JSON.stringify({
      knownMitigated: result.knownMitigated.map(summarize),
      actionable: result.actionable.map(summarize),
      mitigationReviewBefore: '2026-11-08T00:00:00Z',
    }) + '\n',
  );
  if (result.actionable.length > 0) process.exitCode = 1;
} catch {
  process.stderr.write('BUILD_AUDIT_REPORT_INVALID\n');
  process.exitCode = 1;
}
