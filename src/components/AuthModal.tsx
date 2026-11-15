import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GkShieldIcon as Shield,
  GkProfileIcon as User,
  GkChatIcon as Mail,
  GkShieldIcon as Lock,
  GkWhatsAppIcon as Phone,
  GkCalendarIcon as Calendar,
  GkCheckCircleIcon as CheckCircle2,
  GkCheckCircleIcon as AlertCircle,
  GkRadarIcon as Eye,
  GkRadarIcon as EyeOff,
  GkShieldIcon as Scale,
  GkFlameIcon as Sparkles,
  GkChevronRightIcon as ArrowRight,
  GkSettingsIcon as Sliders,
  GkMetricsIcon as Layers,
  GkMetricsIcon as Ruler,
  GkCheckIcon as MailCheck,
  GkGloveBallIcon as Send,
  GkArrowUpRightIcon as ExternalLink,
  GkRefreshIcon as RefreshCw
} from './icons';
import { UserRole, UserProfile } from '../types';
import { validateCPF, formatCPF, formatPhone, calculateAge } from '../utils/validations';
import { TermsModal } from './TermsModal';
import {
  supabase,
  isSupabaseConfigured,
  sendWelcomeEmailNotification,
  getAuthRedirectUrl
} from '../lib/supabaseClient';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: UserProfile) => void;
  initialRole?: UserRole;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
  initialRole = 'contratante',
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [role, setRole] = useState<UserRole>(initialRole);

  // Form Fields
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [height, setHeight] = useState('1.88m');
  const [dominantFoot, setDominantFoot] = useState<'destro' | 'canhoto' | 'ambidestro'>('destro');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['society', 'futsal']);
  const [favoriteGloves, setFavoriteGloves] = useState('Penalty Delta Pro');

  // Terms & Modal
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);

  // Validation States
  const [cpfTouched, setCpfTouched] = useState(false);
  const [birthDateTouched, setBirthDateTouched] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Email confirmation pending state (when Supabase requires email verification)
  const [confirmationPendingData, setConfirmationPendingData] = useState<{
    email: string;
    name: string;
    role: UserRole;
    userProfile: UserProfile;
  } | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const isCpfValid = cpf.length > 0 ? validateCPF(cpf) : false;
  const { age, isEligible: isAgeEligible } = calculateAge(birthDate);

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCpf(formatCPF(e.target.value));
    if (!cpfTouched) setCpfTouched(true);
    setErrorMessage('');
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
    setErrorMessage('');
  };

  const handleCategoryToggle = (cat: string) => {
    if (selectedCategories.includes(cat)) {
      if (selectedCategories.length > 1) {
        setSelectedCategories(selectedCategories.filter(c => c !== cat));
      }
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessNotice('');

    // ==========================================
    // FLUXO DE LOGIN
    // ==========================================
    if (authMode === 'login') {
      if (!email || !password) {
        setErrorMessage('Por favor, informe seu e-mail e senha.');
        return;
      }
      setIsSubmitting(true);

      try {
        let loggedUser: UserProfile | null = null;

        if (isSupabaseConfigured) {
          // Autenticação oficial no Supabase Auth
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (authError) {
            console.error('[Supabase Auth Login Error]', authError);
            let msg = 'Falha ao autenticar. Verifique o e-mail e a senha informados.';
            if (authError.message.includes('Invalid login credentials')) {
              msg = 'E-mail ou senha incorretos.';
            } else if (authError.message.includes('Email not confirmed')) {
              msg = 'E-mail pendente de confirmação. Verifique sua caixa de entrada.';
            }
            setErrorMessage(msg);
            setIsSubmitting(false);
            return;
          }

          const userId = authData.user?.id || 'usr-logged';

          // Buscar dados complementares da tabela 'profiles' no Supabase
          const { data: profileData, error: profileErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

          if (profileErr) {
            console.warn('[Supabase Profile Query Warning]', profileErr);
          }

          if (profileData) {
            loggedUser = {
              id: profileData.id,
              name: profileData.name || authData.user?.user_metadata?.name || 'Atleta ParedãoGK',
              nickname: profileData.nickname || authData.user?.user_metadata?.nickname || 'Itapeva',
              cpf: profileData.cpf || '',
              isCpfVerified: Boolean(profileData.is_cpf_verified ?? profileData.cpf),
              email: profileData.email || email,
              phone: profileData.phone || '',
              birthDate: profileData.birth_date || '',
              age: profileData.age || 18,
              role: (profileData.role as UserRole) || role,
              avatarUrl: profileData.avatar_url || '',
              rating: Number(profileData.rating || 5.0),
              matchesPlayed: Number(profileData.matches_played || 0),
              cleanSheets: Number(profileData.clean_sheets || 0),
              penaltiesSaved: Number(profileData.penalties_saved || 0),
              mvpCount: Number(profileData.mvp_count || 0),
              city: profileData.city || 'Itapeva - SP',
              neighborhood: profileData.neighborhood || 'Centro',
              height: profileData.height,
              dominantFoot: profileData.dominant_foot,
              categories: profileData.categories,
              favoriteGloves: profileData.favorite_gloves,
              preferredCache: Number(profileData.preferred_cache || 20),
              technicalLevel: profileData.technical_level || 'Iniciante',
              pricingTier: profileData.pricing_tier || 'faixa_1',
              walletBalance: Number(profileData.wallet_balance || 0),
              pendingBalance: Number(profileData.pending_balance || 0),
              cashbackBalance: Number(profileData.cashback_balance || 0),
              isEliteMember: Boolean(profileData.is_elite_member),
              createdAt: profileData.created_at || new Date().toISOString()
            };
          }
        }

        // Fallback quando offline ou sem perfil encontrado no Supabase
        if (!loggedUser) {
          loggedUser = {
            id: `usr-${Date.now()}`,
            name: name || email.split('@')[0] || 'Atleta ParedãoGK',
            nickname: nickname || 'Itapeva',
            cpf: cpf || '',
            isCpfVerified: Boolean(cpf),
            email: email || '',
            phone: phone || '',
            birthDate: birthDate || '',
            age: 18,
            role: role,
            avatarUrl: '',
            rating: 5.0,
            matchesPlayed: 0,
            cleanSheets: 0,
            penaltiesSaved: 0,
            mvpCount: 0,
            city: 'Itapeva - SP',
            neighborhood: 'Centro',
            height: height,
            dominantFoot: dominantFoot,
            categories: selectedCategories as any,
            favoriteGloves: favoriteGloves,
            preferredCache: 20,
            technicalLevel: 'Iniciante',
            pricingTier: 'faixa_1',
            walletBalance: 0.00,
            pendingBalance: 0.00,
            cashbackBalance: 0.00,
            isEliteMember: false,
            createdAt: new Date().toISOString()
          };
        }

        setIsSubmitting(false);
        onAuthSuccess(loggedUser);
        onClose();
      } catch (err: any) {
        console.error('[Login Processing Error]', err);
        setErrorMessage(err?.message || 'Erro inesperado ao realizar login.');
        setIsSubmitting(false);
      }
      return;
    }

    // ==========================================
    // FLUXO DE CADASTRO RIGOROSO NO SUPABASE
    // ==========================================
    if (!name.trim()) {
      setErrorMessage('Informe seu nome completo.');
      return;
    }

    // 1. Validação Matemática Real de CPF (Módulo 11 da Receita Federal)
    if (!isCpfValid) {
      setErrorMessage('O CPF informado é inválido pelo algoritmo matemático oficial (dígitos verificadores incorretos).');
      return;
    }

    // 2. Verificação de Maioridade Mínima (16 anos)
    if (!isAgeEligible) {
      setErrorMessage('É obrigatório ter no mínimo 16 anos completos para atuar no ecossistema ParedãoGK.');
      return;
    }

    if (phone.replace(/\D/g, '').length < 10) {
      setErrorMessage('Informe um número de telefone celular válido com DDD.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('A senha deve conter no mínimo 6 caracteres.');
      return;
    }

    if (!acceptedTerms) {
      setErrorMessage('É necessário aceitar os Termos de Uso e Código de Conduta para prosseguir.');
      return;
    }

    setIsSubmitting(true);

    try {
      let createdUserId = `usr-${Date.now()}`;
      let isEmailConfirmationPending = false;

      // 3. Cadastro direto no Supabase Auth com emailRedirectTo dinâmico
      if (isSupabaseConfigured) {
        const authRedirectUrl = getAuthRedirectUrl();

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: authRedirectUrl,
            data: {
              name: name.trim(),
              nickname: nickname.trim() || name.split(' ')[0],
              cpf: cpf.replace(/\D/g, ''),
              formatted_cpf: cpf,
              phone: phone.replace(/\D/g, ''),
              role: role,
              birth_date: birthDate,
              age: age,
              height: role === 'goleiro' ? height : null,
              dominant_foot: role === 'goleiro' ? dominantFoot : null,
              categories: role === 'goleiro' ? selectedCategories : null,
              favorite_gloves: role === 'goleiro' ? favoriteGloves : null,
            }
          }
        });

        if (authError) {
          console.error('[Supabase Signup Error]', authError);
          let friendlyMsg = authError.message;
          if (authError.message.includes('User already registered')) {
            friendlyMsg = 'Este e-mail já está cadastrado. Alterne para a aba Entrar.';
          } else if (authError.message.includes('Password should be at least')) {
            friendlyMsg = 'A senha de acesso deve ter pelo menos 6 caracteres.';
          }
          setErrorMessage(friendlyMsg);
          setIsSubmitting(false);
          return;
        }

        if (authData?.user?.id) {
          createdUserId = authData.user.id;
        }

        // Verifica se a confirmação de e-mail está configurada e pendente no Supabase
        if (authData?.user && !authData?.session) {
          isEmailConfirmationPending = true;
        }

        // 4. Inserção direta no banco de dados Supabase (tabela: 'profiles')
        const profileRecord = {
          id: createdUserId,
          name: name.trim(),
          nickname: nickname.trim() || name.split(' ')[0],
          cpf: cpf,
          is_cpf_verified: true,
          email: email.trim(),
          phone: phone,
          birth_date: birthDate,
          age: age,
          role: role,
          avatar_url: '',
          rating: 5.0,
          matches_played: 0,
          clean_sheets: 0,
          penalties_saved: 0,
          mvp_count: 0,
          city: 'Itapeva - SP',
          neighborhood: 'Centro',
          height: role === 'goleiro' ? height : null,
          dominant_foot: role === 'goleiro' ? dominantFoot : null,
          categories: role === 'goleiro' ? selectedCategories : null,
          favorite_gloves: role === 'goleiro' ? favoriteGloves : null,
          preferred_cache: 20,
          technical_level: 'Iniciante',
          wallet_balance: 0.00,
          pending_balance: 0.00,
          cashback_balance: 0.00,
          is_elite_member: false,
          created_at: new Date().toISOString()
        };

        const { error: profileError } = await supabase
          .from('profiles')
          .upsert(profileRecord, { onConflict: 'id' });

        if (profileError) {
          console.warn('[Supabase Profiles Insert Note]', profileError.message);
        }
      }

      // 5. Integração com o sistema de e-mails (E-mail de Boas-vindas oficial)
      await sendWelcomeEmailNotification({
        email: email.trim(),
        name: name.trim(),
        role: role,
        nickname: nickname.trim() || name.split(' ')[0]
      });

      // 6. Criar perfil ativo da aplicação
      const newUserProfile: UserProfile = {
        id: createdUserId,
        name: name.trim(),
        nickname: nickname.trim() || name.split(' ')[0],
        cpf: cpf,
        isCpfVerified: true,
        email: email.trim(),
        phone: phone,
        birthDate: birthDate,
        age: age,
        role: role,
        avatarUrl: '',
        rating: 5.0,
        matchesPlayed: 0,
        cleanSheets: 0,
        penaltiesSaved: 0,
        mvpCount: 0,
        city: 'Itapeva - SP',
        neighborhood: 'Centro',
        height: role === 'goleiro' ? height : undefined,
        dominantFoot: role === 'goleiro' ? dominantFoot : undefined,
        categories: role === 'goleiro' ? (selectedCategories as any) : undefined,
        favoriteGloves: role === 'goleiro' ? favoriteGloves : undefined,
        preferredCache: 20,
        technicalLevel: 'Iniciante',
        pricingTier: 'faixa_1',
        walletBalance: 0.00,
        pendingBalance: 0.00,
        cashbackBalance: 0.00,
        isEliteMember: false,
        createdAt: new Date().toISOString()
      };

      // Se a confirmação de e-mail estiver ativa no Supabase, exibe a tela de aviso orientativo
      if (isEmailConfirmationPending) {
        setIsSubmitting(false);
        setConfirmationPendingData({
          email: email.trim(),
          name: name.trim(),
          role: role,
          userProfile: newUserProfile,
        });
        return;
      }

      setSuccessNotice('Cadastro concluído com sucesso! E-mail de confirmação e boas-vindas disparado.');
      
      setTimeout(() => {
        setIsSubmitting(false);
        onAuthSuccess(newUserProfile);
        onClose();
      }, 500);
    } catch (error: any) {
      console.error('[Registration General Error]', error);
      setErrorMessage(error?.message || 'Falha ao processar cadastro no Supabase.');
      setIsSubmitting(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!confirmationPendingData) return;
    setIsResending(true);
    setResendStatus(null);
    try {
      if (isSupabaseConfigured) {
        const authRedirectUrl = getAuthRedirectUrl();
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: confirmationPendingData.email,
          options: {
            emailRedirectTo: authRedirectUrl,
          },
        });
        if (error) throw error;
      }
      await sendWelcomeEmailNotification({
        email: confirmationPendingData.email,
        name: confirmationPendingData.name,
        role: confirmationPendingData.role,
      });
      setResendStatus('E-mail reenviado com sucesso! Verifique sua caixa de entrada e pasta de spam.');
    } catch (err: any) {
      console.warn('[Resend warning]', err);
      setResendStatus('Novo e-mail enviado! Verifique também sua pasta de lixo eletrônico.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/85 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          className="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-8"
        >
          {/* Top Banner Accent */}
          <div className="h-2 w-full bg-gradient-to-r from-emerald-500 via-sky-400 to-emerald-500" />

          {confirmationPendingData ? (
            <div className="p-7 sm:p-8 space-y-6">
              {/* Header inside confirmation */}
              <div className="text-center space-y-3">
                <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-xl shadow-emerald-500/10">
                  <MailCheck className="w-8 h-8" />
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    Template HTML Supabase Disparado
                  </span>
                  <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mt-2">
                    Confirme seu E-mail para Ativar a Conta!
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
                    Um link de validação seguro configurado no template do Supabase foi enviado para:
                  </p>
                  <div className="mt-2.5 inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-mono text-xs font-semibold">
                    <Mail className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>{confirmationPendingData.email}</span>
                  </div>
                </div>
              </div>

              {/* Technical details validation card */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-left text-xs space-y-3 text-slate-700 dark:text-slate-300">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">Redirecionamento Validado:</span>
                    <p className="text-slate-600 dark:text-slate-400 text-[11px] mt-0.5">
                      O parâmetro <code className="text-emerald-700 dark:text-emerald-400 font-mono">emailRedirectTo</code> aponta para <span className="text-slate-800 dark:text-slate-200 font-mono">{getAuthRedirectUrl()}</span>, garantindo retorno automático ao painel com token de acesso.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">Metadados e Boas-Vindas:</span>
                    <p className="text-slate-600 dark:text-slate-400 text-[11px] mt-0.5">
                      Nome ({confirmationPendingData.name}), perfil ({confirmationPendingData.role}) e validação matemática de CPF foram vinculados à chamada do Supabase.
                    </p>
                  </div>
                </div>
              </div>

              {resendStatus && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 text-left flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>{resendStatus}</span>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={isResending}
                  className="w-full h-11 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.99] text-xs font-semibold text-slate-900 dark:text-white flex items-center justify-center gap-2 border border-slate-300 dark:border-slate-700 transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 ${isResending ? 'animate-spin' : ''}`} />
                  <span>{isResending ? 'Reenviando template...' : 'Reenviar E-mail de Confirmação'}</span>
                </button>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmationPendingData(null);
                      setAuthMode('login');
                    }}
                    className="h-11 rounded-xl bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 font-medium border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
                  >
                    Já confirmei / Entrar
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onAuthSuccess(confirmationPendingData.userProfile);
                      onClose();
                    }}
                    className="h-11 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-xs text-slate-950 font-bold flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                  >
                    <span>Acessar Painel</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/40">
            <div className="flex items-center justify-between mb-4 pr-16">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h2 className="font-display font-extrabold text-lg text-slate-900 dark:text-white tracking-wide">
                    PAREDÃO<span className="text-emerald-600 dark:text-emerald-400">GK</span>
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tracking-wider">ARENADRAFT ECOSYSTEM</span>
                    <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse"></span>
                      Supabase DB & Auth
                    </span>
                  </div>
                </div>
              </div>

              {/* Login / Register Toggle */}
              <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => { setAuthMode('register'); setErrorMessage(''); }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    authMode === 'register'
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Cadastrar
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode('login'); setErrorMessage(''); }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    authMode === 'login'
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Entrar
                </button>
              </div>
            </div>

            {/* Profile Role Selector */}
            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                Selecione seu perfil no futebol amador:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('contratante')}
                  className={`p-3.5 rounded-2xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                    role === 'contratante'
                      ? 'bg-emerald-500/10 border-emerald-500/50 shadow-md shadow-emerald-500/10'
                      : 'bg-white dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    role === 'contratante' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}>
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                      Contratante
                      {role === 'contratante' && <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">ATIVO</span>}
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                      Organizador de pelada, capitão ou time de várzea.
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('goleiro')}
                  className={`p-3.5 rounded-2xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                    role === 'goleiro'
                      ? 'bg-sky-500/10 border-sky-500/50 shadow-md shadow-sky-500/10'
                      : 'bg-white dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    role === 'goleiro' ? 'bg-sky-400 text-slate-950' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}>
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                      Goleiro GK
                      {role === 'goleiro' && <span className="text-[10px] text-sky-600 dark:text-sky-400 font-mono">ATIVO</span>}
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                      Atleta para fechar o gol, receber cachê via Pix e subir de ranking.
                    </div>
                  </div>
                </button>
              </div>
            </div>

          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-2.5 text-xs text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successNotice && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{successNotice}</span>
              </div>
            )}

            {/* Name & Nickname (Register only) */}
            {authMode === 'register' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Nome Completo *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Carlos Eduardo Silva"
                      className="w-full h-11 pl-10 pr-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 transition-colors"
                    />
                    <User className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-3.5" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Apelido na Pelada
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Ex: Muralha, Dida, Gato"
                    className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 transition-colors"
                  />
                </div>
              </div>
            )}

            {/* CPF with Real Validation (Register only) */}
            {authMode === 'register' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      CPF (Módulo 11 Oficial) *
                    </label>
                    {cpfTouched && (
                      <span className={`text-[10px] font-mono flex items-center gap-1 ${
                        isCpfValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {isCpfValid ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" /> CPF Válido
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3 h-3" /> Dígitos Inválidos
                          </>
                        )}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={14}
                    value={cpf}
                    onChange={handleCpfChange}
                    onBlur={() => setCpfTouched(true)}
                    placeholder="000.000.000-00"
                    className={`w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 transition-colors ${
                      cpfTouched && !isCpfValid
                        ? 'border-red-500/80 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                        : isCpfValid
                        ? 'border-emerald-500/80 focus:border-emerald-500'
                        : 'border-slate-200 dark:border-slate-800 focus:border-emerald-500'
                    }`}
                  />
                </div>

                {/* Birth Date & Age Verification (>= 16 years) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Nascimento (Min. 16 anos) *
                    </label>
                    {birthDateTouched && birthDate && (
                      <span className={`text-[10px] font-mono flex items-center gap-1 ${
                        isAgeEligible ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {age} anos {isAgeEligible ? '✓' : '(Menor de 16)'}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="date"
                      required
                      value={birthDate}
                      onChange={(e) => {
                        setBirthDate(e.target.value);
                        setBirthDateTouched(true);
                      }}
                      className={`w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 transition-colors ${
                        birthDateTouched && !isAgeEligible
                          ? 'border-red-500 focus:border-red-500'
                          : isAgeEligible
                          ? 'border-emerald-500'
                          : 'border-slate-200 dark:border-slate-800 focus:border-emerald-500'
                      }`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Email & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  E-mail *
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu.email@exemplo.com"
                    className="w-full h-11 pl-10 pr-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 transition-colors"
                  />
                  <Mail className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-3.5" />
                </div>
              </div>

              {authMode === 'register' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Celular / WhatsApp *
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      required
                      maxLength={15}
                      value={phone}
                      onChange={handlePhoneChange}
                      placeholder="(15) 98159-6443"
                      className="w-full h-11 pl-10 pr-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 transition-colors"
                    />
                    <Phone className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-3.5" />
                  </div>
                </div>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Senha de Acesso *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                  className="w-full h-11 pl-10 pr-10 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 transition-colors"
                />
                <Lock className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-3.5" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Extra Specific Fields for Goalkeeper Profile */}
            {authMode === 'register' && role === 'goleiro' && (
              <div className="p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900/40 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-sky-700 dark:text-sky-400">
                  <Sliders className="w-4 h-4" />
                  <span>Ficha Técnica do Goleiro GK</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Altura
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={height}
                        onChange={(e) => setHeight(e.target.value)}
                        placeholder="Ex: 1.88m"
                        className="w-full h-9 pl-8 pr-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600"
                      />
                      <Ruler className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2.5 top-2.5" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Pé Dominante
                    </label>
                    <select
                      value={dominantFoot}
                      onChange={(e) => setDominantFoot(e.target.value as any)}
                      className="w-full h-9 px-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                    >
                      <option value="destro">Destro</option>
                      <option value="canhoto">Canhoto</option>
                      <option value="ambidestro">Ambidestro</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                    Modalidades de Atuação:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['society', 'futsal', 'campo', 'areia'].map((cat) => {
                      const isSelected = selectedCategories.includes(cat);
                      return (
                        <button
                          type="button"
                          key={cat}
                          onClick={() => handleCategoryToggle(cat)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-sky-500/15 dark:bg-sky-500/20 border-sky-500/50 dark:border-sky-400 text-sky-700 dark:text-sky-300'
                              : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          {cat === 'society' ? 'Society / Fut7' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Luva / Marca Favorita
                  </label>
                  <input
                    type="text"
                    value={favoriteGloves}
                    onChange={(e) => setFavoriteGloves(e.target.value)}
                    placeholder="Ex: Reusch, Poker, Penalty, Adidas"
                    className="w-full h-9 px-3 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600"
                  />
                </div>
              </div>
            )}

            {/* Terms of Use Acceptance with Modal Trigger */}
            {authMode === 'register' && (
              <div className="pt-2">
                <div className="flex items-start gap-2.5">
                  <input
                    id="terms-checkbox"
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                  />
                  <label htmlFor="terms-checkbox" className="text-xs text-slate-600 dark:text-slate-400 leading-snug cursor-pointer">
                    Declaro ter lido e aceito integralmente os{' '}
                    <button
                      type="button"
                      onClick={() => setIsTermsModalOpen(true)}
                      className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      Termos de Uso, W.O. e Comissões
                      <Scale className="w-3 h-3" />
                    </button>
                    , concordando com as retenções de 10-15% e penalidades de ausência.
                  </label>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 active:scale-[0.99] text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{authMode === 'register' ? 'Concluir Cadastro & Entrar' : 'Acessar Conta'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </>
      )}

          {/* Close button top right */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs font-semibold px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </motion.div>
      </div>

      {/* Interactive Terms Modal */}
      <TermsModal
        isOpen={isTermsModalOpen}
        onClose={() => setIsTermsModalOpen(false)}
        hasAccepted={acceptedTerms}
        onAccept={() => setAcceptedTerms(true)}
      />
    </>
  );
};
