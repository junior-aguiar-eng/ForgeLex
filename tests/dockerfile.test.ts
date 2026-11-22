import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

describe('imagem de produção', () => {
  it('injeta a configuração pública do Supabase antes de compilar o frontend', async () => {
    const dockerfile = await readFile(fileURLToPath(new URL('../Dockerfile', import.meta.url)), 'utf8');
    const cloudBuild = await readFile(fileURLToPath(new URL('../ops/gcp/phase8/cloudbuild-auth.yaml', import.meta.url)), 'utf8');

    expect(dockerfile).toMatch(/ARG VITE_SUPABASE_URL\s+ARG VITE_SUPABASE_PUBLISHABLE_KEY/);
    expect(dockerfile).toMatch(/ENV VITE_SUPABASE_URL=\$\{VITE_SUPABASE_URL\}\s+\\?\s+VITE_SUPABASE_PUBLISHABLE_KEY=\$\{VITE_SUPABASE_PUBLISHABLE_KEY\}/);
    expect(dockerfile.indexOf('ENV VITE_SUPABASE_URL')).toBeLessThan(dockerfile.indexOf('RUN pnpm build'));
    expect(dockerfile).toContain('ARG VITE_FORGELEX_CASE_WORKSPACE_ENABLED=false');
    expect(dockerfile.indexOf('VITE_FORGELEX_CASE_WORKSPACE_ENABLED=${VITE_FORGELEX_CASE_WORKSPACE_ENABLED}')).toBeLessThan(dockerfile.indexOf('RUN pnpm build'));
    expect(dockerfile).toContain('ARG VITE_FORGELEX_DESK_SHELL=false');
    expect(dockerfile.indexOf('VITE_FORGELEX_DESK_SHELL=${VITE_FORGELEX_DESK_SHELL}')).toBeLessThan(dockerfile.indexOf('RUN pnpm build'));
    // OCR (U6): desligada por padrão, e a flag chega ao build tanto pelo Dockerfile quanto pelo Cloud Build.
    expect(dockerfile).toContain('ARG VITE_FORGELEX_OCR_ENABLED=false');
    expect(dockerfile.indexOf('VITE_FORGELEX_OCR_ENABLED=${VITE_FORGELEX_OCR_ENABLED}')).toBeLessThan(dockerfile.indexOf('RUN pnpm build'));
    // Tema (V1): o build padrão é o clássico; `previa` e `gelo` entram só quando alguém passar o argumento.
    expect(dockerfile).toContain('ARG VITE_FORGELEX_THEME=classico');
    expect(dockerfile.indexOf('VITE_FORGELEX_THEME=${VITE_FORGELEX_THEME}')).toBeLessThan(dockerfile.indexOf('RUN pnpm build'));
    const productionBuild = await readFile(
      fileURLToPath(new URL('../ops/gcp/production/cloudbuild.yaml', import.meta.url)),
      'utf8',
    );
    expect(productionBuild).toContain('VITE_FORGELEX_OCR_ENABLED=${_VITE_FORGELEX_OCR_ENABLED}');
    expect(productionBuild).toContain("_VITE_FORGELEX_OCR_ENABLED: 'false'");
    // V6 e V5A: tema e texto público do modelo novo chegam ao build de produção, desligados por padrão.
    expect(dockerfile).toContain('ARG VITE_FORGELEX_PUBLIC_MODEL=false');
    expect(dockerfile.indexOf('VITE_FORGELEX_PUBLIC_MODEL=${VITE_FORGELEX_PUBLIC_MODEL}')).toBeLessThan(dockerfile.indexOf('RUN pnpm build'));
    expect(productionBuild).toContain('VITE_FORGELEX_THEME=${_VITE_FORGELEX_THEME}');
    expect(productionBuild).toContain("_VITE_FORGELEX_THEME: 'classico'");
    expect(productionBuild).toContain('VITE_FORGELEX_PUBLIC_MODEL=${_VITE_FORGELEX_PUBLIC_MODEL}');
    expect(productionBuild).toContain("_VITE_FORGELEX_PUBLIC_MODEL: 'false'");
    expect(cloudBuild).toContain('VITE_SUPABASE_URL=${_VITE_SUPABASE_URL}');
    expect(cloudBuild).toContain('VITE_SUPABASE_PUBLISHABLE_KEY=${_VITE_SUPABASE_PUBLISHABLE_KEY}');
  });
});
