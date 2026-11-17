import { useCallback, useEffect, useRef, useState } from 'react';
import { OCR_ENABLED } from '../config/site-capabilities';
import {
  ATTACHMENT_MAX_FILES,
  attachmentRoom,
  fitAttachment,
  readAttachment,
  withOcrOffer,
  type Attachment,
  type AttachmentResult,
} from './attachments';

/** Anexos do pedido em edição: lê cada arquivo no navegador, troca e remove, e cancela leituras ao sair. */
export function useAttachments(reader: typeof readAttachment = readAttachment) {
  const [items, setItems] = useState<Attachment[]>([]);
  const current = useRef<Attachment[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  // Arquivos que ainda podem ser lidos por OCR (U6). Ficam só na memória da aba e saem ao remover, trocar ou enviar.
  const files = useRef(new Map<string, File>());
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
      const fitted = withOcrOffer(fitAttachment(result, others), file, OCR_ENABLED);
      if (fitted.canOcr) files.current.set(id, file);
      else files.current.delete(id);
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
      files.current.delete(id);
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
      files.current.delete(id);
      const removed = current.current.find((item) => item.id === id);
      commit(current.current.filter((item) => item.id !== id));
      if (removed) setNotice(`Anexo removido: ${removed.name}.`);
    },
    [commit],
  );

  const clear = useCallback(() => {
    for (const controller of controllers.current.values()) controller.abort();
    controllers.current.clear();
    files.current.clear();
    commit([]);
    setNotice('');
  }, [commit]);

  /** Reconhece o texto de um PDF ou imagem sem texto, no navegador (U6). Cancelável; nada sai da máquina do cliente. */
  const recognize = useCallback(
    async (id: string) => {
      const file = files.current.get(id);
      const before = current.current.find((item) => item.id === id);
      if (!OCR_ENABLED || !file || !before?.canOcr) return;
      controllers.current.get(id)?.abort();
      const controller = new AbortController();
      controllers.current.set(id, controller);
      const update = (patch: Partial<Attachment>) =>
        commit(current.current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
      update({
        status: 'ocr',
        canOcr: false,
        message: undefined,
        ocrProgress: { page: 1, pages: 1, fraction: 0 },
      });
      let shown = '';
      try {
        const { recognizeFile } = await import('../ocr/ocr-document');
        const result = await recognizeFile(file, {
          signal: controller.signal,
          onProgress: ({ page, pages, fraction }) => {
            // Só redesenha quando a página ou a porcentagem inteira muda.
            const key = `${page}/${pages}/${Math.round(fraction * 100)}`;
            if (key === shown) return;
            shown = key;
            update({ ocrProgress: { page, pages, fraction } });
          },
        });
        if (controller.signal.aborted || controllers.current.get(id) !== controller) return;
        controllers.current.delete(id);
        files.current.delete(id);
        if (!result.text) {
          const message = 'O OCR não encontrou texto legível neste arquivo. Cole o texto no pedido.';
          update({ status: 'no-text', text: '', message, canOcr: false, ocrProgress: undefined });
          setNotice(`${file.name}: ${message}`);
          return;
        }
        const others = current.current.filter((item) => item.id !== id);
        const fitted = fitAttachment({ status: 'done', text: result.text, pages: result.pages }, others);
        update({
          ...fitted,
          canOcr: false,
          ocrProgress: undefined,
          ocr: fitted.status === 'done' ? { confidence: result.confidence, pages: result.pages } : undefined,
        });
        setNotice(
          fitted.status === 'done'
            ? `${file.name}: texto reconhecido por OCR. Confira antes de enviar.`
            : `${file.name}: ${fitted.message ?? 'não foi possível usar o texto.'}`,
        );
      } catch (error) {
        // Removido ou trocado durante o OCR: o chip já não é este.
        if (controllers.current.get(id) !== controller) return;
        controllers.current.delete(id);
        if (controller.signal.aborted) {
          commit(current.current.map((item) => (item.id === id ? { ...before } : item)));
          setNotice(`Reconhecimento cancelado: ${file.name}.`);
          return;
        }
        const known = error instanceof Error && error.name === 'OcrError';
        const message = known
          ? (error as Error).message
          : 'O reconhecimento por OCR falhou. Tente de novo ou cole o texto no pedido.';
        // Falha do motor ou dos arquivos de OCR pode passar: mantém o arquivo e o botão para tentar de novo.
        const code = (error as { code?: string }).code;
        const retry = !known || code === 'ENGINE_UNAVAILABLE' || code === 'ENGINE_FAILED';
        update({ status: 'error', text: '', message, canOcr: retry, ocrProgress: undefined });
        setNotice(`${file.name}: ${message}`);
      }
    },
    [commit],
  );

  const cancelRecognize = useCallback((id: string) => controllers.current.get(id)?.abort(), []);

  /** O cliente corrige o texto reconhecido por OCR antes de enviar; respeita o teto do conjunto de anexos. */
  const edit = useCallback(
    (id: string, text: string) => {
      commit(
        current.current.map((item) =>
          item.id === id && item.ocr ? { ...item, text: text.slice(0, attachmentRoom(current.current, id)) } : item,
        ),
      );
    },
    [commit],
  );

  return { items, notice, add, replace, remove, clear, recognize, cancelRecognize, edit };
}
