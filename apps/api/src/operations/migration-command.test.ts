import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createDatabase, runMigrations } from '@forgelex/persistence';
import {
  MigrationCommandError,
  allMigrationDefinitions,
  classifyJournal,
  parseMigrationArguments,
  planApply,
  readSnapshot,
  resolveMigrationTarget,
  runMigrationCommand,
} from './migration-command.js';

const THREE = [
  'persistence-0042-webhook-admission',
  'persistence-0043-execution-stream-leases',
  'billing-ledger-0011-refund-recovery',
];
const target = {
  DATABASE_URL: 'postgres://u:senha-secreta@127.0.0.1:5432/forgelex',
  FORGELEX_MIGRATION_EXPECTED_DATABASE: 'forgelex',
  FORGELEX_MIGRATION_EXPECTED_HOST: '127.0.0.1',
};

async function codeOf(promise: Promise<unknown> | (() => unknown)): Promise<string> {
  try {
    await (typeof promise === 'function' ? promise() : promise);
  } catch (error) {
    expect(error).toBeInstanceOf(MigrationCommandError);
    return (error as MigrationCommandError).code;
  }
  throw new Error('esperava um erro');
}

describe('definições', () => {
  it('reúne persistência, 0041, ledger e análise sem repetir IDs', () => {
    const ids = allMigrationDefinitions().map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('persistence-0041-draft-save-commands');
    for (const id of THREE) expect(ids).toContain(id);
    // Em 16/11/2026 a produção terminou com 57 entradas; mudar isso é decisão consciente, não acidente.
    expect(ids.length).toBeGreaterThanOrEqual(57);
  });
});

describe('parseMigrationArguments', () => {
  it('aceita os três modos e vários --allow, sem repetir', () => {
    expect(parseMigrationArguments(['inspect'])).toEqual({ mode: 'inspect', allow: [] });
    expect(parseMigrationArguments(['verify'])).toEqual({ mode: 'verify', allow: [] });
    expect(parseMigrationArguments(['apply', '--allow=a-1', '--allow=b-2', '--allow=a-1'])).toEqual({
      mode: 'apply',
      allow: ['a-1', 'b-2'],
    });
  });

  it.each([
    [[], 'MIGRATION_ARGUMENT_INVALID'],
    [['inspect', 'x'], 'MIGRATION_ARGUMENT_INVALID'],
    [['migrate'], 'MIGRATION_ARGUMENT_INVALID'],
    [['inspect', '--allow=abc'], 'MIGRATION_ARGUMENT_INVALID'],
    [['apply', '--allow=Com Espaço'], 'MIGRATION_ARGUMENT_INVALID'],
    [['apply', '--all'], 'MIGRATION_ARGUMENT_INVALID'],
    [['apply'], 'MIGRATION_NOT_AUTHORIZED'],
  ])('recusa %j', async (args, code) => {
    expect(await codeOf(() => parseMigrationArguments(args))).toBe(code);
  });
});

