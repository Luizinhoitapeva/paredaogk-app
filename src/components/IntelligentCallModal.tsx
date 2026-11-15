import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  GkSearchIcon as Search,
  GkProfileIcon as UserIcon,
  GkGloveBallIcon,
  GkRefreshIcon as RotateCcw,
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
  dispatchConvocationNotifications,
  publishFreeRadarMatchInSupabase,
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

const CALL_DRAFT_STORAGE_KEY = 'paredaogk-call-draft-v1';

interface CallModalDraft {
  step: 'configure' | 'published';
  dateIso: string;
  startTime: string;
  durationMinutes: number;
  arenaSearch: string;
  arenaName: string;
  address: string;
  modality: ModalityType;
  gameLevel: GameDifficultyLevel;
  slotsCount: 1 | 2;
  slotConfigs: MatchGoalkeeperSlot[];
  pricePerSlot: number;
  notes: string;
  createdMatchId: string;
  publishedMatch?: MatchBooking | null;
  radiusDispatchResult?: {
    eligibleCount: number;
    panelNotifiedCount: number;
    whatsappSentCount: number;
    evolutionConfigured: boolean;
  } | null;
  updatedAt: string;
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

function loadSavedCallDraft(): Partial<CallModalDraft> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CALL_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Partial<CallModalDraft>;
  } catch {
    return null;
  }
}

