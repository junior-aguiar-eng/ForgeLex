import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

describe('imagem de produção', () => {
  it('injeta a configuração pública do Supabase antes de compilar o frontend', async () => {
    const dockerfile = await readFile(fileURLToPath(new URL('../Dockerfile', import.meta.url)), 'utf8');
    const cloudBuild = await readFile(fileURLToPath(new URL('../ops/gcp/phase8/cloudbuild-auth.yaml', import.meta.url)), 'utf8');

    expect(dockerfile).toMatch(/ARG VITE_SUPABASE_URL\s+ARG VITE_SUPABASE_PUBLISHABLE_KEY/);
    expect(dockerfile).toMatch(/ENV VITE_SUPABASE_URL=\$\{VITE_SUPABASE_URL\}\s+\\?\s+VITE_SUPABASE_PUBLISHABLE_KEY=\$\{VITE_SUPABASE_PUBLISHABLE_KEY\}/);
    expect(dockerfile.indexOf('ENV VITE_SUPABASE_URL')).toBeLessThan(dockerfile.indexOf('RUN pnpm build'));
    expect(cloudBuild).toContain('VITE_SUPABASE_URL=${_VITE_SUPABASE_URL}');
    expect(cloudBuild).toContain('VITE_SUPABASE_PUBLISHABLE_KEY=${_VITE_SUPABASE_PUBLISHABLE_KEY}');
  });
});
