import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GkWalletPixIcon as Wallet,
  GkArrowUpRightIcon as ArrowUpRight,
  GkArrowDownLeftIcon as ArrowDownLeft,
  GkQrCodeIcon as QrCode,
  GkCopyIcon as Copy,
  GkCheckIcon as Check,
  GkShieldIcon as ShieldCheck,
  GkFlameIcon as Sparkles,
  GkTermsDocIcon as FileText,
  GkCheckCircleIcon as AlertCircle,
  GkCloseIcon as X,
  GkWalletPixIcon as CreditCard,
  GkTermsDocIcon as Receipt,
  GkCoinPixIcon
} from './icons';
import { UserProfile, Transaction, MatchBooking, WalletDashboardSummary } from '../types';
import { formatCurrency, generateReceiptCode, maskCPF } from '../utils/validations';
import { saveOfflineWallet, getOfflineWallet } from '../utils/offlineStorage';
import {
  fetchWalletDashboardFromSupabase,
  recordWalletTransactionInSupabase,
  registerAdminWithdrawalRequestLocal,
  isAuthorizedAdmin,
} from '../lib/supabaseClient';
import { EarningsDashboardSection } from './EarningsDashboardSection';
import { ReportScope } from '../utils/pdfReportGenerator';
import { getMatchGoalkeeperNetPayout } from '../utils/cachePricingAI';

interface WalletTabProps {
  user: UserProfile;
  matches?: MatchBooking[];
  theme?: 'dark' | 'light';
  onUpdateBalance: (newBalance: number, newCashback: number) => void;
  onOpenProfilePricing?: () => void;
  onOpenAdminFinancial?: () => void;
  onOpenPdfReport?: (params: {
    scope: ReportScope;
    walletSummary: WalletDashboardSummary;
    transactions: Transaction[];
  }) => void;
}

