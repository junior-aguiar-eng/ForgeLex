import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

/**
 * M3.0 — mapa de correspondência do catálogo de habilidades.
 *
 * Lê o inventário local do R1 (`inventory-catalog.mjs`, fora do Git) e gera, para cada ficha, a chave que o
 * resolvedor exige:
 *   - Matéria: área (a declarada na própria ficha) e tópico (o `stableId`, único);
 *   - Forma: uma ou mais áreas da Mesa e o tipo de peça (o `stableId`, único, o que desfaz o conflito dos dois
 *     `notificacao-extrajudicial` que dividem o mesmo `documentType` de origem).
 *
 * Nenhum conteúdo de ficha sai daqui: só identificadores, áreas, método e confiança. Ficha sem evidência clara vai
 * para a fila de ambíguas; nenhuma fica sem resultado.
 */

// Palavras do `stableId` (separadas por hífen) que apontam para uma ou mais áreas. A tabela é revisável: o relatório
// diz qual regra deu cada área, e o cruzamento por citações (abaixo) confirma ou contesta.
const FORM_RULES = [
  [/(^|-)(trabalh\w*|clt|dissidio|reclamacao-trabalhista|tst|rced|revista|norma-coletiva)(-|$)/, ['trabalho']],
  [
    /(^|-)(tribut\w*|fiscal|carf|icms|declaratoria-tributaria|transacao-tributaria|repeticao-indebito)(-|$)/,
    ['tributario'],
  ],
  [
    /(^|-)(penal|penais|criminal|denuncia|queixa|juri|pronuncia|impronuncia|flagrante|prisao|pena|penas|lep|livramento|progressao|remicao|saida|indulto|comutacao|desaforamento|drogas|interrogatorio|carta-testemunhavel|liberdade|medidas-protetivas|cpp|inquerito|presidio|presa|habeas|corpus|arquivamento|acusacao)(-|$)/,
    ['penal', 'processo-penal'],
  ],
  [/(^|-)(eleitor\w*|aije|aime|rde|elegibilidade|conduta-vedada)(-|$)/, ['eleitoral']],
  [/(^|-)(consumerist\w*|acp-consumerista|plano-saude)(-|$)/, ['consumidor']],
  [/(^|-)(saude|medicamento|internacao-involuntaria)(-|$)/, ['saude']],
  [
    /(^|-)(alimentos|guarda|divorcio|inventario|inventariante|adocao|interdicao|curatela|paternidade|testamento|convivencia|arrolamento|retificacao-registro-civil|regulamentacao-convivencia)(-|$)/,
    ['familia-sucessoes'],
  ],
  [/(^|-)(previdenciari\w*|crps|aposentadoria)(-|$)/, ['previdenciario']],
  [
    /(^|-)(improbidade|licitacao|pad|paf|par|tomada-contas|tcu|servidor|concessionaria|administrativo|fazendaria|fazenda)(-|$)/,
    ['administrativo'],
  ],
  [
    /(^|-)(locacao|locaticia|despejo|usucapiao|possessoria|reivindicatoria|imissao|nunciacao|interdito|divisao-demarcacao|adjudicacao)(-|$)/,
    ['imobiliario'],
  ],
  [
    /(^|-)(societari\w*|sociedade|estatuto|assembleia|conselho|haveres|dissolucao|contrato-social)(-|$)/,
    ['societario'],
  ],
  [/(^|-)(falencia|recuperacao|credito)(-|$)/, ['empresarial']],
  [/(^|-)(cade|regulatori\w*|regulamentacao|anteprojeto)(-|$)/, ['regulatorio']],
  [/(^|-)(bancari\w*|fiduciario)(-|$)/, ['bancario']],
  [/(^|-)(cvm)(-|$)/, ['regulatorio']],
  [/(^|-)(popular)(-|$)/, ['constitucional', 'administrativo']],
  [
    /(^|-)(constitucional|adi|adc|adpf|amicus|sumula-vinculante|mandado-injuncao|habeas-data|modulacao|audiencia-publica-stf|federalizacao)(-|$)/,
    ['constitucional'],
  ],
  [/(^|-)(ambiental|civil-publica|acp)(-|$)/, ['ambiental']],
  [/(^|-)(ato-infracional|eca|socioeducativ\w*|remissao)(-|$)/, ['diversidade-dh']],
  [/(^|-)(internacional|oea|onu|extradicao|refugio|conare|estrangeira)(-|$)/, ['internacional']],
  [/(^|-)(arbitr\w*|sentenca-arbitral)(-|$)/, ['civil']],
  [
    /(^|-)(parecer|nota-tecnica|position|memo|disclosure|closing|consulta|estudo|juridico-consultivo)(-|$)/,
    ['consultoria'],
  ],
  [
    /(^|-)(contratual|contratos?|clausula|distrato|rescisao|aditivo|resolucao-contratual|revisional)(-|$)/,
    ['contratos'],
  ],
  [
    /(^|-)(cobranca|obrigacao|indenizatoria|civel|civeis|consignacao|monitoria|exigir-contas|prestacao-contas|anulatoria|rescisoria)(-|$)/,
    ['civil'],
  ],
];
// Peças processuais sem matéria própria: valem para o processo civil quando nenhuma regra acima as leva a outro ramo.
const PROCEDURAL =
  /(^|-)(recurso|agravo|apelacao|embargos|contrarrazoes|contestacao|peticao-inicial|replica|cumprimento|impugnacao|execucao|tutela|despacho|decisao|sentenca|acordao|voto|memoriais|sustentacao|reclamacao|conflito|incidente|iac|irdr|puil|jec|jef|jefp|mandado|alvara|carta|edital|oficio|procuracao|termo|quesitos|manifestacao|penhora|habilitacao|chamamento|denunciacao|curadoria|custos|assistencia|ata|suspensao|superacao|distincao|juizo|proposta|pedido|requerimento|representacao|relatorio|notificacao|contranotificacao|acordo|transacao)(-|$)/;

