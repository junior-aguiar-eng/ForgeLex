import { z } from 'zod';
import { createSkillCatalog, type SkillCatalog } from './skill-catalog.js';
import type { CaseTaskRole } from '../agentic-case-contracts.js';
import { CASE_TASK_INSTRUCTIONS } from '../instructions/case-task.js';

/**
 * Manifesto do catálogo incorporado (M3.1): metadados, proveniência e estado de revisão de cada ficha. O conteúdo
 * não entra aqui; fica em arquivos privados do servidor, lidos por versão e conferidos por hash.
 *
 * Estados de revisão: pendente, em revisão, ajustada, elegível, inelegível e adiada. O resolvedor só enxerga como
 * `eligible` as fichas em `eligible`; as demais continuam no catálogo, mas nunca são selecionadas.
 */
export const REVIEW_STATES = ['pending', 'in_review', 'adjusted', 'eligible', 'ineligible', 'deferred'] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

const code = z
  .string()
  .max(200)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const role = z.custom<CaseTaskRole>(
  (value) => typeof value === 'string' && Object.hasOwn(CASE_TASK_INSTRUCTIONS, value),
);

const provenance = z.strictObject({
  /** Fonte do conteúdo original, como foi capturado. */
  origin: code,
  originalVersion: z.number().int().positive(),
  originalHash: sha256,
  decision: z.strictObject({ id: code, date }),
  /** Preenchido só quando esta versão é uma redação ajustada a partir de outra do mesmo catálogo. */
  adjustedFrom: z.strictObject({ version: z.number().int().positive(), hash: sha256 }).optional(),
});

const base = z.strictObject({
  id: code,
  version: z.number().int().positive(),
  roles: z
    .array(role)
    .min(1)
    .refine((roles) => new Set(roles).size === roles.length)
    .readonly(),
  contentHash: sha256,
  byteLength: z.number().int().positive(),
  provenance,
  reviewState: z.enum(REVIEW_STATES),
  /** Conferências realizadas e alertas encontrados; vazio enquanto não houver cruzamento. */
  crossChecks: z.array(code).max(20).default([]),
  alerts: z.array(code).max(50).default([]),
});
const entry = z.discriminatedUnion('kind', [
  base.extend({
    kind: z.literal('FORM'),
    areas: z
      .array(code)
      .min(1)
      .refine((areas) => new Set(areas).size === areas.length),
    documentType: code,
  }),
  base.extend({ kind: z.literal('MATTER'), area: code, topic: code }),
]);
const manifest = z.strictObject({
  schemaVersion: z.literal(1),
  version: code,
  createdAt: date,
  entries: z.array(entry),
});

export type SkillManifestEntry = Readonly<z.infer<typeof entry>>;
export interface SkillManifest {
  readonly schemaVersion: 1;
  readonly version: string;
  readonly createdAt: string;
  readonly entries: readonly SkillManifestEntry[];
}

/** Valida o manifesto lido do servidor. Recusa duas linhas para a mesma versão da mesma ficha. */
export function parseSkillManifest(input: unknown): SkillManifest {
  const parsed = manifest.parse(input);
  const seen = new Set<string>();
  for (const item of parsed.entries) {
    const key = `${item.id}@${item.version}`;
    if (seen.has(key)) throw new Error('DUPLICATE_MANIFEST_ENTRY');
    seen.add(key);
    if (item.reviewState === 'eligible' && item.alerts.length) throw new Error('ELIGIBLE_ENTRY_WITH_ALERTS');
  }
  return Object.freeze({ ...parsed, entries: Object.freeze(parsed.entries) });
}

/** Catálogo do resolvedor: só `eligible` vira elegível; o resto fica pendente e não é selecionado. */
export function manifestToCatalog(input: SkillManifest): SkillCatalog {
  return createSkillCatalog({
    version: input.version,
    entries: input.entries.map((item) => ({
      id: item.id,
      version: item.version,
      status: item.reviewState === 'eligible' ? 'eligible' : 'pending',
      kind: item.kind,
      ...(item.kind === 'FORM'
        ? { areas: item.areas, documentType: item.documentType }
        : { area: item.area, topic: item.topic }),
      roles: item.roles,
      contentHash: item.contentHash,
      byteLength: item.byteLength,
    })),
  });
}
