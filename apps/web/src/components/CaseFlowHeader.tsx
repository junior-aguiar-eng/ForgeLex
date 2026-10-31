export function CaseFlowHeader({
  activeStep,
  pendingCount = 0,
  onStepChange,
}: {
  matterId: string;
  activeStep: 'DOCUMENTS' | 'REVIEW' | 'TEXT';
  pendingCount?: number;
  onStepChange: (step: 'DOCUMENTS' | 'REVIEW' | 'TEXT') => void;
}) {
  return (
    <nav aria-label="Etapas do caso" className="flex flex-wrap gap-2 rounded-xl bg-stone-50 p-2">
      {(
        [
          ['DOCUMENTS', 'Documentos e análise'],
          ['REVIEW', `Conferência${pendingCount ? ` · ${pendingCount} pendentes` : ''}`],
          ['TEXT', 'Texto e conclusão'],
        ] as const
      ).map(([step, label]) => (
        <button
          key={step}
          type="button"
          aria-current={activeStep === step ? 'step' : undefined}
          className={activeStep === step ? 'btn-secondary bg-white' : 'btn-quiet'}
          onClick={() => onStepChange(step)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
