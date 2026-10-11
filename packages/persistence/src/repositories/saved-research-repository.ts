import { randomUUID } from 'node:crypto';
import type { Client } from '@libsql/client';

export interface ResearchOwner { tenantId: string; userId: string }
export interface ResearchConnection { clientId: string; grantedAt: string }
export interface SavedResearchCriteria { query: string; court?: string; judgmentYear?: number; limit: number }
export interface SavedResearchRecord {
  id: string; operationId: string; snapshot: string; criteria: SavedResearchCriteria;
  resultCount: number; searchedAt: string; savedAt: string;
}
type Executor = Pick<Client, 'execute'>;
export function savedResearchError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}
function record(row: Record<string, unknown>): SavedResearchRecord {
  return { id: String(row.id), operationId: String(row.operation_id), snapshot: String(row.result_snapshot),
    criteria: JSON.parse(String(row.criteria_json)) as SavedResearchCriteria, resultCount: Number(row.result_count),
    searchedAt: String(row.searched_at), savedAt: String(row.saved_at) };
}

/** The owner row serializes mutations across processes; the bounded unique slots are the final DB invariant. */
export class SavedResearchRepository {
  constructor(private readonly client: Client) {}
  private async scoped<T>(owner: ResearchOwner, connection: ResearchConnection | undefined, run: (tx: Executor) => Promise<T>): Promise<T> {
    if (!owner.tenantId || !owner.userId) throw savedResearchError('SAVED_RESEARCH_NOT_AUTHORIZED', 'Entre na sua conta para acessar as pesquisas salvas.');
    const tx = await this.client.transaction('write');
    try {
      await tx.execute({ sql: 'INSERT INTO saved_research_collections (tenant_id,user_id) VALUES (?,?) ON CONFLICT DO NOTHING', args: [owner.tenantId, owner.userId] });
      await tx.execute({ sql: 'UPDATE saved_research_collections SET user_id = user_id WHERE tenant_id = ? AND user_id = ?', args: [owner.tenantId, owner.userId] });
      if (connection) {
        const permission = await tx.execute({ sql: 'SELECT enabled FROM saved_research_permissions WHERE tenant_id = ? AND user_id = ? AND oauth_client_id = ? AND oauth_granted_at = ?', args: [owner.tenantId, owner.userId, connection.clientId, connection.grantedAt] });
        if (Number(permission.rows[0]?.enabled) !== 1) throw savedResearchError('SAVED_RESEARCH_NOT_AUTHORIZED', 'Autorize “Gerenciar pesquisas salvas” para este aplicativo nas conexões da sua conta.');
      }
      const result = await run(tx);
      await tx.commit();
      return result;
    } catch (error) { await tx.rollback(); throw error; }
    finally { tx.close?.(); }
  }
  async list(owner: ResearchOwner, connection?: ResearchConnection): Promise<SavedResearchRecord[]> {
    return this.scoped(owner, connection, async tx => {
      const result = await tx.execute({ sql: 'SELECT * FROM saved_research WHERE tenant_id = ? AND user_id = ? ORDER BY saved_at DESC, id DESC', args: [owner.tenantId, owner.userId] });
      return result.rows.map(row => record(row as Record<string, unknown>));
    });
  }
  async get(owner: ResearchOwner, id: string, connection?: ResearchConnection): Promise<SavedResearchRecord | undefined> {
    return this.scoped(owner, connection, async tx => {
      const result = await tx.execute({ sql: 'SELECT * FROM saved_research WHERE tenant_id = ? AND user_id = ? AND id = ?', args: [owner.tenantId, owner.userId, id] });
      return result.rows[0] ? record(result.rows[0] as Record<string, unknown>) : undefined;
    });
  }
  async save(owner: ResearchOwner, input: Omit<SavedResearchRecord, 'id' | 'savedAt'>, connection?: ResearchConnection): Promise<SavedResearchRecord> {
    return this.scoped(owner, connection, async tx => {
      const existing = await tx.execute({ sql: 'SELECT * FROM saved_research WHERE tenant_id = ? AND user_id = ? ORDER BY slot', args: [owner.tenantId, owner.userId] });
      const duplicate = existing.rows.find(row => row.operation_id === input.operationId);
      if (duplicate) return record(duplicate as Record<string, unknown>);
      const used = new Set(existing.rows.map(row => Number(row.slot)));
      const slot = [1, 2, 3, 4, 5, 6].find(value => !used.has(value));
      if (!slot) throw savedResearchError('SAVED_RESEARCH_FULL', 'Você já tem 6 pesquisas salvas. Exclua uma para salvar esta.');
      const saved = { ...input, id: randomUUID(), savedAt: new Date().toISOString() };
      await tx.execute({ sql: 'INSERT INTO saved_research (id,tenant_id,user_id,slot,operation_id,result_snapshot,criteria_json,result_count,searched_at,saved_at) VALUES (?,?,?,?,?,?,?,?,?,?)', args: [saved.id, owner.tenantId, owner.userId, slot, saved.operationId, saved.snapshot, JSON.stringify(saved.criteria), saved.resultCount, saved.searchedAt, saved.savedAt] });
      return saved;
    });
  }
  async delete(owner: ResearchOwner, id: string, connection?: ResearchConnection): Promise<void> {
    return this.scoped(owner, connection, async tx => {
      const result = await tx.execute({ sql: 'DELETE FROM saved_research WHERE tenant_id = ? AND user_id = ? AND id = ?', args: [owner.tenantId, owner.userId, id] });
      if (!result.rowsAffected) throw savedResearchError('SAVED_RESEARCH_NOT_FOUND', 'Esta pesquisa salva não está disponível.');
    });
  }
  async setPermission(owner: ResearchOwner, connection: ResearchConnection, enabled: boolean): Promise<void> {
    await this.scoped(owner, undefined, async tx => {
      await tx.execute({ sql: 'INSERT INTO saved_research_permissions (tenant_id,user_id,oauth_client_id,oauth_granted_at,enabled,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT (tenant_id,user_id,oauth_client_id,oauth_granted_at) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at', args: [owner.tenantId, owner.userId, connection.clientId, connection.grantedAt, enabled ? 1 : 0, new Date().toISOString()] });
    });
  }
  async hasPermission(owner: ResearchOwner, connection: ResearchConnection): Promise<boolean> {
    const result = await this.client.execute({ sql: 'SELECT enabled FROM saved_research_permissions WHERE tenant_id = ? AND user_id = ? AND oauth_client_id = ? AND oauth_granted_at = ?', args: [owner.tenantId, owner.userId, connection.clientId, connection.grantedAt] });
    return Number(result.rows[0]?.enabled) === 1;
  }
}