export const WalletTab: React.FC<WalletTabProps> = ({
  user,
  matches = [],
  theme = 'dark',
  onUpdateBalance,
  onOpenProfilePricing,
  onOpenAdminFinancial,
  onOpenPdfReport,
}) => {
  const [activeWalletView, setActiveWalletView] = useState<'earnings' | 'ledger'>('earnings');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [isLoadingWallet, setIsLoadingWallet] = useState(true);
  const [isSupabaseSynced, setIsSupabaseSynced] = useState(false);

  // Carregar extrato offline e sincronizar automaticamente com as tabelas de carteira do Supabase
  React.useEffect(() => {
    let isMounted = true;
    setIsLoadingWallet(true);

    getOfflineWallet()
      .then((cached) => {
        const initialTx = cached?.transactions?.length ? cached.transactions : [];
        if (isMounted && cached?.transactions?.length) {
          setTransactions(cached.transactions);
        }
        return fetchWalletDashboardFromSupabase({
          user,
          localMatches: matches,
          localTransactions: initialTx,
        });
      })
      .then((summary) => {
        if (!isMounted) return;
        setTransactions(summary.transactions);
        setIsSupabaseSynced(summary.syncedFromSupabase);
      })
      .catch((e) => console.warn('[Wallet Supabase Sync Error]', e))
      .finally(() => {
        if (isMounted) setIsLoadingWallet(false);
      });

    return () => {
      isMounted = false;
    };
  }, [user.id, matches.length]);

  // Salvar no armazenamento offline sempre que houver alteração
  React.useEffect(() => {
    saveOfflineWallet({
      balance: user.walletBalance,
      cashback: user.cashbackBalance,
      transactions,
    }).catch((e) => console.warn('[Offline Wallet Sync Error]', e));
  }, [user.walletBalance, user.cashbackBalance, transactions]);

  const dashboardSummary: WalletDashboardSummary = React.useMemo(() => {
    const completedMatches = matches.filter((m) => m.status === 'completed');
    const activeEscrowMatches = matches.filter(
      (m) => m.status === 'confirmed' || m.status === 'searching' || m.status === 'in_progress'
    );

    const matchCacheTxTotal = transactions
      .filter((t) => t.type === 'match_cache' && t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    const completedMatchesEarnings = completedMatches.reduce(
      (sum, m) => sum + getMatchGoalkeeperNetPayout(m),
      0
    );
    const totalMatchEarnings = Math.max(matchCacheTxTotal, completedMatchesEarnings);

    const escrowFromMatches = activeEscrowMatches.reduce(
      (sum, m) => sum + getMatchGoalkeeperNetPayout(m),
      0
    );
    const pendingCustodyBalance =
      user.pendingBalance > 0 ? user.pendingBalance : escrowFromMatches;

    const cashbackFromMatches = matches.reduce(
      (sum, m) => sum + Number(m.cashbackEarned || 0),
      0
    );
    const cashbackBalance = Math.max(user.cashbackBalance, cashbackFromMatches);

    const totalPixWithdrawn = transactions
      .filter((t) => t.type === 'pix_out')
      .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);

    return {
      walletBalance: user.walletBalance,
      pendingCustodyBalance,
      cashbackBalance,
      totalMatchEarnings,
      totalPixWithdrawn,
      transactions,
      syncedFromSupabase: isSupabaseSynced,
    };
  }, [user.walletBalance, user.pendingBalance, user.cashbackBalance, matches, transactions, isSupabaseSynced]);

  // Modals state
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Transaction | null>(null);

  // Withdraw form state
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [pixKeyType, setPixKeyType] = useState<'cpf' | 'phone' | 'email' | 'random'>('cpf');
  const [pixKey, setPixKey] = useState(maskCPF(user.cpf));
  const [isProcessingWithdraw, setIsProcessingWithdraw] = useState(false);
  const [withdrawSuccessCode, setWithdrawSuccessCode] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState('');

  // Deposit form state
  const [depositAmount, setDepositAmount] = useState('25.00');
  const [hasCopiedPix, setHasCopiedPix] = useState(false);
  const [isConfirmingDeposit, setIsConfirmingDeposit] = useState(false);

  // Handle Withdraw submission
  const handleWithdrawSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawError('');
    const amountNum = parseFloat(withdrawAmount.replace(',', '.'));

    if (isNaN(amountNum) || amountNum < 10) {
      setWithdrawError('O valor mínimo para saque via Pix é de R$ 10,00.');
      return;
    }

    if (amountNum > user.walletBalance) {
      setWithdrawError('Saldo insuficiente para realizar este saque.');
      return;
    }

    setIsProcessingWithdraw(true);

    setTimeout(() => {
      const code = generateReceiptCode();
      const newBalance = Number((user.walletBalance - amountNum).toFixed(2));
      const newTx: Transaction = {
        id: `tx-${Date.now()}`,
        type: 'pix_out',
        amount: -amountNum,
        description: `Saque Pix CajuPay (${pixKeyType.toUpperCase()})`,
        date: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
        status: 'processing',
        pixKey: pixKey,
        pixKeyType: pixKeyType,
        receiptCode: code,
        provider: 'cajupay',
      };

      setTransactions((prev) => [newTx, ...prev]);
      registerAdminWithdrawalRequestLocal({ transaction: newTx, user });
      onUpdateBalance(newBalance, user.cashbackBalance);
      recordWalletTransactionInSupabase({
        userId: user.id,
        transaction: newTx,
        newWalletBalance: newBalance,
        newCashbackBalance: user.cashbackBalance,
      }).catch((e) => console.warn('[Withdraw Supabase Sync]', e));

      setIsProcessingWithdraw(false);
      setWithdrawSuccessCode(code);
    }, 700);
  };

  // Handle Deposit confirmation
  const handleConfirmDeposit = () => {
    const amountNum = parseFloat(depositAmount.replace(',', '.'));
    if (isNaN(amountNum) || amountNum <= 0) return;

    setIsConfirmingDeposit(true);
    setTimeout(() => {
      const code = generateReceiptCode();
      const newBalance = Number((user.walletBalance + amountNum).toFixed(2));
      const newTx: Transaction = {
        id: `tx-${Date.now()}`,
        type: 'pix_in',
        amount: amountNum,
        description: 'Recarga Pix CajuPay Instantânea',
        date: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
        status: 'completed',
        receiptCode: code,
        provider: 'cajupay',
      };

      setTransactions((prev) => [newTx, ...prev]);
      onUpdateBalance(newBalance, user.cashbackBalance);
      recordWalletTransactionInSupabase({
        userId: user.id,
        transaction: newTx,
        newWalletBalance: newBalance,
        newCashbackBalance: user.cashbackBalance,
      }).catch((e) => console.warn('[Deposit Supabase Sync]', e));

      setIsConfirmingDeposit(false);
      setIsDepositModalOpen(false);
    }, 900);
  };

  const copyPixCode = () => {
    const formattedAmt = Number(depositAmount || 25).toFixed(2);
    navigator.clipboard?.writeText(
      `00020126580014br.gov.bcb.pix0136paredaogkbr@gmail.com5204000053039865405${formattedAmt}5802BR5925PAREDAO GK GESTAO ESPORT6008ITAPEVA62070503***6304E8A1`
    );
    setHasCopiedPix(true);
    setTimeout(() => setHasCopiedPix(false), 2000);
  };

  const filteredTransactions = transactions.filter((t) => {
    if (filterType === 'in') return t.amount > 0;
    if (filterType === 'out') return t.amount < 0;
    if (filterType === 'cashback') return t.type === 'cashback_credit';
    return true;
  });

  return (
    <div className="space-y-6 pb-24 max-w-5xl mx-auto">
      {/* Wallet Card */}
      <div className="relative p-6 sm:p-7 rounded-3xl bg-gradient-to-br from-white via-white to-slate-50 dark:from-[#020617] dark:via-slate-900 dark:to-[#020617] border border-slate-200 dark:border-slate-800 shadow-lg dark:shadow-2xl overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                <Wallet className="w-4 h-4 text-emerald-600 dark:text-[#22c55e]" />
                <span>Carteira Digital CajuPay · ParedãoGK</span>
              </div>
              <div className="font-mono tabular-nums text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {formatCurrency(user.walletBalance)}
              </div>
            </div>

            {/* Quick Actions: Saque Pix & Adicionar Saldo */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setWithdrawSuccessCode(null);
                  setWithdrawAmount('');
                  setWithdrawError('');
                  setIsWithdrawModalOpen(true);
                }}
                className="h-11 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              >
                <GkCoinPixIcon className="w-4 h-4 text-sky-600 dark:text-[#38bdf8]" />
                <span>Sacar via Pix</span>
              </button>

              <button
                type="button"
                onClick={() => setIsDepositModalOpen(true)}
                className="h-11 px-4 rounded-xl bg-[#22c55e] hover:brightness-110 text-xs font-extrabold text-slate-950 flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
              >
                <ArrowDownLeft className="w-4 h-4" />
                <span>Adicionar Saldo</span>
              </button>

              {onOpenAdminFinancial && isAuthorizedAdmin(user) && (
                <button
                  type="button"
                  onClick={onOpenAdminFinancial}
                  className="h-11 px-4 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-700 dark:text-[#38bdf8] text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Admin Pix & Webhooks</span>
                </button>
              )}
            </div>
          </div>

          {/* Sub-metrics + Sub-View Segmented Switcher */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Cashback Acumulado: </span>
                <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-[#22c55e]">
                  +{formatCurrency(dashboardSummary.cashbackBalance)}
                </span>
              </div>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Custódia CajuPay: </span>
                <span className="font-mono tabular-nums font-bold text-sky-600 dark:text-[#38bdf8]">
                  {formatCurrency(dashboardSummary.pendingCustodyBalance)}
                </span>
              </div>
            </div>

            <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 self-start md:self-auto">
              <button
                type="button"
                onClick={() => setActiveWalletView('earnings')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  activeWalletView === 'earnings'
                    ? 'bg-[#22c55e] text-slate-950 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Dashboard de Ganhos
              </button>
              <button
                type="button"
                onClick={() => setActiveWalletView('ledger')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  activeWalletView === 'ledger'
                    ? 'bg-[#38bdf8] text-slate-950 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Extrato Completo ({transactions.length})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Seção 1: Dashboard de Ganhos (Gráficos Recharts, Custódia e Saques Pix CajuPay) */}
      {activeWalletView === 'earnings' && (
        <EarningsDashboardSection
          user={user}
          matches={matches}
          summary={dashboardSummary}
          isLoading={isLoadingWallet}
          theme={theme}
          onOpenWithdrawModal={() => {
            setWithdrawSuccessCode(null);
            setWithdrawAmount('');
            setWithdrawError('');
            setIsWithdrawModalOpen(true);
          }}
          onOpenProfilePricing={onOpenProfilePricing}
          onSelectReceipt={(tx) => setSelectedReceipt(tx)}
          onExportPdf={
            onOpenPdfReport
              ? () =>
                  onOpenPdfReport({
                    scope: 'financeiro',
                    walletSummary: dashboardSummary,
                    transactions,
                  })
              : undefined
          }
        />
      )}

      {/* Seção 2: Extrato Completo e Operações Pix */}
      {activeWalletView === 'ledger' && (
        <>
          {/* Pix Security Trust Badge */}
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                <strong>Pix Instantâneo 24/7 via CajuPay:</strong> Saques e depósitos processados sem taxa bancária.
              </span>
            </div>
            <span className="font-mono font-bold text-[11px] text-emerald-700 dark:text-emerald-400 hidden sm:inline">
              TAXA R$ 0,00
            </span>
          </div>

          {/* Transactions History Header & Filters */}
          <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
              Extrato Detalhado de Transações
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Cachês de partidas, comissões, recargas e saques
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenPdfReport && (
              <button
                type="button"
                onClick={() =>
                  onOpenPdfReport({
                    scope: 'financeiro',
                    walletSummary: dashboardSummary,
                    transactions,
                  })
                }
                className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 dark:border-[#38bdf8]/40 text-sky-700 dark:text-[#38bdf8] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Exportar PDF CajuPay</span>
              </button>
            )}

            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none">
              {[
                { id: 'all', label: 'Todas' },
                { id: 'in', label: 'Entradas' },
                { id: 'out', label: 'Saídas' },
                { id: 'cashback', label: 'Cashback' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterType(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    filterType === tab.id
                      ? 'bg-slate-900 text-white dark:bg-slate-800 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Transaction Items */}
        <div className="space-y-2.5">
          {filteredTransactions.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-slate-500 text-xs space-y-1.5 shadow-sm dark:shadow-none">
              <p className="text-slate-800 dark:text-slate-300 font-semibold text-sm">Nenhuma movimentação registrada</p>
              <p className="text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
                Seu saldo disponível e cashback começam em R$ 0,00. Faça uma recarga via Pix ou dispute partidas para movimentar sua carteira.
              </p>
            </div>
          ) : (
            filteredTransactions.map((tx) => {
              const isPositive = tx.amount > 0;
              return (
                <div
                  key={tx.id}
                  onClick={() => setSelectedReceipt(tx)}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm dark:shadow-none transition-all flex items-center justify-between cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                        isPositive
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                          : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {isPositive ? (
                        <ArrowDownLeft className="w-5 h-5" />
                      ) : (
                        <ArrowUpRight className="w-5 h-5" />
                      )}
                    </div>

                    <div>
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors">
                        {tx.description}
                      </h4>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        {tx.date} · Cód: {tx.receiptCode}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`font-mono font-bold text-sm block ${
                        isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {isPositive ? '+' : ''}
                      {formatCurrency(tx.amount)}
                    </span>
                    <span
                      className={`text-[10px] font-semibold uppercase ${
                        tx.status === 'completed'
                          ? 'text-emerald-600 dark:text-emerald-500/80'
                          : tx.status === 'rejected' || tx.status === 'cancelled'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {tx.status === 'completed'
                        ? 'Aprovado / Pago'
                        : tx.status === 'rejected' || tx.status === 'cancelled'
                        ? 'Rejeitado'
                        : 'Pendente'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
          </div>
        </div>
        </>
      )}

      {/* Withdraw Modal */}
      {isWithdrawModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                Solicitar Saque Instantâneo via Pix
              </h3>
              <button
                onClick={() => setIsWithdrawModalOpen(false)}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {withdrawSuccessCode ? (
              <div className="text-center py-6 space-y-3">
                <div className="w-16 h-16 rounded-full bg-emerald-500/15 dark:bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mx-auto">
                  <Check className="w-8 h-8" />
                </div>
                <h4 className="font-bold text-lg text-slate-900 dark:text-white">Solicitação de Saque Enviada!</h4>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Seu pedido foi registrado na fila CajuPay e está aguardando autorização e emissão do comprovante administrativo.
                </p>
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-950 font-mono text-xs text-emerald-700 dark:text-emerald-400">
                  Comprovante: {withdrawSuccessCode}
                </div>
                <button
                  onClick={() => setIsWithdrawModalOpen(false)}
                  className="w-full h-11 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-bold text-slate-900 dark:text-white mt-2 cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <form onSubmit={handleWithdrawSubmit} className="space-y-4">
                {withdrawError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
                    <span>{withdrawError}</span>
                  </div>
                )}

                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    <span>Valor do Saque (R$)</span>
                    <span className="text-slate-500 font-mono">
                      Disponível: {formatCurrency(user.walletBalance)}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="10"
                    max={user.walletBalance}
                    required
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="Min. R$ 10,00"
                    className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Tipo de Chave Pix
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['cpf', 'phone', 'email', 'random'] as const).map((type) => (
                      <button
                        type="button"
                        key={type}
                        onClick={() => {
                          setPixKeyType(type);
                          if (type === 'cpf') setPixKey(maskCPF(user.cpf));
                          else if (type === 'phone') setPixKey(user.phone);
                          else if (type === 'email') setPixKey(user.email);
                          else setPixKey('e7a892b4-5310-4f9e-bc21-88902c3d4e5f');
                        }}
                        className={`py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                          pixKeyType === type
                            ? 'bg-sky-500/15 dark:bg-sky-500/20 border-sky-500 dark:border-sky-400 text-sky-700 dark:text-sky-300 font-bold'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {type.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Chave Pix de Destino
                  </label>
                  <input
                    type="text"
                    required
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>Taxa de Saque Pix:</span>
                    <strong className="text-emerald-600 dark:text-emerald-400 font-mono">Grátis (R$ 0,00)</strong>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>Tempo Estimado:</span>
                    <span className="text-slate-800 dark:text-slate-300">Instantâneo (até 5 segundos)</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isProcessingWithdraw}
                  className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isProcessingWithdraw ? (
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Confirmar Saque Pix</span>
                      <ArrowUpRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}
          </motion.div>
        </div>
      )}

      {/* Deposit Modal (Pix Copia e Cola / QR Code) */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 text-center"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <QrCode className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                Adicionar Saldo via Pix
              </h3>
              <button
                onClick={() => setIsDepositModalOpen(false)}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              Escolha o valor para recarregar sua carteira com liberação imediata:
            </p>

            <div className="grid grid-cols-4 gap-2">
              {['20.00', '25.00', '30.00', '50.00'].map((val) => (
                <button
                  type="button"
                  key={val}
                  onClick={() => setDepositAmount(val)}
                  className={`py-2 text-xs rounded-xl border font-mono transition-all cursor-pointer ${
                    depositAmount === val
                      ? 'bg-emerald-500/15 dark:bg-emerald-500/20 border-emerald-500 dark:border-emerald-400 text-emerald-700 dark:text-emerald-300 font-bold'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  R$ {val}
                </button>
              ))}
            </div>

            {/* Simulated QR Code Canvas */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200 w-48 h-48 mx-auto flex items-center justify-center shadow-lg relative">
              <div className="w-full h-full border-4 border-slate-950 p-2 flex flex-col justify-between">
                <div className="flex justify-between">
                  <div className="w-8 h-8 bg-black rounded" />
                  <div className="w-8 h-8 bg-black rounded" />
                </div>
                <div className="text-center font-mono font-bold text-[10px] text-black">
                  PIX PAREDÃOGK<br/>R$ {depositAmount}
                </div>
                <div className="flex justify-between">
                  <div className="w-8 h-8 bg-black rounded" />
                  <div className="w-4 h-4 bg-emerald-600 rounded-full mx-auto self-center" />
                  <div className="w-8 h-8 bg-black rounded" />
                </div>
              </div>
            </div>

            {/* Pix Copia e Cola Code */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-left">
              <div className="truncate text-slate-600 dark:text-slate-400 text-[11px] font-mono pr-2">
                00020126580014br.gov.bcb.pix0136arenadraft...
              </div>
              <button
                type="button"
                onClick={copyPixCode}
                className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
              >
                {hasCopiedPix ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{hasCopiedPix ? 'Copiado!' : 'Copiar'}</span>
              </button>
            </div>

            <button
              onClick={handleConfirmDeposit}
              disabled={isConfirmingDeposit}
              className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
            >
              {isConfirmingDeposit ? (
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Simular Pagamento Pix Realizado (+R$ {depositAmount})</span>
                </>
              )}
            </button>
          </motion.div>
        </div>
      )}

      {/* Transaction Receipt Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Comprovante de Transação
              </h4>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 text-center">
                <span className="text-slate-500 block text-[10px]">Valor da Operação:</span>
                <span className="font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(selectedReceipt.amount)}
                </span>
              </div>

              <div className="space-y-2 divide-y divide-slate-200 dark:divide-slate-800/60 pt-1">
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Descrição:</span>
                  <span className="font-semibold text-slate-900 dark:text-white text-right">{selectedReceipt.description}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Data e Hora:</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">{selectedReceipt.date}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Código de Autenticação:</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">{selectedReceipt.receiptCode}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Status:</span>
                  <span
                    className={`font-semibold ${
                      selectedReceipt.status === 'completed'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : selectedReceipt.status === 'rejected' || selectedReceipt.status === 'cancelled'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {selectedReceipt.status === 'completed'
                      ? 'Liquidado com Sucesso'
                      : selectedReceipt.status === 'rejected' || selectedReceipt.status === 'cancelled'
                      ? 'Rejeitado / Estornado'
                      : 'Pendente de Liberação Admin'}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedReceipt(null)}
              className="w-full h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-900 dark:text-white transition-colors cursor-pointer"
            >
              Fechar Comprovante
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};
