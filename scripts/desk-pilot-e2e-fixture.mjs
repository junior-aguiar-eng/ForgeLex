import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSkillCatalog } from '../packages/legal-agents/dist/index.js';
import { loadCapturedPilot, loadRevisedPilot } from './skills/load-captured-pilot.mjs';
import cases from '../tests/fixtures/desk-pilot-cases.json' with { type: 'json' };

const topic = 'cadeia-custodia';
const forms = {
  penal: {
    id: 'piloto-forma-penal-sintetica',
    kind: 'FORM',
    areas: ['penal'],
    documentType: 'resposta-acusacao',
    roles: ['legal-drafter'],
    content: 'Referência interna sintética de Forma Penal. Organizar somente o texto da fixture.',
  },
  civel: {
    id: 'piloto-forma-civel-sintetica',
    kind: 'FORM',
    areas: ['civel'],
    documentType: 'contestacao-civel',
    roles: ['legal-drafter'],
    content: 'Referência interna sintética de Forma Cível. Organizar somente o texto da fixture.',
  },
};
const matter = {
  id: 'piloto-materia-penal-sintetica',
  kind: 'MATTER',
  area: 'penal',
  topic,
  roles: ['matter-analyst'],
  content: 'Referência interna sintética de Matéria Penal. Relacionar o lacre ao registro fornecido na fixture.',
};
const civilMatter = {
  id: 'piloto-materia-civel-sintetica',
  kind: 'MATTER',
  area: 'civel',
  topic: 'pagamento-parcial',
  roles: ['matter-analyst'],
  content: 'Referência interna sintética de Matéria Cível. Identificar o pagamento parcial relatado na fixture.',
};
const version = 3;
export const pilotMode = process.env.FORGELEX_E2E_DESK_PILOT;
const captured = pilotMode === 'captured' || pilotMode === 'captured-limited';
const revised = pilotMode === 'revised';
const expanded = captured || revised || pilotMode === 'expanded';
const usesCatalog = pilotMode === 'skills' || expanded;
const catalogVersion = revised
  ? 'forgelex-r15-revisao-local-v1'
  : captured
    ? 'acervo-r15-avaliacao-local-v1'
    : expanded
      ? 'catalogo-piloto-sintetico-v2'
      : 'catalogo-piloto-sintetico-v1';
const budget =
  pilotMode === 'captured' || revised
    ? { maxBytesPerRole: 9000, maxBytesTotal: 17000 }
    : { maxBytesPerRole: 1000, maxBytesTotal: 1000 };

const archive = process.env.FORGELEX_E2E_SKILL_ARCHIVE;
const pilotEntries = revised ? await loadRevisedPilot(archive) : captured ? await loadCapturedPilot(archive) : [];
// Forma declara uma lista de áreas (M3.0); o piloto usa a primeira.
const areaOf = (entry) => (entry.kind === 'FORM' ? entry.areas[0] : entry.area);
const resources = [...Object.values(forms), matter, ...(expanded ? [civilMatter] : [])].map((entry) => {
  if (!captured && !revised) return { ...entry, version };
  const candidate = pilotEntries.find(
    (item) => item.area === areaOf(entry) && item.category === (entry.kind === 'FORM' ? 'forma' : 'materia'),
  );
  assert.ok(candidate, 'Ficha do lote indisponível');
  return { ...entry, id: candidate.id, version: candidate.version, content: candidate.content };
});

export function deskPilotSkills() {
  if (!usesCatalog) return undefined;
  return {
    catalog: createSkillCatalog({
      version: catalogVersion,
      entries: resources.map(({ content, ...entry }) => ({
        ...entry,
        status: 'eligible',
        contentHash: createHash('sha256').update(content).digest('hex'),
        byteLength: Buffer.byteLength(content),
      })),
    }),
    budget,
    loadContent: async ({ id, version: requestedVersion }) => {
      const entry = resources.find((item) => item.id === id);
      assert.ok(entry && requestedVersion === entry.version, 'Versão da ficha fora do piloto');
      return entry.content;
    },
  };
}

