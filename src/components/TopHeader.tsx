import React, { useState, useEffect } from 'react';
import {
  GkShieldIcon as Shield,
  GkDownloadIcon as Download,
  GkWhatsAppIcon as MessageCircle,
  GkMenuIcon as Menu,
  GkRefreshIcon as RefreshCw,
  GkCameraIcon as Camera,
  GkSunIcon,
  GkMoonIcon
} from './icons';
import { UserProfile } from '../types';
import { usePWAInstall } from '../hooks/usePWAInstall';

const getInitials = (name: string) =>
  (name || 'GK')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() || '')
    .join('') || 'GK';

interface TopHeaderProps {
  user: UserProfile;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  onOpenDrawer: () => void;
  onToggleRole: () => void;
  onOpenWhatsApp: () => void;
  onOpenAvatarModal?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  user,
  theme = 'dark',
  onToggleTheme,
  onOpenDrawer,
  onToggleRole,
  onOpenWhatsApp,
  onOpenAvatarModal,
}) => {
  const { isInstallable, install } = usePWAInstall();
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    setAvatarFailed(false);
  }, [user.avatarUrl]);

  const avatarSrc = !avatarFailed && user.avatarUrl ? user.avatarUrl : '';
  const isDark = theme === 'dark';

  return (
    <header className="sticky top-0 z-30 w-full bg-white/90 dark:bg-slate-950/85 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/80 pt-safe transition-colors duration-200">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 h-16 flex items-center justify-between gap-2 sm:gap-3">
        {/* Brand Zone */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onOpenDrawer}
            className="w-10 h-10 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 active:scale-95 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer touch-manipulation select-none"
            aria-label="Abrir Menu Lateral"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-lg bg-emerald-500/15 dark:bg-emerald-500/10 border border-emerald-500/35 dark:border-emerald-500/30 flex items-center justify-center">
              <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-display font-extrabold tracking-wider text-xs sm:text-base text-slate-900 dark:text-white truncate">
                PAREDÃO<span className="text-emerald-600 dark:text-emerald-400">GK</span>
              </span>
              <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400 tracking-wider hidden md:inline">
                ARENADRAFT ECOSYSTEM
              </span>
            </div>
          </div>
        </div>

        {/* Center / Action: Quick Profile Role Switcher */}
        <button
          type="button"
          onClick={onToggleRole}
          className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 active:scale-95 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer touch-manipulation select-none"
          title="Alternar entre modo Contratante e modo Goleiro"
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${user.role === 'contratante' ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-sky-500 dark:bg-sky-400'}`} />
          <span className="text-[11px] whitespace-nowrap">
            {user.role === 'contratante' ? 'Contratante' : 'Goleiro GK'}
          </span>
          <RefreshCw className="w-3 h-3 text-slate-500 shrink-0" />
        </button>

        {/* Right Zone: Theme Toggle, Support WhatsApp, PWA Install & Avatar */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Theme Switcher (Dark <-> Light) */}
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'Ativar Modo Claro' : 'Ativar Modo Escuro'}
              title={isDark ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
              className="h-9 min-w-[36px] px-2 sm:px-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/40 dark:hover:border-emerald-500/40 active:scale-95 flex items-center justify-center gap-1.5 text-slate-700 dark:text-slate-200 transition-all cursor-pointer touch-manipulation select-none shrink-0"
            >
              {isDark ? (
                <GkSunIcon className="w-4 h-4 text-amber-400" />
              ) : (
                <GkMoonIcon className="w-4 h-4 text-sky-600" />
              )}
              <span className="hidden lg:inline text-[11px] font-semibold whitespace-nowrap">
                {isDark ? 'Claro' : 'Escuro'}
              </span>
            </button>
          )}

          {/* PWA Install Button (if browser supports install prompt) */}
          {isInstallable && (
            <button
              type="button"
              onClick={install}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 active:scale-95 text-xs font-semibold transition-all cursor-pointer touch-manipulation select-none shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Instalar App</span>
            </button>
          )}

          {/* WhatsApp Support button */}
          <button
            type="button"
            onClick={onOpenWhatsApp}
            className="h-9 sm:h-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 dark:bg-emerald-600/15 border border-emerald-500/35 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 dark:hover:bg-emerald-600/25 active:scale-95 text-xs font-semibold transition-all cursor-pointer touch-manipulation select-none shrink-0"
            title="Suporte Humanizado via WhatsApp"
            aria-label="Suporte 24h via WhatsApp"
          >
            <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden md:inline text-xs">Suporte 24h</span>
          </button>

          {/* Profile & Avatar Trigger */}
          <div className="relative flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onOpenAvatarModal || onOpenDrawer}
              className="relative group p-0.5 rounded-xl active:scale-95 transition-all cursor-pointer touch-manipulation select-none shrink-0"
              title="Personalizar Foto de Perfil"
              aria-label="Personalizar Foto de Perfil"
            >
              <div className="w-9 h-9 aspect-square shrink-0 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 group-hover:border-emerald-500 bg-slate-200 dark:bg-slate-800 transition-colors flex items-center justify-center">
                {avatarSrc ? (
                  <img
                    key={avatarSrc}
                    src={avatarSrc}
                    alt={user.name}
                    onError={() => setAvatarFailed(true)}
                    referrerPolicy="no-referrer"
                    draggable={false}
                    className="w-full h-full object-cover object-center block pointer-events-none"
                  />
                ) : (
                  <span className="font-display font-black text-xs text-emerald-600 dark:text-[#22c55e]">
                    {getInitials(user.name)}
                  </span>
                )}
              </div>
              <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-md border border-white dark:border-slate-950 group-hover:scale-110 transition-transform">
                <Camera className="w-2.5 h-2.5" />
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenDrawer}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 active:scale-95 transition-all cursor-pointer touch-manipulation select-none shrink-0"
              title="Menu do Perfil"
            >
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[100px] truncate">
                {user.nickname || user.name.split(' ')[0]}
              </span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
