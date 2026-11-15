import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  GkCloseIcon as X,
  GkShieldIcon as Shield,
  GkCheckCircleIcon as CheckCircle2,
  GkCheckIcon as Check,
  GkCopyIcon as Copy,
  GkQrCodeIcon as QrCode,
  GkCheckCircleIcon as AlertCircle,
  GkRefreshIcon as Loader2,
  GkFlameIcon as Zap,
  GkProfileIcon as UserIcon,
  GkCalendarIcon as Calendar,
  GkMapPinIcon as MapPin,
} from './icons';
import {
  MatchBooking,
  MatchGoalkeeperCandidate,
  UserProfile,
} from '../types';
import { formatCurrency } from '../utils/validations';
import { ITAPEVA_HOUSE_FEE } from '../utils/cachePricingAI';
import { formatDurationLabel } from '../utils/geoMatchmaking';
import {
  broadcastBookingConfirmed,
  confirmMatchCustodySplit,
  generateMercadoPagoPixCharge,
} from '../lib/supabaseClient';

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

interface CustodyPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: MatchBooking | null;
  selectedCandidate: MatchGoalkeeperCandidate | null;
  user: UserProfile;
  onCustodyConfirmed: (
    paidMatch: MatchBooking,
    paymentMethod: 'pix' | 'wallet' | 'homologation'
  ) => void;
  onOpenAuth?: () => void;
}