describe('resolveMigrationTarget', () => {
  it('aceita o banco e o host esperados, inclusive o socket do Cloud SQL', () => {
    expect(resolveMigrationTarget(target).database).toBe('forgelex');
    const socket = resolveMigrationTarget({
      DATABASE_URL: 'postgres://u:p@localhost/forgelex?host=/cloudsql/proj:regiao:inst',
      FORGELEX_MIGRATION_EXPECTED_DATABASE: 'forgelex',
      FORGELEX_MIGRATION_EXPECTED_HOST: '/cloudsql/proj:regiao:inst',
    });
    expect(socket.host).toBe('/cloudsql/proj:regiao:inst');
  });

  it.each([
    ['banco diferente', { DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/outro' }, 'MIGRATION_TARGET_UNEXPECTED'],
    ['host diferente', { DATABASE_URL: 'postgres://u:p@10.0.0.9:5432/forgelex' }, 'MIGRATION_TARGET_UNEXPECTED'],
    [
      'socket diferente',
      { DATABASE_URL: 'postgres://u:p@localhost/forgelex?host=/cloudsql/outra' },
      'MIGRATION_TARGET_UNEXPECTED',
    ],
    ['sem URL', { DATABASE_URL: undefined }, 'MIGRATION_DATABASE_REQUIRED'],
    ['URL inválida', { DATABASE_URL: 'isto não é url' }, 'MIGRATION_DATABASE_INVALID'],
    ['não PostgreSQL', { DATABASE_URL: 'file:local.db' }, 'MIGRATION_DATABASE_INVALID'],
    ['sem banco esperado', { FORGELEX_MIGRATION_EXPECTED_DATABASE: undefined }, 'MIGRATION_TARGET_UNCONFIGURED'],
    ['sem host esperado', { FORGELEX_MIGRATION_EXPECTED_HOST: undefined }, 'MIGRATION_TARGET_UNCONFIGURED'],
  ])('recusa %s', async (_name, patch, code) => {
    expect(await codeOf(() => resolveMigrationTarget({ ...target, ...patch }))).toBe(code);
  });

  it('nunca repete a URL, a senha ou o usuário na mensagem de erro', () => {
    try {
      resolveMigrationTarget({ ...target, DATABASE_URL: 'postgres://u:senha-secreta@10.0.0.9/forgelex' });
    } catch (error) {
      expect(String((error as Error).message)).not.toMatch(/senha-secreta|10\.0\.0\.9/);
      return;
    }
    throw new Error('esperava um erro');
  });
});

describe('classifyJournal e planApply', () => {
  const definitions = [
    { id: 'a', statements: [] },
    { id: 'b', statements: [] },
    { id: 'c', statements: [] },
  ];

  it('separa aplicadas, faltantes e desconhecidas', () => {
    expect(classifyJournal(['a', 'x'], definitions)).toEqual({ applied: ['a'], missing: ['b', 'c'], unknown: ['x'] });
  });

  it('autoriza só o que falta e está na lista', () => {
    expect(planApply(classifyJournal(['a'], definitions), ['b', 'c'], definitions)).toEqual(['b', 'c']);
    expect(planApply(classifyJournal(['a', 'b', 'c'], definitions), ['b'], definitions)).toEqual([]);
  });

  it('recusa faltante fora da autorização, ID desconhecido e --allow com erro de digitação', async () => {
    expect(await codeOf(() => planApply(classifyJournal(['a'], definitions), ['b'], definitions))).toBe(
      'MIGRATION_NOT_AUTHORIZED',
    );
    expect(await codeOf(() => planApply(classifyJournal(['a', 'x'], definitions), ['b', 'c'], definitions))).toBe(
      'MIGRATION_INVENTORY_UNEXPECTED',
    );
    expect(await codeOf(() => planApply(classifyJournal(['a'], definitions), ['b', 'cc'], definitions))).toBe(
      'MIGRATION_ALLOW_UNKNOWN',
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Integração com PostgreSQL de verdade: roda na CI (job postgres) e localmente com FORGELEX_LOCAL_POSTGRES_URL.
const adminUrl = process.env.FORGELEX_LOCAL_POSTGRES_URL;
const local = Boolean(
  adminUrl && /^postgres(?:ql)?:\/\/(?:[^/]+@)?(?:localhost|127\.0\.0\.1)(?::\d+)?\//i.test(adminUrl),
);

async function withDatabase(
  run: (context: { name: string; env: Record<string, string>; url: string }) => Promise<void>,
) {
  const name = `migtest_${randomUUID().replaceAll('-', '')}`;
  const admin = postgres(adminUrl!, { max: 1, onnotice: () => undefined });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = new URL(adminUrl!);
  url.pathname = `/${name}`;
  const env = {
    DATABASE_URL: url.toString(),
    FORGELEX_MIGRATION_EXPECTED_DATABASE: name,
    FORGELEX_MIGRATION_EXPECTED_HOST: url.hostname,
  };
  try {
    await run({ name, env, url: url.toString() });
  } finally {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }
}

async function migrateAllExcept(url: string, excluded: readonly string[]) {
  const { client } = await createDatabase({ url });
  try {
    await runMigrations(
      client,
      allMigrationDefinitions().filter((definition) => !excluded.includes(definition.id)),
    );
  } finally {
    client.close();
  }
}

async function journal(url: string): Promise<string[]> {
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    const exists = await sql`SELECT to_regclass('public.forgelex_migrations') IS NOT NULL AS present`;
    if (!exists[0]?.present) return [];
    return (await sql`SELECT id FROM forgelex_migrations ORDER BY id`).map((row) => String(row.id));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

describe.skipIf(!local)('ferramenta de migrations contra PostgreSQL', () => {
  it('inspect num banco vazio não cria nem altera nada', async () => {
    await withDatabase(async ({ env, url }) => {
      const result = await runMigrationCommand(['inspect'], env);

      expect(result.journalEntries).toBe(0);
      expect(result.missing).toEqual(allMigrationDefinitions().map((definition) => definition.id));
      expect(result.counts.matters).toBeNull();
      expect(await journal(url)).toEqual([]);
      const sql = postgres(url, { max: 1 });
      try {
        expect((await sql`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'`)[0]!.n).toBe(0);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('apply sem autorização suficiente não aplica nada', async () => {
    await withDatabase(async ({ env, url }) => {
      await migrateAllExcept(url, THREE);
      const before = await journal(url);

      expect(await codeOf(runMigrationCommand(['apply', `--allow=${THREE[0]}`], env))).toBe('MIGRATION_NOT_AUTHORIZED');
      expect(await journal(url)).toEqual(before);
    });
  });

  it('apply das três autorizadas: aplica só elas, confere e o verify passa', async () => {
    await withDatabase(async ({ env, url }) => {
      await migrateAllExcept(url, THREE);
      const sql = postgres(url, { max: 1, onnotice: () => undefined });
      try {
        // Um corpo de resposta gravado: a 0042 o apaga, e o relatório precisa mostrar isso antes e depois.
        await sql.unsafe('SET session_replication_role = replica');
        await sql.unsafe(
          `INSERT INTO webhook_deliveries (id, event_id, endpoint_id, tenant_id, next_attempt_at, response_body_excerpt, created_at, updated_at)
           VALUES ('d1', 'e1', 'p1', 't1', 'x', 'corpo', 'x', 'x')`,
        );
      } finally {
        await sql.end({ timeout: 5 });
      }
      const events: Record<string, unknown>[] = [];

      const result = await runMigrationCommand(['apply', ...THREE.map((id) => `--allow=${id}`)], env, {
        emit: (event) => events.push(event),
      });

      expect(result.appliedNow).toEqual(THREE.filter((id) => allMigrationDefinitions().some((d) => d.id === id)));
      expect(result.missing).toEqual([]);
      expect(result.before?.missing).toEqual(THREE);
      expect(result.before?.counts.webhook_deliveries_with_response_body).toBe(1);
      expect(result.counts.webhook_deliveries_with_response_body).toBe(0);
      expect(events.filter((event) => event.stage === 'applied').map((event) => event.id)).toEqual(THREE);
      expect((await journal(url)).length).toBe(allMigrationDefinitions().length);
      expect((await runMigrationCommand(['verify'], env)).missing).toEqual([]);
      // Reexecutar é inofensivo: não há o que aplicar.
      expect((await runMigrationCommand(['apply', ...THREE.map((id) => `--allow=${id}`)], env)).appliedNow).toEqual([]);
    });
  });

  it('verify falha enquanto faltar migration', async () => {
    await withDatabase(async ({ env, url }) => {
      await migrateAllExcept(url, THREE);

      expect(await codeOf(runMigrationCommand(['verify'], env))).toBe('MIGRATION_VERIFICATION_FAILED');
    });
  });

  it('recusa um journal com ID desconhecido, sem aplicar nada', async () => {
    await withDatabase(async ({ env, url }) => {
      await migrateAllExcept(url, THREE);
      const sql = postgres(url, { max: 1 });
      try {
        await sql`INSERT INTO forgelex_migrations (id, applied_at) VALUES ('persistence-9999-futura', 'x')`;
      } finally {
        await sql.end({ timeout: 5 });
      }
      const before = await journal(url);

      expect(await codeOf(runMigrationCommand(['apply', ...THREE.map((id) => `--allow=${id}`)], env))).toBe(
        'MIGRATION_INVENTORY_UNEXPECTED',
      );
      expect(await journal(url)).toEqual(before);
    });
  });

  it('recusa um banco diferente do esperado antes de conectar', async () => {
    await withDatabase(async ({ env }) => {
      const wrong = { ...env, FORGELEX_MIGRATION_EXPECTED_DATABASE: 'forgelex_outro' };

      expect(await codeOf(runMigrationCommand(['inspect'], wrong))).toBe('MIGRATION_TARGET_UNEXPECTED');
    });
  });

  it('o snapshot recusa uma conexão que abriu outro banco, mesmo com a URL esperada', async () => {
    await withDatabase(async ({ url }) => {
      const { client } = await createDatabase({ url });
      try {
        expect(await codeOf(readSnapshot(client, 'forgelex_outro'))).toBe('MIGRATION_TARGET_UNEXPECTED');
      } finally {
        client.close();
      }
    });
  });

  it('apply falha se, depois de aplicar, a migration não aparece no journal', async () => {
    await withDatabase(async ({ env, url }) => {
      // A regra descarta o INSERT do journal: a migration "roda", mas o registro não fica.
      const ghost = {
        id: 'ghost-0001',
        statements: [
          `CREATE RULE ghost_skip AS ON INSERT TO forgelex_migrations WHERE NEW.id = 'ghost-0001' DO INSTEAD NOTHING`,
        ],
      };

      expect(await codeOf(runMigrationCommand(['apply', '--allow=ghost-0001'], env, { definitions: [ghost] }))).toBe(
        'MIGRATION_VERIFICATION_FAILED',
      );
      expect(await journal(url)).toEqual([]);
    });
  });

  it('a leitura do snapshot é somente leitura', async () => {
    await withDatabase(async ({ name, url }) => {
      const { client } = await createDatabase({ url });
      try {
        const statements: string[] = [];
        const spy = new Proxy(client, {
          get(target, property, receiver) {
            if (property !== 'transaction') return Reflect.get(target, property, receiver);
            return async (...args: unknown[]) => {
              const transaction = await (
                target as unknown as {
                  transaction(...a: unknown[]): Promise<{ execute(s: unknown): Promise<unknown> }>;
                }
              ).transaction(...args);
              return new Proxy(transaction, {
                get(inner, key, innerReceiver) {
                  if (key !== 'execute') return Reflect.get(inner, key, innerReceiver);
                  return (statement: unknown) => {
                    statements.push(
                      typeof statement === 'string' ? statement : String((statement as { sql: string }).sql),
                    );
                    return inner.execute(statement);
                  };
                },
              });
            };
          },
        });

        await readSnapshot(spy, name);

        expect(statements[0]).toMatch(/REPEATABLE READ, READ ONLY/);
        expect(statements.some((statement) => /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/i.test(statement))).toBe(
          false,
        );
      } finally {
        client.close();
      }
    });
  });
});
