import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GkShieldIcon as Shield,
  GkFlameIcon as Zap,
  GkWalletPixIcon as Wallet,
  GkChevronRightIcon as ChevronRight,
  GkCheckCircleIcon as CheckCircle2,
  GkChevronRightIcon as ArrowRight
} from './icons';

interface OnboardingCarouselProps {
  onComplete: () => void;
}

const SLIDES = [
  {
    id: 1,
    title: 'Bora Jogar com Goleiro de Verdade!',
    subtitle: 'O ecossistema oficial do futebol amador integrado ao ArenaDraft',
    description: 'Encontre goleiros de alto nível para sua pelada, society, futsal ou festival de várzea com histórico verificado e avaliação real da comunidade.',
    badge: 'Ecossistema ArenaDraft',
    icon: Shield,
    color: 'from-emerald-500/20 to-emerald-950/40',
    accentColor: '#22c55e',
    features: ['Mais de 2.500 goleiros cadastrados', 'Atendimento em toda a Grande SP e capitais', 'Garantia de reposição em caso de imprevisto']
  },
  {
    id: 2,
    title: 'Chega de Revezar na Linha!',
    subtitle: 'Ninguém mais precisa ir pro gol contra a própria vontade',
    description: 'Convocação inteligente com radar por geolocalização. O goleiro chega com antecedência mínima de 15 minutos, uniforme e luvas higienizadas.',
    badge: 'Zero Dor de Cabeça',
    icon: Zap,
    color: 'from-sky-500/20 to-sky-950/40',
    accentColor: '#38bdf8',
    features: ['Pontualidade 100% monitorada', 'Estatísticas de defesas e clean sheets', 'Classificação de nível competitivo']
  },
  {
    id: 3,
    title: 'Carteira Digital & Pix Instantâneo',
    subtitle: 'Cachê em custódia protegida e cashback garantido',
    description: 'Pagamento 100% seguro. O contratante paga com Pix e o valor só é repassado ao goleiro após o término do jogo com aprovação mútua.',
    badge: 'Segurança & Recompensa',
    icon: Wallet,
    color: 'from-emerald-500/20 via-sky-500/10 to-slate-950',
    accentColor: '#22c55e',
    features: ['Saque Pix a qualquer hora sem burocracia', 'Cashback acumulativo na Futshop', 'Seguro atleta contra lesões em jogo']
  }
];

export const OnboardingCarousel: React.FC<OnboardingCarouselProps> = ({ onComplete }) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide((prev) => prev + 1);
    } else {
      onComplete();
    }
  };

  const slide = SLIDES[currentSlide];
  const IconComponent = slide.icon;

  return (
    <div className="relative min-h-screen bg-slate-100 text-slate-900 dark:bg-[#020617] dark:text-slate-100 flex flex-col justify-between p-6 overflow-hidden transition-colors duration-200">
      {/* Background ambient glow */}
      <div 
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none transition-colors duration-700"
        style={{ backgroundColor: slide.accentColor }}
      />

      {/* Top Header bar with Brand and Skip */}
      <div className="relative z-10 flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 dark:bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="font-display font-extrabold tracking-wider text-sm text-slate-900 dark:text-slate-200">
            PAREDÃO<span className="text-emerald-600 dark:text-emerald-400">GK</span>
          </span>
        </div>

        <button
          onClick={onComplete}
          className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 bg-white/80 dark:bg-transparent transition-colors cursor-pointer"
        >
          Pular
        </button>
      </div>

      {/* Main Slide Content */}
      <div className="relative z-10 my-auto py-8 max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center text-center"
          >
            {/* Visual Icon Halo */}
            <div className={`w-24 h-24 rounded-3xl bg-gradient-to-br ${slide.color} border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center mb-6 shadow-xl relative group`}>
              <IconComponent className="w-12 h-12" style={{ color: slide.accentColor }} />
              <div 
                className="absolute inset-0 rounded-3xl opacity-20 dark:opacity-30 blur-md -z-10"
                style={{ backgroundColor: slide.accentColor }}
              />
            </div>

            {/* Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 mb-4 shadow-sm">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: slide.accentColor }} />
              {slide.badge}
            </div>

            {/* Title & Subtitle */}
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2 leading-tight">
              {slide.title}
            </h1>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-4 max-w-md">
              {slide.subtitle}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mb-6 leading-relaxed max-w-sm">
              {slide.description}
            </p>

            {/* Feature Bullets */}
            <div className="w-full space-y-2 text-left bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 mb-6 shadow-sm backdrop-blur-sm">
              {slide.features.map((feature, idx) => (
                <div key={idx} className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom Controls */}
      <div className="relative z-10 max-w-lg mx-auto w-full pb-safe space-y-6">
        {/* Pagination Indicators */}
        <div className="flex items-center justify-center gap-2">
          {SLIDES.map((s, index) => (
            <button
              key={s.id}
              onClick={() => setCurrentSlide(index)}
              aria-label={`Slide ${index + 1}`}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === currentSlide 
                  ? 'w-8 bg-emerald-500 dark:bg-emerald-400' 
                  : 'w-2 bg-slate-300 dark:bg-slate-800 hover:bg-slate-400 dark:hover:bg-slate-700'
              }`}
            />
          ))}
        </div>

        {/* Action Button */}
        <button
          onClick={handleNext}
          className="w-full h-13 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 active:scale-[0.99] text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
        >
          {currentSlide === SLIDES.length - 1 ? (
            <>
              <span>Começar no ParedãoGK</span>
              <ArrowRight className="w-4 h-4" />
            </>
          ) : (
            <>
              <span>Avançar</span>
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
