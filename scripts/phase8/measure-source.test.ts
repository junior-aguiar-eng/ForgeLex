import { describe, expect, it } from 'vitest';
import { buildMeasurement, sanitizeDatabaseUrl } from './measure-source.mjs';

const valid = {
  databaseUrl: 'postgresql://user:secret@db.example.test/forgelex',
  databaseBytes: 1_000,
  corpusTableBytes: 400,
  corpusIndexBytes: 100,
  dumpBytes: 500,
  imageBytes: 2_000,
  plannedRequests: 100,
  plannedIngressBytes: 1_000,
  plannedEgressBytes: 2_000,
  logRetentionDays: 7,
  storageBytes: 10_000,
  estimatedMonthlyBrl: 80,
};

describe('phase8:measure', () => {
  it('emite medição estável e saneada', () => {
    expect(buildMeasurement(valid)).toEqual({
      databaseBytes: 1_000, corpusTableBytes: 400, corpusIndexBytes: 100,
      dumpBytes: 500, imageBytes: 2_000, plannedRequests: 100,
      plannedIngressBytes: 1_000, plannedEgressBytes: 2_000,
      logRetentionDays: 7, storageHeadroomRatio: 0.85, estimatedMonthlyBrl: 80,
    });
    expect(sanitizeDatabaseUrl(valid.databaseUrl)).toBe('postgresql://db.example.test/forgelex');
    expect(JSON.stringify(buildMeasurement(valid))).not.toMatch(/user|secret/);
  });

  it.each([
    [{ ...valid, databaseUrl: 'file:local.db' }, 'DATABASE_URL_POSTGRES_REQUIRED'],
    [{ ...valid, imageBytes: -1 }, 'MEASUREMENT_NEGATIVE_VALUE'],
    [{ ...valid, storageBytes: 1_200 }, 'STORAGE_HEADROOM_BELOW_25_PERCENT'],
    [{ ...valid, databaseBytes: 21 * 1024 ** 3, dumpBytes: 5 * 1024 ** 3, storageBytes: 30 * 1024 ** 3 }, 'STORAGE_ESTIMATE_EXCEEDS_25_GIB'],
  ])('rejeita configuração insegura', (input, message) => {
    expect(() => buildMeasurement(input)).toThrow(message);
  });
});