// Casos em que a regra por nome ou o voto por citações erra de forma conhecida. Cada linha diz o motivo; o relatório
// as marca como `override` para o cruzamento e a fila não as tratarem como evidência independente.
const FORM_OVERRIDES = new Map([
  ['agravo-peticao', [['trabalho'], 'agravo de petição é recurso trabalhista (CLT 897, a)']],
  ['agravo-instrumento-recurso-revista', [['trabalho'], 'agravo de instrumento em recurso de revista (CLT 897, b)']],
  ['contrarrazoes-recurso-revista', [['trabalho'], 'recurso de revista é recurso trabalhista']],
  ['acao-cumprimento-norma-coletiva', [['trabalho'], 'ação de cumprimento de norma coletiva (CLT 872)']],
  [
    'contestacao-jec',
    [['processo-civil'], 'Juizado Especial Cível; o voto penal vem da Lei 9.099 citada também nos JECRIM'],
  ],
  ['contrarrazoes-recurso-inominado', [['processo-civil'], 'recurso inominado dos Juizados Especiais Cíveis']],
  ['cumprimento-execucao-jec', [['processo-civil'], 'cumprimento e execução nos Juizados Especiais Cíveis']],
  ['contestacao-fazendaria', [['administrativo', 'processo-civil'], 'contestação da Fazenda Pública']],
  [
    'impugnacao-cumprimento-fazenda',
    [['administrativo', 'processo-civil'], 'impugnação ao cumprimento contra a Fazenda (CPC 535)'],
  ],
  [
    'defesa-pad-prisional',
    [['administrativo', 'processo-penal'], 'processo administrativo disciplinar no sistema prisional'],
  ],
  ['defesa-extradicao', [['internacional', 'processo-penal'], 'extradição passiva']],
  ['incidente-desconsideracao-personalidade-juridica', [['civil', 'processo-civil'], 'CPC 133 a 137 e CC 50']],
  [
    'inquerito-civil-recomendacao-mp',
    [['administrativo', 'ambiental', 'consumidor'], 'inquérito civil do Ministério Público, não inquérito policial'],
  ],
  ['inquerito-judicial-falta-grave', [['trabalho'], 'inquérito judicial para apuração de falta grave (CLT 853)']],
  ['consignacao-pagamento', [['civil', 'processo-civil'], 'consignação em pagamento (CC 334 e CPC 539)']],
  [
    'acordo-nao-persecucao-civel',
    [['administrativo', 'processo-civil'], 'acordo de não persecução cível (improbidade, Lei 8.429)'],
  ],
]);

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;
/** Identificador do catálogo: o próprio stableId quando já é seguro; senão, sem acento nem símbolo e com sufixo de hash. */
export function catalogId(stableId) {
  if (SAFE_ID.test(stableId)) return stableId;
  const folded = stableId
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._:-]+/g, '-')
    .replace(/^[^a-zA-Z0-9]+/, '');
  return `${folded}-${createHash('sha256').update(stableId).digest('hex').slice(0, 8)}`;
}

