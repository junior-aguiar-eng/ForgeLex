import type {
  CaseAiReader,
  CaseAiGrant,
  CaseItemKind,
  CaseItemPage,
  CaseContextPage,
  SharedCasePage,
} from '@forgelex/domain';
import {
  CaseAiAccessRepository,
  MatterRepository,
  caseBinding,
  casePosition,
  boundedItems,
  shortText,
} from '@forgelex/persistence';
type Reader = CaseAiReader & { revalidateConnection?: () => Promise<void> };
export class CaseContextService {
  constructor(private readonly access: CaseAiAccessRepository) {}
  private requireReader(r: Reader) {
    if (!r?.oauthConnection?.clientId || !r.oauthConnection.grantedAt || !r.tenantId || !r.userId)
      throw new Error('CASE_CONTEXT_NOT_AUTHORIZED');
  }
  private async finish(r: Reader, g: Pick<CaseAiGrant, 'matterId' | 'revision'>) {
    await r.revalidateConnection?.();
    const current = await this.access.assertActive(r, g.matterId);
    if (current.revision !== g.revision) throw new Error('CASE_CONTEXT_NOT_AUTHORIZED');
  }
  async revalidateResponse(r: Reader, data: SharedCasePage | CaseContextPage | CaseItemPage) {
    this.requireReader(r);
    await r.revalidateConnection?.();
    const entries =
      'matterId' in data
        ? [{ matterId: data.matterId, grantRevision: data.grantRevision }]
        : (data as SharedCasePage).items;
    const grants = await this.access.listForReader(r);
    if (entries.some((item) => !grants.some((g) => g.matterId === item.matterId && g.revision === item.grantRevision)))
      throw new Error('CASE_CONTEXT_NOT_AUTHORIZED');
  }
  async listShared(r: Reader, page: { cursor?: string; limit?: number } = {}): Promise<SharedCasePage> {
    this.requireReader(r);
    const grants = await this.access.listForReader(r);
    const binding = caseBinding([r.tenantId, r.userId, r.oauthConnection, grants.map((g) => [g.id, g.revision])]);
    const items = [];
    for (const g of grants) {
      const matter = await new MatterRepository(this.access.db).getMatter(r.tenantId, g.matterId);
      if (matter) items.push({ matterId: g.matterId, title: shortText(matter.title), grantRevision: g.revision });
    }
    const result = boundedItems(items, casePosition(page.cursor, binding), page.limit ?? 20, {}, binding, true);
    await r.revalidateConnection?.();
    const after = await this.access.listForReader(r);
    if (caseBinding(after.map((g) => [g.id, g.revision])) !== caseBinding(grants.map((g) => [g.id, g.revision])))
      throw new Error('CASE_CONTEXT_NOT_AUTHORIZED');
    return result;
  }
  async getContext(r: Reader, input: { matterId: string; cursor?: string; limit?: number }): Promise<CaseContextPage> {
    this.requireReader(r);
    const g = await this.access.assertActive(r, input.matterId);
    const data = await this.access.loadSelection(r, g.matterId, g.selection);
    const binding = caseBinding([
      r.tenantId,
      r.userId,
      r.oauthConnection,
      g.id,
      g.revision,
      'context',
      data.map((d) => [d.kind, d.id, d.title, d.fields]),
    ]);
    const items = data.map((d) => ({
      kind: d.kind,
      id: d.id,
      title: shortText(d.title),
      preview: shortText(d.fields[0]?.text ?? ''),
      ...(d.kind === 'DOCUMENT'
        ? {
            versionId: g.selection.documents.find((x) => x.documentId === d.id)!.versionId,
            versionNumber: d.versionNumber,
          }
        : {}),
    }));
    const base = { matterId: g.matterId, grantRevision: g.revision, ...(g.receivePermission.enabled ? { draftReceiving: g.receivePermission } : {}), ...(g.analysisPermission.enabled ? {analysisReceiving:g.analysisPermission}: {}) };
    const result = {
      ...base,
      ...boundedItems(items, casePosition(input.cursor, binding), input.limit ?? 20, base, binding, true),
    };
    await this.finish(r, g);
    return result;
  }
  async readItem(
    r: Reader,
    input: { matterId: string; kind: CaseItemKind; itemId: string; cursor?: string },
  ): Promise<CaseItemPage> {
    this.requireReader(r);
    const g = await this.access.assertActive(r, input.matterId);
    const data = await this.access.loadSelection(r, g.matterId, g.selection);
    const item = data.find((d) => d.kind === input.kind && d.id === input.itemId);
    if (!item) throw new Error('CASE_CONTEXT_NOT_AUTHORIZED');
    const fields = [...item.fields];
    const relations: CaseItemPage['relations'] = [];
    const permitted = (kind: CaseItemKind, id: string) => data.some((d) => d.kind === kind && d.id === id);
    const links = await this.access.relatedItems(r, g.matterId, item.kind, item.id);
    for (const link of links) {
      if (link.anchorId) {
        const source = data
          .filter((d) => d.kind === 'DOCUMENT')
          .flatMap((d) => d.fields)
          .find((f) => f.anchorId === link.anchorId);
        if (source) {
          fields.push({ ...source, field: 'source_' + link.relation });
          relations.push({ kind: 'DOCUMENT', itemId: source.documentId!, relation: link.relation });
        }
      } else if (permitted(link.kind, link.itemId))
        relations.push({ kind: link.kind, itemId: link.itemId, relation: link.relation });
    }
    if (item.kind === 'FACT' || item.kind === 'EVIDENCE')
      fields.push({
        field: 'scope',
        text: 'Relações limitadas ao material compartilhado. Alegações e vínculos não demonstram a verdade dos fatos.',
      });
    if (item.kind === 'AUTHORITY')
      fields.push({
        field: 'scope',
        text: 'Fonte cadastrada no caso. Esta leitura não realiza nova verificação jurídica.',
      });
    relations.sort(
      (a, b) =>
        a.kind.localeCompare(b.kind) || a.itemId.localeCompare(b.itemId) || a.relation.localeCompare(b.relation),
    );
    const parts: CaseItemPage['parts'] = [];
    for (const f of fields) {
      const chars = Array.from(f.text);
      let offset = 0;
      if (!chars.length) parts.push({ ...f, offset: 0 });
      for (let i = 0; i < chars.length; i += 1000) {
        const text = chars.slice(i, i + 1000).join('');
        parts.push({ ...f, text, offset });
        offset += text.length;
      }
    }
    const binding = caseBinding([
      r.tenantId,
      r.userId,
      r.oauthConnection,
      g.id,
      g.revision,
      input.kind,
      input.itemId,
      fields,
      relations,
    ]);
    const base = { matterId: g.matterId, kind: input.kind, itemId: item.id, grantRevision: g.revision };
    const entities = [
      ...parts.map((value) => ({ type: 'part' as const, value })),
      ...relations.map((value) => ({ type: 'relation' as const, value })),
    ];
    const page = boundedItems(
      entities,
      casePosition(input.cursor, binding),
      50,
      { ...base, parts: [], relations: [] },
      binding,
      true,
    );
    const result = {
      ...base,
      parts: page.items.flatMap((e) => (e.type === 'part' ? [e.value] : [])),
      relations: page.items.flatMap((e) => (e.type === 'relation' ? [e.value] : [])),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
    await this.finish(r, g);
    return result;
  }
}
