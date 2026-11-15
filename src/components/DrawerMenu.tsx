import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GkCloseIcon as X,
  GkProfileIcon as User,
  GkShieldIcon as Shield,
  GkHistoryIcon as History,
  GkFutshopIcon as ShoppingBag,
  GkHelpFaqIcon as HelpCircle,
  GkTermsDocIcon as FileText,
  GkLogoutIcon as LogOut,
  GkChevronRightIcon as ChevronRight,
  GkWhatsAppIcon as MessageCircle,
  GkRefreshIcon as RefreshCw,
  GkDownloadIcon as Download,
  GkWalletPixIcon as Wallet,
  GkCheckCircleIcon as CheckCircle2,
  GkFlameIcon as Sparkles,
  GkMetricsIcon as Award,
  GkCameraIcon as Camera,
  GkSettingsIcon,
  GkStadiumArenaIcon as StadiumArena,
  GkShieldCheckAdminIcon as AdminShield,
  GkBankTransferIcon as BankTransfer,
} from './icons';
import { UserProfile } from '../types';
import { maskCPF, formatCurrency } from '../utils/validations';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { isAuthorizedAdmin } from '../lib/supabaseClient';

interface DrawerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onToggleRole: () => void;
  onOpenAvatarModal?: () => void;
  onOpenProfilePricing?: () => void;
  onOpenWallet?: () => void;
  onOpenPerformance?: () => void;
  onOpenPdfReport?: () => void;
  onOpenSubmitArena?: () => void;
  onOpenArenaModeration?: () => void;
  pendingArenasCount?: number;
  onOpenAdminFinancial?: () => void;
  pendingWithdrawalsCount?: number;
  onOpenHistory: () => void;
  onOpenFutshop: () => void;
  onOpenHelp: () => void;
  onOpenTerms: () => void;
  onOpenWhatsApp: () => void;
  onLogout: () => void;
}

