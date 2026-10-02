import { Code2 } from 'lucide-react';
import { resolveApiOrigin } from '../../api-client';
import { PageIntro } from './PublicSections';

export function ApiDocsPage() {
  const apiUrl = resolveApiOrigin();
  const curl = `curl -G '${apiUrl}/api/v2/jurisprudencias' \\\n  --data-urlencode 'q=<CONSULTA>' --data-urlencode 'court=STJ' \\\n  -H 'Authorization: Bearer <SUA_CHAVE>' \\\n  -H 'Idempotency-Key: <CHAVE_UNICA>'`;
  const node = `const url = new URL('${apiUrl}/api/v2/jurisprudencias');
url.search = new URLSearchParams({ q: '<CONSULTA>', court: 'STJ' }).toString();
const response = await fetch(url, { headers: {
  Authorization: 'Bearer <SUA_CHAVE>',
  'Idempotency-Key': '<CHAVE_UNICA>'
}});`;
  const python = `import httpx
response = httpx.get('${apiUrl}/api/v2/jurisprudencias',
    params={'q': '<CONSULTA>', 'court': 'STJ'},
    headers={'Authorization': 'Bearer <SUA_CHAVE>',
             'Idempotency-Key': '<CHAVE_UNICA>'})`;
  return (
    <>
      <PageIntro
        eyebrow="Desenvolvedores"
        title="Integre as operações jurídicas do ForgeLex."
        text="A API REST e o MCP expõem a mesma infraestrutura jurídica. A autenticação, os escopos, os erros e a cobrança pertencem a cada operação; o ForgeLex não fornece modelo de IA."
      />
      <section className="page-container space-y-8 pb-16">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            [
              'Autenticação',
              'Crie uma API key no app autenticado. O segredo é exibido uma vez e deve ser enviado como Bearer token.',
            ],
            [
              'Fluxo jurídico',
              'Liste tribunais, pesquise no STJ, abra a autoridade e verifique os dados de origem antes de utilizar o resultado.',
            ],
            [
              'Custos e erros',
              'A busca jurisprudencial válida é faturável. Trate explicitamente 401, 402, 403, 409, 422, 429 e 503 e use Idempotency-Key nas operações que a exigem.',
            ],
          ].map(([title, body]) => (
            <article key={title} className="surface p-6">
              <h2 className="font-editorial text-xl font-bold">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-stone-600">{body}</p>
            </article>
          ))}
        </div>
        <div className="surface p-6">
          <div className="flex items-center gap-2">
            <Code2 className="h-5 w-5 text-cognac-700" aria-hidden="true" />
            <h2 className="font-editorial text-xl font-bold">Exemplo de pesquisa</h2>
          </div>
          <p className="mt-3 text-sm text-stone-600">
            Substitua os valores entre sinais de menor e maior. Os trechos mostram requisições, não resultados ao vivo.
          </p>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {[
              ['cURL', curl],
              ['Node.js', node],
              ['Python', python],
            ].map(([label, code]) => (
              <div key={label} className="min-w-0">
                <h3 className="text-sm font-semibold text-stone-800">{label}</h3>
                <pre tabIndex={0} role="region" aria-label={`Exemplo de pesquisa em ${label}`} className="mt-2 overflow-x-auto rounded-xl bg-stone-900 p-4 text-xs leading-5 text-stone-100">
                  <code>{code}</code>
                </pre>
              </div>
            ))}
          </div>
        </div>
        <div className="surface p-6">
          <h2 className="font-editorial text-xl font-bold">Contratos e referência</h2>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Consulte o documento OpenAPI para endpoints, parâmetros, respostas e escopos vigentes. A criação e revogação
            de chaves exigem conta autenticada.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a className="btn-primary" href={`${apiUrl}/openapi.json`}>
              Abrir OpenAPI
            </a>
            <a className="btn-secondary" href="/entrar?next=%2Fapp%2Fconta%2Fchaves">
              Gerenciar API keys
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
