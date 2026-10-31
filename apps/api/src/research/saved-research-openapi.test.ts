import { expect, test } from 'vitest';
import { buildOpenApiDocument } from '../distribution/openapi.js';
test('saved research documentation follows the reversible flag and declares session-only free operations', () => {
  expect((buildOpenApiDocument().paths as any)['/api/v2/research/saved']).toBeUndefined();
  const document = buildOpenApiDocument(undefined, { savedResearchEnabled: true }) as any;
  const collection = document.paths['/api/v2/research/saved'];
  expect(collection.post.requestBody.content['application/json'].schema.$ref).toContain('SavedResearchRequest');
  for (const path of Object.keys(document.paths).filter((path) => path.startsWith('/api/v2/research/saved'))) {
    for (const operation of Object.values(document.paths[path]) as any[]) {
      expect(operation['x-forgelex-session-only']).toBe(true);
      expect(operation['x-forgelex-billing-mode']).toBe('FREE');
      expect(operation.responses['402']).toBeUndefined();
      expect(operation.parameters ?? []).not.toContainEqual(expect.objectContaining({ name: 'Idempotency-Key' }));
    }
  }
  expect(document.paths['/api/v2/research/saved/{id}'].delete.responses['204']).toBeDefined();
  expect(document['x-forgelex-external-mcp-tools']).toContain('research.save_search');
});
