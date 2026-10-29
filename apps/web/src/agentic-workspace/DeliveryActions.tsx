import { editorLink, type ActionId, type Delivery, type Execution } from './execution-model';
import { CASE_WORKSPACE_ENABLED } from '../config/site-capabilities';
export function DeliveryActions({
  run,
  delivery,
  onFollowUp,
  onEditor,
  allowFollowUp = true,
}: {
  run: Execution;
  delivery: Delivery;
  onFollowUp: (action?: ActionId) => void;
  onEditor: (url: string) => void;
  allowFollowUp?: boolean;
}) {
  const link = CASE_WORKSPACE_ENABLED ? editorLink(run, delivery) : null;
  return (
    <div className="space-y-3">
      {link && (
        <a
          href={link}
          className="btn-primary inline-flex min-h-11 items-center"
          onClick={(e) => {
            if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
              e.preventDefault();
              onEditor(link);
            }
          }}
        >
          Editar minuta
        </a>
      )}
      {!link && allowFollowUp && (
        <button className="btn-primary min-h-11" onClick={() => onFollowUp()}>
          Continuar com este contexto
        </button>
      )}
      {allowFollowUp && (
        <details>
          <summary className="min-h-11 cursor-pointer">Mais opções</summary>
          <div className="flex flex-col items-start gap-2">
            {delivery.delivery.action !== 'research_question' && (
              <button className="min-h-11 underline" onClick={() => onFollowUp('research_question')}>
                Pesquisar fundamentos deste trabalho
              </button>
            )}
            {!delivery.delivery.document && (
              <button className="min-h-11 underline" onClick={() => onFollowUp('create_document')}>
                Criar peça a partir deste trabalho
              </button>
            )}
            {delivery.delivery.document && (
              <button className="min-h-11 underline" onClick={() => onFollowUp('review_text')}>
                Revisar este texto
              </button>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
