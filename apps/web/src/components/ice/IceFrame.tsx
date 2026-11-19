import React from 'react';
import { useApp } from '../../context/AppContext';
import { accountSections, connectSections } from '../../navigation/app-navigation';
import type { AppTab } from '../../navigation/routes';
import { AGENTIC_WORKSPACE_ENABLED, CASE_WORKSPACE_ENABLED, isDeskEnabled } from '../../config/site-capabilities';
import { PageHeader, SectionTabs } from './PageHeader';

/**
 * Moldura das telas da Conta e de Conectar IA no tema gelo (protótipo de 09/11): o título e as seções da tela, no alto.
 * Atividade, Segurança e Chaves de API são seções da Conta; o guia e a API são seções de Conectar IA. O conteúdo de cada
 * tela vem logo abaixo, como era.
 */
/**
 * Dados do caso (U7): a tela de um caso, aberta a partir da Mesa. O cabeçalho diz o que ela guarda e leva de volta à Mesa.
 * A Mesa fica montada, só escondida, enquanto esta tela está aberta, então voltar a devolve exatamente como estava: a
 * conversa, o texto digitado e o caso escolhido. Não se volta por `?matterId=`: esse endereço significa "abrir a peça deste
 * caso" e abriria uma minuta em branco com o caso travado.
 */
const CaseDataFrame: React.FC = () => {
  const { setActiveTab } = useApp();
  const deskEnabled = isDeskEnabled(CASE_WORKSPACE_ENABLED, AGENTIC_WORKSPACE_ENABLED);
  return (
    <PageHeader
      title="Dados do caso"
      subtitle="Fatos, provas, linha do tempo, questões jurídicas e memorando do caso. A exclusão definitiva também fica aqui."
    >
      {deskEnabled && (
        <button
          type="button"
          onClick={() => setActiveTab('work')}
          className="mt-3.5 inline-flex min-h-11 items-center rounded-[9px] px-3.5 text-[13px] font-medium text-accent hover:bg-canvas-deep"
        >
          ← Voltar à Mesa
        </button>
      )}
    </PageHeader>
  );
};

export const IceFrame: React.FC<{ tab: AppTab }> = ({ tab }) => {
  const { setActiveTab } = useApp();
  if (tab === 'matter') return <CaseDataFrame />;
  const account = accountSections();
  const connect = connectSections();
  const group = account.some((section) => section.tab === tab)
    ? { title: 'Conta e créditos', label: 'Seções da conta', sections: account }
    : connect.some((section) => section.tab === tab)
      ? { title: 'Conectar a sua IA', label: 'Seções de Conectar IA', sections: connect }
      : undefined;
  if (!group) return null;
  return (
    <PageHeader title={group.title}>
      <SectionTabs
        label={group.label}
        items={group.sections.map((section) => ({
          key: section.tab,
          label: section.label,
          active: section.tab === tab,
          onSelect: () => setActiveTab(section.tab),
        }))}
      />
    </PageHeader>
  );
};
