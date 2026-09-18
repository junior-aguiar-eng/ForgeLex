import React from 'react';
import { CheckCircle2, Cpu, LockKeyhole, Server } from 'lucide-react';

const providers = [
  {
    name: 'Anthropic',
    description: 'Modelos Claude disponíveis no ambiente gerenciado do ForgeLex.',
    icon: Cpu,
  },
  {
    name: 'OpenAI',
    description: 'Modelos OpenAI disponíveis no ambiente gerenciado do ForgeLex.',
    icon: Server,
  },
];

export const ConnectionsScreen: React.FC = () => (
  <div className="py-8 md:py-12">
    <div className="page-container space-y-8">
      <div className="flex flex-col gap-4 border-b border-champagne-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Área técnica</p>
          <h1 className="font-editorial text-3xl font-bold text-stone-900 sm:text-4xl">Modelos e integrações</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-stone-500">
            Os modelos são operados pelo ForgeLex. Suas chaves secretas não são inseridas nem armazenadas neste navegador.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Ambiente protegido
        </span>
      </div>

      <section className="surface grid gap-5 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cognac-50 text-cognac-700">
              <LockKeyhole className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-editorial text-xl font-bold text-stone-900">Credenciais sob responsabilidade do ForgeLex</h2>
              <p className="mt-1 text-sm text-stone-500">A configuração dos providers acontece no servidor, fora da sessão do usuário.</p>
            </div>
          </div>
        </div>
        <span className="text-sm font-semibold text-stone-600">Nenhuma chave local configurada</span>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {providers.map(({ name, description, icon: Icon }) => (
          <section key={name} className="surface space-y-5 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cognac-50 text-cognac-700">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-editorial text-xl font-bold text-stone-900">{name}</h2>
                  <p className="text-xs text-stone-500">Provider gerenciado</p>
                </div>
              </div>
              <span className="rounded-full border border-stone-200 bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">Gerenciado</span>
            </div>
            <p className="text-sm leading-relaxed text-stone-600">{description}</p>
            <div className="flex items-center gap-2 border-t border-stone-100 pt-4 text-xs text-stone-500">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              O uso é contabilizado pelo modelo e pela tarifa vigente do ForgeLex.
            </div>
          </section>
        ))}
      </div>

      <section className="surface-subtle p-5 text-sm leading-relaxed text-stone-600">
        <strong className="text-stone-800">MCP e API:</strong> a documentação de integração, autenticação e limites permanece disponível na área de documentação. As ferramentas jurídicas continuam usando os contratos existentes.
      </section>
    </div>
  </div>
);
