import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  GkCloseIcon as X,
  GkHistoryIcon as History,
  GkCalendarIcon as Calendar,
  GkMapPinIcon as MapPin,
  GkStarRatingIcon as Star,
  GkMetricsIcon as Award,
  GkClockIcon as Clock,
  GkWhatsAppIcon as MessageCircle,
  GkChatIcon as Quote,
  GkFlameIcon as Sparkles,
  GkDownloadIcon as Download,
  GkTermsDocIcon as FileText,
  GkRefreshIcon as RefreshCw,
  GkSosAlertIcon as SosAlert,
  GkAiSparkIcon,
} from './icons';
import { MatchBooking, PostMatchAiFeedbackResult, UserProfile } from '../types';
import { formatCurrency } from '../utils/validations';
import { generateGoalkeeperPerformancePdf, ReportScope } from '../utils/pdfReportGenerator';
import { MatchHistorySkeleton } from './SkeletonLoading';
import { PostMatchAiFeedbackModal } from './PostMatchAiFeedbackPanel';

interface MatchHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenChat: () => void;
  currentUser: UserProfile;
  matches: MatchBooking[];
  onOpenReview: (match: MatchBooking) => void;
  onSaveAiFeedback?: (matchId: string, feedback: PostMatchAiFeedbackResult) => void;
  onReinviteNextWeek?: (match: MatchBooking) => Promise<void>;
  onQuickTriggerSos?: (match: MatchBooking) => void;
  onOpenPdfReport?: (params: {
    scope: ReportScope;
    selectedMatch?: MatchBooking | null;
  }) => void;
}

