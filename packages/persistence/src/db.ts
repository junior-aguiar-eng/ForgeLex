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

class PostgresTransaction {
  private readonly statements: ExecutableStatement[] = [];
  public constructor(private readonly sql: Sql, private finished = false) {}
  public async execute(statement: string | ExecutableStatement): Promise<ExecutionResult> {
    if (this.finished) throw new Error('POSTGRES_TRANSACTION_CLOSED');
    this.statements.push(typeof statement === 'string' ? { sql: statement } : statement);
    return { rows: [], rowsAffected: 1 };
  }
  public async commit(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    const statements = [...this.statements];
    await this.sql.begin(async (transaction) => {
      for (const statement of statements) await transaction.unsafe(postgresStatement(statement.sql), (statement.args ?? []) as any[]);
    });
  }
  public async rollback(): Promise<void> {
    this.finished = true;
    this.statements.length = 0;
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
    const sql = postgres(url, { max: 10, onnotice: () => undefined });
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
