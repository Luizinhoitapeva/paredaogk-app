import React, { useState } from 'react';
import {
  GkStadiumArenaIcon as StadiumArena,
  GkMapPinIcon as MapPin,
  GkInstagramIcon as Instagram,
  GkPlusIcon as Plus,
  GkShieldCheckAdminIcon as AdminShield,
  GkCheckCircleIcon as CheckCircle2,
  GkClockIcon as Clock,
  GkGloveBallIcon,
  GkWhatsAppIcon,
} from './icons';
import { ArenaField, ArenaSurfaceType } from '../types';

interface ArenasShowcaseSectionProps {
  arenas: ArenaField[];
  userEmail?: string;
  isAdminAuthorized: boolean;
  onConvokeAtArena: (arena: ArenaField) => void;
  onOpenSubmitArena: () => void;
  onOpenModeration: () => void;
}

const SURFACE_FILTERS: Array<'Todas' | ArenaSurfaceType> = [
  'Todas',
  'Grama Sintética',
  'Grama Natural',
  'Quadra de Areia',
  'Futsal Indoor',
];

export const ArenasShowcaseSection: React.FC<ArenasShowcaseSectionProps> = ({
  arenas,
  userEmail,
  isAdminAuthorized,
  onConvokeAtArena,
  onOpenSubmitArena,
  onOpenModeration,
}) => {
  const [surfaceFilter, setSurfaceFilter] = useState<'Todas' | ArenaSurfaceType>('Todas');

  const approvedArenas = arenas.filter((a) => a.status === 'approved');
  const pendingCount = arenas.filter((a) => a.status === 'pending').length;
  const userPendingArenas = arenas.filter(
    (a) =>
      a.status === 'pending' &&
      userEmail &&
      a.submittedByEmail?.toLowerCase() === userEmail.toLowerCase()
  );

  const visibleArenas = approvedArenas.filter((arena) =>
    surfaceFilter === 'Todas' ? true : arena.surfaceType === surfaceFilter
  );

  const formatPhoneHref = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10 ? `https://wa.me/55${digits}` : `tel:${digits}`;
  };

  const formatInstagramUrl = (handle?: string) => {
    if (!handle) return '';
    const clean = handle.replace(/^@/, '').trim();
    return `https://instagram.com/${clean}`;
  };

  return (
    <section className="space-y-4">
      {/* Header Bar */}
      <div className="rounded-3xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm dark:shadow-xl transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#22c55e]/15 border border-[#22c55e]/40 flex items-center justify-center text-emerald-600 dark:text-[#22c55e] shrink-0">
              <StadiumArena className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display font-extrabold text-base sm:text-lg text-slate-900 dark:text-white">
                  Arenas Oficiais de Itapeva (SP)
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-[#22c55e]/15 text-emerald-700 dark:text-[#22c55e] border border-[#22c55e]/35 font-mono text-[10px] font-bold">
                  {approvedArenas.length} ativas no radar
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Quadras verificadas para convocação instantânea em Itapeva — cadastre novos campos ou gerencie a moderação
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenSubmitArena}
              className="px-3.5 py-2.5 rounded-xl bg-[#22c55e] hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-[#22c55e]/20 transition-all cursor-pointer touch-manipulation"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Nova Arena / Campo</span>
            </button>

            <button
              type="button"
              onClick={onOpenModeration}
              className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 touch-manipulation ${
                pendingCount > 0 && isAdminAuthorized
                  ? 'bg-[#38bdf8]/15 hover:bg-[#38bdf8]/25 border-[#38bdf8]/50 text-sky-700 dark:text-[#38bdf8]'
                  : 'bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
              }`}
              title="Painel de Moderação do Administrador"
            >
              <AdminShield className="w-4 h-4 text-sky-600 dark:text-[#38bdf8]" />
              <span>Moderação Admin</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-mono text-[10px] font-extrabold leading-none">
                  {pendingCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* User Pending Submission Notice */}
        {userPendingArenas.length > 0 && (
          <div className="mt-3 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/35 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                Você possui <strong>{userPendingArenas.length}</strong>{' '}
                {userPendingArenas.length === 1 ? 'arena enviada aguardando' : 'arenas enviadas aguardando'} aprovação do administrador ({userPendingArenas[0].name}).
              </span>
            </div>
            <span className="font-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40">
              Status: pending
            </span>
          </div>
        )}

        {/* Surface Filter Pills */}
        <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
          {SURFACE_FILTERS.map((surface) => {
            const active = surfaceFilter === surface;
            return (
              <button
                key={surface}
                type="button"
                onClick={() => setSurfaceFilter(surface)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold whitespace-nowrap border transition-all cursor-pointer touch-manipulation ${
                  active
                    ? 'bg-[#38bdf8] text-slate-950 font-bold border-[#38bdf8] shadow-sm shadow-[#38bdf8]/25'
                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {surface}
              </button>
            );
          })}
        </div>

        {/* Arenas Grid */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleArenas.length === 0 ? (
            <div className="col-span-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nenhuma arena aprovada encontrada para o piso "{surfaceFilter}".
              </p>
              <button
                type="button"
                onClick={() => setSurfaceFilter('Todas')}
                className="px-3.5 py-1.5 rounded-lg bg-[#22c55e] text-slate-950 font-bold text-xs cursor-pointer"
              >
                Ver Todas as Arenas
              </button>
            </div>
          ) : (
            visibleArenas.map((arena) => (
              <article
                key={arena.id}
                className="rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 hover:border-[#22c55e]/50 transition-all overflow-hidden flex flex-col justify-between group"
              >
                <div>
                  {/* Image / Crest Container */}
                  <div
                    className={`relative h-44 w-full overflow-hidden border-b border-slate-200 dark:border-slate-800 ${
                      arena.isLogoPhoto ? 'bg-white' : 'bg-slate-950'
                    }`}
                  >
                    <img
                      src={arena.photoUrl}
                      alt={arena.name}
                      className={`w-full h-full transition-transform duration-500 group-hover:scale-105 ${
                        arena.isLogoPhoto ? 'object-contain p-4' : 'object-cover object-center'
                      }`}
                    />
                    {!arena.isLogoPhoto && (
                      <div className="absolute inset-0 bg-gradient-to-t from-[#020617]/80 via-transparent to-[#020617]/30 pointer-events-none" />
                    )}

                    {/* Top Status & Surface Badges */}
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#020617]/85 backdrop-blur-md border border-[#22c55e]/50 text-[#22c55e] text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        Oficial Itapeva
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-[#020617]/85 backdrop-blur-md border border-[#38bdf8]/50 text-[#38bdf8] text-[10px] font-mono font-bold">
                        {arena.surfaceType}
                      </span>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-snug">
                        {arena.name}
                      </h3>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-[#22c55e] border border-emerald-500/30 text-[10px] font-mono font-bold shrink-0">
                        {arena.mainModality}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5 leading-relaxed">
                      <MapPin className="w-3.5 h-3.5 text-sky-600 dark:text-[#38bdf8] shrink-0 mt-0.5" />
                      <span>{arena.address}</span>
                    </p>

                    {arena.description && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        {arena.description}
                      </p>
                    )}

                    {/* Contact Chips */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {arena.phone && (
                        <a
                          href={formatPhoneHref(arena.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 hover:border-[#22c55e]/50 text-[11px] font-mono text-slate-700 dark:text-slate-300 transition-colors"
                        >
                          <GkWhatsAppIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-[#22c55e]" />
                          <span>{arena.phone}</span>
                        </a>
                      )}

                      {arena.instagram && (
                        <a
                          href={formatInstagramUrl(arena.instagram)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 hover:border-[#38bdf8]/50 text-[11px] font-mono text-sky-700 dark:text-[#38bdf8] transition-colors"
                        >
                          <Instagram className="w-3.5 h-3.5" />
                          <span>{arena.instagram.startsWith('@') ? arena.instagram : `@${arena.instagram}`}</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Footer CTA */}
                <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800/80 bg-white/70 dark:bg-[#020617]/70 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    Radar Inteligente Ativo
                  </span>
                  <button
                    type="button"
                    onClick={() => onConvokeAtArena(arena)}
                    className="px-3.5 py-2 rounded-xl bg-[#22c55e] hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-[#22c55e]/20 transition-all cursor-pointer touch-manipulation"
                  >
                    <GkGloveBallIcon className="w-3.5 h-3.5 text-slate-950" />
                    <span>Convocar GK nesta Arena</span>
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
};
