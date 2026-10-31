import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
export async function readMcpReaderHtml(webRoot?: string): Promise<string> {
  const [rawScript, style] = await Promise.all([
    readFile(
      webRoot
        ? join(webRoot, 'mcp-reader/reader.js')
        : new URL('../../../web/dist/mcp-reader/reader.js', import.meta.url),
      'utf8',
    ),
    readFile(
      webRoot
        ? join(webRoot, 'mcp-reader/reader.css')
        : new URL('../../../web/dist/mcp-reader/reader.css', import.meta.url),
      'utf8',
    ),
  ]);
  const script = rawScript.replace(/<\/script/gi, '<\\/script');
  const digest = (value: string) => createHash('sha256').update(value).digest('base64');
  const policy = `default-src 'none'; script-src 'sha256-${digest(script)}'; style-src 'sha256-${digest(style)}'; connect-src 'none'; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><title>Decisões · ForgeLex</title><style>${style}</style></head><body><div id="forgelex-reader"></div><script>${script}</script></body></html>`;
}
