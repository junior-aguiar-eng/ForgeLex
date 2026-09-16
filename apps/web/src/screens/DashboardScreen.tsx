import React, { useState } from 'react';
import { useApp, ApprovalRequest } from '../context/AppContext';
import { 
  Scale, FileText, BookOpen, AlertTriangle, CheckCircle, 
  XCircle, Clock, ShieldAlert, ArrowUpRight
} from 'lucide-react';

export const DashboardScreen: React.FC = () => {
  const { approvals, resolveApproval, stats, setActiveTab } = useApp();
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const pendingApprovals = approvals.filter((a) => a.status === 'PENDING');

  const handleApprove = (id: string) => {
    resolveApproval(id, 'APPROVED');
    setSelectedApproval(null);
    setActionSuccessMessage('Aprovação concedida. A minuta avançou no fluxo.');
    setTimeout(() => setActionSuccessMessage(null), 4000);
  };

  const handleReject = (id: string) => {
    resolveApproval(id, 'REJECTED');
    setSelectedApproval(null);
    setActionSuccessMessage('A minuta foi rejeitada e arquivada para revisão manual.');
    setTimeout(() => setActionSuccessMessage(null), 4000);
  };

  // Mock 30-day activity data for the visual chart
  const activityData = [
    { day: '01', searches: 4, drafts: 2 },
    { day: '05', searches: 7, drafts: 3 },
    { day: '10', searches: 9, drafts: 4 },
    { day: '15', searches: 12, drafts: 5 },
    { day: '20', searches: 15, drafts: 6 },
    { day: '25', searches: 11, drafts: 4 },
    { day: '30', searches: 18, drafts: 8 },
  ];

  return (
    <div className="py-8 md:py-12">
      <div className="page-container space-y-8">
        
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-champagne-border pb-6">
          <div>
            <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-stone-900">
              Revisão e atividade
            </h1>
            <p className="text-sm text-stone-500 mt-1">
              Acompanhe pendências que exigem sua conferência e o histórico de trabalho do escritório.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setActiveTab('landing')}
              className="px-4 py-2.5 rounded-xl bg-white border border-champagne-border hover:border-cognac-400 text-stone-800 text-sm font-medium shadow-sm flex items-center space-x-2"
            >
              <Scale className="w-4 h-4 text-cognac-600" />
              <span>Nova Pesquisa</span>
            </button>

            <button
              onClick={() => setActiveTab('connections')}
              className="px-4 py-2.5 rounded-xl bg-cognac-700 hover:bg-cognac-800 text-white text-sm font-medium shadow-sm flex items-center space-x-2"
            >
              <span>Configurações de modelos</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* FEEDBACK TOAST */}
        {actionSuccessMessage && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center space-x-3 animate-fadeIn">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{actionSuccessMessage}</span>
          </div>
        )}

        {/* 4 METRIC CARDS (Inspirados em ForgeLex_02_Dashboard.png) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          
          <div className="champagne-card p-6 rounded-2xl bg-white shadow-card space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Pesquisas jurídicas
              </span>
              <div className="w-9 h-9 rounded-lg bg-cognac-50 border border-cognac-200 flex items-center justify-center">
                <Scale className="w-4 h-4 text-cognac-700" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-bold text-stone-900">{stats.totalSearches}</span>
              <span className="text-xs font-semibold text-emerald-600">+18% este mês</span>
            </div>
            <p className="text-[11px] text-stone-400">Resultados com fonte e verificação</p>
          </div>

          <div className="champagne-card p-6 rounded-2xl bg-white shadow-card space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Memos & Pareceres
              </span>
              <div className="w-9 h-9 rounded-lg bg-cognac-50 border border-cognac-200 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-cognac-700" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-bold text-stone-900">{stats.totalMemos}</span>
              <span className="text-xs font-semibold text-emerald-600">+12% este mês</span>
            </div>
            <p className="text-[11px] text-stone-400">Relatórios estruturados com precedentes vinculantes</p>
          </div>

          <div className="champagne-card p-6 rounded-2xl bg-white shadow-card space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Rascunhos
              </span>
              <div className="w-9 h-9 rounded-lg bg-cognac-50 border border-cognac-200 flex items-center justify-center">
                <FileText className="w-4 h-4 text-cognac-700" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-bold text-stone-900">{stats.totalDrafts}</span>
              <span className="text-xs font-semibold text-emerald-600">+24% este mês</span>
            </div>
            <p className="text-[11px] text-stone-400">Versões organizadas por caso</p>
          </div>

          <div className={`p-6 rounded-2xl shadow-card space-y-3 border transition-colors ${
            pendingApprovals.length > 0 
              ? 'bg-amber-50/70 border-amber-300' 
              : 'champagne-card bg-white'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Pendências de revisão
              </span>
              <div className="w-9 h-9 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-bold text-amber-900">{pendingApprovals.length}</span>
              <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Aguardando sua conferência</span>
            </div>
            <p className="text-[11px] text-amber-800/80">Requer validação do advogado antes de efetivar</p>
          </div>

        </div>

        {/* MAIN GRID: CHART & PENDING APPROVALS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* VOLUMETRIA OPERACIONAL (2 COLS) */}
          <div className="lg:col-span-2 champagne-card p-6 rounded-2xl bg-white shadow-card space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-editorial text-xl font-bold text-stone-900">
                  Atividade recente
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Consultas e rascunhos registrados nos últimos 30 dias.
                </p>
              </div>
              <div className="flex items-center space-x-3 text-xs">
                <span className="flex items-center space-x-1 text-stone-600 font-medium">
                  <span className="w-3 h-3 rounded-sm bg-cognac-600 inline-block"></span>
                  <span>Pesquisas</span>
                </span>
                <span className="flex items-center space-x-1 text-stone-600 font-medium">
                  <span className="w-3 h-3 rounded-sm bg-amber-400 inline-block"></span>
                  <span>Minutas</span>
                </span>
              </div>
            </div>

            {/* Custom Interactive Bars */}
            <div className="h-56 flex items-end justify-between gap-4 pt-8 pb-2 px-2 border-b border-stone-100">
              {activityData.map((item, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 group relative">
                  {/* Tooltip on hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-12 bg-stone-900 text-white text-[11px] px-2 py-1 rounded shadow pointer-events-none whitespace-nowrap z-10">
                    Dia {item.day}: {item.searches} buscas, {item.drafts} peças
                  </div>

                  <div className="w-full max-w-[36px] flex items-end justify-center gap-1 h-40">
                    <div 
                      style={{ height: `${item.searches * 5}%` }} 
                      className="w-1/2 bg-cognac-600 group-hover:bg-cognac-700 rounded-t transition-all"
                    ></div>
                    <div 
                      style={{ height: `${item.drafts * 10}%` }} 
                      className="w-1/2 bg-amber-400 group-hover:bg-amber-500 rounded-t transition-all"
                    ></div>
                  </div>
                  <span className="text-[11px] font-medium text-stone-400">Dia {item.day}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-4 pt-2 text-center text-xs">
              <div className="p-3 rounded-xl bg-[#FDFBF7] border border-champagne-border">
                <span className="text-stone-400 block text-[11px]">Tempo Médio Resposta</span>
                <span className="text-base font-bold text-stone-900">1.8s</span>
              </div>
              <div className="p-3 rounded-xl bg-[#FDFBF7] border border-champagne-border">
                <span className="text-stone-400 block text-[11px]">Taxa de Assertividade</span>
                <span className="text-base font-bold text-emerald-700">99.4%</span>
              </div>
              <div className="p-3 rounded-xl bg-[#FDFBF7] border border-champagne-border">
                <span className="text-stone-400 block text-[11px]">Economia de Horas</span>
                <span className="text-base font-bold text-cognac-800">~148h/mês</span>
              </div>
            </div>
          </div>

          {/* HUMAN-IN-THE-LOOP APPROVAL QUEUE (1 COL) */}
          <div className="champagne-card p-6 rounded-2xl bg-white shadow-card space-y-5">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-5 h-5 text-amber-600" />
                <h3 className="font-editorial text-lg font-bold text-stone-900">
                  Fila de revisão
                </h3>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                {pendingApprovals.length} pendentes
              </span>
            </div>

            {pendingApprovals.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
                <h4 className="text-sm font-semibold text-stone-800">Fila Limpa</h4>
                <p className="text-xs text-stone-500">Todas as minutas e ações externas foram revisadas.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingApprovals.map((appr) => (
                  <div 
                    key={appr.id}
                    className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 hover:bg-amber-50/80 transition-colors space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-200/60 px-2 py-0.5 rounded">
                          {appr.court}
                        </span>
                        <h4 className="text-sm font-bold text-stone-900 mt-1 line-clamp-1">
                          {appr.title}
                        </h4>
                      </div>
                      <span className="text-[10px] text-stone-400 flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {appr.requestedAt.split(' ')[1]}
                      </span>
                    </div>

                    <p className="text-xs text-stone-600 line-clamp-2">
                      {appr.description}
                    </p>

                    <div className="text-[10px] font-mono text-stone-500 bg-white/70 px-2 py-1 rounded border border-amber-100 truncate">
                      Revisão humana necessária
                    </div>

                    <div className="flex items-center space-x-2 pt-1">
                      <button
                        onClick={() => setSelectedApproval(appr)}
                        className="flex-1 py-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-xs font-semibold text-stone-700"
                      >
                        Revisar Minuta
                      </button>
                      <button
                        onClick={() => handleApprove(appr.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white shadow-sm flex items-center space-x-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Aprovar</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* MODAL DE REVISÃO E APROVAÇÃO */}
        {selectedApproval && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="champagne-card bg-white w-full max-w-3xl rounded-2xl p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between border-b border-stone-100 pb-4">
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-xs font-bold">
                      Efeito externo condicionado à sua aprovação
                    </span>
                    <span className="text-xs font-mono text-stone-400">
                      Código de autorização reservado
                    </span>
                  </div>
                  <h3 className="font-editorial text-xl font-bold text-stone-900">
                    {selectedApproval.title}
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Destino: {selectedApproval.court} • Requisitado em {selectedApproval.requestedAt}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedApproval(null)}
                  className="w-8 h-8 rounded-lg bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-600 font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="uppercase font-bold tracking-wider text-stone-500">
                    Conteúdo da minuta
                  </span>
                  <span className="text-stone-400 font-mono">
                    Solicitação de revisão
                  </span>
                </div>
                <div className="p-5 rounded-xl bg-[#FDFBF7] border border-champagne-border font-serif text-xs sm:text-sm text-stone-800 leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto">
                  {selectedApproval.draftContent}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center space-x-3">
                <ShieldAlert className="w-5 h-5 text-amber-700 flex-shrink-0" />
                <span>
                  <strong>Conferência humana:</strong> ao aprovar, você confirma a revisão do conteúdo e autoriza o próximo passo do fluxo processual.
                </span>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => handleReject(selectedApproval.id)}
                  className="px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-sm font-semibold flex items-center space-x-1.5"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Rejeitar Minuta</span>
                </button>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setSelectedApproval(null)}
                    className="px-4 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={() => handleApprove(selectedApproval.id)}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-md flex items-center space-x-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Aprovar & Protocolar</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
