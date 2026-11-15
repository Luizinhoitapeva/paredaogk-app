import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GkShieldIcon as Shield,
  GkFlameIcon as Zap,
  GkMapPinIcon as MapPin,
  GkCalendarIcon as Calendar,
  GkClockIcon as Clock,
  GkCoinPixIcon as DollarSign,
  GkProfileIcon as User,
  GkWhatsAppIcon as MessageCircle,
  GkCheckCircleIcon as CheckCircle2,
  GkCloseIcon as X,
  GkWhistleIcon,
  GkGloveBallIcon,
  GkCoinPixIcon,
  GkChevronRightIcon as ArrowRight
} from './icons';
import { MatchBooking } from '../types';
import { formatCurrency } from '../utils/validations';
import { playWhistleNotification } from '../lib/supabaseClient';
import { getGoalkeeperNetAndFee } from '../utils/cachePricingAI';

interface GoalkeeperCallAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: MatchBooking | null;
  onAcceptAndOpen: (booking: MatchBooking) => void;
  onOpenWhatsApp: () => void;
}

export const GoalkeeperCallAlertModal: React.FC<GoalkeeperCallAlertModalProps> = ({
  isOpen,
  onClose,
  booking,
  onAcceptAndOpen,
  onOpenWhatsApp,
}) => {
  if (!isOpen || !booking) return null;

  const handleTestSound = () => {
    playWhistleNotification();
  };

  const totalValue = booking.price || 25;
  const feeSplit = getGoalkeeperNetAndFee(totalValue, booking.houseFee);
  const netCacheValue = booking.goalkeeperPayout ?? feeSplit.goalkeeperNet;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 dark:bg-black/90 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 25 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 25 }}
        transition={{ type: 'spring', damping: 22, stiffness: 220 }}
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 border-2 border-emerald-500/80 rounded-3xl shadow-[0_0_50px_rgba(34,197,94,0.22)] dark:shadow-[0_0_50px_rgba(34,197,94,0.3)] overflow-hidden my-6 transition-colors"
      >
        {/* Animated Neon Pulse Accent Top */}
        <div className="h-2.5 w-full bg-gradient-to-r from-emerald-400 via-sky-400 to-emerald-400 animate-pulse" />

        {/* Modal Header */}
        <div className="p-6 pb-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 dark:bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-lg shadow-emerald-500/20">
                  <GkWhistleIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-400 animate-pulse" />
                </div>
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                </span>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-bold ${
                      booking.sosTriggered
                        ? 'bg-sky-500/20 border-sky-500/50 text-sky-700 dark:text-[#38bdf8]'
                        : 'bg-emerald-500/15 dark:bg-emerald-500/20 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    <GkWhistleIcon className="w-3 h-3 text-emerald-600 dark:text-emerald-400 animate-pulse" />
                    {booking.sosTriggered
                      ? `ALERTA SOS · +R$ ${booking.sosBonus || 5} BÔNUS URGÊNCIA`
                      : booking.isWeeklyRecurrence
                      ? 'RECONVOCAÇÃO SEMANAL PRIORITÁRIA'
                      : 'SUPABASE REALTIME · MERCADO PAGO PIX'}
                  </span>
                </div>
                <h2 className="font-display font-extrabold text-lg text-slate-900 dark:text-white mt-1 tracking-tight">
                  {booking.sosTriggered
                    ? '🚨 Substituição Relâmpago SOS!'
                    : booking.isWeeklyRecurrence
                    ? '⭐ Convite Prioritário: Próxima Semana!'
                    : '🚨 Nova Convocação Confirmada!'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {booking.sosTriggered
                    ? `Vaga urgente num raio de ${booking.sosRadiusKm || 10}km com bônus garantido no Pix.`
                    : 'Pagamento liquidado via Pix. Cachê em custódia segura.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleTestSound}
                title="Tocar apito de alerta"
                className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center justify-center transition-colors cursor-pointer"
              >
                <GkWhistleIcon className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {/* Cachê Highlight Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-slate-50 dark:from-emerald-950/60 dark:to-slate-950 border border-emerald-500/40 flex items-center justify-between shadow-md">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-600 dark:text-slate-400 block">
                Cachê Garantido via Pix (Líquido GK)
              </span>
              <div className="font-mono text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {formatCurrency(netCacheValue)}
              </div>
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                Total Pix {formatCurrency(totalValue)} · Taxa fixa casa {formatCurrency(feeSplit.houseFee)}
              </span>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 dark:text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-full border border-sky-500/30">
                <Zap className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                Custódia Instantânea
              </span>
              <div className="text-[10px] text-slate-500 mt-1">Mercado Pago Gateway</div>
            </div>
          </div>

          {/* Match Location & Time Details */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900 dark:text-white text-sm block">
                  {booking.arenaName}
                </span>
                <span className="text-slate-500 dark:text-slate-400 text-xs">{booking.address || 'São Paulo - SP'}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800/80">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <Calendar className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                <span>{booking.date}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>{booking.time}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span>Modalidade: <strong className="text-slate-900 dark:text-white">{booking.modality}</strong></span>
              <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[10px]">
                {booking.competitiveLevel || 'Competitivo'}
              </span>
            </div>

            {booking.notes && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 text-slate-500 dark:text-slate-400 italic">
                "{booking.notes}"
              </div>
            )}
          </div>

          {/* Organizer Card */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                <User className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">
                  {booking.organizerName || 'Contratante / Capitão'}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Organizador da Partida</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenWhatsApp}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>WhatsApp</span>
            </button>
          </div>

          {/* CTAs */}
          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              onClick={() => {
                onAcceptAndOpen(booking);
                onClose();
              }}
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 active:scale-[0.99] text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 transition-all cursor-pointer"
            >
              <GkGloveBallIcon className="w-4 h-4 text-slate-950" />
              <span>Aceitar Convocação & Abrir Partida</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium transition-colors cursor-pointer text-center"
            >
              Dispensar Alerta (Manter no Radar)
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
