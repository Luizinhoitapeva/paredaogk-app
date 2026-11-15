import React from 'react';
import {
  GkRadarIcon,
  GkMetricsIcon,
  GkChatIcon,
  GkBellIcon,
  GkWalletPixIcon
} from './icons';
import { TabType } from '../types';

interface BottomNavigationProps {
  currentTab: TabType;
  onChangeTab: (tab: TabType) => void;
  unreadMessagesCount: number;
  unreadNotificationsCount: number;
  userRole?: 'contratante' | 'goleiro';
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  currentTab,
  onChangeTab,
  unreadMessagesCount,
  unreadNotificationsCount,
  userRole = 'goleiro',
}) => {
  const tabs = [
    {
      id: 'home' as TabType,
      label: 'Início',
      icon: GkRadarIcon,
    },
    {
      id: 'performance' as TabType,
      label: 'Métricas GK',
      icon: GkMetricsIcon,
    },
    {
      id: 'chat' as TabType,
      label: 'Conversas',
      icon: GkChatIcon,
      badge: unreadMessagesCount,
    },
    {
      id: 'notifications' as TabType,
      label: 'Alertas',
      icon: GkBellIcon,
      badge: unreadNotificationsCount,
    },
    {
      id: 'wallet' as TabType,
      label: 'Carteira & Pix',
      icon: GkWalletPixIcon,
      isFinance: true,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/92 dark:bg-slate-950/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-800/80 pb-safe transition-colors duration-200">
      <div className="max-w-lg mx-auto grid grid-cols-5 h-16 items-center px-1 sm:px-2">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const Icon = tab.icon;
          const isFinance = (tab as any).isFinance;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeTab(tab.id)}
              className={`relative flex flex-col items-center justify-center h-full min-h-[44px] transition-all cursor-pointer touch-manipulation ${
                isActive
                  ? isFinance
                    ? 'text-sky-600 dark:text-sky-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon
                  size={20}
                  className={`transition-all duration-200 ${
                    isActive
                      ? isFinance
                        ? 'scale-110 dark:drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]'
                        : 'scale-110 dark:drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]'
                      : 'hover:scale-105'
                  }`}
                />

                {/* Notification / Unread Badge */}
                {tab.badge && tab.badge > 0 ? (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-emerald-500 text-slate-950 font-bold text-[10px] flex items-center justify-center shadow-sm">
                    {tab.badge}
                  </span>
                ) : null}
              </div>

              <span
                className={`text-[10px] mt-1 font-medium tracking-tight ${
                  isActive
                    ? isFinance
                      ? 'text-sky-600 dark:text-sky-400 font-bold'
                      : 'text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {tab.label}
              </span>

              {/* Active indicator dot with glow */}
              {isActive && (
                <span
                  className={`absolute bottom-1 w-1 h-1 rounded-full ${
                    isFinance
                      ? 'bg-sky-500 dark:bg-sky-400 shadow-[0_0_6px_#38bdf8]'
                      : 'bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_6px_#22c55e]'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
