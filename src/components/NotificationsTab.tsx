import React, { useState, useEffect } from 'react';
import {
  GkBellIcon as Bell,
  GkShieldIcon as Shield,
  GkWalletPixIcon as Wallet,
  GkRadarIcon as Radar,
  GkFlameIcon as Sparkles,
  GkCheckIcon as Check,
  GkCheckIcon as CheckCheck,
  GkWhistleIcon
} from './icons';
import { NotificationItem, TabType } from '../types';
import { fetchNotificationsFromSupabase, isSupabaseConfigured, supabase } from '../lib/supabaseClient';

interface NotificationsTabProps {
  userId?: string;
  onNavigateTab: (tab: TabType) => void;
}

export const NotificationsTab: React.FC<NotificationsTabProps> = ({ userId, onNavigateTab }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>('todas');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    fetchNotificationsFromSupabase(userId)
      .then((rows) => {
        if (active) setNotifications(rows);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    if (isSupabaseConfigured && userId && userId !== 'usr-guest') {
      supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .then(({ error }) => {
          if (error) console.warn('[Notifications mark read]', error.message);
        });
    }
  };

  const handleToggleRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: !n.read } : n))
    );
  };

  const filtered = notifications.filter((n) => {
    if (filterCategory === 'todas') return true;
    return n.category === filterCategory;
  });

  const getIcon = (category: string) => {
    switch (category) {
      case 'match':
        return <GkWhistleIcon className="w-4 h-4 text-emerald-400" />;
      case 'wallet':
        return <Wallet className="w-4 h-4 text-sky-400" />;
      case 'radar':
        return <Radar className="w-4 h-4 text-emerald-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div className="space-y-4 pb-24 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Central de Notificações
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Alertas de convocações, depósitos Pix e novidades de Itapeva
          </p>
        </div>

        <button
          onClick={handleMarkAllRead}
          disabled={notifications.length === 0}
          className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm dark:shadow-none transition-colors cursor-pointer disabled:opacity-40"
        >
          <CheckCheck className="w-3.5 h-3.5" />
          <span>Marcar lidas</span>
        </button>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { id: 'todas', label: 'Todas' },
          { id: 'match', label: 'Jogos' },
          { id: 'wallet', label: 'Carteira & Pix' },
          { id: 'radar', label: 'Radar GK' },
          { id: 'system', label: 'Sistema' },
        ].map((cat) => (
          <button
            key={cat.id}
            onClick={() => setFilterCategory(cat.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              filterCategory === cat.id
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/10'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      <div className="space-y-2.5">
        {isLoading ? (
          <div className="p-10 text-center rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-slate-500 text-xs">
            Sincronizando notificações do Supabase...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center rounded-2xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 space-y-2 shadow-sm dark:shadow-none">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-[#22c55e]">
              <Bell className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              {notifications.length === 0
                ? 'Nenhuma notificação real registrada ainda'
                : 'Nenhuma notificação nesta categoria'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Convocações confirmadas via CajuPay Pix, alertas SOS de substituição relâmpago e atualizações das arenas de Itapeva aparecerão aqui em tempo real.
            </p>
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => {
                handleToggleRead(item.id);
                if (item.actionTab) {
                  onNavigateTab(item.actionTab);
                }
              }}
              className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                item.read
                  ? 'bg-white/80 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800/80 hover:bg-white dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400'
                  : 'bg-white dark:bg-slate-900 border-emerald-400/70 dark:border-emerald-500/40 shadow-sm text-slate-800 dark:text-slate-200'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                  item.read
                    ? 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                    : 'bg-emerald-500/10 border-emerald-500/30'
                }`}
              >
                {getIcon(item.category)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h4
                    className={`font-bold text-xs truncate ${
                      item.read ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {item.title}
                  </h4>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {item.timestamp}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {item.description}
                </p>
              </div>

              {!item.read && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 shrink-0 mt-1" />
              )}
            </div>
          ))
        )}
      </div>

      {/* Official Help & Contacts Footer */}
      <div className="mt-8 p-4 rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-center shadow-sm dark:shadow-none">
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Precisa de suporte com um chamado ou notificação?
        </p>
        <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 font-mono">
          Suporte: <span className="text-emerald-600 dark:text-emerald-400">paredaogkbr@gmail.com</span> · WhatsApp: <span className="text-sky-600 dark:text-sky-400">(15) 98159-6443</span>
        </p>
      </div>
    </div>
  );
};
