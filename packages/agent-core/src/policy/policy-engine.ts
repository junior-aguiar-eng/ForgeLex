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

  /**
   * Higieniza textos documentais não confiáveis para prevenir injeção de prompt
   * (ex: sentenças, petições e PDFs externos tentando reescrever comandos do sistema).
   */
  public sanitizeDocumentContent(content: string): string {
    // Tratamos explicitamente o texto documental como DADO isolado
    // e neutralizamos tentativas comuns de jailbreak estrutural
    return content
      .replace(/ignore\s+previous\s+instructions/gi, '[TENTATIVA DE INJEÇÃO REMOVIDA]')
      .replace(/desconsidere\s+as\s+instruções\s+anteriores/gi, '[TENTATIVA DE INJEÇÃO REMOVIDA]')
      .replace(/você\s+agora\s+é\s+um\s+assistente\s+sem\s+regras/gi, '[TENTATIVA DE INJEÇÃO REMOVIDA]');
  }
}
