// Página de revisão do aceite visual: junta as capturas de `scripts/visual-baseline.mjs` (desktop e celular de cada tela)
// com o que olhar em cada uma, e um veredito por tela. Um arquivo HTML só, com as imagens dentro (JPEG comprimido), para
// abrir sem servidor. O resumo dos vereditos aparece na própria página, com "Copiar" e "Baixar": o aceite A19 mostrou que
// depender do armazenamento do navegador deixa o registro vazio, então o resumo é texto que o Boni cola na conversa.
//
//   node scripts/visual-review-page.mjs --in <pasta das capturas> --manifest <manifesto.json> --out <página.html> [--ref <sha>]
//
// O manifesto é `{ "titulo", "subtitulo", "telas": [{ "id", "titulo", "capturas": ["<trecho do nome>"], "olhar": ["..."] }] }`.
// Cada tela do manifesto usa as capturas cujo nome contém o trecho, nos dois tamanhos (`desktop-…` e `celular-…`).
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const { values } = parseArgs({
  options: { in: { type: 'string' }, manifest: { type: 'string' }, out: { type: 'string' }, ref: { type: 'string' } },
});
if (!values.in || !values.manifest || !values.out) {
  console.error(
    'Uso: visual-review-page.mjs --in <capturas> --manifest <manifesto.json> --out <página.html> [--ref <sha>]',
  );
  process.exit(2);
}
const dir = resolve(values.in);
const manifest = JSON.parse(readFileSync(resolve(values.manifest), 'utf8'));
const files = readdirSync(dir).filter((name) => name.endsWith('.png'));
const accessibilityFile = join(dir, 'accessibility.json');
const accessibility = existsSync(accessibilityFile) ? JSON.parse(readFileSync(accessibilityFile, 'utf8')) : undefined;

const escapeHtml = (text) =>
  String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

const browser = await chromium.launch();
const page = await browser.newPage();
/** PNG de tela inteira vira JPEG de até `width` px de largura: a página fica leve e continua legível. */
async function compact(file, width) {
  const base64 = readFileSync(join(dir, file)).toString('base64');
  return page.evaluate(
    async ({ base64, width }) => {
      const image = new Image();
      await new Promise((done, fail) => {
        image.onload = done;
        image.onerror = fail;
        image.src = `data:image/png;base64,${base64}`;
      });
      const scale = Math.min(1, width / image.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.72);
    },
    { base64, width },
  );
}

const sections = [];
const missing = [];
for (const screen of manifest.telas) {
  const shots = [];
  for (const part of screen.capturas) {
    for (const [size, label, width] of [
      ['desktop', 'Desktop (1440 px)', 1100],
      ['celular', 'Celular (390 px)', 390],
    ]) {
      const file =
        files.find((name) => name === `${size}-${part}.png`) ??
        files.find((name) => name.startsWith(`${size}-`) && name.includes(part));
      if (!file) {
        missing.push(`${size}-${part}`);
        continue;
      }
      const violations = accessibility?.[file.replace(/\.png$/, '')];
      shots.push({
        label: `${label}${screen.capturas.length > 1 ? ` — ${part}` : ''}`,
        src: await compact(file, width),
        violations,
      });
    }
  }
  sections.push({ screen, shots });
}
await browser.close();

