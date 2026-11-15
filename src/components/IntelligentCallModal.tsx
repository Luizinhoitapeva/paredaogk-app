import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GkCloseIcon as X,
  GkRadarIcon as Radar,
  GkCalendarIcon as Calendar,
  GkClockIcon as Clock,
  GkMapPinIcon as MapPin,
  GkShieldIcon as Shield,
  GkCheckCircleIcon as CheckCircle2,
  GkFlameIcon as Sparkles,
  GkChevronRightIcon as ArrowRight,
  GkCoinPixIcon as DollarSign,
  GkMetricsIcon as Award,
  GkFlameIcon as Zap,
  GkCheckIcon as Check,
  GkCopyIcon as Copy,
  GkQrCodeIcon as QrCode,
  GkCheckCircleIcon as AlertCircle,
  GkRefreshIcon as Loader2,
  GkArrowUpRightIcon as ExternalLink,
  GkGloveBallIcon,
  GkCoinPixIcon
} from './icons';
import { ModalityType, MatchBooking, Goalkeeper, UserProfile, WeeklyMatchTemplate, ArenaField } from '../types';
import { formatCurrency } from '../utils/validations';
import { broadcastBookingConfirmed, queryGoalkeepersSmart, safeParseJsonResponse } from '../lib/supabaseClient';
import { CachePricingAssistant } from './CachePricingAssistant';
import {
  ITAPEVA_PRICING_TIERS,
  classifyGoalkeeperTier,
  getGoalkeeperNetAndFee,
  getTierByTotalPrice,
} from '../utils/cachePricingAI';

