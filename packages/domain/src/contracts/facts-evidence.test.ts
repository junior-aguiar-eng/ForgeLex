import { describe, expect, it } from 'vitest';
import { EvidenceCoverageSchema, FactSchema, TimelineEventSchema } from './facts-evidence.js';

const ids = {
  tenantId: 'tenant_a',
  matterId: '11111111-1111-4111-8111-111111111111',
  factId: '22222222-2222-4222-8222-222222222222',
};

describe('Fatos, provas e cobertura', () => {
  it('exige tenant, matter e estado controlado para um fato', () => {
    const fact = FactSchema.parse({
      id: ids.factId,
      ...ids,
      statement: 'O contrato foi celebrado em janeiro de 2026.',
      category: 'TEMPORAL',
      status: 'ASSERTED',
      createdBy: 'user_a',
      createdAt: '2026-09-16T12:00:00.000Z',
      updatedAt: '2026-09-16T12:00:00.000Z',
    });

    expect(fact.status).toBe('ASSERTED');
    expect(() => FactSchema.parse({ ...fact, tenantId: '' })).toThrow();
    expect(() => FactSchema.parse({ ...fact, status: 'INVENTED' })).toThrow();
  });

  it('classifica cobertura explicitamente suportada e conflitante', () => {
    const coverage = EvidenceCoverageSchema.parse({
      id: '33333333-3333-4333-8333-333333333333',
      tenantId: ids.tenantId,
      matterId: ids.matterId,
      factId: ids.factId,
      supportingEvidenceCount: 1,
      contradictingEvidenceCount: 0,
      contextualEvidenceCount: 0,
      supportingAnchorCount: 1,
      contradictingAnchorCount: 0,
      coverage: 'SUPPORTED',
      calculatedAt: '2026-09-16T12:00:00.000Z',
    });

    expect(coverage.coverage).toBe('SUPPORTED');
    expect(() => EvidenceCoverageSchema.parse({ ...coverage, coverage: 'UNKNOWN' })).toThrow();
  });

  it('aceita somente data civil ISO na linha do tempo', () => {
    const event = TimelineEventSchema.parse({
      id: '44444444-4444-4444-8444-444444444444',
      tenantId: ids.tenantId,
      matterId: ids.matterId,
      title: 'Assinatura do contrato',
      eventDate: '2026-01-31',
      createdBy: 'user_a',
      createdAt: '2026-09-16T12:00:00.000Z',
    });

    expect(event.eventDate).toBe('2026-01-31');
    expect(() => TimelineEventSchema.parse({ ...event, eventDate: '31/01/2026' })).toThrow();
  });
});
