import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GkCloseIcon as X,
  GkShieldCheckAdminIcon as AdminShield,
  GkCheckCircleIcon as CheckCircle2,
  GkTrashIcon as Trash2,
  GkMapPinIcon as MapPin,
  GkInstagramIcon as Instagram,
  GkClockIcon as Clock,
  GkWhatsAppIcon,
} from './icons';
import { ArenaField, ArenaModerationStatus, UserProfile } from '../types';
import { isAuthorizedAdmin, moderateArenaInSupabase } from '../lib/supabaseClient';

interface ArenaModerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  arenas: ArenaField[];
  onArenaModerated: (arenaId: string, action: 'approve' | 'archive' | 'delete') => void;
}

const ADMIN_PASSCODE = 'PGK-ITAPEVA';

export const ArenaModerationModal: React.FC<ArenaModerationModalProps> = ({
  isOpen,
  onClose,
  user,
  arenas,
  onArenaModerated,
}) => {
  const [activeStatusTab, setActiveStatusTab] = useState<ArenaModerationStatus>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [adminUnlockedByKey, setAdminUnlockedByKey] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const hasAdminAccess = isAuthorizedAdmin(user.email) || adminUnlockedByKey;

  const pendingArenas = arenas.filter((a) => a.status === 'pending');
  const approvedArenas = arenas.filter((a) => a.status === 'approved');
  const archivedArenas = arenas.filter((a) => a.status === 'archived');

  const currentList =
    activeStatusTab === 'pending'
      ? pendingArenas
      : activeStatusTab === 'approved'
      ? approvedArenas
      : archivedArenas;

  const handleUnlockAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcodeInput.trim().toUpperCase() === ADMIN_PASSCODE) {
      setAdminUnlockedByKey(true);
      setPasscodeError('');
      setPasscodeInput('');
    } else {
      setPasscodeError('Chave administrativa inválida. Acesso restrito ao administrador.');
    }
  };

  const handleAction = async (arena: ArenaField, action: 'approve' | 'archive' | 'delete') => {
    setProcessingId(arena.id);
    setStatusFeedback(null);

    const { synced } = await moderateArenaInSupabase(arena.id, action);
    onArenaModerated(arena.id, action);

    const verb =
      action === 'approve'
        ? 'aprovada e publicada na vitrine + radar'
        : action === 'archive'
        ? 'arquivada / rejeitada'
        : 'excluída permanentemente';
    setStatusFeedback(
      `"${arena.name}" foi ${verb}${synced ? ' (Supabase atualizado).' : ' (modo local).'}`
    );
    setProcessingId(null);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 dark:bg-black/90 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          className="relative w-full max-w-3xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#38bdf8]/15 border border-[#38bdf8]/40 flex items-center justify-center text-sky-600 dark:text-[#38bdf8]">
                <AdminShield className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display font-extrabold text-base text-slate-900 dark:text-white">
                    Painel de Moderação de Arenas
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-[#38bdf8]/15 text-sky-700 dark:text-[#38bdf8] border border-[#38bdf8]/35 font-mono text-[10px] font-bold uppercase">
                    Admin Restrito
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Aprove campos enviados pela comunidade para liberar instantaneamente no radar de Itapeva
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {!hasAdminAccess ? (
            <div className="p-6 sm:p-8 space-y-5 overflow-y-auto text-center max-w-md mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-500 mx-auto">
                <AdminShield className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display font-extrabold text-base text-slate-900 dark:text-white">
                  Acesso Restrito ao Administrador
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  A aprovação ou exclusão de arenas é restrita à conta administrativa oficial do ParedãoGK ({user.email}).
                </p>
              </div>

              <form onSubmit={handleUnlockAdmin} className="space-y-3 text-left">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Chave de Liberação Administrativa (Opcional):
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={passcodeInput}
                    onChange={(e) => setPasscodeInput(e.target.value)}
                    placeholder="Digite a chave admin"
                    className="flex-1 h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-[#38bdf8] focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-4 h-10 rounded-xl bg-[#38bdf8] hover:bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer"
                  >
                    Desbloquear
                  </button>
                </div>
                {passcodeError && (
                  <p className="text-[11px] text-red-500 font-medium">{passcodeError}</p>
                )}
              </form>
            </div>
          ) : (
            <>
              {/* Filter Tabs */}
              <div className="px-5 pt-4 pb-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#020617]">
                <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveStatusTab('pending')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      activeStatusTab === 'pending'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Pendentes ({pendingArenas.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveStatusTab('approved')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      activeStatusTab === 'approved'
                        ? 'bg-[#22c55e] text-slate-950'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Aprovadas ({approvedArenas.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveStatusTab('archived')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeStatusTab === 'archived'
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Arquivadas ({archivedArenas.length})
                  </button>
                </div>

                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  Admin: {user.email}
                </span>
              </div>

              {/* Feedback Toast */}
              {statusFeedback && (
                <div className="mx-5 mt-4 px-3.5 py-2.5 rounded-xl bg-[#22c55e]/15 border border-[#22c55e]/40 text-xs font-semibold text-emerald-700 dark:text-[#22c55e] flex items-center justify-between gap-2">
                  <span>{statusFeedback}</span>
                  <button
                    type="button"
                    onClick={() => setStatusFeedback(null)}
                    className="text-[11px] underline cursor-pointer"
                  >
                    Ok
                  </button>
                </div>
              )}

              {/* Submissions Queue */}
              <div className="p-5 overflow-y-auto space-y-3 flex-1">
                {currentList.length === 0 ? (
                  <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-1.5">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Nenhuma arena na aba "{activeStatusTab === 'pending' ? 'Pendentes' : activeStatusTab === 'approved' ? 'Aprovadas' : 'Arquivadas'}".
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {activeStatusTab === 'pending'
                        ? 'Todas as solicitações da comunidade já foram revisadas.'
                        : 'Utilize os botões de moderação nos itens para mover ou remover registros.'}
                    </p>
                  </div>
                ) : (
                  currentList.map((arena) => {
                    const isBusy = processingId === arena.id;
                    return (
                      <div
                        key={arena.id}
                        className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-4 justify-between"
                      >
                        <div className="flex flex-col sm:flex-row gap-3.5 min-w-0 flex-1">
                          <div
                            className={`w-full sm:w-28 h-28 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 ${
                              arena.isLogoPhoto ? 'bg-white' : 'bg-slate-950'
                            }`}
                          >
                            <img
                              src={arena.photoUrl}
                              alt={arena.name}
                              className={`w-full h-full ${
                                arena.isLogoPhoto ? 'object-contain p-2' : 'object-cover'
                              }`}
                            />
                          </div>

                          <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-display font-bold text-sm text-slate-900 dark:text-white">
                                {arena.name}
                              </h4>
                              <span className="px-2 py-0.5 rounded-md bg-[#38bdf8]/15 text-sky-700 dark:text-[#38bdf8] border border-[#38bdf8]/30 font-mono text-[10px] font-bold">
                                {arena.surfaceType}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-[#22c55e] border border-emerald-500/30 font-mono text-[10px] font-bold">
                                {arena.mainModality}
                              </span>
                            </div>

                            <p className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-[#38bdf8] shrink-0 mt-0.5" />
                              <span>{arena.address}</span>
                            </p>

                            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              <span className="flex items-center gap-1">
                                <GkWhatsAppIcon className="w-3 h-3 text-[#22c55e]" />
                                {arena.phone}
                              </span>
                              {arena.instagram && (
                                <span className="flex items-center gap-1 text-[#38bdf8]">
                                  <Instagram className="w-3 h-3" />
                                  {arena.instagram}
                                </span>
                              )}
                            </div>

                            {arena.submittedByName && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Enviado por: <strong className="text-slate-700 dark:text-slate-300">{arena.submittedByName}</strong>
                                {arena.submittedByEmail ? ` (${arena.submittedByEmail})` : ''}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Moderation Buttons */}
                        <div className="flex sm:flex-col items-center sm:items-end justify-end gap-2 shrink-0">
                          {arena.status !== 'approved' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleAction(arena, 'approve')}
                              className="px-3.5 py-2 rounded-xl bg-[#22c55e] hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-[#22c55e]/20 cursor-pointer transition-all"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Aprovar</span>
                            </button>
                          )}

                          {arena.status !== 'archived' && !arena.isOfficialSeed && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleAction(arena, 'archive')}
                              className="px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold text-xs cursor-pointer transition-all"
                            >
                              Arquivar
                            </button>
                          )}

                          {!arena.isOfficialSeed && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleAction(arena, 'delete')}
                              className="px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/35 text-red-600 dark:text-red-400 font-bold text-xs flex items-center gap-1 cursor-pointer transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Excluir</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
