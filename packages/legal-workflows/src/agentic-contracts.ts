export interface AgenticInstructionContract {
  id: 'research-authority-instructions';
  version: '1.0.0';
  positiveCase: string;
  negativeCase: string;
  hostResponsibilities: readonly string[];
  forgeLexResponsibilities: readonly string[];
  compatibleHosts: readonly ['ChatGPT/OpenAI', 'Claude/Anthropic', 'REST'];
}

export interface AgenticWorkflowContract {
  id: 'research-authority-workflow';
  version: '1.0.0';
  hostResponsibilities: readonly string[];
  forgeLexResponsibilities: readonly string[];
  compatibleHosts: readonly ['ChatGPT/OpenAI', 'Claude/Anthropic', 'REST'];
  steps: readonly { id: string; toolName: 'research.search_case_law' | 'research.get_authority' | 'research.verify_authority'; purpose: string }[];
}

export const RESEARCH_AUTHORITY_INSTRUCTIONS: AgenticInstructionContract = {
  id: 'research-authority-instructions', version: '1.0.0',
  positiveCase: 'Pesquise no STJ, obtenha ou verifique cada autoridade que será citada e apresente a proveniência e o status retornados pela tool.',
  negativeCase: 'Se a tool não localizar ou não confirmar uma autoridade, não invente número, órgão, tese, data ou status; declare a limitação.',
  hostResponsibilities: ['modelo', 'raciocínio', 'contexto conversacional', 'prompt privado'],
  forgeLexResponsibilities: ['tools jurídicas', 'dados indexados', 'proveniência', 'autorização', 'billing da operação própria'],
  compatibleHosts: ['ChatGPT/OpenAI', 'Claude/Anthropic', 'REST'],
};

export const RESEARCH_AUTHORITY_WORKFLOW: AgenticWorkflowContract = {
  id: 'research-authority-workflow', version: '1.0.0',
  hostResponsibilities: RESEARCH_AUTHORITY_INSTRUCTIONS.hostResponsibilities,
  forgeLexResponsibilities: RESEARCH_AUTHORITY_INSTRUCTIONS.forgeLexResponsibilities,
  compatibleHosts: RESEARCH_AUTHORITY_INSTRUCTIONS.compatibleHosts,
  steps: [
    { id: 'search', toolName: 'research.search_case_law', purpose: 'Localizar candidatos no índice persistido do STJ.' },
    { id: 'get', toolName: 'research.get_authority', purpose: 'Recuperar a autoridade identificada e sua proveniência.' },
    { id: 'verify', toolName: 'research.verify_authority', purpose: 'Conferir status e divergências antes de citar.' },
  ],
};
