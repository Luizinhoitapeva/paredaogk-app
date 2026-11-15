import React, { useState, useEffect } from 'react';
import {
  GkRadarIcon as Radar,
  GkStarRatingIcon as Star,
  GkShieldIcon as Shield,
  GkMapPinIcon as MapPin,
  GkClockIcon as Clock,
  GkFlameIcon as Sparkles,
  GkSearchIcon as Search,
  GkWhatsAppIcon as MessageCircle,
  GkMetricsIcon as Award,
  GkChevronRightIcon as ChevronRight,
  GkFilterIcon as Filter,
  GkCheckCircleIcon as CheckCircle2,
  GkArrowUpRightIcon as TrendingUp,
  GkFlameIcon as Flame,
  GkArrowUpRightIcon as ArrowUpRight,
  GkShieldIcon as Database,
  GkRadarIcon as Compass,
  GkCloseIcon as CloseIcon,
  GkHeartIcon as Heart,
  GkGloveBallIcon,
  GkWhistleIcon,
  GkCoinPixIcon
} from './icons';
import { UserProfile, Goalkeeper, MatchBooking, WeeklyMatchTemplate, ArenaField } from '../types';
import { formatCurrency } from '../utils/validations';
import { classifyGoalkeeperTier, getGoalkeeperNetAndFee, ITAPEVA_PRICING_TIERS } from '../utils/cachePricingAI';
import {
  evaluateGoalkeeperArenaProximity,
  findMatchingArenasFromMatches,
  getUniqueArenasFromMatches,
} from '../utils/arenaProximitySearch';
import {
  SmartFilterCriteria,
  queryGoalkeepersSmart,
  isSupabaseConfigured,
  isAuthorizedAdmin
} from '../lib/supabaseClient';
import { SmartSearchFiltersPanel } from './SmartSearchFiltersPanel';
import { GoalkeeperCardSkeleton } from './SkeletonLoading';
import { OrganizerRetentionPanel } from './OrganizerRetentionPanel';
import { MatchSafetySosCard } from './MatchSafetySosCard';
import { ArenasShowcaseSection } from './ArenasShowcaseSection';

interface HomeTabProps {
  user: UserProfile;
  matches?: MatchBooking[];
  arenas?: ArenaField[];
  weeklyTemplates?: WeeklyMatchTemplate[];
  favoriteGoalkeeperIds?: string[];
  isRetentionSynced?: boolean;
  onOpenIntelligentCall: () => void;
  onConvokeAtArena?: (arena: ArenaField) => void;
  onOpenSubmitArena?: () => void;
  onOpenArenaModeration?: () => void;
  onSelectGoalkeeper: (gk: Goalkeeper) => void;
  onOpenWhatsApp: () => void;
  onOpenFutshop: () => void;
  recentBooking?: MatchBooking | null;
  onOpenReviewModal?: (booking: MatchBooking) => void;
  onOpenHistory?: () => void;
  onOpenPerformance?: () => void;
  onOpenAuth?: () => void;
  onSaveWeeklyTemplate?: (tpl: Omit<WeeklyMatchTemplate, 'id' | 'organizerId' | 'createdAt'>) => void;
  onDeleteWeeklyTemplate?: (templateId: string) => void;
  onUseWeeklyTemplate?: (template: WeeklyMatchTemplate) => void;
  onToggleFavoriteGoalkeeper?: (gkId: string) => void;
  onUpdateMatchSafetyStatus?: (
    match: MatchBooking,
    updates: {
      checkin2hConfirmed?: boolean;
      enRoute45mConfirmed?: boolean;
      goalkeeperCancelled?: boolean;
    }
  ) => void;
  onTriggerSos?: (
    match: MatchBooking,
    radiusKm: number,
    urgencyBonus: number
  ) => Promise<{
    notifiedGoalkeepers: { id: string; name: string; distanceKm: number }[];
    syncedToSupabase: boolean;
  }>;
  onReinviteNextWeek?: (match: MatchBooking) => Promise<void>;
}

