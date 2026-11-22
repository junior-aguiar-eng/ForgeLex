import { analiseMigrations } from '@forgelex/analise-juridica';
import { ledgerMigrations } from '@forgelex/billing-ledger';
import {
  createDatabase,
  draftSaveCommandsMigration,
  persistenceMigrations,
  runMigrations,
  type SqlMigration,
} from '@forgelex/persistence';

type Client = Awaited<ReturnType<typeof createDatabase>>['client'];

/**
 * Ferramenta de migrations de produção. Roda como Cloud Run Job (ou local) e tem três modos:
 *  - `inspect`: lê o journal e contagens de dados; não altera nada;
 *  - `apply`: aplica SOMENTE as migrations listadas em `--allow=<id>`, uma a uma;
 *  - `verify`: confere que o journal está completo e sem IDs desconhecidos.
 * Falha fechada: alvo diferente do esperado, ID desconhecido no journal ou migration faltando fora da autorização
 * terminam com erro antes de qualquer escrita. Nenhuma mensagem de erro carrega URL, senha ou SQL.
 */

export const MIGRATION_MODES = ['inspect', 'apply', 'verify'] as const;
export type MigrationMode = (typeof MIGRATION_MODES)[number];

export class MigrationCommandError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MigrationCommandError';
  }
}

/** Todas as migrations que o produto conhece, na ordem em que a produção as aplica. */
export function allMigrationDefinitions(): readonly SqlMigration[] {
  const seen = new Set<string>();
  const definitions: SqlMigration[] = [];
  for (const migration of [
    ...persistenceMigrations,
    draftSaveCommandsMigration,
    ...ledgerMigrations,
    ...analiseMigrations,
  ]) {
    if (seen.has(migration.id)) continue;
    seen.add(migration.id);
    definitions.push(migration);
  }
  return definitions;
}

export interface MigrationArguments {
  readonly mode: MigrationMode;
  readonly allow: readonly string[];
}

export function parseMigrationArguments(args: readonly string[]): MigrationArguments {
  const [mode, ...rest] = args;
  if (!mode || !(MIGRATION_MODES as readonly string[]).includes(mode)) {
    throw new MigrationCommandError('MIGRATION_ARGUMENT_INVALID', `Use um modo: ${MIGRATION_MODES.join(', ')}.`);
  }
  const allow: string[] = [];
  for (const argument of rest) {
    const match = /^--allow=([a-z0-9][a-z0-9-]*)$/.exec(argument);
    if (!match) {
      throw new MigrationCommandError('MIGRATION_ARGUMENT_INVALID', 'Argumento desconhecido; use --allow=<id>.');
    }
    if (!allow.includes(match[1]!)) allow.push(match[1]!);
  }
  if (mode === 'apply' && allow.length === 0) {
    throw new MigrationCommandError('MIGRATION_NOT_AUTHORIZED', 'apply exige ao menos um --allow=<id>.');
  }
  if (mode === 'inspect' && allow.length > 0) {
    throw new MigrationCommandError('MIGRATION_ARGUMENT_INVALID', 'inspect não aceita --allow.');
  }
  return { mode: mode as MigrationMode, allow };
}

export interface MigrationTarget {
  readonly url: string;
  readonly database: string;
  readonly host: string;
}

/**
 * Confere, antes de abrir a conexão, que a URL aponta para o banco e o host esperados. Os valores esperados vêm de
 * variáveis próprias e são obrigatórios: sem eles a ferramenta não roda, em vez de aceitar qualquer destino.
 */
