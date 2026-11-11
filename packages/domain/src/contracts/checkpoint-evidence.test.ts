import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { readCheckpointEvidence } from './checkpoint-evidence.js';

const source = (id: string, kind: 'AUTHORITY' | 'NORM') => {
  const text = `Fonte sintética ${id}`;
  return { id, kind, text, contentHash: createHash('sha256').update(text).digest('hex') };
};
const evidence = [source('julgado', 'AUTHORITY'), source('lei', 'NORM')];

it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])('recupera as fontes do formato v%s', (version) => {
  expect(readCheckpointEvidence({ caseTask: { version, evidence, privateState: { extra: true } } })).toEqual(evidence);
});

it.each([
  { version: 13, evidence },
  { version: 12, evidence: {} },
  { version: 12, evidence: [{ ...evidence[0], text: 'Adulterado' }] },
  { version: 12, evidence: [{ ...evidence[0], contentHash: 'inválido' }] },
  { version: 12, evidence: [evidence[0], evidence[0]] },
])('recusa evidência desconhecida ou adulterada %#', (caseTask) => {
  expect(() => readCheckpointEvidence({ caseTask })).toThrow('EDITORIAL_SOURCE_UNAVAILABLE');
});
