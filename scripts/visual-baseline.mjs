import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';
import {
  APP_ROUTES,
  PUBLIC_ROUTES,
  STYLE_PROPS,
  VIEWPORTS,
  diffStyleDumps,
  normalizeVolatileText,
  parseViewports,
  parseDevMesaOutput,
  screenName,
  summarizeAxe,
} from './visual-baseline-lib.mjs';

// Referência visual do app (plano, etapas V0 a V7): captura as telas em dois tamanhos, grava a cor, a tipografia e o raio de cada elemento
// e compara duas capturas. Serve para provar que um tema ou uma refatoração não mudou o que não devia.
//
//   node scripts/visual-baseline.mjs capture --out <pasta> [--origin <site> --api <api>] [--only <trecho>[,<trecho>…]] [--axe] [--viewports 360,768,1440]
//   node scripts/visual-baseline.mjs compare <pasta-antes> <pasta-depois> [--styles-only]
//
// Sem `--origin`, sobe um ambiente novo (`scripts/dev-mesa.mjs`, que exige `pnpm build`) e o encerra no fim. Subir um
// ambiente novo evita o servidor de desenvolvimento com a configuração do Tailwind antiga. As imagens ficam fora do Git.
// `--axe` roda o axe (WCAG 2.0 e 2.1, A e AA) em cada tela e grava `axe.json`; sai com código 1 se achar violação. O tema vem
// de `VITE_FORGELEX_THEME` (clássico, `gelo` ou `previa`), que o ambiente repassa ao Vite.

const root = resolve(import.meta.dirname, '..');
const token = 'phase7-e2e-access-token';

const [command, ...rest] = process.argv.slice(2);
if (command === 'capture') await capture(rest);
else if (command === 'compare') await compare(rest);
else {
  console.error('Uso: visual-baseline.mjs capture --out <pasta> | compare <antes> <depois>');
  process.exit(2);
}

async function startEnvironment() {
  // Em grupo próprio, para encerrar também o Vite, que o dev-mesa inicia por um `pnpm` e deixaria vivo.
  const windows = process.platform === 'win32';
  const child = spawn(process.execPath, ['scripts/dev-mesa.mjs'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !windows,
  });
  let output = '';
  const ready = new Promise((done, fail) => {
    const onData = (chunk) => {
      output += String(chunk);
      const found = parseDevMesaOutput(output);
      if (found) done(found);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => fail(new Error(`dev-mesa encerrou (código ${code}):\n${output.slice(-600)}`)));
    setTimeout(() => fail(new Error('O ambiente não ficou pronto em 3 minutos.')), 180_000).unref();
  });
  const urls = await ready;
  const stop = () => {
    if (windows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // já encerrou
      }
  };
  return { ...urls, stop };
}

