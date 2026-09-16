export type CourtType = 'SUPERIOR' | 'FEDERAL' | 'ESTADUAL' | 'TRABALHISTA' | 'MILITAR' | 'ELEITORAL';

export interface CourtMetadata {
  code: string;
  name: string;
  type: CourtType;
  jurisdiction: string;
  hasBindingPrecedents: boolean;
  officialSearchUrl: string;
  status: 'ONLINE' | 'DEGRADED' | 'MAINTENANCE';
}

export const CANONICAL_COURTS: CourtMetadata[] = [
  {
    code: 'STF',
    name: 'Supremo Tribunal Federal',
    type: 'SUPERIOR',
    jurisdiction: 'BR',
    hasBindingPrecedents: true,
    officialSearchUrl: 'https://jurisprudencia.stf.jus.br',
    status: 'ONLINE',
  },
  {
    code: 'STJ',
    name: 'Superior Tribunal de Justiça',
    type: 'SUPERIOR',
    jurisdiction: 'BR',
    hasBindingPrecedents: true,
    officialSearchUrl: 'https://scon.stj.jus.br',
    status: 'ONLINE',
  },
  {
    code: 'TST',
    name: 'Tribunal Superior do Trabalho',
    type: 'TRABALHISTA',
    jurisdiction: 'BR',
    hasBindingPrecedents: true,
    officialSearchUrl: 'https://jurisprudencia.tst.jus.br',
    status: 'ONLINE',
  },
  {
    code: 'TJSP',
    name: 'Tribunal de Justiça de São Paulo',
    type: 'ESTADUAL',
    jurisdiction: 'SP',
    hasBindingPrecedents: false,
    officialSearchUrl: 'https://esaj.tjsp.jus.br/cposg',
    status: 'ONLINE',
  },
  {
    code: 'TJRJ',
    name: 'Tribunal de Justiça do Rio de Janeiro',
    type: 'ESTADUAL',
    jurisdiction: 'RJ',
    hasBindingPrecedents: false,
    officialSearchUrl: 'https://www.tjrj.jus.br',
    status: 'ONLINE',
  },
  {
    code: 'TRF3',
    name: 'Tribunal Regional Federal da 3ª Região',
    type: 'FEDERAL',
    jurisdiction: 'SP/MS',
    hasBindingPrecedents: false,
    officialSearchUrl: 'https://web.trf3.jus.br',
    status: 'ONLINE',
  },
];

export class CourtCatalog {
  private readonly courtsByCode = new Map<string, CourtMetadata>(
    CANONICAL_COURTS.map((c) => [c.code.toUpperCase(), c])
  );

  public getAllCourts(): CourtMetadata[] {
    return CANONICAL_COURTS;
  }

  public getCourt(code: string): CourtMetadata | undefined {
    return this.courtsByCode.get(code.trim().toUpperCase());
  }

  public isCourtSupported(code: string): boolean {
    return this.courtsByCode.has(code.trim().toUpperCase());
  }

  public getCourtsByType(type: CourtType): CourtMetadata[] {
    return CANONICAL_COURTS.filter((c) => c.type === type);
  }
}
