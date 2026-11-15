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
  generateCajuPayPixCharge,
  checkCajuPayPaymentStatus,
  simulateCajuPayWebhookConfirmation,
  creditWalletDepositInSupabase,
  subscribeToUserWalletRealtime,
  CajuPayPixChargeResponse,
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

  const refreshWalletFromSupabase = React.useCallback(async () => {
    try {
      const cached = await getOfflineWallet();
      const initialTx = cached?.transactions?.length ? cached.transactions : [];
      if (cached?.transactions?.length) {
        setTransactions(cached.transactions);
      }
      const summary = await fetchWalletDashboardFromSupabase({
        user,
        localMatches: matches,
        localTransactions: initialTx,
      });
      setTransactions(summary.transactions);
      setIsSupabaseSynced(summary.syncedFromSupabase);
      if (
        summary.syncedFromSupabase &&
        (summary.walletBalance !== user.walletBalance ||
          summary.cashbackBalance !== user.cashbackBalance)
      ) {
        onUpdateBalance(summary.walletBalance, summary.cashbackBalance);
      }
    } catch (e) {
      console.warn('[Wallet Supabase Sync Error]', e);
    } finally {
      setIsLoadingWallet(false);
    }
  }, [user.id, matches.length]);

  // Carregar extrato offline e sincronizar automaticamente com as tabelas de carteira do Supabase
  React.useEffect(() => {
    setIsLoadingWallet(true);
    refreshWalletFromSupabase();

    const unsubscribe = subscribeToUserWalletRealtime(user.id, () => {
      refreshWalletFromSupabase();
    });

    return () => {
      unsubscribe();
    };
  }, [user.id, matches.length, refreshWalletFromSupabase]);

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

  // Deposit form state (CajuPay Pix Real Integration)
  const [depositAmount, setDepositAmount] = useState('25.00');
  const [cajuPixCharge, setCajuPixCharge] = useState<CajuPayPixChargeResponse | null>(null);
  const [isGeneratingPix, setIsGeneratingPix] = useState(false);
  const [pixGenerationError, setPixGenerationError] = useState('');
  const [hasCopiedPix, setHasCopiedPix] = useState(false);
  const [isConfirmingDeposit, setIsConfirmingDeposit] = useState(false);
  const [depositSuccessInfo, setDepositSuccessInfo] = useState<{
    amount: number;
    receiptCode: string;
    syncedToSupabase: boolean;
    errorMessage?: string;
  } | null>(null);
  const [pixCountdown, setPixCountdown] = useState(900);
  const processedPaymentIdsRef = React.useRef<Set<string>>(new Set());

  const requestCajuPayPix = React.useCallback(
    async (amountStr: string) => {
      const numericAmount = parseFloat(amountStr.replace(',', '.'));
      if (isNaN(numericAmount) || numericAmount <= 0) return;

      setIsGeneratingPix(true);
      setPixGenerationError('');
      setCajuPixCharge(null);
      setHasCopiedPix(false);
      setDepositSuccessInfo(null);

      try {
        const charge = await generateCajuPayPixCharge({
          amount: numericAmount,
          userId: user.id,
          type: 'wallet_deposit',
          description: `Recarga Carteira Digital ParedãoGK - R$ ${numericAmount.toFixed(2)}`,
          customer: {
            name: user.name,
            email: user.email,
            cpf: user.cpf,
            phone: user.phone,
          },
        });
        setCajuPixCharge(charge);
        setPixCountdown(900);
      } catch (err: any) {
        console.warn('[WalletTab CajuPay QR Fallback]', err);
        setCajuPixCharge(null);
        const detail = err?.message ? ` (${err.message})` : '';
        setPixGenerationError(
          `Não foi possível gerar o QR Code dinâmico na API do CajuPay no momento${detail}. Você pode tentar novamente ou clicar em "Simular Pagamento Pix Realizado" abaixo para homologação imediata.`
        );
      } finally {
        setIsGeneratingPix(false);
      }
    },
    [user.id, user.name, user.email, user.cpf, user.phone]
  );

  const finalizeConfirmedPixDeposit = React.useCallback(
    async (params: { paymentId: string; amount: number; receiptCode: string }) => {
      if (processedPaymentIdsRef.current.has(params.paymentId)) return;
      processedPaymentIdsRef.current.add(params.paymentId);

      const creditRes = await creditWalletDepositInSupabase({
        userId: user.id,
        paymentId: params.paymentId,
        amount: params.amount,
        receiptCode: params.receiptCode,
        description: 'Recarga Pix CajuPay Instantânea',
        fallbackCurrentBalance: user.walletBalance,
      });

      setTransactions((prev) => {
        if (prev.some((tx) => tx.id === creditRes.transaction.id)) return prev;
        return [creditRes.transaction, ...prev];
      });
      onUpdateBalance(creditRes.newWalletBalance, user.cashbackBalance);
      setDepositSuccessInfo({
        amount: params.amount,
        receiptCode: params.receiptCode,
        syncedToSupabase: creditRes.synced,
        errorMessage: creditRes.errorMessage,
      });
    },
    [user.id, user.walletBalance, user.cashbackBalance, onUpdateBalance]
  );

  // Gerar cobrança Pix no CajuPay automaticamente ao abrir o modal
  React.useEffect(() => {
    if (!isDepositModalOpen) return;
    requestCajuPayPix(depositAmount);
  }, [isDepositModalOpen]);

  // Countdown de expiração do QR Code + Polling de confirmação do webhook /api/webhook-caju
  React.useEffect(() => {
    if (!isDepositModalOpen || !cajuPixCharge || depositSuccessInfo) return;

    const timer = setInterval(() => {
      setPixCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    const poller = setInterval(async () => {
      const statusRes = await checkCajuPayPaymentStatus(cajuPixCharge.id);
      if (statusRes.status === 'completed') {
        await finalizeConfirmedPixDeposit({
          paymentId: cajuPixCharge.id,
          amount: cajuPixCharge.amount,
          receiptCode: statusRes.receiptCode || generateReceiptCode(),
        });
      }
    }, 3000);

    return () => {
      clearInterval(timer);
      clearInterval(poller);
    };
  }, [isDepositModalOpen, cajuPixCharge, depositSuccessInfo, finalizeConfirmedPixDeposit]);

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

  // Handle Homologation / Webhook Deposit Confirmation
  const handleConfirmDeposit = async () => {
    const amountNum = parseFloat(depositAmount.replace(',', '.'));
    if (isNaN(amountNum) || amountNum <= 0) return;

    setIsConfirmingDeposit(true);
    setPixGenerationError('');

    const activeChargeId = cajuPixCharge?.id || `caju_homolog_${Date.now()}`;

    try {
      let resolvedPaymentId = activeChargeId;
      let resolvedAmount = amountNum;
      let resolvedReceiptCode = generateReceiptCode();

      try {
        const simResult = await simulateCajuPayWebhookConfirmation({
          paymentId: activeChargeId,
          amount: amountNum,
          userId: user.id,
          description: `Recarga Carteira Digital ParedãoGK - R$ ${amountNum.toFixed(2)}`,
        });
        resolvedPaymentId = simResult.paymentId || activeChargeId;
        resolvedAmount = simResult.amount || amountNum;
        resolvedReceiptCode = simResult.receiptCode || resolvedReceiptCode;
      } catch (webhookErr: any) {
        // Fallback direto de homologação para creditar no Supabase mesmo se o endpoint /api/* retornar vazio ou offline
        console.warn('[WalletTab Webhook Simulation Fallback]', webhookErr?.message || webhookErr);
      }

      await finalizeConfirmedPixDeposit({
        paymentId: resolvedPaymentId,
        amount: resolvedAmount,
        receiptCode: resolvedReceiptCode,
      });
    } catch (err: any) {
      console.error('[WalletTab Deposit Confirmation Error]', err);
      setPixGenerationError(
        err?.message || 'Não foi possível concluir o crédito de homologação. Tente novamente.'
      );
    } finally {
      setIsConfirmingDeposit(false);
    }
  };

  const copyPixCode = () => {
    if (!cajuPixCharge?.qrCodeText) return;
    navigator.clipboard?.writeText(cajuPixCharge.qrCodeText);
    setHasCopiedPix(true);
    setTimeout(() => setHasCopiedPix(false), 2000);
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
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

      {/* Deposit Modal (CajuPay Pix Dinâmico + Copia e Cola + Persistência Supabase) */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 text-center my-6"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <QrCode className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                Adicionar Saldo via Pix
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsDepositModalOpen(false);
                  setDepositSuccessInfo(null);
                }}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {depositSuccessInfo ? (
              <div className="py-5 space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/15 dark:bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mx-auto">
                  <Check className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="font-bold text-lg text-slate-900 dark:text-white">
                    Pix CajuPay Confirmado!
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                    Crédito de{' '}
                    <strong className="text-emerald-600 dark:text-[#22c55e] font-mono">
                      +{formatCurrency(depositSuccessInfo.amount)}
                    </strong>{' '}
                    adicionado à sua carteira digital.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono space-y-1">
                  <div className="text-emerald-700 dark:text-emerald-400 font-bold">
                    Comprovante: {depositSuccessInfo.receiptCode}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {depositSuccessInfo.syncedToSupabase
                      ? 'Saldo persistido permanentemente no Supabase (profiles + wallet_transactions).'
                      : depositSuccessInfo.errorMessage || 'Sincronizado localmente na sessão.'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsDepositModalOpen(false);
                    setDepositSuccessInfo(null);
                  }}
                  className="w-full h-11 rounded-xl bg-[#22c55e] hover:brightness-110 text-xs font-extrabold text-slate-950 cursor-pointer transition-all"
                >
                  Concluir
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Escolha o valor para gerar seu QR Code Pix dinâmico via CajuPay:
                </p>

                <div className="grid grid-cols-4 gap-2">
                  {['20.00', '25.00', '30.00', '50.00'].map((val) => (
                    <button
                      type="button"
                      key={val}
                      disabled={isGeneratingPix || isConfirmingDeposit}
                      onClick={() => {
                        setDepositAmount(val);
                        requestCajuPayPix(val);
                      }}
                      className={`py-2 text-xs rounded-xl border font-mono transition-all cursor-pointer disabled:opacity-60 ${
                        depositAmount === val
                          ? 'bg-emerald-500/15 dark:bg-emerald-500/20 border-emerald-500 dark:border-emerald-400 text-emerald-700 dark:text-emerald-300 font-bold'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      R$ {val}
                    </button>
                  ))}
                </div>

                {pixGenerationError && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-200 flex items-start justify-between gap-2 text-left">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{pixGenerationError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => requestCajuPayPix(depositAmount)}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 font-bold shrink-0 cursor-pointer transition-colors"
                    >
                      Tentar novamente
                    </button>
                  </div>
                )}

                {/* Provider & Expiration Strip */}
                {cajuPixCharge && (
                  <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-[#22c55e]" />
                      {cajuPixCharge.provider === 'cajupay'
                        ? 'CajuPay API Oficial'
                        : 'CajuPay Pix EMV (Homologação)'}
                    </span>
                    <span className="font-mono font-bold text-emerald-700 dark:text-[#22c55e]">
                      {formatCountdown(pixCountdown)}
                    </span>
                  </div>
                )}

                {/* Real Dynamic QR Code Container */}
                <div className="p-3 rounded-2xl bg-white border-2 border-slate-200 dark:border-slate-800 w-48 h-48 mx-auto flex items-center justify-center shadow-lg relative overflow-hidden">
                  {isGeneratingPix ? (
                    <div className="flex flex-col items-center gap-2 text-slate-600">
                      <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-[11px] font-mono font-semibold">Gerando Pix CajuPay...</span>
                    </div>
                  ) : cajuPixCharge?.qrCodeBase64 ? (
                    <img
                      src={cajuPixCharge.qrCodeBase64}
                      alt={`QR Code Pix CajuPay R$ ${depositAmount}`}
                      className="w-full h-full object-contain"
                    />
                  ) : pixGenerationError ? (
                    <div className="flex flex-col items-center justify-center gap-2 text-slate-700 p-3 text-center">
                      <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600">
                        <QrCode className="w-6 h-6" />
                      </div>
                      <span className="text-[11px] font-bold text-slate-800 leading-tight">
                        API Pix indisponível
                      </span>
                      <span className="text-[10px] text-slate-500 leading-snug">
                        Homologação liberada no botão abaixo
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 font-mono p-3">
                      Selecione um valor acima para gerar o QR Code Pix
                    </div>
                  )}
                </div>

                {/* Pix Copia e Cola Code */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-left gap-2">
                  <div className="truncate text-slate-600 dark:text-slate-400 text-[11px] font-mono select-all flex-1">
                    {isGeneratingPix
                      ? 'Gerando código Pix Copia e Cola...'
                      : cajuPixCharge?.qrCodeText || 'Modo homologação ativo (sem QR externo)'}
                  </div>
                  <button
                    type="button"
                    disabled={isGeneratingPix || !cajuPixCharge?.qrCodeText}
                    onClick={copyPixCode}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0 transition-colors cursor-pointer disabled:opacity-50 ${
                      hasCopiedPix
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {hasCopiedPix ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{hasCopiedPix ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>

                {cajuPixCharge && (
                  <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-ping" />
                    <span>Aguardando confirmação automática do webhook CajuPay...</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleConfirmDeposit}
                  disabled={isConfirmingDeposit || isGeneratingPix}
                  className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
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
              </>
            )}
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
