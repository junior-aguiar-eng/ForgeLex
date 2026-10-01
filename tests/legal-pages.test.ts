import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), 'apps/web/public');
const pages = ['termos-de-uso', 'privacidade', 'encerramento-de-conta', 'retencao-pos-encerramento'];
const placeholders =
  /\b(?:a validar|a qualificar|a designar|provis[oó]ri\w*)\b|\[(?:nome|contato|endereço|CPF|CNPJ)\]/i;

describe('páginas legais públicas', () => {
  it.each(pages)('%s oferece identificação, versão e navegação sem campos internos', (name) => {
    const path = resolve(root, 'legal', `${name}.html`);
    expect(existsSync(path), `Página ausente: ${name}`).toBe(true);
    const html = readFileSync(path, 'utf8');
    expect(html).toContain('lang="pt-BR"');
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toMatch(/<main>[\s\S]*<h2>/);
    expect(html).toMatch(/Versão.*2026-09-\d{2}\.v1/);
    expect(html).toContain('José Bonifácio de Aguiar Santos Júnior');
    expect(html).toContain('mailto:junior-aguiar@hotmail.com.br');
    expect(html).not.toMatch(placeholders);
    expect(html).not.toMatch(/\b(?:TODO|TBD)\b/);
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      if (href.startsWith('/legal/')) expect(existsSync(resolve(root, href.slice(1))), href).toBe(true);
      else expect(href === '/' || href.startsWith('mailto:') || href.startsWith('https://'), href).toBe(true);
    }
  });

  it('explica cobrança sem resultado e preserva direitos do consumidor', () => {
    const path = resolve(root, 'legal/termos-de-uso.html');
    expect(existsSync(path)).toBe(true);
    const html = readFileSync(path, 'utf8');
    expect(html).toContain('R$ 0,20');
    expect(html).toMatch(/sem resultados/i);
    expect(html).toMatch(/arrependimento/i);
    expect(html).toMatch(/sete dias/i);
    expect(html).toContain('/legal/privacidade.html');
  });

  it.each(['termos-de-uso', 'privacidade'])('%s identifica o endereço autorizado sem publicar CPF', (name) => {
    const html = readFileSync(resolve(root, 'legal', `${name}.html`), 'utf8');
    expect(html.replace(/\s+/g, ' ')).toContain('Avenida Jorge Montenegro Barros, nº 1200, Maceió/AL, CEP 57063-000');
    expect(html).not.toMatch(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\bCPF\b/);
  });

  it('informa categorias, fornecedores, direitos e retenção na privacidade', () => {
    const path = resolve(root, 'legal/privacidade.html');
    expect(existsSync(path)).toBe(true);
    const html = readFileSync(path, 'utf8');
    for (const value of ['Supabase', 'Google Cloud', 'Mercado Pago', 'STJ', '35 dias', 'statusToken']) {
      expect(html).toContain(value);
    }
    expect(html).toMatch(/transferências internacionais/i);
    expect(html).toMatch(/quinze dias/i);
    expect(html).toContain('/legal/termos-de-uso.html');
  });
});
