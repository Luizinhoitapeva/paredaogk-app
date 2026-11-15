import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  GkCloseIcon as X,
  GkStarRatingIcon as Star,
  GkMetricsIcon as Award,
  GkCheckCircleIcon as CheckCircle2,
  GkCheckCircleIcon as AlertCircle,
  GkAiSparkIcon,
  GkMapPinIcon as MapPin,
  GkCalendarIcon as Calendar,
  GkGloveBallIcon as Send,
  GkChatIcon as MessageSquare
} from './icons';
import { MatchBooking, PostMatchAiFeedbackResult, UserProfile } from '../types';
import { submitGoalkeeperReview, savePostMatchAiFeedbackToSupabase } from '../lib/supabaseClient';
import { PostMatchAiFeedbackPanel } from './PostMatchAiFeedbackPanel';

interface PostMatchReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: MatchBooking | null;
  currentUser: UserProfile;
  onReviewSuccess: (
    bookingId: string,
    rating: number,
    comment: string,
    tags: string[],
    isMvp: boolean,
    extras?: {
      cleanSheetConfirmed?: boolean;
      penaltiesSaved?: number;
      aiFeedback?: PostMatchAiFeedbackResult | null;
    }
  ) => void;
}

const REVIEW_TAGS = [
  '🧤 Fechou o Gol',
  '⚽ Pegou Pênalti',
  '⏱️ Pontualidade 100%',
  '🚀 Reposição Rápida',
  '🗣️ Comando de Zaga',
  '🔥 Reflexo Puro',
  '🛡️ Saída Aérea Firme',
  '🤝 Fair Play Exemplar',
];

const RATING_LABELS: Record<number, { title: string; desc: string; color: string }> = {
  1: { title: 'Insatisfatório', desc: 'Atuação abaixo do esperado ou falta de pontualidade.', color: 'text-red-600 dark:text-red-400' },
  2: { title: 'Regular', desc: 'Partida com falhas, mas cumpriu o horário.', color: 'text-amber-600 dark:text-amber-400' },
  3: { title: 'Bom', desc: 'Partida segura, fez defesas normais.', color: 'text-yellow-600 dark:text-yellow-400' },
  4: { title: 'Muito Bom', desc: 'Grande atuação, fez defesas decisivas para a equipe.', color: 'text-emerald-600 dark:text-emerald-400' },
  5: { title: 'Muralha Absoluta / MVP', desc: 'Fechou o gol, pegou tudo e garantiu a vitória!', color: 'text-emerald-700 dark:text-emerald-300' },
};

