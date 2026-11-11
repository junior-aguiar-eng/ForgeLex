import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DraftSchema, DraftVersionSchema } from '@forgelex/domain';
import type { ForgeLexDatabase } from '../db.js';
import { draftSaveCommands as table } from '../schema/schema.js';
import type { DraftSaveResult, DraftVersionBundle } from './draft-repository.js';

const receiptSchema = z.strictObject({
  draft: DraftSchema,
  version: DraftVersionSchema,
  sectionIds: z.array(z.guid()),
  citationIds: z.array(z.guid()),
});
type Owner = { tenantId: string; userId: string };
type Command = Owner & { matterId: string; commandId: string };
type Row = typeof table.$inferSelect;

/** Stores the original mutable metadata and the ordering of immutable version content. */
export class DraftSaveCommandRepository {
  constructor(private readonly db: ForgeLexDatabase) {}

  private key({ tenantId, userId, commandId }: Owner & { commandId: string }) {
    return and(eq(table.tenantId, tenantId), eq(table.userId, userId), eq(table.commandId, commandId));
  }

  async assertAvailable() {
    await this.db.select({ commandId: table.commandId }).from(table).limit(0);
  }

  async claim(command: Command, inputHash: string): Promise<Row | undefined> {
    const [inserted] = await this.db
      .insert(table)
      .values({ ...command, inputHash, createdAt: new Date().toISOString() })
      .onConflictDoNothing({ target: [table.tenantId, table.userId, table.commandId] })
      .returning({ commandId: table.commandId });
    if (inserted) return undefined;
    const [existing] = await this.db.select().from(table).where(this.key(command)).limit(1);
    if (!existing || existing.matterId !== command.matterId || existing.inputHash !== inputHash)
      throw new Error('DRAFT_SAVE_COMMAND_CONFLICT');
    return existing;
  }

  async find(command: Command): Promise<Row | undefined> {
    const [row] = await this.db
      .select()
      .from(table)
      .where(and(this.key(command), eq(table.matterId, command.matterId)))
      .limit(1);
    return row;
  }

  async complete(command: Command, result: DraftSaveResult) {
    const [row] = await this.db
      .update(table)
      .set({
        versionId: result.version.id,
        receiptJson: JSON.stringify({
          draft: result.draft,
          version: result.version,
          sectionIds: result.sections.map(({ id }) => id),
          citationIds: result.citations.map(({ id }) => id),
        }),
      })
      .where(this.key(command))
      .returning({ commandId: table.commandId });
    if (!row) throw new Error('DRAFT_SAVE_COMMAND_INTEGRITY');
  }

  async result(
    row: Row,
    load: (draftId: string, versionId: string) => Promise<DraftVersionBundle | undefined>,
  ): Promise<DraftSaveResult> {
    if (!row.receiptJson || !row.versionId) throw new Error('DRAFT_SAVE_COMMAND_INTEGRITY');
    const { draft, version, sectionIds, citationIds } = receiptSchema.parse(JSON.parse(row.receiptJson));
    if (
      draft.tenantId !== row.tenantId ||
      draft.matterId !== row.matterId ||
      draft.currentVersionId !== row.versionId ||
      version.tenantId !== row.tenantId ||
      version.matterId !== row.matterId ||
      version.draftId !== draft.id ||
      version.id !== row.versionId ||
      version.createdBy !== row.userId
    )
      throw new Error('DRAFT_SAVE_COMMAND_INTEGRITY');
    const bundle = await load(draft.id, version.id);
    if (!bundle || bundle.version.contentHash !== version.contentHash) throw new Error('DRAFT_SAVE_COMMAND_INTEGRITY');
    return {
      draft,
      version,
      sections: inSavedOrder(bundle.sections, sectionIds),
      citations: inSavedOrder(bundle.citations, citationIds),
    };
  }
}

function inSavedOrder<T extends { id: string }>(items: T[], ids: string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  if (ids.length !== items.length || new Set(ids).size !== ids.length) throw new Error('DRAFT_SAVE_COMMAND_INTEGRITY');
  return ids.map((id) => {
    const item = byId.get(id);
    if (!item) throw new Error('DRAFT_SAVE_COMMAND_INTEGRITY');
    return item;
  });
}