export function deskPilotResponse({ role, packet, registry }) {
  const scenario = cases.find(({ objective }) => objective === packet.objective);
  if (!pilotMode || !scenario) return;

  const source = packet.sources.find(({ text }) => text === scenario.objective);
  assert.ok(source, 'Relato original do piloto ausente ou alterado');
  const sourceIds = [source.id];
  const isGuided = pilotMode !== 'baseline';
  const form = scenario.area === 'Penal' ? forms.penal : forms.civel;
  const isUnknown = scenario.piece === null;
  const isCustody = scenario.id === 'custodia';
  const issue = isCustody ? matter : scenario.id === 'civel' ? civilMatter : undefined;
  const expected = [];
  if (usesCatalog && pilotMode !== 'captured-limited' && !isUnknown) {
    if (role === 'legal-drafter') expected.push(resources.find((entry) => entry.documentType === form.documentType));
    if (role === 'matter-analyst' && issue && (isCustody || expanded))
      expected.push(resources.find((entry) => entry.topic === issue.topic));
  }
  const fingerprint = ({ id, version, content }) => ({
    id,
    version,
    bytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
  });
  assert.deepEqual(
    (packet.skillReferences ?? []).map(fingerprint),
    expected.map(fingerprint),
    `Seleção inesperada em ${scenario.id} / ${role}`,
  );
  assert.equal(Boolean(packet.guidance), isGuided);
  if (isGuided) {
    assert.equal(packet.guidance.area.value, areaOf(form));
    assert.equal(packet.guidance.documentType.status, isUnknown ? 'unknown' : 'confirmed');
    if (isUnknown) {
      assert.ok(packet.guidanceAnswers.some(({ answer }) => answer.unknown));
      assert.equal(role, 'legal-orchestrator', 'A hipótese ainda precisa de confirmação');
    }
  }

  const draft = !isUnknown || isGuided;
  const plan = {
    action: draft ? 'create_document' : 'analyze_documents',
    documentMode: 'CREATE',
    documentType: draft ? form.documentType : undefined,
    requiresCaseLaw: false,
    requiresNorms: false,
    requiresProcedure: false,
    issues: [{ id: 'questao-piloto', statement: scenario.objective, sourceIds }],
    gaps: [],
    ...(isGuided && issue && (isCustody || expanded)
      ? { skillIssues: [{ id: 'questao-piloto', area: issue.area, topic: issue.topic, sourceIds }] }
      : {}),
    ...(isGuided && isUnknown
      ? {
          guidanceProposals: [
            {
              field: 'documentType',
              value: form.documentType,
              material: true,
              sourceIds,
              reason: 'A comunicação relatada indica uma hipótese a conferir.',
              prompt: 'Você quer preparar a resposta à acusação?',
            },
          ],
        }
      : {}),
  };
  const result = {
    coveredIssueIds: ['questao-piloto'],
    claims: [],
    requirements: [],
    findings:
      revised && role === 'matter-analyst' && issue
        ? [
            {
              id: 'r15-ponto-de-conferencia',
              code: isCustody ? 'CUSTODY_RECORDS_TO_VERIFY' : 'PARTIAL_PAYMENT_TO_VERIFY',
              severity: 'WARNING',
              statement: isCustody
                ? 'O relato informa lacre rompido. Confira o registro da abertura e do novo lacre para avaliar a identidade do vestígio e o prejuízo concreto.'
                : 'O relato informa pagamento parcial. Confira comprovante, beneficiário e vínculo com a dívida antes de apurar o saldo.',
              sourceIds,
            },
          ]
        : [],
    supportChecks: [],
    ...(role === 'legal-drafter'
      ? {
          document: {
            title: `Peça preliminar do piloto — ${scenario.piece}`,
            documentType: scenario.piece,
            sections: [{ title: 'Relato fornecido', content: source.text, sourceIds }],
          },
        }
      : {}),
  };
  console.info(
    JSON.stringify({
      check: 'desk-pilot',
      mode: pilotMode,
      case: scenario.id,
      role,
      rulesVersion: packet.guidance?.rulesVersion ?? null,
      catalogVersion: usesCatalog ? catalogVersion : null,
      skillBudget: usesCatalog ? budget : null,
      references: captured || revised ? expected.map(fingerprint) : undefined,
      tools: registry
        .list()
        .map(({ name }) => name)
        .sort(),
      skillBytes: expected.reduce((sum, { content }) => sum + Buffer.byteLength(content), 0),
      contextBytes: Buffer.byteLength(JSON.stringify(packet)),
    }),
  );
  return [
    { thought: 'fixture', toolCall: { name: 'task.submit', input: role === 'legal-orchestrator' ? plan : result } },
  ];
}
