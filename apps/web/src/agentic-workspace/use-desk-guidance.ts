import { useEffect, useRef, useState } from 'react';
import { ApiRequestError } from '../api-client';
import type { WorkspaceClient } from './client';
import type { Answer } from './execution-model';
import type { GuidanceStart, GuidanceState } from './guidance-model';

export interface DeskGuidanceRoute {
  id?: string;
  revision?: number;
  selectionKey: () => string;
  publish: (state?: GuidanceState) => void;
}

export function useDeskGuidance(
  client: WorkspaceClient,
  route: DeskGuidanceRoute | undefined,
  enabled: boolean,
  active: boolean,
) {
  const id = enabled ? route?.id : undefined;
  const revision = route?.revision;
  const selectionKey = route?.selectionKey;
  const publish = route?.publish;
  const [state, setState] = useState<GuidanceState>();
  const [feedback, setFeedback] = useState<{ key: string; text: string }>();
  const [busyKey, setBusyKey] = useState<string>();
  const [reload, setReload] = useState(0);
  const [focus, setFocus] = useState(0);
  const pending = useRef<{ key: string; signature: string; scope: string; busy: boolean }>();
  const loaded = state?.conversationId === id && state?.contextRevision === revision;

  useEffect(() => {
    if (!active || !id || loaded || !selectionKey || !publish) return;
    const controller = new AbortController();
    const scope = selectionKey();
    const current = () => !controller.signal.aborted && scope === selectionKey();
    void client
      .guidance(id, controller.signal)
      .then((value) => {
        if (!current()) return;
        setState(value);
        publish(value);
      })
      .catch(() => {
        if (current()) setFeedback({ key: scope, text: 'Não foi possível recuperar seu pedido. Tente novamente.' });
      });
    return () => controller.abort();
  }, [active, client, id, loaded, publish, reload, selectionKey]);

  const change = async (signature: string, send: (key: string) => Promise<GuidanceState>) => {
    if (!active || !enabled || !selectionKey || !publish) return;
    const scope = selectionKey();
    if (pending.current?.busy && pending.current.scope === scope) return;
    const saved = pending.current;
    const key = saved?.scope === scope && saved.signature === signature ? saved.key : crypto.randomUUID();
    const command = { scope, signature, key, busy: true };
    pending.current = command;
    const origin = document.activeElement;
    const current = () => pending.current === command && scope === selectionKey();
    const accept = (value: GuidanceState, message?: string) => {
      if (!current()) return;
      setState(value);
      publish(value);
      if (message) setFeedback({ key: selectionKey(), text: message });
      if (document.activeElement === origin || document.activeElement === document.body) setFocus((value) => value + 1);
    };
    setFeedback(undefined);
    setBusyKey(scope);
    try {
      accept(await send(key));
      if (pending.current === command) pending.current = undefined;
    } catch (error) {
      if (
        current() &&
        id &&
        error instanceof ApiRequestError &&
        ['CONTEXT_CONFLICT', 'QUESTION_EXPIRED'].includes(error.code)
      ) {
        try {
          accept(
            await client.guidance(id),
            'O pedido foi atualizado em outra aba. Confira as respostas para continuar.',
          );
          return;
        } catch {
          // Keep the current answer available for retry.
        }
      }
      if (current()) setFeedback({ key: scope, text: 'Não foi possível registrar a resposta. Tente novamente.' });
    } finally {
      command.busy = false;
      setBusyKey((currentKey) => (currentKey === scope ? undefined : currentKey));
    }
  };

  const key = selectionKey?.();
  return {
    id,
    state: loaded ? state : undefined,
    busy: Boolean(busyKey && busyKey === key),
    feedback: feedback?.key === key ? feedback?.text : undefined,
    focus,
    retry: () => {
      setFeedback(undefined);
      setReload((value) => value + 1);
    },
    leave: () => {
      pending.current = undefined;
      setFeedback(undefined);
      publish?.();
    },
    start: (input: GuidanceStart) => change(JSON.stringify(input), (key) => client.startGuidance(input, key)),
    answer: (answer: Answer, correcting: boolean) =>
      id
        ? change(JSON.stringify({ answer, correcting }), (key) => client.answerGuidance(id, answer, key, correcting))
        : undefined,
  };
}
