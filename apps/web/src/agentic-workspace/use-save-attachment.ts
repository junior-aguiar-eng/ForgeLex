import { useMemo, useState } from 'react';
import { requestApi } from '../api-client';
import { createSaveController, type SaveState, type Saver } from './save-controller';

export type { SaveState } from './save-controller';

/** Grava o texto do anexo como documento do caso: um POST na rota de ingestão, só por sessão. */
export const saveToCase: Saver = async (matterId, input) => {
  const response = await requestApi<{ document: { title: string }; anchors: unknown[] }>(
    `/api/v2/matters/${encodeURIComponent(matterId)}/documents`,
    { method: 'POST', body: JSON.stringify(input) },
    { sessionOnly: true },
  );
  return { title: response.document.title, paragraphs: response.anchors.length };
};

/** Salvar o anexo no caso (U7): a regra está em `createSaveController`; aqui só o estado de tela. */
export function useSaveAttachment(saver: Saver = saveToCase) {
  const [states, setStates] = useState<Record<string, SaveState>>({});
  const controller = useMemo(
    () =>
      createSaveController(saver, (key, state) =>
        setStates((current) => {
          if (state) return { ...current, [key]: state };
          const { [key]: _removed, ...rest } = current;
          return rest;
        }),
      ),
    [saver],
  );
  return {
    save: controller.save,
    forget: controller.forget,
    stateOf: (attachmentId: string, matterId: string): SaveState | undefined =>
      states[controller.keyOf(attachmentId, matterId)],
  };
}
