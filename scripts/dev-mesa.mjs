import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Ambiente de desenvolvimento da Mesa: API de teste (SQLite descartável, Auth sintético, respostas sintéticas) e Vite
// com recarga automática. Nada de nuvem, de produção ou de provedor pago. Sobe sempre o código da worktree atual.
//
// Uso:  pnpm dev:mesa            (compila antes)
//       node scripts/dev-mesa.mjs (sem compilar; exige `pnpm build` feito)
// Variáveis: DEV_MESA_PORT_BASE (padrão 3400), DEV_MESA_HOST (padrão 127.0.0.1).

const root = resolve(import.meta.dirname, '..');
const host = process.env.DEV_MESA_HOST ?? '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('DEV_MESA_HOST_MUST_BE_LOOPBACK');
const base = Number(process.env.DEV_MESA_PORT_BASE ?? 3400);

const needed = ['apps/api/dist/app.js', 'packages/persistence/dist/index.js'];
const missing = needed.filter((file) => !existsSync(join(root, file)));
if (missing.length) {
  console.error(`Falta compilar (${missing.join(', ')}). Rode: pnpm build`);
  process.exit(1);
}

const isFree = (port) =>
  new Promise((done) => {
    const probe = createServer();
    probe.once('error', () => done(false));
    probe.listen(port, host, () => probe.close(() => done(true)));
  });
async function freePorts(start, count) {
  for (let first = start; first < start + 200; first += count) {
    const ports = Array.from({ length: count }, (_, index) => first + index);
    if ((await Promise.all(ports.map(isFree))).every(Boolean)) return ports;
  }
  throw new Error('NO_FREE_PORTS');
}

const [webPort, apiPort, authPort] = await freePorts(base, 3);
const webOrigin = `http://${host}:${webPort}`;
const apiOrigin = `http://${host}:${apiPort}`;
const authOrigin = `http://${host}:${authPort}`;
const directory = mkdtempSync(join(tmpdir(), 'forgelex-dev-mesa-'));
const databaseUrl = pathToFileURL(join(directory, 'dev.sqlite')).href;

const apiEnv = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  FORGELEX_DATABASE_URL: databaseUrl,
  FORGELEX_E2E_AUTH_URL: authOrigin,
  FORGELEX_E2E_API_PORT: String(apiPort),
  FORGELEX_E2E_WEB_ORIGIN: webOrigin,
  // Respostas sintéticas com saldo e preço, para ver a linha de custo e o fluxo comercial sem inferência paga.
  FORGELEX_E2E_COMMERCIAL: 'true',
  FORGELEX_E2E_SAVED_RESEARCH: 'true',
  FORGELEX_DESK_GUIDANCE_ENABLED: 'true',
  FORGELEX_DESK_GUIDANCE_V3_ENABLED: 'true',
  FORGELEX_E2E_GUIDANCE_V3: 'true',
  FORGELEX_E2E_GUIDED_SKILLS: 'false',
};
const webEnv = {
  ...process.env,
  VITE_SUPABASE_URL: authOrigin,
  VITE_SUPABASE_PUBLISHABLE_KEY: 'phase7-e2e-publishable',
  VITE_FORGELEX_API_URL: apiOrigin,
  // As mesmas flags de interface que a produção tem ligadas.
  VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED: 'true',
  VITE_FORGELEX_CASE_WORKSPACE_ENABLED: 'true',
  VITE_FORGELEX_SAVED_RESEARCH_ENABLED: 'true',
  VITE_FORGELEX_DESK_SHELL: 'true',
  VITE_FORGELEX_ATTACHMENTS_ENABLED: 'true',
  VITE_FORGELEX_MATTER_CHIPS_ENABLED: 'true',
};

const windows = process.platform === 'win32';
const children = [];
function start(name, command, args, env) {
  const child = spawn(command, args, {
    cwd: root,
    env,
    shell: windows && command === 'pnpm',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tag = `[${name}]`;
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) =>
      String(chunk)
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((line) =>
          name === 'web' || /error|warn|fatal/i.test(line) || !line.startsWith('{')
            ? console.log(`${tag} ${line}`)
            : undefined,
        ),
    );
  child.once('exit', (code) => {
    if (!stopping) {
      console.error(`${tag} encerrou (código ${code}). Encerrando o ambiente.`);
      stop(1);
    }
  });
  children.push(child);
  return child;
}

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    if (windows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  try {
    rmSync(directory, { recursive: true, force: true });
  } catch {
    // arquivo ainda em uso no Windows: o diretório temporário é descartável
  }
  process.exit(code);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

async function waitFor(url, label, ms = 120_000) {
  const limit = Date.now() + ms;
  while (Date.now() < limit) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  console.error(`${label} não respondeu em ${ms / 1000} s.`);
  stop(1);
}

start('api', process.execPath, ['scripts/e2e-phase-7-server.mjs'], apiEnv);
await waitFor(`${apiOrigin}/readyz`, 'A API');
start(
  'web',
  'pnpm',
  ['--filter', '@forgelex/web', 'dev', '--host', host, '--port', String(webPort), '--strictPort'],
  webEnv,
);
await waitFor(webOrigin, 'O site');

console.log(`
Ambiente de desenvolvimento da Mesa pronto.
  Site:   ${webOrigin}/entrar
  Login:  trabalho@forgelex.test  /  senha-sintetica   (Auth sintético: qualquer e-mail e senha entram)
  API:    ${apiOrigin}   Auth sintético: ${authOrigin}
  Dados:  SQLite descartável em ${directory}
Respostas de IA sintéticas, sem provedor pago. Ctrl+C encerra tudo.
`);
