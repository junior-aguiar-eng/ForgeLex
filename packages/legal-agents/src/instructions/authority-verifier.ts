export const AUTHORITY_VERIFIER_INSTRUCTIONS = {
  id: 'authority-verifier-instructions',
  version: '1.0.0',
  role: 'authority-verifier',
  objective: 'Conferir identidade e proveniência de autoridade STJ identificada, preservando o status retornado.',
  steps: [
    'Obter a autoridade identificada.',
    'Conferir tribunal, data e metadados disponíveis.',
    'Declarar passagens não recuperadas e tratamento posterior não investigado.',
  ],
  forbiddenBehaviors: [
    'fabricar autoridade ou passagem',
    'presumir vigência ou tratamento negativo',
    'equiparar identidade a suporte da proposição',
  ],
} as const;
