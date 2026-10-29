import { it, expect } from 'vitest';
import { buildOpenApiDocument } from '../distribution/openapi.js';
it('documenta permissão independente e conferência em sessão com schemas canônicos', () => {
  const doc = buildOpenApiDocument() as any;
  expect(doc.components.schemas.CaseAiGrantRequest.properties.analysisPermission).toBeDefined();
  expect(doc.components.schemas.CaseAnalysisInput.properties.items.maxItems).toBe(100);
  expect(doc.paths['/api/v2/matters/{matterId}/analyses/{analysisId}/decisions'].post['x-forgelex-session-only']).toBe(
    true,
  );
  expect(doc.paths['/api/v2/matters/{matterId}/analyses'].get.responses).not.toHaveProperty('402');
});
