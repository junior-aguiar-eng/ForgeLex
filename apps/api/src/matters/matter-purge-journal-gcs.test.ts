import { it, expect } from 'vitest';
import type { Storage } from '@google-cloud/storage';
import { GcsMatterPurgeObjectStore } from './matter-purge-journal-gcs.js';
it('uses conditional writes and reads only the lifecycle namespace', async () => {
  const objects = new Map<string, Buffer>();
  const storage = { bucket: () => ({
    file: (key: string) => ({
      save: async (body: Buffer, options: unknown) => { expect(options).toMatchObject({ preconditionOpts: { ifGenerationMatch: 0 } }); if (objects.has(key)) throw Object.assign(new Error('exists'), { code: 412 }); objects.set(key, body); },
      download: async () => { if (!objects.has(key)) throw Object.assign(new Error('missing'), { code: 404 }); return [objects.get(key)]; },
    }),
    getFiles: async ({ prefix }: { prefix: string }) => [[...objects.keys()].filter(key => key.startsWith(prefix)).map(name => ({ name }))],
  }) } as unknown as Storage;
  const store = new GcsMatterPurgeObjectStore('synthetic', storage);
  const key = `matter-lifecycle/${'a'.repeat(64)}/PREPARED.json`;
  expect(await store.read(key)).toBeUndefined();
  expect(await store.writeOnce(key, 'first')).toBe(true);
  expect(await store.writeOnce(key, 'second')).toBe(false);
  expect(await store.read(key)).toBe('first');
  objects.set('closures/another.json', Buffer.from('unrelated'));
  expect(await store.list()).toEqual([key]);
});
