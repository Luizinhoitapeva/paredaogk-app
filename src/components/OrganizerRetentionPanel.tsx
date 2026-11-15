import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GkCalendarIcon as Calendar,
  GkClockIcon as Clock,
  GkMapPinIcon as MapPin,
  GkHeartIcon as Heart,
  GkPlusIcon as Plus,
  GkTrashIcon as Trash2,
  GkChevronDownIcon as ChevronDown,
  GkStarRatingIcon as Star,
  GkShieldIcon as Database,
  GkGloveBallIcon,
  GkRefreshIcon as RefreshCw,
  GkCheckCircleIcon as CheckCircle2,
} from './icons';
import { ArenaField, Goalkeeper, ModalityType, WeeklyMatchTemplate } from '../types';
import { formatCurrency } from '../utils/validations';
import { ITAPEVA_PRICING_TIERS } from '../utils/cachePricingAI';

interface OrganizerRetentionPanelProps {
  templates: WeeklyMatchTemplate[];
  favoriteGoalkeeperIds: string[];
  allGoalkeepers: Goalkeeper[];
  approvedArenas?: ArenaField[];
  onSaveTemplate: (template: Omit<WeeklyMatchTemplate, 'id' | 'organizerId' | 'createdAt'>) => void;
  onDeleteTemplate: (templateId: string) => void;
  onUseTemplate: (template: WeeklyMatchTemplate) => void;
  onToggleFavoriteGoalkeeper: (goalkeeperId: string) => void;
  onCallFavoriteGoalkeeper: (gk: Goalkeeper) => void;
  isSupabaseSynced?: boolean;
}

