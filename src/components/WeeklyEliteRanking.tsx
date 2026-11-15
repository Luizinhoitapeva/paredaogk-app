import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GkMetricsIcon as Trophy,
  GkMetricsIcon as Medal,
  GkMetricsIcon as Award,
  GkStarRatingIcon as Star,
  GkShieldIcon as Shield,
  GkRadarIcon as Target,
  GkFlameIcon as Sparkles,
  GkArrowUpRightIcon as TrendingUp,
  GkFlameIcon as Flame,
  GkFlameIcon as Zap,
  GkCheckCircleIcon as CheckCircle2,
  GkRefreshIcon as RefreshCw,
  GkStarRatingIcon as Crown,
  GkShieldIcon as Database,
  GkGloveBallIcon,
  GkWhistleIcon
} from './icons';
import { UserProfile } from '../types';
import {
  RankedGoalkeeper,
  fetchWeeklyGoalkeeperRanking,
  isSupabaseConfigured,
  supabase
} from '../lib/supabaseClient';
import { RankingTableSkeleton } from './SkeletonLoading';

interface WeeklyEliteRankingProps {
  currentUser: UserProfile;
  onSelectGoalkeeper?: (gkId: string) => void;
}

export const WeeklyEliteRanking: React.FC<WeeklyEliteRankingProps> = ({
  currentUser,
  onSelectGoalkeeper,
}) => {
  const [rankingList, setRankingList] = useState<RankedGoalkeeper[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const loadRanking = async () => {
    setIsLoading(true);
    const data = await fetchWeeklyGoalkeeperRanking(currentUser.id);
    setRankingList(data);
    setLastUpdated(
      new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
    setIsLoading(false);
  };

  useEffect(() => {
    loadRanking();

    // Ouvir atualizações de avaliações em tempo real no Supabase
    if (isSupabaseConfigured) {
      const channel = supabase
        .channel('weekly-ranking-live')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'match_reviews' },
          () => {
            console.log('[Supabase Realtime: Nova avaliação pós-jogo registrada! Atualizando Ranking Semanal...]');
            loadRanking();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'profiles' },
          () => {
            loadRanking();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentUser.id]);

  const top1 = rankingList[0];
  const top2 = rankingList[1];
  const top3 = rankingList[2];
  const restOfRanking = rankingList.slice(3);

  return (
    <div className="space-y-6">
      {/* Header do Ranking Semanal */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 relative overflow-hidden shadow-xl dark:shadow-2xl transition-colors">
        {/* Glow de fundo */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />
        <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-emerald-500/15 dark:from-amber-500/30 dark:to-emerald-500/20 border-2 border-amber-500/60 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-lg shadow-amber-500/20">
                <Crown className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-extrabold text-[9px] shadow-sm">
                TOP GK
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/40 text-[11px] font-mono font-bold text-amber-700 dark:text-amber-300">
                  <Flame className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  RANKING DE ELITE SEMANAL · ARENADRAFT
                </span>
                {isSupabaseConfigured && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono text-emerald-700 dark:text-emerald-300">
                    <Database className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    Supabase Live
                  </span>
                )}
              </div>

              <h2 className="font-display font-black text-xl sm:text-2xl text-slate-900 dark:text-white tracking-tight mt-1.5">
                Pódio dos Melhores Paredões da Semana
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pontuação ponderada oficial calculada entre defesas difíceis, média de estrelas (1-5★), Clean Sheets e pênaltis.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              onClick={loadRanking}
              disabled={isLoading}
              className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-2 transition-all cursor-pointer"
              title="Recalcular Ranking"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
            {lastUpdated && (
              <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">
                Sincronizado: {lastUpdated}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* PÓDIO E TABELA DO RANKING COM SKELETON EM CARREGAMENTO */}
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="ranking-skeleton-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <RankingTableSkeleton />
          </motion.div>
        ) : rankingList.length === 0 ? (
          <motion.div
            key="ranking-empty-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="p-8 sm:p-10 rounded-3xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-center space-y-4 shadow-sm dark:shadow-2xl"
          >
            <div className="w-16 h-16 rounded-2xl bg-[#22c55e]/15 border border-[#22c55e]/40 flex items-center justify-center text-emerald-600 dark:text-[#22c55e] mx-auto">
              <Trophy className="w-8 h-8" />
            </div>
            <div className="space-y-1.5 max-w-lg mx-auto">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-sky-700 dark:text-[#38bdf8]">
                <Database className="w-3.5 h-3.5" />
                <span>Pódio Oficial Itapeva · Aguardando Primeiros Jogos</span>
              </div>
              <h3 className="font-display font-extrabold text-lg text-slate-900 dark:text-white text-balance">
                O Pódio Semanal ainda não possui goleiros ranqueados
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                O ranking e as medalhas de Ouro, Prata e Bronze são calculados 100% em tempo real a partir dos perfis de goleiros e avaliações pós-jogo gravadas no Supabase. Assim que os primeiros goleiros de Itapeva entrarem em campo, o pódio será atualizado automaticamente.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={loadRanking}
                className="px-4 py-2.5 rounded-xl bg-[#22c55e] hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Consultar Ranking no Supabase</span>
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="ranking-loaded-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* PÓDIO DOS 3 PRIMEIROS LUGARES (DESTAQUE VISUAL COM SELOS DE OURO, PRATA E BRONZE) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        {/* 2º Lugar - Prata */}
        {top2 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="order-2 md:order-1 p-5 rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700/80 shadow-lg dark:shadow-xl relative overflow-hidden flex flex-col justify-between transition-colors"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-slate-400/10 rounded-full blur-2xl pointer-events-none" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shadow-sm">
                  <Medal className="w-3.5 h-3.5 text-slate-500 dark:text-slate-300" />
                  2º LUGAR · PRATA
                </span>
                <span className="font-mono text-xs font-extrabold text-slate-600 dark:text-slate-300">
                  {top2.weightedScore} pts
                </span>
              </div>

              <div className="flex items-center gap-3.5 mb-4">
                <div className="relative">
                  {top2.avatarUrl ? (
                    <img
                      src={top2.avatarUrl}
                      alt={top2.name}
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 rounded-2xl object-cover border-2 border-slate-400 shadow-md"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-400 flex items-center justify-center font-display font-bold text-slate-700 dark:text-slate-200">
                      {top2.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-slate-300 text-slate-950 font-black text-[10px] flex items-center justify-center border border-white dark:border-slate-900">
                    2
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">{top2.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">"{top2.nickname}"</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{top2.neighborhood}</p>
                </div>
              </div>

              {/* Stats badges */}
              <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 text-center text-xs">
                <div>
                  <div className="text-[10px] text-slate-500">Média</div>
                  <div className="font-mono font-bold text-amber-600 dark:text-amber-400 mt-0.5">★ {top2.rating.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Defesas</div>
                  <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{top2.savesEstimated}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Clean Sheet</div>
                  <div className="font-mono font-bold text-sky-600 dark:text-sky-400 mt-0.5">{top2.cleanSheets}</div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Distintivo: <strong className="text-slate-700 dark:text-slate-300 font-bold">Luva de Prata</strong></span>
              <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">{top2.penaltiesSaved} Pênaltis</span>
            </div>
          </motion.div>
        )}

        {/* 1º Lugar - Campeão / Ouro (Card Central Elevado) */}
        {top1 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="order-1 md:order-2 p-6 rounded-3xl bg-gradient-to-b from-amber-50 via-white to-white dark:from-amber-950/40 dark:via-slate-900 dark:to-slate-900 border-2 border-amber-400/80 shadow-[0_12px_35px_rgba(245,158,11,0.18)] dark:shadow-[0_0_35px_rgba(245,158,11,0.25)] relative overflow-hidden flex flex-col justify-between md:-translate-y-2 transition-colors"
          >
            <div className="absolute top-0 right-0 w-44 h-44 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="px-3.5 py-1.5 rounded-full bg-amber-400 text-slate-950 text-xs font-mono font-black flex items-center gap-1.5 shadow-md">
                  <Crown className="w-4 h-4 text-slate-950 fill-slate-950" />
                  1º LUGAR · LUVA DE OURO
                </span>
                <span className="font-mono text-sm font-black text-amber-600 dark:text-amber-400">
                  {top1.weightedScore} pts
                </span>
              </div>

              <div className="flex items-center gap-4 mb-4">
                <div className="relative">
                  {top1.avatarUrl ? (
                    <img
                      src={top1.avatarUrl}
                      alt={top1.name}
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-amber-400 shadow-xl"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center font-display font-extrabold text-amber-700 dark:text-amber-300">
                      {top1.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center border-2 border-white dark:border-slate-900 shadow-md">
                    ★
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">{top1.name}</h3>
                  <p className="text-xs text-amber-700 dark:text-amber-300 font-semibold">"{top1.nickname}"</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{top1.neighborhood}</p>
                </div>
              </div>

              {/* Stats badges */}
              <div className="grid grid-cols-3 gap-2 p-3.5 rounded-2xl bg-amber-50/70 dark:bg-slate-950/90 border border-amber-400/40 dark:border-amber-500/40 text-center text-xs shadow-inner">
                <div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Média Notas</div>
                  <div className="font-mono font-extrabold text-amber-600 dark:text-amber-400 text-sm mt-0.5">★ {top1.rating.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Defesas</div>
                  <div className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400 text-sm mt-0.5">{top1.savesEstimated}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Clean Sheets</div>
                  <div className="font-mono font-extrabold text-sky-600 dark:text-sky-400 text-sm mt-0.5">{top1.cleanSheets}</div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-amber-500/30 flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
                <Sparkles className="w-3.5 h-3.5" />
                Muralha da Semana
              </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">{top1.mvpCount} MVPs · {top1.penaltiesSaved} Pênaltis</span>
            </div>
          </motion.div>
        )}

        {/* 3º Lugar - Bronze */}
        {top3 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="order-3 p-5 rounded-3xl bg-white dark:bg-slate-900 border-2 border-amber-700/40 dark:border-amber-700/60 shadow-lg dark:shadow-xl relative overflow-hidden flex flex-col justify-between transition-colors"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-700/10 rounded-full blur-2xl pointer-events-none" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 border border-amber-700/40 dark:border-amber-700/80 text-xs font-mono font-bold text-amber-700 dark:text-amber-500 flex items-center gap-1.5 shadow-sm">
                  <Medal className="w-3.5 h-3.5 text-amber-700 dark:text-amber-600" />
                  3º LUGAR · BRONZE
                </span>
                <span className="font-mono text-xs font-extrabold text-amber-700 dark:text-amber-500">
                  {top3.weightedScore} pts
                </span>
              </div>

              <div className="flex items-center gap-3.5 mb-4">
                <div className="relative">
                  {top3.avatarUrl ? (
                    <img
                      src={top3.avatarUrl}
                      alt={top3.name}
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 rounded-2xl object-cover border-2 border-amber-600 shadow-md"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-amber-900/20 border-2 border-amber-600 flex items-center justify-center font-display font-bold text-amber-700 dark:text-amber-400">
                      {top3.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-700 text-white font-black text-[10px] flex items-center justify-center border border-white dark:border-slate-900">
                    3
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">{top3.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">"{top3.nickname}"</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{top3.neighborhood}</p>
                </div>
              </div>

              {/* Stats badges */}
              <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 text-center text-xs">
                <div>
                  <div className="text-[10px] text-slate-500">Média</div>
                  <div className="font-mono font-bold text-amber-600 dark:text-amber-400 mt-0.5">★ {top3.rating.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Defesas</div>
                  <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{top3.savesEstimated}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Clean Sheet</div>
                  <div className="font-mono font-bold text-sky-600 dark:text-sky-400 mt-0.5">{top3.cleanSheets}</div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Distintivo: <strong className="text-amber-700 dark:text-amber-500 font-bold">Luva de Bronze</strong></span>
              <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">{top3.penaltiesSaved} Pênaltis</span>
            </div>
          </motion.div>
        )}
      </div>

      {/* TABELA COMPLETA COM O RESTANTE DOS RANQUEADOS */}
      {restOfRanking.length > 0 && (
      <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg dark:shadow-xl space-y-4 transition-colors">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="font-display font-bold text-sm sm:text-base text-slate-900 dark:text-white">
              Goleiros de Elite (4º ao {rankingList.length}º Lugar)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Classificação geral com critérios de desempate auditados
            </p>
          </div>
          <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30">
            Atualização Contínua
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-mono uppercase text-slate-500 dark:text-slate-400">
                <th className="pb-3 pl-2">Posição</th>
                <th className="pb-3">Goleiro</th>
                <th className="pb-3 text-center">Média Notas</th>
                <th className="pb-3 text-center">Defesas</th>
                <th className="pb-3 text-center">Clean Sheets</th>
                <th className="pb-3 text-center">Pênaltis</th>
                <th className="pb-3 text-right pr-2">Pontuação Geral</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/60">
              {restOfRanking.map((gk, index) => {
                const rankNumber = index + 4;
                const isCurrentUser = gk.isCurrentUser;

                return (
                  <tr
                    key={gk.id}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                      isCurrentUser ? 'bg-emerald-500/10 font-bold' : ''
                    }`}
                  >
                    <td className="py-3.5 pl-2 font-mono font-bold text-slate-500 dark:text-slate-400">
                      #{rankNumber}
                    </td>
                    <td className="py-3.5">
                      <div className="flex items-center gap-2.5">
                        {gk.avatarUrl ? (
                          <img
                            src={gk.avatarUrl}
                            alt={gk.name}
                            referrerPolicy="no-referrer"
                            className="w-9 h-9 rounded-xl object-cover border border-slate-300 dark:border-slate-700"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center font-bold text-[11px] text-emerald-600 dark:text-[#22c55e]">
                            {gk.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            {gk.name}
                            {isCurrentUser && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500 text-slate-950 font-extrabold">
                                Você
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                            "{gk.nickname}" · {gk.neighborhood}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 text-center font-mono font-bold text-amber-600 dark:text-amber-400">
                      ★ {gk.rating.toFixed(2)}
                    </td>
                    <td className="py-3.5 text-center font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                      {gk.savesEstimated}
                    </td>
                    <td className="py-3.5 text-center font-mono text-sky-600 dark:text-sky-400 font-semibold">
                      {gk.cleanSheets}
                    </td>
                    <td className="py-3.5 text-center font-mono text-slate-700 dark:text-slate-300 font-semibold">
                      {gk.penaltiesSaved}
                    </td>
                    <td className="py-3.5 text-right pr-2 font-mono font-extrabold text-slate-900 dark:text-white text-sm">
                      {gk.weightedScore}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Informações da Fórmula Ponderada */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 text-[11px] text-slate-600 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong>Fórmula Oficial:</strong> Pontos = (Média Notas × 35) + (Defesas × 2.5) + (Clean Sheets × 12) + (Pênaltis × 18) + (MVPs × 15)
          </span>
          <span className="text-emerald-600 dark:text-emerald-400 font-mono">Sincronizado com Supabase</span>
        </div>
      </div>
      )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
