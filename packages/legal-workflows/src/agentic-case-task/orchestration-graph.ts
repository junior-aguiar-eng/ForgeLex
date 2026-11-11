import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { TaskSource } from '@forgelex/domain';
import {
  AdaptiveTaskSpecialistResultSchema,
  TaskCapabilityRequestSchema,
  ADAPTIVE_CASE_TASK_POLICY,
  type AdaptiveTaskSpecialistResult,
  type TaskCapabilityRequest,
  type EvidenceTaskPlan as TaskPlan,
} from '@forgelex/legal-agents';

export const GRAPH_ROLES = [
  'matter-analyst',
  'legal-researcher',
  'procedural-advisor',
  'legal-drafter',
  'adversarial-reviewer',
  'authority-verifier',
] as const;
export type GraphRole = (typeof GRAPH_ROLES)[number];
const RoleSchema = z.enum(GRAPH_ROLES);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const graphHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const InputSchema = z.strictObject({
  bindingHash: digest,
  contractHash: digest,
  planHash: digest,
  toolsHash: digest,
  sources: z.array(z.strictObject({ id: z.string(), contentHash: digest })).max(100),
  dependencies: z.array(z.strictObject({ id: z.string(), outputHash: digest.nullable() })).max(6),
  requests: z.array(TaskCapabilityRequestSchema).max(5),
  previousAttemptHash: digest.nullable(),
});
type NodeInput = z.infer<typeof InputSchema>;
type GraphContext = { bindingHash: string; contractHash: string; sources: TaskSource[]; explicitResearch?: boolean };
const NodeSchema = z.strictObject({
  id: z.string(),
  role: RoleSchema,
  generation: z.number().int().min(0).max(1),
  dependsOn: z.array(z.string()).max(6),
  status: z.enum(['PENDING', 'COMPLETED', 'SUPERSEDED', 'UNAVAILABLE', 'SKIPPED']),
  inputHash: digest.optional(),
  input: InputSchema.optional(),
  outputHash: digest.optional(),
  runIndex: z.number().int().min(2).max(10).optional(),
});
export const OrchestrationGraphSchema = z.strictObject({
  version: z.literal(1),
  revision: z.number().int().min(0).max(1),
  tools: z.array(z.string().min(1).max(200)).max(100),
  failedTools: z.array(z.string()).max(4),
  planHashes: z.array(digest).min(1).max(11),
  reviewRequired: z.boolean(),
  nodes: z.array(NodeSchema).max(14),
  archivedOutputs: z.record(z.string(), AdaptiveTaskSpecialistResultSchema),
  decisions: z
    .array(
      z.strictObject({
        afterNode: z.string(),
        requests: z.array(TaskCapabilityRequestSchema).max(5),
        unavailableRequests: z.array(TaskCapabilityRequestSchema).max(5),
        outcome: z.enum(['INCORPORATED', 'REPLANNED', 'REPLAN_LIMIT', 'NODE_LIMIT', 'SOURCE_UNAVAILABLE']),
      }),
    )
    .max(10),
  stopReason: z.enum(['COMPLETED', 'REPLAN_LIMIT', 'NODE_LIMIT']).optional(),
});
export type OrchestrationGraph = z.infer<typeof OrchestrationGraphSchema>;
export type GraphNode = z.infer<typeof NodeSchema>;
type Outputs = Record<string, AdaptiveTaskSpecialistResult>;
const rank = (role: GraphRole) => GRAPH_ROLES.indexOf(role);
const active = (graph: OrchestrationGraph) =>
  graph.nodes.filter((n) => n.status !== 'SUPERSEDED').sort((a, b) => rank(a.role) - rank(b.role));