export const DrawerMenu: React.FC<DrawerMenuProps> = ({
  isOpen,
  onClose,
  user,
  onToggleRole,
  onOpenAvatarModal,
  onOpenProfilePricing,
  onOpenWallet,
  onOpenPerformance,
  onOpenPdfReport,
  onOpenSubmitArena,
  onOpenArenaModeration,
  pendingArenasCount = 0,
  onOpenAdminFinancial,
  pendingWithdrawalsCount = 0,
  onOpenHistory,
  onOpenFutshop,
  onOpenHelp,
  onOpenTerms,
  onOpenWhatsApp,
  onLogout,
}) => {
  const { isInstallable, install } = usePWAInstall();
  const isAdminUser = isAuthorizedAdmin(user);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm"
        />

        {/* Drawer Content */}
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="relative w-full max-w-xs sm:max-w-sm bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 h-full flex flex-col z-10 shadow-2xl overflow-y-auto"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 dark:bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="font-display font-extrabold text-slate-900 dark:text-white text-base tracking-wide">
                PAREDÃO<span className="text-emerald-600 dark:text-emerald-400">GK</span>
              </span>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* User Profile Card */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-b from-slate-50 to-white dark:from-slate-950/80 dark:to-slate-900">
            <div className="flex items-center gap-3.5 mb-3">
              <div className="relative shrink-0">
                <div className="w-14 h-14 aspect-square rounded-2xl overflow-hidden border-2 border-emerald-500/50 shadow-md bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover object-center block"
                    />
                  ) : (
                    <span className="font-display font-black text-base text-emerald-600 dark:text-[#22c55e]">
                      {(user.name || 'GK')
                        .split(' ')
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((n) => n[0]?.toUpperCase() || '')
                        .join('')}
                    </span>
                  )}
                </div>
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 flex items-center justify-center text-[9px] text-slate-950 font-bold pointer-events-none">
                  ✓
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                  {user.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  "{user.nickname || 'Goleiro de Elite'}"
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    user.role === 'contratante'
                      ? 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                      : 'bg-sky-500/15 dark:bg-sky-500/20 text-sky-700 dark:text-sky-400 border border-sky-500/30'
                  }`}>
                    {user.role === 'contratante' ? 'Contratante / Capitão' : 'Goleiro Profissional'}
                  </span>
                </div>
              </div>
            </div>

            {/* Validated CPF & Details */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                <span>CPF Validado:</span>
                <span className="font-mono font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  {maskCPF(user.cpf)}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                <span>Idade / Nascimento:</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">{user.age} anos</span>
              </div>
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                <span>Reputação Geral:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">★ {user.rating.toFixed(2)}</span>
              </div>
            </div>

            {/* Avatar customization button */}
            <button
              onClick={() => {
                onOpenAvatarModal?.();
                onClose();
              }}
              className="mt-2.5 w-full py-2 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              Personalizar Foto de Perfil
            </button>

            {/* Role switch button */}
            <button
              onClick={() => {
                onToggleRole();
                onClose();
              }}
              className="mt-3 w-full py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Alternar para {user.role === 'contratante' ? 'Modo Goleiro GK' : 'Modo Contratante'}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* Quick Balance Preview */}
          <div className="p-4 mx-4 my-3 rounded-2xl bg-gradient-to-r from-emerald-50 to-slate-50 dark:from-emerald-950/30 dark:to-slate-950 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1">
                <Wallet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Saldo Disponível
              </div>
              <div className="font-mono font-bold text-base text-emerald-600 dark:text-emerald-400">
                {formatCurrency(user.walletBalance)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-500">Cashback ArenaDraft</div>
              <div className="font-mono font-bold text-xs text-sky-600 dark:text-sky-400">
                +{formatCurrency(user.cashbackBalance)}
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="p-4 space-y-1 flex-1">
            {onOpenPerformance && (
              <button
                onClick={() => { onOpenPerformance(); onClose(); }}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-200 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <Award className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Métricas & Desempenho GK</span>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                  Recharts
                </span>
              </button>
            )}

            {onOpenWallet && (
              <button
                onClick={() => { onOpenWallet(); onClose(); }}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-700 dark:text-[#38bdf8] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <Wallet className="w-4 h-4 text-sky-600 dark:text-[#38bdf8]" />
                  <span>Dashboard de Ganhos & Pix</span>
                </div>
                <ChevronRight className="w-4 h-4 text-sky-600 dark:text-[#38bdf8]" />
              </button>
            )}

            <button
              onClick={() => { onOpenHistory(); onClose(); }}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 text-xs font-semibold">
                <History className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Histórico de Partidas</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            </button>

            {onOpenPdfReport && (
              <button
                onClick={() => { onOpenPdfReport(); onClose(); }}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <FileText className="w-4 h-4 text-sky-600 dark:text-[#38bdf8]" />
                  <span>Exportar Relatório PDF</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-[#22c55e] border border-emerald-500/30">
                  A4 / Print
                </span>
              </button>
            )}

            {onOpenSubmitArena && (
              <button
                onClick={() => { onOpenSubmitArena(); onClose(); }}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <StadiumArena className="w-4 h-4 text-emerald-600 dark:text-[#22c55e]" />
                  <span>Cadastrar Nova Arena / Campo</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-[#22c55e] border border-emerald-500/30">
                  Itapeva
                </span>
              </button>
            )}

            {isAdminUser && onOpenArenaModeration && (
              <button
                onClick={() => { onOpenArenaModeration(); onClose(); }}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <AdminShield className="w-4 h-4 text-sky-600 dark:text-[#38bdf8]" />
                  <span>Moderação de Arenas (Admin)</span>
                </div>
                {pendingArenasCount > 0 ? (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500 text-slate-950">
                    {pendingArenasCount}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-700 dark:text-[#38bdf8] border border-sky-500/30">
                    Restrito
                  </span>
                )}
              </button>
            )}

            {isAdminUser && onOpenAdminFinancial && (
              <button
                onClick={() => { onOpenAdminFinancial(); onClose(); }}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <BankTransfer className="w-4 h-4 text-emerald-600 dark:text-[#22c55e]" />
                  <span>Financeiro Pix & Webhooks (Admin)</span>
                </div>
                {pendingWithdrawalsCount > 0 ? (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500 text-slate-950">
                    {pendingWithdrawalsCount}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-[#22c55e] border border-emerald-500/30">
                    Mercado Pago
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => { onOpenFutshop(); onClose(); }}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 text-xs font-semibold">
                <ShoppingBag className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span>Loja Futshop ArenaDraft</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/15 dark:bg-sky-500/20 text-sky-700 dark:text-sky-400 border border-sky-500/30">
                Desconto GK
              </span>
            </button>

            <button
              onClick={() => { onOpenHelp(); onClose(); }}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 text-xs font-semibold">
                <HelpCircle className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Central de Ajuda & FAQ</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            </button>

            <button
              onClick={() => {
                if (onOpenProfilePricing) onOpenProfilePricing();
                else onOpenAvatarModal?.();
                onClose();
              }}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 text-xs font-semibold">
                <GkSettingsIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Configurações, Perfil & Cachê IA</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            </button>

            <button
              onClick={() => { onOpenWhatsApp(); onClose(); }}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 text-xs font-semibold">
                <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Plantão WhatsApp (15) 98159-6443</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
            </button>

            <button
              onClick={() => { onOpenTerms(); onClose(); }}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 text-xs font-semibold">
                <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Termos de Uso & W.O.</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            </button>

            {isInstallable && (
              <button
                onClick={() => { install(); onClose(); }}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Instalar PWA na Tela Inicial</span>
                </div>
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              </button>
            )}
          </div>

          {/* Footer with Logout */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80">
            <button
              onClick={() => { onLogout(); onClose(); }}
              className="w-full py-2.5 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair da Conta (Logout)</span>
            </button>
            <div className="text-center mt-3 text-[10px] text-slate-500 space-y-0.5">
              <div>ParedãoGK v2.5 · paredaogkbr@gmail.com</div>
              <div>Suporte Oficial: (15) 98159-6443</div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