const INITIAL_FILTERS: SmartFilterCriteria = {
  region: 'todos',
  technicalLevel: 'todos',
  timeSlot: 'todos',
  maxDistanceKm: 25,
  modality: 'todos',
  searchQuery: '',
  arenaQuery: '',
};

export const HomeTab: React.FC<HomeTabProps> = ({
  user,
  matches = [],
  arenas = [],
  weeklyTemplates = [],
  favoriteGoalkeeperIds = [],
  isRetentionSynced = false,
  onOpenIntelligentCall,
  onConvokeAtArena,
  onOpenSubmitArena,
  onOpenArenaModeration,
  onSelectGoalkeeper,
  onOpenWhatsApp,
  onOpenFutshop,
  recentBooking,
  onOpenReviewModal,
  onOpenHistory,
  onOpenPerformance,
  onOpenAuth,
  onSaveWeeklyTemplate,
  onDeleteWeeklyTemplate,
  onUseWeeklyTemplate,
  onToggleFavoriteGoalkeeper,
  onUpdateMatchSafetyStatus,
  onTriggerSos,
  onReinviteNextWeek,
}) => {
  const [filters, setFilters] = useState<SmartFilterCriteria>(INITIAL_FILTERS);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [goalkeepers, setGoalkeepers] = useState<Goalkeeper[]>([]);
  const [totalRealInDb, setTotalRealInDb] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const highlightedMatch = React.useMemo(() => {
    if (recentBooking) return recentBooking;
    return (
      matches.find((m) => m.status === 'confirmed' || m.status === 'searching') ||
      matches.find((m) => m.status === 'completed') ||
      null
    );
  }, [recentBooking, matches]);

  const approvedArenas = React.useMemo(
    () => arenas.filter((a) => a.status === 'approved'),
    [arenas]
  );

  const uniqueArenas = React.useMemo(
    () => getUniqueArenasFromMatches(matches, approvedArenas),
    [matches, approvedArenas]
  );
  const matchedArenaRecords = React.useMemo(
    () => (filters.arenaQuery?.trim() ? findMatchingArenasFromMatches(filters.arenaQuery, matches) : []),
    [filters.arenaQuery, matches]
  );

  // Consulta exclusiva à tabela profiles do Supabase em tempo real
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    queryGoalkeepersSmart(filters, matches)
      .then(({ goalkeepers: results, totalRealInDb: dbTotal }) => {
        if (isMounted) {
          setGoalkeepers(results);
          setTotalRealInDb(dbTotal);
        }
      })
      .catch((err) => {
        console.warn('[Smart Filters Query Error]', err);
        if (isMounted) {
          setGoalkeepers([]);
          setTotalRealInDb(0);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [filters, matches]);

  const handleFilterChange = (newFilters: Partial<SmartFilterCriteria>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleResetFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Hero Visual Card with High-Impact Generated Imagery */}
      <div className="relative rounded-3xl overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="relative h-56 sm:h-64 w-full pointer-events-none select-none">
          <img
            src="/src/assets/images/hero_goalkeeper_save_1794330975279.jpg"
            alt="Goleiro ParedãoGK em ação"
            className="w-full h-full object-cover object-center"
            draggable={false}
            referrerPolicy="no-referrer"
          />
          {/* Measured contrast scrim */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/75 to-transparent" />
        </div>

        {/* Hero Content Overlay */}
        <div className="absolute inset-0 p-5 sm:p-6 flex flex-col justify-end">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-[11px] font-bold text-emerald-300 w-fit mb-2 backdrop-blur-md pointer-events-none">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Ecossistema Oficial de Goleiros Amadores</span>
          </div>

          <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight leading-tight mb-2 pointer-events-none">
            Chega de revezar no gol. Convoque um paredão em minutos.
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 max-w-xl mb-4 line-clamp-2 pointer-events-none">
            Goleiros pontuais e ranqueados para a sua pelada society, futsal ou campo 11 com pagamento 100% seguro via Pix.
          </p>

          {/* Quick CTA Button */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOpenIntelligentCall}
              className="h-12 px-5 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 active:scale-[0.97] text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-2.5 shadow-lg shadow-emerald-500/25 transition-all cursor-pointer touch-manipulation select-none"
            >
              <GkGloveBallIcon className="w-5 h-5 text-slate-950" />
              <span>Convocação Inteligente de Goleiro</span>
            </button>

            <button
              type="button"
              onClick={onOpenWhatsApp}
              className="h-12 px-4 rounded-2xl bg-slate-900/80 hover:bg-slate-800 active:scale-[0.97] border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-2 backdrop-blur-md transition-all cursor-pointer touch-manipulation select-none"
            >
              <MessageCircle className="w-4 h-4 text-emerald-400" />
              <span>Plantão 24h</span>
            </button>
          </div>
        </div>
      </div>

      {/* GK Performance Dashboard Shortcut Card */}
      {user.role === 'goleiro' && onOpenPerformance && (
        <button
          type="button"
          onClick={onOpenPerformance}
          className="w-full text-left p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-50 via-white to-slate-50 dark:from-emerald-950/60 dark:via-slate-900 dark:to-slate-950 border border-emerald-200 dark:border-emerald-500/40 hover:border-emerald-500 dark:hover:border-emerald-400 active:scale-[0.99] transition-all shadow-sm dark:shadow-xl cursor-pointer group touch-manipulation select-none"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 dark:bg-emerald-500/20 border border-emerald-500/35 dark:border-emerald-500/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform shrink-0">
                <Award className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                    Dashboard de Métricas & Desempenho GK
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/35 dark:border-emerald-500/40">
                    Recharts Live
                  </span>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                  ★ {user.rating.toFixed(2)} Média · {user.cleanSheets} Clean Sheets · {user.penaltiesSaved} Pênaltis · {user.mvpCount} MVPs
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 group-hover:translate-x-1 transition-transform shrink-0">
              <span className="hidden sm:inline">Ver Gráficos & Estatísticas</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </button>
      )}

      {/* Active Match Safety Timeline & SOS Banner */}
      {highlightedMatch && onUpdateMatchSafetyStatus && onTriggerSos && onReinviteNextWeek && (
        <MatchSafetySosCard
          match={highlightedMatch}
          userRole={user.role}
          allGoalkeepers={goalkeepers}
          onOpenReviewModal={onOpenReviewModal}
          onUpdateSafetyStatus={onUpdateMatchSafetyStatus}
          onTriggerSos={onTriggerSos}
          onReinviteNextWeek={onReinviteNextWeek}
        />
      )}

      {/* Organizer Retention Panel: Pelada Recorrente & Elenco Fixo */}
      {user.role === 'contratante' &&
        onSaveWeeklyTemplate &&
        onDeleteWeeklyTemplate &&
        onUseWeeklyTemplate &&
        onToggleFavoriteGoalkeeper && (
          <OrganizerRetentionPanel
            templates={weeklyTemplates}
            favoriteGoalkeeperIds={favoriteGoalkeeperIds}
            allGoalkeepers={goalkeepers}
            approvedArenas={approvedArenas}
            onSaveTemplate={onSaveWeeklyTemplate}
            onDeleteTemplate={onDeleteWeeklyTemplate}
            onUseTemplate={onUseWeeklyTemplate}
            onToggleFavoriteGoalkeeper={onToggleFavoriteGoalkeeper}
            onCallFavoriteGoalkeeper={onSelectGoalkeeper}
            isSupabaseSynced={isRetentionSynced}
          />
        )}

      {/* Arenas Oficiais de Itapeva (SP) & Cadastro / Moderação */}
      {arenas.length > 0 && (
        <ArenasShowcaseSection
          arenas={arenas}
          userEmail={user.email}
          isAdminAuthorized={isAuthorizedAdmin(user.email)}
          onConvokeAtArena={(arena) =>
            onConvokeAtArena ? onConvokeAtArena(arena) : onOpenIntelligentCall()
          }
          onOpenSubmitArena={() => onOpenSubmitArena?.()}
          onOpenModeration={() => onOpenArenaModeration?.()}
        />
      )}

      {/* Clube Elite GK Campaigns Carousel */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
            <Flame className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Campanhas & Benefícios Clube Elite GK
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">ARENADRAFT VIP</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Banner 1: Luvas & Equipamento com gerada */}
          <button
            type="button"
            onClick={onOpenFutshop}
            className="group relative w-full text-left rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 h-40 cursor-pointer transition-all hover:border-emerald-500/50 active:scale-[0.985] touch-manipulation select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <img
              src="/src/assets/images/elite_gk_gloves_1794330976706.jpg"
              alt="Luvas de Goleiro Profissionais"
              className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 pointer-events-none"
              draggable={false}
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent pointer-events-none" />
            <div className="absolute inset-0 p-4 flex flex-col justify-end pointer-events-none">
              <div className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider mb-1">
                Futshop Parceira
              </div>
              <h3 className="font-bold text-sm text-white group-hover:text-emerald-300 transition-colors">
                Até 25% OFF em Luvas Penalty & Poker + Cashback
              </h3>
              <p className="text-[11px] text-slate-300 mt-0.5 flex items-center gap-1">
                Use o saldo da sua carteira para comprar equipamentos oficiais
                <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />
              </p>
            </div>
          </button>

          {/* Banner 2: Arenas & Cashback Noturno */}
          <button
            type="button"
            onClick={onOpenIntelligentCall}
            className="group relative w-full text-left rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 h-40 cursor-pointer transition-all hover:border-sky-500/50 active:scale-[0.985] touch-manipulation select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <img
              src="/src/assets/images/arena_soccer_turf_1794330976038.jpg"
              alt="Arenas Credenciadas"
              className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 pointer-events-none"
              draggable={false}
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent pointer-events-none" />
            <div className="absolute inset-0 p-4 flex flex-col justify-end pointer-events-none">
              <div className="text-[10px] font-mono font-bold text-sky-400 uppercase tracking-wider mb-1">
                Seguro Atleta ArenaDraft
              </div>
              <h3 className="font-bold text-sm text-white group-hover:text-sky-300 transition-colors">
                Garantia de Substituição & Seguro Contra Lesões
              </h3>
              <p className="text-[11px] text-slate-300 mt-0.5 flex items-center gap-1">
                Partidas auditadas e cobertura de primeiros socorros
                <ChevronRight className="w-3.5 h-3.5 text-sky-400" />
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Goalkeeper Marketplace & Vitrine */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-base sm:text-lg text-slate-900 dark:text-white">
              Goleiros Prontos para Convocação
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Profissionais e experientes de várzea perto de você
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'society', label: 'Society' },
              { id: 'fut7', label: 'Fut7' },
              { id: 'futsal', label: 'Futsal' },
              { id: 'campo', label: 'Campo 11' },
            ].map((f) => (
              <button
                type="button"
                key={f.id}
                onClick={() => handleFilterChange({ modality: f.id })}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer touch-manipulation active:scale-95 ${
                  filters.modality === f.id
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}

            <button
              type="button"
              onClick={() =>
                handleFilterChange({
                  timeSlot: filters.timeSlot === 'hoje_online' ? 'todos' : 'hoje_online',
                })
              }
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap border transition-all cursor-pointer touch-manipulation active:scale-95 ${
                filters.timeSlot === 'hoje_online'
                  ? 'bg-emerald-500/15 dark:bg-emerald-500/20 border-emerald-500/50 dark:border-emerald-400 text-emerald-700 dark:text-emerald-300'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Hoje Online
            </button>

            <span className="px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap border flex items-center gap-1.5 bg-sky-500/15 dark:bg-sky-500/20 border-sky-500/40 text-sky-700 dark:text-[#38bdf8]">
              <Database className="w-3 h-3 text-sky-600 dark:text-[#38bdf8]" />
              <span>Supabase Oficial · Itapeva</span>
            </span>
          </div>
        </div>

        {/* Painel Superior de Filtros Avançados (Smart Search Filters) */}
        <SmartSearchFiltersPanel
          filters={filters}
          onFilterChange={handleFilterChange}
          onResetFilters={handleResetFilters}
          resultsCount={goalkeepers.length}
          isOpen={isFilterPanelOpen}
          onToggleOpen={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
          isSupabaseLive={isSupabaseConfigured}
          isLoading={isLoading}
        />

        {/* Search Bars: Goleiro/Bairro + Arena/Proximidade de Endereço (via Partidas) */}
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="relative">
              <input
                type="text"
                value={filters.searchQuery || ''}
                onChange={(e) => handleFilterChange({ searchQuery: e.target.value })}
                placeholder="Buscar goleiro por nome, apelido ou bairro (ex: Centro, Jardim Ferrari)..."
                aria-label="Buscar goleiro por nome, apelido ou bairro"
                className="w-full h-11 pl-10 pr-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 focus:outline-none text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 shadow-sm dark:shadow-none transition-colors"
              />
              <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-3.5 pointer-events-none" />
              {filters.searchQuery && (
                <button
                  type="button"
                  onClick={() => handleFilterChange({ searchQuery: '' })}
                  aria-label="Limpar busca por goleiro"
                  className="absolute right-2.5 top-2.5 w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                value={filters.arenaQuery || ''}
                onChange={(e) => handleFilterChange({ arenaQuery: e.target.value })}
                placeholder="Arena ou endereço (ex: Arena Belletti, Arena Jades, Recanto Pilão)..."
                aria-label="Buscar goleiros por nome de arena ou proximidade de endereço"
                className="w-full h-11 pl-10 pr-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-sky-500 focus:outline-none text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 shadow-sm dark:shadow-none transition-colors"
              />
              <MapPin className="w-4 h-4 text-sky-600 dark:text-sky-400 absolute left-3.5 top-3.5 pointer-events-none" />
              {filters.arenaQuery && (
                <button
                  type="button"
                  onClick={() => handleFilterChange({ arenaQuery: '' })}
                  aria-label="Limpar busca por arena ou endereço"
                  className="absolute right-2.5 top-2.5 w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Sugestões rápidas de arenas da lista de partidas */}
          {uniqueArenas.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap flex items-center gap-1 shrink-0">
                <MapPin className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                Arenas nas partidas:
              </span>
              {uniqueArenas.map((arena) => {
                const isSelected =
                  Boolean(filters.arenaQuery) &&
                  filters.arenaQuery?.toLowerCase().trim() === arena.arenaName.toLowerCase().trim();
                return (
                  <button
                    key={arena.arenaName}
                    type="button"
                    onClick={() =>
                      handleFilterChange({
                        arenaQuery: isSelected ? '' : arena.arenaName,
                      })
                    }
                    title={arena.address ? `${arena.arenaName} — ${arena.address}` : arena.arenaName}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap border transition-all cursor-pointer touch-manipulation active:scale-95 ${
                      isSelected
                        ? 'bg-sky-500/15 dark:bg-sky-500/20 border-sky-500/50 dark:border-sky-400 text-sky-700 dark:text-sky-300 font-semibold'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    {arena.arenaName}
                  </button>
                );
              })}
            </div>
          )}

          {/* Status da busca por arena / proximidade de endereço */}
          {filters.arenaQuery && filters.arenaQuery.trim() && (
            <div className="px-3.5 py-2 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-500/30 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-2 text-sky-800 dark:text-sky-300">
                <Compass className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                {matchedArenaRecords.length > 0 ? (
                  <span>
                    Filtrando por arena/proximidade de endereço usando{' '}
                    <strong className="font-semibold">{matchedArenaRecords.length}</strong>{' '}
                    {matchedArenaRecords.length === 1 ? 'partida encontrada' : 'partidas encontradas'} (
                    {matchedArenaRecords[0].arenaName}
                    {matchedArenaRecords[0].address ? ` · ${matchedArenaRecords[0].address}` : ''})
                  </span>
                ) : (
                  <span>
                    Nenhuma partida com "{filters.arenaQuery}" — exibindo goleiros disponíveis por proximidade de bairro/região
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleFilterChange({ arenaQuery: '' })}
                className="text-sky-700 dark:text-sky-300 hover:underline font-semibold cursor-pointer"
              >
                Limpar arena
              </button>
            </div>
          )}
        </div>

        {/* Goalkeeper Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isLoading ? (
            <GoalkeeperCardSkeleton count={4} />
          ) : goalkeepers.length === 0 && totalRealInDb === 0 ? (
            <div className="col-span-full p-6 sm:p-10 rounded-3xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-2xl relative overflow-hidden">
              <div className="max-w-2xl mx-auto text-center space-y-5">
                <div className="w-16 h-16 rounded-2xl bg-[#22c55e]/15 border border-[#22c55e]/40 flex items-center justify-center text-emerald-600 dark:text-[#22c55e] mx-auto">
                  <Radar className="w-8 h-8" />
                </div>

                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-sky-700 dark:text-[#38bdf8]">
                    <Database className="w-3.5 h-3.5" />
                    <span>Produção Itapeva (SP) · Base Oficial Supabase</span>
                  </div>
                  <h3 className="font-display font-extrabold text-lg sm:text-xl text-slate-900 dark:text-white text-balance">
                    O Radar de Itapeva está pronto para os primeiros Paredões
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl mx-auto">
                    Ainda não há goleiros cadastrados na base oficial para esta região. Seja um dos pioneiros de Itapeva a aparecer no radar, receber convocações via Pix CajuPay e disputar o Ranking Semanal.
                  </p>
                </div>

                {/* Tabela resumida das 3 faixas de Itapeva para atrair os primeiros atletas */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-left">
                  {ITAPEVA_PRICING_TIERS.map((tier) => (
                    <div
                      key={tier.tierCode}
                      className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800"
                    >
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-900 dark:text-white">Faixa {tier.tierNumber}</span>
                        <span className="font-mono tabular-nums text-emerald-600 dark:text-[#22c55e]">
                          R$ {tier.totalPrice},00
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                        {tier.technicalLevelLabel} · R$ {tier.goalkeeperNet} líquido GK
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                  {onOpenAuth && (
                    <button
                      type="button"
                      onClick={onOpenAuth}
                      className="h-11 px-5 rounded-xl bg-[#22c55e] hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer active:scale-95"
                    >
                      <GkGloveBallIcon className="w-4 h-4 text-slate-950" />
                      <span>Cadastrar-se para Aparecer no Radar</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onOpenWhatsApp}
                    className="h-11 px-4 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-[#38bdf8] font-bold text-xs flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Indicar Goleiro / Suporte</span>
                  </button>
                </div>
              </div>
            </div>
          ) : goalkeepers.length === 0 ? (
            <div className="col-span-full p-8 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm dark:shadow-none">
              <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-[#38bdf8] mx-auto">
                <Search className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Nenhum goleiro encontrado para os filtros aplicados
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                  Temos {totalRealInDb} goleiro{totalRealInDb !== 1 ? 's' : ''} cadastrado{totalRealInDb !== 1 ? 's' : ''} na base oficial. Limpe os filtros para visualizar todos os atletas disponíveis.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-4 py-2 rounded-xl bg-[#22c55e] hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer touch-manipulation active:scale-95"
                >
                  Limpar Filtros e Exibir Todos
                </button>
              </div>
            </div>
          ) : (
            goalkeepers.map((gk) => {
              const arenaProximity = filters.arenaQuery?.trim()
                ? evaluateGoalkeeperArenaProximity(gk, filters.arenaQuery, matches)
                : null;
              return (
            <div
              key={gk.id}
              className="p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm dark:shadow-none transition-all flex flex-col justify-between space-y-3 group"
            >
              {/* Top Row: Photo + Main Info */}
              <div className="flex items-start gap-3.5">
                <div className="relative shrink-0">
                  {gk.photo ? (
                    <img
                      src={gk.photo}
                      alt={gk.name}
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 group-hover:border-emerald-500/50 transition-colors"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-[#020617] border border-emerald-500/40 flex items-center justify-center font-display font-extrabold text-lg text-emerald-600 dark:text-[#22c55e]">
                      {(gk.name || 'GK').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  {gk.availableToday && (
                    <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-bold text-[9px] flex items-center gap-0.5 shadow-sm">
                      Hoje
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                      {gk.name}
                    </h3>
                    <div className="flex items-center gap-1 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                      <Star className="w-3.5 h-3.5 fill-emerald-500 dark:fill-emerald-400 text-emerald-600 dark:text-emerald-400" />
                      <span>{gk.rating}</span>
                      <span className="text-[10px] text-slate-500 font-normal">
                        ({gk.reviewsCount})
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                    "{gk.nickname}" · <span className="text-slate-700 dark:text-slate-300">{gk.neighborhood}</span>
                  </p>

                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                      {gk.distanceKm} km
                    </span>
                    <span>·</span>
                    <span>{gk.height}</span>
                    <span>·</span>
                    <span>{gk.dominantFoot}</span>
                  </div>
                </div>
              </div>

              {/* Stats Strip */}
              <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 text-center">
                <div>
                  <div className="text-[10px] text-slate-500">Partidas</div>
                  <div className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                    {gk.matchesPlayed}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Sem Gol</div>
                  <div className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                    {gk.cleanSheets}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Pênaltis Pegos</div>
                  <div className="font-mono font-bold text-xs text-sky-600 dark:text-sky-400">
                    {gk.penaltiesSaved}
                  </div>
                </div>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-1.5">
                {gk.badges.map((b, i) => (
                  <span
                    key={i}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800"
                  >
                    {b}
                  </span>
                ))}
              </div>

              {/* Arena / Address Proximity Match Indicator */}
              {arenaProximity && arenaProximity.reason && (
                <div
                  className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-medium flex items-center gap-1.5 ${
                    arenaProximity.reason === 'direct_match'
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                      : 'bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-500/30 text-sky-700 dark:text-sky-300'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {arenaProximity.reason === 'direct_match'
                      ? `Atuou/escalado na ${arenaProximity.matchedArenaName}`
                      : arenaProximity.reason === 'address_proximity'
                      ? `Próximo ao endereço: ${arenaProximity.matchedAddress || arenaProximity.matchedArenaName}`
                      : `Proximidade na região: ${gk.neighborhood}`}
                  </span>
                </div>
              )}

              {/* Bottom Row: Price & Booking Action */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-2">
                {(() => {
                  const tierInfo = classifyGoalkeeperTier({
                    rating: gk.rating,
                    matchesPlayed: gk.matchesPlayed,
                    technicalLevel: gk.level,
                  });
                  const effectiveTotal = [20, 25, 30].includes(gk.pricePerMatch)
                    ? gk.pricePerMatch
                    : tierInfo.totalPrice;
                  const split = getGoalkeeperNetAndFee(effectiveTotal);
                  return (
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-500">Cachê por jogo:</span>
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-[#38bdf8] border border-sky-500/30">
                          Faixa {split.tier.tierNumber} · {split.tier.technicalLevelLabel}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="font-mono font-bold text-base text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(split.totalPrice)}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          ({formatCurrency(split.goalkeeperNet)} GK + {formatCurrency(split.houseFee)} casa)
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex items-center gap-2">
                  {user.role === 'contratante' && onToggleFavoriteGoalkeeper && (
                    <button
                      type="button"
                      onClick={() => onToggleFavoriteGoalkeeper(gk.id)}
                      title={
                        favoriteGoalkeeperIds.includes(gk.id)
                          ? 'Remover do Elenco Fixo'
                          : 'Adicionar ao Elenco Fixo'
                      }
                      aria-label={
                        favoriteGoalkeeperIds.includes(gk.id)
                          ? `Remover ${gk.name} do Elenco Fixo`
                          : `Adicionar ${gk.name} ao Elenco Fixo`
                      }
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer active:scale-95 ${
                        favoriteGoalkeeperIds.includes(gk.id)
                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-500'
                          : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-rose-500'
                      }`}
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          favoriteGoalkeeperIds.includes(gk.id) ? 'fill-rose-500' : ''
                        }`}
                      />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onSelectGoalkeeper(gk)}
                    className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.96] text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/15 transition-all cursor-pointer touch-manipulation select-none"
                  >
                    <GkGloveBallIcon className="w-3.5 h-3.5 text-slate-950" />
                    <span>Convocar GK</span>
                  </button>
                </div>
              </div>
            </div>
              );
            })
        )}
        </div>
      </div>
    </div>
  );
};
