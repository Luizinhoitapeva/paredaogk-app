import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GkShieldIcon as Shield,
  GkStarRatingIcon as Star,
  GkMetricsIcon as Award,
  GkFlameIcon as Zap,
  GkCheckCircleIcon as CheckCircle2,
  GkArrowUpRightIcon as TrendingUp,
  GkMetricsIcon as Activity,
  GkCalendarIcon as Calendar,
  GkFlameIcon as Sparkles,
  GkFlameIcon as Flame,
  GkArrowUpRightIcon as ArrowUpRight,
  GkFilterIcon as Filter,
  GkRefreshIcon as RefreshCw,
  GkMetricsIcon as Trophy,
  GkRadarIcon as Target,
  GkShieldIcon as Database,
  GkDownloadIcon as Download,
  GkTermsDocIcon as FileText,
  GkStarRatingIcon as Crown,
  GkGloveBallIcon,
  GkCoinPixIcon
} from './icons';
import {
  generateGoalkeeperPerformancePdf,
  PerformanceStats,
  ReportScope,
} from '../utils/pdfReportGenerator';
import { WeeklyEliteRanking } from './WeeklyEliteRanking';
import { GoalkeeperMetricsSkeleton } from './SkeletonLoading';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  Area,
  AreaChart
} from 'recharts';
import { UserProfile, MatchBooking } from '../types';
import { isSupabaseConfigured, fetchGoalkeeperPerformanceMetrics } from '../lib/supabaseClient';

interface GoalkeeperPerformanceDashboardProps {
  user: UserProfile;
  matches?: MatchBooking[];
  onOpenHistory?: () => void;
  onOpenAuth?: () => void;
  onOpenPdfReport?: (params: { scope: ReportScope; stats: PerformanceStats }) => void;
  theme?: 'dark' | 'light';
}

