import { useApp } from '../context/AppContext';
import type { SearchExecution } from '../operations/contracts';

export function JudgmentYearSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const currentYear = new Date().getUTCFullYear();
  return <select aria-label="Ano do julgamento" value={value} onChange={(event) => onChange(event.target.value)} className="input-control w-full md:w-44 shrink-0">
    <option value="">Todos os anos</option>
    {Array.from({ length: currentYear - 1988 }, (_, index) => currentYear - index).map((year) => <option key={year} value={year}>{year}</option>)}
  </select>;
}

export function SearchChargeNotice() {
  const { searchCostCents } = useApp();
  return <div className="surface-subtle p-3 text-xs leading-relaxed text-stone-600">
    <p>Cada nova pesquisa desconta saldo, mesmo quando repete uma consulta anterior. Selecionar um item do histórico apenas preenche os filtros.</p>
    {searchCostCents !== null && <p className="mt-1 font-semibold">Tarifa por nova pesquisa: {(searchCostCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.</p>}
  </div>;
}

export function ResearchRetentionNotice() {
  return <p className="text-xs leading-relaxed text-stone-600">Copie a referência e a ementa para conservar o resultado. O histórico guarda os termos e filtros da consulta, não uma cópia dos resultados. Consultar novamente gera uma nova cobrança.</p>;
}

export function ExecutedSearchLabel({ execution }: { execution: SearchExecution | null }) {
  if (!execution) return null;
  return <p className="text-xs text-stone-600">Consulta exibida: {execution.intent.query} · {execution.intent.court} · {execution.intent.judgmentYear ?? 'Todos os anos'}</p>;
}