function clearSavedCallDraft() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CALL_DRAFT_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
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
}) => {
  const initialDraft = useMemo(() => loadSavedCallDraft(), []);

  const [step, setStep] = useState<'configure' | 'scanning' | 'published'>(() =>
    initialDraft?.step === 'published' && initialDraft.publishedMatch ? 'published' : 'configure'
  );

  // 1. Data, Início & Duração
  const [dateIso, setDateIso] = useState<string>(
    () => initialDraft?.dateIso || getTodayIsoLocal()
  );
  const [startTime, setStartTime] = useState<string>(
    () => initialDraft?.startTime || '20:00'
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(
    () => initialDraft?.durationMinutes || 90
  );

  // 2. Local & Detalhes
  const [arenaSearch, setArenaSearch] = useState<string>(
    () => initialDraft?.arenaSearch || ''
  );
  const [arenaName, setArenaName] = useState<string>(
    () =>
      initialDraft?.arenaName ||
      approvedArenas[0]?.name ||
      'Araxá Futebol Society e Escolinha'
  );
  const [address, setAddress] = useState<string>(
    () => initialDraft?.address || approvedArenas[0]?.address || 'Itapeva - SP'
  );
  const [modality, setModality] = useState<ModalityType>(
    () => initialDraft?.modality || 'Society'
  );

  // 3. Nível do Jogo
  const [gameLevel, setGameLevel] = useState<GameDifficultyLevel>(
    () => initialDraft?.gameLevel || 'Médio'
  );

  // 4. Vagas de Goleiros (1 ou 2 + Aleatório ou Específico)
  const [slotsCount, setSlotsCount] = useState<1 | 2>(
    () => (initialDraft?.slotsCount === 2 ? 2 : 1)
  );
  const [slotConfigs, setSlotConfigs] = useState<MatchGoalkeeperSlot[]>(() =>
    Array.isArray(initialDraft?.slotConfigs) && initialDraft.slotConfigs.length > 0
      ? initialDraft.slotConfigs
      : [{ slotIndex: 1, mode: 'random', status: 'open' }]
  );
  const [activeSlotPicker, setActiveSlotPicker] = useState<number | null>(null);
  const [eligibleRadiusGks, setEligibleRadiusGks] = useState<Goalkeeper[]>([]);
  const [isLoadingRadiusGks, setIsLoadingRadiusGks] = useState(false);
  const [gkSearchFilter, setGkSearchFilter] = useState('');

  // 5. Cachê sugerido por vaga & Notas (somente pago após aceite e escolha do goleiro)
  const [pricePerSlot, setPricePerSlot] = useState<number>(
    () => initialDraft?.pricePerSlot || 25
  );
  const [notes, setNotes] = useState<string>(
    () =>
      initialDraft?.notes ??
      'Camisa do nosso time é azul. Procuramos goleiro pontual e comunicativo.'
  );
  const [showAiPricing, setShowAiPricing] = useState(false);

  // Radar Dispatch State
  const [radiusDispatchResult, setRadiusDispatchResult] = useState<{
    eligibleCount: number;
    panelNotifiedCount: number;
    whatsappSentCount: number;
    evolutionConfigured: boolean;
  } | null>(() => initialDraft?.radiusDispatchResult || null);
  const [createdMatchId, setCreatedMatchId] = useState<string>(
    () => initialDraft?.createdMatchId || ''
  );
  const [publishedMatch, setPublishedMatch] = useState<MatchBooking | null>(
    () => initialDraft?.publishedMatch || null
  );
  const [hasDraftSaved, setHasDraftSaved] = useState<boolean>(() => Boolean(initialDraft));

  // Ref para evitar que re-renders de `approvedArenas` ou troca de aba resetem o formulário preenchido
  const lastAppliedPrefillRef = useRef<string>('');

  // Persistir rascunho automaticamente no localStorage sempre que o usuário alterar qualquer campo
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (step === 'scanning') return;
    try {
      const payload: CallModalDraft = {
        step: step === 'published' ? 'published' : 'configure',
        dateIso,
        startTime,
        durationMinutes,
        arenaSearch,
        arenaName,
        address,
        modality,
        gameLevel,
        slotsCount,
        slotConfigs,
        pricePerSlot,
        notes,
        createdMatchId,
        publishedMatch,
        radiusDispatchResult,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(CALL_DRAFT_STORAGE_KEY, JSON.stringify(payload));
      setHasDraftSaved(true);
    } catch {
      // Ignore storage quota errors
    }
  }, [
    step,
    dateIso,
    startTime,
    durationMinutes,
    arenaSearch,
    arenaName,
    address,
    modality,
    gameLevel,
    slotsCount,
    slotConfigs,
    pricePerSlot,
    notes,
    createdMatchId,
    publishedMatch,
    radiusDispatchResult,
  ]);

  // Combinar Locais Recentes das partidas + Arenas Oficiais de Itapeva
  const availableLocations = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        address: string;
        modality: ModalityType;
        source: 'recent' | 'official';
      }
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

  // Aplicar pré-preenchimento APENAS quando um novo prefill explícito (arena, template ou goleiro) for selecionado
  useEffect(() => {
    if (!isOpen) return;

    const prefillKey = prefillArena
      ? `arena:${prefillArena.id}`
      : prefillTemplate
      ? `tpl:${prefillTemplate.id}`
      : prefillGoalkeeper
      ? `gk:${prefillGoalkeeper.id}`
      : '';

    if (!prefillKey || prefillKey === lastAppliedPrefillRef.current) {
      return;
    }

    lastAppliedPrefillRef.current = prefillKey;
    setActiveSlotPicker(null);
    setRadiusDispatchResult(null);
    setPublishedMatch(null);
    setStep('configure');

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
    }
  }, [isOpen, prefillArena, prefillTemplate, prefillGoalkeeper]);

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

  // Buscar goleiros elegíveis no raio de 30 km sempre que o modal estiver aberto
  const loadEligibleGoalkeepers30Km = async () => {
    setIsLoadingRadiusGks(true);
    try {
      const res = await queryEligibleGoalkeepersWithinRadius({
        city: 'Itapeva - SP',
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

  const handleResetDraft = () => {
    clearSavedCallDraft();
    lastAppliedPrefillRef.current = '';
    setDateIso(getTodayIsoLocal());
    setStartTime('20:00');
    setDurationMinutes(90);
    setArenaSearch('');
    const defaultArena =
      approvedArenas.find((a) => a.name.toLowerCase().includes('araxá')) || approvedArenas[0];
    setArenaName(defaultArena?.name || 'Araxá Futebol Society e Escolinha');
    setAddress(defaultArena?.address || 'Itapeva - SP');
    setModality(defaultArena?.mainModality || 'Society');
    setGameLevel('Médio');
    setSlotsCount(1);
    setSlotConfigs([{ slotIndex: 1, mode: 'random', status: 'open' }]);
    setPricePerSlot(25);
    setNotes('Camisa do nosso time é azul. Procuramos goleiro pontual e comunicativo.');
    setRadiusDispatchResult(null);
    setPublishedMatch(null);
    setCreatedMatchId('');
    setStep('configure');
    setHasDraftSaved(false);
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

  const buildFreeRadarMatchDraft = (
    overrideId: string,
    notifiedCount: number
  ): MatchBooking => {
    const specificNames = slotConfigs
      .filter((s) => s.mode === 'specific' && s.goalkeeperName)
      .map((s) => s.goalkeeperName) as string[];

    const selectionModes = new Set(slotConfigs.map((s) => s.mode));
    const resolvedSelectionMode: 'random' | 'specific' | 'mixed' =
      selectionModes.size > 1 ? 'mixed' : slotConfigs[0]?.mode || 'random';

    return {
      id: overrideId,
      organizerId: user?.id || 'usr-current',
      organizerName: user?.name || 'Organizador ParedãoGK',
      goalkeeperId: slotConfigs[0]?.goalkeeperId,
      goalkeeperName:
        specificNames.length > 0
          ? `${specificNames.join(' & ')} (Convite Enviado)`
          : `Aguardando Aceite / No Radar (${slotsCount} vaga${slotsCount > 1 ? 's' : ''})`,
      goalkeeperPhoto: slotConfigs[0]?.goalkeeperPhoto,
      arenaName,
      address,
      city: address.toLowerCase().includes('itapeva')
        ? 'Itapeva - SP'
        : user?.city || 'Itapeva - SP',
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
      status: 'searching',
      competitiveLevel: mapDifficultyToLegacyLevel(gameLevel),
      gameLevel,
      goalkeeperSlotsCount: slotsCount,
      selectionMode: resolvedSelectionMode,
      slots: slotConfigs,
      candidates: [],
      operationalStatus: 'awaiting_acceptance',
      radiusKm: 30,
      notifiedGoalkeepersCount: notifiedCount,
      notes,
      paymentStatus: 'pending',
      createdAt: new Date().toISOString(),
      checkin2hConfirmed: false,
      enRoute45mConfirmed: false,
      enRoute20mNotified: false,
      enRoute20mConfirmed: false,
      isWeeklyRecurrence: Boolean(prefillTemplate),
      templateId: prefillTemplate?.id,
    };
  };

  // Publicação 100% GRATUITA no Radar 30 km (SEM bloqueio nem cobrança antecipada)
  const handlePublishFreeRadarMatch = async () => {
    setStep('scanning');
    const newMatchId = `mtch-${Date.now()}`;
    setCreatedMatchId(newMatchId);

    const startedAt = Date.now();
    const candidates30Km = await loadEligibleGoalkeepers30Km();

    const freeMatch = buildFreeRadarMatchDraft(newMatchId, candidates30Km.length);

    // 1. Publicar partida no Supabase com status 'searching' e payment_status 'pending' (Grátis)
    await publishFreeRadarMatchInSupabase({
      match: freeMatch,
      organizerUserId: user?.id,
    });

    // 2. Disparar notificações no painel + WhatsApp (Evolution API) para goleiros no raio de 30 km
    const selectedIds = slotConfigs
      .map((s) => s.goalkeeperId)
      .filter(Boolean) as string[];
    const selectionModes = new Set(slotConfigs.map((s) => s.mode));
    const resolvedMode: 'random' | 'specific' | 'mixed' =
      selectionModes.size > 1 ? 'mixed' : slotConfigs[0]?.mode || 'random';

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
      bookingPayload: freeMatch,
    });

    const updatedMatch: MatchBooking = {
      ...freeMatch,
      notifiedGoalkeepersCount: dispatchRes.eligibleCount,
    };

    setRadiusDispatchResult({
      eligibleCount: dispatchRes.eligibleCount,
      panelNotifiedCount: dispatchRes.panelNotifiedCount,
      whatsappSentCount: dispatchRes.whatsappSentCount,
      evolutionConfigured: dispatchRes.evolutionConfigured,
    });
    setPublishedMatch(updatedMatch);

    // Registrar imediatamente na lista de partidas do app para não perder mesmo se fechar o modal
    onBookingConfirmed(updatedMatch);

    const elapsed = Date.now() - startedAt;
    const waitMs = Math.max(0, 900 - elapsed);
    setTimeout(() => {
      setStep('published');
    }, waitMs);
  };

  const handleFinishAndClose = () => {
    clearSavedCallDraft();
    lastAppliedPrefillRef.current = '';
    setPublishedMatch(null);
    setRadiusDispatchResult(null);
    setStep('configure');
    setHasDraftSaved(false);
    onClose();
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 dark:bg-black/85 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="relative w-full max-w-2xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-4 transition-colors"
      >
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/80 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-600 dark:text-[#22c55e] shrink-0">
              <GkGloveBallIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display font-extrabold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight">
                  {step === 'published'
                    ? 'Convocação Publicada no Radar!'
                    : 'Bora Jogar! · Convocação Inteligente'}
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-[#22c55e] border border-emerald-500/30">
                  {step === 'published' ? 'Aguardando Aceite' : 'Grátis · Raio 30 km'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {step === 'published'
                  ? 'Nenhuma cobrança realizada — pagamento só após escolher o goleiro'
                  : 'Publique gratuitamente no radar e pague a custódia somente após o aceite'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {step === 'configure' && hasDraftSaved && (
              <button
                type="button"
                onClick={handleResetDraft}
                title="Limpar rascunho salvo"
                className="px-2.5 h-9 rounded-xl bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Limpar</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Minimizar e manter rascunho"
              title="Fechar (seu rascunho continua salvo)"
              className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
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
                              ? `Convite específico${slot.distanceKm ? ` · ${slot.distanceKm} km` : ''}`
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

            {/* Seção 5: Cachê Oferecido (Sem cobrança na criação) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-[#22c55e]" />
                  Cachê Oferecido por Vaga ({slotsCount}× = {formatCurrency(totalPrice)})
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

              {/* Aviso Transparente de Publicação Gratuita */}
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-700 dark:text-slate-200 font-semibold">
                  Custódia após aceite ({slotsCount} vaga{slotsCount > 1 ? 's' : ''}):{' '}
                  <strong className="font-mono text-emerald-700 dark:text-[#22c55e]">
                    {formatCurrency(totalNetCustody)} GK
                  </strong>{' '}
                  +{' '}
                  <strong className="font-mono text-sky-700 dark:text-[#38bdf8]">
                    {formatCurrency(totalHouseFee)} casa
                  </strong>
                </span>
                <span className="font-mono font-bold text-emerald-700 dark:text-[#22c55e]">
                  Publicação Gratuita · Pague depois
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

            {/* CTA Gratuita: Convocar / Disparar Radar */}
            <button
              type="button"
              onClick={handlePublishFreeRadarMatch}
              className="w-full min-h-[52px] rounded-2xl bg-[#22c55e] hover:brightness-110 active:scale-[0.99] text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all cursor-pointer"
            >
              <Radar className="w-4 h-4" />
              <span>Convocar / Disparar Radar (Grátis)</span>
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
                Publicando Partida & Notificando Raio de 30 km...
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Disparando alertas gratuitos para os goleiros elegíveis no painel e via WhatsApp (Evolution API).
              </p>
            </div>
          </div>
        )}

        {/* STEP 3: PUBLISHED IN RADAR (FREE — NO PAYMENT LOCK) */}
        {step === 'published' && (
          <div className="p-5 sm:p-6 space-y-4 max-h-[78vh] overflow-y-auto">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/35 flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-[#22c55e] shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <div className="font-extrabold text-sm text-emerald-800 dark:text-[#22c55e]">
                  Partida Publicada · Aguardando Aceite / No Radar
                </div>
                <div className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  {radiusDispatchResult?.eligibleCount || 0} goleiro(s) dentro de 30 km localizados ·{' '}
                  {radiusDispatchResult?.panelNotifiedCount || 0} notificação(ões) no painel{' '}
                  {radiusDispatchResult?.evolutionConfigured
                    ? `· ${radiusDispatchResult.whatsappSentCount} WhatsApp Evolution enviado(s)`
                    : '· Radar ativo em tempo real'}
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-xs text-sky-900 dark:text-sky-100 space-y-1">
              <div className="font-extrabold text-sky-700 dark:text-[#38bdf8]">
                Nenhuma cobrança foi realizada agora
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                O pagamento (Pix Mercado Pago ou Saldo da Carteira) só aparecerá quando você selecionar o goleiro que aceitou/se candidatou à vaga no painel da partida para efetivar a custódia.
              </p>
            </div>

            {/* Resumo das Vagas Publicadas */}
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
                        {slot.mode === 'specific'
                          ? 'Convite Específico Enviado'
                          : 'Matchmaking Aleatório 30 km'}
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

            {/* Resumo da Partida */}
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
                  Valor Combinado ({slotsCount} vaga{slotsCount > 1 ? 's' : ''}):
                </span>
                <span className="font-mono font-extrabold text-emerald-600 dark:text-[#22c55e]">
                  {formatCurrency(totalPrice)} (Custódia após aceite)
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleFinishAndClose}
              className="w-full min-h-[50px] rounded-2xl bg-[#22c55e] hover:brightness-110 active:scale-[0.99] text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Concluir e Acompanhar no Radar</span>
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
