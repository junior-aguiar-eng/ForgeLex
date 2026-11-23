import { describe, expect, it } from 'vitest';
import { buildAttachmentHeader } from '@forgelex/domain';
import { PASTED_ACCOUNT_MIN_CHARS, routeCaseInput, routePastedAccount } from './pasted-account.js';

const matterId = '11111111-1111-4111-8111-111111111111';
const account = 'Em março de 2021 o cliente assinou o contrato de locação. '.repeat(12);
const base = {
  objective: account,
  matterId,
  context: { text: account, origin: 'USER' as const, documents: [] },
};

describe('routePastedAccount', () => {
  it('relato colado em Automático, com caso, vira análise de fatos e provas', () => {
    expect(account.length).toBeGreaterThanOrEqual(PASTED_ACCOUNT_MIN_CHARS);
    expect(routePastedAccount(base)).toMatchObject({ actionId: 'analyze_evidence' });
  });

  it('não sobrescreve a ação escolhida pelo usuário', () => {
    expect(routePastedAccount({ ...base, actionId: 'research_question' }).actionId).toBe('research_question');
  });

  it('sem caso não dispara', () => {
    const { matterId: _omit, ...withoutMatter } = base;
    expect(routePastedAccount(withoutMatter).actionId).toBeUndefined();
  });

  it('continuação de conversa não dispara', () => {
    const next = { ...base, conversationId: '22222222-2222-4222-8222-222222222222' };
    expect(routePastedAccount(next).actionId).toBeUndefined();
  });

  it('texto curto não dispara', () => {
    const short = 'Cliente assinou contrato em 2021.';
    expect(routePastedAccount({ ...base, objective: short }).actionId).toBeUndefined();
  });

  it('texto que termina em pergunta não dispara', () => {
    expect(
      routePastedAccount({ ...base, objective: account.trim() + ' Isso gera dano moral?' }).actionId,
    ).toBeUndefined();
  });

  it('peça aberta não dispara', () => {
    const draft = { draftId: 'a', versionId: 'b' };
    expect(routePastedAccount({ ...base, context: { ...base.context, draft } }).actionId).toBeUndefined();
  });

  it('o limiar é exato: um caractere a menos não dispara', () => {
    const edge = 'a'.repeat(PASTED_ACCOUNT_MIN_CHARS);
    expect(routePastedAccount({ ...base, objective: edge }).actionId).toBe('analyze_evidence');
    expect(routePastedAccount({ ...base, objective: edge.slice(1) }).actionId).toBeUndefined();
  });
  it('pedido longo de correção da estrutura mantém adjust_structure', () => {
    const correction = 'Corrija a estrutura: o fato F1 foi em 2021, não em 2020. '.repeat(13).slice(0, 700);
    expect(correction.length).toBe(700);
    const routed = routePastedAccount({ ...base, objective: correction, actionId: 'adjust_structure' });
    expect(routed.actionId).toBe('adjust_structure');
  });

  describe('anexo com texto (E4)', () => {
    const withAttachment = (body: string, extra: Record<string, unknown> = {}) => ({
      objective: 'Analise este documento.',
      matterId,
      context: {
        text: `${buildAttachmentHeader({ name: 'a.pdf', ocr: false })}\n${body}`,
        origin: 'USER' as const,
        documents: [],
      },
      ...extra,
    });
    it('objetivo curto com anexo com texto vai para a análise', () => {
      expect(routeCaseInput(withAttachment('Cláusula primeira.')).actionId).toBe('analyze_evidence');
    });
    it('anexo vazio não dispara', () => {
      expect(routeCaseInput(withAttachment('  ')).actionId).toBeUndefined();
    });
    it('ação escolhida, conversa anterior, peça aberta e pergunta no fim não disparam', () => {
      expect(routeCaseInput(withAttachment('Texto.', { actionId: 'review_text' })).actionId).toBe('review_text');
      expect(
        routeCaseInput(withAttachment('Texto.', { conversationId: '22222222-2222-4222-8222-222222222222' })).actionId,
      ).toBeUndefined();
      expect(
        routeCaseInput(withAttachment('Texto.', { objective: 'O que diz o documento?' })).actionId,
      ).toBeUndefined();
      const draft = withAttachment('Texto.');
      expect(
        routeCaseInput({ ...draft, context: { ...draft.context, draft: { draftId: 'a', versionId: 'b' } } }).actionId,
      ).toBeUndefined();
    });
    it('sem caso não dispara', () => {
      const { matterId: _omit, ...noMatter } = withAttachment('Texto.');
      expect(routeCaseInput(noMatter).actionId).toBeUndefined();
    });
  });
});
