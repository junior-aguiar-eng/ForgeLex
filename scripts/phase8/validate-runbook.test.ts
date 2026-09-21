import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve('ops/gcp/phase8');
const files = () => readdirSync(root).filter((name) => name.endsWith('.sh') || name.endsWith('.env.example') || name === 'README.md').map((name) => ({ name, text: readFileSync(resolve(root, name), 'utf8') }));

describe('runbook GCP da Fase 8', () => {
  it('fixa o projeto e os nomes aprovados', () => {
    const config = readFileSync(resolve(root, 'config.env.example'), 'utf8');
    for (const line of ['PROJECT_ID=project-bbbe1209-c295-4720-867', 'REGION=southamerica-east1', 'SERVICE=forgelex-api-hml', 'SQL_INSTANCE=forgelex-hml-pg', 'AR_REPOSITORY=forgelex-hml', 'DOMAIN=hml.nexojuris.ia.br']) expect(config).toContain(line);
    for (const name of ['COMMIT_SHA', 'FORGELEX_PHASE8_DB_PASSWORD', 'FORGELEX_PHASE8_WEBHOOK_MASTER_KEY', 'FORGELEX_PHASE8_METRICS_TOKEN']) expect(config).toContain(`${name}=\${${name}:-}`);
  });

  it('não contém arquitetura ou credenciais proibidas', () => {
    const all = files().map((file) => file.text).join('\n');
    expect(all).not.toContain('nerdolajuridico.com.br');
    expect(all).not.toMatch(/--min-instances(?:=|\s+)(?!0(?:\s|$))/);
    expect(all).not.toMatch(/--max-instances(?:=|\s+)(?:[3-9]|[1-9]\d+)/);
    expect(all).not.toMatch(/--availability-type(?:=|\s+)REGIONAL|\bNAT\b|\bCDN\b|roles\/editor|service-account.*keys create/i);
    expect(all).not.toMatch(/(?:^|[^a-z])latest(?:[^a-z]|$)/i);
    expect(all).not.toMatch(/(?:password|secret|token)\s*=\s*['"][^$\n'"]+/i);
  });

  it('mantém proteções operacionais obrigatórias', () => {
    for (const file of files().filter((item) => item.name.endsWith('.sh'))) expect(file.text).toContain('set -euo pipefail');
    const preflight = readFileSync(resolve(root, '01-preflight.sh'), 'utf8');
    const provision = readFileSync(resolve(root, '02-provision-gate-a.sh'), 'utf8');
    expect(preflight).not.toContain('gcloud services enable');
    expect(preflight).toContain('missingApis');
    expect(preflight).toContain('FORGELEX_PHASE8_BUDGET_CONFIRMED');
    expect(provision).toContain('gcloud services enable');
    expect(provision).toContain('--edition=enterprise');
    expect(provision).toContain('gcloud beta sql instances patch');
    expect(provision).toContain('gcloud builds get-default-service-account');
    expect(provision).toContain('roles/cloudbuild.builds.builder');
    expect(provision).toMatch(/--min-instances=0[\s\S]*--max-instances=2/);
    expect(readFileSync(resolve(root, '05-teardown.sh'), 'utf8')).toContain('FORGELEX_PHASE8_TEARDOWN');
    expect(readFileSync(resolve(root, '03-publish-gate-b.sh'), 'utf8')).toContain('status == "passed"');
    expect(readFileSync(resolve(root, '03-publish-gate-b.sh'), 'utf8')).not.toMatch(/backend-services create[^\n]*--protocol=/);
  });
});
