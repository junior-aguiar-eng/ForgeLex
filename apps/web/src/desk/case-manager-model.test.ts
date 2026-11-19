import { describe, expect, it } from 'vitest';
import {
  activeCaseOptions,
  caseTitleProblem,
  deskLifecycleActions,
  documentLifecycleNotice,
  documentStateLabel,
  lifecycleNotice,
  type ManagedCase,
} from './case-manager-model';

describe('caseTitleProblem', () => {
  it('aceita de 3 a 200 letras depois de aparar, como a API', () => {
    expect(caseTitleProblem('Caso')).toBeUndefined();
    expect(caseTitleProblem('  abc  ')).toBeUndefined();
    expect(caseTitleProblem('x'.repeat(200))).toBeUndefined();
  });

  it('explica cada recusa em texto', () => {
    expect(caseTitleProblem('')).toBe('Escreva o nome do caso.');
    expect(caseTitleProblem('    ')).toBe('Escreva o nome do caso.');
    expect(caseTitleProblem('ab')).toBe('O nome precisa ter pelo menos 3 letras.');
    expect(caseTitleProblem('x'.repeat(201))).toBe('O nome pode ter no máximo 200 letras.');
  });
});

describe('deskLifecycleActions', () => {
  it('oferece arquivar e lixeira ao caso ativo, restaurar e lixeira ao arquivado, e só restaurar ao da lixeira', () => {
    expect(deskLifecycleActions({ lifecycleState: 'ACTIVE' })).toEqual(['archive', 'trash']);
    expect(deskLifecycleActions({})).toEqual(['archive', 'trash']);
    expect(deskLifecycleActions({ lifecycleState: 'ARCHIVED' })).toEqual(['restore', 'trash']);
    expect(deskLifecycleActions({ lifecycleState: 'TRASHED' })).toEqual(['restore']);
  });

  it('nunca oferece a exclusão definitiva: ela fica na tela do caso', () => {
    for (const state of ['ACTIVE', 'ARCHIVED', 'TRASHED', 'PURGED'] as const)
      expect(deskLifecycleActions({ lifecycleState: state })).not.toContain('purge');
    expect(deskLifecycleActions({ lifecycleState: 'PURGED' })).toEqual([]);
  });
});

describe('activeCaseOptions', () => {
  it('mantém só os casos ativos e só o que o seletor usa', () => {
    const items: ManagedCase[] = [
      { id: 'a', title: 'Ativo', lifecycleState: 'ACTIVE', createdBy: 'u' },
      { id: 'b', title: 'Sem estado' },
      { id: 'c', title: 'Arquivado', lifecycleState: 'ARCHIVED' },
      { id: 'd', title: 'Lixeira', lifecycleState: 'TRASHED' },
    ];
    expect(activeCaseOptions(items)).toEqual([
      { id: 'a', title: 'Ativo' },
      { id: 'b', title: 'Sem estado' },
    ]);
  });
});

describe('lifecycleNotice', () => {
  it('diz o efeito sobre o acesso da IA', () => {
    expect(lifecycleNotice('archive')).toContain('acesso pela IA foi encerrado');
    expect(lifecycleNotice('trash')).toContain('acesso pela IA foi encerrado');
    expect(lifecycleNotice('restore')).toContain('autorize o acesso novamente');
  });
});

describe('documentLifecycleNotice', () => {
  it('fala de documento, e só a restauração avisa que a IA precisa de nova autorização', () => {
    expect(documentLifecycleNotice('archive')).toBe('Documento arquivado para consulta.');
    expect(documentLifecycleNotice('trash')).toBe('Documento movido para a lixeira.');
    expect(documentLifecycleNotice('restore')).toContain('precisa de nova autorização');
    expect(documentLifecycleNotice('archive')).not.toContain('Caso');
  });
});

describe('documentStateLabel', () => {
  it('mostra arquivado e lixeira antes da situação da indexação', () => {
    expect(documentStateLabel({ lifecycleState: 'ARCHIVED', status: 'FAILED' })).toBe('Arquivado');
    expect(documentStateLabel({ lifecycleState: 'TRASHED', status: 'INDEXED' })).toBe('Na lixeira');
  });

  it('em uso, diz se o documento está disponível ou falhou; sem estado conta como em uso', () => {
    expect(documentStateLabel({ lifecycleState: 'ACTIVE', status: 'INDEXED' })).toBe('Disponível');
    expect(documentStateLabel({ status: 'INDEXED' })).toBe('Disponível');
    expect(documentStateLabel({ lifecycleState: 'ACTIVE', status: 'FAILED' })).toBe('Falhou');
  });
});
