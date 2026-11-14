import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  DecisionPresentationService,
  createResearchPresentationTools,
  researchPresentationMetadata,
} from './decision-presentation.js';
import { CANONICAL_CASE_LAW_FIXTURES } from '../fixtures/stj-sample-data.js';
import type { SavedResearchService } from './saved-research-service.js';

describe('decision selection', () => {
  it('keeps exact identities and unavailable versions without process-based substitution', async () => {
    const reference = { recordId: CANONICAL_CASE_LAW_FIXTURES[0].id, versionId: randomUUID() };
    const missing = { ...reference, versionId: randomUUID() };
    const resolve = vi.fn(async (ref: typeof reference) =>
      ref.versionId === reference.versionId
        ? { ...CANONICAL_CASE_LAW_FIXTURES[0], versionId: reference.versionId }
        : undefined,
    );
    const service = new DecisionPresentationService(undefined, resolve);
    const result = await service.present({ items: [reference, missing] }, { tenantId: 't', userId: 'u' });
    expect(result.decisions.map((item) => item.availability)).toEqual(['AVAILABLE', 'UNAVAILABLE']);
    expect(result.decisions[0].decision?.versionId).toBe(reference.versionId);
    expect(result.decisions[1].decision).toBeUndefined();
    expect(result.canSave).toBe(false);
  });
  it('requires an explicit save request, rejects raw source text and only exposes deletion as a confirmed app action', async () => {
    const saved = { save: vi.fn(), delete: vi.fn() } as unknown as SavedResearchService;
    const tools = createResearchPresentationTools(new DecisionPresentationService(saved, async () => undefined), saved);
    const save = tools.find((tool) => tool.name === 'research.save_search')!;
    expect(save.inputSchema.safeParse({ operationId: 'op' }).success).toBe(false);
    expect(save.inputSchema.safeParse({ operationId: 'op'.repeat(200), requestedByUser: true }).success).toBe(true);
    expect(
      save.inputSchema.safeParse({ operationId: 'op', requestedByUser: true, decisions: ['forged'] }).success,
    ).toBe(false);
    const remove = tools.find((tool) => tool.name === 'research.delete_saved_search')!;
    expect(remove.inputSchema.safeParse({ id: randomUUID() }).success).toBe(false);
    expect(remove.inputSchema.safeParse({ id: randomUUID(), confirmed: true }).success).toBe(true);
    expect(
      tools[0].inputSchema.safeParse({
        items: [{ recordId: randomUUID(), versionId: randomUUID(), syllabus: 'forged' }],
      }).success,
    ).toBe(false);
  });
  it('liga o salvamento só por ação confirmada do painel, para a conexão atual, e não o oferece ao modelo', async () => {
    const setPermission = vi.fn(async () => undefined);
    const saved = { save: vi.fn(), delete: vi.fn(), repository: { setPermission } } as unknown as SavedResearchService;
    const tools = createResearchPresentationTools(new DecisionPresentationService(saved, async () => undefined), saved);
    const allow = tools.find((tool) => tool.name === 'research.allow_saving')!;
    expect(allow).toBeDefined();
    expect(allow.inputSchema.safeParse({}).success).toBe(false);
    expect(allow.inputSchema.safeParse({ confirmed: true }).success).toBe(true);
    expect(allow.inputSchema.safeParse({ confirmed: true, tenantId: 'forged' }).success).toBe(false);
    expect(researchPresentationMetadata('research.allow_saving')._meta).toEqual({ ui: { visibility: ['app'] } });
    const connection = { clientId: 'claude', grantedAt: '2026-11-14T00:00:00Z' };
    const context = {
      tenantId: 't',
      userId: 'u',
      source: 'MCP',
      oauthConnection: connection,
      revalidateConnection: async () => undefined,
    } as never;
    expect(await allow.execute({ confirmed: true }, context)).toEqual({ success: true, data: { enabled: true } });
    expect(setPermission).toHaveBeenCalledWith({ tenantId: 't', userId: 'u' }, connection, true);
    await expect(
      allow.execute({ confirmed: true }, { tenantId: 't', userId: 'u', source: 'API' } as never),
    ).rejects.toMatchObject({
      code: 'SAVED_RESEARCH_NOT_AUTHORIZED',
    });
    expect(setPermission).toHaveBeenCalledTimes(1);
  });
});
