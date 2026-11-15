import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  GkCloseIcon as X,
  GkFutshopIcon as ShoppingBag,
  GkStarRatingIcon as Star,
  GkFlameIcon as Sparkles,
  GkCheckIcon as Check,
  GkFlameIcon as Tag,
  GkShieldIcon as Shield,
  GkWalletPixIcon as CreditCard,
  GkWalletPixIcon as Wallet
} from './icons';
import { ShopProduct, UserProfile } from '../types';
import { MOCK_SHOP_PRODUCTS } from '../data/mockData';
import { formatCurrency } from '../utils/validations';

interface FutshopModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onPurchaseSuccess: (amount: number, cashbackEarned: number) => void;
}

export const FutshopModal: React.FC<FutshopModalProps> = ({
  isOpen,
  onClose,
  user,
  onPurchaseSuccess,
}) => {
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleBuy = (product: ShopProduct) => {
    if (user.walletBalance < product.price) {
      alert(`Saldo insuficiente na carteira (${formatCurrency(user.walletBalance)}). Por favor, adicione saldo via Pix.`);
      return;
    }

    const cashbackEarned = Number(((product.price * product.cashbackPercent) / 100).toFixed(2));
    onPurchaseSuccess(product.price, cashbackEarned);
    setPurchaseSuccess(product.name);

    setTimeout(() => {
      setPurchaseSuccess(null);
      setSelectedProduct(null);
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden transition-colors"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                Futshop Oficial ArenaDraft
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                  Descontos GK
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Luvas e artigos esportivos profissionais com compra via saldo da carteira
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

        {/* User Balance banner */}
        <div className="p-3 px-6 bg-slate-100/80 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs flex-wrap gap-2">
          <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            Seu Saldo em Carteira: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{formatCurrency(user.walletBalance)}</strong>
          </span>
          <span className="text-slate-600 dark:text-slate-400">
            Cashback na compra: <strong className="text-sky-600 dark:text-sky-400">Até 15% de volta</strong>
          </span>
        </div>

        {/* Success toast */}
        {purchaseSuccess && (
          <div className="p-3 bg-emerald-500/15 dark:bg-emerald-500/20 border-b border-emerald-500/40 text-emerald-800 dark:text-emerald-300 text-xs text-center flex items-center justify-center gap-2">
            <Check className="w-4 h-4" />
            <span>Compra realizada com sucesso: <strong>{purchaseSuccess}</strong>. Cashback creditado!</span>
          </div>
        )}

        {/* Products Grid */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
          {MOCK_SHOP_PRODUCTS.map((prod) => (
            <div
              key={prod.id}
              className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col justify-between space-y-3"
            >
              <div className="flex gap-3">
                <img
                  src={prod.image}
                  alt={prod.name}
                  className="w-20 h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-800 shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                      {prod.brand}
                    </span>
                    {prod.tag && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                        {prod.tag}
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white line-clamp-2">
                    {prod.name}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                    {prod.description}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 line-through">
                    {formatCurrency(prod.originalPrice)}
                  </div>
                  <div className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(prod.price)}
                  </div>
                  <div className="text-[10px] text-sky-600 dark:text-sky-400 font-mono">
                    +{prod.cashbackPercent}% cashback
                  </div>
                </div>

                <button
                  onClick={() => handleBuy(prod)}
                  className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-sky-500/20 transition-all cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Comprar com Saldo</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Support note */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 text-center text-[11px] text-slate-500 dark:text-slate-400">
          Dúvidas sobre entregas ou cupons? Fale com a equipe ParedãoGK: <span className="text-emerald-600 dark:text-emerald-400 font-mono">paredaogkbr@gmail.com</span> · <span className="text-sky-600 dark:text-sky-400 font-mono">(15) 98159-6443</span>
        </div>
      </motion.div>
    </div>
  );
};
