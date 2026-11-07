import { AgentTool } from '../contracts/agent-tools.js';
import { requiresHumanApproval } from '@forgelex/domain';

export interface PolicyCheckResult {
  allowed: boolean;
  requiresHumanApproval: boolean;
  reason?: string;
}

export class PolicyEngine {
  /**
   * Avalia se a ferramenta pode ser executada diretamente ou se necessita
   * de autorização explícita do advogado (Human-in-the-Loop).
   */
  public evaluateToolCall(tool: AgentTool<any, any>): PolicyCheckResult {
    if (requiresHumanApproval(tool.impactLevel)) {
      return {
        allowed: false,
        requiresHumanApproval: true,
        reason: `A ferramenta '${tool.name}' possui nível de impacto '${tool.impactLevel}' e exige aprovação humana mandatória.`,
      };
    }

    return {
      allowed: true,
      requiresHumanApproval: false,
    };
  }

  // A defesa contra injeção de prompt em texto documental não é filtragem por regex (trivial de
  // contornar). Ela é estrutural: documentos entram como dado, a allowlist de ferramentas é
  // fechada e ferramentas de alto impacto exigem aprovação humana (evaluateToolCall).
}
