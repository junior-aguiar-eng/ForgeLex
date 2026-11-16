import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECEIPT_STATUSES,
  receiptFileName,
  renderReceipt,
  sanitizeText,
  validateReceipt,
  writeReceipt,
} from './deploy-receipt.mjs';

const script = fileURLToPath(new URL('./deploy-receipt.mjs', import.meta.url));
const digest = `sha256:${'a'.repeat(64)}`;
const base = () => ({
  status: 'PUBLICADO',
  finishedAt: '2026-11-16T18:15:31.000Z',
  sha: '6fe4f75fccb53deb54c395b6f534b01eb5f49e5e',
  buildId: '92e59198-23c4-4341-b6b4-96e32fe1aec7',
  digest,
  image: `southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@${digest}`,
  projectId: 'project-bbbe1209-c295-4720-867',
  region: 'southamerica-east1',
  publicUrl: 'https://example.test/readyz?token=nao-deve-aparecer',
  services: [
    {
      service: 'forgelex-closure-hml-private',
      previous: 'forgelex-closure-hml-private-af13b1c-65e7e42c',
      revision: 'forgelex-closure-hml-private-6fe4f75-92e59198',
    },
    {
      service: 'forgelex-api-prod',
      previous: 'forgelex-api-prod-af13b1c-65e7e42c',
      revision: 'forgelex-api-prod-6fe4f75-92e59198',
    },
  ],
  flags: ['FORGELEX_DRAFT_SAVE_COMMANDS_ENABLED: ligada (declarada). Confirme: migração 0041.'],
});

const directories: string[] = [];
const scratch = () => {
  const directory = mkdtempSync(join(tmpdir(), 'deploy-receipt-'));
  directories.push(directory);
  return directory;
};
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('validateReceipt', () => {
  it('normaliza o recibo e guarda só a origem da URL pública', () => {
    const receipt = validateReceipt(base());

    expect(receipt.finishedAt).toBe('2026-11-16T18:15:31.000Z');
    expect(receipt.publicOrigin).toBe('https://example.test');
    expect(JSON.stringify(receipt)).not.toContain('nao-deve-aparecer');
  });

  it.each([
    ['sha', { sha: 'abc' }],
    ['sha', { sha: 'G'.repeat(40) }],
    ['buildId', { buildId: 'nao-e-uuid' }],
    ['digest', { digest: 'sha256:curto' }],
    ['image', { image: 'imagem com espaço' }],
    ['projectId', { projectId: 'Projeto_Errado' }],
    ['region', { region: 'sul' }],
    ['status', { status: 'TALVEZ' }],
    ['publicUrl', { publicUrl: 'http://inseguro.test' }],
    ['services', { services: [] }],
  ])('recusa %s fora do formato', (field, patch) => {
    expect(() => validateReceipt({ ...base(), ...patch })).toThrow(field);
  });

  it.each(['Maiuscula', 'com espaço', 'a;b', '$(x)', '-comeca-com-hifen', ''])(
    'recusa o nome de serviço ou revisão %j',
    (name) => {
      const input = base();
      input.services[0] = { ...input.services[0]!, revision: name };
      expect(() => validateReceipt(input)).toThrow('services[0].revision');
    },
  );

  it('recusa uma data de fim inválida e usa o relógio quando ela falta', () => {
    expect(() => validateReceipt({ ...base(), finishedAt: 'ontem' })).toThrow('finishedAt');
    const { finishedAt: _omitted, ...withoutDate } = base();
    expect(validateReceipt(withoutDate, new Date('2026-01-02T03:04:05Z')).finishedAt).toBe('2026-01-02T03:04:05.000Z');
  });
});

describe('sanitizeText', () => {
  it('tira caracteres de controle, junta espaços e limita o tamanho', () => {
    expect(sanitizeText('a\n\tb\u0000c   d')).toBe('a b c d');
    expect(sanitizeText('x'.repeat(1000)).length).toBe(400);
  });

  it.each([
    ['Authorization: Bearer abc.def-123', 'abc.def-123'],
    ['password=hunter2', 'hunter2'],
    ['token: abcdef', 'abcdef'],
    ['postgres://usuario:segredo@host:5432/db', 'segredo'],
  ])('redige o que parece segredo em %j', (text, secret) => {
    const cleaned = sanitizeText(text);
    expect(cleaned).not.toContain(secret);
    expect(cleaned).toContain('[REDIGIDO]');
  });

  it('não altera texto comum', () => {
    expect(sanitizeText('A revisão x não está pronta.')).toBe('A revisão x não está pronta.');
  });
});

