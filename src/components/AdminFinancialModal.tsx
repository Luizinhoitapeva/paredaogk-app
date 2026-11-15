import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GkCloseIcon as X,
  GkShieldCheckAdminIcon as AdminShield,
  GkBankTransferIcon as BankTransfer,
  GkWebhookIcon as Webhook,
  GkKeyLockIcon as KeyLock,
  GkReceiptCheckIcon as ReceiptCheck,
  GkCoinPixIcon,
  GkCheckCircleIcon as CheckCircle2,
  GkClockIcon as Clock,
  GkCopyIcon as Copy,
  GkCheckIcon as Check,
  GkSearchIcon as Search,
  GkRefreshIcon as RefreshCw,
  GkSosAlertIcon as AlertIcon,
} from './icons';
import {
  AdminPixWithdrawal,
  AdminPixWithdrawalStatus,
  CajuPayWebhookConfig,
  CajuPayWebhookEventType,
  CajuPayWebhookLog,
  UserProfile,
} from '../types';
import { formatCurrency } from '../utils/validations';
import {
  dispatchCajuPayWebhookTest,
  fetchAdminPixWithdrawalsFromSupabase,
  fetchCajuPayWebhookConfigAndLogs,
  isAuthorizedAdmin,
  processAdminPixWithdrawalInSupabase,
  saveCajuPayWebhookConfig,
  subscribeToAdminFinancialRealtime,
} from '../lib/supabaseClient';
import { Skeleton } from './SkeletonLoading';

interface AdminFinancialModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onWithdrawalsCountChange?: (pendingCount: number) => void;
}

const ADMIN_PASSCODE = 'PGK-ITAPEVA';

const WEBHOOK_EVENT_OPTIONS: {
  id: CajuPayWebhookEventType;
  label: string;
  description: string;
}[] = [
  {
    id: 'payment.confirmed',
    label: 'payment.confirmed',
    description: 'Pix do contratante liquidado e retido em custódia',
  },
  {
    id: 'custody.released',
    label: 'custody.released',
    description: 'Partida concluída e saldo líquido liberado ao goleiro',
  },
  {
    id: 'withdrawal.processed',
    label: 'withdrawal.processed',
    description: 'Saque Pix liquidado pelo Banco Central via CajuPay',
  },
  {
    id: 'withdrawal.rejected',
    label: 'withdrawal.rejected',
    description: 'Saque devolvido por divergência na chave Pix de destino',
  },
];

