import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  GkCloseIcon as X,
  GkHelpFaqIcon as HelpCircle,
  GkChevronDownIcon as ChevronDown,
  GkWhatsAppIcon as MessageCircle,
  GkWhatsAppIcon as Phone,
  GkShieldIcon as Shield,
  GkClockIcon as Clock,
  GkWalletPixIcon as Wallet,
  GkShieldIcon as AlertTriangle
} from './icons';

interface HelpFaqModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenWhatsApp: () => void;
}

export const HelpFaqModal: React.FC<HelpFaqModalProps> = ({
  isOpen,
  onClose,
  onOpenWhatsApp,
}) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  if (!isOpen) return null;

  const faqs = [
    {
      q: 'Como funciona a garantia de pagamento do cachê?',
      a: 'O contratante realiza o pagamento antecipado via Pix para a custódia segura da plataforma. O valor fica protegido e só é liberado para a carteira do goleiro após o término da partida e confirmação mútua no aplicativo. Isso impede calotes para os dois lados.',
    },
    {
      q: 'O que acontece em caso de atraso ou ausência do goleiro (W.O.)?',
      a: 'O goleiro deve se apresentar no local 15 minutos antes. Em caso de não comparecimento injustificado (W.O.), o valor pago pelo contratante é 100% reembolsado de imediato, o goleiro sofre suspensão automática de 7 dias e multa contratual conforme os Termos de Uso.',
    },
    {
      q: 'E se chover forte ou a quadra estiver interditada?',
      a: 'Se a partida for cancelada com até 2 horas de antecedência ou por forças maiores meteorológicas atestadas pela administração da quadra, o valor é estornado integralmente em créditos ou Pix para a carteira do organizador.',
    },
    {
      q: 'Como funciona o Seguro Atleta Parceria ArenaDraft?',
      a: 'Todas as partidas oficiais intermediadas pelo ParedãoGK contam com cobertura de seguro de acidentes pessoais durante o horário do jogo, com suporte a despesas médicas emergenciais em hospitais credenciados.',
    },
    {
      q: 'Qual o valor mínimo para sacar via Pix e qual a taxa?',
      a: 'O valor mínimo de saque é de apenas R$ 10,00. O ParedãoGK NÃO cobra nenhuma taxa sobre o saque Pix. O dinheiro entra na sua conta bancária em até 5 segundos.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden transition-colors"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                Central de Ajuda & FAQ
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Dúvidas frequentes sobre regras, Pix, pontualidade e suporte
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* WhatsApp Callout */}
        <div className="p-4 mx-6 mt-5 rounded-2xl bg-gradient-to-r from-emerald-50 to-slate-50 dark:from-emerald-950/50 dark:to-slate-950 border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-xs text-slate-900 dark:text-white">
                Precisa de ajuda imediata para o seu jogo?
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Plantão de atendimento: (15) 98159-6443 · paredaogkbr@gmail.com
              </div>
            </div>
          </div>

          <button
            onClick={onOpenWhatsApp}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Falar no WhatsApp</span>
          </button>
        </div>

        {/* FAQ Accordion */}
        <div className="p-6 overflow-y-auto space-y-2.5">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 overflow-hidden transition-all"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="w-full p-4 text-left flex items-center justify-between gap-3 hover:bg-slate-100 dark:hover:bg-slate-900/60 transition-colors cursor-pointer"
                >
                  <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 transition-transform ${
                      isOpen ? 'rotate-180 text-emerald-600 dark:text-emerald-400' : ''
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed border-t border-slate-200 dark:border-slate-800/60 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};
