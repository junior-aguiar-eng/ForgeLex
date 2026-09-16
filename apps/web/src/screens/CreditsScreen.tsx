import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Sparkles, CheckCircle2, 
  QrCode, CreditCard, ShieldCheck, Copy, Check, Info
} from 'lucide-react';

export const CreditsScreen: React.FC = () => {
  const { 
    paidBalanceCents, 
    promotionalBalanceCents, 
    totalBalanceCents, 
    transactions, 
    recharge 
  } = useApp();

  const [selectedPackage, setSelectedPackage] = useState<{
    name: string;
    paidCents: number;
    promoCents: number;
    searches: number;
  } | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CREDIT_CARD'>('PIX');
  const [isProcessing, setIsProcessing] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);

  const formatCurrency = (cents: number) => {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handleOpenCheckout = (name: string, paidCents: number, promoCents: number, searches: number) => {
    setSelectedPackage({ name, paidCents, promoCents, searches });
  };

  const handleConfirmRecharge = () => {
    if (!selectedPackage) return;
    setIsProcessing(true);

    setTimeout(() => {
      recharge(selectedPackage.paidCents, selectedPackage.promoCents, paymentMethod);
      setIsProcessing(false);
      setSelectedPackage(null);
      setSuccessToast(`Recarga de ${formatCurrency(selectedPackage.paidCents + selectedPackage.promoCents)} confirmada com sucesso! Saldo creditado no ledger.`);
      setTimeout(() => setSuccessToast(null), 5000);
    }, 1000);
  };

  const handleCopyPix = () => {
    navigator.clipboard.writeText('00020126580014br.gov.bcb.pix0136forgelex-fin-88219482-11a9-40bc-98ab-0219481928495204000053039865802BR5920FORGELEX TECNOLOGIA6009SAO PAULO62070503***6304D1A2');
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2000);
  };

  const totalSearchesAvailable = Math.floor(totalBalanceCents / 15);

  return (
    <div className="py-8 md:py-12">
      <div className="page-container space-y-8">
        
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-champagne-border pb-6">
          <div>
            <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-stone-900">
              Créditos e faturamento
            </h1>
            <p className="text-sm text-stone-500 mt-1">
              Acompanhe seu saldo e recarregue créditos para continuar pesquisando.
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs font-semibold text-cognac-800 bg-cognac-100/70 px-3 py-1.5 rounded-full border border-cognac-200">
            <Sparkles className="w-3.5 h-3.5 text-cognac-600" />
            <span>Saldo atualizado</span>
          </div>
        </div>

        {/* TOAST ALERT */}
        {successToast && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center space-x-3 animate-fadeIn">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{successToast}</span>
          </div>
        )}

        {/* DUAL-WALLET BALANCE BANNER (Inspirado em ForgeLex_04_Creditos.png) */}
        <div className="champagne-card p-6 sm:p-8 rounded-2xl bg-white shadow-card space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            
            {/* Total Balance Hero */}
            <div className="space-y-1">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Saldo disponível
              </span>
              <div className="flex items-baseline space-x-3">
                <span className="font-editorial text-4xl sm:text-5xl font-bold text-stone-900">
                  {formatCurrency(totalBalanceCents)}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                  {totalSearchesAvailable} pesquisas disponíveis
                </span>
              </div>
              <p className="text-xs text-stone-400">Cada pesquisa jurídica custa R$ 0,15.</p>
            </div>

            {/* Wallet Breakdown Pills */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-[#FDFBF7] border border-champagne-border space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-stone-500">Carteira Paga (BRL)</span>
                  <span className="w-2 h-2 rounded-full bg-cognac-600"></span>
                </div>
                <div className="text-xl font-bold text-stone-900">
                  {formatCurrency(paidBalanceCents)}
                </div>
                <span className="text-[10px] text-stone-400 block">Não expira • Nota Fiscal automática</span>
              </div>

              <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/70 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-amber-800">Saldo Promocional</span>
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                </div>
                <div className="text-xl font-bold text-amber-900">
                  {formatCurrency(promotionalBalanceCents)}
                </div>
                <span className="text-[10px] text-amber-700/80 block">Prioridade absoluta no consumo</span>
              </div>
            </div>

          </div>

          <div className="p-3.5 rounded-xl bg-[#FAF8F3] border border-stone-200/70 flex items-center space-x-3 text-xs text-stone-600">
            <Info className="w-4 h-4 text-cognac-700 flex-shrink-0" />
            <span>
              <strong>Regra de Prioridade:</strong> O sistema consome primeiro seus créditos promocionais. 
              Somente após esgotar o bônus promocional é que o saldo pago é debitado, maximizando sua economia.
            </span>
          </div>
        </div>

        {/* RECHARGE TIERS GRID (Inspirado em ForgeLex_04_Creditos.png) */}
        <div className="space-y-4">
          <div className="text-center sm:text-left">
            <h2 className="font-editorial text-2xl font-bold text-stone-900">
              Pacotes de Recarga Pré-Paga
            </h2>
            <p className="text-xs sm:text-sm text-stone-500">
              Escolha um pacote para abastecer seu escritório. Crédito imediato via PIX ou Cartão.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* TIER 1: R$ 50 */}
            <div className="champagne-card p-6 rounded-2xl bg-white shadow-card flex flex-col justify-between space-y-6 hover:border-cognac-400 transition-all">
              <div className="space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Pacote Básico
                </span>
                <div className="space-y-1">
                  <div className="text-3xl font-bold text-stone-900">R$ 50,00</div>
                  <p className="text-xs text-stone-500">Ideal para consultas esporádicas</p>
                </div>
                <ul className="space-y-2.5 text-xs text-stone-600 border-t border-stone-100 pt-4">
                  <li className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span><strong>333 pesquisas forenses</strong> incluídas</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>Acesso a STF, STJ, TST e TJSP</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>Rastreabilidade com hash de integridade</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={() => handleOpenCheckout('Pacote Básico', 5000, 0, 333)}
                className="w-full py-3 rounded-xl border border-champagne-border bg-[#FDFBF7] hover:bg-cognac-50 hover:border-cognac-400 text-stone-800 hover:text-cognac-900 font-semibold text-xs shadow-sm transition-all"
              >
                Recarregar R$ 50,00
              </button>
            </div>

            {/* TIER 2: R$ 100 (POPULAR) */}
            <div className="champagne-card p-6 rounded-2xl bg-white shadow-card flex flex-col justify-between space-y-6 border-2 border-cognac-600 relative transition-all">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-cognac-700 text-white text-[10px] font-bold uppercase tracking-widest shadow-sm">
                Mais Escolhido
              </div>

              <div className="space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-cognac-700">
                  Pacote Estratégico
                </span>
                <div className="space-y-1">
                  <div className="flex items-baseline space-x-2">
                    <span className="text-3xl font-bold text-stone-900">R$ 100,00</span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      + R$ 10 Bônus
                    </span>
                  </div>
                  <p className="text-xs text-stone-500">Para advogados com volume semanal</p>
                </div>
                <ul className="space-y-2.5 text-xs text-stone-600 border-t border-stone-100 pt-4">
                  <li className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span><strong>733 pesquisas forenses</strong> (R$ 110 de saldo)</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>Prioridade na fila de inferência</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>Integração com Claude Desktop via MCP</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={() => handleOpenCheckout('Pacote Estratégico', 10000, 1000, 733)}
                className="w-full py-3 rounded-xl bg-cognac-700 hover:bg-cognac-800 text-white font-semibold text-xs shadow-md shadow-cognac-900/10 transition-all"
              >
                Recarregar R$ 100,00
              </button>
            </div>

            {/* TIER 3: R$ 200 */}
            <div className="champagne-card p-6 rounded-2xl bg-white shadow-card flex flex-col justify-between space-y-6 hover:border-cognac-400 transition-all">
              <div className="space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Pacote Banca / Escritório
                </span>
                <div className="space-y-1">
                  <div className="flex items-baseline space-x-2">
                    <span className="text-3xl font-bold text-stone-900">R$ 200,00</span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      + R$ 30 Bônus
                    </span>
                  </div>
                  <p className="text-xs text-stone-500">Para departamentos jurídicos e bancas</p>
                </div>
                <ul className="space-y-2.5 text-xs text-stone-600 border-t border-stone-100 pt-4">
                  <li className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span><strong>1.533 pesquisas forenses</strong> (R$ 230 de saldo)</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>Múltiplas chaves de API para a equipe</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>Relatório contábil consolidado mensal</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={() => handleOpenCheckout('Pacote Banca', 20000, 3000, 1533)}
                className="w-full py-3 rounded-xl border border-champagne-border bg-[#FDFBF7] hover:bg-cognac-50 hover:border-cognac-400 text-stone-800 hover:text-cognac-900 font-semibold text-xs shadow-sm transition-all"
              >
                Recarregar R$ 200,00
              </button>
            </div>

          </div>
        </div>

        {/* CHECKOUT MODAL */}
        {selectedPackage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="champagne-card bg-white w-full max-w-lg rounded-2xl p-6 sm:p-8 space-y-6">
              <div className="flex items-start justify-between border-b border-stone-100 pb-4">
                <div>
                  <h3 className="font-editorial text-xl font-bold text-stone-900">
                    Confirmar Recarga de Créditos
                  </h3>
                  <p className="text-xs text-stone-500">
                    {selectedPackage.name} • {selectedPackage.searches} consultas incluídas
                  </p>
                </div>
                <button
                  onClick={() => setSelectedPackage(null)}
                  className="w-8 h-8 rounded-lg bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-600 font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Order Summary */}
              <div className="p-4 rounded-xl bg-[#FDFBF7] border border-champagne-border space-y-2 text-xs">
                <div className="flex justify-between text-stone-600">
                  <span>Valor do Pacote:</span>
                  <span className="font-bold text-stone-900">{formatCurrency(selectedPackage.paidCents)}</span>
                </div>
                {selectedPackage.promoCents > 0 && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Bônus Promocional Gratuito:</span>
                    <span>+{formatCurrency(selectedPackage.promoCents)}</span>
                  </div>
                )}
                <div className="flex justify-between text-stone-900 font-bold text-sm border-t border-stone-200 pt-2">
                  <span>Saldo a Creditar:</span>
                  <span className="text-cognac-800">{formatCurrency(selectedPackage.paidCents + selectedPackage.promoCents)}</span>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-stone-700">Forma de Pagamento</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('PIX')}
                    className={`p-3 rounded-xl border flex items-center justify-center space-x-2 text-xs font-semibold ${
                      paymentMethod === 'PIX'
                        ? 'border-cognac-600 bg-cognac-50 text-cognac-900'
                        : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    <QrCode className="w-4 h-4" />
                    <span>PIX Instantâneo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('CREDIT_CARD')}
                    className={`p-3 rounded-xl border flex items-center justify-center space-x-2 text-xs font-semibold ${
                      paymentMethod === 'CREDIT_CARD'
                        ? 'border-cognac-600 bg-cognac-50 text-cognac-900'
                        : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Cartão de Crédito</span>
                  </button>
                </div>
              </div>

              {/* PIX Simulated QR */}
              {paymentMethod === 'PIX' && (
                <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-center space-y-3">
                  <div className="w-32 h-32 bg-white border border-stone-300 mx-auto rounded-lg flex items-center justify-center shadow-inner">
                    <QrCode className="w-24 h-24 text-stone-800" />
                  </div>
                  <div className="text-[11px] text-stone-500">
                    Escaneie o QR Code ou copie o código PIX abaixo:
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyPix}
                    className="w-full py-2 px-3 rounded-lg bg-white border border-stone-300 hover:bg-stone-100 text-stone-700 text-xs font-semibold flex items-center justify-center space-x-1.5"
                  >
                    {copiedPix ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedPix ? 'Chave Copiada!' : 'Copiar Chave Copia-e-Cola'}</span>
                  </button>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setSelectedPackage(null)}
                  className="px-4 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-xs font-medium hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRecharge}
                  disabled={isProcessing}
                  className="px-6 py-2.5 rounded-xl bg-cognac-700 hover:bg-cognac-800 text-white text-xs font-semibold shadow-md flex items-center space-x-2"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Liquidando...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Confirmar e Creditar Saldo</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TRANSACTION LEDGER TABLE (Inspirado em ForgeLex_04_Creditos.png) */}
        <div className="champagne-card p-6 sm:p-8 rounded-2xl bg-white shadow-card space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-4">
            <div>
              <h3 className="font-editorial text-xl font-bold text-stone-900">
                Extrato do Ledger Contábil
              </h3>
              <p className="text-xs text-stone-500">
                Histórico imutável de créditos, débitos forenses e chaves de idempotência.
              </p>
            </div>
            <span className="text-xs font-mono text-stone-400">
              {transactions.length} registros liquidados
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FDFBF7] text-stone-500 font-semibold border-b border-champagne-border">
                <tr>
                  <th className="py-3 px-4">Data / Hora</th>
                  <th className="py-3 px-4">Descrição da Operação</th>
                  <th className="py-3 px-4">Carteira</th>
                  <th className="py-3 px-4">Idempotency Key</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-stone-500 whitespace-nowrap">
                      {tx.date}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-stone-800">
                      {tx.description}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        tx.wallet === 'PROMOTIONAL' ? 'bg-amber-100 text-amber-800' :
                        tx.wallet === 'SPLIT' ? 'bg-purple-100 text-purple-800' :
                        'bg-stone-100 text-stone-700'
                      }`}>
                        {tx.wallet}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-stone-400">
                      {tx.idempotencyKey}
                    </td>
                    <td className={`py-3.5 px-4 text-right font-bold whitespace-nowrap ${
                      tx.type === 'CREDIT' ? 'text-emerald-600' : 'text-stone-800'
                    }`}>
                      {tx.type === 'CREDIT' ? '+' : '-'}{formatCurrency(tx.amountCents)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};
