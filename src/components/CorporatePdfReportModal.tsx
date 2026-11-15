import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  GkCloseIcon,
  GkDownloadIcon,
  GkPrinterIcon,
  GkShieldIcon,
  GkStarRatingIcon,
  GkCoinPixIcon,
  GkMetricsIcon,
  GkCheckCircleIcon,
  GkTermsDocIcon,
  GkAiSparkIcon,
  GkWhatsAppIcon,
  GkSunIcon,
  GkMoonIcon,
} from './icons';
import {
  MatchBooking,
  Transaction,
  UserProfile,
  WalletDashboardSummary,
} from '../types';
import { formatCurrency, maskCPF } from '../utils/validations';
import {
  generateGoalkeeperPerformancePdf,
  PerformanceStats,
  ReportScope,
} from '../utils/pdfReportGenerator';
import { getMatchGoalkeeperNetPayout } from '../utils/cachePricingAI';

interface CorporatePdfReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  matches: MatchBooking[];
  stats?: PerformanceStats;
  walletSummary?: WalletDashboardSummary;
  transactions?: Transaction[];
  selectedMatch?: MatchBooking | null;
  initialScope?: ReportScope;
}

export const CorporatePdfReportModal: React.FC<CorporatePdfReportModalProps> = ({
  isOpen,
  onClose,
  user,
  matches,
  stats,
  walletSummary,
  transactions = [],
  selectedMatch = null,
  initialScope = 'completo',
}) => {
  const [scope, setScope] = useState<ReportScope>(initialScope);
  const [sheetAppearance, setSheetAppearance] = useState<'print' | 'dark'>('print');
  const [exportStatus, setExportStatus] = useState<'idle' | 'downloaded' | 'error'>('idle');

  React.useEffect(() => {
    if (isOpen) {
      setScope(selectedMatch && initialScope === 'partida' ? 'partida' : initialScope);
      setExportStatus('idle');
    }
  }, [isOpen, initialScope, selectedMatch]);

  const txList = useMemo(
    () => (transactions.length > 0 ? transactions : walletSummary?.transactions ?? []),
    [transactions, walletSummary]
  );

  const consolidatedStats = useMemo(() => {
    const completed = matches.filter((m) => m.status === 'completed');
    const totalMatches = stats?.totalMatches ?? (user.matchesPlayed > 0 ? user.matchesPlayed : matches.length);
    const averageRating = stats?.averageRating ?? (user.rating > 0 ? user.rating : 5.0);
    const cleanSheets =
      stats?.cleanSheets ??
      Math.max(user.cleanSheets || 0, completed.filter((m) => m.cleanSheetGiven).length);
    const penaltiesSaved =
      stats?.penaltiesSaved ??
      Math.max(
        user.penaltiesSaved || 0,
        completed.reduce((acc, m) => acc + (m.penaltiesSavedGiven || 0), 0)
      );
    const mvpCount =
      stats?.mvpCount ??
      Math.max(user.mvpCount || 0, completed.filter((m) => m.mvpGiven).length);

    return {
      totalMatches,
      averageRating,
      cleanSheets,
      penaltiesSaved,
      mvpCount,
      completedCount: completed.length,
    };
  }, [matches, stats, user]);

  const financialNumbers = useMemo(() => {
    const completed = matches.filter((m) => m.status === 'completed');
    const activeEscrow = matches.filter(
      (m) => m.status === 'confirmed' || m.status === 'searching' || m.status === 'in_progress'
    );
    const availableBalance = walletSummary?.walletBalance ?? user.walletBalance;
    const custodyBalance =
      walletSummary?.pendingCustodyBalance ??
      (user.pendingBalance > 0
        ? user.pendingBalance
        : activeEscrow.reduce((s, m) => s + getMatchGoalkeeperNetPayout(m), 0));
    const cashbackBalance = walletSummary?.cashbackBalance ?? user.cashbackBalance;
    const totalPixWithdrawn =
      walletSummary?.totalPixWithdrawn ??
      txList
        .filter((t) => t.type === 'pix_out')
        .reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);
    const totalMatchEarnings =
      walletSummary?.totalMatchEarnings ??
      completed.reduce((s, m) => s + getMatchGoalkeeperNetPayout(m), 0);

    return {
      availableBalance,
      custodyBalance,
      cashbackBalance,
      totalPixWithdrawn,
      totalMatchEarnings,
    };
  }, [matches, txList, user, walletSummary]);

  if (!isOpen) return null;

  const emissionDate = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const protocolId = `PGK-${user.id.slice(0, 6).toUpperCase()}-DOC`;
  const isDarkSheet = sheetAppearance === 'dark';

  const handleDownloadPdf = () => {
    const ok = generateGoalkeeperPerformancePdf({
      user,
      matches,
      stats: {
        totalMatches: consolidatedStats.totalMatches,
        averageRating: consolidatedStats.averageRating,
        cleanSheets: consolidatedStats.cleanSheets,
        penaltiesSaved: consolidatedStats.penaltiesSaved,
        mvpCount: consolidatedStats.mvpCount,
      },
      walletSummary,
      transactions: txList,
      selectedMatch,
      scope,
    });
    setExportStatus(ok ? 'downloaded' : 'error');
    if (ok) {
      setTimeout(() => setExportStatus('idle'), 3500);
    }
  };

  const handlePrintSheet = () => {
    const prevAppearance = sheetAppearance;
    setSheetAppearance('print');
    document.body.classList.add('pgk-printing');

    const cleanup = () => {
      document.body.classList.remove('pgk-printing');
      setSheetAppearance(prevAppearance);
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);
    setTimeout(() => {
      window.print();
      setTimeout(cleanup, 1200);
    }, 120);
  };

  const scopeOptions: Array<{ id: ReportScope; label: string }> = [
    { id: 'completo', label: 'Relatório Completo' },
    { id: 'financeiro', label: 'Financeiro & CajuPay' },
    { id: 'desempenho', label: 'Desempenho & Notas' },
  ];
  if (selectedMatch) {
    scopeOptions.push({ id: 'partida', label: 'Partida Atual' });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 dark:bg-black/85 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="relative w-full max-w-4xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
      >
        {/* Modal Top Toolbar (Hidden in print) */}
        <div className="no-print p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-600 dark:text-[#22c55e] shrink-0">
                <GkTermsDocIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                  Exportar Relatório Corporativo PDF
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
                  Pré-visualização A4 pronta para impressão limpa ou download em .pdf
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar relatório"
              className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer transition-colors shrink-0"
            >
              <GkCloseIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Controls row: Scope tabs + Sheet visual mode + Action buttons */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {scopeOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setScope(opt.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    scope === opt.id
                      ? 'bg-[#22c55e] text-slate-950 shadow-sm'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Preview Appearance Switcher (Clean Print vs Dark Screen) */}
              <button
                type="button"
                onClick={() =>
                  setSheetAppearance((prev) => (prev === 'print' ? 'dark' : 'print'))
                }
                className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 hover:border-sky-500/40 cursor-pointer transition-colors"
                title="Alternar visualização entre folha de impressão clara e prévia Dark Mode"
              >
                {isDarkSheet ? (
                  <>
                    <GkSunIcon className="w-3.5 h-3.5 text-amber-500" />
                    <span>Folha Clara</span>
                  </>
                ) : (
                  <>
                    <GkMoonIcon className="w-3.5 h-3.5 text-[#38bdf8]" />
                    <span>Modo Dark</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handlePrintSheet}
                className="px-3.5 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 dark:border-[#38bdf8]/40 text-sky-700 dark:text-[#38bdf8] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
              >
                <GkPrinterIcon className="w-4 h-4" />
                <span>Imprimir</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#22c55e] to-emerald-600 hover:brightness-110 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 cursor-pointer transition-all active:scale-95"
              >
                <GkDownloadIcon className="w-4 h-4 text-slate-950" />
                <span>Baixar PDF Direto</span>
              </button>
            </div>
          </div>

          {exportStatus === 'downloaded' && (
            <div className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-[#22c55e] text-xs font-bold flex items-center gap-2">
              <GkCheckCircleIcon className="w-4 h-4 shrink-0" />
              <span>
                Relatório corporativo PDF gerado e baixado com sucesso!
              </span>
            </div>
          )}
          {exportStatus === 'error' && (
            <div className="px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/40 text-red-600 dark:text-red-400 text-xs font-bold">
              Não foi possível gerar o arquivo PDF neste momento. Utilize a opção Imprimir.
            </div>
          )}
        </div>

        {/* Scrollable Corporate Report Preview Container */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-100 dark:bg-slate-950/90">
          <div
            id="pgk-printable-report"
            className={`max-w-3xl mx-auto rounded-2xl overflow-hidden border shadow-xl transition-colors ${
              isDarkSheet
                ? 'bg-[#020617] text-slate-100 border-slate-800'
                : 'bg-white text-slate-900 border-slate-200'
            }`}
          >
            {/* 1. Cabeçalho Oficial ParedãoGK (Identidade Visual Corporativa) */}
            <div className="bg-[#020617] text-white p-5 sm:p-6 border-b-2 border-[#38bdf8] relative overflow-hidden">
              <div className="h-1 w-full bg-[#22c55e] absolute top-0 left-0" />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
                <div className="flex items-start gap-3.5">
                  {/* Logo Vetorial ParedãoGK */}
                  <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-[#22c55e]/60 flex items-center justify-center shrink-0 shadow-md">
                    <GkShieldIcon className="w-7 h-7 text-[#22c55e]" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display font-black text-xl tracking-wide text-white">
                        PAREDÃO<span className="text-[#22c55e]">GK</span>
                      </span>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-sky-500/20 text-[#38bdf8] border border-[#38bdf8]/40">
                        Documento Oficial
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 font-medium">
                      Ecossistema Oficial de Goleiros Amadores · ArenaDraft & CajuPay
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-slate-300 pt-0.5">
                      <span>paredaogkbr@gmail.com</span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="inline-flex items-center gap-1 text-[#22c55e] font-bold">
                        <GkWhatsAppIcon className="w-3.5 h-3.5" />
                        (15) 98159-6443
                      </span>
                    </div>
                  </div>
                </div>

                {/* Selo de Autenticidade */}
                <div className="p-3 rounded-xl bg-slate-900 border border-[#22c55e]/50 text-left sm:text-right space-y-0.5 shrink-0">
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#22c55e]">
                    <GkCheckCircleIcon className="w-3.5 h-3.5" />
                    <span>REGISTRO AUDITADO</span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-300">
                    Emissão: {emissionDate}
                  </div>
                  <div className="text-[10px] font-mono text-[#38bdf8]">
                    Protocolo: {protocolId}
                  </div>
                </div>
              </div>
            </div>

            {/* Report Body */}
            <div className="p-5 sm:p-6 space-y-6">
              {/* 2. Identificação do Atleta / Organizador */}
              <section className="space-y-2.5">
                <h4
                  className={`text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 ${
                    isDarkSheet ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
                  <GkShieldIcon className="w-4 h-4 text-[#22c55e]" />
                  <span>Dados do Membro Cadastrado</span>
                </h4>
                <div
                  className={`p-4 rounded-xl border grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs ${
                    isDarkSheet
                      ? 'bg-slate-900/70 border-slate-800'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="space-y-1">
                    <div>
                      <span className={isDarkSheet ? 'text-slate-400' : 'text-slate-500'}>
                        Nome Completo:{' '}
                      </span>
                      <strong className={isDarkSheet ? 'text-white' : 'text-slate-900'}>
                        {user.name}
                      </strong>
                    </div>
                    <div>
                      <span className={isDarkSheet ? 'text-slate-400' : 'text-slate-500'}>
                        Perfil:{' '}
                      </span>
                      <strong className="text-[#22c55e]">
                        {user.role === 'goleiro'
                          ? 'Goleiro Profissional GK'
                          : 'Contratante / Organizador'}
                      </strong>
                    </div>
                    <div>
                      <span className={isDarkSheet ? 'text-slate-400' : 'text-slate-500'}>
                        Apelido / Nível:{' '}
                      </span>
                      <span>
                        "{user.nickname || 'Paredão'}" · {user.technicalLevel || 'Avançado'}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div>
                      <span className={isDarkSheet ? 'text-slate-400' : 'text-slate-500'}>
                        CPF Auditado:{' '}
                      </span>
                      <span className="font-mono">{maskCPF(user.cpf)}</span>
                    </div>
                    <div>
                      <span className={isDarkSheet ? 'text-slate-400' : 'text-slate-500'}>
                        E-mail:{' '}
                      </span>
                      <span>{user.email}</span>
                    </div>
                    <div>
                      <span className={isDarkSheet ? 'text-slate-400' : 'text-slate-500'}>
                        Base Operacional:{' '}
                      </span>
                      <span>{user.city || 'Itapeva - SP'}</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* 3. Métricas de Desempenho & Avaliações (1-5★) */}
              {(scope === 'completo' || scope === 'desempenho' || scope === 'partida') && (
                <section className="space-y-2.5">
                  <h4
                    className={`text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 ${
                      isDarkSheet ? 'text-slate-300' : 'text-slate-700'
                    }`}
                  >
                    <GkMetricsIcon className="w-4 h-4 text-[#22c55e]" />
                    <span>Desempenho Esportivo, Clean Sheets & Avaliações (1-5★)</span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div
                      className={`p-3.5 rounded-xl border ${
                        isDarkSheet
                          ? 'bg-slate-900/60 border-emerald-500/30'
                          : 'bg-slate-50 border-emerald-500/40'
                      }`}
                    >
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Partidas Auditadas
                      </div>
                      <div className="font-mono tabular-nums text-xl font-black text-[#22c55e] mt-0.5">
                        {consolidatedStats.totalMatches}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {consolidatedStats.completedCount} concluída(s)
                      </div>
                    </div>

                    <div
                      className={`p-3.5 rounded-xl border ${
                        isDarkSheet
                          ? 'bg-slate-900/60 border-amber-500/30'
                          : 'bg-slate-50 border-amber-500/40'
                      }`}
                    >
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Média (1-5★)
                      </div>
                      <div className="font-mono tabular-nums text-xl font-black text-amber-500 flex items-center gap-1 mt-0.5">
                        <span>{consolidatedStats.averageRating.toFixed(2)}</span>
                        <GkStarRatingIcon className="w-4 h-4 fill-amber-500 text-amber-500" />
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {consolidatedStats.mvpCount}x Luva da Partida
                      </div>
                    </div>

                    <div
                      className={`p-3.5 rounded-xl border ${
                        isDarkSheet
                          ? 'bg-slate-900/60 border-sky-500/30'
                          : 'bg-slate-50 border-sky-500/40'
                      }`}
                    >
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Clean Sheets (SG)
                      </div>
                      <div className="font-mono tabular-nums text-xl font-black text-[#38bdf8] mt-0.5">
                        {consolidatedStats.cleanSheets}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {consolidatedStats.totalMatches > 0
                          ? Math.round(
                              (consolidatedStats.cleanSheets /
                                consolidatedStats.totalMatches) *
                                100
                            )
                          : 0}
                        % jogos zerados
                      </div>
                    </div>

                    <div
                      className={`p-3.5 rounded-xl border ${
                        isDarkSheet
                          ? 'bg-slate-900/60 border-emerald-500/30'
                          : 'bg-slate-50 border-emerald-500/40'
                      }`}
                    >
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Pênaltis Pegos
                      </div>
                      <div className="font-mono tabular-nums text-xl font-black text-[#22c55e] mt-0.5">
                        {consolidatedStats.penaltiesSaved}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Tempo normal & shootout
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* 4. Sumário Financeiro CajuPay */}
              {(scope === 'completo' || scope === 'financeiro') && (
                <section className="space-y-2.5">
                  <h4
                    className={`text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 ${
                      isDarkSheet ? 'text-slate-300' : 'text-slate-700'
                    }`}
                  >
                    <GkCoinPixIcon className="w-4 h-4 text-[#38bdf8]" />
                    <span>Sumário Financeiro CajuPay (Pix, Custódia & Cashback)</span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div
                      className={`p-3.5 rounded-xl border ${
                        isDarkSheet
                          ? 'bg-slate-900/60 border-emerald-500/30'
                          : 'bg-slate-50 border-emerald-500/40'
                      }`}
                    >
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Saldo Disponível
                      </div>
                      <div className="font-mono tabular-nums text-lg sm:text-xl font-black text-[#22c55e] mt-0.5">
                        {formatCurrency(financialNumbers.availableBalance)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Livre para saque Pix
                      </div>
                    </div>

                    <div
                      className={`p-3.5 rounded-xl border ${
                        isDarkSheet
                          ? 'bg-slate-900/60 border-sky-500/30'
                          : 'bg-slate-50 border-sky-500/40'
                      }`}
                    >
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Saldo em Custódia
                      </div>
                      <div className="font-mono tabular-nums text-lg sm:text-xl font-black text-[#38bdf8] mt-0.5">
                        {formatCurrency(financialNumbers.custodyBalance)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Retido em garantia
                      </div>
                    </div>

                    <div
                      className={`p-3.5 rounded-xl border ${
                        isDarkSheet
                          ? 'bg-slate-900/60 border-emerald-500/30'
                          : 'bg-slate-50 border-emerald-500/40'
                      }`}
                    >
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Cashback Acumulado
                      </div>
                      <div className="font-mono tabular-nums text-lg sm:text-xl font-black text-[#22c55e] mt-0.5">
                        +{formatCurrency(financialNumbers.cashbackBalance)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Créditos Futshop & Bônus
                      </div>
                    </div>

                    <div
                      className={`p-3.5 rounded-xl border ${
                        isDarkSheet
                          ? 'bg-slate-900/60 border-sky-500/30'
                          : 'bg-slate-50 border-sky-500/40'
                      }`}
                    >
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Saques Pix Realizados
                      </div>
                      <div className="font-mono tabular-nums text-lg sm:text-xl font-black text-[#38bdf8] mt-0.5">
                        {formatCurrency(financialNumbers.totalPixWithdrawn)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Ganhos jogos: {formatCurrency(financialNumbers.totalMatchEarnings)}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* 5. Destaque da Partida Selecionada + Parecer Técnico AI */}
              {scope === 'partida' && selectedMatch && (
                <section className="space-y-2.5">
                  <h4
                    className={`text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 ${
                      isDarkSheet ? 'text-slate-300' : 'text-slate-700'
                    }`}
                  >
                    <GkAiSparkIcon className="w-4 h-4 text-[#38bdf8]" />
                    <span>Dossiê da Partida & Parecer Pós-Jogo AI</span>
                  </h4>
                  <div
                    className={`p-4 rounded-xl border space-y-3 ${
                      isDarkSheet
                        ? 'bg-slate-900/70 border-sky-500/40'
                        : 'bg-sky-50/60 border-sky-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm">{selectedMatch.arenaName}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {selectedMatch.date} · {selectedMatch.time} · {selectedMatch.modality} · Goleiro:{' '}
                          {selectedMatch.goalkeeperName || user.name}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-extrabold text-sm text-[#22c55e]">
                          {formatCurrency(selectedMatch.price)}
                        </div>
                        <div className="text-[11px] text-amber-500 font-bold">
                          {selectedMatch.ratingGiven
                            ? `${selectedMatch.ratingGiven}.0 ★ Avaliado`
                            : 'Aguardando Nota'}
                        </div>
                      </div>
                    </div>

                    {selectedMatch.aiFeedback && (
                      <div
                        className={`p-3 rounded-lg border text-xs space-y-2 ${
                          isDarkSheet
                            ? 'bg-[#020617] border-slate-800'
                            : 'bg-white border-sky-200'
                        }`}
                      >
                        <div className="font-bold text-[#38bdf8]">
                          Parecer Analítico AI · Nota Consolidada:{' '}
                          {selectedMatch.aiFeedback.consolidatedRating}.0★
                        </div>
                        <p className="leading-relaxed">
                          {selectedMatch.aiFeedback.analyticalSummary}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {selectedMatch.aiFeedback.strengths.slice(0, 3).map((s) => (
                            <div
                              key={s.criterion}
                              className={`p-2 rounded border text-[11px] flex items-center justify-between ${
                                isDarkSheet
                                  ? 'bg-slate-900 border-slate-800'
                                  : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <span className="truncate font-medium">{s.criterion}</span>
                              <span className="font-mono font-bold text-[#22c55e]">
                                {s.score.toFixed(1)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* 6. Tabela de Histórico de Partidas & Avaliações */}
              {(scope === 'completo' || scope === 'desempenho') && (
                <section className="space-y-2.5">
                  <h4
                    className={`text-xs font-extrabold uppercase tracking-wider ${
                      isDarkSheet ? 'text-slate-300' : 'text-slate-700'
                    }`}
                  >
                    Histórico de Partidas & Avaliações (1-5★)
                  </h4>
                  <div
                    className={`overflow-x-auto rounded-xl border ${
                      isDarkSheet ? 'border-slate-800' : 'border-slate-200'
                    }`}
                  >
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#020617] text-white text-[11px]">
                          <th className="py-2.5 px-3 font-bold">Data</th>
                          <th className="py-2.5 px-3 font-bold">Arena / Local</th>
                          <th className="py-2.5 px-3 font-bold">Modalidade</th>
                          <th className="py-2.5 px-3 font-bold text-right">Cachê Pix</th>
                          <th className="py-2.5 px-3 font-bold text-center">Nota</th>
                          <th className="py-2.5 px-3 font-bold">Status</th>
                        </tr>
                      </thead>
                      <tbody
                        className={`divide-y ${
                          isDarkSheet ? 'divide-slate-800' : 'divide-slate-200'
                        }`}
                      >
                        {matches.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-4 px-3 text-center text-slate-500">
                              Nenhuma partida registrada no histórico até o momento.
                            </td>
                          </tr>
                        ) : (
                          matches.slice(0, 12).map((m) => (
                            <tr
                              key={m.id}
                              className={
                                isDarkSheet
                                  ? 'hover:bg-slate-900/50'
                                  : 'even:bg-slate-50/70'
                              }
                            >
                              <td className="py-2 px-3 font-mono whitespace-nowrap">
                                {m.date}
                              </td>
                              <td className="py-2 px-3 font-semibold">{m.arenaName}</td>
                              <td className="py-2 px-3">{m.modality}</td>
                              <td className="py-2 px-3 font-mono text-right font-bold text-[#22c55e] whitespace-nowrap">
                                {formatCurrency(m.price)}
                              </td>
                              <td className="py-2 px-3 font-mono text-center font-bold text-amber-500 whitespace-nowrap">
                                {m.ratingGiven
                                  ? `${m.ratingGiven}.0 ★`
                                  : m.aiFeedback
                                  ? `${m.aiFeedback.consolidatedRating}.0 ★`
                                  : '-'}
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                {m.status === 'completed'
                                  ? 'Concluída'
                                  : m.status === 'confirmed'
                                  ? 'Confirmada'
                                  : 'Em Busca'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* 7. Tabela Extrato Financeiro CajuPay */}
              {(scope === 'completo' || scope === 'financeiro') && (
                <section className="space-y-2.5">
                  <h4
                    className={`text-xs font-extrabold uppercase tracking-wider ${
                      isDarkSheet ? 'text-slate-300' : 'text-slate-700'
                    }`}
                  >
                    Extrato Financeiro CajuPay (Pix, Custódia & Cashback)
                  </h4>
                  <div
                    className={`overflow-x-auto rounded-xl border ${
                      isDarkSheet ? 'border-slate-800' : 'border-slate-200'
                    }`}
                  >
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#020617] text-white text-[11px]">
                          <th className="py-2.5 px-3 font-bold">Data</th>
                          <th className="py-2.5 px-3 font-bold">Descrição</th>
                          <th className="py-2.5 px-3 font-bold">Autenticação</th>
                          <th className="py-2.5 px-3 font-bold text-right">Valor</th>
                          <th className="py-2.5 px-3 font-bold text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody
                        className={`divide-y ${
                          isDarkSheet ? 'divide-slate-800' : 'divide-slate-200'
                        }`}
                      >
                        {txList.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-4 px-3 text-center text-slate-500">
                              Nenhuma movimentação CajuPay registrada na carteira ainda.
                            </td>
                          </tr>
                        ) : (
                          txList.slice(0, 15).map((tx) => (
                            <tr
                              key={tx.id}
                              className={
                                isDarkSheet
                                  ? 'hover:bg-slate-900/50'
                                  : 'even:bg-slate-50/70'
                              }
                            >
                              <td className="py-2 px-3 font-mono whitespace-nowrap">
                                {tx.date}
                              </td>
                              <td className="py-2 px-3 font-medium">{tx.description}</td>
                              <td className="py-2 px-3 font-mono text-[11px] whitespace-nowrap">
                                {tx.receiptCode}
                              </td>
                              <td
                                className={`py-2 px-3 font-mono text-right font-bold whitespace-nowrap ${
                                  tx.amount >= 0 ? 'text-[#22c55e]' : 'text-[#38bdf8]'
                                }`}
                              >
                                {tx.amount > 0 ? '+' : ''}
                                {formatCurrency(tx.amount)}
                              </td>
                              <td className="py-2 px-3 text-center whitespace-nowrap">
                                {tx.status === 'completed' ? 'Liquidado' : 'Em Curso'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Rodapé Institucional do Relatório */}
              <footer
                className={`pt-4 border-t text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  isDarkSheet
                    ? 'border-slate-800 text-slate-400'
                    : 'border-slate-200 text-slate-500'
                }`}
              >
                <div>
                  ParedãoGK · E-mail: paredaogkbr@gmail.com · Suporte Oficial: (15) 98159-6443
                </div>
                <div className="font-mono font-bold text-[#22c55e]">
                  CajuPay Pagamentos & Supabase Cloud
                </div>
              </footer>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
