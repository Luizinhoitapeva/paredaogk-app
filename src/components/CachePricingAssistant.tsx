import React, { useState, useEffect, useMemo } from 'react';
import {
  GkFlameIcon as Sparkles,
  GkCheckIcon as Check,
  GkRefreshIcon as RefreshCw,
  GkMapPinIcon as MapPin,
  GkMetricsIcon as Award,
  GkCoinPixIcon,
  GkWhistleIcon,
} from './icons';
import {
  CacheSuggestionInput,
  CacheSuggestionResult,
  CacheUrgencyLevel,
  ModalityType,
  PricingTierCode,
  TechnicalLevelOption,
} from '../types';
import {
  ITAPEVA_PRICING_TIERS,
  calculateSmartCacheEstimate,
  classifyGoalkeeperTier,
  fetchAiCacheSuggestion,
  technicalLevelToTierOption,
} from '../utils/cachePricingAI';
import { formatCurrency } from '../utils/validations';

interface CachePricingAssistantProps {
  initialModality?: ModalityType;
  initialTechnicalLevel?: TechnicalLevelOption;
  initialDistanceKm?: number;
  initialUrgency?: CacheUrgencyLevel;
  rating?: number;
  matchesPlayed?: number;
  arenaName?: string;
  city?: string;
  onApplyPrice: (
    suggestedPrice: number,
    meta?: {
      technicalLevel: TechnicalLevelOption;
      modality: ModalityType;
      tierCode: PricingTierCode;
      pinned: boolean;
    }
  ) => void;
  compact?: boolean;
}

