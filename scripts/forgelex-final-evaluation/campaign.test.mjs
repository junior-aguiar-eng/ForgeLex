import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCalibrationArgs, campaignPacket } from './campaign.mjs';

test('real execution requires a named campaign, explicit cap and credential; offline remains the default', () => {
  assert.deepEqual(parseCalibrationArgs([], {}), { real: false, campaignId: null });
  assert.deepEqual(parseCalibrationArgs(['--campaign=delivery-gaps-v5'], {}), {
    real: false,
    campaignId: 'delivery-gaps-v5',
  });
  const flags = ['--real', '--campaign=delivery-gaps-v5', '--approve-calibration-usd=1.50'];
  assert.throws(() => parseCalibrationArgs(flags, {}), /approval and OPENAI_API_KEY/);
  assert.throws(
    () =>
      parseCalibrationArgs(
        flags.filter((f) => !f.startsWith('--campaign=')),
        { OPENAI_API_KEY: 'fake' },
      ),
    /named campaign/,
  );
  assert.throws(
    () =>
      parseCalibrationArgs(
        flags.filter((f) => !f.startsWith('--approve')),
        { OPENAI_API_KEY: 'fake' },
      ),
    /approval and OPENAI_API_KEY/,
  );
  assert.equal(parseCalibrationArgs(flags, { OPENAI_API_KEY: 'fake' }).real, true);
});

test('rejects ambiguous arguments, path traversal and approval in offline mode', () => {
  for (const args of [
    ['--campaign=../real-calibration'],
    ['--campaign=C:/old'],
    ['--campaign='],
    ['--campaign=a', '--campaign=b'],
    ['--real', '--real'],
    ['--unknown'],
    ['--approve-calibration-usd=1.50'],
    ['--campaign=real-calibration'],
  ])
    assert.throws(() => parseCalibrationArgs(args, {}));
});

test('freezes a separate campaign packet and refuses replacing it with changed inputs', () => {
  const directory = mkdtempSync(join(tmpdir(), 'forgelex-campaign-'));
  const bytes = Buffer.from('{"candidate":"v5"}\n');
  const path = campaignPacket(directory, bytes);
  assert.deepEqual(readFileSync(path), bytes);
  assert.equal(campaignPacket(directory, bytes), path);
  assert.throws(() => campaignPacket(directory, Buffer.from('{}')), /CAMPAIGN_PACKET_CHANGED/);
  assert.deepEqual(readFileSync(path), bytes);
  assert.equal(campaignPacket(directory), path);
  writeFileSync(path, '{}');
  assert.throws(() => campaignPacket(directory), /CAMPAIGN_PACKET_CHANGED/);
});

test('real mode cannot create an unprepared campaign or repair an incomplete one', () => {
  const directory = join(mkdtempSync(join(tmpdir(), 'forgelex-campaign-')), 'missing');
  assert.throws(() => campaignPacket(directory), /CAMPAIGN_NOT_PREPARED/);
  assert.equal(existsSync(directory), false);
  const path = campaignPacket(directory, Buffer.from('{}'));
  writeFileSync(join(directory, 'packet.sha256'), 'broken');
  assert.throws(() => campaignPacket(directory, Buffer.from('{}')), /CAMPAIGN_PACKET_CHANGED/);
  assert.equal(readFileSync(path, 'utf8'), '{}');
});
