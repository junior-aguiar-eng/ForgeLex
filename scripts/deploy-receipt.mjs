import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Recibo de publicação: um arquivo Markdown que o `deploy-from-main.ps1` grava ao terminar, para que o registro do que
 * foi publicado não dependa de alguém lembrar de escrevê-lo. Nunca commita nada, nunca lê segredo e só aceita campos com
 * formato conhecido (SHA, UUID de build, digest, nomes de serviço e revisão); texto livre é limpo e limitado.
 */

export const RECEIPT_STATUSES = {
  PUBLICADO: 'Publicado: tráfego trocado e verificação passou',
  SEM_TRAFEGO: 'Revisões criadas sem tráfego (-NoTraffic); o tráfego não foi trocado',
  FALHOU_REVERTIDO: 'Falhou; o tráfego foi revertido para as revisões anteriores',
  FALHOU_SEM_REVERSAO: 'Falhou e a reversão NÃO foi concluída: verifique o tráfego',
};

const SHA = /^[0-9a-f]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const IMAGE = /^[a-z0-9.-]+(?:\/[a-z0-9._-]+)+(?::[A-Za-z0-9._-]+)?(?:@sha256:[0-9a-f]{64})?$/;
const PROJECT = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const REGION = /^[a-z]+-[a-z]+[0-9]+$/;
const NAME = /^[a-z][a-z0-9-]{0,62}$/;
const MAX_TEXT = 400;
const MAX_ITEMS = 20;

const REDACTIONS = [
  [/(bearer\s+)[\w.~+/=-]+/gi, '$1[REDIGIDO]'],
  [/\b(password|passwd|secret|token|api[_-]?key|senha|chave)\b(\s*[=:]\s*)\S+/gi, '$1$2[REDIGIDO]'],
  [/\b(postgres(?:ql)?:\/\/[^:/\s]+:)[^@\s]+@/gi, '$1[REDIGIDO]@'],
];

function fail(field, message) {
  throw new Error(`Recibo inválido (${field}): ${message}`);
}

function matching(value, pattern, field) {
  if (typeof value !== 'string' || !pattern.test(value))
    fail(field, `valor fora do formato esperado (${String(value).slice(0, 80)})`);
  return value;
}

/** Texto livre vira uma linha curta, sem caracteres de controle e sem o que parece segredo. */
export function sanitizeText(value) {
  let text = String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [pattern, replacement] of REDACTIONS) text = text.replace(pattern, replacement);
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}

function textList(value, field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(field, 'deve ser uma lista');
  return value.slice(0, MAX_ITEMS).map(sanitizeText).filter(Boolean);
}

/** Confere e normaliza a entrada. Lança com o nome do campo ruim; nada inválido chega ao arquivo. */
export function validateReceipt(input, now = new Date()) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('raiz', 'esperado um objeto');
  const status = input.status;
  if (!Object.hasOwn(RECEIPT_STATUSES, status)) fail('status', `use um de ${Object.keys(RECEIPT_STATUSES).join(', ')}`);
  const finishedAt = new Date(input.finishedAt ?? now);
  if (Number.isNaN(finishedAt.getTime())) fail('finishedAt', 'data inválida');
  if (!Array.isArray(input.services) || input.services.length < 1 || input.services.length > 4) {
    fail('services', 'esperado de 1 a 4 serviços');
  }
  let publicOrigin = null;
  if (input.publicUrl) {
    try {
      const url = new URL(String(input.publicUrl));
      if (url.protocol !== 'https:') fail('publicUrl', 'esperado https');
      publicOrigin = url.origin;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Recibo inválido')) throw error;
      fail('publicUrl', 'URL inválida');
    }
  }
  const failure = input.failure ?? null;
  return {
    status,
    finishedAt: finishedAt.toISOString(),
    sha: matching(input.sha, SHA, 'sha'),
    buildId: matching(input.buildId, UUID, 'buildId'),
    digest: matching(input.digest, DIGEST, 'digest'),
    image: matching(input.image, IMAGE, 'image'),
    projectId: matching(input.projectId, PROJECT, 'projectId'),
    region: matching(input.region, REGION, 'region'),
    publicOrigin,
    services: input.services.map((service, index) => ({
      service: matching(service?.service, NAME, `services[${index}].service`),
      previous: matching(service?.previous, NAME, `services[${index}].previous`),
      revision: matching(service?.revision, NAME, `services[${index}].revision`),
    })),
    flags: textList(input.flags, 'flags'),
    failure: failure
      ? { reason: sanitizeText(failure.reason), errors: textList(failure.errors, 'failure.errors') }
      : null,
    postRollbackHealth: input.postRollbackHealth ? sanitizeText(input.postRollbackHealth) : null,
  };
}

export function receiptFileName(receipt) {
  const day = receipt.finishedAt.slice(0, 10);
  const hhmm = `${receipt.finishedAt.slice(11, 13)}${receipt.finishedAt.slice(14, 16)}Z`;
  return `${day}-${hhmm}-${receipt.sha.slice(0, 7)}-${receipt.status.toLowerCase().replaceAll('_', '-')}.md`;
}

