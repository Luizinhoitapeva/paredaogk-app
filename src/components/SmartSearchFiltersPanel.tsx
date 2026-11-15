import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GkFilterIcon as Filter,
  GkMapPinIcon as MapPin,
  GkMetricsIcon as Award,
  GkClockIcon as Clock,
  GkRadarIcon as Compass,
  GkRefreshIcon as RotateCcw,
  GkFlameIcon as Sparkles,
  GkChevronDownIcon as ChevronDown,
  GkChevronDownIcon as ChevronUp,
  GkSearchIcon as Search,
  GkShieldIcon as Database,
  GkRefreshIcon as Loader2
} from './icons';
import { SmartFilterCriteria } from '../lib/supabaseClient';

interface SmartSearchFiltersPanelProps {
  filters: SmartFilterCriteria;
  onFilterChange: (newFilters: Partial<SmartFilterCriteria>) => void;
  onResetFilters: () => void;
  resultsCount: number;
  isOpen: boolean;
  onToggleOpen: () => void;
  isSupabaseLive?: boolean;
  isLoading?: boolean;
}

export const SmartSearchFiltersPanel: React.FC<SmartSearchFiltersPanelProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
  resultsCount,
  isOpen,
  onToggleOpen,
  isSupabaseLive = true,
  isLoading = false,
}) => {
  const activeFiltersCount = [
    filters.region !== 'todos',
    filters.technicalLevel !== 'todos',
    filters.timeSlot !== 'todos',
    filters.maxDistanceKm < 50,
  ].filter(Boolean).length;

  return (
    <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-xl overflow-hidden transition-all">
      {/* Header Bar com Botão de Expansão / Recolhimento e Contadores */}
      <button
        type="button"
        onClick={onToggleOpen}
        className="w-full text-left p-4 sm:p-5 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 active:bg-slate-100 dark:active:bg-slate-800/60 transition-colors touch-manipulation select-none"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 dark:bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <Filter className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                Filtros Avançados do Radar
              </h3>
              {activeFiltersCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-mono font-extrabold text-[10px]">
                  {activeFiltersCount} ativo{activeFiltersCount > 1 ? 's' : ''}
                </span>
              )}
              {isSupabaseLive && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-[10px] font-mono text-sky-700 dark:text-sky-400">
                  <Database className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                  Supabase Query
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 truncate">
              Refine por região, nível técnico, horário de jogo e distância em km
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/25 dark:border-emerald-500/20 flex items-center gap-1.5">
            {isLoading && <Loader2 className="w-3 h-3 animate-spin text-emerald-600 dark:text-emerald-400" />}
            {resultsCount} goleiro{resultsCount !== 1 ? 's' : ''}
          </span>
          <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </button>

      {/* Painel Expansível de Seletores */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="border-t border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/60 p-4 sm:p-5 space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Região / Cidade */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Região / Cidade
                </label>
                <select
                  value={filters.region}
                  onChange={(e) => onFilterChange({ region: e.target.value })}
                  className="w-full h-11 px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none transition-colors cursor-pointer"
                >
                  <option value="todos">Todas as Regiões (Itapeva - SP)</option>
                  <option value="centro">Centro (Itapeva)</option>
                  <option value="jardim_ferrari">Jardim Ferrari (Arena Belletti)</option>
                  <option value="distrito_industrial">Distrito Industrial (Arena Jades)</option>
                  <option value="vila_aparecida">Vila Aparecida &amp; Região</option>
                  <option value="recanto_pilao">Recanto Pilão D'Água (Arena Itapeva)</option>
                  <option value="jardim_europa">Jardim Europa &amp; Maringá</option>
                </select>
              </div>

              {/* 2. Nível Técnico */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                  Nível Técnico
                </label>
                <select
                  value={filters.technicalLevel}
                  onChange={(e) => onFilterChange({ technicalLevel: e.target.value })}
                  className="w-full h-11 px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none transition-colors cursor-pointer"
                >
                  <option value="todos">Todos os Níveis</option>
                  <option value="elite">Faixa 3 · Elite / Avançado (★ &gt; 4.9 · R$ 30)</option>
                  <option value="avancado">Faixa 2 · Intermediário (★ 4.8–4.9 · R$ 25)</option>
                  <option value="recreativo">Faixa 1 · Iniciante (★ &lt; 4.8 · R$ 20)</option>
                </select>
              </div>

              {/* 3. Horário Disponível */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  Horário Disponível
                </label>
                <select
                  value={filters.timeSlot}
                  onChange={(e) => onFilterChange({ timeSlot: e.target.value })}
                  className="w-full h-11 px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none transition-colors cursor-pointer"
                >
                  <option value="todos">Qualquer Horário</option>
                  <option value="hoje_online">Disponível Hoje (Imediato)</option>
                  <option value="noite">Noturno (18h às 23h)</option>
                  <option value="tarde">Tarde (13h às 18h)</option>
                  <option value="manha">Manhã (07h às 12h)</option>
                </select>
              </div>

              {/* 4. Distância Máxima em km */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    Distância Máxima
                  </span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                    {filters.maxDistanceKm >= 50 ? 'Ilimitada' : `Até ${filters.maxDistanceKm} km`}
                  </span>
                </div>
                <div className="h-11 flex items-center px-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <input
                    type="range"
                    min="3"
                    max="50"
                    step="1"
                    value={filters.maxDistanceKm}
                    onChange={(e) => onFilterChange({ maxDistanceKm: Number(e.target.value) })}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Quick Filter Tag Buttons & Reset Button */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800/80">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-mono text-sky-700 dark:text-[#38bdf8] flex items-center gap-1.5 font-semibold">
                  <Database className="w-3.5 h-3.5" />
                  Base Oficial Supabase (Itapeva - SP)
                </span>

                <span className="text-[11px] text-slate-500 font-mono">Atalhos:</span>
                <button
                  type="button"
                  onClick={() =>
                    onFilterChange({
                      technicalLevel: 'elite',
                      maxDistanceKm: 15,
                    })
                  }
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-transparent hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  Faixa 3 · Elite (R$ 30)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onFilterChange({
                      timeSlot: 'hoje_online',
                      maxDistanceKm: 15,
                    })
                  }
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-transparent hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  Disponível Hoje
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onFilterChange({
                      technicalLevel: 'avancado',
                      maxDistanceKm: 10,
                    })
                  }
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-transparent hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  Faixa 2 · Raio 10km (R$ 25)
                </button>
              </div>

              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold border border-red-500/25 dark:border-red-500/20 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Limpar Filtros</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