async function capture(args) {
  const { values } = parseArgs({
    args,
    options: {
      out: { type: 'string' },
      origin: { type: 'string' },
      api: { type: 'string' },
      only: { type: 'string' },
      axe: { type: 'boolean', default: false },
      viewports: { type: 'string' },
    },
  });
  const viewports = parseViewports(values.viewports);
  if (!values.out) throw new Error('Informe --out <pasta>.');
  if (Boolean(values.origin) !== Boolean(values.api)) throw new Error('Informe --origin e --api juntos.');
  const out = resolve(values.out);
  mkdirSync(out, { recursive: true });
  const environment = values.origin ? { site: values.origin, api: values.api, stop() {} } : await startEnvironment();
  const browser = await chromium.launch();
  const dumps = {};
  const accessibility = {};
  const errors = [];
  try {
    for (const [size, viewport] of Object.entries(viewports)) {
      const context = await browser.newContext({
        viewport,
        reducedMotion: 'reduce',
        locale: 'pt-BR',
        timezoneId: 'America/Maceio',
      });
      const page = await context.newPage();
      const shoot = async (name, prepare) => {
        if (values.only && !values.only.split(',').some((part) => name.includes(part.trim()))) return;
        try {
          await prepare();
          await settle(page);
          await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
          dumps[name] = await styleDump(page);
          if (values.axe) {
            const result = await new AxeBuilder({ page })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
              .analyze();
            accessibility[name] = summarizeAxe(result.violations);
          }
          console.log(`${name}: ${dumps[name].length} elementos`);
        } catch (error) {
          dumps[name] = `ERRO ${String(error.message).split('\n')[0]}`;
          errors.push(name);
          console.error(`${name}: ${dumps[name]}`);
        }
      };
      const visit = (route) =>
        shoot(screenName(size, route), () => page.goto(environment.site + route, { waitUntil: 'networkidle' }));

      for (const route of PUBLIC_ROUTES) await visit(route);
      await login(page, environment.site);
      for (const route of APP_ROUTES) await visit(route);
      await dataScreens(page, environment, size, shoot);
      await context.close();
    }
  } finally {
    await browser.close();
    environment.stop();
  }
  writeFileSync(join(out, 'styles.json'), JSON.stringify(dumps));
  if (values.axe) writeFileSync(join(out, 'axe.json'), JSON.stringify(accessibility, null, 2));
  writeFileSync(
    join(out, 'manifest.json'),
    JSON.stringify(
      {
        commit: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim(),
        screens: Object.keys(dumps),
        viewports,
        styleProps: STYLE_PROPS,
      },
      null,
      2,
    ),
  );
  if (errors.length) {
    console.error(`\n${errors.length} tela(s) com erro: ${errors.join(', ')}`);
    process.exit(1);
  }
  if (values.axe) {
    const failing = Object.entries(accessibility).filter(([, violations]) => violations.length);
    for (const [name, violations] of failing) {
      for (const item of violations)
        console.error(`AXE ${name}: ${item.id} (${item.impact}) em ${item.count}: ${item.targets.join(' | ')}`);
    }
    console.log(
      `Acessibilidade: ${failing.length === 0 ? 'nenhuma violação' : `${failing.length} tela(s) com violação`} em ${Object.keys(accessibility).length} telas`,
    );
    if (failing.length) process.exit(1);
  }
  console.log(`\n${Object.keys(dumps).length} capturas em ${out}`);
}