const normalize = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// Citações normativas e de jurisprudência (ex.: "cpc 528", "cc 1.696", "sumula 309 stj") que ligam uma Forma às Matérias
// que tratam do mesmo assunto.
const CITATION =
  /\b(cpc|cpp|cc|cf|clt|ctn|cdc|cp|eca|lep|lia|lindb|lei)\s*(?:n[o.]?\s*)?(\d{1,5}(?:[.\/]\d{1,4})*)|\bsum(?:ula|\.)?\s*(?:vinculante\s*)?(\d{1,4})\s*(stj|stf|tst|tse)?/g;

export function citations(text) {
  const found = new Set();
  for (const match of normalize(text).matchAll(CITATION)) {
    found.add(match[1] ? `${match[1]} ${match[2].replace(/\.$/, '')}` : `sumula ${match[3]} ${match[4] ?? ''}`.trim());
  }
  return found;
}

const textOf = (item) => [item.title, ...(item.triggers ?? []), item.description ?? ''].join(' \n ');

function ruleAreas(stableId) {
  const id = normalize(stableId);
  const areas = new Set();
  const matched = [];
  for (const [pattern, list] of FORM_RULES) {
    if (pattern.test(id)) {
      matched.push(pattern.source.slice(0, 40));
      list.forEach((area) => areas.add(area));
    }
  }
  if (!areas.size && PROCEDURAL.test(id)) {
    areas.add('processo-civil');
    matched.push('PROCEDURAL');
  }
  return { areas: [...areas].sort(), matched };
}

function buildVoteIndex(matters) {
  const index = new Map();
  for (const item of matters) {
    for (const token of citations(textOf(item))) {
      if (!index.has(token)) index.set(token, new Map());
      const areas = index.get(token);
      areas.set(item.area, (areas.get(item.area) ?? 0) + 1);
    }
  }
  return index;
}

function voteAreas(form, index) {
  const score = new Map();
  let tokens = 0;
  for (const token of citations(textOf(form))) {
    const areas = index.get(token);
    if (!areas) continue;
    const total = [...areas.values()].reduce((sum, value) => sum + value, 0);
    if (total > 40) continue; // citação genérica demais para votar
    tokens += 1;
    for (const [area, count] of areas) score.set(area, (score.get(area) ?? 0) + count / total);
  }
  const sum = [...score.values()].reduce((a, b) => a + b, 0);
  const strong = [...score]
    .filter(([, value]) => tokens >= 2 && value / sum >= 0.3)
    .map(([area]) => area)
    .sort();
  return { tokens, areas: strong };
}

/** Confiança: alta (regra e votos concordam), media (só a regra), baixa (só os votos), conflito, sem-evidencia. */
function mapForm(form, voteIndex) {
  const override = FORM_OVERRIDES.get(form.stableId);
  const rule = override ? { areas: override[0], matched: ['OVERRIDE'] } : ruleAreas(form.stableId);
  const votes = voteAreas(form, voteIndex);
  const overlap = rule.areas.filter((area) => votes.areas.includes(area));
  let confidence;
  let areas;
  let queueReason = null;
  if (override) {
    confidence = 'media';
    areas = rule.areas;
  } else if (rule.areas.length && votes.areas.length) {
    if (overlap.length) {
      confidence = 'alta';
      areas = rule.areas;
    } else {
      confidence = 'conflito';
      areas = rule.areas;
      queueReason = 'AREA_RULE_VOTE_CONFLICT';
    }
  } else if (rule.areas.length) {
    confidence = rule.matched.includes('PROCEDURAL') ? 'baixa' : 'media';
    areas = rule.areas;
    if (confidence === 'baixa') queueReason = 'PROCEDURAL_AREA_UNCONFIRMED';
  } else if (votes.areas.length) {
    confidence = 'baixa';
    areas = votes.areas;
    queueReason = 'AREA_FROM_VOTES_ONLY';
  } else {
    confidence = 'sem-evidencia';
    areas = [];
    queueReason = 'NO_AREA_EVIDENCE';
  }
  return {
    stableId: form.stableId,
    catalogId: catalogId(form.stableId),
    kind: 'FORM',
    documentType: catalogId(form.stableId),
    sourceDocumentType: form.documentType,
    areas,
    confidence,
    evidence: {
      rules: rule.matched,
      votedAreas: votes.areas,
      citationTokens: votes.tokens,
      ...(override ? { override: override[1] } : {}),
    },
    status: queueReason ? 'queue' : 'mapped',
    ...(queueReason ? { queueReason } : {}),
  };
}