export function graphRoles(plan: TaskPlan, reviewRequired: boolean): GraphRole[] {
  const factual =
    plan.action === 'create_document' &&
    plan.documentPurpose === 'FACTUAL_RECORD' &&
    !plan.requiresProcedure &&
    !plan.requiresNorms &&
    !plan.requiresCaseLaw;
  return GRAPH_ROLES.filter((role) => {
    if (role === 'matter-analyst') return plan.action !== 'research_question';
    if (role === 'legal-researcher')
      return plan.action === 'research_question' || plan.requiresCaseLaw || plan.requiresNorms;
    if (role === 'procedural-advisor') return (plan.action === 'create_document' && !factual) || plan.requiresProcedure;
    if (role === 'legal-drafter') return plan.action === 'create_document';
    if (role === 'adversarial-reviewer')
      return ['create_document', 'review_text', 'analyze_evidence'].includes(plan.action) || reviewRequired;
    return true; // Verification is a terminal conditional node, including the no-legal-evidence branch.
  });
}
function dependencies(graph: OrchestrationGraph) {
  const nodes = active(graph);
  for (const [index, node] of nodes.entries()) node.dependsOn = nodes.slice(0, index).map((n) => n.id);
}
const nodeFor = (role: GraphRole, generation: number): GraphNode => ({
  id: `${role}:${generation}`,
  role,
  generation,
  dependsOn: [],
  status: 'PENDING',
});
export function createOrchestrationGraph(plan: TaskPlan, tools: string[]): OrchestrationGraph {
  const graph: OrchestrationGraph = {
    version: 1,
    revision: 0,
    tools,
    failedTools: [],
    planHashes: [graphHash(plan)],
    reviewRequired: false,
    nodes: graphRoles(plan, false).map((r) => nodeFor(r, 0)),
    archivedOutputs: {},
    decisions: [],
  };
  dependencies(graph);
  return graph;
}
export function researchNeeds(plan: TaskPlan, requests: readonly TaskCapabilityRequest[], explicitResearch: boolean) {
  const legislation =
    plan.requiresNorms || (explicitResearch && requests.some((r) => r.capability === 'NORM_RESEARCH'));
  return {
    legislation,
    caseLaw:
      plan.requiresCaseLaw ||
      (explicitResearch && requests.some((r) => r.capability === 'CASE_LAW_RESEARCH')) ||
      (plan.action === 'research_question' && (!explicitResearch || !legislation)),
  };
}
export function researchAvailable(
  plan: TaskPlan,
  tools: string[],
  explicitResearch = false,
  requests: readonly TaskCapabilityRequest[] = [],
) {
  const needs = researchNeeds(plan, requests, explicitResearch);
  return (
    (needs.caseLaw && tools.includes('research.search_case_law')) ||
    (needs.legislation && tools.includes('research.get_legislation'))
  );
}
export function validateOrchestrationGraph(
  graph: OrchestrationGraph,
  plan: TaskPlan,
  outputs: Outputs,
  profiles: Record<string, unknown>[],
  context: GraphContext,
) {
  const fail = () => {
    throw new Error('TASK_GRAPH_CONFLICT');
  };
  const nodes = active(graph);
  if (
    profiles[0]?.role !== 'legal-orchestrator' ||
    graph.planHashes.at(-1) !== graphHash(plan) ||
    graph.failedTools.some((name) => !graph.tools.includes(name) || !name.startsWith('research.')) ||
    new Set(graph.failedTools).size !== graph.failedTools.length
  )
    fail();
  if (
    new Set(graph.nodes.map((n) => n.id)).size !== graph.nodes.length ||
    JSON.stringify(nodes.map((n) => n.role)) !== JSON.stringify(graphRoles(plan, graph.reviewRequired))
  )
    fail();
  const completedRoles = nodes
    .filter((n) => n.status === 'COMPLETED')
    .map((n) => n.role)
    .sort();
  if (JSON.stringify(Object.keys(outputs).sort()) !== JSON.stringify(completedRoles)) fail();
  const archives = graph.nodes
    .filter((n) => n.status === 'SUPERSEDED' && n.outputHash)
    .map((n) => n.id)
    .sort();
  if (JSON.stringify(Object.keys(graph.archivedOutputs).sort()) !== JSON.stringify(archives)) fail();
  const indices = new Set<number>();
  for (const node of graph.nodes) {
    if (node.id !== `${node.role}:${node.generation}` || node.generation > graph.revision) fail();
    if (node.status === 'COMPLETED' || (node.status === 'SUPERSEDED' && node.outputHash)) {
      const result = node.status === 'COMPLETED' ? outputs[node.role] : graph.archivedOutputs[node.id];
      if (
        !result ||
        node.outputHash !== graphHash(result) ||
        !node.input ||
        node.inputHash !== graphHash(node.input) ||
        !node.runIndex ||
        profiles[node.runIndex - 1]?.role !== node.role ||
        indices.has(node.runIndex)
      )
        fail();
      const input = node.input!;
      if (
        input.bindingHash !== context.bindingHash ||
        input.contractHash !== context.contractHash ||
        input.toolsHash !== graphHash(graph.tools) ||
        !graph.planHashes.includes(input.planHash) ||
        JSON.stringify(input.dependencies) !==
          JSON.stringify(
            node.dependsOn.map((id) => ({ id, outputHash: graph.nodes.find((n) => n.id === id)?.outputHash ?? null })),
          ) ||
        input.sources.some(
          (s) => !context.sources.some((current) => current.id === s.id && current.contentHash === s.contentHash),
        ) ||
        input.previousAttemptHash !==
          (node.generation > 0 && graph.archivedOutputs[`${node.role}:0`]
            ? graphHash(graph.archivedOutputs[`${node.role}:0`])
            : null)
      )
        fail();
      indices.add(node.runIndex!);
    } else if (node.input || node.inputHash || node.outputHash || node.runIndex) fail();
    if (
      node.status === 'UNAVAILABLE' &&
      (node.role !== 'legal-researcher' ||
        researchAvailable(
          plan,
          graph.tools.filter((name) => !graph.failedTools.includes(name)),
          context.explicitResearch,
          graphRequests(graph),
        ))
    )
      fail();
    if (
      node.status === 'SKIPPED' &&
      (node.role !== 'authority-verifier' || context.sources.some((s) => ['AUTHORITY', 'NORM'].includes(s.kind)))
    )
      fail();
  }
  if (indices.size !== profiles.length - 1) fail();
  for (const [index, node] of nodes.entries()) {
    const before = nodes.slice(0, index);
    if (JSON.stringify(node.dependsOn) !== JSON.stringify(before.map((n) => n.id))) fail();
    if (
      node.status === 'COMPLETED' &&
      before.some((d) => d.status === 'PENDING' || (d.runIndex && d.runIndex >= node.runIndex!))
    )
      fail();
  }
}
export function nextGraphNode(graph: OrchestrationGraph): GraphNode | undefined {
  return active(graph).find(
    (node) =>
      node.status === 'PENDING' &&
      node.dependsOn.every((id) => graph.nodes.find((n) => n.id === id)?.status !== 'PENDING'),
  );
}
export function completeGraphNode(
  node: GraphNode,
  output: AdaptiveTaskSpecialistResult,
  runIndex: number,
  input: NodeInput,
) {
  Object.assign(node, {
    status: 'COMPLETED',
    input,
    inputHash: graphHash(input),
    outputHash: graphHash(output),
    runIndex,
  });
}
export function graphRequests(graph: OrchestrationGraph) {
  const decision = graph.decisions.at(-1);
  return (
    decision?.requests.filter(
      (r) =>
        !decision.unavailableRequests.includes(r) &&
        !decision.unavailableRequests.some((blocked) => graphHash(blocked) === graphHash(r)),
    ) ?? []
  );
}
export function captureGraphInput(
  graph: OrchestrationGraph,
  node: GraphNode,
  plan: TaskPlan,
  context: GraphContext,
): NodeInput {
  return {
    bindingHash: context.bindingHash,
    contractHash: context.contractHash,
    planHash: graphHash(plan),
    toolsHash: graphHash(graph.tools),
    sources: context.sources.map(({ id, contentHash }) => ({ id, contentHash })),
    dependencies: node.dependsOn.map((id) => ({
      id,
      outputHash: graph.nodes.find((n) => n.id === id)?.outputHash ?? null,
    })),
    requests: graphRequests(graph),
    previousAttemptHash: graph.archivedOutputs[`${node.role}:0`]
      ? graphHash(graph.archivedOutputs[`${node.role}:0`])
      : null,
  };
}
const targetRole = (r: TaskCapabilityRequest): GraphRole =>
  r.capability === 'CASE_LAW_RESEARCH' || r.capability === 'NORM_RESEARCH'
    ? 'legal-researcher'
    : r.capability === 'PROCEDURAL_ANALYSIS'
      ? 'procedural-advisor'
      : 'adversarial-reviewer';

