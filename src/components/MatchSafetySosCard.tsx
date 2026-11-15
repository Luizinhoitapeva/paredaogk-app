import React, { useState, useMemo } from 'react';
import {
  GkCheckCircleIcon as CheckCircle2,
  GkMapPinIcon as MapPin,
  GkSosAlertIcon as SosAlert,
  GkRefreshIcon as RefreshCw,
  GkStarRatingIcon as Star,
  GkFlameIcon as Zap,
  GkWhistleIcon,
  GkAiSparkIcon,
  GkClockIcon as Clock,
} from './icons';
import { Goalkeeper, MatchBooking, UserRole } from '../types';
import { formatCurrency } from '../utils/validations';
import { ITAPEVA_HOUSE_FEE } from '../utils/cachePricingAI';
import { formatDurationLabel } from '../utils/geoMatchmaking';

interface MatchSafetySosCardProps {
  match: MatchBooking;
  userRole: UserRole;
  allGoalkeepers: Goalkeeper[];
  onOpenReviewModal?: (booking: MatchBooking) => void;
  onAcceptMatchVacancy?: (match: MatchBooking) => Promise<void> | void;
  onTrigger20MinEnRouteAlert?: (match: MatchBooking) => Promise<void> | void;
  onConfirmEnRoute20m?: (match: MatchBooking) => Promise<void> | void;
  onUpdateSafetyStatus: (
    match: MatchBooking,
    updates: {
      checkin2hConfirmed?: boolean;
      enRoute45mConfirmed?: boolean;
      goalkeeperCancelled?: boolean;
    }
  ) => void;
  onTriggerSos: (
    match: MatchBooking,
    radiusKm: number,
    urgencyBonus: number
  ) => Promise<{
    notifiedGoalkeepers: { id: string; name: string; distanceKm: number }[];
    syncedToSupabase: boolean;
  }>;
  onReinviteNextWeek: (match: MatchBooking) => Promise<void>;
}