interface CajuPixResponse {
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
  onOpenAuth?: () => void;
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
  onOpenAuth,
}) => {
  const [step, setStep] = useState<'configure' | 'scanning' | 'matched' | 'no_goalkeepers' | 'cajupay_pix'>('configure');
  const [modality, setModality] = useState<ModalityType>('Society');
  const [date, setDate] = useState('Hoje, 20:30');
  const [arenaName, setArenaName] = useState(
    approvedArenas[0]?.name || 'Arena Belletti Itapeva'
  );
  const [address, setAddress] = useState(
    approvedArenas[0]?.address || 'R. Benjamin Constant, 990 - Jardim Ferrari, Itapeva - SP'
  );
  const [level, setLevel] = useState<'Resenha / Amigável' | 'Competitivo' | 'Varzea / Torneio'>('Competitivo');
  const [price, setPrice] = useState(25);
  const [notes, setNotes] = useState('Camisa do nosso time é azul. Procuramos goleiro comunicativo e firme.');
  const [matchedGk, setMatchedGk] = useState<Goalkeeper | null>(null);
  const [onlineCount, setOnlineCount] = useState<number>(0);

  // CajuPay Pix States
  const [isGeneratingPix, setIsGeneratingPix] = useState(false);
  const [cajuPixData, setCajuPixData] = useState<CajuPixResponse | null>(null);
  const [hasCopiedPix, setHasCopiedPix] = useState(false);
  const [pixError, setPixError] = useState('');
  const [countdownSeconds, setCountdownSeconds] = useState(900); // 15 minutos
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [showAiPricing, setShowAiPricing] = useState(false);

  // Preencher automaticamente a partir de uma arena oficial, modelo semanal ou goleiro favorito selecionado
  useEffect(() => {
    if (!isOpen) return;
    if (prefillArena) {
      setArenaName(prefillArena.name);
      setAddress(prefillArena.address);
      setModality(prefillArena.mainModality);
      setNotes(
        prefillArena.description
          ? `${prefillArena.surfaceType} · ${prefillArena.description}`
          : `Partida na ${prefillArena.name} (${prefillArena.surfaceType}).`
      );
      setMatchedGk(null);
      setStep('configure');
    } else if (prefillTemplate) {
      setModality(prefillTemplate.modality);
      setArenaName(prefillTemplate.arenaName);
      setAddress(prefillTemplate.address);
      setLevel(prefillTemplate.competitiveLevel);
      setPrice(getTierByTotalPrice(prefillTemplate.price).totalPrice);
      setDate(`${prefillTemplate.dayOfWeek}, ${prefillTemplate.time.split(' ')[0] || '20:30'}`);
      if (prefillTemplate.notes) setNotes(prefillTemplate.notes);
      setMatchedGk(null);
      setStep('configure');
    } else if (prefillGoalkeeper) {
      setMatchedGk(prefillGoalkeeper);
      const gkTier = classifyGoalkeeperTier({
        rating: prefillGoalkeeper.rating,
        matchesPlayed: prefillGoalkeeper.matchesPlayed,
        technicalLevel: prefillGoalkeeper.level,
      });
      const validPrice = [20, 25, 30].includes(prefillGoalkeeper.pricePerMatch)
        ? prefillGoalkeeper.pricePerMatch
        : gkTier.totalPrice;
      setPrice(validPrice);
      setStep('configure');
    } else {
      setMatchedGk(null);
      setPrice(25);
      setStep('configure');
    }
  }, [isOpen, prefillArena, prefillTemplate, prefillGoalkeeper]);

  // Countdown timer for Pix expiration
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === 'cajupay_pix' && countdownSeconds > 0) {
      timer = setInterval(() => {
        setCountdownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, countdownSeconds]);

  if (!isOpen) return null;

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStartRadar = async () => {
    setStep('scanning');
    const startedAt = Date.now();

    let candidates: Goalkeeper[] = [];
    let totalInDb = 0;

    try {
      const result = await queryGoalkeepersSmart({
        region: 'todos',
        technicalLevel: 'todos',
        timeSlot: 'todos',
        maxDistanceKm: 25,
        modality: modality.toLowerCase(),
        searchQuery: '',
        arenaQuery: '',
      });
      candidates = result.goalkeepers as Goalkeeper[];
      totalInDb = result.totalRealInDb;
    } catch (err) {
      console.warn('[Radar Supabase Lookup]', err);
    }

    setOnlineCount(totalInDb);

    const elapsed = Date.now() - startedAt;
    const waitMs = Math.max(0, 1200 - elapsed);

    setTimeout(() => {
      const preferredByTemplate = prefillTemplate?.favoriteGoalkeeperId
        ? candidates.find((g) => g.id === prefillTemplate.favoriteGoalkeeperId)
        : null;
      const bestMatch =
        prefillGoalkeeper ||
        preferredByTemplate ||
        candidates.find((g) => g.availableToday) ||
        candidates[0] ||
        null;

      if (bestMatch) {
        setMatchedGk(bestMatch);
        setStep('matched');
      } else {
        setMatchedGk(null);
        setStep('no_goalkeepers');
      }
    }, waitMs);
  };

  // Disparar geração de cobrança Pix na API CajuPay
  const handleGenerateCajuPayPix = async () => {
    if (!matchedGk) return;

    setIsGeneratingPix(true);
    setPixError('');

    try {
      const matchId = `mtch-${Date.now()}`;
      const response = await fetch('/api/gerar-pix-caju', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: price,
          valor: price,
          description: `Convocação GK ${matchedGk.name} - ${arenaName}`,
          matchId: matchId,
          customer: {
            name: user?.name || 'ParedãoGK Oficial',
            email: user?.email || 'paredaogkbr@gmail.com',
            cpf: user?.cpf || '12345678909',
            phone: user?.phone ? user.phone.replace(/\D/g, '') : '15981596443',
          },
        }),
      });

      const parsed = await safeParseJsonResponse<CajuPixResponse & { success?: boolean; error?: string }>(
        response,
        'API CajuPay Pix'
      );

      if (!parsed.valid || !parsed.data) {
        throw new Error(
          parsed.errorMessage ||
            'A API do CajuPay retornou resposta vazia ou inválida ao gerar o Pix.'
        );
      }

      const data = parsed.data;
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Falha ao comunicar com a API do CajuPay.');
      }

      setCajuPixData(data);
      setCountdownSeconds(900);
      setStep('cajupay_pix');
    } catch (err: any) {
      console.warn('[CajuPay Pix Request Fallback]', err);
      setPixError(
        `${err?.message || 'Erro ao comunicar com a API Pix CajuPay.'} Você pode tentar novamente ou confirmar em modo de homologação.`
      );
    } finally {
      setIsGeneratingPix(false);
    }
  };

  const handleCopyPixCode = () => {
    if (!cajuPixData?.qrCodeText) return;
    navigator.clipboard?.writeText(cajuPixData.qrCodeText);
    setHasCopiedPix(true);
    setTimeout(() => setHasCopiedPix(false), 2200);
  };

  const handleFinalizeBooking = () => {
    if (!matchedGk) return;

    setIsConfirmingPayment(true);

    setTimeout(() => {
      const feeSplit = getGoalkeeperNetAndFee(price);
      const cashback = Number((price * 0.1).toFixed(2));
      const newBooking: MatchBooking = {
        id: cajuPixData?.id || `mtch-${Date.now()}`,
        organizerId: user?.id || 'usr-current',
        organizerName: user?.name || 'ParedãoGK Oficial',
        goalkeeperId: matchedGk.id,
        goalkeeperName: matchedGk.nickname
          ? `${matchedGk.name} (${matchedGk.nickname})`
          : matchedGk.name,
        goalkeeperPhoto: matchedGk.photo,
        arenaName: arenaName,
        address: address,
        city: address.toLowerCase().includes('itapeva') ? 'Itapeva - SP' : (user?.city || 'Itapeva - SP'),
        date: date,
        time: date.includes('20:30') ? '20:30 - 21:30' : '19:00 - 20:00',
        modality: modality,
        price: price,
        houseFee: feeSplit.houseFee,
        goalkeeperPayout: feeSplit.goalkeeperNet,
        pricingTier: feeSplit.tier.tierCode,
        cashbackEarned: cashback,
        status: 'confirmed',
        competitiveLevel: level,
        notes: notes,
        checkin2hConfirmed: false,
        enRoute45mConfirmed: false,
        isWeeklyRecurrence: Boolean(prefillTemplate),
        templateId: prefillTemplate?.id,
      };

      // Dispara o evento em tempo real via Supabase Realtime
      broadcastBookingConfirmed(newBooking).catch((err) =>
        console.warn('[Broadcast booking note]', err)
      );

      setIsConfirmingPayment(false);
      onBookingConfirmed(newBooking);
      onClose();
      setStep('configure');
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/85 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-6 transition-colors"
      >
        {/* Top Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              {step === 'cajupay_pix' ? (
                <QrCode className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <GkGloveBallIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              )}
            </div>
            <div>
              <h2 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                {step === 'cajupay_pix' ? 'Pagamento Pix CajuPay' : 'Convocação Inteligente de GK'}
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                  {step === 'cajupay_pix' ? 'CajuPay Oficial' : 'Radar Ativo'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {step === 'cajupay_pix'
                  ? 'Custódia garantida com liquidação instantânea'
                  : 'Matchmaking instantâneo de goleiros por proximidade e nível'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800/80 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* STEP 1: CONFIGURE */}
        {step === 'configure' && (
          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Modality Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Modalidade da Partida:
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['Society', 'Fut7', 'Campo 11', 'Futsal'] as ModalityType[]).map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setModality(m)}
                    className={`py-2 px-1 text-xs font-medium rounded-xl border text-center transition-all cursor-pointer ${
                      modality === m
                        ? 'bg-emerald-500 text-slate-950 font-bold border-emerald-500 dark:border-emerald-400 shadow-md shadow-emerald-500/20'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Date and Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Data e Horário
                </label>
                <select
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="Hoje, 20:30">Hoje, 20:30</option>
                  <option value="Hoje, 21:30">Hoje, 21:30</option>
                  <option value="Amanhã, 19:00">Amanhã, 19:00</option>
                  <option value="Amanhã, 20:30">Amanhã, 20:30</option>
                  <option value="Sábado, 16:00">Sábado, 16:00</option>
                  <option value="Domingo, 10:00">Domingo, 10:00</option>
                  {date &&
                    ![
                      'Hoje, 20:30',
                      'Hoje, 21:30',
                      'Amanhã, 19:00',
                      'Amanhã, 20:30',
                      'Sábado, 16:00',
                      'Domingo, 10:00',
                    ].includes(date) && <option value={date}>{date}</option>}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" /> Nível do Jogo
                </label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value as any)}
                  className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="Resenha / Amigável">Resenha / Amigável</option>
                  <option value="Competitivo">Competitivo</option>
                  <option value="Varzea / Torneio">Várzea / Torneio</option>
                </select>
              </div>
            </div>

            {/* Arena and Location */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Arena / Local do Jogo
              </label>

              {approvedArenas.length > 0 && (
                <div className="space-y-1.5">
                  <span className="block text-[10px] font-mono uppercase tracking-wider text-sky-700 dark:text-[#38bdf8] font-bold">
                    Arenas Oficiais Aprovadas (Radar Itapeva & Rede):
                  </span>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {approvedArenas.map((arena) => {
                      const isSelected =
                        arenaName.trim().toLowerCase() === arena.name.trim().toLowerCase();
                      return (
                        <button
                          key={arena.id}
                          type="button"
                          onClick={() => {
                            setArenaName(arena.name);
                            setAddress(arena.address);
                            setModality(arena.mainModality);
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap border transition-all cursor-pointer shrink-0 ${
                            isSelected
                              ? 'bg-[#22c55e] text-slate-950 border-[#22c55e] font-bold shadow-sm'
                              : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-[#38bdf8]'
                          }`}
                        >
                          {arena.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <input
                type="text"
                value={arenaName}
                onChange={(e) => setArenaName(e.target.value)}
                placeholder="Nome da Arena ou Quadra"
                className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Endereço / Bairro"
                className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Match Fee / Cachê */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Valor do Cachê por Partida
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAiPricing((prev) => !prev)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                      showAiPricing
                        ? 'bg-[#38bdf8] text-slate-950 border-[#38bdf8]'
                        : 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/35 text-sky-700 dark:text-[#38bdf8]'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{showAiPricing ? 'Ocultar IA' : 'Sugerir com IA'}</span>
                  </button>
                  <span className="font-mono tabular-nums font-bold text-sm text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(price)}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {ITAPEVA_PRICING_TIERS.map((tier) => (
                  <button
                    type="button"
                    key={tier.tierCode}
                    onClick={() => setPrice(tier.totalPrice)}
                    className={`p-2 text-left rounded-xl border transition-all cursor-pointer ${
                      price === tier.totalPrice
                        ? 'bg-emerald-500/15 dark:bg-emerald-500/20 border-emerald-500 dark:border-[#22c55e] text-emerald-700 dark:text-[#22c55e]'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
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
                    level === 'Varzea / Torneio'
                      ? 'Elite / Profissional'
                      : level === 'Competitivo'
                      ? 'Intermediário'
                      : 'Iniciante'
                  }
                  initialDistanceKm={prefillGoalkeeper?.distanceKm || 5}
                  rating={prefillGoalkeeper?.rating}
                  matchesPlayed={prefillGoalkeeper?.matchesPlayed}
                  arenaName={arenaName}
                  onApplyPrice={(suggested, meta) => {
                    setPrice(suggested);
                    if (meta?.modality) setModality(meta.modality);
                    setShowAiPricing(false);
                  }}
                />
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Observações para o Goleiro (cor do colete, tipo de piso):
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 resize-none focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Action Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleStartRadar}
                className="w-full h-13 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
              >
                <Radar className="w-4 h-4 animate-spin" />
                <span>Disparar Radar & Localizar Goleiro Próximo</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: SCANNING */}
        {step === 'scanning' && (
          <div className="p-10 flex flex-col items-center text-center justify-center space-y-6">
            <div className="relative w-44 h-44 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 animate-ping" />
              <div className="absolute inset-4 rounded-full border border-emerald-500/40 animate-pulse" />
              <div className="absolute inset-10 rounded-full border border-sky-500/30" />

              <div className="absolute inset-0 flex items-center justify-center animate-spin duration-1000">
                <div className="w-1/2 h-0.5 bg-gradient-to-r from-transparent to-emerald-500 dark:to-emerald-400 origin-right ml-auto" />
              </div>

              <div className="relative z-10 w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-950 border-2 border-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Shield className="w-8 h-8 text-emerald-600 dark:text-emerald-400 animate-bounce" />
              </div>
            </div>

            <div>
              <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white mb-1">
                Buscando Goleiros no Raio de 8km...
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                Consultando disponibilidade imediata, reputação acima de 4.8 e histórico de pontualidade.
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono text-emerald-600 dark:text-emerald-400">
              <span className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" /> {onlineCount} cadastrado(s)
              </span>
              <span className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" /> Supabase Live
              </span>
            </div>
          </div>
        )}

        {/* STEP 2B: NO GOALKEEPERS IN DB YET (EMPTY RADAR STATE) */}
        {step === 'no_goalkeepers' && (
          <div className="p-8 flex flex-col items-center text-center justify-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-[#38bdf8]">
              <Radar className="w-8 h-8" />
            </div>
            <div className="space-y-2 max-w-sm">
              <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                Nenhum goleiro online no radar ainda
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                O radar consulta exclusivamente os goleiros reais cadastrados na base de Itapeva (SP). Assim que os primeiros atletas se cadastrarem ou ficarem disponíveis para {modality}, eles aparecerão aqui instantaneamente.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5 w-full pt-1">
              <button
                type="button"
                onClick={() => setStep('configure')}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                Ajustar Partida
              </button>
              {onOpenAuth && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAuth();
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#22c55e] hover:brightness-110 text-slate-950 font-extrabold text-xs cursor-pointer transition-all"
                >
                  Cadastrar-se como Goleiro GK
                </button>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: MATCHED - READY TO PAY WITH CAJUPAY */}
        {step === 'matched' && matchedGk && (
          <div className="p-6 space-y-5">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <div className="font-bold text-xs text-emerald-700 dark:text-emerald-300">
                  Goleiro Ideal Encontrado no Radar!
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-300">
                  {matchedGk.name} está disponível na base de Itapeva para o jogo.
                </div>
              </div>
            </div>

            {/* Goalkeeper Card */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center gap-3.5">
                {matchedGk.photo ? (
                  <img
                    src={matchedGk.photo}
                    alt={matchedGk.name}
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 rounded-2xl object-cover border border-emerald-500/50 shadow-md shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-600 dark:text-[#22c55e] font-display font-black text-lg shrink-0">
                    {matchedGk.name
                      .split(' ')
                      .slice(0, 2)
                      .map((p) => p[0])
                      .join('')
                      .toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">{matchedGk.name}</h4>
                    <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      ★ {matchedGk.rating}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    "{matchedGk.nickname}" · {matchedGk.distanceKm}km de distância
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                    <span>{matchedGk.matchesPlayed} partidas</span>
                    <span>·</span>
                    <span>{matchedGk.cleanSheets} jogos sem sofrer gol</span>
                  </div>
                </div>
              </div>

              {/* Bio summary */}
              <p className="text-xs text-slate-600 dark:text-slate-400 italic bg-white dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800/50">
                "{matchedGk.bio}"
              </p>
            </div>

            {/* Match Summary Box */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 text-xs space-y-1.5 text-slate-700 dark:text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Arena:</span>
                <span className="font-semibold text-slate-900 dark:text-white">{arenaName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Horário:</span>
                <span className="font-semibold text-slate-900 dark:text-white">{date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">
                  Total da Convocação ({getTierByTotalPrice(price).label}):
                </span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(price)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-500 dark:text-slate-400">
                  Repasse Goleiro + Taxa da Casa:
                </span>
                <span className="font-mono text-sky-600 dark:text-[#38bdf8]">
                  {formatCurrency(getGoalkeeperNetAndFee(price).goalkeeperNet)} GK + {formatCurrency(getGoalkeeperNetAndFee(price).houseFee)} casa
                </span>
              </div>
            </div>

            {pixError && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-200 space-y-2 text-left">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span>{pixError}</span>
                </div>
                <button
                  type="button"
                  disabled={isConfirmingPayment}
                  onClick={handleFinalizeBooking}
                  className="w-full h-9 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Simular Pagamento Pix Realizado ({formatCurrency(price)})</span>
                </button>
              </div>
            )}

            {/* Actions: Disparar CajuPay Pix */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep('configure')}
                className="px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={isGeneratingPix}
                onClick={handleGenerateCajuPayPix}
                className="flex-1 h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 active:scale-[0.99] text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
              >
                {isGeneratingPix ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Conectando com CajuPay Pix...</span>
                  </>
                ) : (
                  <>
                    <QrCode className="w-4 h-4" />
                    <span>Pagar com Pix via CajuPay ({formatCurrency(price)})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: CAJUPAY PIX MODAL (QR CODE + COPIA E COLA) */}
        {step === 'cajupay_pix' && cajuPixData && (
          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-center">
            {/* Header info */}
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300">
              <span className="flex items-center gap-1.5 font-semibold">
                <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Custódia Protegida CajuPay
              </span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                Expira em {formatCountdown(countdownSeconds)}
              </span>
            </div>

            {/* Total to pay */}
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Total a pagar da convocação:</span>
              <span className="font-mono text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                {formatCurrency(cajuPixData.amount || price)}
              </span>
            </div>

            {/* QR Code Container */}
            <div className="p-4 rounded-2xl bg-white w-52 h-52 mx-auto flex items-center justify-center shadow-2xl relative border-2 border-slate-200 dark:border-slate-800">
              {cajuPixData.qrCodeBase64 ? (
                <img
                  src={cajuPixData.qrCodeBase64}
                  alt="QR Code Pix CajuPay"
                  className="w-full h-full object-contain"
                />
              ) : (
                /* Authentic QR Code Vector representation */
                <div className="w-full h-full border-4 border-slate-950 p-2 flex flex-col justify-between select-none">
                  <div className="flex justify-between">
                    <div className="w-9 h-9 bg-black rounded" />
                    <div className="w-9 h-9 bg-black rounded" />
                  </div>
                  <div className="text-center font-mono font-bold text-[10px] text-black uppercase tracking-tight">
                    PIX CAJUPAY<br />PAREDÃOGK
                  </div>
                  <div className="flex justify-between">
                    <div className="w-9 h-9 bg-black rounded" />
                    <div className="w-4 h-4 bg-emerald-600 rounded-full mx-auto self-center" />
                    <div className="w-9 h-9 bg-black rounded" />
                  </div>
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Abra o app do seu banco, escolha <strong>Pix &gt; Pagar com QR Code</strong> ou copie o código Pix abaixo:
            </p>

            {/* Pix Copia e Cola with 1-click button */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-left gap-2">
              <div className="truncate text-slate-600 dark:text-slate-400 text-[11px] font-mono select-all flex-1">
                {cajuPixData.qrCodeText}
              </div>
              <button
                type="button"
                onClick={handleCopyPixCode}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
                  hasCopiedPix
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {hasCopiedPix ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{hasCopiedPix ? 'Copiado!' : 'Copiar Pix'}</span>
              </button>
            </div>

            {/* Status pulse */}
            <div className="flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400 py-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-ping" />
              <span>Aguardando webhook de confirmação do CajuPay...</span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep('matched')}
                className="px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={isConfirmingPayment}
                onClick={handleFinalizeBooking}
                className="flex-1 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
              >
                {isConfirmingPayment ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Confirmando Pagamento...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirmar Pagamento & Escalar Goleiro</span>
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