/** Accept one bounded new generation. All downstream outputs from the previous inputs are invalidated atomically in the checkpoint. */
export function reconcileOrchestrationGraph(
  graph: OrchestrationGraph,
  plan: TaskPlan,
  outputs: Outputs,
  completed: GraphNode,
  roleRuns: number,
) {
  const result = outputs[completed.role];
  const requests = [...(result?.capabilityRequests ?? [])];
  if (
    completed.role !== 'adversarial-reviewer' &&
    completed.role !== 'authority-verifier' &&
    !active(graph).some((n) => n.role === 'adversarial-reviewer') &&
    result?.claims.some((c) => c.classification === 'CONFLICT') &&
    plan.issues.length
  ) {
    requests.push({
      capability: 'ADVERSARIAL_REVIEW',
      reason: 'MATERIAL_CONFLICT',
      issueIds: plan.issues.map((i) => i.id),
      sourceIds: [...new Set(result.claims.filter((c) => c.classification === 'CONFLICT').flatMap((c) => c.sourceIds))],
    });
  }
  const limits: ('REPLAN_LIMIT' | 'NODE_LIMIT' | 'SOURCE_UNAVAILABLE')[] = [];
  if (!requests.length) return limits;
  const requiredTool = (r: TaskCapabilityRequest) =>
    r.capability === 'CASE_LAW_RESEARCH'
      ? 'research.search_case_law'
      : r.capability === 'NORM_RESEARCH'
        ? 'research.get_legislation'
        : undefined;
  const unavailableRequests = requests.filter((r) => {
    const tool = requiredTool(r);
    return tool && (!graph.tools.includes(tool) || graph.failedTools.includes(tool));
  });
  const accepted = requests.filter((r) => !unavailableRequests.includes(r));
  const decision: OrchestrationGraph['decisions'][number] = {
    afterNode: completed.id,
    requests,
    unavailableRequests,
    outcome: 'INCORPORATED',
  };
  graph.decisions.push(decision);
  if (unavailableRequests.length) limits.push('SOURCE_UNAVAILABLE');
  if (!accepted.length) {
    decision.outcome = 'SOURCE_UNAVAILABLE';
    return limits;
  }
  const projected = { ...plan };
  let review = graph.reviewRequired;
  for (const r of accepted) {
    if (r.capability === 'CASE_LAW_RESEARCH') projected.requiresCaseLaw = true;
    if (r.capability === 'NORM_RESEARCH') projected.requiresNorms = true;
    if (r.capability === 'PROCEDURAL_ANALYSIS') projected.requiresProcedure = true;
    if (r.capability === 'ADVERSARIAL_REVIEW') review = true;
  }
  const old = active(graph),
    desired = graphRoles(projected, review);
  const changed = desired.filter((role) => !old.some((n) => n.role === role));
  for (const r of accepted)
    if (old.some((n) => n.role === targetRole(r) && n.status !== 'PENDING')) changed.push(targetRole(r));
  if (!changed.length) {
    Object.assign(plan, projected);
    if (graph.planHashes.at(-1) !== graphHash(plan)) graph.planHashes.push(graphHash(plan));
    graph.reviewRequired = review;
    return limits;
  }
  if (graph.revision >= ADAPTIVE_CASE_TASK_POLICY.maxReplans) {
    decision.outcome = 'REPLAN_LIMIT';
    graph.stopReason = 'REPLAN_LIMIT';
    return [...limits, 'REPLAN_LIMIT'] as const;
  }
  const from = Math.min(...changed.map(rank));
  const remaining =
    old.filter((n) => rank(n.role) < from && n.status === 'PENDING').length +
    desired.filter((r) => rank(r) >= from).length;
  if (roleRuns + remaining > ADAPTIVE_CASE_TASK_POLICY.maxRoleRuns) {
    decision.outcome = 'NODE_LIMIT';
    graph.stopReason = 'NODE_LIMIT';
    return [...limits, 'NODE_LIMIT'] as const;
  }
  graph.revision++;
  for (const node of old.filter((n) => rank(n.role) >= from)) {
    if (node.status === 'COMPLETED') graph.archivedOutputs[node.id] = outputs[node.role]!;
    delete outputs[node.role];
    node.status = 'SUPERSEDED';
  }
  for (const role of desired.filter((r) => rank(r) >= from)) graph.nodes.push(nodeFor(role, graph.revision));
  Object.assign(plan, projected);
  if (graph.planHashes.at(-1) !== graphHash(plan)) graph.planHashes.push(graphHash(plan));
  graph.reviewRequired = review;
  dependencies(graph);
  decision.outcome = 'REPLANNED';
  return limits;
}
