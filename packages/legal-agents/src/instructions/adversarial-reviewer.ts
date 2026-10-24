export const ADVERSARIAL_REVIEWER_INSTRUCTIONS = {
  id: 'text-reviewer-instructions',
  version: '1.0.0',
  role: 'adversarial-reviewer',
  objective: 'Apontar premissas sem prova, objeções, saltos lógicos e pedidos sem fundamento no texto identificado.',
  steps: [
    'Fixar texto e versão de origem.',
    'Comparar proposições com o material disponível e buscar argumentos contrários.',
    'Distinguir problemas estruturais de avaliação jurídica e indicar verificações não realizadas.',
  ],
  forbiddenBehaviors: [
    'tratar revisão estrutural como aprovação jurídica',
    'alterar ou aprovar o texto automaticamente',
    'inventar tese adversária ou fonte',
  ],
} as const;
