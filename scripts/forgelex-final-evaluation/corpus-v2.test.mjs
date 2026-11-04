import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sources, dossiers, scenarios, proposal, additions } from './corpus-v2.mjs';
import { dossiers as original } from './corpus.mjs';
test('new corpus isolates six scenarios and source references without changing previous criteria', () => {
  assert.equal(scenarios.length, 6);
  assert.equal(new Set(scenarios.map((s) => s.id)).size, 6);
  for (const dossier of dossiers) for (const id of dossier.sourceIds) assert.ok(sources.some((s) => s.id === id));
  assert.ok(!original.find((d) => d.id === 'D04').sourceIds.includes('CPC-498'));
  assert.ok(!original.find((d) => d.id === 'D03').expected.some((s) => s.includes('vencimento')));
  for (const source of additions) {
    assert.equal(createHash('sha256').update(source.text).digest('hex'), source.contentHash);
    assert.match(source.url, /^https:\/\/legis\.senado\.gov\.br\//);
    assert.equal(source.retrievedAt, '2026-11-03');
  }
});
test('campaign remains a proposal bounded by existing financial and call limits', () => {
  assert.equal(proposal.paidCallsAuthorized, false);
  assert.equal(proposal.capMicroUsd, 1500000);
  assert.equal(proposal.perExecutionCapMicroUsd, 250000);
  assert.equal(proposal.maxCallsTotal, proposal.executions * 24);
  assert.equal(proposal.retriesAuthorized, false);
  assert.equal(proposal.scenarios[0], proposal.firstScenario);
  assert.ok(proposal.prerequisites.some((p) => p.includes('uncertain')));
});
