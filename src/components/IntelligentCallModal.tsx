import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  GkCloseIcon as X,
  GkRadarIcon as Radar,
  GkCalendarIcon as Calendar,
  GkClockIcon as Clock,
  GkMapPinIcon as MapPin,
  GkShieldIcon as Shield,
  GkCheckCircleIcon as CheckCircle2,
  GkFlameIcon as Sparkles,
  GkCoinPixIcon as DollarSign,
  GkMetricsIcon as Award,
  GkFlameIcon as Zap,
  GkCheckIcon as Check,
  GkCopyIcon as Copy,
  GkQrCodeIcon as QrCode,
  GkCheckCircleIcon as AlertCircle,
  GkRefreshIcon as Loader2,
  GkSearchIcon as Search,
  GkProfileIcon as UserIcon,
  GkGloveBallIcon,
} from './icons';
import {
  ModalityType,
  MatchBooking,
  Goalkeeper,
  UserProfile,
  WeeklyMatchTemplate,
  ArenaField,
  GameDifficultyLevel,
  MatchGoalkeeperSlot,
} from '../types';
import { formatCurrency } from '../utils/validations';
import {
  broadcastBookingConfirmed,
  confirmMatchCustodySplit,
  dispatchConvocationNotifications,
  generateMercadoPagoPixCharge,
  queryEligibleGoalkeepersWithinRadius,
} from '../lib/supabaseClient';
import { CachePricingAssistant } from './CachePricingAssistant';
import {
  ITAPEVA_HOUSE_FEE,
  ITAPEVA_PRICING_TIERS,
  classifyGoalkeeperTier,
  getTierByTotalPrice,
} from '../utils/cachePricingAI';
import {
  computeEndTimeFromStartAndDuration,
  formatDurationLabel,
} from '../utils/geoMatchmaking';

interface MercadoPagoPixResponse {
  id: string;
  status: string;
  amount: number;
  qrCodeText: string;
  qrCodeBase64: string | null;
  expiresAt: string;
  idempotencyKey?: string;
  provider?: string;
}

interface IntelligentCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookingConfirmed: (booking: MatchBooking) => void;
  user?: UserProfile;
  prefillTemplate?: WeeklyMatchTemplate | null;
  prefillGoalkeeper?: Goalkeeper | null;
  prefillArena?: ArenaField | null;
  approvedArenas?: ArenaField[];
  recentMatches?: MatchBooking[];
  onOpenAuth?: () => void;
}

const DIFFICULTY_OPTIONS: GameDifficultyLevel[] = [
  'Não quero informar',
  'Fácil',
  'Médio',
  'Difícil',
];

const DURATION_OPTIONS = [60, 90, 120, 150];

const FIELD_MODALITIES: ModalityType[] = [
  'Society',
  'Fut7',
  'Futsal',
  'Campo 11',
  'Areia',
];

function getTodayIsoLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getRelativeIsoLocal(daysAhead: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + daysAhead);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatIsoDateBr(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const today = getTodayIsoLocal();
  const tomorrow = getRelativeIsoLocal(1);
  if (isoDate === today) return 'Hoje';
  if (isoDate === tomorrow) return 'Amanhã';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function mapDifficultyToLegacyLevel(
  diff: GameDifficultyLevel
): 'Resenha / Amigável' | 'Competitivo' | 'Varzea / Torneio' {
  if (diff === 'Difícil') return 'Varzea / Torneio';
  if (diff === 'Fácil' || diff === 'Não quero informar') return 'Resenha / Amigável';
  return 'Competitivo';
}

export const IntelligentCallModal: React.FC<IntelligentCallModalProps> = ({
  isOpen,
  onClose,
  onBookingConfirmed,
  user,
  prefillTemplate,
  prefillGoalkeeper,
  prefillArena,
  approvedArenas = [],
  recentMatches = [],
  onOpenAuth,
}) => {
  const [step, setStep] = useState<'configure' | 'scanning' | 'matched' | 'mercadopago_pix'>('configure');

  // 1. Data, Início & Duração
  const [dateIso, setDateIso] = useState<string>(getTodayIsoLocal());
  const [startTime, setStartTime] = useState<string>('20:00');
  const [durationMinutes, setDurationMinutes] = useState<number>(90);

  // 2. Local & Detalhes
  const [arenaSearch, setArenaSearch] = useState<string>('');
  const [arenaName, setArenaName] = useState<string>(
    approvedArenas[0]?.name || 'Araxá Futebol Society e Escolinha'
  );
  const [address, setAddress] = useState<string>(
    approvedArenas[0]?.address || 'Itapeva - SP'
  );
  const [modality, setModality] = useState<ModalityType>('Society');

  // 3. Nível do Jogo
  const [gameLevel, setGameLevel] = useState<GameDifficultyLevel>('Médio');

  // 4. Vagas de Goleiros (1 ou 2 + Aleatório ou Específico)
  const [slotsCount, setSlotsCount] = useState<1 | 2>(1);
  const [slotConfigs, setSlotConfigs] = useState<MatchGoalkeeperSlot[]>([
    { slotIndex: 1, mode: 'random', status: 'open' },
  ]);
  const [activeSlotPicker, setActiveSlotPicker] = useState<number | null>(null);
  const [eligibleRadiusGks, setEligibleRadiusGks] = useState<Goalkeeper[]>([]);
  const [isLoadingRadiusGks, setIsLoadingRadiusGks] = useState(false);
  const [gkSearchFilter, setGkSearchFilter] = useState('');

  // 5. Cachê por Vaga & Notas
  const [pricePerSlot, setPricePerSlot] = useState<number>(25);
  const [notes, setNotes] = useState(
    'Camisa do nosso time é azul. Procuramos goleiro pontual e comunicativo.'
  );
  const [showAiPricing, setShowAiPricing] = useState(false);

  // Matchmaking 30km + Dispatch stats
  const [radiusDispatchResult, setRadiusDispatchResult] = useState<{
    eligibleCount: number;
    panelNotifiedCount: number;
    whatsappSentCount: number;
    evolutionConfigured: boolean;
  } | null>(null);
  const [createdMatchId, setCreatedMatchId] = useState<string>('');

  // Pagamento Pix Mercado Pago / Custódia
  const [isGeneratingPix, setIsGeneratingPix] = useState(false);
  const [mpPixData, setMpPixData] = useState<MercadoPagoPixResponse | null>(null);
  const [hasCopiedPix, setHasCopiedPix] = useState(false);
  const [pixError, setPixError] = useState('');
  const [countdownSeconds, setCountdownSeconds] = useState(900);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);

  // Combinar Locais Recentes das partidas + Arenas Oficiais de Itapeva
  const availableLocations = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; address: string; modality: ModalityType; source: 'recent' | 'official' }
    >();

    recentMatches.forEach((m, idx) => {
      const key = m.arenaName.trim().toLowerCase();
      if (key && !map.has(key)) {
        map.set(key, {
          id: `recent-${idx}`,
          name: m.arenaName,
          address: m.address || 'Itapeva - SP',
          modality: m.modality || 'Society',
          source: 'recent',
        });
      }
    });

    approvedArenas.forEach((a) => {
      const key = a.name.trim().toLowerCase();
      if (key && !map.has(key)) {
        map.set(key, {
          id: a.id,
          name: a.name,
          address: a.address,
          modality: a.mainModality || 'Society',
          source: 'official',
        });
      }
    });

    const list = Array.from(map.values());
    if (!arenaSearch.trim()) return list;
    const q = arenaSearch.trim().toLowerCase();
    return list.filter(
      (loc) =>
        loc.name.toLowerCase().includes(q) || loc.address.toLowerCase().includes(q)
    );
  }, [recentMatches, approvedArenas, arenaSearch]);

  // Preencher dados iniciais quando abre o modal
  useEffect(() => {
    if (!isOpen) return;
    setPixError('');
    setMpPixData(null);
    setRadiusDispatchResult(null);
    setActiveSlotPicker(null);

    if (prefillArena) {
      setArenaName(prefillArena.name);
      setAddress(prefillArena.address);
      setModality(prefillArena.mainModality);
      setNotes(
        prefillArena.description
          ? `${prefillArena.surfaceType} · ${prefillArena.description}`
          : `Partida na ${prefillArena.name} (${prefillArena.surfaceType}).`
      );
      setSlotsCount(1);
      setSlotConfigs([{ slotIndex: 1, mode: 'random', status: 'open' }]);
      setStep('configure');
    } else if (prefillTemplate) {
      setModality(prefillTemplate.modality);
      setArenaName(prefillTemplate.arenaName);
      setAddress(prefillTemplate.address);
      setGameLevel(
        prefillTemplate.competitiveLevel === 'Varzea / Torneio'
          ? 'Difícil'
          : prefillTemplate.competitiveLevel === 'Resenha / Amigável'
          ? 'Fácil'
          : 'Médio'
      );
      setPricePerSlot(getTierByTotalPrice(prefillTemplate.price).totalPrice);
      const parsedStart = prefillTemplate.time.split('-')[0]?.trim() || '20:00';
      if (/^\d{2}:\d{2}$/.test(parsedStart)) setStartTime(parsedStart);
      if (prefillTemplate.notes) setNotes(prefillTemplate.notes);
      setSlotsCount(1);
      setSlotConfigs([{ slotIndex: 1, mode: 'random', status: 'open' }]);
      setStep('configure');
    } else if (prefillGoalkeeper) {
      const gkTier = classifyGoalkeeperTier({
        rating: prefillGoalkeeper.rating,
        matchesPlayed: prefillGoalkeeper.matchesPlayed,
        technicalLevel: prefillGoalkeeper.level,
      });
      const validPrice = [20, 25, 30].includes(prefillGoalkeeper.pricePerMatch)
        ? prefillGoalkeeper.pricePerMatch
        : gkTier.totalPrice;
      setPricePerSlot(validPrice);
      setSlotsCount(1);
      setSlotConfigs([
        {
          slotIndex: 1,
          mode: 'specific',
          goalkeeperId: prefillGoalkeeper.id,
          goalkeeperName: prefillGoalkeeper.name,
          goalkeeperPhoto: prefillGoalkeeper.photo,
          distanceKm: prefillGoalkeeper.distanceKm,
          status: 'open',
        },
      ]);
      setStep('configure');
    } else {
      const defaultArena =
        approvedArenas.find((a) => a.name.toLowerCase().includes('araxá')) ||
        approvedArenas[0];
      if (defaultArena) {
        setArenaName(defaultArena.name);
        setAddress(defaultArena.address);
        setModality(defaultArena.mainModality);
      }
      setPricePerSlot(25);
      setSlotsCount(1);
      setSlotConfigs([{ slotIndex: 1, mode: 'random', status: 'open' }]);
      setStep('configure');
    }
  }, [isOpen, prefillArena, prefillTemplate, prefillGoalkeeper, approvedArenas]);

  // Manter array de slots sincronizado com slotsCount (1 ou 2)
  useEffect(() => {
    setSlotConfigs((prev) => {
      if (slotsCount === 1) {
        return [prev[0] || { slotIndex: 1, mode: 'random', status: 'open' }];
      }
      return [
        prev[0] || { slotIndex: 1, mode: 'random', status: 'open' },
        prev[1] || { slotIndex: 2, mode: 'random', status: 'open' },
      ];
    });
  }, [slotsCount]);

  // Countdown Pix
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (step === 'mercadopago_pix' && countdownSeconds > 0) {
      timer = setInterval(() => {
        setCountdownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, countdownSeconds]);

  // Buscar goleiros elegíveis no raio de 30 km sempre que o modal estiver aberto
  const loadEligibleGoalkeepers30Km = async () => {
    setIsLoadingRadiusGks(true);
    try {
      const res = await queryEligibleGoalkeepersWithinRadius({
        city: address.toLowerCase().includes('itapeva') ? 'Itapeva - SP' : 'Itapeva - SP',
        arenaName,
        address,
        modality,
        maxRadiusKm: 30,
      });
      setEligibleRadiusGks(res.goalkeepers);
      return res.goalkeepers;
    } catch {
      return [];
    } finally {
      setIsLoadingRadiusGks(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadEligibleGoalkeepers30Km();
    }
  }, [isOpen, arenaName, address]);

  if (!isOpen) return null;

  const timeRange = computeEndTimeFromStartAndDuration(startTime, durationMinutes);
  const formattedDate = formatIsoDateBr(dateIso);

  const totalPrice = Number((pricePerSlot * slotsCount).toFixed(2));
  const totalHouseFee = Number(Math.min(totalPrice, ITAPEVA_HOUSE_FEE * slotsCount).toFixed(2));
  const totalNetCustody = Number(Math.max(0, totalPrice - totalHouseFee).toFixed(2));
  const netPerSlot = Number((totalNetCustody / slotsCount).toFixed(2));

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleSetSlotMode = (slotNum: number, mode: 'random' | 'specific') => {
    setSlotConfigs((prev) =>
      prev.map((s) =>
        s.slotIndex === slotNum
          ? {
              ...s,
              mode,
              ...(mode === 'random'
                ? {
                    goalkeeperId: undefined,
                    goalkeeperName: undefined,
                    goalkeeperPhoto: undefined,
                    distanceKm: undefined,
                    status: 'open' as const,
                  }
                : {}),
            }
          : s
      )
    );
    if (mode === 'specific') {
      setActiveSlotPicker(slotNum);
      if (eligibleRadiusGks.length === 0) {
        loadEligibleGoalkeepers30Km();
      }
    } else if (activeSlotPicker === slotNum) {
      setActiveSlotPicker(null);
    }
  };

  const handlePickSpecificGoalkeeper = (slotNum: number, gk: Goalkeeper) => {
    setSlotConfigs((prev) =>
      prev.map((s) =>
        s.slotIndex === slotNum
          ? {
              ...s,
              mode: 'specific',
              goalkeeperId: gk.id,
              goalkeeperName: gk.name,
              goalkeeperPhoto: gk.photo,
              distanceKm: gk.distanceKm,
              status: 'open',
            }
          : s
      )
    );
    setActiveSlotPicker(null);
  };

  const buildMatchDraft = (overrideId?: string, paymentStatus: 'paid' | 'pending' = 'pending'): MatchBooking => {
    const matchId = overrideId || createdMatchId || `mtch-${Date.now()}`;
    const assignedNames = slotConfigs
      .map((s) => s.goalkeeperName)
      .filter(Boolean) as string[];
    const hasAllAssigned = slotConfigs.every((s) => Boolean(s.goalkeeperId));

    const selectionModes = new Set(slotConfigs.map((s) => s.mode));
    const resolvedSelectionMode: 'random' | 'specific' | 'mixed' =
      selectionModes.size > 1 ? 'mixed' : slotConfigs[0]?.mode || 'random';

    return {
      id: matchId,
      organizerId: user?.id || 'usr-current',
      organizerName: user?.name || 'Organizador ParedãoGK',
      goalkeeperId: slotConfigs[0]?.goalkeeperId,
      goalkeeperName:
        assignedNames.length > 0
          ? assignedNames.join(' & ')
          : `Aguardando ${slotsCount} Goleiro(s) (Radar 30 km)`,
      goalkeeperPhoto: slotConfigs[0]?.goalkeeperPhoto,
      arenaName,
      address,
      city: address.toLowerCase().includes('itapeva') ? 'Itapeva - SP' : user?.city || 'Itapeva - SP',
      date: formattedDate,
      dateIso,
      time: timeRange,
      durationMinutes,
      modality,
      price: totalPrice,
      houseFee: totalHouseFee,
      goalkeeperPayout: totalNetCustody,
      pricingTier: getTierByTotalPrice(pricePerSlot).tierCode,
      cashbackEarned: Number((totalPrice * 0.1).toFixed(2)),
      status: hasAllAssigned ? 'confirmed' : 'searching',
      competitiveLevel: mapDifficultyToLegacyLevel(gameLevel),
      gameLevel,
      goalkeeperSlotsCount: slotsCount,
      selectionMode: resolvedSelectionMode,
      slots: slotConfigs,
      operationalStatus: hasAllAssigned ? 'accepted' : 'awaiting_acceptance',
      radiusKm: 30,
      notifiedGoalkeepersCount: radiusDispatchResult?.eligibleCount || eligibleRadiusGks.length,
      notes,
      paymentStatus,
      createdAt: new Date().toISOString(),
      checkin2hConfirmed: false,
      enRoute45mConfirmed: false,
      enRoute20mNotified: false,
      enRoute20mConfirmed: false,
      isWeeklyRecurrence: Boolean(prefillTemplate),
      templateId: prefillTemplate?.id,
    };
  };

  // Etapa 2: Matchmaking por Raio (30 km) + Notificação Painel / WhatsApp Evolution API
  const handleStartRadarMatchmaking = async () => {
    setStep('scanning');
    setPixError('');
    const newMatchId = `mtch-${Date.now()}`;
    setCreatedMatchId(newMatchId);

    const startedAt = Date.now();
    const candidates30Km = await loadEligibleGoalkeepers30Km();

    // Para vagas configuradas como "Aleatório", tentar pré-parear candidatos elegíveis no raio de 30 km
    const usedIds = new Set(
      slotConfigs.map((s) => s.goalkeeperId).filter(Boolean) as string[]
    );

    const updatedSlots: MatchGoalkeeperSlot[] = slotConfigs.map((slot) => {
      if (slot.mode === 'specific' && slot.goalkeeperId) {
        return slot;
      }
      const nextCandidate = candidates30Km.find(
        (gk) => !usedIds.has(gk.id) && gk.availableToday
      ) || candidates30Km.find((gk) => !usedIds.has(gk.id));

      if (nextCandidate) {
        usedIds.add(nextCandidate.id);
        return {
          ...slot,
          mode: 'random',
          goalkeeperId: nextCandidate.id,
          goalkeeperName: nextCandidate.name,
          goalkeeperPhoto: nextCandidate.photo,
          distanceKm: nextCandidate.distanceKm,
          status: 'open',
        };
      }
      return { ...slot, mode: 'random', status: 'open' };
    });

    setSlotConfigs(updatedSlots);

    const selectedIds = updatedSlots
      .map((s) => s.goalkeeperId)
      .filter(Boolean) as string[];
    const selectionModes = new Set(updatedSlots.map((s) => s.mode));
    const resolvedMode: 'random' | 'specific' | 'mixed' =
      selectionModes.size > 1 ? 'mixed' : updatedSlots[0]?.mode || 'random';

    const previewDraft = buildMatchDraft(newMatchId, 'pending');
    previewDraft.slots = updatedSlots;

    const dispatchRes = await dispatchConvocationNotifications({
      matchId: newMatchId,
      arenaName,
      address,
      city: 'Itapeva - SP',
      date: formattedDate,
      time: timeRange,
      durationMinutes,
      modality,
      gameLevel,
      price: totalPrice,
      slotsCount,
      radiusKm: 30,
      organizerName: user?.name || 'Contratante ParedãoGK',
      selectionMode: resolvedMode,
      selectedGoalkeeperIds: selectedIds,
      eligibleGoalkeepers: candidates30Km,
      bookingPayload: previewDraft,
    });

    setRadiusDispatchResult({
      eligibleCount: dispatchRes.eligibleCount,
      panelNotifiedCount: dispatchRes.panelNotifiedCount,
      whatsappSentCount: dispatchRes.whatsappSentCount,
      evolutionConfigured: dispatchRes.evolutionConfigured,
    });

    const elapsed = Date.now() - startedAt;
    const waitMs = Math.max(0, 1000 - elapsed);
    setTimeout(() => {
      setStep('matched');
    }, waitMs);
  };

  // Gerar cobrança Pix Mercado Pago respeitando múltiplas vagas e Taxa da Casa (R$ 5,00/vaga)
  const handleGenerateMercadoPagoPix = async () => {
    if (!user || user.id === 'usr-guest' || !user.email) {
      setPixError(
        'Faça login com sua conta antes de gerar o Pix da convocação para validar seus dados de pagador.'
      );
      if (onOpenAuth) onOpenAuth();
      return;
    }

    setIsGeneratingPix(true);
    setPixError('');

    try {
      const matchId = createdMatchId || `mtch-${Date.now()}`;
      const gkIds = slotConfigs
        .map((s) => s.goalkeeperId)
        .filter(Boolean) as string[];
      const gkNames = slotConfigs
        .map((s) => s.goalkeeperName)
        .filter(Boolean)
        .join(' & ');

      const data = await generateMercadoPagoPixCharge({
        amount: totalPrice,
        userId: user.id,
        goalkeeperId: gkIds[0],
        goalkeeperIds: gkIds,
        slotsCount,
        goalkeeperName: gkNames || 'Vaga Radar 30km',
        arenaName,
        type: 'match_booking',
        description: `Convocacao ${slotsCount} GK - ${arenaName}`,
        matchId,
        customer: {
          name: user.name,
          email: user.email,
          cpf: user.cpf,
          phone: user.phone,
        },
      });

      setMpPixData(data);
      setCountdownSeconds(900);
      setStep('mercadopago_pix');
    } catch (err: any) {
      setPixError(
        `${err?.message || 'Erro ao comunicar com a API Pix Mercado Pago.'} Você pode utilizar o saldo da carteira ou confirmar em modo de homologação.`
      );
    } finally {
      setIsGeneratingPix(false);
    }
  };

  const handleCopyPixCode = () => {
    if (!mpPixData?.qrCodeText) return;
    navigator.clipboard?.writeText(mpPixData.qrCodeText);
    setHasCopiedPix(true);
    setTimeout(() => setHasCopiedPix(false), 2200);
  };

  // Finalizar contratação com separação de custódia e taxa da casa (R$ 5,00/vaga)
  const handleFinalizeBooking = async (paymentMethod: 'pix' | 'wallet' | 'homologation') => {
    setIsConfirmingPayment(true);
    try {
      const finalBooking = buildMatchDraft(
        mpPixData?.id || createdMatchId || `mtch-${Date.now()}`,
        'paid'
      );

      await confirmMatchCustodySplit({
        match: finalBooking,
        payerUserId: user?.id,
        payerEmail: user?.email,
        paymentMethod,
        paymentId: mpPixData?.id,
      });

      await broadcastBookingConfirmed(finalBooking).catch(() => undefined);

      onBookingConfirmed(finalBooking);
      onClose();
      setStep('configure');
    } finally {
      setIsConfirmingPayment(false);
    }
  };

  const filteredPickerGks = eligibleRadiusGks.filter((gk) => {
    if (!gkSearchFilter.trim()) return true;
    const q = gkSearchFilter.toLowerCase();
    return (
      gk.name.toLowerCase().includes(q) ||
      gk.nickname.toLowerCase().includes(q) ||
      gk.neighborhood.toLowerCase().includes(q) ||
      (gk.city || '').toLowerCase().includes(q)
    );
  });

  const canPayWithWallet = Boolean(user && user.walletBalance >= totalPrice);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 dark:bg-black/85 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="relative w-full max-w-2xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-4 transition-colors"
      >
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-600 dark:text-[#22c55e] shrink-0">
              {step === 'mercadopago_pix' ? (
                <QrCode className="w-5 h-5" />
              ) : (
                <GkGloveBallIcon className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display font-extrabold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight">
                  {step === 'mercadopago_pix'
                    ? 'Pagamento Pix Mercado Pago'
                    : 'Bora Jogar! · Convocação Inteligente'}
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-[#22c55e] border border-emerald-500/30">
                  {step === 'mercadopago_pix' ? 'Mercado Pago' : 'Raio 30 km'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {step === 'mercadopago_pix'
                  ? 'Custódia garantida com separação automática da taxa da casa'
                  : 'Escolha horário, arena, nível do jogo e defina 1 ou 2 vagas de goleiro'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal Bora Jogar"
            className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* STEP 1: CONFIGURE ("BORA JOGAR!") */}
        {step === 'configure' && (
          <div className="p-4 sm:p-6 space-y-5 max-h-[78vh] overflow-y-auto">
            {/* Seção 1: Data, Início e Duração */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-emerald-600 dark:text-[#22c55e]" />
                  Data, Início e Duração
                </span>
                <span className="text-[11px] font-mono tabular-nums font-bold text-emerald-700 dark:text-[#22c55e]">
                  {formattedDate} · {timeRange} ({formatDurationLabel(durationMinutes)})
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Seletor de Data */}
                <div className="space-y-1.5">
                  <div className="flex gap-1.5">
                    {[
                      { label: 'Hoje', iso: getTodayIsoLocal() },
                      { label: 'Amanhã', iso: getRelativeIsoLocal(1) },
                      { label: '+2 dias', iso: getRelativeIsoLocal(2) },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setDateIso(preset.iso)}
                        className={`flex-1 min-h-[36px] px-2 rounded-lg text-[11px] font-bold border cursor-pointer transition-all ${
                          dateIso === preset.iso
                            ? 'bg-[#22c55e] text-slate-950 border-[#22c55e]'
                            : 'bg-white dark:bg-[#020617] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="date"
                    value={dateIso}
                    onChange={(e) => setDateIso(e.target.value)}
                    aria-label="Data da partida"
                    className="w-full h-11 px-3 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-[#22c55e]"
                  />
                </div>

                {/* Horário de Início + Duração */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="relative">
                        <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-[#22c55e] absolute left-3 top-3.5 pointer-events-none" />
                        <input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          aria-label="Horário de início"
                          className="w-full h-11 pl-9 pr-3 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-[#22c55e]"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {DURATION_OPTIONS.map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => setDurationMinutes(dur)}
                        className={`min-h-[38px] rounded-lg text-[11px] font-mono font-bold border cursor-pointer transition-all ${
                          durationMinutes === dur
                            ? 'bg-[#22c55e] text-slate-950 border-[#22c55e]'
                            : 'bg-white dark:bg-[#020617] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {formatDurationLabel(dur)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Seção 2: Local & Tipo de Campo */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-emerald-600 dark:text-[#22c55e]" />
                  Local e Tipo de Campo
                </span>
                <span className="text-[10px] font-mono text-sky-700 dark:text-[#38bdf8]">
                  Itapeva & Região (Raio 30 km)
                </span>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 pointer-events-none" />
                <input
                  type="text"
                  value={arenaSearch}
                  onChange={(e) => setArenaSearch(e.target.value)}
                  placeholder="Buscar locais recentes ou arenas (ex: Araxá Futebol Society)..."
                  className="w-full h-11 pl-9 pr-3 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#22c55e]"
                />
              </div>

              {availableLocations.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {availableLocations.map((loc) => {
                    const isSelected =
                      arenaName.trim().toLowerCase() === loc.name.trim().toLowerCase();
                    return (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => {
                          setArenaName(loc.name);
                          setAddress(loc.address);
                          setModality(loc.modality);
                        }}
                        className={`min-h-[36px] px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap border transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-[#22c55e] text-slate-950 border-[#22c55e] font-bold shadow-sm'
                            : 'bg-white dark:bg-[#020617] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-emerald-500/50'
                        }`}
                      >
                        <span className="text-[9px] font-mono uppercase opacity-75">
                          {loc.source === 'recent' ? 'Recente' : 'Oficial'}
                        </span>
                        <span>{loc.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={arenaName}
                  onChange={(e) => setArenaName(e.target.value)}
                  placeholder="Nome da Arena ou Quadra"
                  className="w-full h-11 px-3 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#22c55e]"
                />
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Endereço / Bairro / Cidade"
                  className="w-full h-11 px-3 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-[#22c55e]"
                />
              </div>

              {/* Tipo de Campo / Modalidade */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Tipo de Campo / Modalidade:
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {FIELD_MODALITIES.map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => setModality(m)}
                      className={`min-h-[40px] px-2 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                        modality === m
                          ? 'bg-[#22c55e] text-slate-950 font-extrabold border-[#22c55e]'
                          : 'bg-white dark:bg-[#020617] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {m === 'Society' ? 'Society (5/7)' : m}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Seção 3: Nível do Jogo */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2.5">
              <label className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Award className="w-4 h-4 text-sky-600 dark:text-[#38bdf8]" />
                Nível do Jogo
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DIFFICULTY_OPTIONS.map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setGameLevel(lvl)}
                    className={`min-h-[42px] px-2.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      gameLevel === lvl
                        ? 'bg-[#22c55e] text-slate-950 border-[#22c55e]'
                        : 'bg-white dark:bg-[#020617] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-emerald-500/40'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            {/* Seção 4: Seleção de Vagas de Goleiros (1 ou 2 + Aleatório ou Específico) */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <GkGloveBallIcon className="w-4 h-4 text-emerald-600 dark:text-[#22c55e]" />
                  Vagas de Goleiros ({slotsCount} {slotsCount === 1 ? 'Goleiro' : 'Goleiros'})
                </span>

                <div className="flex items-center gap-1.5 bg-white dark:bg-[#020617] p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                  {[1, 2].map((qty) => (
                    <button
                      key={qty}
                      type="button"
                      onClick={() => setSlotsCount(qty as 1 | 2)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                        slotsCount === qty
                          ? 'bg-[#22c55e] text-slate-950'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {qty} {qty === 1 ? 'Goleiro' : 'Goleiros'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                {slotConfigs.map((slot) => (
                  <div
                    key={slot.slotIndex}
                    className="p-3 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-[#22c55e] font-mono font-extrabold text-xs flex items-center justify-center shrink-0">
                          {slot.slotIndex}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {slot.mode === 'specific' && slot.goalkeeperName
                              ? slot.goalkeeperName
                              : 'Goleiro Aleatório · Matchmaking 30 km'}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            {slot.mode === 'specific' && slot.goalkeeperName
                              ? `Específico selecionado${slot.distanceKm ? ` · ${slot.distanceKm} km` : ''}`
                              : 'Notifica todos os goleiros disponíveis no raio de 30 km'}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSetSlotMode(slot.slotIndex, 'random')}
                          className={`min-h-[36px] px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer transition-all ${
                            slot.mode === 'random'
                              ? 'bg-[#22c55e]/15 border-[#22c55e] text-emerald-700 dark:text-[#22c55e]'
                              : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          + Goleiro Aleatório
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetSlotMode(slot.slotIndex, 'specific')}
                          className={`min-h-[36px] px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer transition-all ${
                            slot.mode === 'specific'
                              ? 'bg-sky-500/15 border-sky-500 text-sky-700 dark:text-[#38bdf8]'
                              : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          + Goleiro Específico
                        </button>
                      </div>
                    </div>

                    {/* Seletor Inline de Goleiro Específico (Raio 30 km do Supabase) */}
                    {activeSlotPicker === slot.slotIndex && (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-sky-500/40 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-sky-700 dark:text-[#38bdf8]">
                            Goleiros no Raio de 30 km ({eligibleRadiusGks.length})
                          </span>
                          <button
                            type="button"
                            onClick={() => setActiveSlotPicker(null)}
                            className="text-[11px] text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                          >
                            Fechar
                          </button>
                        </div>

                        <input
                          type="text"
                          value={gkSearchFilter}
                          onChange={(e) => setGkSearchFilter(e.target.value)}
                          placeholder="Filtrar goleiro por nome ou bairro..."
                          className="w-full h-9 px-3 rounded-lg bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-sky-500"
                        />

                        {isLoadingRadiusGks ? (
                          <div className="py-4 text-center text-xs text-slate-500">
                            Buscando goleiros no raio de 30 km...
                          </div>
                        ) : filteredPickerGks.length === 0 ? (
                          <div className="py-3 text-center text-[11px] text-slate-500 dark:text-slate-400">
                            Nenhum goleiro específico cadastrado no raio de 30 km neste momento. Você pode usar "+ Goleiro Aleatório" para abrir a vaga no radar.
                          </div>
                        ) : (
                          <div className="max-h-44 overflow-y-auto space-y-1.5">
                            {filteredPickerGks.map((gk) => (
                              <button
                                key={gk.id}
                                type="button"
                                onClick={() => handlePickSpecificGoalkeeper(slot.slotIndex, gk)}
                                className="w-full p-2.5 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 hover:border-[#22c55e] flex items-center justify-between gap-2 text-left cursor-pointer transition-all"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-[#22c55e] font-bold text-xs flex items-center justify-center shrink-0">
                                    {gk.name.slice(0, 2).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                      {gk.name} · ★ {gk.rating}
                                    </div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                      {gk.neighborhood} ({gk.city || 'Itapeva - SP'})
                                    </div>
                                  </div>
                                </div>
                                <span className="text-[11px] font-mono font-bold text-emerald-700 dark:text-[#22c55e] shrink-0">
                                  {gk.distanceKm} km
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Seção 5: Cachê & Separação Custódia / Taxa da Casa */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-[#22c55e]" />
                  Cachê por Vaga ({slotsCount}× = {formatCurrency(totalPrice)})
                </label>
                <button
                  type="button"
                  onClick={() => setShowAiPricing((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 transition-colors cursor-pointer ${
                    showAiPricing
                      ? 'bg-[#38bdf8] text-slate-950 border-[#38bdf8]'
                      : 'bg-sky-500/15 border-sky-500/35 text-sky-700 dark:text-[#38bdf8]'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{showAiPricing ? 'Ocultar IA' : 'Sugerir Cachê IA'}</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {ITAPEVA_PRICING_TIERS.map((tier) => (
                  <button
                    type="button"
                    key={tier.tierCode}
                    onClick={() => setPricePerSlot(tier.totalPrice)}
                    className={`p-2.5 text-left rounded-xl border transition-all cursor-pointer ${
                      pricePerSlot === tier.totalPrice
                        ? 'bg-emerald-500/15 dark:bg-emerald-500/20 border-emerald-500 dark:border-[#22c55e] text-emerald-700 dark:text-[#22c55e]'
                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold">Faixa {tier.tierNumber}</span>
                      <span className="font-mono tabular-nums text-xs font-extrabold">
                        R$ {tier.totalPrice}
                      </span>
                    </div>
                    <div className="text-[10px] opacity-85 truncate mt-0.5">
                      {tier.technicalLevelLabel}
                    </div>
                    <div className="text-[9px] font-mono opacity-75 mt-0.5">
                      R$ {tier.goalkeeperNet} GK + R$ {tier.houseFee} casa
                    </div>
                  </button>
                ))}
              </div>

              {showAiPricing && (
                <CachePricingAssistant
                  compact
                  initialModality={modality}
                  initialTechnicalLevel={
                    gameLevel === 'Difícil'
                      ? 'Elite / Profissional'
                      : gameLevel === 'Médio'
                      ? 'Intermediário'
                      : 'Iniciante'
                  }
                  initialDistanceKm={prefillGoalkeeper?.distanceKm || 5}
                  arenaName={arenaName}
                  onApplyPrice={(suggested, meta) => {
                    setPricePerSlot(suggested);
                    if (meta?.modality) setModality(meta.modality);
                    setShowAiPricing(false);
                  }}
                />
              )}

              {/* Resumo Financeiro Transparente */}
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-700 dark:text-slate-200 font-semibold">
                  Custódia Líquida ({slotsCount} vaga{slotsCount > 1 ? 's' : ''}):{' '}
                  <strong className="font-mono text-emerald-700 dark:text-[#22c55e]">
                    {formatCurrency(totalNetCustody)}
                  </strong>
                  {slotsCount > 1 ? ` (${formatCurrency(netPerSlot)}/GK)` : ''}
                </span>
                <span className="font-mono text-sky-700 dark:text-[#38bdf8] font-bold">
                  Taxa da Casa: {formatCurrency(totalHouseFee)} (R$ 5,00/vaga)
                </span>
              </div>
            </div>

            {/* Observações */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Observações para o(s) Goleiro(s):
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white resize-none focus:outline-none focus:border-[#22c55e]"
              />
            </div>

            {/* CTA Bora Jogar */}
            <button
              type="button"
              onClick={handleStartRadarMatchmaking}
              className="w-full min-h-[52px] rounded-2xl bg-[#22c55e] hover:brightness-110 active:scale-[0.99] text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all cursor-pointer"
            >
              <Radar className="w-4 h-4" />
              <span>Bora Jogar! Notificar Goleiros no Raio de 30 km</span>
            </button>
          </div>
        )}

        {/* STEP 2: SCANNING & DISPATCH 30KM */}
        {step === 'scanning' && (
          <div className="p-10 flex flex-col items-center text-center justify-center space-y-6">
            <div className="relative w-40 h-40 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-[#22c55e]/25 animate-ping" />
              <div className="absolute inset-5 rounded-full border border-[#22c55e]/45" />
              <div className="relative z-10 w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-900 border-2 border-[#22c55e] flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Shield className="w-8 h-8 text-emerald-600 dark:text-[#22c55e]" />
              </div>
            </div>

            <div>
              <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white mb-1">
                Filtrando Goleiros num Raio de 30 km...
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Consultando base oficial de Itapeva/região e disparando notificações pelo painel e WhatsApp (Evolution API).
              </p>
            </div>
          </div>
        )}

        {/* STEP 3: MATCHED & CUSTODY CHECKOUT */}
        {step === 'matched' && (
          <div className="p-5 sm:p-6 space-y-4 max-h-[78vh] overflow-y-auto">
            {/* Dispatch Summary Banner */}
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-[#22c55e] shrink-0 mt-0.5" />
              <div className="text-xs space-y-0.5">
                <div className="font-extrabold text-emerald-800 dark:text-[#22c55e]">
                  Convocação Disparada · Raio de 30 km Ativo
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-300">
                  {radiusDispatchResult?.eligibleCount || 0} goleiro(s) elegíveis localizados ·{' '}
                  {radiusDispatchResult?.panelNotifiedCount || 0} alerta(s) no painel{' '}
                  {radiusDispatchResult?.evolutionConfigured
                    ? `· ${radiusDispatchResult.whatsappSentCount} WhatsApp Evolution enviado(s)`
                    : '· Pronto para contratação em custódia'}
                </div>
              </div>
            </div>

            {/* Vagas Escaladas */}
            <div className="space-y-2">
              {slotConfigs.map((slot) => (
                <div
                  key={slot.slotIndex}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-700 dark:text-[#22c55e] font-bold text-xs shrink-0">
                      {slot.goalkeeperName ? (
                        slot.goalkeeperName.slice(0, 2).toUpperCase()
                      ) : (
                        <UserIcon className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                        Vaga {slot.slotIndex}:{' '}
                        {slot.goalkeeperName || 'Aberta no Radar 30 km (Aguardando Aceite)'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {slot.mode === 'specific' ? 'Goleiro Específico' : 'Matchmaking Aleatório 30 km'}
                        {slot.distanceKm ? ` · ${slot.distanceKm} km` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-mono font-bold text-emerald-600 dark:text-[#22c55e] block">
                      {formatCurrency(netPerSlot)}
                    </span>
                    <span className="text-[10px] text-slate-500">líquido GK</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Resumo da Partida e Separação Custódia/Taxa */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Local:</span>
                <span className="font-bold text-slate-900 dark:text-white">{arenaName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Data e Horário:</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">
                  {formattedDate} · {timeRange} ({formatDurationLabel(durationMinutes)})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Modalidade / Nível:</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {modality} · {gameLevel}
                </span>
              </div>
              <div className="pt-2 mt-1 border-t border-slate-200 dark:border-slate-800 flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">
                  Taxa Fixa da Casa ({slotsCount} × R$ 5,00):
                </span>
                <span className="font-mono font-bold text-sky-600 dark:text-[#38bdf8]">
                  {formatCurrency(totalHouseFee)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Custódia Líquida Goleiro(s):</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-[#22c55e]">
                  {formatCurrency(totalNetCustody)}
                </span>
              </div>
              <div className="flex justify-between text-sm pt-1">
                <span className="font-extrabold text-slate-900 dark:text-white">Total Geral:</span>
                <span className="font-mono font-extrabold text-emerald-600 dark:text-[#22c55e]">
                  {formatCurrency(totalPrice)}
                </span>
              </div>
            </div>

            {pixError && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-200 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>{pixError}</span>
                </div>
                <button
                  type="button"
                  disabled={isConfirmingPayment}
                  onClick={() => handleFinalizeBooking('homologation')}
                  className="w-full min-h-[40px] rounded-xl bg-[#22c55e] hover:brightness-110 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirmar em Homologação & Aplicar Custódia ({formatCurrency(totalPrice)})</span>
                </button>
              </div>
            )}

            {/* Payment Actions */}
            <div className="space-y-2.5">
              <button
                type="button"
                disabled={isGeneratingPix}
                onClick={handleGenerateMercadoPagoPix}
                className="w-full min-h-[48px] rounded-xl bg-[#22c55e] hover:brightness-110 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
              >
                {isGeneratingPix ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Gerando Pix Mercado Pago...</span>
                  </>
                ) : (
                  <>
                    <QrCode className="w-4 h-4" />
                    <span>Pagar com Pix Mercado Pago ({formatCurrency(totalPrice)})</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setStep('configure')}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Editar Jogo
                </button>
                <button
                  type="button"
                  disabled={isConfirmingPayment}
                  onClick={() =>
                    handleFinalizeBooking(canPayWithWallet ? 'wallet' : 'homologation')
                  }
                  className="flex-1 min-h-[44px] px-3 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Zap className="w-3.5 h-3.5 text-sky-600 dark:text-[#38bdf8]" />
                  <span>
                    {canPayWithWallet
                      ? `Usar Saldo da Carteira (${formatCurrency(user?.walletBalance || 0)})`
                      : `Publicar & Reter Custódia (${formatCurrency(totalPrice)})`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: MERCADO PAGO PIX MODAL */}
        {step === 'mercadopago_pix' && mpPixData && (
          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-center">
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300">
              <span className="flex items-center gap-1.5 font-semibold">
                <Shield className="w-4 h-4 text-emerald-600 dark:text-[#22c55e]" />
                Custódia Protegida · {slotsCount} Vaga(s)
              </span>
              <span className="font-mono text-emerald-600 dark:text-[#22c55e] font-bold">
                Expira em {formatCountdown(countdownSeconds)}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                Total ({formatCurrency(totalNetCustody)} GK + {formatCurrency(totalHouseFee)} taxa casa):
              </span>
              <span className="font-mono tabular-nums text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                {formatCurrency(mpPixData.amount || totalPrice)}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white w-52 h-52 mx-auto flex items-center justify-center shadow-2xl border-2 border-slate-200 dark:border-slate-800">
              {mpPixData.qrCodeBase64 ? (
                <img
                  src={mpPixData.qrCodeBase64}
                  alt="QR Code Pix Mercado Pago"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-xs font-mono text-slate-700">Pix Copia e Cola abaixo</div>
              )}
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-left gap-2">
              <div className="truncate text-slate-600 dark:text-slate-400 text-[11px] font-mono select-all flex-1">
                {mpPixData.qrCodeText}
              </div>
              <button
                type="button"
                onClick={handleCopyPixCode}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
                  hasCopiedPix
                    ? 'bg-[#22c55e] text-slate-950 font-bold'
                    : 'bg-slate-200 dark:bg-slate-800 text-emerald-700 dark:text-[#22c55e]'
                }`}
              >
                {hasCopiedPix ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{hasCopiedPix ? 'Copiado!' : 'Copiar Pix'}</span>
              </button>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep('matched')}
                className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={isConfirmingPayment}
                onClick={() => handleFinalizeBooking('pix')}
                className="flex-1 min-h-[48px] rounded-xl bg-[#22c55e] hover:brightness-110 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
              >
                {isConfirmingPayment ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Liquidando Custódia...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirmar Pagamento & Reter Custódia</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
