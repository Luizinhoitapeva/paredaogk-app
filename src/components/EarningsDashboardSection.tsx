import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
  Cell,
} from 'recharts';
import {
  GkCoinPixIcon,
  GkShieldIcon as ShieldCheck,
  GkArrowUpRightIcon as ArrowUpRight,
  GkFlameIcon as Sparkles,
  GkWalletPixIcon as Wallet,
  GkCheckCircleIcon as CheckCircle2,
  GkSettingsIcon as Sliders,
  GkTermsDocIcon,
} from './icons';
import { MatchBooking, Transaction, UserProfile, WalletDashboardSummary } from '../types';
import { formatCurrency } from '../utils/validations';
import { Skeleton } from './SkeletonLoading';
import { getMatchGoalkeeperNetPayout, getGoalkeeperNetAndFee } from '../utils/cachePricingAI';

interface EarningsDashboardSectionProps {
  user: UserProfile;
  matches: MatchBooking[];
  summary: WalletDashboardSummary;
  isLoading: boolean;
  theme?: 'dark' | 'light';
  onOpenWithdrawModal: () => void;
  onOpenProfilePricing?: () => void;
  onSelectReceipt: (tx: Transaction) => void;
  onExportPdf?: () => void;
}

export const EarningsDashboardSection: React.FC<EarningsDashboardSectionProps> = ({
  user,
  matches,
  summary,
  isLoading,
  theme = 'dark',
  onOpenWithdrawModal,
  onOpenProfilePricing,
  onSelectReceipt,
  onExportPdf,
}) => {
  const [chartMode, setChartMode] = useState<'per_match' | 'cumulative'>('per_match');
  const isDark = theme === 'dark';

  const gridStroke = isDark ? '#1e293b' : '#e2e8f0';
  const axisStroke = isDark ? '#334155' : '#cbd5e1';
  const tickFill = isDark ? '#94a3b8' : '#475569';

  // Dados de Ganhos por Partida (combinando partidas reais/histórico + bônus SOS + cashback)
  const matchEarningsChartData = useMemo(() => {
    const relevantMatches = matches
      .filter((m) => m.status === 'completed' || m.status === 'confirmed' || m.status === 'in_progress')
      .slice(0, 8)
      .reverse();

    if (relevantMatches.length === 0) {
      return [
        {
          label: 'Sem jogos',
          arena: 'Nenhuma partida registrada',
          date: 'Hoje',
          modality: 'Society',
          cache: 0,
          bonusCashback: 0,
          total: 0,
          statusLabel: 'Pendente',
        },
      ];
    }

    return relevantMatches.map((m, idx) => {
      const shortArena = m.arenaName.split(' ').slice(0, 2).join(' ') || `Jogo ${idx + 1}`;
      const baseCache = getMatchGoalkeeperNetPayout(m);
      const bonusAndCashback = Number(((m.cashbackEarned || 0) + (m.sosBonus || 0)).toFixed(2));
      return {
        label: shortArena,
        arena: m.arenaName,
        date: m.date,
        modality: m.modality,
        cache: baseCache,
        bonusCashback: bonusAndCashback,
        total: Number((baseCache + bonusAndCashback).toFixed(2)),
        statusLabel: m.status === 'completed' ? 'Liberado' : 'Em Custódia Mercado Pago',
      };
    });
  }, [matches]);

  // Dados acumulados para o gráfico de área (Faturamento vs Cashback & Saques)
  const cashflowAreaData = useMemo(() => {
    let runningEarnings = 0;
    let runningCashback = 0;

    return matchEarningsChartData.map((item, idx) => {
      runningEarnings += item.cache;
      runningCashback += item.bonusCashback;
      return {
        step: item.date || `J${idx + 1}`,
        arena: item.arena,
        acumulado: Number(runningEarnings.toFixed(2)),
        cashbackAcumulado: Number(runningCashback.toFixed(2)),
      };
    });
  }, [matchEarningsChartData]);

  // Partidas atualmente com saldo retido em custódia Mercado Pago
  const custodyMatches = useMemo(
    () =>
      matches.filter(
        (m) => m.status === 'confirmed' || m.status === 'searching' || m.status === 'in_progress'
      ),
    [matches]
  );

  // Histórico específico de saques via Pix pelo Mercado Pago
  const pixWithdrawals = useMemo(
    () => summary.transactions.filter((t) => t.type === 'pix_out'),
    [summary.transactions]
  );

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="p-4 rounded-2xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 space-y-2.5"
            >
              <Skeleton className="w-24 h-3" rounded="rounded" />
              <Skeleton className="w-28 h-7" rounded="rounded-lg" />
              <Skeleton className="w-20 h-2.5" rounded="rounded" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-5 rounded-3xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 space-y-4">
            <Skeleton className="w-48 h-4" rounded="rounded" />
            <Skeleton className="w-full h-56" rounded="rounded-2xl" />
          </div>
          <div className="p-5 rounded-3xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 space-y-4">
            <Skeleton className="w-48 h-4" rounded="rounded" />
            <Skeleton className="w-full h-56" rounded="rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header do Dashboard Financeiro do Atleta */}
      <div className="p-5 rounded-3xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-emerald-600 dark:text-[#22c55e]">
              Dashboard Financeiro GK
            </span>
            <span aria-hidden="true">·</span>
            <span>{summary.syncedFromSupabase ? 'Sincronizado com Supabase' : 'Carteira Mercado Pago'}</span>
            {user.preferredCache && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-sky-600 dark:text-[#38bdf8]">
                  Cachê base: {formatCurrency(user.preferredCache)}
                </span>
              </>
            )}
          </div>
          <h2 className="font-display font-extrabold text-lg sm:text-xl text-slate-900 dark:text-white tracking-tight">
            Ganhos, Custódia & Saques Mercado Pago
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onExportPdf && (
            <button
              type="button"
              onClick={onExportPdf}
              className="px-3.5 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 dark:border-[#38bdf8]/40 text-xs font-bold text-sky-700 dark:text-[#38bdf8] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <GkTermsDocIcon className="w-3.5 h-3.5" />
              <span>Exportar Relatório PDF</span>
            </button>
          )}
          {onOpenProfilePricing && (
            <button
              type="button"
              onClick={onOpenProfilePricing}
              className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Sliders className="w-3.5 h-3.5 text-sky-600 dark:text-[#38bdf8]" />
              <span>IA de Cachê no Perfil</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenWithdrawModal}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#22c55e] to-emerald-600 hover:brightness-110 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all cursor-pointer whitespace-nowrap"
          >
            <GkCoinPixIcon className="w-4 h-4 text-slate-950" />
            <span>Sacar via Pix Mercado Pago</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Cards de Faturamento (Tabular Numerals) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Ganhos por Partida</span>
            <GkCoinPixIcon className="w-4 h-4 text-emerald-600 dark:text-[#22c55e]" />
          </div>
          <div className="font-mono tabular-nums text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-[#22c55e]">
            {formatCurrency(summary.totalMatchEarnings)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {matches.filter((m) => m.status === 'completed').length} partidas concluídas
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Saldo em Custódia</span>
            <ShieldCheck className="w-4 h-4 text-sky-600 dark:text-[#38bdf8]" />
          </div>
          <div className="font-mono tabular-nums text-xl sm:text-2xl font-extrabold text-sky-600 dark:text-[#38bdf8]">
            {formatCurrency(summary.pendingCustodyBalance)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {custodyMatches.length} jogo(s) em garantia
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Cashbacks Acumulados</span>
            <Sparkles className="w-4 h-4 text-emerald-600 dark:text-[#22c55e]" />
          </div>
          <div className="font-mono tabular-nums text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
            +{formatCurrency(summary.cashbackBalance)}
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-[#22c55e] font-medium">
            Crédito Futshop & Bônus
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Saques Pix Mercado Pago</span>
            <ArrowUpRight className="w-4 h-4 text-sky-600 dark:text-[#38bdf8]" />
          </div>
          <div className="font-mono tabular-nums text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
            {formatCurrency(summary.totalPixWithdrawn)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {pixWithdrawals.filter((t) => t.status === 'completed').length} liquidado(s)
            {pixWithdrawals.some((t) => t.status === 'processing')
              ? ` · ${pixWithdrawals.filter((t) => t.status === 'processing').length} pendente(s)`
              : ''}
          </div>
        </div>
      </div>

      {/* Gráficos Financeiros Limpos (Recharts) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gráfico 1: Ganhos por Partida (BarChart) */}
        <div className="p-5 rounded-3xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
                Ganhos por Partida & Bônus
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Repasse líquido GK (#22c55e, após R$ 5 taxa) e cashback/SOS (#38bdf8)
              </p>
            </div>

            <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setChartMode('per_match')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  chartMode === 'per_match'
                    ? 'bg-[#22c55e] text-slate-950 font-bold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Por Jogo
              </button>
              <button
                type="button"
                onClick={() => setChartMode('cumulative')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  chartMode === 'cumulative'
                    ? 'bg-[#38bdf8] text-slate-950 font-bold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Acumulado
              </button>
            </div>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chartMode === 'per_match' ? (
                <BarChart data={matchEarningsChartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke={axisStroke}
                    tick={{ fill: tickFill, fontSize: 10 }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke={axisStroke}
                    tick={{ fill: tickFill, fontSize: 10 }}
                    tickLine={false}
                    tickFormatter={(v) => `R$${v}`}
                  />
                  <Tooltip
                    cursor={{ fill: isDark ? 'rgba(34, 197, 94, 0.06)' : 'rgba(16, 185, 129, 0.08)' }}
                    contentStyle={{
                      backgroundColor: isDark ? '#020617' : '#ffffff',
                      borderColor: isDark ? '#1e293b' : '#cbd5e1',
                      borderRadius: '12px',
                      fontSize: '11px',
                      color: isDark ? '#f8fafc' : '#0f172a',
                    }}
                    formatter={(value: any, name: any) => [
                      formatCurrency(Number(value || 0)),
                      name === 'cache' ? 'Cachê da Partida' : 'Cashback / Bônus SOS',
                    ]}
                  />
                  <Bar dataKey="cache" stackId="a" radius={[0, 0, 0, 0]} maxBarSize={36}>
                    {matchEarningsChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill="#22c55e" />
                    ))}
                  </Bar>
                  <Bar dataKey="bonusCashback" stackId="a" fill="#38bdf8" radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              ) : (
                <AreaChart data={cashflowAreaData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pgkEarningsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis
                    dataKey="step"
                    stroke={axisStroke}
                    tick={{ fill: tickFill, fontSize: 10 }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke={axisStroke}
                    tick={{ fill: tickFill, fontSize: 10 }}
                    tickLine={false}
                    tickFormatter={(v) => `R$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#020617' : '#ffffff',
                      borderColor: isDark ? '#1e293b' : '#cbd5e1',
                      borderRadius: '12px',
                      fontSize: '11px',
                      color: isDark ? '#f8fafc' : '#0f172a',
                    }}
                    formatter={(value: any, name: any) => [
                      formatCurrency(Number(value || 0)),
                      name === 'acumulado' ? 'Faturamento Acumulado' : 'Cashback Acumulado',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="acumulado"
                    stroke="#22c55e"
                    strokeWidth={2.5}
                    fill="url(#pgkEarningsFill)"
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 2: Evolução de Cashback & Valor em Custódia */}
        <div className="p-5 rounded-3xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
                Curva de Cashbacks & Bônus
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Retorno acumulado em créditos Futshop e bônus de urgência SOS
              </p>
            </div>
            <span className="font-mono tabular-nums text-xs font-bold text-sky-600 dark:text-[#38bdf8]">
              +{formatCurrency(summary.cashbackBalance)}
            </span>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashflowAreaData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="pgkCashbackFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis
                  dataKey="step"
                  stroke={axisStroke}
                  tick={{ fill: tickFill, fontSize: 10 }}
                  tickLine={false}
                />
                <YAxis
                  stroke={axisStroke}
                  tick={{ fill: tickFill, fontSize: 10 }}
                  tickLine={false}
                  tickFormatter={(v) => `R$${v}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#020617' : '#ffffff',
                    borderColor: isDark ? '#1e293b' : '#cbd5e1',
                    borderRadius: '12px',
                    fontSize: '11px',
                    color: isDark ? '#f8fafc' : '#0f172a',
                  }}
                  formatter={(value: any) => [formatCurrency(Number(value || 0)), 'Cashback Acumulado']}
                />
                <Area
                  type="monotone"
                  dataKey="cashbackAcumulado"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  fill="url(#pgkCashbackFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Custódia Mercado Pago + Histórico de Saques Pix Mercado Pago */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Valores em Custódia Mercado Pago */}
        <div className="p-5 rounded-3xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 space-y-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
                Saldo em Custódia (Mercado Pago)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Liberação instantânea ao confirmar presença no apito final
              </p>
            </div>
            <span className="font-mono tabular-nums text-sm font-extrabold text-sky-600 dark:text-[#38bdf8]">
              {formatCurrency(summary.pendingCustodyBalance)}
            </span>
          </div>

          {custodyMatches.length === 0 ? (
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
              Nenhuma partida ativa em custódia no momento.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
              {custodyMatches.slice(0, 4).map((m) => (
                <div key={m.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {m.arenaName}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {m.date} · {m.time} · {m.modality}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono tabular-nums text-xs font-extrabold text-sky-600 dark:text-[#38bdf8]">
                      {formatCurrency(getMatchGoalkeeperNetPayout(m))}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      Total {formatCurrency(m.price)} · Taxa {formatCurrency(getGoalkeeperNetAndFee(m.price, m.houseFee).houseFee)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Histórico de Saques via Pix pelo Mercado Pago */}
        <div className="p-5 rounded-3xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 space-y-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
                Histórico de Saques via Pix (Mercado Pago)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Repasse líquido com conferência administrativa e comprovante
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenWithdrawModal}
              className="text-xs font-bold text-emerald-600 dark:text-[#22c55e] hover:underline cursor-pointer flex items-center gap-1"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Novo Saque</span>
            </button>
          </div>

          {pixWithdrawals.length === 0 ? (
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nenhum saque Pix Mercado Pago realizado ainda.
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Quando você transferir seu saldo disponível via Pix, o comprovante Mercado Pago aparecerá aqui.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
              {pixWithdrawals.slice(0, 5).map((tx) => {
                const isPending = tx.status === 'processing' || tx.status === 'pending';
                const isRejected = tx.status === 'rejected' || tx.status === 'cancelled';
                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => onSelectReceipt(tx)}
                    className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900/50 rounded-xl px-2 -mx-2 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                        <CheckCircle2
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isRejected
                              ? 'text-red-500'
                              : isPending
                              ? 'text-amber-500'
                              : 'text-emerald-600 dark:text-[#22c55e]'
                          }`}
                        />
                        <span className="truncate">{tx.description}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                        {tx.date} · {tx.pixKey || 'Chave Pix'} · {tx.receiptCode}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono tabular-nums text-xs font-extrabold text-sky-600 dark:text-[#38bdf8]">
                        {formatCurrency(Math.abs(tx.amount))}
                      </div>
                      <div
                        className={`text-[10px] font-semibold ${
                          isRejected
                            ? 'text-red-600 dark:text-red-400'
                            : isPending
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-[#22c55e]'
                        }`}
                      >
                        {isRejected ? 'Rejeitado / Estornado' : isPending ? 'Pendente' : 'Aprovado / Pago'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
