import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  GkAiSparkIcon,
  GkStarRatingIcon as Star,
  GkMetricsIcon as Award,
  GkCheckCircleIcon as CheckCircle2,
  GkShieldIcon as Shield,
  GkRefreshIcon as RefreshCw,
  GkCloseIcon as X,
  GkGloveBallIcon,
  GkMapPinIcon as MapPin,
  GkCalendarIcon as Calendar,
} from './icons';
import {
  MatchBooking,
  PostMatchAiFeedbackInput,
  PostMatchAiFeedbackResult,
  UserProfile,
} from '../types';
import {
  calculateDeterministicPostMatchFeedback,
  fetchPostMatchAiFeedback,
} from '../utils/postMatchFeedbackAI';
import { savePostMatchAiFeedbackToSupabase } from '../lib/supabaseClient';

interface PostMatchAiFeedbackPanelProps {
  match: MatchBooking;
  currentUser: UserProfile;
  onApplyToReviewForm?: (feedback: PostMatchAiFeedbackResult) => void;
  onSaveFeedbackOnly?: (matchId: string, feedback: PostMatchAiFeedbackResult) => void;
  compactHeader?: boolean;
}

export const PostMatchAiFeedbackPanel: React.FC<PostMatchAiFeedbackPanelProps> = ({
  match,
  currentUser,
  onApplyToReviewForm,
  onSaveFeedbackOnly,
  compactHeader = false,
}) => {
  const [hardSavesCount, setHardSavesCount] = useState<number>(6);
  const [goalsConceded, setGoalsConceded] = useState<number>(
    match.cleanSheetGiven ? 0 : 1
  );
  const [penaltiesSaved, setPenaltiesSaved] = useState<number>(
    match.penaltiesSavedGiven || 0
  );
  const [punctualityOnTime, setPunctualityOnTime] = useState<boolean>(true);
  const [aerialExitQuality, setAerialExitQuality] = useState<
    'firme' | 'segura' | 'oscilante'
  >('firme');
  const [distributionQuality, setDistributionQuality] = useState<
    'excelente' | 'boa' | 'regular'
  >('excelente');
  const [matchObservations, setMatchObservations] = useState<string>(
    match.notes || ''
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingSupabase, setIsSavingSupabase] = useState(false);
  const [feedbackResult, setFeedbackResult] =
    useState<PostMatchAiFeedbackResult | null>(match.aiFeedback || null);
  const [actionStatusMsg, setActionStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    setFeedbackResult(match.aiFeedback || null);
    setGoalsConceded(match.cleanSheetGiven ? 0 : 1);
    setPenaltiesSaved(match.penaltiesSavedGiven || 0);
    setMatchObservations(match.notes || '');
    setActionStatusMsg(null);
  }, [match.id, match.aiFeedback]);

  const buildInput = (): PostMatchAiFeedbackInput => ({
    matchId: match.id,
    arenaName: match.arenaName,
    modality: match.modality,
    competitiveLevel: match.competitiveLevel,
    goalkeeperName: match.goalkeeperName || 'Goleiro GK',
    organizerName: match.organizerName || currentUser.name,
    authorRole: currentUser.role,
    goalsConceded,
    hardSavesCount,
    penaltiesSaved,
    punctualityOnTime,
    distributionQuality,
    aerialExitQuality,
    matchObservations,
  });

  const handleGenerateAiFeedback = async () => {
    setIsGenerating(true);
    setActionStatusMsg(null);
    const input = buildInput();
    try {
      const result = await fetchPostMatchAiFeedback(input);
      setFeedbackResult(result);
    } catch {
      const fallback = calculateDeterministicPostMatchFeedback(input);
      setFeedbackResult(fallback);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyOneClick = () => {
    if (!feedbackResult) return;
    if (onApplyToReviewForm) {
      onApplyToReviewForm(feedbackResult);
      setActionStatusMsg(
        `Nota ${feedbackResult.consolidatedRating}.0★, ${feedbackResult.suggestedTags.length} destaques e parecer técnico aplicados ao formulário!`
      );
    }
  };

  const handlePersistAiReport = async (applyAsOfficialReview: boolean) => {
    if (!feedbackResult) return;
    setIsSavingSupabase(true);
    setActionStatusMsg(null);

    try {
      const { synced } = await savePostMatchAiFeedbackToSupabase({
        match,
        feedback: feedbackResult,
        reviewerId: currentUser.id,
        reviewerName: currentUser.name,
        applyAsOfficialReview,
      });

      if (onSaveFeedbackOnly) {
        onSaveFeedbackOnly(match.id, feedbackResult);
      }

      if (applyAsOfficialReview && onApplyToReviewForm) {
        onApplyToReviewForm(feedbackResult);
      }

      setActionStatusMsg(
        synced
          ? 'Parecer Pós-Partida AI salvo no histórico de partidas do Supabase!'
          : 'Parecer Pós-Partida AI salvo localmente e pronto para sincronização.'
      );
    } finally {
      setIsSavingSupabase(false);
    }
  };

  return (
    <div className="rounded-2xl bg-slate-50 dark:bg-[#020617] border border-sky-500/35 dark:border-[#38bdf8]/35 p-4 space-y-4 transition-colors">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-500/15 dark:bg-[#38bdf8]/15 border border-sky-500/40 dark:border-[#38bdf8]/40 flex items-center justify-center text-sky-600 dark:text-[#38bdf8] shrink-0">
            <GkAiSparkIcon className="w-4.5 h-4.5" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
              Feedback Pós-Partida AI
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {currentUser.role === 'goleiro'
                ? 'Autoanálise tática com pontos fortes e parecer técnico (Gemini AI + Modo Offline)'
                : 'Resumo analítico, pontos fortes e preenchimento da nota 1-5★ em 1 clique'}
            </p>
          </div>
        </div>

        {!compactHeader && (
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
            <span>{match.modality}</span>
            <span aria-hidden="true" className="mx-1.5">·</span>
            <span className="text-sky-600 dark:text-[#38bdf8] font-semibold">
              {feedbackResult?.source === 'gemini-ai'
                ? 'Gemini AI'
                : feedbackResult?.source === 'offline-engine'
                ? 'Motor Offline'
                : 'Pronto para análise'}
            </span>
          </div>
        )}
      </div>

      {/* Telemetry / Quick Match Criteria Inputs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {/* Defesas Difíceis */}
        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
          <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
            Defesas difíceis
          </span>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setHardSavesCount((v) => Math.max(0, v - 1))}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 font-bold text-sm hover:border-[#38bdf8] cursor-pointer transition-colors"
              aria-label="Diminuir defesas difíceis"
            >
              -
            </button>
            <span className="font-mono tabular-nums font-extrabold text-sm text-emerald-600 dark:text-[#22c55e]">
              {hardSavesCount}
            </span>
            <button
              type="button"
              onClick={() => setHardSavesCount((v) => Math.min(25, v + 1))}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 font-bold text-sm hover:border-[#22c55e] cursor-pointer transition-colors"
              aria-label="Aumentar defesas difíceis"
            >
              +
            </button>
          </div>
        </div>

        {/* Gols Sofridos */}
        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
          <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
            Gols sofridos
          </span>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setGoalsConceded((v) => Math.max(0, v - 1))}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 font-bold text-sm hover:border-[#38bdf8] cursor-pointer transition-colors"
              aria-label="Diminuir gols sofridos"
            >
              -
            </button>
            <span className="font-mono tabular-nums font-extrabold text-sm text-sky-600 dark:text-[#38bdf8]">
              {goalsConceded}
            </span>
            <button
              type="button"
              onClick={() => setGoalsConceded((v) => Math.min(15, v + 1))}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 font-bold text-sm hover:border-[#38bdf8] cursor-pointer transition-colors"
              aria-label="Aumentar gols sofridos"
            >
              +
            </button>
          </div>
        </div>

        {/* Pênaltis Defendidos */}
        <div className="col-span-2 sm:col-span-1 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
          <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
            Pênaltis pegos
          </span>
          <div className="grid grid-cols-4 gap-1">
            {[0, 1, 2, 3].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setPenaltiesSaved(num)}
                className={`h-8 rounded-lg font-mono tabular-nums text-xs font-bold border transition-all cursor-pointer ${
                  penaltiesSaved === num
                    ? 'bg-[#38bdf8] text-slate-950 border-[#38bdf8]'
                    : 'bg-slate-100 dark:bg-[#020617] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Saída de Gol, Reposição & Pontualidade */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
          <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
            Saída de gol
          </span>
          <div className="grid grid-cols-3 gap-1">
            {(
              [
                { id: 'firme', label: 'Firme' },
                { id: 'segura', label: 'Segura' },
                { id: 'oscilante', label: 'Oscil.' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setAerialExitQuality(opt.id)}
                className={`py-1.5 px-1 rounded-lg text-[11px] font-semibold border whitespace-nowrap transition-all cursor-pointer ${
                  aerialExitQuality === opt.id
                    ? 'bg-[#22c55e] text-slate-950 border-[#22c55e] font-bold'
                    : 'bg-slate-100 dark:bg-[#020617] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
          <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
            Reposição de bola
          </span>
          <div className="grid grid-cols-3 gap-1">
            {(
              [
                { id: 'excelente', label: 'Rápida' },
                { id: 'boa', label: 'Boa' },
                { id: 'regular', label: 'Regular' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDistributionQuality(opt.id)}
                className={`py-1.5 px-1 rounded-lg text-[11px] font-semibold border whitespace-nowrap transition-all cursor-pointer ${
                  distributionQuality === opt.id
                    ? 'bg-[#38bdf8] text-slate-950 border-[#38bdf8] font-bold'
                    : 'bg-slate-100 dark:bg-[#020617] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
          <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
            Pontualidade
          </span>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setPunctualityOnTime(true)}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border whitespace-nowrap transition-all cursor-pointer ${
                punctualityOnTime
                  ? 'bg-[#22c55e] text-slate-950 border-[#22c55e] font-bold'
                  : 'bg-slate-100 dark:bg-[#020617] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              No horário
            </button>
            <button
              type="button"
              onClick={() => setPunctualityOnTime(false)}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border whitespace-nowrap transition-all cursor-pointer ${
                !punctualityOnTime
                  ? 'bg-amber-400 text-slate-950 border-amber-400 font-bold'
                  : 'bg-slate-100 dark:bg-[#020617] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              Atrasou
            </button>
          </div>
        </div>
      </div>

      {/* Observações da Partida + Botão Gerar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={matchObservations}
          onChange={(e) => setMatchObservations(e.target.value)}
          placeholder="Lances marcantes (ex: defendeu chute no ângulo, orientou a zaga)..."
          aria-label="Observações táticas da partida para análise da IA"
          className="flex-1 h-10 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-[#38bdf8] focus:outline-none text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-colors"
        />
        <button
          type="button"
          onClick={handleGenerateAiFeedback}
          disabled={isGenerating}
          className="h-10 px-4 rounded-xl bg-gradient-to-r from-[#38bdf8] to-sky-500 hover:brightness-110 active:scale-[0.98] text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-sky-500/20 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 transition-all"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Analisando partida...</span>
            </>
          ) : (
            <>
              <GkAiSparkIcon className="w-4 h-4" />
              <span>{feedbackResult ? 'Recalcular Parecer AI' : 'Gerar Parecer AI'}</span>
            </>
          )}
        </button>
      </div>

      {/* Relatório Estruturado da IA */}
      {feedbackResult && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3.5"
        >
          {/* Consolidated Rating + Summary */}
          <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                <span className="text-sky-600 dark:text-[#38bdf8] font-bold">
                  Resumo Analítico
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {feedbackResult.source === 'gemini-ai' ? 'Gemini AI' : 'Motor Offline'}
                </span>
                {feedbackResult.suggestedCleanSheet && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-600 dark:text-[#22c55e] font-semibold">
                      Clean Sheet
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-slate-800 dark:text-slate-100 leading-relaxed font-medium">
                {feedbackResult.analyticalSummary}
              </p>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#020617] border border-emerald-500/35 dark:border-[#22c55e]/40 shrink-0">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={`w-3.5 h-3.5 ${
                      feedbackResult.consolidatedRating >= s
                        ? 'fill-[#22c55e] text-[#22c55e]'
                        : 'text-slate-300 dark:text-slate-700'
                    }`}
                  />
                ))}
              </div>
              <span className="font-mono tabular-nums font-black text-sm text-emerald-600 dark:text-[#22c55e]">
                {feedbackResult.consolidatedRating}.0
              </span>
            </div>
          </div>

          {/* Pontos Fortes Estruturados */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-emerald-600 dark:text-[#22c55e]" />
              <span>Critérios & Pontos Fortes Estruturados</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {feedbackResult.strengths.map((item, idx) => {
                const widthPct = Math.round((item.score / 5) * 100);
                return (
                  <div
                    key={`${item.criterion}-${idx}`}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#020617] border border-slate-200 dark:border-slate-800/90 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-900 dark:text-white truncate">
                        {item.criterion}
                      </span>
                      <span className="font-mono tabular-nums font-extrabold text-sky-600 dark:text-[#38bdf8] shrink-0">
                        {item.score.toFixed(1)}/5
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#22c55e] to-[#38bdf8] transition-all duration-300"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                      {item.highlight}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Parecer Técnico Gerado */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#020617] border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="text-[11px] font-bold text-emerald-700 dark:text-[#22c55e] block">
              Parecer Técnico Sugerido
            </span>
            <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
              "{feedbackResult.technicalOpinion}"
            </p>
            <div className="pt-1 text-[11px] text-slate-500 dark:text-slate-400">
              <strong className="text-sky-600 dark:text-[#38bdf8]">Ponto de atenção:</strong>{' '}
              {feedbackResult.improvementPoint}
            </div>
          </div>

          {/* Destaques detectados */}
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Destaques:
            </span>
            {feedbackResult.suggestedTags.map((tag, idx) => (
              <React.Fragment key={tag}>
                {idx > 0 && <span aria-hidden="true">·</span>}
                <span className="text-slate-700 dark:text-slate-300">{tag}</span>
              </React.Fragment>
            ))}
          </div>

          {actionStatusMsg && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/35 text-xs text-emerald-700 dark:text-[#22c55e] font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{actionStatusMsg}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {onApplyToReviewForm && (
              <button
                type="button"
                onClick={handleApplyOneClick}
                className="flex-1 min-w-[200px] h-11 px-4 rounded-xl bg-gradient-to-r from-[#22c55e] to-emerald-600 hover:brightness-110 active:scale-[0.98] text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer whitespace-nowrap transition-all"
              >
                <GkGloveBallIcon className="w-4 h-4 text-slate-950" />
                <span>Preencher Avaliação (1 Clique · ★ {feedbackResult.consolidatedRating}.0)</span>
              </button>
            )}

            {onSaveFeedbackOnly && (
              <button
                type="button"
                disabled={isSavingSupabase}
                onClick={() => handlePersistAiReport(false)}
                className="h-11 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-60 transition-colors"
              >
                <Shield className="w-3.5 h-3.5 text-sky-600 dark:text-[#38bdf8]" />
                <span>{isSavingSupabase ? 'Salvando...' : 'Salvar Parecer no Supabase'}</span>
              </button>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};

interface PostMatchAiFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: MatchBooking | null;
  currentUser: UserProfile;
  onSaveAiFeedback: (matchId: string, feedback: PostMatchAiFeedbackResult) => void;
  onApplyToReviewModal: (match: MatchBooking, feedback: PostMatchAiFeedbackResult) => void;
}

export const PostMatchAiFeedbackModal: React.FC<PostMatchAiFeedbackModalProps> = ({
  isOpen,
  onClose,
  match,
  currentUser,
  onSaveAiFeedback,
  onApplyToReviewModal,
}) => {
  if (!isOpen || !match) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/65 dark:bg-black/85 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-2xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]"
      >
        <div className="h-1.5 w-full bg-gradient-to-r from-[#22c55e] via-[#38bdf8] to-[#22c55e]" />

        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#38bdf8]/15 border border-[#38bdf8]/40 flex items-center justify-center text-sky-600 dark:text-[#38bdf8] shrink-0">
              <GkAiSparkIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-extrabold text-base text-slate-900 dark:text-white truncate">
                Relatório Técnico & Feedback Pós-Partida AI
              </h3>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {match.goalkeeperName || 'Goleiro GK'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-[#38bdf8]" />
                  {match.arenaName}
                </span>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-[#22c55e]" />
                  {match.date}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal de Feedback AI"
            className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto">
          <PostMatchAiFeedbackPanel
            match={match}
            currentUser={currentUser}
            onSaveFeedbackOnly={(matchId, fb) => onSaveAiFeedback(matchId, fb)}
            onApplyToReviewForm={(fb) => {
              onSaveAiFeedback(match.id, fb);
              onApplyToReviewModal(match, fb);
            }}
          />
        </div>
      </motion.div>
    </div>
  );
};
