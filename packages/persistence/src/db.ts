import { createClient, Client } from '@libsql/client';
import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema/schema.js';

export interface DatabaseConfig {
  url?: string;
  authToken?: string;
  driver?: 'sqlite' | 'postgres';
}

export type ForgeLexDatabase = LibSQLDatabase<typeof schema> & {
  readonly $forgelexDialect: 'sqlite' | 'postgres';
};

interface ExecutableStatement { sql: string; args?: unknown[]; }
interface ExecutionResult { rows: Record<string, unknown>[]; rowsAffected: number; }

function postgresStatement(statement: string): string {
  let index = 0;
  return statement.replace(/\?/g, () => `$${++index}`);
}

export function normalizePostgresConnection(url: string): Readonly<{ url: string; host?: string }> {
  const parsed = new URL(url);
  const host = parsed.searchParams.get('host') ?? undefined;
  if (host) parsed.searchParams.delete('host');
  return Object.freeze({ url: parsed.toString(), ...(host ? { host } : {}) });
}

const postgresRollbackSignal = new Error('POSTGRES_TRANSACTION_ROLLBACK');

class PostgresTransaction {
  private readonly ready: Promise<Sql>;
  private readonly finish: Promise<'commit' | 'rollback'>;
  private readonly transactionPromise: Promise<void>;
  private resolveFinish!: (action: 'commit' | 'rollback') => void;
  private finished = false;

  public constructor(sql: Sql) {
    let resolveReady!: (transaction: Sql) => void;
    let rejectReady!: (error: unknown) => void;
    this.ready = new Promise<Sql>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    this.finish = new Promise<'commit' | 'rollback'>((resolve) => {
      this.resolveFinish = resolve;
    });
    this.transactionPromise = sql.begin(async (transaction) => {
      resolveReady(transaction as unknown as Sql);
      if (await this.finish === 'rollback') throw postgresRollbackSignal;
    }).then(() => undefined).catch((error: unknown) => {
      rejectReady(error);
      if (error !== postgresRollbackSignal) throw error;
    });
  }

  public async execute(statement: string | ExecutableStatement): Promise<ExecutionResult> {
    if (this.finished) throw new Error('POSTGRES_TRANSACTION_CLOSED');
    const input = typeof statement === 'string' ? { sql: statement, args: [] } : { sql: statement.sql, args: statement.args ?? [] };
    const transaction = await this.ready;
    const rows = await transaction.unsafe(postgresStatement(input.sql), input.args as any[]);
    return { rows: rows as unknown as Record<string, unknown>[], rowsAffected: rows.count ?? rows.length };
  }
  public async commit(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.resolveFinish('commit');
    await this.transactionPromise;
  }
  public async rollback(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.resolveFinish('rollback');
    await this.transactionPromise;
  }
}

class PostgresClientAdapter {
  public readonly forgelexDialect = 'postgres' as const;
  public constructor(private readonly sql: Sql) {}
  public async execute(statement: string | ExecutableStatement): Promise<ExecutionResult> {
    const input = typeof statement === 'string' ? { sql: statement, args: [] } : { sql: statement.sql, args: statement.args ?? [] };
    const rows = await this.sql.unsafe(postgresStatement(input.sql), input.args as any[]);
    return { rows: rows as unknown as Record<string, unknown>[], rowsAffected: rows.count ?? rows.length };
  }
  public async transaction(): Promise<PostgresTransaction> { return new PostgresTransaction(this.sql); }
  public close(): void { void this.sql.end({ timeout: 5 }); }
}

export async function createDatabase(config: DatabaseConfig = {}): Promise<{
  db: ForgeLexDatabase;
  client: Client;
}> {
  const url = config.url ?? 'file::memory:?cache=shared';
  const isPostgres = config.driver === 'postgres' || url.startsWith('postgres://') || url.startsWith('postgresql://');
  if (isPostgres) {
    const connection = normalizePostgresConnection(url);
    const sql = postgres(connection.url, { max: 10, ...(connection.host ? { host: connection.host } : {}), onnotice: () => undefined });
    const db = drizzlePostgres(sql, { schema }) as unknown as ForgeLexDatabase;
    Object.defineProperty(db, '$forgelexDialect', { value: 'postgres', enumerable: false });
    return { db, client: new PostgresClientAdapter(sql) as unknown as Client };
  }
  const client = createClient({
    url,
    authToken: config.authToken,
  });

  const db = drizzle(client, { schema }) as unknown as ForgeLexDatabase;
  Object.defineProperty(db, '$forgelexDialect', { value: 'sqlite', enumerable: false });

  return { db, client };
}
