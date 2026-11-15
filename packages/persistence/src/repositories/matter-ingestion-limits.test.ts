import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { caseAccessFixture } from './matter-lifecycle-fixture.js';

describe('bounded text document ingestion', () => {
  let f: Awaited<ReturnType<typeof caseAccessFixture>>;
  beforeEach(async () => {
    f = await caseAccessFixture();
  });
  afterEach(() => f.client.close());

  function ingest(content: string, matterId = f.matter.id) {
    return f.matters.ingestTextDocument({
      tenantId: f.owner.tenantId,
      matterId,
      createdBy: f.owner.userId,
      title: 'Petição inicial',
      originalFilename: 'peticao.txt',
      mimeType: 'text/plain',
      content,
    });
  }

  async function counts() {
    const result = await f.client.execute(`SELECT
      (SELECT COUNT(*) FROM legal_documents) AS documents,
      (SELECT COUNT(*) FROM document_versions) AS versions,
      (SELECT COUNT(*) FROM document_anchors) AS anchors`);
    return result.rows[0];
  }

  it.each(['x'.repeat(1_048_577), 'é'.repeat(524_289)])(
    'rejects UTF-8 byte excess before database access or partial persistence %#',
    async (content) => {
      const before = await counts();
      await expect(ingest(content, 'missing-matter')).rejects.toThrow('DOCUMENT_TEXT_TOO_LARGE');
      expect(await counts()).toEqual(before);
    },
  );

  it('rejects 5,001 short lines within the byte limit before database access', async () => {
    const before = await counts();
    await expect(ingest('a\n'.repeat(5_001), 'missing-matter')).rejects.toThrow('DOCUMENT_ANCHOR_LIMIT_EXCEEDED');
    expect(await counts()).toEqual(before);
  });

  it('accepts exactly 1 MiB of UTF-8 content and retains its bytes and hash', async () => {
    const content = 'é'.repeat(524_288);
    const result = await ingest(content);
    expect(result.document.byteSize).toBe(1_048_576);
    expect(result.version.content).toBe(content);
    expect(result.anchors).toHaveLength(1);
    expect(result.anchors[0].endOffset).toBe(524_288);
    expect(result.version.contentHash).toBe(createHash('sha256').update(content, 'utf8').digest('hex'));
  });

  it('persists and returns exactly 5,000 short legal paragraphs without exceeding SQL parameter limits', async () => {
    const result = await ingest('Art. 1º\r\n'.repeat(5_000));
    expect(result.anchors).toHaveLength(5_000);
    expect(result.anchors[4_999]).toMatchObject({ ordinal: 4_999, anchorKey: 'p5000', text: 'Art. 1º' });
    expect(await counts()).toMatchObject({ documents: 2, versions: 2, anchors: 5_001 });
  });

  it('ignores blank lines and preserves UTF-16 offsets, CRLF and hashes for Unicode text', async () => {
    const content = ' \t\r\n  Ação ⚖️😀  \r\n\t\r\n B\rC\n';
    const result = await ingest(content);
    expect(result.version.content).toBe(content);
    expect(result.anchors.map(({ text, startOffset, endOffset }) => ({ text, startOffset, endOffset }))).toEqual([
      { text: 'Ação ⚖️😀', startOffset: 6, endOffset: 15 },
      { text: 'B', startOffset: 23, endOffset: 24 },
      { text: 'C', startOffset: 25, endOffset: 26 },
    ]);
    for (const anchor of result.anchors) {
      expect(content.slice(anchor.startOffset, anchor.endOffset)).toBe(anchor.text);
      expect(anchor.contentHash).toBe(createHash('sha256').update(anchor.text, 'utf8').digest('hex'));
    }
  });

  it('rejects empty content without leaving a partial document', async () => {
    const before = await counts();
    await expect(ingest(' \t\r\n')).rejects.toThrow('DOCUMENT_CONTENT_REQUIRED');
    expect(await counts()).toEqual(before);
  });

  it('rolls back document, version and earlier anchor batches if a later insert fails', async () => {
    const before = await counts();
    await f.client.execute(`CREATE TRIGGER fail_late_anchor BEFORE INSERT ON document_anchors
      WHEN NEW.ordinal >= 250 BEGIN SELECT RAISE(ABORT, 'injected anchor insert failure'); END`);
    await expect(ingest('Prova\n'.repeat(501))).rejects.toThrow();
    expect(await counts()).toEqual(before);
  });

  it.each([
    ['title', { title: 'x'.repeat(501) }],
    ['originalFilename', { originalFilename: 'x'.repeat(256) }],
    ['mimeType', { mimeType: 'x'.repeat(128) }],
  ])('rejects an oversized %s before touching the database', async (field, override) => {
    const before = await counts();

    await expect(
      f.matters.ingestTextDocument({
        tenantId: f.owner.tenantId,
        matterId: f.matter.id,
        createdBy: f.owner.userId,
        title: 'Petição inicial',
        originalFilename: 'peticao.txt',
        mimeType: 'text/plain',
        content: 'Texto válido.',
        ...override,
      }),
    ).rejects.toThrow(`DOCUMENT_FIELD_TOO_LONG: ${field}`);

    expect(await counts()).toEqual(before);
  });

  it('accepts metadata exactly at its limits', async () => {
    const result = await f.matters.ingestTextDocument({
      tenantId: f.owner.tenantId,
      matterId: f.matter.id,
      createdBy: f.owner.userId,
      title: 'x'.repeat(500),
      originalFilename: 'y'.repeat(255),
      mimeType: 'z'.repeat(127),
      content: 'Texto válido.',
    });

    expect(result.document.title).toHaveLength(500);
  });

  it('keeps a paragraph that ends in a bare CR, with exact offsets', async () => {
    const result = await ingest('primeiro\rsegundo\r\nterceiro');

    expect(result.anchors.map((anchor) => [anchor.text, anchor.startOffset, anchor.endOffset])).toEqual([
      ['primeiro', 0, 8],
      ['segundo', 9, 16],
      ['terceiro', 18, 26],
    ]);
  });

  it('says it counts non-empty lines, because each line becomes an anchor', async () => {
    await expect(ingest(Array.from({ length: 5001 }, () => 'a').join('\n'))).rejects.toThrow(
      /DOCUMENT_ANCHOR_LIMIT_EXCEEDED.*linhas/,
    );
  });

  it('scans the content for paragraphs only once, outside the matter lock', async () => {
    const scans = vi.spyOn(RegExp.prototype, Symbol.matchAll);
    try {
      await ingest('um\ndois\ntrês');

      expect(scans).toHaveBeenCalledTimes(1);
    } finally {
      scans.mockRestore();
    }
  });
});
