import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import JSZip from 'jszip';
import { inventoryCatalog } from './inventory-catalog.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const counts = { forma: 1, materia: 1 };

async function fixture({ alterManifest, alterZip, alterMetadata } = {}) {
  const zip = new JSZip();
  const files = [
    ['Forma/peca-teste.md', 'forma', 'peca-teste', null],
    ['Matéria/tema-teste.md', 'materia', 'tema-teste', 'processo-penal'],
  ].map(([path, category, stableId, materia], index) => {
    const id = `id-${index}`;
    const title = `Título ${index}`;
    const content = `# ${title}\n\nTexto sintético ${index}.\n`;
    const subpath = materia ? `${materia}/provas/` : '';
    const metadata = {
      id,
      stableId,
      title,
      category,
      version: 2,
      isOfficial: true,
      isActive: true,
      sourcePath: `lib/skills/official/${category}/${subpath}${stableId}.md`,
      materia,
      documentType: category === 'forma' ? stableId : null,
      description: 'Descrição sintética',
      triggers: ['termo de teste'],
      contentLength: content.length,
    };
    alterMetadata?.(metadata);
    const frontmatter = Object.entries(metadata)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');
    const markdown = `---\n${frontmatter}\n---\n\n${content}`;
    zip.file(path, markdown, { createFolders: false });
    return {
      path,
      id,
      stableId,
      title,
      category,
      version: 2,
      contentLength: content.length,
      contentBytes: Buffer.byteLength(content),
      sha256File: sha(markdown),
      sha256Content: sha(content),
    };
  });
  const manifest = {
    source: 'Catálogo sintético',
    capturedOn: '2026-11-10',
    scope: { isOfficial: true, isActive: true },
    counts: { Forma: 1, Matéria: 1 },
    expected: 2,
    errors: 0,
    files,
  };
  alterManifest?.(manifest);
  zip.file('MANIFESTO.json', JSON.stringify(manifest));
  zip.file('LEIA-ME.md', '# Fixture');
  alterZip?.(zip);
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  return { bytes, options: { archiveSha256: sha(bytes), counts } };
}

test('inventaria ambas as categorias, com origem, cobertura e sem o texto das fichas', async () => {
  const { bytes, options } = await fixture();
  const result = await inventoryCatalog(bytes, options);
  assert.deepEqual(result.counts, counts);
  assert.equal(result.archiveSha256, options.archiveSha256);
  assert.equal(result.items[0].reviewStatus, 'pending');
  assert.equal(result.items[1].area, 'processo-penal');
  assert.equal(result.items[1].subarea, 'provas');
  assert.deepEqual(result.items[1].triggers, ['termo de teste']);
  assert.deepEqual(result.coverage.forms, [{ documentType: 'peca-teste', count: 1 }]);
  assert.deepEqual(result.coverage.matters, [{ area: 'processo-penal', subarea: 'provas', count: 1 }]);
  assert.doesNotMatch(JSON.stringify(result), /Texto sintético/);
});

test('recusa bytes diferentes do hash declarado para o ZIP', async () => {
  const { bytes, options } = await fixture();
  await assert.rejects(inventoryCatalog(bytes, { ...options, archiveSha256: '0'.repeat(64) }), /SHA-256 do ZIP/);
});

test('recusa caminho fora da categoria e da pasta esperada', async () => {
  const { bytes, options } = await fixture({
    alterManifest: (m) => (m.files[0].path = 'Forma/../peca-teste.md'),
  });
  await assert.rejects(inventoryCatalog(bytes, options), /Caminho inseguro/);
});

test('recusa identidade duplicada no manifesto', async () => {
  const { bytes, options } = await fixture({
    alterManifest: (m) => (m.files[1].id = m.files[0].id),
  });
  await assert.rejects(inventoryCatalog(bytes, options), /Registro duplicado/);
});

test('recusa categoria desconhecida', async () => {
  const { bytes, options } = await fixture({
    alterManifest: (m) => (m.files[0].category = 'outra'),
  });
  await assert.rejects(inventoryCatalog(bytes, options), /Categoria inválida/);
});

test('recusa conteúdo divergente mesmo quando o hash do arquivo Markdown confere', async () => {
  const { bytes, options } = await fixture({
    alterManifest: (m) => (m.files[0].sha256Content = '0'.repeat(64)),
  });
  await assert.rejects(inventoryCatalog(bytes, options), /Conteúdo divergente/);
});

test('recusa metadados de identidade que divergem da ficha no manifesto', async () => {
  const { bytes, options } = await fixture({
    alterMetadata: (m) => (m.version = 3),
  });
  await assert.rejects(inventoryCatalog(bytes, options), /Metadados divergentes/);
});

test('conserva ficha com área ambígua e a marca para avaliação', async () => {
  const { bytes, options } = await fixture({
    alterMetadata: (m) => {
      if (m.category === 'materia') m.materia = 'civil';
    },
  });
  const result = await inventoryCatalog(bytes, options);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[1].area, null);
  assert.ok(result.items[1].reviewReasons.includes('AREA_CONFLICT'));
});

test('recusa arquivo ZIP ausente do manifesto', async () => {
  const { bytes, options } = await fixture({
    alterZip: (zip) => zip.file('outro.md', 'arquivo inesperado'),
  });
  await assert.rejects(inventoryCatalog(bytes, options), /Entrada não inventariada/);
});
