import React from 'react';
import { CircleDollarSign, ShieldCheck } from 'lucide-react';

const examples = [
  { title: 'Pesquisar jurisprudência do STJ', prompt: 'Pesquise jurisprudência do STJ sobre [tema ou tese].', billing: 'Operação faturável: o custo é exibido pela conta antes da execução.', icon: CircleDollarSign },
  { title: 'Abrir uma autoridade', prompt: 'Abra a autoridade [identificador] e mostre a proveniência disponível.', billing: 'Comando gratuito.', icon: ShieldCheck },
  { title: 'Verificar proveniência', prompt: 'Verifique a proveniência da autoridade [identificador].', billing: 'Comando gratuito.', icon: ShieldCheck },
];

export const FirstUseExamples: React.FC = () => <section className="surface-subtle space-y-5 p-6 sm:p-8" aria-labelledby="primeiro-uso-title"><div><p className="eyebrow">Primeiro uso</p><h2 id="primeiro-uso-title" className="mt-1 font-editorial text-2xl font-bold text-stone-900">Perguntas que o ForgeLex entende</h2></div><div className="grid gap-4 lg:grid-cols-3">{examples.map(({ title, prompt, billing, icon: Icon }) => <article key={title} className="rounded-xl border border-stone-200 bg-white p-4"><Icon className="h-5 w-5 text-cognac-700" aria-hidden="true" /><h3 className="mt-3 text-sm font-bold text-stone-900">{title}</h3><p className="mt-2 text-sm leading-relaxed text-stone-600">{prompt}</p><p className="mt-3 text-xs font-semibold text-stone-700">{billing}</p></article>)}</div></section>;
