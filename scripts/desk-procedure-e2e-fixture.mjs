import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const rule =
  'Regra sintética da homologação. A audiência sem acordo inicia o prazo. O protocolo até o vencimento registrado no calendário é tempestivo.';
const hash = createHash('sha256').update(rule).digest('hex');
export const procedureLegislationFixture = {
  async retrieve({ normId, provisionId }) {
    assert.equal(normId, 'homologacao');
    assert.equal(provisionId, 'prazo');
    return {
      status: 'FOUND',
      legalApplicability: 'NOT_EVALUATED',
      freshness: 'SNAPSHOT_ONLY',
      temporalBasis: 'CATALOG_CURRENT',
      document: {
        sourceId: 'norma-sintetica',
        normId,
        provisionId,
        versionId: 'homologacao-v1',
        text: rule,
        officialUrl: 'https://www.planalto.gov.br/',
        capturedAt: '2026-11-11T12:00:00Z',
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        contentHash: hash,
        snapshotHash: hash,
        start: 0,
        end: rule.length,
        curationEvidence: 'fixture local de homologação',
      },
    };
  },
};

export function procedureFixtureResponse({ role, packet }) {
  if (process.env.FORGELEX_E2E_PROCEDURE !== 'true') return;
  const scenario = /HOMOLOGAÇÃO PROCESSUAL (completo|parcial|divergência)/.exec(packet.objective)?.[1];
  if (!scenario) return;
  const submit = (input) => ({ toolCall: { name: 'task.submit', input } });
  const empty = { coveredIssueIds: ['i'], claims: [], requirements: [], findings: [], supportChecks: [] };
  const findDocument = (text) =>
    packet.sources.find((source) => source.kind === 'DOCUMENT' && source.text.startsWith(text));
  const hearing = findDocument('Ata sintética.');
  assert.ok(hearing, 'Ata selecionada ausente');
  if (role === 'legal-orchestrator')
    return [
      submit({
        action: 'create_document',
        documentMode: 'CREATE',
        documentType: 'contestacao-civel',
        requiresCaseLaw: false,
        requiresNorms: true,
        requiresProcedure: true,
        issues: [{ id: 'i', statement: 'Verificar requisitos da contestação', sourceIds: [hearing.id] }],
        gaps: [],
      }),
    ];
  if (role === 'legal-researcher')
    return [
      {
        toolCall: {
          name: 'research.get_legislation',
          input: { normId: 'homologacao', provisionId: 'prazo', selector: { kind: 'CURRENT' } },
        },
      },
      submit(empty),
    ];
  if (role !== 'procedural-advisor' && role !== 'authority-verifier' && role !== 'legal-drafter')
    return [submit(empty)];
  const norm = packet.sources.find((source) => source.kind === 'NORM' && source.text === rule);
  assert.ok(norm, 'Fonte normativa sintética não recuperada');
  const calendar = findDocument('Calendário sintético.');
  const filing = findDocument('Protocolo sintético.');
  const requirement = (id, statement, docs) => ({
    id,
    statement,
    kind: 'PROCEDURAL',
    verified: false,
    sourceIds: [norm.id, ...docs.filter(Boolean).map(({ id }) => id)],
  });
  if (role === 'procedural-advisor')
    return [
      submit({
        ...empty,
        requirements: [
          requirement('marco', 'A audiência sem acordo fixa o marco inicial.', [hearing]),
          requirement(
            'prazo',
            scenario === 'parcial'
              ? 'A tempestividade depende do comprovante de protocolo.'
              : 'O protocolo ocorreu até o vencimento.',
            [calendar, filing],
          ),
          ...(scenario === 'parcial'
            ? [requirement('juntada', 'A juntada depende do comprovante correspondente.', [])]
            : []),
        ],
      }),
    ];
  if (role === 'legal-drafter')
    return [
      submit({
        ...empty,
        document: {
          title: 'Contestação sintética da homologação',
          documentType: 'Contestação',
          sections: [{ title: 'Autos selecionados', content: hearing.text, sourceIds: [hearing.id] }],
        },
      }),
    ];
  const excerpt = ({ id, text }) => ({ sourceId: id, quote: text });
  assert.equal(packet.procedureTargets?.length, scenario === 'parcial' ? 3 : 2);
  const [start, deadline, attachment] = packet.procedureTargets;
  const checks = [
    { requirementId: start.id, assessment: 'SUPPORTED', norms: [excerpt(norm)], documents: [excerpt(hearing)] },
  ];
  if (scenario === 'parcial') {
    checks.push(
      { requirementId: deadline.id, assessment: 'PARTIAL' },
      { requirementId: attachment.id, assessment: 'UNDETERMINED' },
    );
  } else {
    assert.ok(calendar && filing, 'Calendário ou protocolo selecionado ausente');
    checks.push({
      requirementId: deadline.id,
      assessment: 'SUPPORTED',
      norms: [excerpt(norm)],
      documents: [
        excerpt(calendar),
        scenario === 'divergência'
          ? { sourceId: filing.id, quote: 'Protocolo sintético. A contestação foi apresentada em 12/11.' }
          : excerpt(filing),
      ],
    });
  }
  return [submit({ ...empty, procedureChecks: checks })];
}
