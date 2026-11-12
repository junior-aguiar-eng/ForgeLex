/**
 * Candidatos de Matéria para uma questão do caso (M3.0).
 *
 * O resolvedor continua exigindo igualdade exata entre a área e o tópico da questão e os da ficha. Esta função só
 * decide quais tópicos vale oferecer a quem classifica a questão: pré-filtra por área e pelos `triggers` das fichas e
 * devolve poucos candidatos, em ordem estável. A escolha final tem de estar entre eles (`pickMatterTopic`).
 */
export interface MatterCandidateSource {
  readonly area: string;
  readonly topic: string;
  readonly triggers: readonly string[];
}

export interface MatterCandidate {
  readonly topic: string;
  readonly score: number;
  readonly matched: readonly string[];
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const words = (value: string) => normalize(value).split(' ').filter(Boolean);

/** Frase do gatilho inteira no texto vale mais que sobreposição parcial de palavras. */
function triggerScore(text: string, textWords: ReadonlySet<string>, trigger: string): number {
  const phrase = normalize(trigger);
  if (!phrase) return 0;
  if (` ${text} `.includes(` ${phrase} `)) return 3 + phrase.split(' ').length;
  const parts = words(trigger).filter((word) => word.length > 2);
  if (parts.length < 2) return 0;
  const shared = parts.filter((word) => textWords.has(word)).length;
  return shared / parts.length >= 0.6 ? 1 : 0;
}

export function matterCandidates(
  catalog: readonly MatterCandidateSource[],
  query: { readonly area: string; readonly text: string },
  limit = 8,
): MatterCandidate[] {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('INVALID_CANDIDATE_LIMIT');
  const text = normalize(query.text);
  const textWords = new Set(text.split(' ').filter(Boolean));
  const candidates: MatterCandidate[] = [];
  for (const source of catalog) {
    if (source.area !== query.area) continue;
    let score = 0;
    const matched: string[] = [];
    for (const trigger of source.triggers) {
      const value = triggerScore(text, textWords, trigger);
      if (value > 0) {
        score += value;
        matched.push(trigger);
      }
    }
    if (score > 0) candidates.push({ topic: source.topic, score, matched });
  }
  return candidates
    .sort((a, b) => b.score - a.score || (a.topic < b.topic ? -1 : a.topic > b.topic ? 1 : 0))
    .slice(0, limit);
}

/** Aceita a escolha de quem classificou só se ela estiver entre os candidatos oferecidos; senão, sem tópico. */
export function pickMatterTopic(
  candidates: readonly MatterCandidate[],
  chosen: string | undefined,
): string | undefined {
  return chosen !== undefined && candidates.some((candidate) => candidate.topic === chosen) ? chosen : undefined;
}
