import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createDatabase,
  IngestionRunRepository,
  runPersistenceMigrations,
} from '../packages/persistence/dist/index.js';
import { calculateFreshness, parseFreshnessArgs, reportFreshness } from './report-stj-freshness.mjs';

const now = '2026-09-26T12:00:00.000Z';
const completed = { resource_id: 'r1', status: 'COMPLETED', completed_at: '2026-09-25T12:00:00.000Z', error: null };
const successfulRun = {
  status: 'COMPLETED',
  completed_at: '2026-09-26T06:00:00.000Z',
  started_at: '2026-09-26T05:00:00.000Z',
};

describe('STJ freshness report', () => {
  it('reports a current corpus without an alert', () => {
    expect(calculateFreshness([completed], [successfulRun], now, 48)).toMatchObject({
      lastSuccessfulManifestAt: completed.completed_at,
      lastSuccessfulRunAt: successfulRun.completed_at,
      pending: 0,
      failed: 0,
      terminalGaps: 0,
      lagHours: 6,
      alert: false,
    });
  });

  it('alerts when there has been no successful execution', () => {
    expect(calculateFreshness([], [], now, 48)).toMatchObject({
      lastSuccessfulManifestAt: null,
      lastSuccessfulRunAt: null,
      pending: 0,
      failed: 0,
      terminalGaps: 0,
      lagHours: null,
      alert: true,
    });
  });

  it('counts an execution in progress without treating it as a failure', () => {
    const running = { status: 'RUNNING', started_at: '2026-09-26T11:00:00.000Z', completed_at: null };
    expect(calculateFreshness([completed], [successfulRun, running], now, 48)).toMatchObject({
      pending: 1,
      failed: 0,
      lagHours: 6,
      alert: false,
    });
  });

  it('alerts when an abandoned run remains pending past the threshold', () => {
    const abandoned = { status: 'RUNNING', started_at: '2026-09-23T10:00:00.000Z', completed_at: null };
    expect(calculateFreshness([completed], [successfulRun, abandoned], now, 48)).toMatchObject({
      pending: 1,
      stalePending: 1,
      alert: true,
    });
  });

  it('alerts on an unresolved transient failure or stale successful execution', () => {
    const failure = { resource_id: 'r2', status: 'FAILED', completed_at: '2026-09-26T09:00:00.000Z', error: 'TIMEOUT' };
    expect(calculateFreshness([completed, failure], [successfulRun], now, 48)).toMatchObject({
      failed: 1,
      alert: true,
    });
    expect(
      calculateFreshness([completed], [{ ...successfulRun, completed_at: '2026-09-23T06:00:00.000Z' }], now, 48),
    ).toMatchObject({ lagHours: 78, alert: true });
    expect(
      calculateFreshness(
        [failure, { ...completed, resource_id: 'r2', completed_at: '2026-09-26T10:00:00.000Z' }],
        [successfulRun],
        now,
        48,
      ),
    ).toMatchObject({ failed: 0, alert: false });
  });

  it('does not keep alerting on an official terminal source gap', () => {
    const gap = {
      resource_id: 'r2',
      status: 'FAILED',
      completed_at: '2026-09-25T13:00:00.000Z',
      error: 'OFFICIAL_SOURCE_MALFORMED_JSON:20240229.json',
    };
    expect(calculateFreshness([completed, gap], [successfulRun], now, 48)).toMatchObject({
      terminalGaps: 1,
      failed: 0,
      alert: false,
    });
  });

  it('requires a positive threshold and a database URL', () => {
    expect(() => parseFreshnessArgs([], {})).toThrow('DATABASE_URL');
    expect(parseFreshnessArgs(['--with-counts'], { DATABASE_URL: 'postgres://localhost/db' }).withCounts).toBe(true);
    expect(() => parseFreshnessArgs(['--max-lag-hours', '0'], { DATABASE_URL: 'postgres://localhost/db' })).toThrow(
      'max-lag-hours',
    );
  });

  it('reads only STJ Open Data run metadata from the database', async () => {
    const file = join(tmpdir(), `forgelex-freshness-${randomUUID()}.db`);
    const database = pathToFileURL(file).toString();
    try {
      const connection = await createDatabase({ url: database });
      await runPersistenceMigrations(connection.client);
      const runs = new IngestionRunRepository(connection.db);
      const stj = await runs.start({ providerId: 'provider_stj_open_data', court: 'STJ' });
      await runs.complete(stj.id, { documentsSeen: 0, documentsPublished: 0 });
      await runs.start({ providerId: 'another_provider', court: 'STJ' });
      connection.client.close();
      const report = await reportFreshness(['--with-counts'], { DATABASE_URL: database });
      expect(report).toMatchObject({ pending: 0, failed: 0, terminalGaps: 0, alert: false });
      expect(report.lastSuccessfulRunAt).toBeTruthy();
      expect(report.corpusCounts).toEqual({ manifests: 0, documents: 0, versions: 0 });
    } finally {
      try {
        rmSync(file, { force: true });
      } catch {
        /* driver do Windows pode liberar o arquivo após o teste */
      }
    }
  });
});