function mapMatter(matter) {
  const area = matter.area;
  return {
    stableId: matter.stableId,
    catalogId: catalogId(matter.stableId),
    kind: 'MATTER',
    area,
    topic: catalogId(matter.stableId),
    subarea: matter.subarea ?? null,
    confidence: area ? 'alta' : 'sem-evidencia',
    status: area ? 'mapped' : 'queue',
    ...(area ? {} : { queueReason: 'AREA_UNDECLARED' }),
  };
}

const count = (items, pick) => {
  const result = {};
  for (const item of items) for (const key of [].concat(pick(item) ?? '(nenhum)')) result[key] = (result[key] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort((a, b) => b[1] - a[1]));
};

export function mapCatalog(inventory) {
  const forms = inventory.items.filter((item) => item.category === 'forma');
  const matters = inventory.items.filter((item) => item.category === 'materia');
  const stable = new Set(inventory.items.map((item) => item.stableId));
  if (stable.size !== inventory.items.length) throw new Error('stableId duplicado no inventário');
  const voteIndex = buildVoteIndex(matters);
  const formResults = forms.map((form) => mapForm(form, voteIndex));
  const matterResults = matters.map(mapMatter);
  const results = [...formResults, ...matterResults];
  // Chaves que o resolvedor usa: não pode haver duas fichas com a mesma chave exata.
  const duplicateKeys = [];
  const seen = new Map();
  for (const result of results) {
    const keys =
      result.kind === 'FORM'
        ? result.areas.map((area) => `FORM|${area}|${result.documentType}`)
        : [`MATTER|${result.area}|${result.topic}`];
    for (const key of keys) {
      if (seen.has(key)) duplicateKeys.push([key, seen.get(key), result.stableId]);
      seen.set(key, result.stableId);
    }
  }
  const queue = results.filter((result) => result.status === 'queue');
  return {
    schemaVersion: 1,
    archiveSha256: inventory.archiveSha256,
    counts: { forma: formResults.length, materia: matterResults.length, total: results.length },
    report: {
      withResult: results.length,
      mapped: results.length - queue.length,
      queued: queue.length,
      duplicateKeys,
      forma: {
        byConfidence: count(formResults, (r) => r.confidence),
        byArea: count(
          formResults.filter((r) => r.status === 'mapped'),
          (r) => r.areas,
        ),
        multiArea: formResults.filter((r) => r.areas.length > 1).length,
        queueByReason: count(
          formResults.filter((r) => r.status === 'queue'),
          (r) => r.queueReason,
        ),
        sharedSourceDocumentType: Object.entries(count(formResults, (r) => r.sourceDocumentType))
          .filter(([, n]) => n > 1)
          .map(([type]) => type),
      },
      materia: {
        byArea: count(matterResults, (r) => r.area),
        queued: matterResults.filter((r) => r.status === 'queue').length,
      },
    },
    results,
    queue: queue.map(({ stableId, kind, queueReason, areas }) => ({ stableId, kind, queueReason, areas: areas ?? [] })),
  };
}

async function main() {
  const { values } = parseArgs({ options: { inventory: { type: 'string' }, out: { type: 'string' } } });
  if (!values.inventory || !values.out) {
    throw new Error('Uso: node scripts/skills/map-catalog.mjs --inventory <JSON local do R1> --out <JSON local>');
  }
  const map = mapCatalog(JSON.parse(await readFile(values.inventory, 'utf8')));
  await writeFile(values.out, JSON.stringify(map, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ counts: map.counts, report: map.report, output: values.out }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