export const OrganizerRetentionPanel: React.FC<OrganizerRetentionPanelProps> = ({
  templates,
  favoriteGoalkeeperIds,
  allGoalkeepers,
  approvedArenas = [],
  onSaveTemplate,
  onDeleteTemplate,
  onUseTemplate,
  onToggleFavoriteGoalkeeper,
  onCallFavoriteGoalkeeper,
  isSupabaseSynced = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'templates' | 'favorites'>('templates');
  const [isAddingForm, setIsAddingForm] = useState(false);

  // Form state for new weekly pelada template
  const [title, setTitle] = useState('');
  const [arenaName, setArenaName] = useState('');
  const [address, setAddress] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('Quarta-feira');
  const [time, setTime] = useState('20:30 - 21:30');
  const [modality, setModality] = useState<ModalityType>('Society');
  const [competitiveLevel, setCompetitiveLevel] = useState<
    'Resenha / Amigável' | 'Competitivo' | 'Varzea / Torneio'
  >('Competitivo');
  const [price, setPrice] = useState(25);
  const [favoriteGoalkeeperId, setFavoriteGoalkeeperId] = useState<string>(
    favoriteGoalkeeperIds[0] || allGoalkeepers[0]?.id || ''
  );
  const [notes, setNotes] = useState('');

  const favoriteGoalkeepers = allGoalkeepers.filter((gk) =>
    favoriteGoalkeeperIds.includes(gk.id)
  );

  const handleCreateTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!arenaName.trim() || !address.trim()) return;

    const assignedGk = allGoalkeepers.find((g) => g.id === favoriteGoalkeeperId);
    onSaveTemplate({
      title: title.trim() || `Pelada ${dayOfWeek} · ${arenaName.trim()}`,
      arenaName: arenaName.trim(),
      address: address.trim(),
      city: 'Itapeva - SP',
      dayOfWeek,
      time,
      modality,
      competitiveLevel,
      price,
      favoriteGoalkeeperId: assignedGk?.id,
      favoriteGoalkeeperName: assignedGk?.name,
      notes: notes.trim() || undefined,
    });

    setTitle('');
    setArenaName('');
    setAddress('');
    setNotes('');
    setIsAddingForm(false);
  };

  return (
    <div className="rounded-3xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-xl overflow-hidden transition-colors">
      {/* Header Bar */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left p-4 sm:p-5 flex items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-900/70 hover:bg-slate-100/80 dark:hover:bg-slate-900 transition-colors cursor-pointer touch-manipulation select-none"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-600 dark:text-[#22c55e] shrink-0">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                Pelada Recorrente & Elenco Fixo
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-[#22c55e] border border-emerald-500/30 font-mono text-[10px] font-bold">
                {templates.length} modelo{templates.length !== 1 ? 's' : ''}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-700 dark:text-[#38bdf8] border border-sky-500/30 font-mono text-[10px] font-bold">
                {favoriteGoalkeepers.length} favorito{favoriteGoalkeepers.length !== 1 ? 's' : ''}
              </span>
              {isSupabaseSynced && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/25 text-[10px] font-mono text-sky-700 dark:text-[#38bdf8]">
                  <Database className="w-3 h-3" />
                  Supabase Sync
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 truncate">
              Salve modelos semanais da sua pelada e convoque seu elenco fixo em 1 toque
            </p>
          </div>
        </div>

        <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="border-t border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4 bg-white dark:bg-[#020617]"
          >
            {/* Sub-navigation Tabs & Create Trigger */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('templates')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeSubTab === 'templates'
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Modelos Semanais ({templates.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('favorites')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeSubTab === 'favorites'
                      ? 'bg-sky-500 text-slate-950 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Heart className="w-3.5 h-3.5" />
                  <span>Elenco Fixo ({favoriteGoalkeepers.length})</span>
                </button>
              </div>

              {activeSubTab === 'templates' && (
                <button
                  type="button"
                  onClick={() => setIsAddingForm(!isAddingForm)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-700 dark:text-[#22c55e] text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAddingForm ? 'Cancelar' : 'Novo Modelo Semanal'}</span>
                </button>
              )}
            </div>

            {/* Inline Creation Form for Weekly Template */}
            <AnimatePresence>
              {isAddingForm && activeSubTab === 'templates' && (
                <motion.form
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  onSubmit={handleCreateTemplate}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-emerald-500/40 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      Cadastrar Modelo de Pelada Recorrente
                    </span>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-[#22c55e]">
                      Salvo no Perfil Supabase
                    </span>
                  </div>

                  {approvedArenas.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="block text-[10px] font-mono text-sky-700 dark:text-[#38bdf8] font-bold">
                        Preencher rápido com Arena Oficial de Itapeva:
                      </span>
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                        {approvedArenas.map((arena) => (
                          <button
                            key={arena.id}
                            type="button"
                            onClick={() => {
                              setArenaName(arena.name);
                              setAddress(arena.address);
                              setModality(arena.mainModality);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 hover:border-[#22c55e] text-[11px] font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap cursor-pointer shrink-0"
                          >
                            {arena.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Nome do Jogo (Opcional)
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Ex: Quinta dos Parças · Society"
                        className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Nome da Arena *
                      </label>
                      <input
                        type="text"
                        required
                        value={arenaName}
                        onChange={(e) => setArenaName(e.target.value)}
                        placeholder="Ex: Arena Belletti Itapeva"
                        className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Endereço da Arena *
                      </label>
                      <input
                        type="text"
                        required
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Ex: R. Benjamin Constant, 990 - Jardim Ferrari, Itapeva - SP"
                        className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Faixa de Cachê (Taxa R$ 5 inclusa)
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {ITAPEVA_PRICING_TIERS.map((tier) => (
                          <button
                            key={tier.tierCode}
                            type="button"
                            onClick={() => setPrice(tier.totalPrice)}
                            className={`h-10 rounded-xl border text-[11px] font-mono font-bold transition-colors cursor-pointer ${
                              price === tier.totalPrice
                                ? 'bg-[#22c55e] text-slate-950 border-[#22c55e]'
                                : 'bg-white dark:bg-[#020617] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            R$ {tier.totalPrice}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Dia Fixo
                      </label>
                      <select
                        value={dayOfWeek}
                        onChange={(e) => setDayOfWeek(e.target.value)}
                        className="w-full h-10 px-2.5 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                      >
                        <option value="Segunda-feira">Segunda-feira</option>
                        <option value="Terça-feira">Terça-feira</option>
                        <option value="Quarta-feira">Quarta-feira</option>
                        <option value="Quinta-feira">Quinta-feira</option>
                        <option value="Sexta-feira">Sexta-feira</option>
                        <option value="Sábado">Sábado</option>
                        <option value="Domingo">Domingo</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Horário
                      </label>
                      <input
                        type="text"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        placeholder="20:30 - 21:30"
                        className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Modalidade
                      </label>
                      <select
                        value={modality}
                        onChange={(e) => setModality(e.target.value as ModalityType)}
                        className="w-full h-10 px-2.5 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                      >
                        <option value="Society">Society</option>
                        <option value="Fut7">Fut7</option>
                        <option value="Futsal">Futsal</option>
                        <option value="Campo 11">Campo 11</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Goleiro Prioritário
                      </label>
                      <select
                        value={favoriteGoalkeeperId}
                        onChange={(e) => setFavoriteGoalkeeperId(e.target.value)}
                        className="w-full h-10 px-2.5 rounded-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                      >
                        <option value="">Qualquer favorito</option>
                        {allGoalkeepers.map((gk) => (
                          <option key={gk.id} value={gk.id}>
                            {gk.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="submit"
                      className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 cursor-pointer transition-all"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Salvar Modelo Semanal</span>
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Templates Grid */}
            {activeSubTab === 'templates' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {templates.length === 0 ? (
                  <div className="col-span-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Nenhum modelo de pelada recorrente salvo ainda.
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Cadastre sua arena e horário fixo para convocar goleiros em 1 clique toda semana.
                    </p>
                  </div>
                ) : (
                  templates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/40 transition-all flex flex-col justify-between space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-[#22c55e] border border-emerald-500/30">
                              {tpl.dayOfWeek}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-700 dark:text-[#38bdf8] border border-sky-500/30">
                              {tpl.modality}
                            </span>
                          </div>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white mt-1.5 truncate">
                            {tpl.title}
                          </h4>
                          <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                            <MapPin className="w-3.5 h-3.5 text-sky-600 dark:text-[#38bdf8] shrink-0" />
                            <span className="truncate">{tpl.arenaName} · {tpl.address}</span>
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => onDeleteTemplate(tpl.id)}
                          title="Excluir modelo semanal"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200 dark:border-slate-800/80 gap-2 flex-wrap">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                            <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-[#22c55e]" />
                            <span>{tpl.time}</span>
                            <span>·</span>
                            <span className="font-bold text-emerald-600 dark:text-[#22c55e]">
                              {formatCurrency(tpl.price)}
                            </span>
                          </div>
                          {tpl.favoriteGoalkeeperName && (
                            <div className="text-[11px] text-sky-700 dark:text-[#38bdf8] flex items-center gap-1">
                              <Heart className="w-3 h-3" />
                              <span>Prioridade: {tpl.favoriteGoalkeeperName}</span>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => onUseTemplate(tpl)}
                          className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/15 cursor-pointer transition-all active:scale-95"
                        >
                          <GkGloveBallIcon className="w-3.5 h-3.5 text-slate-950" />
                          <span>Convocar Modelo</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Elenco Fixo (Favorites) */}
            {activeSubTab === 'favorites' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {favoriteGoalkeepers.length === 0 ? (
                  <div className="col-span-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-1.5">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Seu Elenco Fixo está vazio.
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Toque no botão de favorito nos cards dos goleiros abaixo para montar sua lista prioritária.
                    </p>
                  </div>
                ) : (
                  favoriteGoalkeepers.map((gk) => (
                    <div
                      key={gk.id}
                      className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {gk.photo ? (
                          <img
                            src={gk.photo}
                            alt={gk.name}
                            referrerPolicy="no-referrer"
                            className="w-11 h-11 rounded-xl object-cover border border-sky-500/40 shrink-0"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-sky-500/15 border border-sky-500/40 flex items-center justify-center text-sky-600 dark:text-[#38bdf8] font-display font-bold text-xs shrink-0">
                            {gk.name
                              .split(' ')
                              .slice(0, 2)
                              .map((p) => p[0])
                              .join('')
                              .toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                            {gk.name}
                          </h4>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <span className="text-emerald-600 dark:text-[#22c55e] font-mono font-bold flex items-center gap-0.5">
                              <Star className="w-3 h-3 fill-emerald-500 dark:fill-[#22c55e]" />
                              {gk.rating}
                            </span>
                            <span>·</span>
                            <span className="truncate">{gk.neighborhood}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onToggleFavoriteGoalkeeper(gk.id)}
                          title="Remover do Elenco Fixo"
                          className="p-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-rose-500 hover:bg-rose-500/15 transition-colors cursor-pointer"
                        >
                          <Heart className="w-3.5 h-3.5 fill-rose-500" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onCallFavoriteGoalkeeper(gk)}
                          className="px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer transition-all active:scale-95"
                        >
                          Convocar
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
