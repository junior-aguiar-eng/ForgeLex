import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [mode, packetPath, directoryArg, scenario] = process.argv.slice(2);
const profiles = ['mock-profiles', 'real-profiles'].includes(mode);
const real = ['real', 'real-profiles'].includes(mode);
if (
  process.argv.length > 6 ||
  !['mock', 'real', 'mock-profiles', 'real-profiles'].includes(mode) ||
  !packetPath ||
  !directoryArg ||
  (scenario !== undefined && (profiles || (real ? scenario !== 'A04' : !/^A0[1-8]$/.test(scenario))))
)
  throw new Error(
    'Usage: api-prompts-a3-phase1.mjs mock|real|mock-profiles|real-profiles packet.json new-local-directory [scenario]',
  );
const approval = profiles
  ? 'boni-phase2-16-usd-4.00'
  : scenario === 'A04'
    ? 'boni-phase1-a04-2-usd-0.60'
    : 'boni-phase1-16-usd-3.50';
if (real && (process.env.FORGELEX_A3_PHASE1_APPROVAL !== approval || !process.env.OPENAI_API_KEY?.trim()))
  throw new Error('A3_PHASE1_APPROVAL_OR_KEY_REQUIRED');
const digest = (content) => createHash('sha256').update(content).digest('hex');
const packet = JSON.parse(readFileSync(packetPath, 'utf8'));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (packet.mode !== 'offline' || packet.baseHead !== head) throw new Error('A3_PHASE1_HEAD_MISMATCH');
if (profiles && packet.selectedPromptsForDryRun !== 'revised') throw new Error('A3_REVISED_PROMPTS_REQUIRED');
for (const [file, expected] of Object.entries(packet.sourceHashes)) {
  if (digest(readFileSync(resolve(root, file))) !== expected) throw new Error('A3_PHASE1_SOURCE_MISMATCH: ' + file);
}
const directory = resolve(directoryArg);
mkdirSync(directory);
copyFileSync(packetPath, join(directory, 'packet.json'));

const results = [];
const ids = scenario ? [scenario] : Array.from({ length: 8 }, (_, index) => 'A0' + (index + 1));
let stop;
for (const arm of profiles ? ['profiles-fixed', 'profiles-by-role'] : ['prompts-current', 'prompts-revised']) {
  if (stop) break;
  for (const id of ids) {
    execFileSync(
      process.execPath,
      [
        resolve(root, 'node_modules/vitest/vitest.mjs'),
        'run',
        'packages/legal-workflows/src/agentic-case-task/api-prompts-offline.test.ts',
        '-t',
        '^' + id + ' ',
        '--testTimeout',
        '310000',
      ],
      {
        cwd: root,
        stdio: 'inherit',
        env: {
          ...process.env,
          ...(!real ? { OPENAI_API_KEY: '', FORGELEX_A3_PHASE1_APPROVAL: '' } : {}),
          FORGELEX_A3_ARM: arm,
          FORGELEX_A3_PHASE1_MODE: real ? 'real' : 'mock',
          FORGELEX_A3_PHASE1_SCENARIO: scenario ?? '',
          FORGELEX_A3_PHASE1_DIRECTORY: directory,
          FORGELEX_A3_OFFLINE_DIRECTORY: directory,
          FORGELEX_A3_SELECTED_PROMPTS: 'revised',
          FORGELEX_API_PROMPTS_OFFLINE_REPORT: '',
        },
      },
    );
    const path = join(directory, arm + '-' + id + '.result.json');
    if (!existsSync(path)) {
      stop = 'RESULT_MISSING';
      break;
    }
    const result = JSON.parse(readFileSync(path, 'utf8'));
    results.push(result);
    console.log(
      JSON.stringify({ run: result.runId, outcome: result.outcome, code: result.errorCode, ledger: result.ledger }),
    );
    if (result.ledger.unresolved) {
      stop = 'UNCERTAIN_COST';
      break;
    }
    if (result.ledger.calls === 0 && result.outcome === 'failed') {
      stop = 'NO_DISPATCH_FAILURE';
      break;
    }
  }
}
const summary = {
  mode,
  directory,
  planned: ids.length * 2,
  attempted: results.length,
  stop,
  ledger: results.at(-1)?.ledger,
  results: results.map(({ runId, outcome, errorCode, diagnostic, elapsedMs, delivery, question, traces }) => ({
    runId,
    outcome,
    errorCode,
    diagnostic,
    elapsedMs,
    status: delivery?.status,
    question: question?.prompt,
    calls: traces.filter((trace) => trace.phase === 'RESERVED').length,
    costMicroUsd: traces.reduce((sum, trace) => sum + (trace.actualMicroUsd ?? 0), 0),
  })),
};
writeFileSync(join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
if (!real && (stop || results.length !== summary.planned || results.some(({ outcome }) => outcome === 'failed')))
  process.exitCode = 1;