describe('renderReceipt', () => {
  it('registra SHA, build, digest, revisões e as flags lidas', () => {
    const text = renderReceipt(validateReceipt(base()));

    expect(text).toContain('# Recibo de publicação — 6fe4f75 (PUBLICADO)');
    expect(text).toContain('`92e59198-23c4-4341-b6b4-96e32fe1aec7`');
    expect(text).toContain(`\`${digest}\``);
    expect(text).toContain(
      '| `forgelex-api-prod` | `forgelex-api-prod-af13b1c-65e7e42c` | `forgelex-api-prod-6fe4f75-92e59198` |',
    );
    expect(text).toContain('FORGELEX_DRAFT_SAVE_COMMANDS_ENABLED: ligada');
    expect(text).toContain('https://example.test');
  });

  it('diz o que o recibo não prova', () => {
    const text = renderReceipt(validateReceipt(base()));

    for (const topic of ['Migrations', 'Verificação manual', 'Autoria', 'Aprovação']) expect(text).toContain(topic);
  });

  it('lista a reversão só dos serviços que mudaram de revisão', () => {
    const input = base();
    input.services[0] = { ...input.services[0]!, revision: input.services[0]!.previous };
    const text = renderReceipt(validateReceipt(input));

    expect(text).toContain('update-traffic forgelex-api-prod --project=project-bbbe1209-c295-4720-867');
    expect(text).toContain('--to-revisions=forgelex-api-prod-af13b1c-65e7e42c=100');
    expect(text).not.toContain('update-traffic forgelex-closure-hml-private');
  });

  it('em -NoTraffic ensina a retomar pelo build e não oferece reversão', () => {
    const text = renderReceipt(validateReceipt({ ...base(), status: 'SEM_TRAFEGO' }));

    expect(text).toContain("-ReleaseBuildId '92e59198-23c4-4341-b6b4-96e32fe1aec7'");
    expect(text).not.toContain('update-traffic');
  });

  it('numa falha revertida registra o motivo, os erros e a saúde depois da reversão', () => {
    const text = renderReceipt(
      validateReceipt({
        ...base(),
        status: 'FALHOU_REVERTIDO',
        failure: { reason: 'a API respondeu 5xx', errors: ['/readyz devolveu 503'] },
        postRollbackHealth: 'OK',
      }),
    );

    expect(text).toContain('Motivo: a API respondeu 5xx');
    expect(text).toContain('- /readyz devolveu 503');
    expect(text).toContain('Saúde pública depois da reversão: OK');
    expect(text).toContain('Já feita pelo script');
    expect(text).not.toContain('update-traffic');
  });

  it('numa reversão incompleta mantém os comandos manuais e avisa em destaque', () => {
    const text = renderReceipt(validateReceipt({ ...base(), status: 'FALHOU_SEM_REVERSAO' }));

    expect(text).toContain(RECEIPT_STATUSES.FALHOU_SEM_REVERSAO);
    expect(text).toContain('update-traffic forgelex-closure-hml-private');
  });

  it('é determinístico', () => {
    const receipt = validateReceipt(base());
    expect(renderReceipt(receipt)).toBe(renderReceipt(receipt));
  });
});

describe('receiptFileName', () => {
  it('usa a data UTC, a hora, o SHA curto e o resultado', () => {
    expect(receiptFileName(validateReceipt(base()))).toBe('2026-11-16-1815Z-6fe4f75-publicado.md');
    expect(receiptFileName(validateReceipt({ ...base(), status: 'FALHOU_SEM_REVERSAO' }))).toBe(
      '2026-11-16-1815Z-6fe4f75-falhou-sem-reversao.md',
    );
  });
});

describe('writeReceipt', () => {
  it('cria a pasta, grava o recibo e nunca sobrescreve um existente', () => {
    const directory = join(scratch(), 'nova', 'pasta');

    const first = writeReceipt(base(), directory);
    const second = writeReceipt(base(), directory);

    expect(first).not.toBe(second);
    expect(second).toMatch(/-publicado-2\.md$/);
    expect(readdirSync(directory)).toHaveLength(2);
    expect(readFileSync(first, 'utf8')).toContain('# Recibo de publicação — 6fe4f75');
  });

  it('não grava nada quando o recibo é inválido', () => {
    const directory = scratch();

    expect(() => writeReceipt({ ...base(), sha: 'x' }, directory)).toThrow('sha');
    expect(readdirSync(directory)).toHaveLength(0);
  });
});

describe('linha de comando', () => {
  const run = (input: string, args: string[] = []) =>
    spawnSync(process.execPath, [script, ...args], { input, encoding: 'utf8' });

  it('lê o JSON da entrada padrão e imprime o caminho do arquivo gravado', () => {
    const directory = scratch();

    const result = run(JSON.stringify(base()), ['--out-dir', directory]);

    expect(result.status).toBe(0);
    const printed = result.stdout.trim();
    expect(printed.startsWith(directory)).toBe(true);
    expect(existsSync(printed)).toBe(true);
  });

  it('aceita um JSON com BOM, como o PowerShell pode enviar', () => {
    const directory = scratch();

    expect(run(`﻿${JSON.stringify(base())}`, ['--out-dir', directory]).status).toBe(0);
  });

  it.each([
    ['JSON inválido', 'isto não é json', 'JSON válido'],
    ['campo inválido', JSON.stringify({ ...base(), buildId: 'x' }), 'buildId'],
  ])('termina com código 2 e diz o motivo: %s', (_name, input, message) => {
    const directory = scratch();

    const result = run(input, ['--out-dir', directory]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(message);
    expect(readdirSync(directory)).toHaveLength(0);
  });

  it('recusa argumentos desconhecidos', () => {
    expect(run('{}', ['--faz-outra-coisa']).status).toBe(2);
  });
});
