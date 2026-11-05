// Offline, explicit equivalences only. Never rewrites source campaign artifacts or invokes a provider.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { consolidateReviewedDelivery } from '../../packages/legal-workflows/dist/agentic-case-task/reviewed-delivery.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const args = process.argv.slice(2);
if (args.length !== 2) throw Error('Usage: node consolidate-recorded-v9.mjs decisions.json NEW-output.json');
const manifestPath = resolve(args[0]),
  output = resolve(args[1]);
if (existsSync(output)) throw Error('OUTPUT_EXISTS_NO_OVERWRITE');
const manifestBytes = readFileSync(manifestPath),
  manifest = JSON.parse(manifestBytes);
if (manifest.status !== 'LOCAL_TEXTUAL_REVIEW_NOT_LEGAL_APPROVAL') throw Error('REVIEW_STATUS_REQUIRED');
const verified = manifest.sourceFiles.map((e) => {
  const bytes = readFileSync(resolve(root, e.file));
  if (sha(bytes) !== e.sha256) throw Error('SOURCE_HASH_MISMATCH');
  return { file: e.file, value: JSON.parse(bytes) };
});
const original = verified.find((e) => e.file.endsWith('/V2-MULTI.json')).value;
const checkpoint = verified.find((e) => e.file.endsWith('/V2-MULTI.checkpoint.json')).value;
const packet = verified.find((e) => e.file.endsWith('/packet.json')).value;
if (original.outcome !== 'completed' || checkpoint.version !== 9) throw Error('COMPLETED_V9_REQUIRED');
const scenario = packet.corpus.scenarios.find((s) => s.id === original.runId);
const dossier = packet.corpus.dossiers.find((d) => d.id === scenario.dossierId);
const texts = new Map([
  ['context', dossier.context],
  ['draft', scenario.draft],
  ...dossier.documents.map(([id, text]) => [`${dossier.id}/${id}@v1#p1`, text]),
  ...packet.corpus.sources.map((s) => [s.id, s.text]),
]);
const sources = original.delivery.sources.map((s) => {
  const text = texts.get(s.id);
  if (typeof text !== 'string' || sha(text) !== s.contentHash) throw Error('SOURCE_TEXT_MISMATCH');
  return { ...s, text };
});
const raw = { ...original.delivery, ...original.delivery.review.original };
const kinds = { claim: 'claims', requirement: 'requirements', finding: 'findings' };
const groups = manifest.groups.map(({ kind, retainedId, memberIds, reason }) => {
  if (!reason?.trim() || !kinds[kind]) throw Error('EXPLICIT_REVIEW_REQUIRED');
  const items = raw[kinds[kind]];
  if (memberIds.some((id) => !items.some((i) => i.id === id))) throw Error('REVIEW_MEMBER_MISSING');
  return { kind, retainedId, memberIds };
});
const results = [
  ...Object.values(checkpoint.outputs),
  {
    coveredIssueIds: [],
    claims: [],
    requirements: [],
    findings: [],
    supportChecks: [],
    review: { equivalences: groups },
  },
];
const delivery = consolidateReviewedDelivery(raw, results, sources, checkpoint.plan);
if (delivery.status !== original.delivery.status || delivery.legalAssessment !== original.delivery.legalAssessment)
  throw Error('ASSESSMENT_CHANGED');
// The derived record is a local presentation correction, never a new model execution.
const artifact = {
  schemaVersion: 1,
  kind: 'OFFLINE_DERIVED_CONSOLIDATION',
  runId: original.runId,
  sourceFiles: manifest.sourceFiles,
  decisionsSha256: sha(manifestBytes),
  paidModelCalls: 0,
  measuredMicroUsd: 0,
  legalAssessment: 'PENDING_BONI',
  originalCounts: Object.fromEntries(Object.values(kinds).map((k) => [k, original.delivery[k].length])),
  derivedCounts: Object.fromEntries(Object.values(kinds).map((k) => [k, delivery[k].length])),
  delivery,
};
writeFileSync(output, JSON.stringify(artifact, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ original: artifact.originalCounts, derived: artifact.derivedCounts, paidModelCalls: 0 }));
