import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GkCloseIcon as X,
  GkSettingsIcon as Sliders,
  GkCheckIcon as Check,
  GkCameraIcon as Camera,
  GkCoinPixIcon,
  GkStarRatingIcon as Star,
} from './icons';
import { ModalityType, PricingTierCode, TechnicalLevelOption, UserProfile } from '../types';
import { CachePricingAssistant } from './CachePricingAssistant';
import { formatCurrency } from '../utils/validations';
import { updateUserPricingProfileInSupabase } from '../lib/supabaseClient';
import {
  ITAPEVA_PRICING_TIERS,
  classifyGoalkeeperTier,
  getGoalkeeperNetAndFee,
  getTierByTotalPrice,
  technicalLevelToTierOption,
} from '../utils/cachePricingAI';

interface ProfilePricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onSaveProfile: (updates: Partial<UserProfile>) => void;
  onOpenAvatarModal?: () => void;
}

export const ProfilePricingModal: React.FC<ProfilePricingModalProps> = ({
  isOpen,
  onClose,
  user,
  onSaveProfile,
  onOpenAvatarModal,
}) => {
  const autoTier = useMemo(
    () =>
      classifyGoalkeeperTier({
        rating: user.rating,
        matchesPlayed: user.matchesPlayed,
        technicalLevel: user.technicalLevel,
      }),
    [user.rating, user.matchesPlayed, user.technicalLevel]
  );

  const [nickname, setNickname] = useState(user.nickname || '');
  const [neighborhood, setNeighborhood] = useState(user.neighborhood || '');
  const [city, setCity] = useState(user.city || 'Itapeva - SP');
  const [favoriteGloves, setFavoriteGloves] = useState(user.favoriteGloves || '');
  const [tierPinned, setTierPinned] = useState<boolean>(Boolean(user.tierPinned));
  const [technicalLevel, setTechnicalLevel] = useState<TechnicalLevelOption>(
    user.technicalLevel || technicalLevelToTierOption(autoTier.tierCode)
  );
  const [preferredCache, setPreferredCache] = useState<number>(
    user.preferredCache && [20, 25, 30].includes(user.preferredCache)
      ? user.preferredCache
      : autoTier.totalPrice
  );
  const [selectedModality, setSelectedModality] = useState<ModalityType>('Society');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setNickname(user.nickname || '');
    setNeighborhood(user.neighborhood || '');
    setCity(user.city || 'Itapeva - SP');
    setFavoriteGloves(user.favoriteGloves || '');
    setTierPinned(Boolean(user.tierPinned));
    const initialPrice =
      user.tierPinned && user.preferredCache && [20, 25, 30].includes(user.preferredCache)
        ? user.preferredCache
        : autoTier.totalPrice;
    setPreferredCache(initialPrice);
    setTechnicalLevel(
      user.technicalLevel || technicalLevelToTierOption(getTierByTotalPrice(initialPrice).tierCode)
    );
  }, [isOpen, user, autoTier]);

  if (!isOpen) return null;

  const activeTier = getTierByTotalPrice(preferredCache);
  const feeSplit = getGoalkeeperNetAndFee(activeTier.totalPrice);

  const handleSelectTier = (tierCode: PricingTierCode, pinned: boolean) => {
    const chosen =
      ITAPEVA_PRICING_TIERS.find((t) => t.tierCode === tierCode) || autoTier;
    setTierPinned(pinned);
    setPreferredCache(chosen.totalPrice);
    setTechnicalLevel(technicalLevelToTierOption(chosen.tierCode));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateUserPricingProfileInSupabase({
        userId: user.id,
        preferredCache: activeTier.totalPrice,
        technicalLevel,
        nickname: nickname.trim() || user.nickname,
        neighborhood: neighborhood.trim() || user.neighborhood,
        city: city.trim() || user.city,
        favoriteGloves: favoriteGloves.trim() || user.favoriteGloves,
      });

      onSaveProfile({
        nickname: nickname.trim() || user.nickname,
        neighborhood: neighborhood.trim() || user.neighborhood,
        city: city.trim() || user.city,
        favoriteGloves: favoriteGloves.trim() || user.favoriteGloves,
        technicalLevel,
        preferredCache: activeTier.totalPrice,
        pricingTier: activeTier.tierCode,
        tierPinned,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/85 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#020617]/80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-600 dark:text-[#22c55e]">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Configurações de Perfil & Faixa de Cachê (Itapeva-SP)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Classificação automática por nota/jogos ou fixação nas 3 faixas oficiais
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-5">
            {/* Avatar & Identity quick bar */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#020617]/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="w-12 h-12 rounded-xl object-cover border border-emerald-500/50 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-800 border border-emerald-500/50 shrink-0 flex items-center justify-center font-display font-black text-sm text-emerald-600 dark:text-[#22c55e]">
                    {(user.name || 'GK')
                      .split(' ')
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((n) => n[0]?.toUpperCase() || '')
                      .join('')}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                    {user.name}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5">
                    <span>{user.role === 'goleiro' ? 'Goleiro GK' : 'Contratante / Capitão'}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-0.5 font-mono text-emerald-600 dark:text-[#22c55e] font-bold">
                      <Star className="w-3 h-3 fill-emerald-500 dark:fill-[#22c55e]" />
                      {user.rating.toFixed(2)}
                    </span>
                    <span>·</span>
                    <span className="font-mono">{user.matchesPlayed} jogos</span>
                  </div>
                </div>
              </div>

              {onOpenAvatarModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAvatarModal();
                  }}
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-white flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                >
                  <Camera className="w-3.5 h-3.5 text-emerald-600 dark:text-[#22c55e]" />
                  <span>Trocar Foto</span>
                </button>
              )}
            </div>

            {/* Dados do Perfil */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Apelido em Campo
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Ex: Muralha GK"
                  className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Bairro Base
                </label>
                <input
                  type="text"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  placeholder="Ex: Jardim Ferrari"
                  className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Cidade
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Ex: Itapeva - SP"
                  className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Luva Preferida
                </label>
                <input
                  type="text"
                  value={favoriteGloves}
                  onChange={(e) => setFavoriteGloves(e.target.value)}
                  placeholder="Ex: Poker Deep Grip Pro"
                  className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Classificação Automática vs Fixação de Faixa (R$ 20 / R$ 25 / R$ 30) */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#020617] border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <GkCoinPixIcon className="w-4 h-4 text-emerald-600 dark:text-[#22c55e]" />
                    Faixa de Cachê Base por Partida
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Pela sua nota ({user.rating.toFixed(2)}★) e histórico ({user.matchesPlayed} jogos), a IA indica{' '}
                    <strong className="text-emerald-600 dark:text-[#22c55e]">{autoTier.label}</strong>.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleSelectTier(autoTier.tierCode, false)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                    !tierPinned
                      ? 'bg-[#22c55e] text-slate-950 border-[#22c55e]'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sky-600 dark:text-[#38bdf8]'
                  }`}
                >
                  {!tierPinned ? '✓ Automático por Nota/Jogos' : 'Usar Auto IA'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {ITAPEVA_PRICING_TIERS.map((tier) => {
                  const isSelected = activeTier.tierCode === tier.tierCode;
                  return (
                    <button
                      key={tier.tierCode}
                      type="button"
                      onClick={() => handleSelectTier(tier.tierCode, true)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500/15 border-[#22c55e] shadow-md shadow-emerald-500/10'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-sky-500/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                          Faixa {tier.tierNumber}
                        </span>
                        <span className="font-mono tabular-nums text-sm font-extrabold text-emerald-600 dark:text-[#22c55e]">
                          {formatCurrency(tier.totalPrice)}
                        </span>
                      </div>
                      <div className="text-[11px] font-semibold text-sky-700 dark:text-[#38bdf8] mt-0.5">
                        {tier.technicalLevelLabel}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                        Líquido GK: <strong>R$ {tier.goalkeeperNet},00</strong> + Taxa R$ {tier.houseFee},00
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                        {tier.ratingRule}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Assistente IA de Precificação no Perfil */}
            <CachePricingAssistant
              initialModality={selectedModality}
              initialTechnicalLevel={technicalLevel}
              initialDistanceKm={6}
              initialUrgency="normal"
              rating={user.rating}
              matchesPlayed={user.matchesPlayed}
              city={city}
              onApplyPrice={(suggested, meta) => {
                setPreferredCache(suggested);
                if (meta?.technicalLevel) setTechnicalLevel(meta.technicalLevel);
                if (meta?.modality) setSelectedModality(meta.modality);
                if (typeof meta?.pinned === 'boolean') setTierPinned(meta.pinned);
              }}
            />

            {/* Footer */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                <span>{activeTier.label}: </span>
                <strong className="text-emerald-600 dark:text-[#22c55e]">
                  {formatCurrency(feeSplit.totalPrice)}
                </strong>
                <span className="text-sky-600 dark:text-[#38bdf8] ml-1.5">
                  ({formatCurrency(feeSplit.goalkeeperNet)} GK + {formatCurrency(feeSplit.houseFee)} casa)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-[#22c55e] hover:brightness-110 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSaving ? 'Salvando...' : 'Salvar Perfil & Faixa'}</span>
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
