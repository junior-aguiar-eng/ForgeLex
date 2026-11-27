import React from 'react';
import { useApp } from '../../context/AppContext';
import { accountSections, connectSections } from '../../navigation/app-navigation';
import type { AppTab } from '../../navigation/routes';
import { PageHeader, SectionTabs } from './PageHeader';

/**
 * Moldura das telas da Conta e de Conectar IA no tema gelo (protótipo de 09/11): o título e as seções da tela, no alto.
 * Atividade, Segurança e Chaves de API são seções da Conta; o guia e a API são seções de Conectar IA. O conteúdo de cada
 * tela vem logo abaixo, como era.
 */
export const IceFrame: React.FC<{ tab: AppTab }> = ({ tab }) => {
  const { setActiveTab } = useApp();
  const account = accountSections();
  const connect = connectSections();
  const group = account.some((section) => section.tab === tab)
    ? { title: 'Conta e créditos', label: 'Seções da conta', sections: account }
    : tab === 'connections'
      ? { title: 'Conectar a sua IA', label: 'Seções de Conectar IA', sections: connect }
      : undefined;
  if (!group) return null;
  return (
    <PageHeader title={group.title}>
      {group.sections.length > 1 && (
        <SectionTabs
          label={group.label}
          items={group.sections.map((section) => ({
            key: section.tab,
            label: section.label,
            active: section.tab === tab,
            onSelect: () => setActiveTab(section.tab),
          }))}
        />
      )}
    </PageHeader>
  );
};
