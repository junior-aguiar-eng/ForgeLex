import { attachmentDocumentInput, saveFailureMessage, type Attachment, type CaseDocumentInput } from './attachments';
import { createSingleFlight } from './single-flight';

export type SaveState =
  { status: 'saving' } | { status: 'saved'; title: string; paragraphs: number } | { status: 'error'; message: string };

export type Saver = (matterId: string, input: CaseDocumentInput) => Promise<{ title: string; paragraphs: number }>;

/**
 * Regra de "salvar o anexo no caso" (U7), sem React para poder ser testada. A rota de ingestão não tem chave de
 * idempotência e cada chamada cria um documento, então duas travas: uma chamada em andamento barra outra igual (o estado
 * do React só muda no ciclo seguinte, e dois cliques rápidos passariam os dois) e um anexo já salvo não é salvo de novo.
 * O estado é por anexo e caso; trocar ou remover o anexo apaga o estado dele.
 */
export function createSaveController(saver: Saver, onState: (key: string, state: SaveState | undefined) => void) {
  const flight = createSingleFlight();
  const saved = new Set<string>();
  const known = new Set<string>();
  const keyOf = (attachmentId: string, matterId: string) => `${matterId}:${attachmentId}`;
  const emit = (key: string, state: SaveState | undefined) => {
    known.add(key);
    onState(key, state);
  };

  return {
    keyOf,
    async save(attachment: Attachment, matterId: string): Promise<void> {
      const key = keyOf(attachment.id, matterId);
      const input = attachmentDocumentInput(attachment);
      if (!input || saved.has(key)) return;
      await flight.run(key, async () => {
        emit(key, { status: 'saving' });
        try {
          const result = await saver(matterId, input);
          saved.add(key);
          emit(key, { status: 'saved', ...result });
        } catch (failure) {
          const code = (failure as { code?: unknown } | null)?.code;
          emit(key, {
            status: 'error',
            message: saveFailureMessage(
              typeof code === 'string' ? code : '',
              failure instanceof Error ? failure.message : '',
            ),
          });
        }
      });
    },
    /** Apaga o que se sabe do anexo (trocado ou removido), em todos os casos. */
    forget(attachmentId: string): void {
      for (const key of [...known]) {
        if (!key.endsWith(`:${attachmentId}`)) continue;
        saved.delete(key);
        known.delete(key);
        onState(key, undefined);
      }
    },
  };
}
