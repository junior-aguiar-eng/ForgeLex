/**
 * Vocabulário da Mesa nas regras mesa-v3 (U3): as 25 grandes áreas do mapa da M3.0 e os tribunais.
 * Rótulos legíveis para o cliente; nenhum conteúdo, id interno ou hash de ficha passa por aqui.
 */
export const DESK_AREAS = Object.freeze([
  { id: 'administrativo', label: 'Administrativo' },
  { id: 'ambiental', label: 'Ambiental' },
  { id: 'bancario', label: 'Bancário' },
  { id: 'civil', label: 'Civil' },
  { id: 'consultoria', label: 'Consultoria' },
  { id: 'constitucional', label: 'Constitucional' },
  { id: 'consumidor', label: 'Consumidor' },
  { id: 'contratos', label: 'Contratos' },
  { id: 'digital-dados', label: 'Digital e dados' },
  { id: 'diversidade-dh', label: 'Diversidade e direitos humanos' },
  { id: 'eleitoral', label: 'Eleitoral' },
  { id: 'empresarial', label: 'Empresarial' },
  { id: 'familia-sucessoes', label: 'Família e sucessões' },
  { id: 'imobiliario', label: 'Imobiliário' },
  { id: 'internacional', label: 'Internacional' },
  { id: 'militar', label: 'Militar' },
  { id: 'penal', label: 'Penal' },
  { id: 'previdenciario', label: 'Previdenciário' },
  { id: 'processo-civil', label: 'Processo civil' },
  { id: 'processo-penal', label: 'Processo penal' },
  { id: 'regulatorio', label: 'Regulatório' },
  { id: 'saude', label: 'Saúde' },
  { id: 'societario', label: 'Societário' },
  { id: 'trabalho', label: 'Trabalho' },
  { id: 'tributario', label: 'Tributário' },
] as const);

export const DESK_OTHER_AREA = Object.freeze({ id: 'outra', label: 'Outra área' });

export function deskAreaLabel(id: string | null | undefined): string | undefined {
  if (id === DESK_OTHER_AREA.id) return DESK_OTHER_AREA.label;
  return DESK_AREAS.find((area) => area.id === id)?.label;
}

const STATES = [
  ['ac', 'Acre'],
  ['al', 'Alagoas'],
  ['ap', 'Amapá'],
  ['am', 'Amazonas'],
  ['ba', 'Bahia'],
  ['ce', 'Ceará'],
  ['df', 'Distrito Federal'],
  ['es', 'Espírito Santo'],
  ['go', 'Goiás'],
  ['ma', 'Maranhão'],
  ['mt', 'Mato Grosso'],
  ['ms', 'Mato Grosso do Sul'],
  ['mg', 'Minas Gerais'],
  ['pa', 'Pará'],
  ['pb', 'Paraíba'],
  ['pr', 'Paraná'],
  ['pe', 'Pernambuco'],
  ['pi', 'Piauí'],
  ['rj', 'Rio de Janeiro'],
  ['rn', 'Rio Grande do Norte'],
  ['rs', 'Rio Grande do Sul'],
  ['ro', 'Rondônia'],
  ['rr', 'Roraima'],
  ['sc', 'Santa Catarina'],
  ['sp', 'São Paulo'],
  ['se', 'Sergipe'],
  ['to', 'Tocantins'],
] as const;

const SUPERIOR = new Map([
  ['stf', { label: 'STF', names: ['supremo tribunal federal'] }],
  ['stj', { label: 'STJ', names: ['superior tribunal de justica'] }],
  ['tst', { label: 'TST', names: ['tribunal superior do trabalho'] }],
  ['tse', { label: 'TSE', names: ['tribunal superior eleitoral'] }],
  ['stm', { label: 'STM', names: ['superior tribunal militar'] }],
]);

export interface DeskCourt {
  readonly id: string;
  readonly label: string;
}

/** Sem acento, em minúsculas e com espaços simples: base de toda comparação de texto livre da Mesa. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const stateName = (uf: string) => STATES.find(([code]) => code === uf)?.[1];
const upper = (value: string) => value.toUpperCase();

/** Rótulo de um tribunal já reconhecido (`tj-al` → "TJ-AL"). Ids desconhecidos voltam sem rótulo. */
export function deskCourtLabel(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  if (id === 'outro') return 'Outro tribunal';
  const superior = SUPERIOR.get(id);
  if (superior) return superior.label;
  const match = id.match(/^(trf|trt|tj|tre)-(\w+)$/);
  return match ? `${upper(match[1])}-${upper(match[2])}` : undefined;
}

/**
 * Reconhece o tribunal no texto livre ("TJ-AL", "TJAL", "Tribunal de Justiça de Alagoas", "TRT 4", "STJ").
 * Devolve `null` quando não reconhece, para a Mesa guardar o pedido sem inventar um tribunal.
 */
export function parseCourt(text: string): DeskCourt | null {
  const t = normalizeText(text);
  if (!t) return null;
  for (const [id, { label, names }] of SUPERIOR) {
    if (new RegExp(`(^| )${id}( |$)`).test(t) || names.some((name) => t.includes(name))) return { id, label };
  }
  const federal = t.match(/(?:^| )trf ?([1-6])(?: |$)/) ?? t.match(/tribunal regional federal d[ao] ([1-6])/);
  if (federal) return { id: `trf-${federal[1]}`, label: `TRF-${federal[1]}` };
  const labor = t.match(/(?:^| )trt ?(\d{1,2})(?: |$)/) ?? t.match(/tribunal regional do trabalho d[ao] (\d{1,2})/);
  if (labor && Number(labor[1]) >= 1 && Number(labor[1]) <= 24) {
    return { id: `trt-${Number(labor[1])}`, label: `TRT-${Number(labor[1])}` };
  }
  for (const prefix of ['tj', 'tre'] as const) {
    const code =
      t.match(new RegExp(`(?:^| )${prefix} ?([a-z]{2})(?: |$)`)) ??
      (prefix === 'tj' ? t.match(/(?:^| )tjdft(?: |$)/) : null);
    const uf = code ? (code[1] ?? 'df') : undefined;
    if (uf && stateName(uf)) return { id: `${prefix}-${uf}`, label: `${upper(prefix)}-${upper(uf)}` };
  }
  for (const [uf, name] of STATES) {
    const n = normalizeText(name);
    if (new RegExp(`tribunal de justica d[aeo]s? ${n}( |$)`).test(t))
      return { id: `tj-${uf}`, label: `TJ-${upper(uf)}` };
    if (new RegExp(`tribunal regional eleitoral d[aeo]s? ${n}( |$)`).test(t)) {
      return { id: `tre-${uf}`, label: `TRE-${upper(uf)}` };
    }
  }
  return null;
}