export const CachePricingAssistant: React.FC<CachePricingAssistantProps> = ({
  initialModality = 'Society',
  initialTechnicalLevel = 'Intermediário',
  initialDistanceKm = 5,
  initialUrgency = 'normal',
  rating,
  matchesPlayed,
  arenaName = '',
  city = 'Itapeva - SP',
  onApplyPrice,
  compact = false,
}) => {
  const [modality, setModality] = useState<ModalityType>(initialModality);
  const [technicalLevel, setTechnicalLevel] = useState<TechnicalLevelOption>(initialTechnicalLevel);
  const [distanceKm, setDistanceKm] = useState<number>(initialDistanceKm);
  const [urgency, setUrgency] = useState<CacheUrgencyLevel>(initialUrgency);
  const [pinnedTier, setPinnedTier] = useState<PricingTierCode | null>(null);

  const [isQueryingAi, setIsQueryingAi] = useState(false);
  const [aiResult, setAiResult] = useState<CacheSuggestionResult>(() =>
    calculateSmartCacheEstimate({
      modality: initialModality,
      technicalLevel: initialTechnicalLevel,
      distanceKm: initialDistanceKm,
      urgency: initialUrgency,
      rating,
      matchesPlayed,
      arenaName,
      city,
    })
  );
  const [appliedPrice, setAppliedPrice] = useState<number | null>(null);

  useEffect(() => {
    setModality(initialModality);
  }, [initialModality]);

  useEffect(() => {
    setTechnicalLevel(initialTechnicalLevel);
  }, [initialTechnicalLevel]);

  const autoClassified = useMemo(
    () =>
      classifyGoalkeeperTier({
        rating,
        matchesPlayed,
        technicalLevel,
      }),
    [rating, matchesPlayed, technicalLevel]
  );

  const inputPayload: CacheSuggestionInput = useMemo(
    () => ({
      modality,
      technicalLevel,
      distanceKm,
      urgency,
      rating,
      matchesPlayed,
      pinnedTier,
      arenaName,
      city,
    }),
    [modality, technicalLevel, distanceKm, urgency, rating, matchesPlayed, pinnedTier, arenaName, city]
  );

  // Atualização instantânea determinística ao ajustar qualquer parâmetro ou faixa fixada
  useEffect(() => {
    const instant = calculateSmartCacheEstimate(inputPayload);
    setAiResult(instant);
    setAppliedPrice(null);
  }, [inputPayload]);

  const handleAnalyzeWithAi = async () => {
    setIsQueryingAi(true);
    try {
      const result = await fetchAiCacheSuggestion(inputPayload);
      setAiResult(result);
    } finally {
      setIsQueryingAi(false);
    }
  };

  const handleSelectTierCard = (tierCode: PricingTierCode) => {
    if (pinnedTier === tierCode) {
      setPinnedTier(null);
      return;
    }
    setPinnedTier(tierCode);
    setTechnicalLevel(technicalLevelToTierOption(tierCode));
  };

  const handleApply = () => {
    setAppliedPrice(aiResult.suggestedPrice);
    onApplyPrice(aiResult.suggestedPrice, {
      technicalLevel: technicalLevelToTierOption(aiResult.tierCode),
      modality,
      tierCode: aiResult.tierCode,
      pinned: Boolean(pinnedTier),
    });
  };

  return (
    <div className="rounded-2xl bg-slate-50 dark:bg-[#020617] border border-sky-500/35 p-4 space-y-4 transition-colors">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/35 flex items-center justify-center text-sky-600 dark:text-[#38bdf8] shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-display font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
              IA de Cachê & Faixas Oficiais (Itapeva-SP)
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Classificação automática por nota e jogos · Taxa fixa da casa R$ 5,00
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleAnalyzeWithAi}
          disabled={isQueryingAi}
          className="px-3 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-[11px] font-semibold text-sky-700 dark:text-[#38bdf8] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isQueryingAi ? 'animate-spin' : ''}`} />
          <span>{isQueryingAi ? 'Consultando IA...' : 'Consultar IA'}</span>
        </button>
      </div>

      {/* Banner de Classificação Automática por Nota Média e Histórico */}
      {typeof rating === 'number' && rating > 0 && (
        <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="text-slate-700 dark:text-slate-200">
            <span className="font-bold text-emerald-700 dark:text-[#22c55e]">
              Classificação Automática:
            </span>{' '}
            Nota <strong className="font-mono">{rating.toFixed(2)}★</strong> ({matchesPlayed ?? 0}{' '}
            partidas) → <strong className="font-mono">{autoClassified.label}</strong>
          </div>
          <button
            type="button"
            onClick={() => {
              setPinnedTier(null);
              setTechnicalLevel(technicalLevelToTierOption(autoClassified.tierCode));
            }}
            className="text-[11px] font-bold text-sky-700 dark:text-[#38bdf8] hover:underline cursor-pointer"
          >
            {pinnedTier ? 'Voltar ao Auto IA' : 'Modo Auto Ativo ✓'}
          </button>
        </div>
      )}

      {/* 3 Faixas Fixas Regionais de Itapeva (Fixar ou Sugerir) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            Faixas Fixas ParedãoGK (clique para fixar ou deixe no Auto IA):
          </span>
          {pinnedTier && (
            <button
              type="button"
              onClick={() => setPinnedTier(null)}
              className="text-[10px] font-mono text-sky-600 dark:text-[#38bdf8] hover:underline cursor-pointer"
            >
              Liberar Auto IA
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {ITAPEVA_PRICING_TIERS.map((tier) => {
            const isActive = aiResult.tierCode === tier.tierCode;
            const isPinned = pinnedTier === tier.tierCode;
            return (
              <button
                key={tier.tierCode}
                type="button"
                onClick={() => handleSelectTierCard(tier.tierCode)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-500/15 dark:bg-emerald-500/15 border-[#22c55e] shadow-sm'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-sky-500/40'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-extrabold text-slate-900 dark:text-white">
                    Faixa {tier.tierNumber} · {tier.technicalLevelLabel}
                  </span>
                  <span className="font-mono tabular-nums text-xs font-extrabold text-emerald-600 dark:text-[#22c55e]">
                    R$ {tier.totalPrice}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                  R$ {tier.goalkeeperNet} goleiro + R$ {tier.houseFee} casa
                </div>
                <div className="text-[10px] font-mono text-sky-700 dark:text-[#38bdf8] mt-0.5 flex items-center justify-between">
                  <span>{tier.ratingRule}</span>
                  {isPinned && <span className="font-bold">FIXADA</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Controls Grid */}
      <div className={`grid grid-cols-1 ${compact ? 'gap-3' : 'sm:grid-cols-2 gap-3.5'}`}>
        {/* Modalidade */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
            Modalidade
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {(['Society', 'Fut7', 'Futsal', 'Campo 11'] as ModalityType[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModality(m)}
                className={`py-1.5 px-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap truncate ${
                  modality === m
                    ? 'bg-[#22c55e] text-slate-950 border-[#22c55e] font-bold'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Nível Técnico */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5 flex items-center gap-1">
            <Award className="w-3.5 h-3.5 text-sky-600 dark:text-[#38bdf8]" />
            <span>Nível Técnico do Goleiro</span>
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { value: 'Iniciante' as TechnicalLevelOption, label: 'Iniciante' },
                { value: 'Intermediário' as TechnicalLevelOption, label: 'Intermed.' },
                { value: 'Elite / Profissional' as TechnicalLevelOption, label: 'Elite / Av.' },
              ]
            ).map((lvl) => {
              const isSelected =
                technicalLevel === lvl.value ||
                (lvl.value === 'Elite / Profissional' && technicalLevel === 'Avançado');
              return (
                <button
                  key={lvl.value}
                  type="button"
                  onClick={() => {
                    setPinnedTier(null);
                    setTechnicalLevel(lvl.value);
                  }}
                  className={`py-1.5 px-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer truncate ${
                    isSelected
                      ? 'bg-[#38bdf8] text-slate-950 border-[#38bdf8] font-bold'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {lvl.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Distância em km */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-[#22c55e]" />
              Distância até a Arena
            </span>
            <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
              {distanceKm} km
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={25}
            step={1}
            value={distanceKm}
            onChange={(e) => setDistanceKm(Number(e.target.value))}
            className="w-full accent-[#22c55e] cursor-pointer"
          />
          <div className="flex justify-between text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
            <span>1 km (local)</span>
            <span>12 km</span>
            <span>25 km</span>
          </div>
        </div>

        {/* Urgência */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5 flex items-center gap-1">
            <GkWhistleIcon className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            <span>Urgência da Convocação</span>
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: 'normal' as CacheUrgencyLevel, label: 'Normal' },
              { id: 'same_day' as CacheUrgencyLevel, label: 'Hoje (<6h)' },
              { id: 'sos_urgent' as CacheUrgencyLevel, label: 'SOS (<2h)' },
            ].map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setUrgency(u.id)}
                className={`py-1.5 px-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                  urgency === u.id
                    ? u.id === 'sos_urgent'
                      ? 'bg-amber-400 text-slate-950 border-amber-400 font-bold'
                      : 'bg-emerald-500/20 text-emerald-700 dark:text-[#22c55e] border-emerald-500/50 font-bold'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Resultado e Composição Regional (Total = Líquido GK + Taxa da Casa R$ 5) */}
      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
              <span>{aiResult.tierLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-sky-600 dark:text-[#38bdf8]">
                {pinnedTier
                  ? 'Faixa Fixada Manualmente'
                  : aiResult.source === 'gemini-ai'
                  ? 'Análise Gemini IA'
                  : 'Classificação Auto IA'}
              </span>
            </div>
            <div className="flex items-baseline gap-2.5 mt-0.5 flex-wrap">
              <span className="font-mono tabular-nums text-2xl font-extrabold text-emerald-600 dark:text-[#22c55e]">
                {formatCurrency(aiResult.suggestedPrice)}
              </span>
              <span className="text-xs font-mono tabular-nums text-sky-700 dark:text-[#38bdf8]">
                Goleiro: {formatCurrency(aiResult.goalkeeperNet)} + Casa: {formatCurrency(aiResult.houseFee)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleApply}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#22c55e] to-emerald-600 hover:brightness-110 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 cursor-pointer transition-all active:scale-95 whitespace-nowrap shrink-0"
          >
            {appliedPrice === aiResult.suggestedPrice ? (
              <>
                <Check className="w-4 h-4" />
                <span>Faixa Aplicada!</span>
              </>
            ) : (
              <>
                <GkCoinPixIcon className="w-4 h-4 text-slate-950" />
                <span>
                  {pinnedTier
                    ? `Fixar ${formatCurrency(aiResult.suggestedPrice)}`
                    : `Aplicar ${formatCurrency(aiResult.suggestedPrice)}`}
                </span>
              </>
            )}
          </button>
        </div>

        {/* Breakdown tabular oficial Itapeva */}
        <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-slate-200 dark:border-slate-800/80 text-[11px]">
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">Repasse Goleiro</span>
            <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-[#22c55e]">
              {formatCurrency(aiResult.goalkeeperNet)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">Taxa Fixa da Casa</span>
            <span className="font-mono tabular-nums font-bold text-sky-600 dark:text-[#38bdf8]">
              {formatCurrency(aiResult.houseFee)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">Total Convocação</span>
            <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
              {formatCurrency(aiResult.suggestedPrice)}
            </span>
          </div>
        </div>

        {/* Racional da IA */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
          <p className="leading-relaxed">{aiResult.rationale}</p>
          {aiResult.tips.length > 0 && (
            <div className="text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
              {aiResult.tips.map((tip, i) => (
                <span key={i}>• {tip}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
