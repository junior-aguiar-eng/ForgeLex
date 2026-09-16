import { createClient, Client } from '@libsql/client';
import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema/schema.js';

export interface DatabaseConfig {
  url?: string;
  authToken?: string;
}

export type ForgeLexDatabase = LibSQLDatabase<typeof schema>;

export async function createDatabase(config: DatabaseConfig = {}): Promise<{
  db: ForgeLexDatabase;
  client: Client;
}> {
  const url = config.url ?? 'file::memory:?cache=shared';
  const client = createClient({
    url,
    authToken: config.authToken,
  });

  const db = drizzle(client, { schema });

  return { db, client };
}
