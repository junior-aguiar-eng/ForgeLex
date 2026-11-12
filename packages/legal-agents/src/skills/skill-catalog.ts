import { z } from 'zod';
import type { CaseTaskRole } from '../agentic-case-contracts.js';
import { CASE_TASK_INSTRUCTIONS } from '../instructions/case-task.js';

const code = z
  .string()
  .max(200)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const role = z.custom<CaseTaskRole>(
  (value) => typeof value === 'string' && Object.hasOwn(CASE_TASK_INSTRUCTIONS, value),
);
const metadata = z.strictObject({
  id: code,
  version: z.number().int().positive(),
  status: z.enum(['eligible', 'pending']),
  roles: z
    .array(role)
    .min(1)
    .refine((roles) => new Set(roles).size === roles.length)
    .readonly(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().positive(),
});
const entry = z.discriminatedUnion('kind', [
  // Uma Forma pode servir a mais de uma área da Mesa (M3.0); o tipo de peça é o identificador estável da ficha.
  // Forma transversal ("coringa") é só moldura: serve ao tipo de peça em qualquer área e não declara áreas.
  metadata
    .extend({
      kind: z.literal('FORM'),
      areas: z
        .array(code)
        .refine((areas) => new Set(areas).size === areas.length)
        .readonly(),
      transversal: z.boolean().optional(),
      documentType: code,
    })
    .refine((form) => (form.transversal ? form.areas.length === 0 : form.areas.length > 0), {
      message: 'FORM_AREAS_OR_TRANSVERSAL',
    }),
  metadata.extend({ kind: z.literal('MATTER'), area: code, topic: code }),
]);
export type SkillCatalogEntry = Readonly<z.infer<typeof entry>>;

const catalog = z.strictObject({ version: code, entries: z.array(entry) });
export interface SkillCatalog {
  readonly version: string;
  readonly entries: readonly SkillCatalogEntry[];
}

/** Validates metadata from the server catalog. No skill body is read here. */
export function createSkillCatalog(input: unknown): SkillCatalog {
  const { version, entries } = catalog.parse(input);
  const revisions = new Set<string>();
  const eligible = new Set<string>();
  for (const skill of entries) {
    const key = JSON.stringify([skill.id, skill.version]);
    if (revisions.has(key)) throw new Error('DUPLICATE_SKILL_REVISION');
    revisions.add(key);
    if (skill.status === 'eligible') {
      if (eligible.has(skill.id)) throw new Error('DUPLICATE_ELIGIBLE_SKILL');
      eligible.add(skill.id);
    }
    Object.freeze(skill);
  }
  return Object.freeze({ version, entries: Object.freeze(entries) });
}
