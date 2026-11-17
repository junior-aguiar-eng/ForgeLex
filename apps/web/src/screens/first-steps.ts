import type { AppTab } from '../navigation/routes';

/**
 * Passos do cartão "Primeiros passos" da Visão (V2, tema gelo). Texto do app, proposta minha: o texto público só muda na
 * V5A, mas este cartão é novo e vive dentro da conta.
 */
export interface FirstStep {
  id: 'connect' | 'desk' | 'research' | 'progress';
  title: string;
  description: string;
  action: string;
  tab: AppTab;
}

export function firstSteps(flags: { deskEnabled: boolean }): FirstStep[] {
  return [
    {
      id: 'connect',
      title: 'Conecte a sua IA',
      description: 'Autorize o ChatGPT ou o Claude a usar o ForgeLex.',
      action: 'Conectar IA',
      tab: 'connections',
    },
    ...(flags.deskEnabled
      ? [
          {
            id: 'desk' as const,
            title: 'Abra a Mesa',
            description: 'Descreva o trabalho e acompanhe a peça ao lado da conversa.',
            action: 'Abrir a Mesa',
            tab: 'work' as const,
          },
        ]
      : []),
    {
      id: 'research',
      title: 'Pesquise jurisprudência',
      description: 'Cada decisão traz a fonte e o estado de verificação.',
      action: 'Ir para Jurisprudência',
      tab: 'research',
    },
    {
      id: 'progress',
      title: 'Confira um andamento',
      description: 'A consulta de andamento processual é gratuita.',
      action: 'Ver andamento processual',
      tab: 'datajud',
    },
  ];
}
