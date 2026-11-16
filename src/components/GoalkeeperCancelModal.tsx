import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GkCloseIcon as X,
  GkSosAlertIcon as SosAlert,
  GkMapPinIcon as MapPin,
  GkCalendarIcon as Calendar,
  GkClockIcon as Clock,
  GkShieldIcon as Shield,
} from './icons';
import { MatchBooking } from '../types';

export interface GoalkeeperCancelReasonOption {
  id: string;
  emoji: string;
  label: string;
  helperText: string;
  requiresDetails?: boolean;
}

export const GOALKEEPER_CANCEL_REASONS: GoalkeeperCancelReasonOption[] = [
  {
    id: 'traffic_vehicle',
    emoji: '🚗',
    label: 'Problema de Trânsito / Veículo',
    helperText: 'Pane mecânica, pneu furado, acidente ou bloqueio grave no trajeto.',
  },
  {
    id: 'health_injury',
    emoji: '🏥',
    label: 'Motivo de Saúde / Lesão de Última Hora',
    helperText: 'Mal-estar súbito, torção ou impossibilidade física para atuar no gol.',
  },
  {
    id: 'family_emergency',
    emoji: '🏠',
    label: 'Imprevisto Familiar / Urgência',
    helperText: 'Emergência pessoal ou familiar que impede seu comparecimento.',
  },
  {
    id: 'other',
    emoji: '⚠️',
    label: 'Outros Motivos',
    helperText: 'Descreva abaixo o motivo específico para avisar o capitão.',
    requiresDetails: true,
  },
];

interface GoalkeeperCancelModalProps {
  isOpen: boolean;
  match: MatchBooking | null;
  goalkeeperName?: string;
  onClose: () => void;
  onConfirmCancel: (params: {
    match: MatchBooking;
    reason: string;
    details: string;
  }) => Promise<void>;
}

