import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const base = 'docs/architecture/evidence/2026-11-04-v9-multi-consolidation';
const manifest = JSON.parse(readFileSync(base + '/decisions.json'));
const folder = mkdtempSync(join(tmpdir(), 'forgelex-multi-'));
const invoke = (m, o) =>
  spawnSync(process.execPath, ['scripts/forgelex-final-evaluation/consolidate-recorded-v9.mjs', m, o], {
    encoding: 'utf8',
  });
const target = join(folder, 'result.json');
let r = invoke(base + '/decisions.json', target);
assert.equal(r.status, 0, r.stderr);
const out = JSON.parse(readFileSync(target));
const original = JSON.parse(readFileSync(manifest.sourceFiles[0].file)).delivery;
assert.deepEqual(out.derivedCounts, { claims: 8, requirements: 7, findings: 16 });
assert.deepEqual(out.delivery.review.original, original.review.original);
assert.equal(out.paidModelCalls, 0);
assert.equal(out.delivery.status, 'LIMITED');
for (const id of ['3dedd4e1b8:c3', '36d893ac97:p1', '36d893ac97:p2', '3dedd4e1b8:c5', '36d893ac97:p4'])
  assert.deepEqual(
    out.delivery.claims.find((c) => c.id === id),
    original.claims.find((c) => c.id === id),
  );
for (const id of ['36d893ac97:r2', '36d893ac97:r3', '3dedd4e1b8:r3', '36d893ac97:r4', '156f284522:r3'])
  assert.deepEqual(
    out.delivery.requirements.find((c) => c.id === id),
    original.requirements.find((c) => c.id === id),
  );
for (const g of manifest.groups)
  assert.deepEqual(
    out.delivery.review.provenance.find((p) => p.kind === g.kind && p.id === g.retainedId).originIds,
    g.memberIds,
  );
const warnings = out.delivery.findings.filter((f) => f.code === 'CITATION_WITHOUT_SUPPORT');
assert.equal(warnings.length, 2);
assert.deepEqual(
  warnings.map((w) => w.sourceIds.length),
  [2, 2],
);
const composite = original.supportAudit.filter((a) => ['3dedd4e1b8:c3', '3dedd4e1b8:c5'].includes(a.claimId));
assert.deepEqual(
  out.delivery.supportAudit.filter((a) => ['3dedd4e1b8:c3', '3dedd4e1b8:c5'].includes(a.claimId)),
  composite,
);
assert.notEqual(invoke(base + '/decisions.json', target).status, 0);
const changed = structuredClone(manifest);
changed.sourceFiles[0].sha256 = '0'.repeat(64);
const bad = join(folder, 'bad.json');
writeFileSync(bad, JSON.stringify(changed));
assert.notEqual(invoke(bad, join(folder, 'bad-output.json')).status, 0);
const incompatible = structuredClone(manifest);
incompatible.groups.push({
  kind: 'claim',
  retainedId: '3dedd4e1b8:c5',
  memberIds: ['3dedd4e1b8:c5', '36d893ac97:p4'],
  reason: 'Negative test: different scope/sources',
});
const invalid = join(folder, 'invalid.json');
writeFileSync(invalid, JSON.stringify(incompatible));
r = invoke(invalid, join(folder, 'invalid-output.json'));
assert.notEqual(r.status, 0);
assert.match(r.stderr, /CONSOLIDATION_INCOMPATIBLE/);
console.log(
  'PASS: actual V2-MULTI consolidation, provenance, differences, support, zero calls, no overwrite, hash and source mismatch guards',
);