export const CustodyPaymentModal: React.FC<CustodyPaymentModalProps> = ({
  isOpen,
  onClose,
  match,
  selectedCandidate,
  user,
  onCustodyConfirmed,
  onOpenAuth,
}) => {
  const [step, setStep] = useState<'summary' | 'mercadopago_pix'>('summary');
  const [isGeneratingPix, setIsGeneratingPix] = useState(false);
  const [mpPixData, setMpPixData] = useState<MercadoPagoPixResponse | null>(null);
  const [hasCopiedPix, setHasCopiedPix] = useState(false);
  const [pixError, setPixError] = useState('');
  const [countdownSeconds, setCountdownSeconds] = useState(900);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStep('summary');
    setMpPixData(null);
    setPixError('');
    setHasCopiedPix(false);
    setCountdownSeconds(900);
  }, [isOpen, match?.id, selectedCandidate?.id]);

  useEffect(() => {
    if (step !== 'mercadopago_pix' || countdownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCountdownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [step, countdownSeconds]);

  if (!isOpen || !match) return null;

  const targetGoalkeeperName =
    selectedCandidate?.name ||
    (match.goalkeeperName && !match.goalkeeperName.includes('Aguardando')
      ? match.goalkeeperName
      : 'Goleiro Selecionado');
  const targetGoalkeeperId = selectedCandidate?.id || match.goalkeeperId;
  const targetGoalkeeperPhoto = selectedCandidate?.photo || match.goalkeeperPhoto || '';

  const slotsCount: 1 | 2 = match.goalkeeperSlotsCount === 2 ? 2 : 1;
  const totalPrice = Number(match.price || 25);
  const totalHouseFee = Number(
    (match.houseFee ?? Math.min(totalPrice, ITAPEVA_HOUSE_FEE * slotsCount)).toFixed(2)
  );
  const totalNetCustody = Number(
    (match.goalkeeperPayout ?? Math.max(0, totalPrice - totalHouseFee)).toFixed(2)
  );
  const netPerSlot = Number((totalNetCustody / slotsCount).toFixed(2));
  const canPayWithWallet = Boolean(user && user.walletBalance >= totalPrice);

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleGenerateMercadoPagoPix = async () => {
    if (!user || user.id === 'usr-guest' || !user.email) {
      setPixError(
        'Faça login com sua conta antes de gerar o Pix da custódia para validar seus dados de pagador.'
      );
      if (onOpenAuth) onOpenAuth();
      return;
    }

    setIsGeneratingPix(true);
    setPixError('');

    try {
      const existingSlotIds = (match.slots || [])
        .map((s) => s.goalkeeperId)
        .filter(Boolean) as string[];
      const gkIds = Array.from(
        new Set(
          [targetGoalkeeperId, ...existingSlotIds].filter(Boolean) as string[]
        )
      );

      const data = await generateMercadoPagoPixCharge({
        amount: totalPrice,
        userId: user.id,
        goalkeeperId: targetGoalkeeperId,
        goalkeeperIds: gkIds,
        slotsCount,
        goalkeeperName: targetGoalkeeperName,
        arenaName: match.arenaName,
        type: 'match_booking',
        description: `Custodia ${slotsCount} GK - ${match.arenaName}`,
        matchId: match.id,
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
        `${err?.message || 'Erro ao comunicar com a API Pix Mercado Pago.'} Você pode usar o saldo da carteira ou confirmar em modo de homologação.`
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

  const handleFinalizeCustodyPayment = async (
    paymentMethod: 'pix' | 'wallet' | 'homologation'
  ) => {
    setIsConfirmingPayment(true);
    try {
      const nowIso = new Date().toISOString();
      const updatedSlots = (match.slots && match.slots.length > 0
        ? match.slots
        : [{ slotIndex: 1, mode: 'random' as const, status: 'open' as const }]
      ).map((slot, idx) =>
        idx === 0 || !slot.goalkeeperId
          ? {
              ...slot,
              goalkeeperId: targetGoalkeeperId || slot.goalkeeperId,
              goalkeeperName: targetGoalkeeperName || slot.goalkeeperName,
              goalkeeperPhoto: targetGoalkeeperPhoto || slot.goalkeeperPhoto,
              distanceKm: selectedCandidate?.distanceKm ?? slot.distanceKm,
              status: 'accepted' as const,
              acceptedAt: slot.acceptedAt || nowIso,
            }
          : {
              ...slot,
              status: 'accepted' as const,
              acceptedAt: slot.acceptedAt || nowIso,
            }
      );

      const paidMatch: MatchBooking = {
        ...match,
        goalkeeperId: targetGoalkeeperId,
        goalkeeperName: targetGoalkeeperName,
        goalkeeperPhoto: targetGoalkeeperPhoto,
        status: 'confirmed',
        paymentStatus: 'paid',
        operationalStatus: 'accepted',
        acceptedAt: match.acceptedAt || nowIso,
        houseFee: totalHouseFee,
        goalkeeperPayout: totalNetCustody,
        slots: updatedSlots,
      };

      await confirmMatchCustodySplit({
        match: paidMatch,
        payerUserId: user?.id,
        payerEmail: user?.email,
        paymentMethod,
        paymentId: mpPixData?.id,
      });

      await broadcastBookingConfirmed(paidMatch).catch(() => undefined);

      onCustodyConfirmed(paidMatch, paymentMethod);
      onClose();
    } finally {
      setIsConfirmingPayment(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 dark:bg-black/85 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="relative w-full max-w-lg bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-4 transition-colors"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-600 dark:text-[#22c55e] shrink-0">
              {step === 'mercadopago_pix' ? (
                <QrCode className="w-5 h-5" />
              ) : (
                <Shield className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display font-extrabold text-base text-slate-900 dark:text-white truncate">
                  {step === 'mercadopago_pix'
                    ? 'Pix Mercado Pago · Custódia'
                    : 'Efetivar Custódia do Goleiro'}
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-[#22c55e] border border-emerald-500/30">
                  Mercado Pago
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Goleiro selecionado após aceite · Taxa da casa transparente
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal de pagamento de custódia"
            className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step 1: Custody Summary & Payment Selection */}
        {step === 'summary' && (
          <div className="p-5 sm:p-6 space-y-4 max-h-[78vh] overflow-y-auto">
            {/* Goleiro Selecionado */}
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {targetGoalkeeperPhoto ? (
                  <img
                    src={targetGoalkeeperPhoto}
                    alt={targetGoalkeeperName}
                    className="w-11 h-11 rounded-xl object-cover border border-emerald-500/40 shrink-0"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-700 dark:text-[#22c55e] font-extrabold text-xs shrink-0">
                    {targetGoalkeeperName ? (
                      targetGoalkeeperName.slice(0, 2).toUpperCase()
                    ) : (
                      <UserIcon className="w-5 h-5" />
                    )}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-emerald-700 dark:text-[#22c55e]">
                    Goleiro Selecionado
                  </div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                    {targetGoalkeeperName}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    {selectedCandidate?.rating && <span>★ {selectedCandidate.rating}</span>}
                    {selectedCandidate?.distanceKm !== undefined && (
                      <span>{selectedCandidate.distanceKm} km</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="font-mono text-sm font-extrabold text-emerald-700 dark:text-[#22c55e] block">
                  {formatCurrency(netPerSlot)}
                </span>
                <span className="text-[10px] text-slate-500">líquido GK</span>
              </div>
            </div>

            {/* Detalhes da Partida */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <MapPin className="w-4 h-4 text-emerald-600 dark:text-[#22c55e] shrink-0" />
                <span>{match.arenaName}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-mono">
                <Calendar className="w-4 h-4 text-sky-600 dark:text-[#38bdf8] shrink-0" />
                <span>
                  {match.date} · {match.time}
                  {match.durationMinutes ? ` (${formatDurationLabel(match.durationMinutes)})` : ''}
                </span>
              </div>

              <div className="pt-2 mt-1 border-t border-slate-200 dark:border-slate-800 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">
                    Taxa Fixa da Casa ({slotsCount} × R$ 5,00):
                  </span>
                  <span className="font-mono font-bold text-sky-600 dark:text-[#38bdf8]">
                    {formatCurrency(totalHouseFee)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">
                    Custódia Líquida Goleiro(s):
                  </span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-[#22c55e]">
                    {formatCurrency(totalNetCustody)}
                  </span>
                </div>
                <div className="flex justify-between text-sm pt-1">
                  <span className="font-extrabold text-slate-900 dark:text-white">
                    Total a Reter em Custódia:
                  </span>
                  <span className="font-mono font-extrabold text-emerald-600 dark:text-[#22c55e]">
                    {formatCurrency(totalPrice)}
                  </span>
                </div>
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
                  onClick={() => handleFinalizeCustodyPayment('homologation')}
                  className="w-full min-h-[40px] rounded-xl bg-[#22c55e] hover:brightness-110 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirmar em Homologação ({formatCurrency(totalPrice)})</span>
                </button>
              </div>
            )}

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={isGeneratingPix || isConfirmingPayment}
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
                    <span>Pagar Custódia via Pix Mercado Pago ({formatCurrency(totalPrice)})</span>
                  </>
                )}
              </button>

              {canPayWithWallet ? (
                <button
                  type="button"
                  disabled={isConfirmingPayment}
                  onClick={() => handleFinalizeCustodyPayment('wallet')}
                  className="w-full min-h-[44px] px-4 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Zap className="w-4 h-4 text-sky-600 dark:text-[#38bdf8]" />
                  <span>
                    Pagar com Saldo da Carteira ({formatCurrency(user.walletBalance)})
                  </span>
                </button>
              ) : (
                <div className="text-center text-[11px] text-slate-500 dark:text-slate-400">
                  Saldo em carteira atual: {formatCurrency(user.walletBalance)} (insuficiente para{' '}
                  {formatCurrency(totalPrice)} — utilize o Pix Mercado Pago acima)
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Mercado Pago Pix QR Code */}
        {step === 'mercadopago_pix' && mpPixData && (
          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-center">
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300">
              <span className="flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-[#22c55e]" />
                Custódia · {targetGoalkeeperName}
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
                onClick={() => setStep('summary')}
                className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={isConfirmingPayment}
                onClick={() => handleFinalizeCustodyPayment('pix')}
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
