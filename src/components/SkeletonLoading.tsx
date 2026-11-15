import React from 'react';
import { motion } from 'motion/react';

interface SkeletonProps {
  className?: string;
  rounded?: string;
}

/**
 * Componente base de silhueta (Skeleton) com animação contínua de pulso e shimmer
 * em tons Light e Dark Mode (#020617, #0f172a, #1e293b) com acentos sutis em Verde Neon e Azul Sky.
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  className = 'h-4 w-full',
  rounded = 'rounded-xl',
}) => {
  return (
    <div
      className={`relative overflow-hidden bg-slate-200 dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-700/40 ${rounded} ${className}`}
    >
      <motion.div
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 dark:via-slate-600/20 via-emerald-500/10 via-sky-400/10 to-transparent"
        animate={{
          translateX: ['-100%', '200%'],
        }}
        transition={{
          duration: 1.8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </div>
  );
};

/**
 * 1. SKELETON: Cards de Métricas e Gráficos do Goleiro
 */
export const GoalkeeperMetricsSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 animate-pulse-subtle">
      {/* Top Banner Skeleton */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Skeleton className="w-16 h-16" rounded="rounded-2xl" />
            <div className="space-y-2">
              <Skeleton className="w-48 h-5" rounded="rounded-lg" />
              <Skeleton className="w-64 h-3.5" rounded="rounded-md" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="w-28 h-9" rounded="rounded-xl" />
            <Skeleton className="w-36 h-9" rounded="rounded-xl" />
          </div>
        </div>
      </div>

      {/* 5 Cards de Destaque Visual */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-3 relative overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="w-20 h-3" rounded="rounded" />
              <Skeleton className="w-7 h-7" rounded="rounded-lg" />
            </div>
            <Skeleton className="w-24 h-7" rounded="rounded-lg" />
            <div className="flex items-center gap-2 pt-1 border-t border-slate-200 dark:border-slate-800/80">
              <Skeleton className="w-14 h-3" rounded="rounded" />
              <Skeleton className="w-16 h-3" rounded="rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Gráficos Recharts Skeletons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Gráfico 1: Barras de Defesas por Partida */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <Skeleton className="w-44 h-4" rounded="rounded-md" />
              <Skeleton className="w-56 h-3" rounded="rounded" />
            </div>
            <Skeleton className="w-20 h-7" rounded="rounded-xl" />
          </div>
          {/* Visual simulado de barras */}
          <div className="h-60 pt-6 flex items-end justify-between gap-3 px-2">
            {[45, 75, 35, 90, 60, 100].map((h, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                <Skeleton
                  className="w-full"
                  rounded="rounded-t-lg"
                  {...{ style: { height: `${h}%` } } as any}
                />
                <Skeleton className="w-8 h-2.5" rounded="rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Gráfico 2: Área de Evolução de Média de Notas */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <Skeleton className="w-48 h-4" rounded="rounded-md" />
              <Skeleton className="w-52 h-3" rounded="rounded" />
            </div>
            <Skeleton className="w-20 h-7" rounded="rounded-xl" />
          </div>
          {/* Visual simulado de onda / grid */}
          <div className="h-60 pt-6 flex flex-col justify-between px-2 relative">
            <div className="w-full border-b border-dashed border-slate-200 dark:border-slate-800" />
            <div className="w-full border-b border-dashed border-slate-200 dark:border-slate-800" />
            <div className="w-full border-b border-dashed border-slate-200 dark:border-slate-800" />
            <Skeleton className="w-full h-32" rounded="rounded-2xl" />
            <div className="flex items-center justify-between pt-2">
              {[1, 2, 3, 4, 5, 6].map((k) => (
                <Skeleton key={k} className="w-8 h-2.5" rounded="rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * 2. SKELETON: Listas do Histórico de Partidas
 */
export const MatchHistorySkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div className="space-y-3.5">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-3 relative overflow-hidden"
        >
          {/* Top Row: Arena & Status Badge */}
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2">
                <Skeleton className="w-36 h-4" rounded="rounded-md" />
                <Skeleton className="w-16 h-4" rounded="rounded-full" />
              </div>
              <Skeleton className="w-56 h-3" rounded="rounded" />
            </div>
            <Skeleton className="w-20 h-6" rounded="rounded-lg" />
          </div>

          {/* Details Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800/60">
            <Skeleton className="h-7 w-full" rounded="rounded-xl" />
            <Skeleton className="h-7 w-full" rounded="rounded-xl" />
            <Skeleton className="h-7 w-full" rounded="rounded-xl" />
            <Skeleton className="h-7 w-full" rounded="rounded-xl" />
          </div>

          {/* Bottom Actions Row */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <Skeleton className="w-8 h-8" rounded="rounded-xl" />
              <Skeleton className="w-28 h-3.5" rounded="rounded" />
            </div>
            <Skeleton className="w-28 h-8" rounded="rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * 3. SKELETON: Tabelas e Pódio do Ranking de Elite Semanal
 */
export const RankingTableSkeleton: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Pódio (3 primeiros colocados) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        {/* 2º Lugar */}
        <div className="order-2 md:order-1 p-5 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="w-28 h-5" rounded="rounded-full" />
            <Skeleton className="w-14 h-4" rounded="rounded" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="w-14 h-14" rounded="rounded-2xl" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="w-28 h-4" rounded="rounded" />
              <Skeleton className="w-20 h-3" rounded="rounded" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80">
            <Skeleton className="h-6 w-full" rounded="rounded" />
            <Skeleton className="h-6 w-full" rounded="rounded" />
            <Skeleton className="h-6 w-full" rounded="rounded" />
          </div>
        </div>

        {/* 1º Lugar - Destaque Central */}
        <div className="order-1 md:order-2 p-6 rounded-3xl bg-white dark:bg-slate-900/90 border-2 border-amber-500/30 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <Skeleton className="w-32 h-6" rounded="rounded-full" />
            <Skeleton className="w-16 h-5" rounded="rounded" />
          </div>
          <div className="flex items-center gap-3.5">
            <Skeleton className="w-16 h-16" rounded="rounded-2xl" />
            <div className="space-y-2 flex-1">
              <Skeleton className="w-36 h-4.5" rounded="rounded" />
              <Skeleton className="w-24 h-3.5" rounded="rounded" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <Skeleton className="h-8 w-full" rounded="rounded" />
            <Skeleton className="h-8 w-full" rounded="rounded" />
            <Skeleton className="h-8 w-full" rounded="rounded" />
          </div>
        </div>

        {/* 3º Lugar */}
        <div className="order-3 p-5 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="w-28 h-5" rounded="rounded-full" />
            <Skeleton className="w-14 h-4" rounded="rounded" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="w-14 h-14" rounded="rounded-2xl" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="w-28 h-4" rounded="rounded" />
              <Skeleton className="w-20 h-3" rounded="rounded" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80">
            <Skeleton className="h-6 w-full" rounded="rounded" />
            <Skeleton className="h-6 w-full" rounded="rounded" />
            <Skeleton className="h-6 w-full" rounded="rounded" />
          </div>
        </div>
      </div>

      {/* Tabela dos demais colocados */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
          <Skeleton className="w-40 h-4" rounded="rounded" />
          <Skeleton className="w-24 h-3" rounded="rounded" />
        </div>
        {[4, 5, 6, 7].map((pos) => (
          <div
            key={pos}
            className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/70 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="w-8 h-8" rounded="rounded-xl" />
              <Skeleton className="w-10 h-10" rounded="rounded-xl" />
              <div className="space-y-1">
                <Skeleton className="w-32 h-3.5" rounded="rounded" />
                <Skeleton className="w-24 h-2.5" rounded="rounded" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="w-16 h-5" rounded="rounded-md" />
              <Skeleton className="w-14 h-5" rounded="rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * 4. SKELETON: Painel de Chat & Mensagens
 */
export const ChatPanelSkeleton: React.FC = () => {
  return (
    <div className="rounded-3xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xl dark:shadow-2xl flex flex-col md:flex-row h-[600px]">
      {/* Coluna da Esquerda: Lista de Conversas */}
      <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 p-4 space-y-3 shrink-0 bg-slate-50 dark:bg-slate-950/40">
        <Skeleton className="w-32 h-4 mb-4" rounded="rounded" />
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-3 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center gap-3"
          >
            <Skeleton className="w-11 h-11" rounded="rounded-2xl" />
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center justify-between">
                <Skeleton className="w-24 h-3.5" rounded="rounded" />
                <Skeleton className="w-10 h-2.5" rounded="rounded" />
              </div>
              <Skeleton className="w-36 h-2.5" rounded="rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Coluna da Direita: Thread de Mensagens */}
      <div className="flex-1 flex flex-col justify-between bg-slate-50/70 dark:bg-slate-950/70 p-4 sm:p-5">
        {/* Chat Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10" rounded="rounded-2xl" />
            <div className="space-y-1">
              <Skeleton className="w-32 h-4" rounded="rounded" />
              <Skeleton className="w-20 h-2.5" rounded="rounded" />
            </div>
          </div>
          <Skeleton className="w-24 h-8" rounded="rounded-xl" />
        </div>

        {/* Mensagens Simuladas */}
        <div className="flex-1 py-4 space-y-4 overflow-y-auto">
          {/* Incoming message */}
          <div className="flex items-start gap-2.5 max-w-[80%]">
            <Skeleton className="w-7 h-7 shrink-0" rounded="rounded-xl" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="w-56 h-12" rounded="rounded-2xl" />
              <Skeleton className="w-12 h-2.5" rounded="rounded" />
            </div>
          </div>

          {/* Outgoing message */}
          <div className="flex items-end justify-end gap-2.5 ml-auto max-w-[80%]">
            <div className="space-y-1.5 flex flex-col items-end">
              <Skeleton className="w-48 h-10" rounded="rounded-2xl" />
              <Skeleton className="w-14 h-2.5" rounded="rounded" />
            </div>
          </div>

          {/* Incoming message 2 */}
          <div className="flex items-start gap-2.5 max-w-[80%]">
            <Skeleton className="w-7 h-7 shrink-0" rounded="rounded-xl" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="w-64 h-14" rounded="rounded-2xl" />
              <Skeleton className="w-12 h-2.5" rounded="rounded" />
            </div>
          </div>

          {/* Outgoing location card */}
          <div className="flex items-end justify-end gap-2.5 ml-auto max-w-[80%]">
            <Skeleton className="w-60 h-16" rounded="rounded-2xl" />
          </div>
        </div>

        {/* Input Bar Skeleton */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 flex items-center gap-2">
          <Skeleton className="h-11 flex-1" rounded="rounded-xl" />
          <Skeleton className="w-11 h-11" rounded="rounded-xl" />
        </div>
      </div>
    </div>
  );
};

/**
 * 5. SKELETON: Cards de Goleiro do Radar / HomeTab
 */
export const GoalkeeperCardSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3"
        >
          {/* Top Row: Photo + Main Info */}
          <div className="flex items-start gap-3.5">
            <Skeleton className="w-16 h-16 shrink-0" rounded="rounded-2xl" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="w-32 h-4" rounded="rounded" />
                <Skeleton className="w-12 h-3.5" rounded="rounded" />
              </div>
              <Skeleton className="w-40 h-3" rounded="rounded" />
              <Skeleton className="w-48 h-2.5" rounded="rounded" />
            </div>
          </div>

          {/* Stats Strip */}
          <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80">
            <Skeleton className="h-7 w-full" rounded="rounded" />
            <Skeleton className="h-7 w-full" rounded="rounded" />
            <Skeleton className="h-7 w-full" rounded="rounded" />
          </div>

          {/* Badges */}
          <div className="flex items-center gap-1.5">
            <Skeleton className="w-20 h-4" rounded="rounded-md" />
            <Skeleton className="w-24 h-4" rounded="rounded-md" />
          </div>

          {/* Bottom Row */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
            <div className="space-y-1">
              <Skeleton className="w-16 h-2.5" rounded="rounded" />
              <Skeleton className="w-20 h-5" rounded="rounded" />
            </div>
            <Skeleton className="w-28 h-9" rounded="rounded-xl" />
          </div>
        </div>
      ))}
    </>
  );
};