async function login(page, site) {
  await page.goto(`${site}/entrar`);
  await page.getByLabel('E-mail').fill('trabalho@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
}

/** Telas que só existem com dados: criados pela API do ambiente sintético, com nomes fixos. */
async function dataScreens(page, { site, api }, size, shoot) {
  const headers = { authorization: `Bearer ${token}` };
  const post = async (path, data, extra = {}) => {
    const response = await page.request.post(`${api}${path}`, { headers: { ...headers, ...extra }, data });
    if (!response.ok()) throw new Error(`${path} respondeu ${response.status()}`);
    return response.json();
  };
  const matter = await post('/api/v2/matters', { title: 'Caso de referência visual' });
  const { draft, version } = await post(`/api/v2/matters/${matter.id}/drafts`, {
    title: 'Peça de referência visual',
    sections: [
      { ordinal: 0, title: 'Dos fatos', content: 'O autor alega dano moral pela cobrança indevida.' },
      { ordinal: 1, title: 'Do direito', content: 'A cobrança sem contrato válido gera dever de indenizar.' },
    ],
  });
  await post(`/api/v2/matters/${matter.id}/documents`, {
    title: 'Contrato de referência',
    originalFilename: 'contrato.txt',
    mimeType: 'text/plain',
    content:
      'Contrato original: obrigação contratual.\n\nCláusula de pagamento: R$ 250,00.\n\nÚltimo parágrafo: obrigação cumprida.',
  });
  const operationId = crypto.randomUUID();
  await post(
    '/api/v2/research/search-case-law',
    { query: 'civil', court: 'STJ', limit: 3 },
    { 'Idempotency-Key': operationId },
  );
  await post('/api/v2/research/saved', { operationId });

  const desk = `${site}/app/trabalho?${new URLSearchParams({ matterId: matter.id, draftId: draft.id, versionId: version.id })}`;
  await shoot(screenName(size, '/dados/mesa-com-peca'), async () => {
    await page.goto(desk, { waitUntil: 'networkidle' });
    await page.getByLabel('Texto da seção 1', { exact: true }).waitFor();
  });
  await shoot(screenName(size, '/dados/leitor-de-decisao'), async () => {
    await page.goto(desk, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Pesquisa e fontes', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Pesquisa e fontes' });
    const saved = dialog.getByRole('region', { name: 'Pesquisas salvas' });
    await saved.getByRole('button', { name: 'Abrir', exact: true }).first().click();
    await saved.getByRole('region', { name: 'Leitor de decisões' }).waitFor();
  });
  const cases = `${site}/app/casos?caso=${matter.id}`;
  await shoot(screenName(size, '/dados/casos-com-caso'), async () => {
    await page.goto(cases, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Abrir documento: Contrato de referência', exact: true }).waitFor();
  });
  await shoot(screenName(size, '/dados/casos-leitor-documento'), async () => {
    await page.goto(cases, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Abrir documento: Contrato de referência', exact: true }).click();
    await page.getByRole('dialog', { name: 'Leitura do documento' }).waitFor();
  });
  await u7Screens(page, { site, api }, size, shoot, post);
}

/**
 * Telas da U7 e da Visão (aceite visual de 19/11/2026): a aba Documentos, salvar o anexo no caso, o gerenciador com um caso
 * na lixeira e a Visão enquanto verifica os primeiros passos. Usam um caso à parte para não mudar as telas acima, que
 * seguem comparáveis com as capturas antigas.
 */
async function u7Screens(page, { site, api }, size, shoot, post) {
  const matter = await post('/api/v2/matters', { title: 'Caso do aceite da U7' });
  const { draft, version } = await post(`/api/v2/matters/${matter.id}/drafts`, {
    title: 'Peça do aceite da U7',
    sections: [{ ordinal: 0, title: 'Dos fatos', content: 'O autor alega dano moral pela cobrança indevida.' }],
  });
  for (const [title, originalFilename, content] of [
    ['Petição inicial', 'peticao.txt', 'O autor alega o descumprimento do contrato de locação.'],
    ['Contrato de locação', 'contrato-locacao.txt', 'As partes ajustaram o prazo de trinta meses.'],
  ]) {
    await post(`/api/v2/matters/${matter.id}/documents`, { title, originalFilename, mimeType: 'text/plain', content });
  }
  const desk = `${site}/app/trabalho?${new URLSearchParams({ matterId: matter.id, draftId: draft.id, versionId: version.id })}`;

  await shoot(screenName(size, '/dados/mesa-aba-documentos'), async () => {
    await page.goto(desk, { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: 'Documentos', exact: true }).click();
    await page.getByRole('heading', { name: 'Documentos do caso' }).waitFor();
    await page.getByText('Contrato de locação').waitFor();
  });

  // Salvar o anexo no caso: o botão no chip e, depois do clique, o aviso de onde foi salvo.
  const attach = async () => {
    await page.goto(`${site}/app/trabalho?matterId=${matter.id}`, { waitUntil: 'networkidle' });
    await page.getByLabel('Escolher arquivos para anexar').setInputFiles({
      name: 'relato.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Primeira linha do relato.\nSegunda linha do relato.'),
    });
    await page.getByRole('button', { name: 'Salvar no caso: relato.txt' }).waitFor();
  };
  await shoot(screenName(size, '/dados/anexo-salvar-no-caso'), attach);
  await shoot(screenName(size, '/dados/anexo-salvo-no-caso'), async () => {
    await attach();
    await page.getByRole('button', { name: 'Salvar no caso: relato.txt' }).click();
    await page.getByText('Salvo no caso').waitFor();
  });

  // Gerenciador de casos na lixeira: o caminho para a exclusão definitiva.
  const trashed = await post('/api/v2/matters', { title: 'Caso na lixeira do aceite' });
  await post(`/api/v2/matters/${trashed.id}/trash`, { expectedLifecycleRevision: 0 });
  await shoot(screenName(size, '/dados/gerenciar-casos-lixeira'), async () => {
    await page.goto(`${site}/app/trabalho`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Gerenciar casos', exact: true }).click();
    const manager = page.getByRole('dialog', { name: 'Gerenciar casos' });
    await manager.getByLabel('Mostrar casos').selectOption('trash');
    await manager.getByRole('button', { name: 'Excluir definitivamente: Caso na lixeira do aceite' }).waitFor();
  });

  // A Visão enquanto os dados dos primeiros passos não chegaram: um esqueleto, sem destaque que depois troque de lugar.
  let release;
  const held = new Promise((resolve) => (release = resolve));
  const hold = async (route) => {
    await held;
    await route.continue();
  };
  await page.route((url) => url.pathname === '/api/v2/matters', hold);
  try {
    await shoot(screenName(size, '/dados/visao-verificando'), async () => {
      await page.goto(`${site}/app`, { waitUntil: 'domcontentloaded' });
      await page.getByText('Verificando…').first().waitFor();
    });
  } finally {
    release();
    await page.unroute((url) => url.pathname === '/api/v2/matters', hold).catch(() => undefined);
  }
}

/** Deixa a tela parada e igual de uma execução para outra: sem animação e sem data, hora ou identificador sorteado. */
async function settle(page) {
  await page.addStyleTag({
    content:
      '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}',
  });
  // Fontes carregadas e dois quadros pintados: sem isso a primeira tela de um ambiente novo sai com texto a meio pixel.
  await page.evaluate(() =>
    document.fonts.ready.then(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))),
  );
  await page.waitForTimeout(400);
  const texts = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node.nodeValue ?? '');
    return nodes;
  });
  const normalized = texts.map(normalizeVolatileText);
  await page.evaluate((values) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let index = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) node.nodeValue = values[index++];
  }, normalized);
}

