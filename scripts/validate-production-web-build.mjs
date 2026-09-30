import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function validateBuildConfig(env) {
  let url;
  try {
    url = new URL(env.VITE_SUPABASE_URL?.trim() ?? '');
  } catch {
    throw new Error('VITE_SUPABASE_URL deve identificar um projeto Supabase HTTPS.');
  }
  const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname);
  if (url.protocol !== 'https:' || !match || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('VITE_SUPABASE_URL deve identificar um projeto Supabase HTTPS.');
  }

  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
  if (!/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(key)) {
    throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY deve ser uma chave publishable.');
  }
  const projectRef = match[1];
  if (env.EXPECTED_SUPABASE_PROJECT_REF && env.EXPECTED_SUPABASE_PROJECT_REF !== projectRef) {
    throw new Error('Supabase project ref não corresponde ao esperado para este build.');
  }
  return { url: env.VITE_SUPABASE_URL.trim(), key, projectRef };
}

export function validateBundleContent(content, config) {
  if (!content.includes(config.url) || !content.includes(config.key)) {
    throw new Error('O bundle não contém a URL e a chave publishable esperadas.');
  }
  if (/sb_secret_[A-Za-z0-9_-]+/.test(content)) {
    throw new Error('O bundle contém uma secret key Supabase.');
  }
  for (const token of content.matchAll(/\b[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+\b/g)) {
    try {
      const payload = JSON.parse(Buffer.from(token[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role') throw new Error('O bundle contém um JWT service_role.');
    } catch (error) {
      if (error instanceof Error && error.message.includes('service_role')) throw error;
    }
  }
}

async function collectBundleText(directory) {
  const files = await readdir(directory, { withFileTypes: true });
  const contents = [];
  for (const file of files) {
    const path = resolve(directory, file.name);
    if (file.isDirectory()) contents.push(await collectBundleText(path));
    else if (/\.(?:js|html|css)$/.test(file.name)) contents.push(await readFile(path, 'utf8'));
  }
  return contents.join('\n');
}

async function main(argv, env) {
  const config = validateBuildConfig(env);
  if (argv.length === 1 && argv[0] === '--config') return;
  if (argv.length === 2 && argv[0] === '--dist') {
    validateBundleContent(await collectBundleText(resolve(argv[1])), config);
    return;
  }
  throw new Error('Use --config ou --dist <diretório>.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), process.env).then(() => {
    console.log('Configuração pública Supabase validada.');
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : 'Falha na validação do build.');
    process.exitCode = 1;
  });
}