export function resolveMigrationTarget(environment: Record<string, string | undefined>): MigrationTarget {
  const url = environment.FORGELEX_DATABASE_URL ?? environment.DATABASE_URL;
  const expectedDatabase = environment.FORGELEX_MIGRATION_EXPECTED_DATABASE;
  const expectedHost = environment.FORGELEX_MIGRATION_EXPECTED_HOST;
  if (!url) throw new MigrationCommandError('MIGRATION_DATABASE_REQUIRED', 'Defina DATABASE_URL.');
  if (!expectedDatabase || !expectedHost) {
    throw new MigrationCommandError(
      'MIGRATION_TARGET_UNCONFIGURED',
      'Defina FORGELEX_MIGRATION_EXPECTED_DATABASE e FORGELEX_MIGRATION_EXPECTED_HOST.',
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new MigrationCommandError('MIGRATION_DATABASE_INVALID', 'DATABASE_URL não é uma URL válida.');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new MigrationCommandError('MIGRATION_DATABASE_INVALID', 'DATABASE_URL deve ser PostgreSQL.');
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  // Cloud SQL por socket: o host vem no parâmetro `host`; do contrário, o do próprio URL.
  const host = parsed.searchParams.get('host') ?? parsed.hostname;
  if (database !== expectedDatabase || host !== expectedHost) {
    throw new MigrationCommandError(
      'MIGRATION_TARGET_UNEXPECTED',
      'O banco ou o host de DATABASE_URL não é o esperado; nada foi lido nem alterado.',
    );
  }
  return { url, database, host };
}

export interface JournalClassification {
  readonly applied: readonly string[];
  readonly missing: readonly string[];
  readonly unknown: readonly string[];
}

export function classifyJournal(
  journalIds: readonly string[],
  definitions: readonly SqlMigration[] = allMigrationDefinitions(),
): JournalClassification {
  const known = new Set(definitions.map((definition) => definition.id));
  const present = new Set(journalIds);
  return {
    applied: definitions.filter((definition) => present.has(definition.id)).map((definition) => definition.id),
    missing: definitions.filter((definition) => !present.has(definition.id)).map((definition) => definition.id),
    unknown: [...present].filter((id) => !known.has(id)).sort(),
  };
}

/** Decide o que `apply` pode aplicar. Lança antes de qualquer escrita se o inventário ou a autorização não bater. */
export function planApply(
  classification: JournalClassification,
  allow: readonly string[],
  definitions: readonly SqlMigration[] = allMigrationDefinitions(),
): readonly string[] {
  const known = new Set(definitions.map((definition) => definition.id));
  const typos = allow.filter((id) => !known.has(id));
  if (typos.length > 0) {
    throw new MigrationCommandError('MIGRATION_ALLOW_UNKNOWN', `--allow com ID inexistente: ${typos.join(', ')}.`);
  }
  if (classification.unknown.length > 0) {
    throw new MigrationCommandError(
      'MIGRATION_INVENTORY_UNEXPECTED',
      `O journal tem IDs que este código não conhece: ${classification.unknown.join(', ')}.`,
    );
  }
  const outside = classification.missing.filter((id) => !allow.includes(id));
  if (outside.length > 0) {
    throw new MigrationCommandError(
      'MIGRATION_NOT_AUTHORIZED',
      `Faltam migrations fora da autorização: ${outside.join(', ')}.`,
    );
  }
  return classification.missing;
}

export interface MigrationSnapshot {
  readonly database: string;
  readonly journalExists: boolean;
  readonly journalIds: readonly string[];
  /** Contagens de dados que as migrations recentes poderiam afetar; `null` quando a tabela (ou coluna) não existe. */
  readonly counts: Readonly<Record<string, number | null>>;
}

const COUNT_PROBES = [
  { label: 'matters', table: 'matters' },
  { label: 'drafts', table: 'drafts' },
  { label: 'ledger_entries', table: 'ledger_entries' },
  { label: 'agentic_execution_jobs', table: 'agentic_execution_jobs' },
  { label: 'webhook_deliveries', table: 'webhook_deliveries' },
  { label: 'billing_refund_requests', table: 'billing_refund_requests' },
] as const;

/** Linhas com valor numa coluna que uma migration apaga ou move (hoje: o corpo de resposta de webhook da 0042). */
const NON_NULL_PROBES = [
  { label: 'webhook_deliveries_with_response_body', table: 'webhook_deliveries', column: 'response_body_excerpt' },
] as const;

type Executor = { execute(statement: string | { sql: string; args?: unknown[] }): Promise<{ rows: unknown[] }> };

async function scalar(executor: Executor, sql: string, args: unknown[] = []): Promise<Record<string, unknown>> {
  const result = await executor.execute({ sql, args });
  return (result.rows[0] ?? {}) as Record<string, unknown>;
}

/** Leitura consistente: uma transação REPEATABLE READ somente leitura, com limite de tempo. */
export async function readSnapshot(client: Client, expectedDatabase: string): Promise<MigrationSnapshot> {
  const transaction = await (
    client as unknown as { transaction(mode?: string): Promise<Executor & { rollback(): Promise<void> }> }
  ).transaction('read');
  try {
    await transaction.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    await transaction.execute("SET LOCAL statement_timeout = '20s'");
    const database = String((await scalar(transaction, 'SELECT current_database() AS name')).name);
    if (database !== expectedDatabase) {
      throw new MigrationCommandError('MIGRATION_TARGET_UNEXPECTED', 'A conexão abriu um banco diferente do esperado.');
    }
    const tableExists = async (table: string) =>
      (await scalar(transaction, 'SELECT to_regclass(?) IS NOT NULL AS present', [`public.${table}`])).present === true;
    const columnExists = async (table: string, column: string) =>
      (
        await scalar(
          transaction,
          `SELECT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = ? AND column_name = ?) AS present`,
          [table, column],
        )
      ).present === true;

    const journalExists = await tableExists('forgelex_migrations');
    const journalIds = journalExists
      ? (await transaction.execute('SELECT id FROM forgelex_migrations ORDER BY id')).rows.map((row) =>
          String((row as Record<string, unknown>).id),
        )
      : [];

    const counts: Record<string, number | null> = {};
    for (const probe of COUNT_PROBES) {
      counts[probe.label] = (await tableExists(probe.table))
        ? Number((await scalar(transaction, `SELECT COUNT(*) AS n FROM ${probe.table}`)).n)
        : null;
    }
    for (const probe of NON_NULL_PROBES) {
      counts[probe.label] =
        (await tableExists(probe.table)) && (await columnExists(probe.table, probe.column))
          ? Number(
              (await scalar(transaction, `SELECT COUNT(*) AS n FROM ${probe.table} WHERE ${probe.column} IS NOT NULL`))
                .n,
            )
          : null;
    }
    return { database, journalExists, journalIds, counts };
  } finally {
    await transaction.rollback();
  }
}

export interface MigrationReport {
  readonly event: 'migration.completed';
  readonly mode: MigrationMode;
  readonly measuredAt: string;
  readonly database: string;
  readonly journalEntries: number;
  readonly applied: readonly string[];
  readonly missing: readonly string[];
  readonly unknown: readonly string[];
  readonly counts: Readonly<Record<string, number | null>>;
  /** Só em `apply`: o que foi aplicado agora e o estado antes. */
  readonly appliedNow?: readonly string[];
  readonly before?: {
    readonly journalEntries: number;
    readonly missing: readonly string[];
    readonly counts: MigrationSnapshot['counts'];
  };
}

export interface MigrationRuntime {
  readonly client?: Client;
  readonly emit?: (event: Record<string, unknown>) => void;
  readonly definitions?: readonly SqlMigration[];
  readonly now?: () => Date;
}

function report(
  mode: MigrationMode,
  snapshot: MigrationSnapshot,
  classification: JournalClassification,
  measuredAt: Date,
): MigrationReport {
  return {
    event: 'migration.completed',
    mode,
    measuredAt: measuredAt.toISOString(),
    database: snapshot.database,
    journalEntries: snapshot.journalIds.length,
    applied: classification.applied,
    missing: classification.missing,
    unknown: classification.unknown,
    counts: snapshot.counts,
  };
}

export async function runMigrationCommand(
  args: readonly string[],
  environment: Record<string, string | undefined>,
  runtime: MigrationRuntime = {},
): Promise<MigrationReport> {
  const command = parseMigrationArguments(args);
  const target = resolveMigrationTarget(environment);
  const definitions = runtime.definitions ?? allMigrationDefinitions();
  const emit = runtime.emit ?? (() => undefined);
  const now = runtime.now ?? (() => new Date());
  const owned = runtime.client === undefined;
  const client = runtime.client ?? (await createDatabase({ url: target.url })).client;
  try {
    const before = await readSnapshot(client, target.database);
    const beforeClass = classifyJournal(before.journalIds, definitions);
    emit({
      stage: 'before',
      mode: command.mode,
      journalEntries: before.journalIds.length,
      missing: beforeClass.missing,
    });

    if (command.mode === 'inspect') return report('inspect', before, beforeClass, now());

    if (command.mode === 'verify') {
      if (beforeClass.unknown.length > 0 || beforeClass.missing.length > 0) {
        throw new MigrationCommandError(
          'MIGRATION_VERIFICATION_FAILED',
          `Journal incompleto ou com IDs desconhecidos (faltam: ${beforeClass.missing.join(', ') || 'nenhuma'}; desconhecidas: ${beforeClass.unknown.join(', ') || 'nenhuma'}).`,
        );
      }
      return report('verify', before, beforeClass, now());
    }

    const planned = planApply(beforeClass, command.allow, definitions);
    for (const id of planned) {
      const definition = definitions.find((candidate) => candidate.id === id)!;
      await runMigrations(client, [definition]);
      emit({ stage: 'applied', id });
    }

    const after = await readSnapshot(client, target.database);
    const afterClass = classifyJournal(after.journalIds, definitions);
    if (afterClass.missing.length > 0 || afterClass.unknown.length > 0) {
      throw new MigrationCommandError(
        'MIGRATION_VERIFICATION_FAILED',
        `Depois de aplicar, o journal ainda não confere (faltam: ${afterClass.missing.join(', ') || 'nenhuma'}).`,
      );
    }
    return {
      ...report('apply', after, afterClass, now()),
      appliedNow: planned,
      before: { journalEntries: before.journalIds.length, missing: beforeClass.missing, counts: before.counts },
    };
  } finally {
    if (owned) client.close();
  }
}