function styleDump(page) {
  return page.evaluate((props) => {
    const rows = [];
    const walk = (element, path) => {
      const style = getComputedStyle(element);
      rows.push([path, ...props.map((prop) => style[prop])]);
      [...element.children].forEach((child, index) => walk(child, `${path}>${child.tagName.toLowerCase()}:${index}`));
    };
    walk(document.body, 'body');
    return rows;
  }, STYLE_PROPS);
}

async function compare(args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { 'styles-only': { type: 'boolean', default: false } },
  });
  const [beforeDir, afterDir] = positionals.map((dir) => resolve(dir));
  if (!beforeDir || !afterDir) throw new Error('Informe as duas pastas: compare <antes> <depois>.');
  const read = (dir) => JSON.parse(readFileSync(join(dir, 'styles.json'), 'utf8'));
  const diffs = diffStyleDumps(read(beforeDir), read(afterDir));
  for (const diff of diffs.slice(0, 40)) {
    console.log(
      diff.kind === 'style'
        ? `ESTILO ${diff.screen} ${diff.path} ${diff.prop}: ${diff.before} => ${diff.after}`
        : `${diff.kind.toUpperCase()} ${diff.screen}${diff.before ? `: ${diff.before} => ${diff.after}` : ''}`,
    );
  }
  if (diffs.length > 40) console.log(`... e mais ${diffs.length - 40} diferenças`);
  console.log(`Estilos: ${diffs.length === 0 ? 'idênticos' : `${diffs.length} diferença(s)`}`);

  let pixelsDiffer = 0;
  if (!values['styles-only']) {
    const names = readdirSync(beforeDir).filter((file) => file.endsWith('.png'));
    const browser = await chromium.launch();
    const page = await browser.newPage();
    for (const name of names) {
      let after;
      try {
        after = readFileSync(join(afterDir, name));
      } catch {
        console.log(`IMAGEM ausente depois: ${name}`);
        pixelsDiffer++;
        continue;
      }
      const before = readFileSync(join(beforeDir, name));
      if (before.equals(after)) continue;
      const result = await pixelDifference(page, before, after);
      pixelsDiffer++;
      console.log(`PIXELS ${name}: ${result}`);
    }
    await browser.close();
    console.log(
      `Imagens: ${pixelsDiffer === 0 ? `${names.length} idênticas` : `${pixelsDiffer} diferente(s) de ${names.length}`}`,
    );
  }
  process.exit(diffs.length || pixelsDiffer ? 1 : 0);
}

function pixelDifference(page, before, after) {
  return page.evaluate(
    async ([a, b]) => {
      const load = (data) =>
        new Promise((done) => {
          const image = new Image();
          image.onload = () => done(image);
          image.src = `data:image/png;base64,${data}`;
        });
      const [x, y] = await Promise.all([load(a), load(b)]);
      if (x.width !== y.width || x.height !== y.height)
        return `tamanho ${x.width}x${x.height} => ${y.width}x${y.height}`;
      const pixels = (image) => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height).data;
      };
      const p = pixels(x);
      const q = pixels(y);
      let count = 0;
      let maxDelta = 0;
      let top = Infinity;
      let bottom = -1;
      for (let i = 0; i < p.length; i += 4) {
        const delta = Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2]));
        if (!delta) continue;
        count++;
        maxDelta = Math.max(maxDelta, delta);
        const row = Math.floor(i / 4 / x.width);
        top = Math.min(top, row);
        bottom = Math.max(bottom, row);
      }
      return `${count} pixels diferentes (maior diferença de canal ${maxDelta}), linhas ${top} a ${bottom}`;
    },
    [before.toString('base64'), after.toString('base64')],
  );
}
