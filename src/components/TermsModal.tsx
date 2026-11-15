import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GkCloseIcon as X,
  GkShieldIcon as ShieldAlert,
  GkCheckIcon as Check,
  GkTermsDocIcon as FileText,
  GkShieldIcon as Scale
} from './icons';
import { TERMS_OF_USE_TEXT } from '../data/mockData';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept?: () => void;
  hasAccepted?: boolean;
}

export const TermsModal: React.FC<TermsModalProps> = ({
  isOpen,
  onClose,
  onAccept,
  hasAccepted = false,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-2xl max-h-[85vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden transition-colors"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Termos de Uso e Regras da Plataforma
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Atualizado em {TERMS_OF_USE_TEXT.lastUpdated} · Integrado ao ArenaDraft
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800/80 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-700 dark:text-slate-300">
            {/* Warning callout */}
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed text-amber-900 dark:text-amber-200/90">
                <strong>Atenção às regras de pontualidade:</strong> O ParedãoGK possui tolerância zero para W.O. não comunicado previamente. A presença pontual dos goleiros e o pagamento garantido dos organizadores são auditados por geolocalização e confirmação bilateral via Pix.
              </div>
            </div>

            {TERMS_OF_USE_TEXT.sections.map((section, idx) => (
              <div key={idx} className="space-y-2 border-b border-slate-200 dark:border-slate-800/60 pb-5 last:border-0 last:pb-0">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  {section.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-line leading-relaxed">
                  {section.content}
                </p>
              </div>
            ))}
          </div>

          {/* Footer Action with Official Contact */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 text-center sm:text-left">
              Suporte Oficial: <span className="text-emerald-600 dark:text-emerald-400 font-mono">paredaogkbr@gmail.com</span> · <span className="text-sky-600 dark:text-sky-400 font-mono">(15) 98159-6443</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Fechar
              </button>
              {onAccept && !hasAccepted && (
                <button
                  onClick={() => {
                    onAccept();
                    onClose();
                  }}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  Li e Aceito os Termos
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
