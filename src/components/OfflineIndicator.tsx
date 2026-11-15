import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GkWifiOffIcon as WifiOff, GkRefreshIcon as RefreshCw, GkCheckCircleIcon as CheckCircle2 } from './icons';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface OfflineIndicatorProps {
  onManualSync?: () => void;
  isSyncing?: boolean;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  onManualSync,
  isSyncing = false,
}) => {
  const { isOnline, wasOffline } = useOnlineStatus();

  return (
    <div className="fixed top-20 right-4 z-50 pointer-events-none">
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="pointer-events-auto p-2.5 px-3.5 rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-amber-400/70 dark:border-amber-500/50 shadow-2xl shadow-slate-900/15 dark:shadow-black/80 backdrop-blur-md flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300"
          >
            <div className="relative flex items-center justify-center">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping absolute" />
              <span className="w-2 h-2 rounded-full bg-amber-500 relative" />
            </div>

            <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />

            <div>
              <span className="font-bold text-slate-900 dark:text-white block">Modo Offline PWA</span>
              <span className="text-[10px] text-slate-600 dark:text-slate-300">Acessando dados salvos localmente</span>
            </div>

            {onManualSync && (
              <button
                type="button"
                onClick={onManualSync}
                className="ml-1 p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                title="Tentar reconectar"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-emerald-500 dark:text-emerald-400' : ''}`} />
              </button>
            )}
          </motion.div>
        )}

        {isOnline && wasOffline && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="pointer-events-auto p-2.5 px-3.5 rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-emerald-400/70 dark:border-emerald-500/50 shadow-2xl shadow-emerald-500/10 backdrop-blur-md flex items-center gap-2.5 text-xs text-emerald-800 dark:text-emerald-300"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <span className="font-bold text-slate-900 dark:text-white block">Conexão Restabelecida!</span>
              <span className="text-[10px] text-slate-600 dark:text-slate-300">Sincronizando dados com o Supabase...</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse ml-1" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