export const MatchHistoryModal: React.FC<MatchHistoryModalProps> = ({
  isOpen,
  onClose,
  onOpenChat,
  currentUser,
  matches,
  onOpenReview,
  onSaveAiFeedback,
  onReinviteNextWeek,
  onQuickTriggerSos,
  onOpenPdfReport,
}) => {
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'completed'>('all');
  const [isSyncing, setIsSyncing] = useState(false);
  const [reinvitingId, setReinvitingId] = useState<string | null>(null);
  const [reinvitedId, setReinvitedId] = useState<string | null>(null);
  const [aiFeedbackMatch, setAiFeedbackMatch] = useState<MatchBooking | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsSyncing(true);
      const timer = setTimeout(() => setIsSyncing(false), 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen, filter]);

  if (!isOpen) return null;

  const handleManualSync = () => {
    setIsSyncing(true);
    setTimeout(() => setIsSyncing(false), 400);
  };

  const filteredMatches = matches.filter((m) => {
    if (filter === 'confirmed') return m.status === 'confirmed';
    if (filter === 'completed') return m.status === 'completed';
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/85 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden transition-colors"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                Histórico de Partidas
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Convocações agendadas, concluídas e avaliações pós-jogo salvas no Supabase
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="p-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
              title="Sincronizar histórico com Supabase"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => {
                if (onOpenPdfReport) {
                  onClose();
                  onOpenPdfReport({ scope: 'completo', selectedMatch: null });
                } else {
                  generateGoalkeeperPerformancePdf({ user: currentUser, matches });
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 cursor-pointer transition-all active:scale-95"
              title="Exportar relatório corporativo em PDF e impressão"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exportar Relatório PDF</span>
              <span className="sm:hidden">PDF</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter buttons & PDF helper */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950/40 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { id: 'all', label: 'Todas as Partidas' },
              { id: 'confirmed', label: 'Próximos Jogos' },
              { id: 'completed', label: 'Concluídas & Avaliações' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  filter === tab.id
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Documento Oficial Mercado Pago & Supabase</span>
          </div>
        </div>

        {/* Matches List */}
        <div className="p-5 overflow-y-auto space-y-4">
          {isSyncing ? (
            <MatchHistorySkeleton count={3} />
          ) : filteredMatches.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              Nenhuma partida encontrada para este filtro.
            </div>
          ) : (
            filteredMatches.map((match) => (
              <div
                key={match.id}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {match.goalkeeperPhoto ? (
                      <img
                        src={match.goalkeeperPhoto}
                        alt={match.goalkeeperName}
                        className="w-12 h-12 rounded-xl object-cover border border-slate-300 dark:border-slate-700"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center font-display font-black text-sm text-emerald-600 dark:text-[#22c55e]">
                        {(match.goalkeeperName || 'GK')
                          .split(' ')
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((n) => n[0]?.toUpperCase() || '')
                          .join('')}
                      </div>
                    )}
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                        {match.goalkeeperName}
                      </h4>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                        <span>{match.arenaName}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        match.status === 'confirmed'
                          ? 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                          : 'bg-sky-500/15 dark:bg-sky-500/20 text-sky-700 dark:text-sky-400 border border-sky-500/30'
                      }`}
                    >
                      {match.status === 'confirmed' ? 'Confirmado' : 'Concluído'}
                    </span>
                    <div className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                      {formatCurrency(match.price)}
                    </div>
                  </div>
                </div>

                {/* Match metadata */}
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 text-xs flex flex-wrap items-center justify-between gap-2 text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>{match.date}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                    <span>{match.time}</span>
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">
                    Modalidade: <strong className="text-slate-900 dark:text-white">{match.modality}</strong>
                  </div>
                </div>

                {/* Action / Evaluation Area */}
                {match.status === 'confirmed' || match.status === 'searching' ? (
                  <div className="space-y-2 pt-1">
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
                      <span
                        className={`px-2 py-0.5 rounded-full border ${
                          match.checkin2hConfirmed
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-[#22c55e] border-emerald-500/30'
                            : 'bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        {match.checkin2hConfirmed ? '✓ Check-in 2h OK' : '⏳ Aguardando Check-in 2h'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full border ${
                          match.enRoute45mConfirmed
                            ? 'bg-sky-500/15 text-sky-700 dark:text-[#38bdf8] border-sky-500/30'
                            : 'bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        {match.enRoute45mConfirmed ? '🚗 A caminho (45m)' : '⏳ Status A caminho (45m)'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                        {match.sosTriggered
                          ? 'Alerta SOS disparado para goleiros próximos.'
                          : 'Goleiro escalado. Chegada prevista 15min antes.'}
                      </span>
                      <div className="flex items-center gap-2">
                        {currentUser.role === 'contratante' && onQuickTriggerSos && (
                          <button
                            type="button"
                            onClick={() => {
                              onQuickTriggerSos(match);
                              onClose();
                            }}
                            className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-700 dark:text-[#38bdf8] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <SosAlert className="w-3.5 h-3.5" />
                            <span>Acionar SOS</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            onOpenChat();
                            onClose();
                          }}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Abrir Chat com GK</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-2.5">
                    {match.ratingGiven ? (
                      <div className="space-y-2 p-3 rounded-xl bg-white dark:bg-slate-900/90 border border-emerald-500/30">
                        <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-700 dark:text-slate-300 font-semibold">Avaliação enviada:</span>
                            <div className="flex items-center">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`w-3.5 h-3.5 ${
                                    match.ratingGiven! >= star
                                      ? 'fill-amber-500 dark:fill-amber-400 text-amber-500 dark:text-amber-400'
                                      : 'text-slate-300 dark:text-slate-700'
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="font-mono font-bold text-amber-600 dark:text-amber-400 ml-1">
                              ★ {match.ratingGiven}.0
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {match.mvpGiven && (
                              <span className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/30 font-bold">
                                <Award className="w-3 h-3 text-amber-600 dark:text-amber-400" /> Luva da Partida
                              </span>
                            )}
                            <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                              Supabase ✓
                            </span>
                          </div>
                        </div>

                        {/* Review Comment Quote */}
                        {match.reviewComment && (
                          <div className="text-xs text-slate-700 dark:text-slate-300 italic flex items-start gap-2 bg-slate-50 dark:bg-slate-950/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800/60">
                            <Quote className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                            <span>"{match.reviewComment}"</span>
                          </div>
                        )}

                        {/* Review Tags */}
                        {match.reviewTags && match.reviewTags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {match.reviewTags.map((tag) => (
                              <span
                                key={tag}
                                className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 font-medium"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between bg-white dark:bg-slate-900/60 p-3 rounded-xl border border-amber-500/30 flex-wrap gap-2">
                        <div>
                          <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                            Avaliação Pós-Jogo Pendente
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Dê sua nota de 1 a 5 estrelas ou gere um parecer técnico com IA.
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setAiFeedbackMatch(match)}
                            className="px-3.5 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 dark:border-[#38bdf8]/40 text-sky-700 dark:text-[#38bdf8] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all active:scale-95"
                          >
                            <GkAiSparkIcon className="w-3.5 h-3.5" />
                            <span>Feedback AI</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onOpenReview(match);
                              onClose();
                            }}
                            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer whitespace-nowrap transition-all"
                          >
                            <Star className="w-3.5 h-3.5 fill-slate-950" />
                            <span>Avaliar Atuação (1-5★)</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Módulo Feedback Pós-Partida AI salvo / acionar análise */}
                    {match.aiFeedback ? (
                      <div className="p-3 rounded-xl bg-white dark:bg-slate-900/90 border border-sky-500/35 dark:border-[#38bdf8]/35 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                            <GkAiSparkIcon className="w-3.5 h-3.5 text-sky-600 dark:text-[#38bdf8]" />
                            <span>Parecer Técnico Pós-Partida AI</span>
                            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 font-normal">
                              · {match.aiFeedback.source === 'gemini-ai' ? 'Gemini AI' : 'Motor Offline'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono tabular-nums text-xs font-extrabold text-emerald-600 dark:text-[#22c55e]">
                              ★ {match.aiFeedback.consolidatedRating}.0
                            </span>
                            <button
                              type="button"
                              onClick={() => setAiFeedbackMatch(match)}
                              className="text-[11px] font-bold text-sky-600 dark:text-[#38bdf8] hover:underline cursor-pointer"
                            >
                              Ver / Recalcular
                            </button>
                          </div>
                        </div>

                        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                          {match.aiFeedback.analyticalSummary}
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pt-0.5">
                          {match.aiFeedback.strengths.slice(0, 3).map((s) => (
                            <div
                              key={s.criterion}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#020617] border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px]"
                            >
                              <span className="text-slate-700 dark:text-slate-300 truncate font-medium">
                                {s.criterion}
                              </span>
                              <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-[#22c55e] shrink-0">
                                {s.score.toFixed(1)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      match.ratingGiven && (
                        <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Gere um resumo analítico tático da atuação com a IA:
                          </span>
                          <button
                            type="button"
                            onClick={() => setAiFeedbackMatch(match)}
                            className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 dark:border-[#38bdf8]/40 text-sky-700 dark:text-[#38bdf8] text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                          >
                            <GkAiSparkIcon className="w-3.5 h-3.5" />
                            <span>Gerar Parecer AI</span>
                          </button>
                        </div>
                      )
                    )}

                    {/* Botão Reconvocar para a próxima semana (Pelada Recorrente / Elenco Fixo) */}
                    {currentUser.role === 'contratante' && onReinviteNextWeek && (
                      <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {reinvitedId === match.id
                            ? '✓ Convite prioritário enviado para a próxima semana!'
                            : 'Gostou da atuação? Garanta o mesmo goleiro na próxima semana:'}
                        </span>
                        <button
                          type="button"
                          disabled={reinvitingId === match.id}
                          onClick={async () => {
                            setReinvitingId(match.id);
                            try {
                              await onReinviteNextWeek(match);
                              setReinvitedId(match.id);
                            } finally {
                              setReinvitingId(null);
                            }
                          }}
                          className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#22c55e] to-emerald-600 hover:brightness-110 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 cursor-pointer disabled:opacity-50 transition-all active:scale-95"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${
                              reinvitingId === match.id ? 'animate-spin' : ''
                            }`}
                          />
                          <span>
                            {reinvitingId === match.id
                              ? 'Reconvocando...'
                              : 'Reconvocar para a próxima semana'}
                          </span>
                        </button>
                      </div>
                    )}
                    {/* Exportar Dossiê da Partida em PDF */}
                    <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Documento corporativo da partida (notas 1-5★ e Mercado Pago):
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenPdfReport) {
                            onClose();
                            onOpenPdfReport({ scope: 'partida', selectedMatch: match });
                          } else {
                            generateGoalkeeperPerformancePdf({
                              user: currentUser,
                              matches,
                              selectedMatch: match,
                              scope: 'partida',
                            });
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5 text-sky-600 dark:text-[#38bdf8]" />
                        <span>Exportar PDF da Partida</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </motion.div>

      {/* Modal Interativo de Feedback Pós-Partida AI acoplado ao Histórico */}
      <PostMatchAiFeedbackModal
        isOpen={Boolean(aiFeedbackMatch)}
        onClose={() => setAiFeedbackMatch(null)}
        match={aiFeedbackMatch}
        currentUser={currentUser}
        onSaveAiFeedback={(matchId, feedback) => {
          if (onSaveAiFeedback) {
            onSaveAiFeedback(matchId, feedback);
          }
          setAiFeedbackMatch((prev) =>
            prev && prev.id === matchId ? { ...prev, aiFeedback: feedback } : prev
          );
        }}
        onApplyToReviewModal={(targetMatch, feedback) => {
          setAiFeedbackMatch(null);
          onClose();
          onOpenReview({
            ...targetMatch,
            aiFeedback: feedback,
          });
        }}
      />
    </div>
  );
};