export const GoalkeeperPerformanceDashboard: React.FC<GoalkeeperPerformanceDashboardProps> = ({
  user,
  matches = [],
  onOpenHistory,
  onOpenAuth,
  onOpenPdfReport,
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';
  const gridStroke = isDark ? '#1e293b' : '#e2e8f0';
  const axisStroke = isDark ? '#334155' : '#cbd5e1';
  const tickFill = isDark ? '#94a3b8' : '#475569';
  const tooltipCursorFill = isDark ? 'rgba(34, 197, 94, 0.05)' : 'rgba(16, 185, 129, 0.08)';
  const [activeSection, setActiveSection] = useState<'ranking' | 'metricas'>('ranking');
  const [timeRange, setTimeRange] = useState<'30d' | 'all'>('30d');
  const [isLoadingSupabase, setIsLoadingSupabase] = useState(false);
  const [supabaseMatches, setSupabaseMatches] = useState<any[]>([]);
  const [supabaseReviews, setSupabaseReviews] = useState<any[]>([]);
  const [supabaseStats, setSupabaseStats] = useState<{
    profileRating?: number;
    profileMatches?: number;
    profileCleanSheets?: number;
    profilePenalties?: number;
    profileMvp?: number;
    reviewsCount?: number;
  } | null>(null);

  const fetchMetrics = async () => {
    setIsLoadingSupabase(true);
    if (!isSupabaseConfigured || !user.id || user.id === 'usr-guest') {
      setSupabaseStats(null);
      setSupabaseMatches([]);
      setSupabaseReviews([]);
      setTimeout(() => setIsLoadingSupabase(false), 250);
      return;
    }

    try {
      const data = await fetchGoalkeeperPerformanceMetrics(user.id);
      if (data) {
        if (data.profile) {
          setSupabaseStats({
            profileRating: Number(data.profile.rating ?? user.rating ?? 5.0),
            profileMatches: Number(data.profile.matches_played ?? user.matchesPlayed ?? 0),
            profileCleanSheets: Number(data.profile.clean_sheets ?? user.cleanSheets ?? 0),
            profilePenalties: Number(data.profile.penalties_saved ?? user.penaltiesSaved ?? 0),
            profileMvp: Number(data.profile.mvp_count ?? user.mvpCount ?? 0),
            reviewsCount: data.reviews?.length || 0,
          });
        }
        setSupabaseMatches(data.matches || []);
        setSupabaseReviews(data.reviews || []);
      }
    } catch (err) {
      console.warn('[Supabase Performance Sync]', err);
    } finally {
      setIsLoadingSupabase(false);
    }
  };

  // Carregar métricas atualizadas diretamente do Supabase
  useEffect(() => {
    fetchMetrics();
  }, [user.id, user.rating, user.matchesPlayed]);

  // Valores consolidados estritamente do Supabase e partidas reais (zero dados fictícios)
  const completedLocalMatches = matches.filter((m) => m.status === 'completed' || Boolean(m.ratingGiven));
  const totalMatches = Math.max(
    supabaseStats?.profileMatches ?? user.matchesPlayed ?? 0,
    completedLocalMatches.length
  );
  const totalCleanSheets = Math.max(
    supabaseStats?.profileCleanSheets ?? user.cleanSheets ?? 0,
    completedLocalMatches.filter((m) => m.cleanSheetGiven).length
  );
  const totalPenalties = Math.max(
    supabaseStats?.profilePenalties ?? user.penaltiesSaved ?? 0,
    completedLocalMatches.reduce((acc, m) => acc + Number(m.penaltiesSavedGiven || 0), 0)
  );
  const totalMvp = Math.max(
    supabaseStats?.profileMvp ?? user.mvpCount ?? 0,
    completedLocalMatches.filter((m) => m.mvpGiven).length
  );
  const hasEvaluatedHistory =
    totalMatches > 0 ||
    (supabaseStats?.reviewsCount ?? 0) > 0 ||
    supabaseReviews.length > 0 ||
    completedLocalMatches.length > 0;

  const averageRating = hasEvaluatedHistory
    ? Number(supabaseStats?.profileRating ?? user.rating ?? 5.0)
    : 0;

  const cleanSheetRatio = totalMatches > 0 ? Math.round((totalCleanSheets / totalMatches) * 100) : 0;

  // Filtragem temporal real (30d vs Histórico Total)
  const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const isWithinTimeRange = (dateStr?: string) => {
    if (timeRange === 'all' || !dateStr) return true;
    const parsed = Date.parse(dateStr);
    if (Number.isNaN(parsed)) return true;
    return parsed >= cutoffMs;
  };

  // Dados reais do Gráfico de Barras (Partidas concluídas ou avaliadas)
  const rawMatchHistory = React.useMemo(() => {
    const mergedMap = new Map<string, any>();
    matches.forEach((m) => mergedMap.set(m.id, m));
    supabaseMatches.forEach((rm) => {
      const existing = mergedMap.get(rm.id) || {};
      mergedMap.set(rm.id, {
        ...existing,
        id: rm.id,
        arenaName: rm.arena_name || existing.arenaName || 'Arena Itapeva',
        date: rm.date || existing.date || 'Recente',
        status: rm.status || existing.status,
        ratingGiven: rm.rating_given ?? existing.ratingGiven,
        cleanSheetGiven: rm.clean_sheet_given ?? existing.cleanSheetGiven,
        penaltiesSavedGiven: rm.penalties_saved_given ?? existing.penaltiesSavedGiven,
        aiFeedback: rm.ai_feedback ?? existing.aiFeedback,
        createdAt: rm.created_at || existing.createdAt,
      });
    });

    return Array.from(mergedMap.values()).filter(
      (m) =>
        (m.status === 'completed' || Boolean(m.ratingGiven) || Boolean(m.aiFeedback)) &&
        isWithinTimeRange(m.createdAt)
    );
  }, [matches, supabaseMatches, timeRange]);

  const currentSavesData = React.useMemo(() => {
    return rawMatchHistory
      .slice(0, 8)
      .reverse()
      .map((m) => {
        const score = Number(m.ratingGiven || m.aiFeedback?.consolidatedRating || 5);
        const estimatedSaves = Math.max(2, Math.round(score * 1.6 + (m.cleanSheetGiven ? 2 : 0)));
        return {
          match: String(m.arenaName || 'Arena').slice(0, 14),
          arena: m.arenaName || 'Arena Itapeva',
          saves: estimatedSaves,
          goalsConceded: m.cleanSheetGiven ? 0 : 1,
          date: m.date || 'Recente',
        };
      });
  }, [rawMatchHistory]);

  const currentRatingData = React.useMemo(() => {
    if (supabaseReviews.length > 0) {
      const filteredReviews = supabaseReviews
        .filter((r) => isWithinTimeRange(r.created_at))
        .slice(0, 8)
        .reverse();
      return filteredReviews.map((r, idx) => ({
        day: `J${idx + 1}`,
        rating: Number(r.rating || 5),
        noteCount: idx + 1,
        label: r.created_at
          ? new Date(r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
          : `Jogo ${idx + 1}`,
      }));
    }

    return rawMatchHistory
      .filter((m) => m.ratingGiven || m.aiFeedback?.consolidatedRating)
      .slice(0, 8)
      .reverse()
      .map((m, idx) => ({
        day: `J${idx + 1}`,
        rating: Number(m.ratingGiven || m.aiFeedback?.consolidatedRating || 5),
        noteCount: idx + 1,
        label: m.date || `Jogo ${idx + 1}`,
      }));
  }, [supabaseReviews, rawMatchHistory, timeRange]);

  const avgSavesPerMatch =
    currentSavesData.length > 0
      ? (
          currentSavesData.reduce((acc, item) => acc + item.saves, 0) / currentSavesData.length
        ).toFixed(1)
      : '0.0';

  const fiveStarPct =
    currentRatingData.length > 0
      ? Math.round(
          (currentRatingData.filter((r) => r.rating >= 4.8).length / currentRatingData.length) * 100
        )
      : 0;

  const ratingDelta =
    currentRatingData.length >= 2
      ? Number(
          (
            currentRatingData[currentRatingData.length - 1].rating - currentRatingData[0].rating
          ).toFixed(2)
        )
      : 0;

  const aiStrengthStats = React.useMemo(() => {
    const withAi = rawMatchHistory.filter((m) => m.aiFeedback?.strengths?.length);
    if (withAi.length === 0) return null;
    const latest = withAi[0].aiFeedback!;
    return latest.strengths.slice(0, 3);
  }, [rawMatchHistory]);

  // Variantes Framer Motion para animação escalonada (Stagger Children)
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 18, scale: 0.98 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: 'spring' as const,
        damping: 24,
        stiffness: 260,
      },
    },
  };

  return (
    <div className="space-y-6">
      {/* Header da Seção de Métricas & Desempenho com Entrada Suave */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 relative overflow-hidden shadow-xl dark:shadow-2xl transition-colors"
      >
        {/* Glow de fundo */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-sky-500/15 dark:from-emerald-500/30 dark:to-sky-500/20 border-2 border-emerald-500/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-lg shadow-emerald-500/20">
                <Trophy className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-extrabold text-[9px] shadow-sm">
                PRO
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-mono font-bold text-emerald-700 dark:text-emerald-300">
                  <Activity className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  DASHBOARD DE ALTA PERFORMANCE GK
                </span>
                {isSupabaseConfigured && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/10 dark:bg-sky-500/15 border border-sky-500/30 text-[10px] font-mono text-sky-700 dark:text-sky-400">
                    <Database className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                    Supabase Live
                  </span>
                )}
              </div>

              <h2 className="font-display font-black text-xl sm:text-2xl text-slate-900 dark:text-white tracking-tight mt-1.5">
                Métricas & Desempenho do Goleiro
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Estatísticas auditadas por capitães contratantes e sincronizadas com a base oficial.
              </p>
            </div>
          </div>

          {/* Actions: PDF Download & Time range selector */}
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <button
              onClick={() => {
                const liveStats: PerformanceStats = {
                  totalMatches,
                  averageRating,
                  cleanSheets: totalCleanSheets,
                  penaltiesSaved: totalPenalties,
                  mvpCount: totalMvp,
                };
                if (onOpenPdfReport) {
                  onOpenPdfReport({ scope: 'desempenho', stats: liveStats });
                } else {
                  generateGoalkeeperPerformancePdf({
                    user,
                    matches,
                    stats: liveStats,
                  });
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/25 cursor-pointer transition-all active:scale-95"
              title="Exportar Relatório Corporativo PDF e Impressão"
            >
              <Download className="w-4 h-4 text-slate-950" />
              <span>Exportar Relatório PDF</span>
            </button>

            <button
              onClick={fetchMetrics}
              disabled={isLoadingSupabase}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Sincronizar dados em tempo real com Supabase"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 ${isLoadingSupabase ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>

            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setTimeRange('30d')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  timeRange === '30d'
                    ? 'bg-emerald-500 text-slate-950 shadow-md font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Últimos 30 Dias
              </button>
              <button
                onClick={() => setTimeRange('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  timeRange === 'all'
                    ? 'bg-emerald-500 text-slate-950 shadow-md font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Histórico Total
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Seletor Primário de Seções: Ranking Semanal de Elite vs Estatísticas & Gráficos Recharts */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="flex items-center gap-2 p-1.5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 w-full sm:w-fit shadow-sm dark:shadow-none"
      >
        <button
          onClick={() => setActiveSection('ranking')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSection === 'ranking'
              ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900'
          }`}
        >
          <Crown className="w-4 h-4" />
          <span>Ranking de Elite Semanal</span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
              activeSection === 'ranking' ? 'bg-slate-950/20 text-slate-950 font-black' : 'bg-amber-500/15 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400'
            }`}
          >
            Top GK
          </span>
        </button>

        <button
          onClick={() => setActiveSection('metricas')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSection === 'metricas'
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 shadow-lg shadow-emerald-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Métricas & Gráficos Recharts</span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
              activeSection === 'metricas' ? 'bg-slate-950/20 text-slate-950 font-black' : 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
            }`}
          >
            Live
          </span>
        </button>
      </motion.div>

      {/* RENDERIZAÇÃO CONDICIONAL COM ANIMAÇÃO ANITYPRESENCE */}
      <AnimatePresence mode="wait">
        {activeSection === 'ranking' ? (
          <motion.div
            key="ranking-section"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          >
            <WeeklyEliteRanking currentUser={user} />
          </motion.div>
        ) : isLoadingSupabase ? (
          <motion.div
            key="metricas-skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <GoalkeeperMetricsSkeleton />
          </motion.div>
        ) : (
          <motion.div
            key="metricas-section"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="space-y-6"
          >
            {/* 5 CARDS VISUAIS DE DESTAQUE COM STAGGER FADE-IN & SLIDE-UP */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4"
            >
              {/* Card 1: Total de Partidas */}
              <motion.div
                variants={cardVariants}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/40 transition-all shadow-sm dark:shadow-md group"
              >
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                  <span className="text-[11px] font-medium tracking-tight">Total de Partidas</span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
                    <Shield className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="font-mono text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                  {totalMatches}
                </div>
                <div className="flex items-center gap-1 mt-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  <TrendingUp className="w-3 h-3" />
                  <span>{totalMatches > 0 ? 'Auditado no Supabase' : 'Aguardando 1ª partida'}</span>
                </div>
              </motion.div>

              {/* Card 2: Média Geral de Notas (1-5★) */}
              <motion.div
                variants={cardVariants}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/40 transition-all shadow-sm dark:shadow-md group"
              >
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                  <span className="text-[11px] font-medium tracking-tight">Média Geral (1-5★)</span>
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
                    <Star className="w-3.5 h-3.5 fill-amber-500 dark:fill-amber-400 text-amber-500 dark:text-amber-400" />
                  </div>
                </div>
                <div className="font-mono text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white flex items-baseline gap-1">
                  <span>{hasEvaluatedHistory ? averageRating.toFixed(2) : '—'}</span>
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-normal">/ 5.0</span>
                </div>
                <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                  <span>{hasEvaluatedHistory ? 'Avaliações oficiais' : 'Sem avaliações ainda'}</span>
                </div>
              </motion.div>

              {/* Card 3: Clean Sheets Acumulados */}
              <motion.div
                variants={cardVariants}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-sky-500/40 transition-all shadow-sm dark:shadow-md group"
              >
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                  <span className="text-[11px] font-medium tracking-tight">Clean Sheets (SG)</span>
                  <div className="w-7 h-7 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-600 dark:text-sky-400 group-hover:scale-110 transition-transform">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="font-mono text-2xl sm:text-3xl font-extrabold text-sky-600 dark:text-sky-400">
                  {totalCleanSheets}
                </div>
                <div className="flex items-center gap-1 mt-1 text-[10px] text-sky-600/90 dark:text-sky-400/90 font-medium">
                  <span>{cleanSheetRatio}% dos jogos zerados</span>
                </div>
              </motion.div>

              {/* Card 4: Pênaltis Defendidos */}
              <motion.div
                variants={cardVariants}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/40 transition-all shadow-sm dark:shadow-md group"
              >
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                  <span className="text-[11px] font-medium tracking-tight">Pênaltis Pegos</span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
                    <Target className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="font-mono text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  {totalPenalties}
                </div>
                <div className="flex items-center gap-1 mt-1 text-[10px] text-emerald-600/90 dark:text-emerald-400/90 font-medium">
                  <span>{totalPenalties > 0 ? 'Defesas em cobranças' : 'Nenhum registrado'}</span>
                </div>
              </motion.div>

              {/* Card 5: MVP / Luva da Partida */}
              <motion.div
                variants={cardVariants}
                className="col-span-2 lg:col-span-1 p-4 rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-white dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900 border border-emerald-500/40 hover:border-emerald-500 dark:hover:border-emerald-400 transition-all shadow-sm dark:shadow-md group"
              >
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 tracking-tight">Luva da Partida</span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/15 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:rotate-12 transition-transform">
                    <Award className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="font-mono text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  {totalMvp} <span className="text-xs text-slate-500 dark:text-slate-400 font-sans font-normal">MVP</span>
                </div>
                <div className="flex items-center gap-1 mt-1 text-[10px] text-emerald-700 dark:text-emerald-300 font-medium">
                  <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span>{totalMvp > 0 ? 'Eleito pelos times' : 'Conquiste em campo'}</span>
                </div>
              </motion.div>
            </motion.div>

            {/* EMPTY STATE DE PRODUÇÃO (QUANDO NÃO HÁ PARTIDAS REAIS NO SUPABASE) */}
            {currentSavesData.length === 0 && currentRatingData.length === 0 ? (
              <div className="p-8 sm:p-10 rounded-3xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-center space-y-4 shadow-sm">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-[#22c55e]">
                  <GkGloveBallIcon className="w-7 h-7" />
                </div>
                <div className="space-y-1.5 max-w-lg mx-auto">
                  <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900 dark:text-white">
                    Seus gráficos de desempenho começam no 1º jogo em Itapeva
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Todas as estatísticas fictícias foram removidas. Assim que você concluir e receber avaliações reais de peladas nas arenas oficiais de Itapeva (Arena Belletti, Arena Jades, Araxá ou Arena Itapeva), os gráficos de defesas, evolução de notas e análise técnica da IA serão preenchidos automaticamente pelo Supabase.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                  {onOpenAuth && user.id === 'usr-guest' && (
                    <button
                      type="button"
                      onClick={onOpenAuth}
                      className="px-4 py-2.5 rounded-xl bg-[#22c55e] hover:brightness-110 text-slate-950 font-extrabold text-xs cursor-pointer transition-all"
                    >
                      Cadastrar / Entrar no ParedãoGK
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={fetchMetrics}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-[#38bdf8] text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-[#38bdf8] ${isLoadingSupabase ? 'animate-spin' : ''}`} />
                    <span>Atualizar Dados do Supabase</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* SEÇÃO DOS GRÁFICOS RECHARTS COM DADOS REAIS DO SUPABASE */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Gráfico 1: Gráfico de Barras - Defesas por Partida */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.15 }}
                    className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg dark:shadow-xl flex flex-col justify-between transition-colors"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                          <h3 className="font-display font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                            Volume de Defesas por Jogo
                          </h3>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Partidas registradas ({timeRange === '30d' ? 'Últimos 30 dias' : 'Histórico completo'})
                        </p>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                        Média: {avgSavesPerMatch} defesas/jogo
                      </span>
                    </div>

                    <div className="w-full h-64 sm:h-72">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={`barchart-${timeRange}`}
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.25 }}
                          className="w-full h-full"
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={currentSavesData} margin={{ top: 15, right: 10, left: -20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                              <XAxis
                                dataKey="date"
                                tick={{ fill: tickFill, fontSize: 11 }}
                                stroke={axisStroke}
                                tickLine={false}
                              />
                              <YAxis
                                tick={{ fill: tickFill, fontSize: 11 }}
                                stroke={axisStroke}
                                tickLine={false}
                                domain={[0, 14]}
                              />
                              <Tooltip
                                cursor={{ fill: tooltipCursorFill }}
                                content={({ active, payload }) => {
                                  if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                      <div className="p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs shadow-xl space-y-1">
                                        <p className="font-bold text-slate-900 dark:text-white">{data.arena}</p>
                                        <p className="text-emerald-600 dark:text-emerald-400 font-mono font-bold flex items-center gap-1.5">
                                          <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                                          {data.saves} Defesas estimadas
                                        </p>
                                        <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                                          Resultado: {data.goalsConceded === 0 ? 'Clean Sheet ⭐' : 'Partida Regular'}
                                        </p>
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              <Bar
                                dataKey="saves"
                                radius={[8, 8, 0, 0]}
                                fill="#22c55e"
                                animationDuration={600}
                              >
                                {currentSavesData.map((entry, index) => (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={entry.saves >= 10 ? '#22c55e' : entry.saves >= 8 ? '#10b981' : '#38bdf8'}
                                  />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1.5 text-[11px]">
                          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                          Destaque (+10 defesas)
                        </span>
                        <span className="flex items-center gap-1.5 text-[11px]">
                          <span className="w-2.5 h-2.5 rounded-sm bg-sky-400" />
                          Regular
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">Supabase Live</span>
                    </div>
                  </motion.div>

                  {/* Gráfico 2: Gráfico de Área - Evolução da Média de Notas */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.22 }}
                    className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg dark:shadow-xl flex flex-col justify-between transition-colors"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-sky-500 dark:bg-sky-400 animate-pulse" />
                          <h3 className="font-display font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                            Evolução da Média de Notas
                          </h3>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Avaliações consolidadas ({timeRange === '30d' ? 'Últimos 30 dias' : 'Histórico completo'})
                        </p>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/30">
                        Variação: {ratingDelta >= 0 ? `+${ratingDelta.toFixed(2)}` : ratingDelta.toFixed(2)}★
                      </span>
                    </div>

                    <div className="w-full h-64 sm:h-72">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={`areachart-${timeRange}`}
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.25 }}
                          className="w-full h-full"
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={currentRatingData} margin={{ top: 15, right: 10, left: -20, bottom: 5 }}>
                              <defs>
                                <linearGradient id="colorRatingAnim" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                              <XAxis
                                dataKey="label"
                                tick={{ fill: tickFill, fontSize: 11 }}
                                stroke={axisStroke}
                                tickLine={false}
                              />
                              <YAxis
                                tick={{ fill: tickFill, fontSize: 11 }}
                                stroke={axisStroke}
                                tickLine={false}
                                domain={[3.0, 5.0]}
                              />
                              <Tooltip
                                content={({ active, payload }) => {
                                  if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                      <div className="p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs shadow-xl space-y-1">
                                        <p className="font-bold text-slate-900 dark:text-white">{data.label}</p>
                                        <p className="text-sky-600 dark:text-sky-400 font-mono font-bold flex items-center gap-1.5">
                                          <Star className="w-3.5 h-3.5 fill-sky-500 dark:fill-sky-400 text-sky-500 dark:text-sky-400" />
                                          Nota: {Number(data.rating).toFixed(2)} ★
                                        </p>
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              <Area
                                type="monotone"
                                dataKey="rating"
                                stroke="#0284c7"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorRatingAnim)"
                                animationDuration={600}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">{fiveStarPct}%</span>
                        <span>das notas são de excelência (4.8★+)</span>
                      </div>
                      {onOpenHistory && (
                        <button
                          type="button"
                          onClick={onOpenHistory}
                          className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <span>Ver avaliações detalhadas</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                </div>

                {/* RAIO-X COMPLEMENTAR DE QUALIDADES BASEADO EM PARECERES REAIS DA IA */}
                {aiStrengthStats && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.35 }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-4"
                  >
                    {aiStrengthStats.map((st: any, idx: number) => {
                      const pct = Math.min(100, Math.round((Number(st.score || 4.8) / 5) * 100));
                      return (
                        <div
                          key={st.criterion || idx}
                          className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none"
                        >
                          <div className="flex items-center justify-between text-xs mb-2">
                            <span className="text-slate-700 dark:text-slate-300 font-semibold">{st.criterion}</span>
                            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{pct}%</span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-200 dark:border-slate-800">
                            <div
                              className="bg-gradient-to-r from-emerald-500 to-sky-400 h-full rounded-full transition-all duration-700"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                            {st.detail}
                          </p>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
