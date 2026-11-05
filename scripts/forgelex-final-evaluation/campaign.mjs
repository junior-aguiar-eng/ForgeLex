import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function parseCalibrationArgs(args, environment) {
  let real = false;
  let approved = false;
  let campaignId = null;
  let expectedHead;
  for (const arg of args) {
    if (arg === '--real' && !real) real = true;
    else if (arg === '--approve-calibration-usd=1.50' && !approved) approved = true;
    else if (arg.startsWith('--campaign=') && campaignId === null) {
      campaignId = arg.slice('--campaign='.length);
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(campaignId) || campaignId === 'real-calibration')
        throw new Error('Invalid campaign identifier');
    } else if (arg.startsWith('--expected-head=') && expectedHead === undefined) {
      expectedHead = arg.slice('--expected-head='.length);
      if (!/^[a-f0-9]{40}$/.test(expectedHead)) throw new Error('Invalid expected HEAD');
    } else throw new Error('Unknown or duplicate option');
  }
  if (real && !campaignId) throw new Error('Real execution requires a named campaign; historical campaign is closed');
  if (real && (!approved || !environment.OPENAI_API_KEY?.trim()))
    throw new Error('Explicit calibration approval and OPENAI_API_KEY required; no request sent');
  if (!real && approved) throw new Error('Approval flag requires --real');
  return { real, campaignId, ...(expectedHead ? { expectedHead } : {}) };
}

// Caller holds the global runner lock. A campaign is immutable after first preparation.
// Missing/inconsistent sidecars are never repaired automatically.
export function assertNewPreparation(directory) {
  if (['packet.json', 'packet.sha256', 'preparation'].some((name) => existsSync(join(directory, name))))
    throw new Error('CAMPAIGN_PREPARATION_EXISTS: use a new campaign identifier');
}

export function campaignPacket(directory, preparedBytes) {
  const packetPath = join(directory, 'packet.json');
  const digestPath = join(directory, 'packet.sha256');
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  if (!existsSync(packetPath) && !existsSync(digestPath)) {
    if (!preparedBytes) throw new Error('CAMPAIGN_NOT_PREPARED');
    mkdirSync(directory, { recursive: true });
    writeFileSync(packetPath, preparedBytes, { flag: 'wx' });
    writeFileSync(digestPath, hash(preparedBytes) + '\n', { flag: 'wx' });
  }
  if (!existsSync(packetPath) || !existsSync(digestPath)) throw new Error('CAMPAIGN_PACKET_INCOMPLETE');
  const bytes = readFileSync(packetPath);
  if (hash(bytes) !== readFileSync(digestPath, 'utf8').trim() || (preparedBytes && !bytes.equals(preparedBytes)))
    throw new Error('CAMPAIGN_PACKET_CHANGED: use a new campaign identifier after reviewing the change');
  return packetPath;
}