export const GoalkeeperCancelModal: React.FC<GoalkeeperCancelModalProps> = ({
  isOpen,
  match,
  goalkeeperName,
  onClose,
  onConfirmCancel,
}) => {
  const [selectedReasonId, setSelectedReasonId] = useState<string>('');
  const [details, setDetails] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedReasonId('');
      setDetails('');
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  }, [isOpen, match?.id]);

  if (!isOpen || !match) return null;

  const selectedOption = GOALKEEPER_CANCEL_REASONS.find((r) => r.id === selectedReasonId) || null;
  const trimmedDetails = details.trim();
  const isDetailsMissingForOther = Boolean(selectedOption?.requiresDetails && trimmedDetails.length < 5);
  const canSubmit = Boolean(selectedOption) && !isDetailsMissingForOther && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOption) {
      setErrorMsg('Selecione uma justificativa obrigatória para cancelar sua participação.');
      return;
    }
    if (selectedOption.requiresDetails && trimmedDetails.length < 5) {
      setErrorMsg('Detalhe o motivo no campo de texto (mínimo de 5 caracteres) para avisar o capitão.');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await onConfirmCancel({
        match,
        reason: selectedOption.label,
        details: trimmedDetails,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Não foi possível concluir o cancelamento agora. Tente novamente.');
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 dark:bg-black/85 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gk-cancel-modal-title"
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          className="relative w-full sm:max-w-lg bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        >
          {/* Mobile grab handle */}
          <div className="sm:hidden flex justify-center pt-3 pb-1">
            <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
          </div>

          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/70">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <SosAlert className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3
                  id="gk-cancel-modal-title"
                  className="font-display font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate"
                >
                  Cancelar Participação / Imprevisto
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                  Justificativa obrigatória · Reabre vaga no radar de 30 km
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Fechar modal de cancelamento"
              className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer transition-colors disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Contexto da Partida */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                    {match.arenaName}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                    Capitão: <strong className="text-slate-900 dark:text-white">{match.organizerName}</strong>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-[#22c55e]" />
                    <span className="truncate max-w-[230px]">{match.address || match.city}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-sky-600 dark:text-[#38bdf8]" />
                    <span>{match.date}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                    <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-[#22c55e]" />
                    <span>{match.time}</span>
                  </span>
                </div>
              </div>

              {/* Opções de Rádio / Justificativa Obrigatória */}
              <fieldset className="space-y-2.5">
                <legend className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center justify-between w-full">
                  <span>Selecione o motivo do cancelamento *</span>
                  <span className="text-[11px] font-normal text-amber-600 dark:text-amber-400">
                    Obrigatório
                  </span>
                </legend>

                <div className="space-y-2" role="radiogroup" aria-label="Justificativa do cancelamento">
                  {GOALKEEPER_CANCEL_REASONS.map((option) => {
                    const isSelected = selectedReasonId === option.id;
                    return (
                      <label
                        key={option.id}
                        className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all min-h-[56px] ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500 ring-1 ring-amber-500/40'
                            : 'bg-white dark:bg-slate-900/70 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="goalkeeper_cancel_reason"
                          value={option.id}
                          checked={isSelected}
                          onChange={() => {
                            setSelectedReasonId(option.id);
                            setErrorMsg(null);
                          }}
                          className="mt-1 h-4 w-4 accent-amber-500 cursor-pointer shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <span aria-hidden="true">{option.emoji}</span>
                            <span>{option.label}</span>
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                            {option.helperText}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {/* Campo de Texto Livre */}
              <div className="space-y-1.5">
                <label
                  htmlFor="gk-cancel-details"
                  className="block text-xs font-bold text-slate-800 dark:text-slate-200"
                >
                  Detalhes do ocorrido{' '}
                  <span className="font-normal text-slate-500 dark:text-slate-400">
                    {selectedOption?.requiresDetails
                      ? '(obrigatório para Outros Motivos)'
                      : '(opcional, mas recomendado para o capitão)'}
                  </span>
                </label>
                <textarea
                  id="gk-cancel-details"
                  rows={3}
                  maxLength={350}
                  value={details}
                  onChange={(e) => {
                    setDetails(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder={
                    selectedOption?.requiresDetails
                      ? 'Explique rapidamente o imprevisto para o capitão...'
                      : 'Ex: Pneu furou na rodovia próximo ao trevo, não conseguirei chegar a tempo.'
                  }
                  className="w-full rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-amber-500 focus:outline-none px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 resize-none"
                />
                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                  <span>
                    {goalkeeperName ? `Aviso enviado em nome de ${goalkeeperName}` : 'Aviso imediato ao capitão'}
                  </span>
                  <span className="font-mono tabular-nums">{details.length}/350</span>
                </div>
              </div>

              {/* Aviso Operacional & Custódia */}
              <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-start gap-2.5 text-[11px] text-slate-700 dark:text-slate-200">
                <Shield className="w-4 h-4 text-sky-600 dark:text-[#38bdf8] shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Ao confirmar, a vaga volta imediatamente para o <strong>Radar de 30 km</strong> (com alerta SOS para substituição rápida) e a contratante recebe notificação em tempo real com sua justificativa. Caso não haja substituição, a custódia é preservada/estornada integralmente ao capitão.
                </p>
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/40 text-xs font-semibold text-rose-700 dark:text-rose-300"
                >
                  {errorMsg}
                </div>
              )}
            </div>

            {/* Footer CTA */}
            <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="min-h-[44px] px-4 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer transition-colors disabled:opacity-50"
              >
                Voltar
              </button>

              <button
                type="submit"
                disabled={!canSubmit}
                className="min-h-[46px] px-5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer transition-all disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <SosAlert className="w-4 h-4 shrink-0" />
                <span>
                  {isSubmitting
                    ? 'Cancelando e Reabrindo Vaga...'
                    : 'Confirmar Cancelamento e Avisar Capitão'}
                </span>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
