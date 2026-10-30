import { and, eq } from 'drizzle-orm';
import {
  LegislationIntegrityError,
  LegislationSnapshotSchema,
  legislationHash,
  type LegislationSnapshot,
  type LegislationWritePort,
} from '@forgelex/legal-data';
import type { ForgeLexDatabase } from '../db.js';
import { legislationVersions } from '../schema/schema.js';

/** Append-only shared public-source snapshots; not a matter document store. */
export class LegislationRepository implements LegislationWritePort {
  constructor(private readonly db: ForgeLexDatabase) {}
  async append(raw: LegislationSnapshot): Promise<void> {
    const record = LegislationSnapshotSchema.parse(raw),
      d = record.document;
    const id = legislationHash(JSON.stringify([d.normId, d.provisionId, d.versionId]));
    const payloadJson = JSON.stringify(record);
    await this.db
      .insert(legislationVersions)
      .values({ id, normId: d.normId, provisionId: d.provisionId, versionId: d.versionId, payloadJson })
      .onConflictDoNothing();
    const [existing] = await this.db.select().from(legislationVersions).where(eq(legislationVersions.id, id));
    if (!existing || existing.payloadJson !== payloadJson) throw new Error('LEGISLATION_VERSION_CONFLICT');
  }
  async listVersions(normId: string, provisionId: string): Promise<LegislationSnapshot[]> {
    return (
      await this.db
        .select()
        .from(legislationVersions)
        .where(and(eq(legislationVersions.normId, normId), eq(legislationVersions.provisionId, provisionId)))
    ).map((r) => {
      try {
        const record = LegislationSnapshotSchema.parse(JSON.parse(r.payloadJson));
        const d = record.document;
        if (
          r.id !== legislationHash(JSON.stringify([d.normId, d.provisionId, d.versionId])) ||
          r.normId !== d.normId ||
          r.provisionId !== d.provisionId ||
          r.versionId !== d.versionId
        ) {
          throw new LegislationIntegrityError();
        }
        return record;
      } catch (error) {
        if (error instanceof LegislationIntegrityError) throw error;
        throw new LegislationIntegrityError({ cause: error });
      }
    });
  }
}