export const MatchSafetySosCard: React.FC<MatchSafetySosCardProps> = ({
  match,
  userRole,
  allGoalkeepers,
  onOpenReviewModal,
  onAcceptMatchVacancy,
  onTrigger20MinEnRouteAlert,
  onConfirmEnRoute20m,
  onUpdateSafetyStatus,
  onTriggerSos,
  onReinviteNextWeek,
}) => {
  const [isSosPanelOpen, setIsSosPanelOpen] = useState(false);
  const [radiusKm, setRadiusKm] = useState(10);
  const [urgencyBonus, setUrgencyBonus] = useState(5);
  const [isDispatchingSos, setIsDispatchingSos] = useState(false);
  const [sosNotifiedResult, setSosNotifiedResult] = useState<
    { id: string; name: string; distanceKm: number }[] | null
  >(null);
  const [isReinviting, setIsReinviting] = useState(false);
  const [reinviteSuccessMsg, setReinviteSuccessMsg] = useState<string | null>(null);

  const nearbyAvailableGks = useMemo(
    () =>
      allGoalkeepers.filter(
        (gk) => gk.id !== match.goalkeeperId && gk.availableToday && gk.distanceKm <= radiusKm
      ),
    [allGoalkeepers, match.goalkeeperId, radiusKm]
  );

  const handleDispatchSos = async () => {
    setIsDispatchingSos(true);
    try {
      const res = await onTriggerSos(match, radiusKm, urgencyBonus);
      setSosNotifiedResult(res.notifiedGoalkeepers);
      setIsSosPanelOpen(false);
    } finally {
      setIsDispatchingSos(false);
    }
  };

  const handleReinvite = async () => {
    setIsReinviting(true);
    try {
      await onReinviteNextWeek(match);
      setReinviteSuccessMsg(
        `Convite prioritário disparado para ${match.goalkeeperName || 'seu goleiro'} para a próxima semana!`
      );
      setTimeout(() => setReinviteSuccessMsg(null), 5000);
    } finally {
      setIsReinviting(false);
    }
  };

  const isSosActive = Boolean(match.sosTriggered);
  const isAwaitingAcceptance =
    match.status === 'searching' || match.operationalStatus === 'awaiting_acceptance';
  const isEnRoute = Boolean(
    match.operationalStatus === 'en_route' ||
      match.enRoute20mConfirmed ||
      match.enRoute45mConfirmed
  );
  const show20MinPrompt = Boolean(
    match.enRoute20mNotified && !isEnRoute && !match.goalkeeperCancelled && match.status !== 'completed'
  );
  const needsUrgentAttention = Boolean(
    match.goalkeeperCancelled || (!match.checkin2hConfirmed && match.status === 'confirmed' && !isEnRoute)
  );

  const slotsCount = match.goalkeeperSlotsCount === 2 ? 2 : 1;
  const effectiveHouseFee = match.houseFee ?? ITAPEVA_HOUSE_FEE * slotsCount;
  const effectiveNetCustody =
    match.goalkeeperPayout ?? Math.max(0, Number((match.price - effectiveHouseFee).toFixed(2)));

  return (
    <div
      className={`p-4 sm:p-5 rounded-3xl border shadow-sm dark:shadow-xl space-y-4 transition-colors ${
        isEnRoute
          ? 'bg-gradient-to-br from-emerald-50 via-white to-slate-50 dark:from-[#020617] dark:via-slate-900 dark:to-emerald-950/40 border-[#22c55e]/70'
          : isSosActive || isAwaitingAcceptance
          ? 'bg-gradient-to-br from-sky-50 via-white to-slate-50 dark:from-[#020617] dark:via-slate-900 dark:to-sky-950/30 border-sky-400/70'
          : match.goalkeeperCancelled
          ? 'bg-gradient-to-br from-amber-50 via-white to-slate-50 dark:from-[#020617] dark:via-slate-900 dark:to-amber-950/20 border-amber-500/60'
          : 'bg-gradient-to-r from-emerald-50 via-white to-slate-50 dark:from-[#020617] dark:via-slate-900 dark:to-emerald-950/30 border-emerald-200 dark:border-emerald-500/35'
      }`}
    >
      {/* Top Match Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
              isEnRoute
                ? 'bg-[#22c55e]/20 border-[#22c55e]/60 text-emerald-700 dark:text-[#22c55e]'
                : isSosActive || match.goalkeeperCancelled || isAwaitingAcceptance
                ? 'bg-sky-500/15 border-sky-500/40 text-sky-600 dark:text-[#38bdf8]'
                : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-600 dark:text-[#22c55e]'
            }`}
          >
            {isSosActive || match.goalkeeperCancelled ? (
              <SosAlert className="w-5 h-5" />
            ) : isEnRoute ? (
              <Clock className="w-5 h-5" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                {match.status === 'completed'
                  ? 'Partida Concluída'
                  : isEnRoute
                  ? 'Goleiro A Caminho da Arena!'
                  : isSosActive
                  ? 'Alerta SOS Ativo · Substituição Relâmpago'
                  : isAwaitingAcceptance
                  ? `Buscando Goleiro (${match.radiusKm || 30} km)`
                  : match.goalkeeperCancelled
                  ? 'Goleiro Não Confirmou / Cancelou'
                  : 'Convocação Confirmada!'}
              </span>

              {isEnRoute && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#22c55e] text-slate-950 font-extrabold">
                  A CAMINHO · {match.enRoute20mAt || match.enRoute45mAt || 'AO VIVO'}
                </span>
              )}

              {slotsCount > 1 && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                  {slotsCount} Vagas GK
                </span>
              )}

              {match.gameLevel && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-700 dark:text-[#38bdf8] border border-sky-500/30 font-bold">
                  Nível: {match.gameLevel}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
              {match.goalkeeperName || 'Aguardando Aceite'} · {match.arenaName} ({match.date} · {match.time}
              {match.durationMinutes ? ` · ${formatDurationLabel(match.durationMinutes)}` : ''})
            </div>
          </div>
        </div>

        <div className="text-right shrink-0">
          <span className="text-xs font-mono tabular-nums font-bold text-emerald-600 dark:text-[#22c55e] block">
            {formatCurrency(match.price)}
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
            {match.modality} · Líq. {formatCurrency(effectiveNetCustody)} / Casa {formatCurrency(effectiveHouseFee)}
          </span>
        </div>
      </div>

      {/* PROMPT ATIVO 20 MINUTOS ANTES: "Você está a caminho do jogo em [Local]?" */}
      {show20MinPrompt && onConfirmEnRoute20m && (
        <div className="p-4 rounded-2xl bg-[#22c55e]/15 border-2 border-[#22c55e] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-emerald-700 dark:text-[#22c55e]">
              Confirmação Operacional · 20 min antes do jogo
            </div>
            <div className="text-sm font-extrabold text-slate-900 dark:text-white">
              Você está a caminho do jogo em {match.arenaName}?
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-300">
              Ao confirmar, o painel do contratante muda em tempo real para "A Caminho".
            </div>
          </div>
          <button
            type="button"
            onClick={() => onConfirmEnRoute20m(match)}
            className="min-h-[44px] px-5 rounded-xl bg-[#22c55e] hover:brightness-110 text-slate-950 font-extrabold text-xs shrink-0 shadow-lg shadow-emerald-500/25 cursor-pointer transition-all active:scale-95"
          >
            Sim, estou a caminho
          </button>
        </div>
      )}

      {/* BANNER PARA GOLEIRO ACEITAR CONVOCAÇÃO QUANDO EM BUSCA / ABERTO */}
      {isAwaitingAcceptance && onAcceptMatchVacancy && match.status !== 'completed' && (
        <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/35 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">
            <span className="font-extrabold text-slate-900 dark:text-white block">
              Vaga Aberta no Radar ({match.radiusKm || 30} km)
            </span>
            <span className="text-[11px] text-slate-600 dark:text-slate-300">
              Cachê líquido de {formatCurrency(effectiveNetCustody / slotsCount)} por vaga retido em custódia.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onAcceptMatchVacancy(match)}
            className="min-h-[42px] px-4 rounded-xl bg-[#22c55e] hover:brightness-110 text-slate-950 font-extrabold text-xs cursor-pointer transition-all active:scale-95"
          >
            Aceitar Partida Agora
          </button>
        </div>
      )}

      {/* Linha do Tempo Operacional */}
      {match.status !== 'completed' && (
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#020617]/90 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <GkWhistleIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-[#22c55e]" />
              Rastreamento Operacional da Partida
            </span>
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
              Supabase Realtime · Custódia Garantida
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Etapa 1: Escalação / Aceite */}
            <div
              className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${
                !isAwaitingAcceptance
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-sky-500/10 border-sky-500/30'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full font-extrabold text-[11px] flex items-center justify-center shrink-0 ${
                  !isAwaitingAcceptance
                    ? 'bg-[#22c55e] text-slate-950'
                    : 'bg-sky-500 text-slate-950'
                }`}
              >
                {!isAwaitingAcceptance ? '✓' : '1'}
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-slate-900 dark:text-white">
                  1. {isAwaitingAcceptance ? 'Aguardando Aceite' : 'Goleiro Escalado'}
                </div>
                <div className="text-[10px] text-emerald-700 dark:text-[#22c55e] truncate">
                  Custódia R$ {effectiveNetCustody.toFixed(2)} + Casa R$ {effectiveHouseFee.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Etapa 2: Alerta 20 min antes */}
            <div
              className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${
                match.goalkeeperCancelled
                  ? 'bg-red-500/10 border-red-500/35'
                  : match.enRoute20mNotified || isEnRoute
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full font-extrabold text-[10px] flex items-center justify-center shrink-0 ${
                  match.goalkeeperCancelled
                    ? 'bg-red-500 text-white'
                    : match.enRoute20mNotified || isEnRoute
                    ? 'bg-[#22c55e] text-slate-950'
                    : 'bg-sky-500/20 text-sky-600 dark:text-[#38bdf8] border border-sky-500/40'
                }`}
              >
                {match.goalkeeperCancelled ? '!' : match.enRoute20mNotified || isEnRoute ? '✓' : '20m'}
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-slate-900 dark:text-white">
                  2. Chamada 20 min Antes
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {match.goalkeeperCancelled
                    ? 'Cancelado'
                    : isEnRoute
                    ? 'Respondido: SIM'
                    : match.enRoute20mNotified
                    ? 'Aguardando resposta "Sim"'
                    : 'Programado p/ 20 min antes'}
                </div>
              </div>
            </div>

            {/* Etapa 3: Status A Caminho em Tempo Real */}
            <div
              className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${
                match.goalkeeperCancelled
                  ? 'bg-amber-500/10 border-amber-500/35'
                  : isEnRoute
                  ? 'bg-[#22c55e]/15 border-[#22c55e]/60'
                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full font-extrabold text-[10px] flex items-center justify-center shrink-0 ${
                  match.goalkeeperCancelled
                    ? 'bg-amber-500 text-slate-950'
                    : isEnRoute
                    ? 'bg-[#22c55e] text-slate-950'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {match.goalkeeperCancelled ? 'SOS' : isEnRoute ? '✓' : 'GO'}
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-slate-900 dark:text-white">
                  3. Status "A Caminho"
                </div>
                <div
                  className={`text-[10px] truncate ${
                    match.goalkeeperCancelled
                      ? 'text-amber-700 dark:text-amber-300 font-semibold'
                      : isEnRoute
                      ? 'text-emerald-700 dark:text-[#22c55e] font-bold'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {match.goalkeeperCancelled
                    ? 'Pronto para SOS'
                    : isEnRoute
                    ? `A caminho (${match.enRoute20mAt || match.enRoute45mAt || 'Em rota'})`
                    : 'Aguardando confirmação'}
                </div>
              </div>
            </div>
          </div>

          {/* Controles Operacionais & Alerta 20 min */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {!match.enRoute20mNotified && !isEnRoute && !match.goalkeeperCancelled && onTrigger20MinEnRouteAlert && (
                <button
                  type="button"
                  onClick={() => onTrigger20MinEnRouteAlert(match)}
                  className="px-3 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-[11px] font-bold text-sky-700 dark:text-[#38bdf8] cursor-pointer transition-colors"
                >
                  Simular Alerta 20 min antes
                </button>
              )}

              {!isEnRoute && !match.goalkeeperCancelled && onConfirmEnRoute20m && (
                <button
                  type="button"
                  onClick={() => onConfirmEnRoute20m(match)}
                  className="px-3 py-1.5 rounded-lg bg-[#22c55e]/15 hover:bg-[#22c55e]/25 border border-[#22c55e]/40 text-[11px] font-bold text-emerald-700 dark:text-[#22c55e] cursor-pointer transition-colors"
                >
                  Marcar "A Caminho"
                </button>
              )}

              {!match.goalkeeperCancelled && !isSosActive && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSafetyStatus(match, {
                      goalkeeperCancelled: true,
                      checkin2hConfirmed: false,
                      enRoute45mConfirmed: false,
                    })
                  }
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-amber-500/15 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 cursor-pointer transition-colors"
                >
                  {userRole === 'contratante' ? 'Reportar Atraso / Falta' : 'Simular Cancelamento'}
                </button>
              )}
            </div>

            {userRole === 'contratante' && (
              <button
                type="button"
                onClick={() => setIsSosPanelOpen(!isSosPanelOpen)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                  needsUrgentAttention || isSosActive
                    ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/25'
                    : 'bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-700 dark:text-[#38bdf8]'
                }`}
              >
                <SosAlert className="w-4 h-4" />
                <span>{isSosActive ? 'Reenviar Alerta SOS' : 'Acionar SOS'}</span>
              </button>
            )}
          </div>

          {isSosPanelOpen && (
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-sky-500/40 space-y-3">
              <div>
                <h4 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-sky-600 dark:text-[#38bdf8]" />
                  Substituição Relâmpago · Alerta SOS Prioritário
                </h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                  Notifica goleiros disponíveis próximos a {match.arenaName}.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Raio próximo à arena:
                  </label>
                  <div className="flex gap-1.5">
                    {[10, 20, 30].map((km) => (
                      <button
                        key={km}
                        type="button"
                        onClick={() => setRadiusKm(km)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold border cursor-pointer transition-all ${
                          radiusKm === km
                            ? 'bg-[#38bdf8] text-slate-950 border-[#38bdf8]'
                            : 'bg-white dark:bg-[#020617] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {km} km
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Bônus de urgência:
                  </label>
                  <div className="flex gap-1.5">
                    {[5, 10, 15].map((bonus) => (
                      <button
                        key={bonus}
                        type="button"
                        onClick={() => setUrgencyBonus(bonus)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold border cursor-pointer transition-all ${
                          urgencyBonus === bonus
                            ? 'bg-[#22c55e] text-slate-950 border-[#22c55e]'
                            : 'bg-white dark:bg-[#020617] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        +R$ {bonus}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-sky-700 dark:text-[#38bdf8] flex items-center gap-1.5 font-medium">
                  <MapPin className="w-3.5 h-3.5" />
                  {nearbyAvailableGks.length} goleiro(s) num raio de {radiusKm} km
                </span>

                <button
                  type="button"
                  disabled={isDispatchingSos}
                  onClick={handleDispatchSos}
                  className="px-4 py-2 rounded-xl bg-[#38bdf8] hover:brightness-110 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <SosAlert className="w-4 h-4" />
                  <span>
                    {isDispatchingSos
                      ? 'Disparando SOS...'
                      : `Disparar Alerta SOS (+R$ ${urgencyBonus})`}
                  </span>
                </button>
              </div>
            </div>
          )}

          {sosNotifiedResult && (
            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/35 text-[11px] text-sky-800 dark:text-sky-200 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-sky-600 dark:text-[#38bdf8]" />
                <span>
                  Alerta SOS enviado via Supabase Realtime para {sosNotifiedResult.length} goleiro(s) num raio de {radiusKm}km!
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {reinviteSuccessMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-xs text-emerald-700 dark:text-[#22c55e] font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{reinviteSuccessMsg}</span>
        </div>
      )}

      {match.status === 'completed' && (
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
          {match.ratingGiven ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 dark:text-slate-400">Avaliação enviada:</span>
              <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-amber-500 dark:fill-amber-400" />
                {match.ratingGiven}.0
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-600 dark:text-slate-400">
                Partida finalizada — avalie o goleiro:
              </span>
              {onOpenReviewModal && (
                <button
                  type="button"
                  onClick={() => onOpenReviewModal(match)}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#38bdf8] to-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <GkAiSparkIcon className="w-3.5 h-3.5" />
                  <span>Avaliar / Parecer AI (1-5★)</span>
                </button>
              )}
            </div>
          )}

          {userRole === 'contratante' && (
            <button
              type="button"
              disabled={isReinviting}
              onClick={handleReinvite}
              className="px-3.5 py-2 rounded-xl bg-[#22c55e] hover:brightness-110 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isReinviting ? 'animate-spin' : ''}`} />
              <span>
                {isReinviting ? 'Enviando convite...' : 'Reconvocar para a próxima semana'}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
