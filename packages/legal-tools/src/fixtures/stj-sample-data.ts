import { CaseLaw } from '@forgelex/domain';

export const CANONICAL_CASE_LAW_FIXTURES: CaseLaw[] = [
  {
    id: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
    court: 'STJ',
    processNumber: 'REsp 1.823.450/SP',
    rapporteur: 'Min. Nancy Andrighi',
    judgmentDate: '2023-04-18',
    publicationDate: '2023-04-24',
    syllabus:
      'CIVIL E PROCESSUAL CIVIL. RECURSO ESPECIAL. AÇÃO DE INDENIZAÇÃO POR DANOS MATERIAIS E MORAIS. VAZAMENTO DE DADOS PESSOAIS. LGPD. DANO MORAL IN RE IPSA NÃO CONFIGURADO. NECESSIDADE DE DEMONSTRAÇÃO DE PREJUÍZO EFETIVO. A violação a dados pessoais comuns desacompanhada de comprovação de dano concreto ou risco iminente não autoriza a presunção de dano moral reflexo.',
    dedupeKey: 'stj_resp_1823450_20230418',
    fullTextUrl: 'https://processo.stj.jus.br/processo/julgamento/eletronico/documento/?documento_tipo=inteiro_teor&num_registro=201901869820',
    provenance: {
      id: 'e2b3c4d5-6a7b-8c9d-0e1f-2a3b4c5d6e7f',
      source: {
        provider: 'STJ_OFICIAL',
        court: 'STJ',
        documentId: 'RESP_1823450',
        contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        dedupeKey: 'stj_resp_1823450_20230418',
        sourceUrl: 'https://scon.stj.jus.br/SCON/pesquisar.jsp',
      },
      verified: true,
      verificationMethod: 'OFFICIAL_SOURCE_HASH',
      verifiedAt: '2026-09-16T00:00:00.000Z',
      snippet: 'A violação a dados pessoais comuns desacompanhada de comprovação de dano concreto não gera dano moral in re ipsa.',
      confidence: 1.0,
    },
  },
  {
    id: 'c9a2d3b4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
    court: 'STF',
    processNumber: 'ADI 6.387/DF',
    rapporteur: 'Min. Rosa Weber',
    judgmentDate: '2020-05-07',
    publicationDate: '2020-11-12',
    syllabus:
      'CONSTITUCIONAL. DIREITO FUNDAMENTAL À PROTEÇÃO DE DADOS PESSOAIS. AUTONOMIA INFORMATIVA. MEDIDA PROVISÓRIA 954/2020. COMPARTILHAMENTO DE DADOS ENTRE EMPRESAS DE TELECOMUNICAÇÕES E O IBGE. INSUFICIÊNCIA DE SALVAGUARDAS TÉCNICAS E JURÍDICAS. INCONSTITUCIONALIDADE. Reconhecimento autônomo do direito à autodeterminação informativa no art. 5º da CF/88.',
    dedupeKey: 'stf_adi_6387_20200507',
    fullTextUrl: 'https://portal.stf.jus.br/processos/detalhe.asp?incidente=5898858',
    provenance: {
      id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      source: {
        provider: 'STF_OFICIAL',
        court: 'STF',
        documentId: 'ADI_6387',
        contentHash: 'f4c8996fb92427ae41e4649b934ca495991b7852b855e3b0c44298fc1c149a',
        dedupeKey: 'stf_adi_6387_20200507',
        sourceUrl: 'https://jurisprudencia.stf.jus.br',
      },
      verified: true,
      verificationMethod: 'OFFICIAL_SOURCE_HASH',
      verifiedAt: '2026-09-16T00:00:00.000Z',
      snippet: 'Reconhecimento autônomo do direito à autodeterminação informativa no art. 5º da CF/88.',
      confidence: 1.0,
    },
  },
];
