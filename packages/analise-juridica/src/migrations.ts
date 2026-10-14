import { runMigrations, type Client, type SqlMigration } from '@forgelex/persistence';

/**
 * Tabelas isoladas deste módulo. O prefixo `analise_` faz as vezes de schema
 * próprio (o libSQL/SQLite não tem schemas); nenhuma tabela do produto atual é
 * referenciada, nem por chave estrangeira.
 */
export const analiseMigrations: readonly SqlMigration[] = [
  {
    id: 'analise-0001-initial',
    statements: [
      `CREATE TABLE IF NOT EXISTS analise_sessoes (
        sessao_analitica_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        usuario_id TEXT NOT NULL,
        numero_processo TEXT,
        fase_processual TEXT,
        area_direito TEXT,
        criada_em TEXT NOT NULL,
        atualizada_em TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS analise_sessoes_usuario_idx ON analise_sessoes(tenant_id, usuario_id);`,
      `CREATE TABLE IF NOT EXISTS analise_achados (
        id TEXT PRIMARY KEY,
        sessao_analitica_id TEXT NOT NULL REFERENCES analise_sessoes(sessao_analitica_id),
        ordem INTEGER NOT NULL,
        tipo_analise TEXT NOT NULL,
        resumo TEXT NOT NULL,
        registrado_em TEXT NOT NULL,
        UNIQUE (sessao_analitica_id, ordem)
      );`,
      `CREATE TABLE IF NOT EXISTS analise_combos (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        usuario_id TEXT NOT NULL,
        sessao_analitica_id TEXT NOT NULL REFERENCES analise_sessoes(sessao_analitica_id),
        combo TEXT NOT NULL,
        tools_restantes TEXT NOT NULL,
        preco_cents INTEGER NOT NULL,
        ativado_em TEXT NOT NULL,
        UNIQUE (sessao_analitica_id, combo)
      );`,
      `CREATE TABLE IF NOT EXISTS analise_consumos (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        sessao_analitica_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        combo_id TEXT,
        resultado TEXT NOT NULL,
        criado_em TEXT NOT NULL,
        UNIQUE (tenant_id, idempotency_key)
      );`,
    ],
  },
  {
    id: 'analise-0002-operation-idempotency',
    statements: [
      `CREATE TABLE IF NOT EXISTS analise_operacoes (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        usuario_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        sessao_analitica_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),
        resultado TEXT,
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL,
        UNIQUE (tenant_id, idempotency_key)
      );`,
    ],
  },
];

export async function executarMigrationsAnalise(client: Client): Promise<void> {
  await runMigrations(client, analiseMigrations);
}