export const AdminFinancialModal: React.FC<AdminFinancialModalProps> = ({
  isOpen,
  onClose,
  user,
  onWithdrawalsCountChange,
}) => {
  const [activeTab, setActiveTab] = useState<'withdrawals' | 'webhooks'>('withdrawals');
  const [adminUnlockedByKey, setAdminUnlockedByKey] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState('');

  // Withdrawals state
  const [withdrawals, setWithdrawals] = useState<AdminPixWithdrawal[]>([]);
  const [isLoadingWithdrawals, setIsLoadingWithdrawals] = useState(false);
  const [isSyncedWithdrawals, setIsSyncedWithdrawals] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | AdminPixWithdrawalStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  const [receiptDraft, setReceiptDraft] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionDraft, setRejectionDraft] = useState('');
  const [actionBanner, setActionBanner] = useState<string | null>(null);

  // Webhooks state
  const defaultWebhookEndpoint =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/webhook-caju`
      : 'https://paredaogk.app/api/webhook-caju';
  const [webhookConfig, setWebhookConfig] = useState<CajuPayWebhookConfig>({
    id: 'cajupay-webhook-default',
    webhookUrl: defaultWebhookEndpoint,
    signingSecret: 'cwhsec_555f1354b2a2851360c50f9bccb3dc9a2d76d7aab72bd82d',
    isActive: true,
    subscribedEvents: [
      'payment.confirmed',
      'custody.released',
      'withdrawal.processed',
      'withdrawal.rejected',
    ],
    updatedAt: new Date().toISOString(),
  });
  const [webhookLogs, setWebhookLogs] = useState<CajuPayWebhookLog[]>([]);
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false);
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);
  const [isDispatchingTest, setIsDispatchingTest] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [testEvent, setTestEvent] = useState<CajuPayWebhookEventType>('payment.confirmed');
  const [testAmount, setTestAmount] = useState<20 | 25 | 30>(25);
  const [simulateInvalidSig, setSimulateInvalidSig] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const hasAdminAccess = isAuthorizedAdmin(user.email) || adminUnlockedByKey;

  const loadWithdrawals = async () => {
    setIsLoadingWithdrawals(true);
    try {
      const res = await fetchAdminPixWithdrawalsFromSupabase();
      setWithdrawals(res.withdrawals);
      setIsSyncedWithdrawals(res.syncedFromSupabase);
      const pendingCount = res.withdrawals.filter((w) => w.status === 'pending').length;
      onWithdrawalsCountChange?.(pendingCount);
    } finally {
      setIsLoadingWithdrawals(false);
    }
  };

  const loadWebhooks = async () => {
    setIsLoadingWebhooks(true);
    try {
      const res = await fetchCajuPayWebhookConfigAndLogs(defaultWebhookEndpoint);
      setWebhookConfig(res.config);
      setWebhookLogs(res.logs);
    } finally {
      setIsLoadingWebhooks(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !hasAdminAccess) return;

    loadWithdrawals();
    loadWebhooks();

    const unsubscribe = subscribeToAdminFinancialRealtime({
      onWithdrawalChange: () => {
        loadWithdrawals();
      },
      onWebhookLog: (newLog) => {
        setWebhookLogs((prev) => {
          if (prev.some((l) => l.id === newLog.id)) return prev;
          return [newLog, ...prev].slice(0, 80);
        });
      },
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen, hasAdminAccess]);

  const metrics = useMemo(() => {
    const pendingList = withdrawals.filter((w) => w.status === 'pending');
    const approvedList = withdrawals.filter((w) => w.status === 'approved');
    const rejectedList = withdrawals.filter((w) => w.status === 'rejected');

    return {
      pendingCount: pendingList.length,
      pendingNetTotal: pendingList.reduce((sum, w) => sum + w.netPayout, 0),
      approvedCount: approvedList.length,
      approvedNetTotal: approvedList.reduce((sum, w) => sum + w.netPayout, 0),
      houseFeesTotal: withdrawals
        .filter((w) => w.status !== 'rejected')
        .reduce((sum, w) => sum + w.houseFee, 0),
      rejectedCount: rejectedList.length,
    };
  }, [withdrawals]);

  const filteredWithdrawals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return withdrawals.filter((w) => {
      if (statusFilter !== 'all' && w.status !== statusFilter) return false;
      if (!q) return true;
      return (
        w.athleteName.toLowerCase().includes(q) ||
        (w.athleteEmail || '').toLowerCase().includes(q) ||
        w.pixKey.toLowerCase().includes(q) ||
        w.receiptCode.toLowerCase().includes(q)
      );
    });
  }, [withdrawals, statusFilter, searchQuery]);

  if (!isOpen) return null;

  const handleUnlockAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcodeInput.trim().toUpperCase() === ADMIN_PASSCODE) {
      setAdminUnlockedByKey(true);
      setPasscodeError('');
      setPasscodeInput('');
    } else {
      setPasscodeError('Chave administrativa inválida. Acesso restrito ao administrador.');
    }
  };

  const handleCopyText = (id: string, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1800);
  };

  const handleProcessWithdrawal = async (
    withdrawal: AdminPixWithdrawal,
    action: 'approve' | 'reject' | 'attach_receipt',
    customReceipt?: string,
    customReason?: string
  ) => {
    setProcessingId(withdrawal.id);
    setActionBanner(null);

    const { updated, syncedToSupabase } = await processAdminPixWithdrawalInSupabase({
      withdrawal,
      action,
      receiptCode: customReceipt,
      rejectionReason: customReason,
      adminEmail: user.email || 'admin@paredaogk.com.br',
    });

    setWithdrawals((prev) => {
      const next = prev.map((item) => (item.id === updated.id ? updated : item));
      onWithdrawalsCountChange?.(next.filter((w) => w.status === 'pending').length);
      return next;
    });

    setEditingReceiptId(null);
    setReceiptDraft('');
    setRejectingId(null);
    setRejectionDraft('');
    setProcessingId(null);

    const verb =
      action === 'reject'
        ? `Saque de ${updated.athleteName} rejeitado e estornado`
        : action === 'attach_receipt'
        ? `Comprovante ${updated.receiptCode} registrado para ${updated.athleteName}`
        : `Repasse Pix de ${formatCurrency(updated.netPayout)} autorizado para ${updated.athleteName}`;

    setActionBanner(
      `${verb}${syncedToSupabase ? ' · Sincronizado com Supabase.' : ' · Salvo localmente.'}`
    );
  };

  const handleToggleEventSubscription = (eventId: CajuPayWebhookEventType) => {
    setWebhookConfig((prev) => {
      const exists = prev.subscribedEvents.includes(eventId);
      const nextEvents = exists
        ? prev.subscribedEvents.filter((e) => e !== eventId)
        : [...prev.subscribedEvents, eventId];
      return { ...prev, subscribedEvents: nextEvents };
    });
  };

  const handleRotateSecret = () => {
    const chars = 'abcdef0123456789';
    let randomHex = '';
    for (let i = 0; i < 48; i++) {
      randomHex += chars[Math.floor(Math.random() * chars.length)];
    }
    setWebhookConfig((prev) => ({
      ...prev,
      signingSecret: `cwhsec_${randomHex}`,
    }));
    setShowSecret(true);
  };

  const handleSaveWebhookConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingWebhook(true);
    setActionBanner(null);

    const { config: saved, syncedToSupabase } = await saveCajuPayWebhookConfig({
      config: webhookConfig,
      adminEmail: user.email || 'admin@paredaogk.com.br',
    });

    setWebhookConfig(saved);
    setIsSavingWebhook(false);
    setActionBanner(
      `Configuração de Webhook CajuPay salva (${saved.isActive ? 'Endpoint Ativo' : 'Pausado'})${
        syncedToSupabase ? ' · Persistida no Supabase.' : ' · Aplicada no servidor.'
      }`
    );
  };

  const handleDispatchWebhookTest = async () => {
    setIsDispatchingTest(true);
    setActionBanner(null);

    const { log, syncedToSupabase } = await dispatchCajuPayWebhookTest({
      event: testEvent,
      webhookUrl: webhookConfig.webhookUrl,
      simulateInvalidSignature: simulateInvalidSig,
      customAmount: testAmount,
    });

    setWebhookLogs((prev) => [log, ...prev.filter((l) => l.id !== log.id)].slice(0, 80));
    setExpandedLogId(log.id);
    setIsDispatchingTest(false);
    setActionBanner(
      log.hmacValid
        ? `Payload ${log.event} entregue com HTTP ${log.httpStatus} · Assinatura HMAC-SHA256 validada${
            syncedToSupabase ? ' (Supabase log gravado).' : '.'
          }`
        : `Disparo ${log.event} bloqueado com HTTP ${log.httpStatus} pela verificação HMAC-SHA256.`
    );
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 dark:bg-black/90 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 10 }}
          transition={{ duration: 0.18 }}
          className="relative w-full max-w-5xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[94vh] overflow-hidden"
        >
          {/* Modal Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-600 dark:text-[#22c55e] shrink-0">
                <BankTransfer className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display font-extrabold text-base sm:text-lg text-slate-900 dark:text-white truncate">
                  Gestão Financeira CajuPay
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>Administração de Saques Pix & Webhooks</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-[11px] text-sky-600 dark:text-[#38bdf8]">
                    {user.email || 'Admin'}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar painel financeiro administrativo"
              className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {!hasAdminAccess ? (
            <div className="p-6 sm:p-10 space-y-5 overflow-y-auto text-center max-w-md mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-500 mx-auto">
                <AdminShield className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display font-extrabold text-base text-slate-900 dark:text-white">
                  Acesso Restrito ao Administrador
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  A liberação de saques Pix e o gerenciamento de chaves HMAC-SHA256 da CajuPay são restritos à administração oficial do ParedãoGK.
                </p>
              </div>

              <form onSubmit={handleUnlockAdmin} className="space-y-3 text-left">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Chave de Liberação Administrativa:
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={passcodeInput}
                    onChange={(e) => setPasscodeInput(e.target.value)}
                    placeholder="Digite a chave admin"
                    className="flex-1 h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-[#38bdf8] focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-4 h-11 rounded-xl bg-[#38bdf8] hover:bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Desbloquear
                  </button>
                </div>
                {passcodeError && (
                  <p className="text-[11px] text-red-500 font-medium">{passcodeError}</p>
                )}
              </form>
            </div>
          ) : (
            <>
              {/* Top Module Navigation Tabs */}
              <div className="px-4 sm:px-6 pt-3 pb-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#020617] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 gap-1 self-start">
                  <button
                    type="button"
                    onClick={() => setActiveTab('withdrawals')}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
                      activeTab === 'withdrawals'
                        ? 'bg-[#22c55e] text-slate-950 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <GkCoinPixIcon className="w-4 h-4" />
                    <span>Saques Pix ({withdrawals.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('webhooks')}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
                      activeTab === 'webhooks'
                        ? 'bg-[#38bdf8] text-slate-950 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Webhook className="w-4 h-4" />
                    <span>Webhooks CajuPay ({webhookLogs.length})</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <span>
                    {isSyncedWithdrawals ? 'Supabase conectado' : 'Sincronização híbrida'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">Taxa fixa casa: R$ 5,00</span>
                  <button
                    type="button"
                    onClick={() => (activeTab === 'withdrawals' ? loadWithdrawals() : loadWebhooks())}
                    className="ml-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-sky-500/40 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-sky-600 dark:text-[#38bdf8]" />
                    <span>Atualizar</span>
                  </button>
                </div>
              </div>

              {/* Action Feedback */}
              {actionBanner && (
                <div className="mx-4 sm:mx-6 mt-3 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/35 text-xs font-semibold text-emerald-700 dark:text-[#22c55e] flex items-center justify-between gap-3">
                  <span>{actionBanner}</span>
                  <button
                    type="button"
                    onClick={() => setActionBanner(null)}
                    className="text-[11px] underline cursor-pointer shrink-0"
                  >
                    Fechar
                  </button>
                </div>
              )}

              {/* Tab Content Viewport */}
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
                {activeTab === 'withdrawals' ? (
                  <>
                    {/* 4 KPI Summary Strip */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Pendentes a Repassar
                        </div>
                        <div className="font-mono tabular-nums text-lg font-extrabold text-amber-600 dark:text-amber-400 mt-0.5">
                          {formatCurrency(metrics.pendingNetTotal)}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                          {metrics.pendingCount} solicitação(ões)
                        </div>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Repasses Pagos (Líquido)
                        </div>
                        <div className="font-mono tabular-nums text-lg font-extrabold text-emerald-600 dark:text-[#22c55e] mt-0.5">
                          {formatCurrency(metrics.approvedNetTotal)}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                          {metrics.approvedCount} liquidado(s)
                        </div>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Taxa da Casa (R$ 5,00)
                        </div>
                        <div className="font-mono tabular-nums text-lg font-extrabold text-sky-600 dark:text-[#38bdf8] mt-0.5">
                          {formatCurrency(metrics.houseFeesTotal)}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Descontada na fonte
                        </div>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Pedidos Rejeitados
                        </div>
                        <div className="font-mono tabular-nums text-lg font-extrabold text-red-600 dark:text-red-400 mt-0.5">
                          {metrics.rejectedCount}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Saldo estornado ao atleta
                        </div>
                      </div>
                    </div>

                    {/* Filters & Search Bar */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 gap-1">
                        {[
                          { id: 'all', label: `Todos (${withdrawals.length})` },
                          { id: 'pending', label: `Pendentes (${metrics.pendingCount})` },
                          { id: 'approved', label: `Aprovados (${metrics.approvedCount})` },
                          { id: 'rejected', label: `Rejeitados (${metrics.rejectedCount})` },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setStatusFilter(tab.id as any)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                              statusFilter === tab.id
                                ? 'bg-slate-900 text-white dark:bg-slate-800 shadow-sm'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      <div className="relative flex-1 md:max-w-xs">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Buscar goleiro, chave Pix ou código..."
                          className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-[#38bdf8] focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Withdrawals List */}
                    {isLoadingWithdrawals ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map((idx) => (
                          <div
                            key={idx}
                            className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2.5"
                          >
                            <Skeleton className="w-48 h-4" rounded="rounded" />
                            <Skeleton className="w-full h-10" rounded="rounded-xl" />
                          </div>
                        ))}
                      </div>
                    ) : filteredWithdrawals.length === 0 ? (
                      <div className="p-10 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-center space-y-2">
                        <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-[#38bdf8] flex items-center justify-center mx-auto">
                          <GkCoinPixIcon className="w-6 h-6" />
                        </div>
                        <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
                          Nenhum pedido de saque Pix encontrado
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                          Quando os goleiros de Itapeva solicitarem saques via Pix na aba Carteira, os pedidos aparecerão aqui automaticamente para conferência da chave Pix, desconto da taxa fixa de R$ 5,00 e emissão do comprovante.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {filteredWithdrawals.map((w) => {
                          const isBusy = processingId === w.id;
                          const isEditingReceipt = editingReceiptId === w.id;
                          const isRejecting = rejectingId === w.id;

                          return (
                            <div
                              key={w.id}
                              className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-3"
                            >
                              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                {/* Athlete & Pix Key Info */}
                                <div className="space-y-1.5 min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h4 className="font-display font-bold text-sm text-slate-900 dark:text-white">
                                      {w.athleteName}
                                    </h4>
                                    {w.athleteEmail && (
                                      <>
                                        <span aria-hidden="true" className="text-slate-400">·</span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                          {w.athleteEmail}
                                        </span>
                                      </>
                                    )}
                                    <span aria-hidden="true" className="text-slate-400">·</span>
                                    <span className="inline-flex items-center gap-1 text-xs font-bold">
                                      {w.status === 'approved' ? (
                                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-[#22c55e]">
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                          Aprovado / Pago
                                        </span>
                                      ) : w.status === 'rejected' ? (
                                        <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                                          <AlertIcon className="w-3.5 h-3.5" />
                                          Rejeitado
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                          <Clock className="w-3.5 h-3.5" />
                                          Pendente
                                        </span>
                                      )}
                                    </span>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                    <span className="text-slate-500 dark:text-slate-400">
                                      Chave Pix ({w.pixKeyType.toUpperCase()}):
                                    </span>
                                    <code className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                                      {w.pixKey}
                                    </code>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyText(`pix-${w.id}`, w.pixKey)}
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-600 dark:text-[#38bdf8] hover:underline cursor-pointer"
                                    >
                                      {copiedId === `pix-${w.id}` ? (
                                        <>
                                          <Check className="w-3 h-3" />
                                          <span>Copiada</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3 h-3" />
                                          <span>Copiar chave</span>
                                        </>
                                      )}
                                    </button>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                    <span>Solicitado: {new Date(w.requestedAt).toLocaleString('pt-BR')}</span>
                                    <span aria-hidden="true">·</span>
                                    <span>Comprovante: {w.receiptCode}</span>
                                    {w.processedBy && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span>Por: {w.processedBy}</span>
                                      </>
                                    )}
                                  </div>

                                  {w.rejectionReason && (
                                    <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                                      Motivo da rejeição: {w.rejectionReason}
                                    </p>
                                  )}
                                </div>

                                {/* Net Payout Breakdown + Actions */}
                                <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-3 shrink-0 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-200 dark:border-slate-800">
                                  <div className="lg:text-right space-y-0.5">
                                    <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                      Bruto {formatCurrency(w.grossAmount)} − Taxa casa {formatCurrency(w.houseFee)}
                                    </div>
                                    <div className="font-mono tabular-nums text-base font-extrabold text-emerald-600 dark:text-[#22c55e]">
                                      Repasse líquido: {formatCurrency(w.netPayout)}
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    {w.status !== 'approved' && (
                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() => handleProcessWithdrawal(w, 'approve')}
                                        className="px-3.5 py-2 rounded-xl bg-[#22c55e] hover:brightness-110 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap shrink-0"
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        <span>Autorizar Pix</span>
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => {
                                        setRejectingId(null);
                                        setEditingReceiptId(isEditingReceipt ? null : w.id);
                                        setReceiptDraft(w.receiptCode);
                                      }}
                                      className="px-3 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/35 text-sky-700 dark:text-[#38bdf8] font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap shrink-0"
                                    >
                                      <ReceiptCheck className="w-3.5 h-3.5" />
                                      <span>Comprovante</span>
                                    </button>

                                    {w.status === 'pending' && (
                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() => {
                                          setEditingReceiptId(null);
                                          setRejectingId(isRejecting ? null : w.id);
                                          setRejectionDraft('');
                                        }}
                                        className="px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/35 text-red-600 dark:text-red-400 font-bold text-xs cursor-pointer transition-all whitespace-nowrap shrink-0"
                                      >
                                        Rejeitar
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Inline Receipt Editor */}
                              {isEditingReceipt && (
                                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                  <input
                                    type="text"
                                    value={receiptDraft}
                                    onChange={(e) => setReceiptDraft(e.target.value)}
                                    placeholder="Código EndToEnd / Comprovante CajuPay (ex: E004169682026...)"
                                    className="flex-1 h-10 px-3 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-900 dark:text-white focus:border-[#38bdf8] focus:outline-none"
                                  />
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={isBusy || !receiptDraft.trim()}
                                      onClick={() =>
                                        handleProcessWithdrawal(w, 'attach_receipt', receiptDraft)
                                      }
                                      className="px-4 h-10 rounded-xl bg-[#38bdf8] hover:brightness-110 disabled:opacity-50 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap shrink-0"
                                    >
                                      Salvar Comprovante & Marcar Pago
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingReceiptId(null)}
                                      className="px-3 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Inline Rejection Input */}
                              {isRejecting && (
                                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                  <input
                                    type="text"
                                    value={rejectionDraft}
                                    onChange={(e) => setRejectionDraft(e.target.value)}
                                    placeholder="Motivo da rejeição (o saldo será estornado ao goleiro)"
                                    className="flex-1 h-10 px-3 rounded-xl bg-white dark:bg-[#020617] border border-red-300 dark:border-red-500/40 text-xs text-slate-900 dark:text-white focus:border-red-500 focus:outline-none"
                                  />
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() =>
                                        handleProcessWithdrawal(
                                          w,
                                          'reject',
                                          undefined,
                                          rejectionDraft.trim() || 'Chave Pix inválida'
                                        )
                                      }
                                      className="px-4 h-10 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold text-xs cursor-pointer whitespace-nowrap shrink-0"
                                    >
                                      Confirmar Rejeição + Estorno
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setRejectingId(null)}
                                      className="px-3 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  /* TAB 2: WEBHOOKS CAJUPAY + HMAC-SHA256 */
                  <div className="space-y-6">
                    {/* Config & Test Split Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
                      {/* Left: Webhook Endpoint & HMAC Secret Form */}
                      <form
                        onSubmit={handleSaveWebhookConfig}
                        className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4"
                      >
                        <div className="space-y-4">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/35 flex items-center justify-center text-sky-600 dark:text-[#38bdf8]">
                                <Webhook className="w-4 h-4" />
                              </div>
                              <div>
                                <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
                                  Endpoint & Assinatura HMAC-SHA256
                                </h3>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  Validação criptográfica do cabeçalho X-CajuPay-Signature
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                setWebhookConfig((prev) => ({ ...prev, isActive: !prev.isActive }))
                              }
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                                webhookConfig.isActive
                                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-[#22c55e]'
                                  : 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400'
                              }`}
                            >
                              {webhookConfig.isActive ? 'Ativo' : 'Pausado'}
                            </button>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                              URL do Webhook CajuPay
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="url"
                                required
                                value={webhookConfig.webhookUrl}
                                onChange={(e) =>
                                  setWebhookConfig((prev) => ({
                                    ...prev,
                                    webhookUrl: e.target.value,
                                  }))
                                }
                                className="flex-1 h-10 px-3 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-900 dark:text-white focus:border-[#38bdf8] focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopyText('webhook-url', webhookConfig.webhookUrl)
                                }
                                className="px-3 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer shrink-0"
                              >
                                {copiedId === 'webhook-url' ? (
                                  <Check className="w-3.5 h-3.5 text-[#22c55e]" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <KeyLock className="w-3.5 h-3.5 text-[#22c55e]" />
                                <span>Chave Secreta HMAC (Signing Secret)</span>
                              </label>
                              <button
                                type="button"
                                onClick={handleRotateSecret}
                                className="text-[11px] font-semibold text-sky-600 dark:text-[#38bdf8] hover:underline cursor-pointer"
                              >
                                Gerar nova chave
                              </button>
                            </div>
                            <div className="flex gap-2">
                              <input
                                type={showSecret ? 'text' : 'password'}
                                required
                                minLength={12}
                                value={webhookConfig.signingSecret}
                                onChange={(e) =>
                                  setWebhookConfig((prev) => ({
                                    ...prev,
                                    signingSecret: e.target.value,
                                  }))
                                }
                                className="flex-1 h-10 px-3 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-900 dark:text-white focus:border-[#22c55e] focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => setShowSecret((prev) => !prev)}
                                className="px-3 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
                              >
                                {showSecret ? 'Ocultar' : 'Exibir'}
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                              Eventos Inscritos
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {WEBHOOK_EVENT_OPTIONS.map((evt) => {
                                const selected = webhookConfig.subscribedEvents.includes(evt.id);
                                return (
                                  <button
                                    key={evt.id}
                                    type="button"
                                    onClick={() => handleToggleEventSubscription(evt.id)}
                                    className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                                      selected
                                        ? 'bg-emerald-500/10 border-emerald-500/40 text-slate-900 dark:text-white'
                                        : 'bg-white dark:bg-[#020617] border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-mono text-[11px] font-bold">
                                        {evt.label}
                                      </span>
                                      {selected && (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-[#22c55e] shrink-0" />
                                      )}
                                    </div>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                                      {evt.description}
                                    </p>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isSavingWebhook}
                          className="w-full h-11 rounded-xl bg-[#22c55e] hover:brightness-110 disabled:opacity-50 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
                        >
                          {isSavingWebhook ? 'Salvando...' : 'Salvar Configuração do Webhook'}
                        </button>
                      </form>

                      {/* Right: HMAC-SHA256 Test Payload Dispatcher */}
                      <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4">
                        <div className="space-y-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-600 dark:text-[#22c55e]">
                              <KeyLock className="w-4 h-4" />
                            </div>
                            <div>
                              <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
                                Testar Disparo HMAC-SHA256
                              </h3>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Assina o JSON com crypto HMAC-SHA256 e valida no endpoint real
                              </p>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                              Evento do Payload de Teste
                            </label>
                            <select
                              value={testEvent}
                              onChange={(e) =>
                                setTestEvent(e.target.value as CajuPayWebhookEventType)
                              }
                              className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-900 dark:text-white focus:border-[#38bdf8] focus:outline-none"
                            >
                              {WEBHOOK_EVENT_OPTIONS.map((evt) => (
                                <option key={evt.id} value={evt.id}>
                                  {evt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                              Faixa Regional Itapeva no Payload
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                              {([20, 25, 30] as const).map((amt) => (
                                <button
                                  key={amt}
                                  type="button"
                                  onClick={() => setTestAmount(amt)}
                                  className={`py-2 px-2 rounded-xl border font-mono tabular-nums text-xs font-bold transition-colors cursor-pointer ${
                                    testAmount === amt
                                      ? 'bg-[#38bdf8]/15 border-[#38bdf8] text-sky-700 dark:text-[#38bdf8]'
                                      : 'bg-white dark:bg-[#020617] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                                  }`}
                                >
                                  R$ {amt},00
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="p-3.5 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 space-y-2">
                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              Modo de Teste Criptográfico
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setSimulateInvalidSig(false)}
                                className={`py-2 px-3 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                                  !simulateInvalidSig
                                    ? 'bg-emerald-500/15 border-emerald-500/45 text-emerald-700 dark:text-[#22c55e]'
                                    : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                Assinatura Válida (200)
                              </button>
                              <button
                                type="button"
                                onClick={() => setSimulateInvalidSig(true)}
                                className={`py-2 px-3 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                                  simulateInvalidSig
                                    ? 'bg-red-500/15 border-red-500/45 text-red-600 dark:text-red-400'
                                    : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                Simular Fraude (401)
                              </button>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                              O cálculo HMAC-SHA256 usa a chave secreta ativa com comparação segura de tempo constante (<code className="font-mono">timingSafeEqual</code>).
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isDispatchingTest}
                          onClick={handleDispatchWebhookTest}
                          className="w-full h-11 rounded-xl bg-[#38bdf8] hover:brightness-110 disabled:opacity-50 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
                        >
                          <Webhook className="w-4 h-4" />
                          <span>
                            {isDispatchingTest
                              ? 'Assinando & Disparando...'
                              : 'Testar Disparo HMAC-SHA256'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Real-Time Webhook Event Logs */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
                            Log em Tempo Real de Eventos Recebidos
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Histórico auditável de callbacks CajuPay e disparos de validação HMAC
                          </p>
                        </div>
                        <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {webhookLogs.length} evento(s)
                        </span>
                      </div>

                      {isLoadingWebhooks ? (
                        <div className="space-y-2.5">
                          {[1, 2].map((i) => (
                            <Skeleton key={i} className="w-full h-16" rounded="rounded-2xl" />
                          ))}
                        </div>
                      ) : webhookLogs.length === 0 ? (
                        <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-center space-y-1.5">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            Nenhum evento webhook registrado ainda
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Clique em "Testar Disparo HMAC-SHA256" acima ou aguarde uma liquidação Pix em produção.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {webhookLogs.map((log) => {
                            const isExpanded = expandedLogId === log.id;
                            return (
                              <div
                                key={log.id}
                                className="rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 overflow-hidden"
                              >
                                <button
                                  type="button"
                                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                  className="w-full p-3.5 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-100/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                                >
                                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                                      {log.event}
                                    </span>
                                    <span aria-hidden="true" className="text-slate-400">·</span>
                                    <span
                                      className={`font-mono tabular-nums text-xs font-bold ${
                                        log.httpStatus >= 200 && log.httpStatus < 300
                                          ? 'text-emerald-600 dark:text-[#22c55e]'
                                          : 'text-red-600 dark:text-red-400'
                                      }`}
                                    >
                                      HTTP {log.httpStatus}
                                    </span>
                                    <span aria-hidden="true" className="text-slate-400">·</span>
                                    <span
                                      className={`inline-flex items-center gap-1 text-xs font-semibold ${
                                        log.hmacValid
                                          ? 'text-emerald-600 dark:text-[#22c55e]'
                                          : 'text-red-600 dark:text-red-400'
                                      }`}
                                    >
                                      {log.hmacValid ? (
                                        <>
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                          HMAC-SHA256 Válida
                                        </>
                                      ) : (
                                        <>
                                          <AlertIcon className="w-3.5 h-3.5" />
                                          Assinatura Rejeitada
                                        </>
                                      )}
                                    </span>
                                    <span aria-hidden="true" className="text-slate-400">·</span>
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                      {log.source === 'test_dispatch' ? 'Teste HMAC' : 'Webhook Ao Vivo'}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                                    <span>{new Date(log.createdAt).toLocaleString('pt-BR')}</span>
                                    <span className="text-sky-600 dark:text-[#38bdf8] font-semibold">
                                      {isExpanded ? 'Ocultar JSON' : 'Ver Payload'}
                                    </span>
                                  </div>
                                </button>

                                {isExpanded && (
                                  <div className="px-4 pb-4 pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                      <span>X-CajuPay-Signature:</span>
                                      <code className="break-all text-sky-700 dark:text-[#38bdf8]">
                                        {log.signatureHeader}
                                      </code>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      <div>
                                        <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                                          Payload Recebido
                                        </div>
                                        <pre className="p-3 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-800 dark:text-slate-200 overflow-x-auto max-h-48">
                                          {JSON.stringify(log.payload, null, 2)}
                                        </pre>
                                      </div>
                                      <div>
                                        <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                                          Resposta do Endpoint
                                        </div>
                                        <pre className="p-3 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-800 dark:text-slate-200 overflow-x-auto max-h-48">
                                          {JSON.stringify(log.responseBody || {}, null, 2)}
                                        </pre>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