export const PostMatchReviewModal: React.FC<PostMatchReviewModalProps> = ({
  isOpen,
  onClose,
  booking,
  currentUser,
  onReviewSuccess,
}) => {
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>(['🧤 Fechou o Gol', '⏱️ Pontualidade 100%']);
  const [isCleanSheet, setIsCleanSheet] = useState(false);
  const [penaltiesSaved, setPenaltiesSaved] = useState(0);
  const [isMvp, setIsMvp] = useState(true);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [appliedAiFeedback, setAppliedAiFeedback] = useState<PostMatchAiFeedbackResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorNotice, setErrorNotice] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  useEffect(() => {
    if (!booking) return;
    setErrorNotice('');
    setSuccessNotice('');

    if (booking.aiFeedback) {
      setRating(booking.aiFeedback.consolidatedRating);
      setComment(booking.aiFeedback.technicalOpinion);
      setSelectedTags(booking.aiFeedback.suggestedTags);
      setIsCleanSheet(booking.aiFeedback.suggestedCleanSheet);
      setPenaltiesSaved(booking.aiFeedback.suggestedPenaltiesSaved);
      setIsMvp(booking.aiFeedback.suggestedIsMvp);
      setAppliedAiFeedback(booking.aiFeedback);
      setIsAiAssistantOpen(false);
    } else {
      setRating(booking.ratingGiven || 5);
      setComment(booking.reviewComment || '');
      setSelectedTags(
        booking.reviewTags && booking.reviewTags.length > 0
          ? booking.reviewTags
          : ['🧤 Fechou o Gol', '⏱️ Pontualidade 100%']
      );
      setIsCleanSheet(Boolean(booking.cleanSheetGiven));
      setPenaltiesSaved(Number(booking.penaltiesSavedGiven || 0));
      setIsMvp(booking.mvpGiven ?? true);
      setAppliedAiFeedback(null);
      setIsAiAssistantOpen(false);
    }
  }, [booking, isOpen]);

  if (!isOpen || !booking) return null;

  const activeRating = hoverRating || rating;
  const ratingInfo = RATING_LABELS[activeRating] || RATING_LABELS[5];

  const handleToggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleApplyAiToForm = (feedback: PostMatchAiFeedbackResult) => {
    setRating(feedback.consolidatedRating);
    setComment(feedback.technicalOpinion);
    setSelectedTags(feedback.suggestedTags);
    setIsCleanSheet(feedback.suggestedCleanSheet);
    setPenaltiesSaved(feedback.suggestedPenaltiesSaved);
    setIsMvp(feedback.suggestedIsMvp);
    setAppliedAiFeedback(feedback);
    setErrorNotice('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNotice('');
    setSuccessNotice('');

    if (rating < 1 || rating > 5) {
      setErrorNotice('Por favor, selecione uma nota de 1 a 5 estrelas.');
      return;
    }

    if (!comment.trim() || comment.trim().length < 5) {
      setErrorNotice('Por favor, escreva um breve comentário sobre a atuação (mínimo de 5 caracteres).');
      return;
    }

    setIsSubmitting(true);

    try {
      const goalkeeperId = booking.goalkeeperId || '';
      const goalkeeperName = booking.goalkeeperName || 'Goleiro Paredão';

      // Salva no Supabase (match_reviews) e recalcula métricas no 'profiles'
      await submitGoalkeeperReview({
        bookingId: booking.id,
        contractorId: currentUser.id,
        contractorName: currentUser.name,
        goalkeeperId: goalkeeperId,
        goalkeeperName: goalkeeperName,
        rating: rating,
        comment: comment.trim(),
        tags: selectedTags,
        cleanSheetConfirmed: isCleanSheet,
        penaltiesSaved: penaltiesSaved,
        isMvp: isMvp,
      });

      if (appliedAiFeedback) {
        await savePostMatchAiFeedbackToSupabase({
          match: booking,
          feedback: appliedAiFeedback,
          reviewerId: currentUser.id,
          reviewerName: currentUser.name,
          applyAsOfficialReview: false,
        });
      }

      setSuccessNotice('Avaliação registrada com sucesso no Supabase! Perfil do goleiro atualizado.');

      setTimeout(() => {
        setIsSubmitting(false);
        onReviewSuccess(booking.id, rating, comment.trim(), selectedTags, isMvp, {
          cleanSheetConfirmed: isCleanSheet,
          penaltiesSaved,
          aiFeedback: appliedAiFeedback,
        });
        onClose();
      }, 700);
    } catch (err: any) {
      console.error('[Review Submit Error]', err);
      setErrorNotice(err?.message || 'Erro ao salvar avaliação.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/85 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative w-full max-w-2xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-8 transition-colors"
      >
        {/* Top Accent Strip */}
        <div className="h-2 w-full bg-gradient-to-r from-[#22c55e] via-[#38bdf8] to-amber-400" />

        {/* Modal Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Star className="w-5 h-5 fill-amber-500 dark:fill-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-extrabold text-base text-slate-900 dark:text-white">
                  Avaliação Pós-Jogo
                </h3>
                <span className="text-[11px] font-mono text-emerald-600 dark:text-[#22c55e]">
                  · Supabase DB
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sua nota e parecer atualizam a pontuação oficial do goleiro.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-800/80 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Goalkeeper Match Summary Card */}
        <div className="p-4 mx-6 mt-5 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3.5">
            {booking.goalkeeperPhoto ? (
              <img
                src={booking.goalkeeperPhoto}
                alt={booking.goalkeeperName}
                className="w-13 h-13 rounded-2xl object-cover border-2 border-emerald-500/40 shadow-md"
              />
            ) : (
              <div className="w-13 h-13 rounded-2xl bg-slate-200 dark:bg-slate-800 border-2 border-emerald-500/40 shadow-md flex items-center justify-center font-display font-black text-base text-emerald-600 dark:text-[#22c55e]">
                {(booking.goalkeeperName || 'GK')
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((n) => n[0]?.toUpperCase() || '')
                  .join('')}
              </div>
            )}
            <div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                {booking.goalkeeperName || 'Goleiro Escalado'}
              </h4>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                <span>{booking.arenaName}</span>
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  {booking.date} às {booking.time}
                </span>
                <span>•</span>
                <span className="text-slate-600 dark:text-slate-400 font-medium">{booking.modality}</span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Status</span>
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
              Partida Finalizada
            </span>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {errorNotice && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-2.5 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
              <span>{errorNotice}</span>
            </div>
          )}

          {successNotice && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{successNotice}</span>
            </div>
          )}

          {/* Assistente Pós-Partida AI (Gemini + Modo Offline) */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-sky-500/35 dark:border-[#38bdf8]/35">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-sky-500/15 dark:bg-[#38bdf8]/15 border border-sky-500/35 flex items-center justify-center text-sky-600 dark:text-[#38bdf8] shrink-0">
                  <GkAiSparkIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                    {appliedAiFeedback
                      ? `Parecer AI aplicado (★ ${appliedAiFeedback.consolidatedRating}.0)`
                      : 'Assistente Pós-Partida AI'}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Estruture pontos fortes e preencha estrelas e parecer em 1 clique
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAiAssistantOpen((prev) => !prev)}
                className={`h-9 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                  isAiAssistantOpen
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                    : 'bg-gradient-to-r from-[#38bdf8] to-sky-500 text-slate-950 shadow-sm shadow-sky-500/20 hover:brightness-110'
                }`}
              >
                {isAiAssistantOpen
                  ? 'Recolher IA'
                  : appliedAiFeedback
                  ? 'Ajustar com IA'
                  : 'Gerar com IA'}
              </button>
            </div>

            {isAiAssistantOpen && (
              <PostMatchAiFeedbackPanel
                match={booking}
                currentUser={currentUser}
                compactHeader
                onApplyToReviewForm={(fb) => {
                  handleApplyAiToForm(fb);
                  setIsAiAssistantOpen(false);
                }}
              />
            )}
          </div>

          {/* 1 to 5 Stars Interactive Picker */}
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center space-y-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Como foi a atuação do goleiro? Selecione de 1 a 5 estrelas:
            </label>

            <div className="flex items-center justify-center gap-2 sm:gap-3 py-1">
              {[1, 2, 3, 4, 5].map((starValue) => {
                const isFilled = activeRating >= starValue;
                return (
                  <button
                    key={starValue}
                    type="button"
                    onClick={() => setRating(starValue)}
                    onMouseEnter={() => setHoverRating(starValue)}
                    onMouseLeave={() => setHoverRating(null)}
                    className="p-1.5 transition-transform hover:scale-125 active:scale-95 cursor-pointer focus:outline-none"
                    aria-label={`${starValue} estrelas`}
                  >
                    <Star
                      className={`w-8 h-8 sm:w-9 sm:h-9 transition-colors ${
                        isFilled
                          ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.4)]'
                          : 'text-slate-300 dark:text-slate-700 hover:text-slate-400 dark:hover:text-slate-500'
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            {/* Label and description of selected rating */}
            <div className="pt-1">
              <div className={`font-bold text-sm ${ratingInfo.color} flex items-center justify-center gap-1.5`}>
                <span>★ {activeRating}.0</span>
                <span>—</span>
                <span>{ratingInfo.title}</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{ratingInfo.desc}</p>
            </div>
          </div>

          {/* Quick Technical Tags */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Destaques técnicos da partida (selecione os que se aplicam):
            </label>
            <div className="flex flex-wrap gap-2">
              {REVIEW_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleTag(tag)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/15 dark:bg-emerald-500/20 border-emerald-500/50 text-emerald-700 dark:text-emerald-300 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Match Achievements (Clean Sheet & Penalties Saved & MVP) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  id="clean-sheet-check"
                  type="checkbox"
                  checked={isCleanSheet}
                  onChange={(e) => setIsCleanSheet(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                />
                <label htmlFor="clean-sheet-check" className="text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
                  Terminou sem sofrer gols (Clean Sheet) 🛡️
                </label>
              </div>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">+1 Estatística</span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800/60">
              <label className="text-xs text-slate-700 dark:text-slate-300">
                Pênaltis defendidos no jogo:
              </label>
              <div className="flex items-center gap-2">
                {[0, 1, 2, 3].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setPenaltiesSaved(num)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      penaltiesSaved === num
                        ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800/60">
              <div className="flex items-center gap-2">
                <input
                  id="mvp-check"
                  type="checkbox"
                  checked={isMvp}
                  onChange={(e) => setIsMvp(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-amber-500 focus:ring-amber-500 cursor-pointer"
                />
                <label htmlFor="mvp-check" className="text-xs font-medium text-amber-700 dark:text-amber-300 flex items-center gap-1.5 cursor-pointer">
                  <Award className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Eleger como Luva da Partida (Melhor em Campo)</span>
                </label>
              </div>
            </div>
          </div>

          {/* Comment Textarea */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Comentário pós-jogo para o perfil do goleiro *</span>
              </label>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                {comment.length} caracteres
              </span>
            </div>

            <textarea
              required
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Ex: O Marcos foi uma muralha! Fez pelo menos três defesas inacreditáveis no segundo tempo, chegou 15 minutos adiantado e organizou a zaga com liderança. Recomendo muito!"
              className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 transition-colors resize-none"
            />
          </div>

          {/* Submit Action */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 active:scale-[0.99] text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Salvar Avaliação no Supabase & Atualizar Perfil</span>
                </>
              )}
            </button>
            <div className="text-center mt-2 text-[10px] text-slate-500">
              Registrado de forma transparente no banco de dados e visível na vitrine de goleiros.
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
