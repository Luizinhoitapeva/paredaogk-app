import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GkCloseIcon as X,
  GkStadiumArenaIcon as StadiumArena,
  GkUploadPhotoIcon as UploadPhoto,
  GkCheckCircleIcon as CheckCircle2,
  GkMapPinIcon as MapPin,
  GkInstagramIcon as Instagram,
  GkClockIcon as Clock,
  GkWhatsAppIcon,
} from './icons';
import { ArenaField, ArenaSurfaceType, ModalityType, UserProfile } from '../types';
import { uploadArenaPhotoToSupabase, submitNewArenaToSupabase } from '../lib/supabaseClient';
import { formatPhone } from '../utils/validations';

interface ArenaSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onArenaSubmitted: (arena: ArenaField) => void;
}

const SURFACE_OPTIONS: ArenaSurfaceType[] = [
  'Grama Sintética',
  'Grama Natural',
  'Quadra de Areia',
  'Futsal Indoor',
];

const MODALITY_OPTIONS: ModalityType[] = ['Society', 'Fut7', 'Campo 11', 'Futsal'];

export const ArenaSubmissionModal: React.FC<ArenaSubmissionModalProps> = ({
  isOpen,
  onClose,
  user,
  onArenaSubmitted,
}) => {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [surfaceType, setSurfaceType] = useState<ArenaSurfaceType>('Grama Sintética');
  const [mainModality, setMainModality] = useState<ModalityType>('Society');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submittedResult, setSubmittedResult] = useState<{
    arena: ArenaField;
    synced: boolean;
    uploadedToBucket: boolean;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      setSubmittedResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const resetForm = () => {
    setName('');
    setAddress('');
    setPhone('');
    setInstagram('');
    setSurfaceType('Grama Sintética');
    setMainModality('Society');
    setDescription('');
    setSelectedFile(null);
    setPhotoPreview('');
    setErrorMsg('');
    setSubmittedResult(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Selecione um arquivo de imagem válido (PNG, JPG ou WEBP).');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setErrorMsg('A foto escolhida ultrapassa 8MB. Selecione uma imagem menor.');
      return;
    }

    setErrorMsg('');
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !address.trim() || phone.replace(/\D/g, '').length < 10) {
      setErrorMsg('Preencha Nome da Arena, Endereço completo e Telefone válido com DDD.');
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);

    try {
      const arenaId = `arena-comm-${Date.now()}`;
      let finalPhotoUrl = '/assets/aistudio/Arena_Itapeva_6f597b9b.png';
      let uploadedToBucket = false;

      if (selectedFile) {
        setIsUploadingPhoto(true);
        const uploadRes = await uploadArenaPhotoToSupabase(selectedFile, arenaId);
        finalPhotoUrl = uploadRes.photoUrl;
        uploadedToBucket = uploadRes.uploadedToBucket;
        setIsUploadingPhoto(false);
      }

      const normalizedInsta = instagram.trim()
        ? instagram.trim().startsWith('@')
          ? instagram.trim()
          : `@${instagram.trim()}`
        : undefined;

      const { arena, synced } = await submitNewArenaToSupabase({
        id: arenaId,
        name: name.trim(),
        address: address.trim(),
        city: address.toLowerCase().includes('itapeva') ? 'Itapeva - SP' : user.city || 'Itapeva - SP',
        phone: phone.trim(),
        instagram: normalizedInsta,
        surfaceType,
        mainModality,
        photoUrl: finalPhotoUrl,
        isLogoPhoto: false,
        description: description.trim() || undefined,
        submittedById: user.id,
        submittedByName: user.name,
        submittedByEmail: user.email,
        isOfficialSeed: false,
      });

      onArenaSubmitted(arena);
      setSubmittedResult({ arena, synced, uploadedToBucket });
    } catch (err: any) {
      setIsUploadingPhoto(false);
      setErrorMsg(err?.message || 'Erro ao enviar nova arena. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 dark:bg-black/85 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          className="relative w-full max-w-xl bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#22c55e]/15 border border-[#22c55e]/40 flex items-center justify-center text-emerald-600 dark:text-[#22c55e]">
                <StadiumArena className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-extrabold text-base text-slate-900 dark:text-white">
                  Cadastrar Nova Arena / Campo
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Submeta um campo para avaliação e inclusão no Radar de Itapeva
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          {submittedResult ? (
            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="p-5 rounded-2xl bg-[#22c55e]/10 border border-[#22c55e]/40 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[#22c55e]/20 border border-[#22c55e]/50 flex items-center justify-center text-emerald-600 dark:text-[#22c55e] mx-auto">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-700 dark:text-amber-300 font-mono text-[10px] font-bold uppercase mb-2">
                    Status: Pendente de Aprovação (pending)
                  </span>
                  <h3 className="font-display font-extrabold text-base text-slate-900 dark:text-white">
                    {submittedResult.arena.name} enviada para moderação!
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                    Assim que o administrador aprovar o cadastro no Painel de Moderação, a arena aparecerá automaticamente na vitrine oficial e no Radar Inteligente de partidas.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono pt-1">
                  <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                    {submittedResult.synced ? 'Sincronizado no Supabase' : 'Salvo na fila local'}
                  </span>
                  {selectedFile && (
                    <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sky-700 dark:text-[#38bdf8]">
                      {submittedResult.uploadedToBucket
                        ? 'Foto enviada ao Bucket arenas'
                        : 'Foto redimensionada (Canvas)'}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cadastrar Outra
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2.5 rounded-xl bg-[#22c55e] hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
                >
                  Concluir
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
              {/* Moderation Notice */}
              <div className="px-3.5 py-2.5 rounded-xl bg-sky-50 dark:bg-[#38bdf8]/10 border border-sky-200 dark:border-[#38bdf8]/30 text-[11px] text-sky-800 dark:text-[#38bdf8] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  Novos cadastros entram automaticamente com status <strong>pending</strong> até aprovação do Administrador.
                </span>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/40 text-xs text-red-700 dark:text-red-300">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nome da Arena / Campo *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Arena Bela Vista Society Itapeva"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-[#22c55e] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-sky-600 dark:text-[#38bdf8]" />
                  Endereço Completo *
                </label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ex: Rua Exemplo, 450 - Vila Aparecida, Itapeva - SP"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-[#22c55e] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <GkWhatsAppIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-[#22c55e]" />
                    Telefone de Contato *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="(15) 99999-9999"
                    className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-[#22c55e] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Instagram className="w-3.5 h-3.5 text-sky-600 dark:text-[#38bdf8]" />
                    Instagram (Opcional)
                  </label>
                  <input
                    type="text"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="@arenaitapeva"
                    className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-[#22c55e] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Tipo de Piso *
                  </label>
                  <select
                    value={surfaceType}
                    onChange={(e) => setSurfaceType(e.target.value as ArenaSurfaceType)}
                    className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-[#22c55e] focus:outline-none"
                  >
                    {SURFACE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Modalidade Principal *
                  </label>
                  <select
                    value={mainModality}
                    onChange={(e) => setMainModality(e.target.value as ModalityType)}
                    className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-[#22c55e] focus:outline-none"
                  >
                    {MODALITY_OPTIONS.map((mod) => (
                      <option key={mod} value={mod}>
                        {mod}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Diferenciais / Observações (Opcional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Quadra coberta com iluminação LED, vestiário e estacionamento"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-[#22c55e] focus:outline-none"
                />
              </div>

              {/* Photo Upload + Resize */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Foto do Campo / Fachada (Redimensionamento automático)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {photoPreview ? (
                  <div className="relative rounded-2xl overflow-hidden border border-[#22c55e]/50 bg-slate-950 h-40">
                    <img
                      src={photoPreview}
                      alt="Pré-visualização da arena"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end justify-between p-3">
                      <span className="text-[11px] font-mono text-white truncate max-w-[65%]">
                        {selectedFile?.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-white text-[11px] font-bold cursor-pointer"
                      >
                        Trocar Foto
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full p-5 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#22c55e] bg-slate-50 dark:bg-slate-900/60 flex flex-col items-center justify-center gap-2 text-center transition-colors cursor-pointer"
                  >
                    <UploadPhoto className="w-7 h-7 text-sky-600 dark:text-[#38bdf8]" />
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Clique para selecionar a foto da arena
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Otimizada automaticamente (máx. 960px) e enviada ao Storage do Supabase
                    </span>
                  </button>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isUploadingPhoto}
                  className="px-5 py-2.5 rounded-xl bg-[#22c55e] hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-[#22c55e]/20 cursor-pointer transition-all"
                >
                  <UploadPhoto className="w-4 h-4" />
                  <span>
                    {isUploadingPhoto
                      ? 'Redimensionando Foto...'
                      : isSubmitting
                      ? 'Enviando Arena...'
                      : 'Enviar para Aprovação'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
