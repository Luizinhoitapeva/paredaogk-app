import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GkCloseIcon as X,
  GkDownloadIcon as Upload,
  GkCameraIcon as Camera,
  GkCheckIcon as Check,
  GkShieldIcon as Shield,
  GkProfileIcon as User,
  GkFlameIcon as Sparkles,
  GkCameraIcon as ImageIcon,
  GkRefreshIcon as RotateCcw
} from './icons';
import { UserRole } from '../types';

export interface AvatarPreset {
  id: string;
  name: string;
  category: 'capitao' | 'goleiro' | 'neutro';
  url: string;
  badge: string;
}

export const PRESET_AVATARS: AvatarPreset[] = [
  {
    id: 'preset-1',
    name: 'Capitão Clássico',
    category: 'capitao',
    url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&h=300&q=80',
    badge: 'Capitão',
  },
  {
    id: 'preset-2',
    name: 'Muralha Negra',
    category: 'goleiro',
    url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&h=300&q=80',
    badge: 'Camisa 1',
  },
  {
    id: 'preset-3',
    name: 'Paredão em Foco',
    category: 'goleiro',
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&h=300&q=80',
    badge: 'Elite GK',
  },
  {
    id: 'preset-4',
    name: 'Comandante Tático',
    category: 'capitao',
    url: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=300&h=300&q=80',
    badge: 'Organizador',
  },
  {
    id: 'preset-5',
    name: 'Goleiro da Várzea',
    category: 'goleiro',
    url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&h=300&q=80',
    badge: 'Luva Preta',
  },
  {
    id: 'preset-6',
    name: 'Atleta Imbatível',
    category: 'capitao',
    url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=300&h=300&q=80',
    badge: 'Titular',
  },
  {
    id: 'preset-7',
    name: 'Camisa 1 Ágil',
    category: 'goleiro',
    url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=300&h=300&q=80',
    badge: 'Reflexo Rápido',
  },
  {
    id: 'preset-8',
    name: 'Líder de Equipe',
    category: 'neutro',
    url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=300&h=300&q=80',
    badge: 'Diretoria',
  },
];

interface AvatarSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAvatar: string;
  userName: string;
  userRole?: UserRole;
  onSaveAvatar: (newAvatarUrl: string) => void;
}

export const AvatarSelectionModal: React.FC<AvatarSelectionModalProps> = ({
  isOpen,
  onClose,
  currentAvatar,
  userName,
  userRole = 'contratante',
  onSaveAvatar,
}) => {
  const [selectedAvatar, setSelectedAvatar] = useState<string>(currentAvatar);
  const [filterCategory, setFilterCategory] = useState<'todos' | 'capitao' | 'goleiro' | 'neutro'>('todos');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isSavedSuccessfully, setIsSavedSuccessfully] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedAvatar(currentAvatar);
      setIsSavedSuccessfully(false);
      setErrorMessage('');
    }
  }, [isOpen, currentAvatar]);

  if (!isOpen) return null;

  // Processar arquivo de foto carregado diretamente do celular ou computador
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Por favor, selecione um arquivo de imagem válido (PNG, JPG, WEBP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('A imagem selecionada é muito grande. Escolha uma foto de até 5MB.');
      return;
    }

    setErrorMessage('');
    setIsProcessingFile(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Recorte centralizado 1:1 (320x320) para manter proporção idêntica no header mobile e desktop
        const targetSize = 320;
        const canvas = document.createElement('canvas');
        canvas.width = targetSize;
        canvas.height = targetSize;

        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
          setSelectedAvatar(compressedDataUrl);
        } else {
          setSelectedAvatar(event.target?.result as string);
        }
        setIsProcessingFile(false);
      };
      img.onerror = () => {
        setErrorMessage('Falha ao processar a imagem. Tente outra foto.');
        setIsProcessingFile(false);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmSave = () => {
    setIsSavedSuccessfully(true);
    onSaveAvatar(selectedAvatar);
  };

  const filteredPresets = PRESET_AVATARS.filter((preset) => {
    if (filterCategory === 'todos') return true;
    return preset.category === filterCategory;
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/85 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden transition-colors"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/70">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Personalizar Foto de Perfil
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Faça upload do seu dispositivo ou escolha um avatar oficial do ParedãoGK
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

          {/* Modal Body */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
            {/* Live Selected Avatar Preview Bar */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <div className="w-16 h-16 aspect-square rounded-2xl overflow-hidden border-2 border-emerald-500 dark:border-emerald-400 shadow-lg shadow-emerald-500/20 bg-slate-200 dark:bg-slate-800">
                    <img
                      src={selectedAvatar}
                      alt={userName}
                      className="w-full h-full object-cover object-center block"
                    />
                  </div>
                  <span className="absolute -bottom-1 -right-1 p-1 rounded-full bg-emerald-500 text-slate-950 pointer-events-none">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">{userName}</h3>
                    <span className="px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-emerald-700 dark:text-emerald-400 uppercase">
                      {userRole === 'contratante' ? 'Capitão' : 'Goleiro'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Avatar ativo selecionado para sua conta
                  </p>
                </div>
              </div>

              {/* Botão de Upload Nativo */}
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessingFile}
                  className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-white flex items-center gap-2 shadow-sm dark:shadow-md transition-all cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span>{isProcessingFile ? 'Processando foto...' : 'Enviar Foto do Dispositivo'}</span>
                </button>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-700 dark:text-red-300">
                {errorMessage}
              </div>
            )}

            {/* Galeria de Avatares Predefinidos (Masculinos & Neutros) */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h4 className="font-semibold text-xs text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                  Galeria de Avatares Oficiais (Foco Masculino & Neutro)
                </h4>

                {/* Categorias */}
                <div className="flex items-center gap-1.5">
                  {[
                    { id: 'todos', label: 'Todos' },
                    { id: 'goleiro', label: 'Goleiros' },
                    { id: 'capitao', label: 'Capitães' },
                    { id: 'neutro', label: 'Neutros' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setFilterCategory(cat.id as any)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                        filterCategory === cat.id
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid de Avatares */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {filteredPresets.map((preset) => {
                  const isSelected = selectedAvatar === preset.url;
                  return (
                    <div
                      key={preset.id}
                      onClick={() => setSelectedAvatar(preset.url)}
                      className={`relative p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border transition-all cursor-pointer flex flex-col items-center text-center group ${
                        isSelected
                          ? 'border-emerald-500 dark:border-emerald-400 bg-emerald-500/10 shadow-lg shadow-emerald-500/10 scale-[1.02]'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="relative mb-2">
                        <img
                          src={preset.url}
                          alt={preset.name}
                          className={`w-16 h-16 rounded-2xl object-cover border transition-all ${
                            isSelected
                              ? 'border-emerald-500 dark:border-emerald-400 ring-2 ring-emerald-400/40'
                              : 'border-slate-300 dark:border-slate-700 group-hover:border-slate-400 dark:group-hover:border-slate-500'
                          }`}
                        />
                        {isSelected && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-bold">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>

                      <span className="font-bold text-xs text-slate-900 dark:text-white truncate max-w-full">
                        {preset.name}
                      </span>
                      <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {preset.badge}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer Action */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSelectedAvatar(PRESET_AVATARS[0].url)}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Padrão</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition-all cursor-pointer"
              >
                {isSavedSuccessfully ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Salvo!</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    <span>Aplicar Foto de Perfil</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