const block = ({ screen, shots }, index) => `
<section class="tela" id="${escapeHtml(screen.id)}" data-id="${escapeHtml(screen.id)}" data-title="${escapeHtml(screen.titulo)}">
  <h2><span class="n">${index + 1}</span> ${escapeHtml(screen.titulo)}</h2>
  <div class="olhar"><strong>O que olhar</strong><ul>${screen.olhar.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
  <div class="capturas">${shots
    .map(
      (shot) =>
        `<figure><figcaption>${escapeHtml(shot.label)}${
          shot.violations === undefined
            ? ''
            : shot.violations.length
              ? ` <span class="axe ruim">axe: ${shot.violations.length} violação(ões)</span>`
              : ' <span class="axe ok">axe: sem violação</span>'
        }</figcaption><img loading="lazy" alt="${escapeHtml(screen.titulo)} — ${escapeHtml(shot.label)}" src="${shot.src}"></figure>`,
    )
    .join('')}</div>
  <fieldset class="veredito"><legend>Veredito${shots.length === 0 ? ' (sem captura)' : ''}</legend>
    <label><input type="radio" name="v-${escapeHtml(screen.id)}" value="Aprovado"> Aprovado</label>
    <label><input type="radio" name="v-${escapeHtml(screen.id)}" value="Ajustar"> Ajustar</label>
    <label><input type="radio" name="v-${escapeHtml(screen.id)}" value="Não vi"> Não vi</label>
    <input type="text" class="nota" placeholder="Nota (opcional): o que ajustar e onde" aria-label="Nota sobre ${escapeHtml(screen.titulo)}">
  </fieldset>
</section>`;

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(manifest.titulo)}</title>
<style>
  :root{color-scheme:light dark;--bg:#f4f8f9;--fg:#0f2a31;--mut:#4a6a72;--card:#fff;--line:#cfdde1;--ac:#0f5c6e;--ok:#1a7f4b;--bad:#b3261e}
  @media (prefers-color-scheme:dark){:root{--bg:#0e1a1d;--fg:#e6f0f2;--mut:#9ab4ba;--card:#14262a;--line:#27434a;--ac:#5fb4c7;--ok:#5fd08f;--bad:#ff8a80}}
  body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
  header,main{max-width:1180px;margin:0 auto;padding:16px}
  h1{font-size:24px;margin:8px 0}h2{font-size:19px;margin:0 0 8px}.n{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--ac);color:var(--bg);font-size:14px}
  p.sub{color:var(--mut);margin:0 0 8px}
  .tela{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin:16px 0}
  .olhar ul{margin:6px 0 12px;padding-left:20px}.olhar li{margin:3px 0}
  .capturas{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}
  figure{margin:0;flex:1 1 320px;min-width:0}figure:first-child{flex:3 1 520px}
  figcaption{font-size:13px;color:var(--mut);margin-bottom:4px}
  img{max-width:100%;height:auto;border:1px solid var(--line);border-radius:8px}
  .axe{font-weight:600}.axe.ok{color:var(--ok)}.axe.ruim{color:var(--bad)}
  .veredito{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;border:1px solid var(--line);border-radius:10px;margin:14px 0 0;padding:8px 12px}
  .veredito legend{font-weight:600;padding:0 4px}.veredito label{display:inline-flex;gap:6px;align-items:center;min-height:44px}
  .nota{flex:1 1 260px;min-height:40px;padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);font:inherit}
  .resumo{position:sticky;bottom:0;background:var(--card);border-top:2px solid var(--ac);padding:12px 16px}
  .resumo .in{max-width:1180px;margin:0 auto}.resumo textarea{width:100%;min-height:110px;box-sizing:border-box;font:13px/1.4 ui-monospace,monospace;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:8px}
  button{min-height:44px;padding:0 16px;border-radius:10px;border:1px solid var(--ac);background:var(--ac);color:var(--bg);font:inherit;font-weight:600;cursor:pointer}
  button.sec{background:transparent;color:var(--ac)}
  input:focus-visible,button:focus-visible,textarea:focus-visible{outline:3px solid var(--ac);outline-offset:2px}
</style></head><body>
<header><h1>${escapeHtml(manifest.titulo)}</h1><p class="sub">${escapeHtml(manifest.subtitulo ?? '')}${values.ref ? ` · referência <code>${escapeHtml(values.ref)}</code>` : ''}</p>
<p class="sub">Marque um veredito por tela. O resumo no fim da página é o que vale: use <strong>Copiar</strong> e cole na conversa. Nada depende do armazenamento do navegador.</p></header>
<main>${sections.map(block).join('\n')}</main>
<div class="resumo"><div class="in"><strong>Resumo do aceite</strong> <span id="contagem"></span>
<textarea id="resumo" readonly aria-label="Resumo do aceite para copiar"></textarea>
<p><button id="copiar" type="button">Copiar resumo</button> <button id="baixar" type="button" class="sec">Baixar .txt</button> <span id="aviso" role="status"></span></p></div></div>
<script>
(function(){
  var telas=[].slice.call(document.querySelectorAll('.tela'));
  var area=document.getElementById('resumo'),aviso=document.getElementById('aviso'),cont=document.getElementById('contagem');
  function atualizar(){
    var linhas=[],feitas=0;
    telas.forEach(function(t,i){
      var sel=t.querySelector('input[type=radio]:checked'),nota=t.querySelector('.nota').value.trim();
      if(sel)feitas++;
      linhas.push((i+1)+'. '+t.dataset.title+': '+(sel?sel.value:'sem veredito')+(nota?' — '+nota:''));
    });
    cont.textContent='('+feitas+' de '+telas.length+' telas com veredito)';
    area.value='Aceite visual — ${escapeHtml(manifest.titulo)}${values.ref ? ` (ref ${escapeHtml(values.ref)})` : ''}\\n'+linhas.join('\\n');
  }
  document.addEventListener('input',atualizar);document.addEventListener('change',atualizar);atualizar();
  document.getElementById('copiar').onclick=function(){
    function ok(){aviso.textContent='Resumo copiado.';}
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(area.value).then(ok,function(){area.select();document.execCommand('copy');ok();});}
    else{area.select();document.execCommand('copy');ok();}
  };
  document.getElementById('baixar').onclick=function(){
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([area.value],{type:'text/plain'}));a.download='aceite-visual.txt';a.click();
  };
})();
</script></body></html>`;
writeFileSync(resolve(values.out), html);
console.log(
  `Página gravada em ${values.out}: ${sections.length} telas, ${sections.reduce((n, item) => n + item.shots.length, 0)} imagens, ${(html.length / 1024 / 1024).toFixed(1)} MB.`,
);
if (missing.length) console.warn(`Sem captura para: ${missing.join(', ')}`);
