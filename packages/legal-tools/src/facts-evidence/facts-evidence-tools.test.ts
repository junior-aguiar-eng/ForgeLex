import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ToolExecutionContext } from '@forgelex/agent-core';
import { createDatabase, FactsEvidenceRepository, MatterRepository, runPersistenceMigrations } from '@forgelex/persistence';
import type { Client } from '@libsql/client';
import {
  createEvidenceCoverageTool,
  createEvidenceMapSupportTool,
  createFactsExtractTool,
  createFactsFindSupportTool,
  createFactsListTool,
} from './facts-evidence-tools.js';
import { FactsEvidenceService } from './facts-evidence-service.js';

describe('Facts & Evidence tools', () => {
  let client: Client;
  let service: FactsEvidenceService;
  let matterId: string;
  let anchorId: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    client = connection.client;
    await runPersistenceMigrations(client);
    const matterRepository = new MatterRepository(connection.db);
    const matter = await matterRepository.createMatter({
      tenantId: 'tenant_tools',
      createdBy: 'user_tools',
      title: 'Matter das tools de evidência',
    });
    matterId = matter.id;
    const document = await matterRepository.ingestTextDocument({
      tenantId: 'tenant_tools',
      matterId,
      createdBy: 'user_tools',
      title: 'Base factual',
      originalFilename: 'base.txt',
      mimeType: 'text/plain',
      content: 'O contrato foi assinado em janeiro de 2026.',
    });
    anchorId = document.anchors[0].id;
    service = new FactsEvidenceService(new FactsEvidenceRepository(connection.db));
    context = {
      sessionId: 'session_tools',
      tenantId: 'tenant_tools',
      userId: 'user_tools',
      matterId,
      abortSignal: new AbortController().signal,
    };
  });

  afterEach(() => {
    client.close();
  });

  it('registra candidatos, mapeia a prova e expõe cobertura pelos mesmos serviços', async () => {
    const extraction = await createFactsExtractTool(service).execute(
      {
        matterId,
        facts: [{ statement: 'O contrato foi assinado em janeiro de 2026.', category: 'TEMPORAL', sourceAnchorId: anchorId }],
      },
      context,
    );
    expect(extraction.success).toBe(true);
    expect(extraction.data.facts[0].status).toBe('ASSERTED');

    const factId = extraction.data.facts[0].id;
    const mapping = await createEvidenceMapSupportTool(service).execute(
      {
        matterId,
        factId,
        evidence: { title: 'Contrato assinado', evidenceType: 'DOCUMENT' },
        anchorIds: [anchorId],
        relation: 'SUPPORTS',
      },
      context,
    );
    expect(mapping.data.evidenceLink.factId).toBe(factId);
    expect(mapping.data.sourceLinks).toHaveLength(1);

    const listed = await createFactsListTool(service).execute({ matterId }, context);
    expect(listed.data.items).toHaveLength(1);
    expect(listed.data.coverage[0].coverage).toBe('SUPPORTED');

    const support = await createFactsFindSupportTool(service).execute({ matterId, factId }, context);
    expect(support.data.sourceLinks[0].documentAnchorId).toBe(anchorId);
    expect(support.data.evidenceLinks[0].evidenceItemId).toBe(mapping.data.evidence.id);

    const coverage = await createEvidenceCoverageTool(service).execute({ matterId }, context);
    expect(coverage.data.coverage[0].supportingEvidenceCount).toBe(1);
  });
});