function rollbackSection(receipt) {
  const changed = receipt.services.filter((service) => service.previous !== service.revision);
  if (receipt.status === 'SEM_TRAFEGO') {
    return [
      '## Para trocar o tráfego',
      '',
      '```powershell',
      `./ops/gcp/production/deploy-from-main.ps1 -ReleaseBuildId '${receipt.buildId}'`,
      '```',
      '',
      'O build e as revisões são revalidados e reaproveitados; nada é reconstruído.',
    ];
  }
  if (receipt.status === 'FALHOU_REVERTIDO') {
    return ['## Reversão', '', 'Já feita pelo script: o tráfego voltou para as revisões da coluna "Antes".'];
  }
  if (changed.length === 0) return ['## Reversão', '', 'As revisões em uso não mudaram; não há o que reverter.'];
  return [
    '## Reversão, se precisar',
    '',
    '```powershell',
    ...changed.map(
      (service) =>
        `gcloud run services update-traffic ${service.service} --project=${receipt.projectId} --region=${receipt.region} --to-revisions=${service.previous}=100`,
    ),
    '```',
    '',
    'O esquema do banco é aditivo e não se reverte; a imagem anterior ignora colunas e tabelas novas.',
    'Confirme que a revisão anterior ainda existe (`gcloud run revisions list`) antes de usar.',
  ];
}

/** Monta o Markdown. Função pura: o mesmo recibo sempre produz o mesmo texto. */
export function renderReceipt(receipt) {
  const lines = [
    `# Recibo de publicação — ${receipt.sha.slice(0, 7)} (${receipt.status})`,
    '',
    'Gerado por `ops/gcp/production/deploy-from-main.ps1` ao terminar. Registra o que o script fez e verificou. **Não é a',
    'aprovação de Boni** e não substitui a verificação manual: leia "O que este recibo não prova" no fim.',
    '',
    '| Campo | Valor |',
    '| --- | --- |',
    `| Resultado | ${RECEIPT_STATUSES[receipt.status]} |`,
    `| Fim (UTC) | ${receipt.finishedAt} |`,
    `| SHA | \`${receipt.sha}\` |`,
    `| Build do Cloud Build | \`${receipt.buildId}\` |`,
    `| Imagem | \`${receipt.image}\` |`,
    `| Digest | \`${receipt.digest}\` |`,
    `| Projeto e região | \`${receipt.projectId}\`, \`${receipt.region}\` |`,
  ];
  if (receipt.publicOrigin) lines.push(`| URL pública verificada | ${receipt.publicOrigin} |`);
  lines.push(
    '',
    '## Revisões',
    '',
    '| Serviço | Antes | Depois |',
    '| --- | --- | --- |',
    ...receipt.services.map(
      (service) => `| \`${service.service}\` | \`${service.previous}\` | \`${service.revision}\` |`,
    ),
  );
  if (receipt.flags.length > 0) {
    lines.push(
      '',
      '## Flags de execução da API (lidas antes da troca)',
      '',
      ...receipt.flags.map((flag) => `- ${flag}`),
    );
  }
  if (receipt.failure) {
    lines.push('', '## Falha', '', `Motivo: ${receipt.failure.reason || '(não informado)'}`);
    if (receipt.failure.errors.length > 0) lines.push('', ...receipt.failure.errors.map((error) => `- ${error}`));
    if (receipt.postRollbackHealth) lines.push('', `Saúde pública depois da reversão: ${receipt.postRollbackHealth}`);
  }
  lines.push('', ...rollbackSection(receipt));
  lines.push(
    '',
    '## O que este recibo não prova',
    '',
    '- **Migrations.** O script não aplica nem confere migrations. Confira o journal por ID antes e depois (checklist, seções 2 e 6).',
    '- **Verificação manual.** A seção 8 do checklist (feita por Boni, sem compra nem reembolso reais) não é feita por este script.',
    '- **Autoria.** O recibo não registra quem rodou; isso fica no log de auditoria do Google Cloud.',
    '- **Aprovação.** Registre a decisão de Boni no `PENDENCIAS.md`, junto com este recibo.',
    '',
  );
  return lines.join('\n');
}

export function defaultReceiptDirectory() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'operations', 'deploy-receipts');
}

/** Valida, monta e grava sem sobrescrever (um recibo existente nunca é apagado). Devolve o caminho. */
export function writeReceipt(input, outDir = defaultReceiptDirectory(), now = new Date()) {
  const receipt = validateReceipt(input, now);
  mkdirSync(outDir, { recursive: true });
  const name = receiptFileName(receipt);
  let target = join(outDir, name);
  for (let counter = 2; existsSync(target); counter += 1)
    target = join(outDir, name.replace(/\.md$/, `-${counter}.md`));
  writeFileSync(target, renderReceipt(receipt), { encoding: 'utf8', flag: 'wx' });
  return target;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main(argv) {
  let outDir;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--out-dir' && argv[index + 1]) outDir = resolve(argv[++index]);
    else throw new Error('Uso: node scripts/deploy-receipt.mjs [--out-dir <pasta>] < recibo.json');
  }
  const text = (await readStdin()).replace(/^﻿/, '');
  let input;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error('A entrada não é um JSON válido.');
  }
  console.log(writeReceipt(input, outDir));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  });
}
