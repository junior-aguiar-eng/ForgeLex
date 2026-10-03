// Acrescente somente tribunais com endpoint integrado e validado no backend.
export const DATAJUD_COURTS = [
  {
    id: 'tjal', code: 'TJAL', label: 'TJAL — Alagoas',
    cnjSegment: '8.02', endpoint: '/api/v2/datajud/tjal/process',
  },
] as const;

export type DataJudCourtId = typeof DATAJUD_COURTS[number]['id'];
export type DataJudCourtCode = typeof DATAJUD_COURTS[number]['code'];
