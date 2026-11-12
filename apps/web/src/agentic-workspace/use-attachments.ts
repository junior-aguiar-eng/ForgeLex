import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ATTACHMENT_MAX_FILES,
  fitAttachment,
  readAttachment,
  type Attachment,
  type AttachmentResult,
} from './attachments';

/** Anexos do pedido em edição: lê cada arquivo no navegador, troca e remove, e cancela leituras ao sair. */
export function useAttachments(reader: typeof readAttachment = readAttachment) {
  const [items, setItems] = useState<Attachment[]>([]);
  const current = useRef<Attachment[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const [notice, setNotice] = useState('');

  const commit = useCallback((next: Attachment[]) => {
    current.current = next;
    setItems(next);
  }, []);

  useEffect(() => {
    const active = controllers.current;
    return () => {
      for (const controller of active.values()) controller.abort();
      active.clear();
    };
  }, []);

  const read = useCallback(
    async (id: string, file: File) => {
      controllers.current.get(id)?.abort();
      const controller = new AbortController();
      controllers.current.set(id, controller);
      let result: AttachmentResult;
      try {
        result = await reader(file, controller.signal);
      } catch {
        return; // leitura cancelada: o chip já foi removido ou trocado
      }
      if (controller.signal.aborted || controllers.current.get(id) !== controller) return;
      controllers.current.delete(id);
      // O teto vale para o conjunto: confere contra os outros anexos já lidos, no momento em que este termina.
      const others = current.current.filter((item) => item.id !== id);
      const fitted = fitAttachment(result, others);
      commit(current.current.map((item) => (item.id === id ? { ...item, ...fitted } : item)));
      setNotice(
        fitted.status === 'done'
          ? `${file.name}: texto extraído.`
          : `${file.name}: ${fitted.message ?? 'não foi possível ler.'}`,
      );
    },
    [commit, reader],
  );

  const add = useCallback(
    (files: readonly File[]) => {
      const room = ATTACHMENT_MAX_FILES - current.current.length;
      const accepted = files.slice(0, Math.max(0, room));
      if (files.length > accepted.length) {
        setNotice(`Cada pedido aceita até ${ATTACHMENT_MAX_FILES} anexos.`);
      }
      if (!accepted.length) return;
      const created = accepted.map((file) => ({
        file,
        item: { id: crypto.randomUUID(), name: file.name, status: 'reading', text: '' } satisfies Attachment,
      }));
      commit([...current.current, ...created.map(({ item }) => item)]);
      for (const { file, item } of created) void read(item.id, file);
    },
    [commit, read],
  );

  const replace = useCallback(
    (id: string, file: File) => {
      if (!current.current.some((item) => item.id === id)) return;
      commit(
        current.current.map((item) => (item.id === id ? { id, name: file.name, status: 'reading', text: '' } : item)),
      );
      void read(id, file);
    },
    [commit, read],
  );

  const remove = useCallback(
    (id: string) => {
      controllers.current.get(id)?.abort();
      controllers.current.delete(id);
      const removed = current.current.find((item) => item.id === id);
      commit(current.current.filter((item) => item.id !== id));
      if (removed) setNotice(`Anexo removido: ${removed.name}.`);
    },
    [commit],
  );

  const clear = useCallback(() => {
    for (const controller of controllers.current.values()) controller.abort();
    controllers.current.clear();
    commit([]);
    setNotice('');
  }, [commit]);

  return { items, notice, add, replace, remove, clear };
}
