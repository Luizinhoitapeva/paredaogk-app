import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole, TabType, MatchBooking, Goalkeeper, Conversation, ChatMessage, WeeklyMatchTemplate, PostMatchAiFeedbackResult, Transaction, WalletDashboardSummary, ArenaField } from './types';
import {
  INITIAL_USER,
  INITIAL_ITAPEVA_ARENAS,
} from './data/mockData';
import {
  supabase,
  isSupabaseConfigured,
  subscribeToRealtimeBookingsAndNotifications,
  broadcastBookingConfirmed,
  playWhistleNotification,
  syncOrganizerRetentionToSupabase,
  reinviteGoalkeeperNextWeek,
  updateMatchSafetyTimeline,
  triggerSosSubstitution,
  seedAndFetchArenasFromSupabase,
  fetchMatchesFromSupabase,
  fetchAdminPixWithdrawalsFromSupabase,
  isAuthorizedAdmin,
} from './lib/supabaseClient';
import { OnboardingCarousel } from './components/OnboardingCarousel';
import { AuthModal } from './components/AuthModal';
import { TopHeader } from './components/TopHeader';
import { BottomNavigation } from './components/BottomNavigation';
import { DrawerMenu } from './components/DrawerMenu';
import { HomeTab } from './components/HomeTab';
import { ChatTab } from './components/ChatTab';
import { NotificationsTab } from './components/NotificationsTab';
import { WalletTab } from './components/WalletTab';
import { IntelligentCallModal } from './components/IntelligentCallModal';
import { MatchHistoryModal } from './components/MatchHistoryModal';
import { PostMatchReviewModal } from './components/PostMatchReviewModal';
import { FutshopModal } from './components/FutshopModal';
import { HelpFaqModal } from './components/HelpFaqModal';
import { TermsModal } from './components/TermsModal';
import { GoalkeeperCallAlertModal } from './components/GoalkeeperCallAlertModal';
import { GoalkeeperPerformanceDashboard } from './components/GoalkeeperPerformanceDashboard';
import { AvatarSelectionModal } from './components/AvatarSelectionModal';
import { ProfilePricingModal } from './components/ProfilePricingModal';
import { CorporatePdfReportModal } from './components/CorporatePdfReportModal';
import { ArenaSubmissionModal } from './components/ArenaSubmissionModal';
import { ArenaModerationModal } from './components/ArenaModerationModal';
import { AdminFinancialModal } from './components/AdminFinancialModal';
import { detectRequestedAdminRoute } from './components/AdminRouteGuard';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PerformanceStats, ReportScope } from './utils/pdfReportGenerator';
import {
  saveOfflineUserProfile,
  saveOfflineMatches,
  getOfflineUserProfile,
  getOfflineMatches,
  processPendingOfflineSync,
  clearLegacyTestCache,
  saveOfflineWeeklyTemplates,
  getOfflineWeeklyTemplates,
  saveOfflineFavoriteGoalkeepers,
  getOfflineFavoriteGoalkeepers,
  saveOfflineArenas,
  getOfflineArenas,
} from './utils/offlineStorage';

export type ThemeMode = 'dark' | 'light';

export default function App() {
  // Navigation & State
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile>(INITIAL_USER);
  const [currentTab, setCurrentTab] = useState<TabType>('home');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('paredaogk-theme') === 'light' ? 'light' : 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    try {
      localStorage.setItem('paredaogk-theme', theme);
    } catch {
      // Ignore storage quota errors
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#020617' : '#f1f5f9');
    }
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Modals
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isIntelligentCallOpen, setIsIntelligentCallOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isFutshopModalOpen, setIsFutshopModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isProfilePricingModalOpen, setIsProfilePricingModalOpen] = useState(false);
  const [isArenaSubmissionOpen, setIsArenaSubmissionOpen] = useState(false);
  const [isArenaModerationOpen, setIsArenaModerationOpen] = useState(false);
  const [isAdminFinancialOpen, setIsAdminFinancialOpen] = useState(false);
  const [pendingWithdrawalsCount, setPendingWithdrawalsCount] = useState(0);
  const [isAuthSessionResolved, setIsAuthSessionResolved] = useState(false);
  const [securityAlertBanner, setSecurityAlertBanner] = useState<string | null>(null);
  const isAdminUser = isAuthorizedAdmin(currentUser);
  const [pdfReportModal, setPdfReportModal] = useState<{
    isOpen: boolean;
    scope: ReportScope;
    selectedMatch?: MatchBooking | null;
    stats?: PerformanceStats;
    walletSummary?: WalletDashboardSummary;
    transactions?: Transaction[];
  }>({
    isOpen: false,
    scope: 'completo',
  });

  // Realtime Goalkeeper Call Alert Modal
  const [realtimeAlertBooking, setRealtimeAlertBooking] = useState<MatchBooking | null>(null);
  const [isCallAlertOpen, setIsCallAlertOpen] = useState(false);

  // Match History & Review Modal
  const [matches, setMatches] = useState<MatchBooking[]>([]);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedMatchForReview, setSelectedMatchForReview] = useState<MatchBooking | null>(null);

  // Active bookings & counts (clean zero starting state)
  const [recentBooking, setRecentBooking] = useState<MatchBooking | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [confirmationBanner, setConfirmationBanner] = useState<string | null>(null);

  // Pelada Recorrente (Modelos Semanais) & Elenco Fixo (Favoritos)
  const [weeklyTemplates, setWeeklyTemplates] = useState<WeeklyMatchTemplate[]>(() => {
    return getOfflineWeeklyTemplates() || [];
  });
  const [favoriteGoalkeeperIds, setFavoriteGoalkeeperIds] = useState<string[]>(() => {
    return getOfflineFavoriteGoalkeepers() || [];
  });
  const [isRetentionSynced, setIsRetentionSynced] = useState(false);
  const [prefillTemplate, setPrefillTemplate] = useState<WeeklyMatchTemplate | null>(null);
  const [prefillGoalkeeper, setPrefillGoalkeeper] = useState<Goalkeeper | null>(null);
  const [prefillArena, setPrefillArena] = useState<ArenaField | null>(null);

  // Base Oficial de Arenas de Itapeva-SP + Submissões Comunitárias
  const [arenas, setArenas] = useState<ArenaField[]>(() => {
    const cached = getOfflineArenas();
    if (!cached || cached.length === 0) return INITIAL_ITAPEVA_ARENAS;
    const map = new Map<string, ArenaField>();
    INITIAL_ITAPEVA_ARENAS.forEach((s) => map.set(s.id, s));
    cached.forEach((c) => map.set(c.id, c));
    return Array.from(map.values());
  });

  // Sincronização automática de sessão com o Supabase e tratamento de redirecionamento de e-mail
  useEffect(() => {
    // Verificar se o usuário acessou via link de confirmação do template Supabase
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      if (
        hash.includes('type=signup') ||
        hash.includes('type=email_confirmation') ||
        search.includes('type=signup') ||
        hash.includes('access_token')
      ) {
        setConfirmationBanner(
          'Conta confirmada com sucesso! O template de ativação do Supabase foi validado e sua conta no ParedãoGK está 100% pronta para uso.'
        );
        setHasCompletedOnboarding(true);
        setIsAuthModalOpen(false);
        // Limpar os parâmetros de hash/token da barra de endereços para segurança e estética
        window.history.replaceState(null, '', window.location.pathname);
      }
    }

    // 1. Limpar preventivamente resíduos legados de teste e carregar dados do armazenamento seguro offline
    clearLegacyTestCache().finally(() => {
      getOfflineUserProfile()
        .then((cachedProfile) => {
          if (cachedProfile) {
            setCurrentUser(cachedProfile);
            setHasCompletedOnboarding(true);
          }
        })
        .finally(() => {
          if (!isSupabaseConfigured) {
            setIsAuthSessionResolved(true);
          }
        });

      getOfflineMatches().then((cachedMatches) => {
        if (cachedMatches && cachedMatches.length > 0) {
          setMatches(cachedMatches);
        }
      });
    });

    if (!isSupabaseConfigured) return;

    // Verificar se já existe uma sessão ativa
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profile) {
            const rawSupabaseRole = String(profile.role || '');
            const hasAdminFlag =
              rawSupabaseRole.trim().toLowerCase() === 'admin' ||
              Boolean(profile.is_admin);
            setCurrentUser((prev) => ({
              ...prev,
              id: profile.id,
              name: profile.name || prev.name,
              nickname: profile.nickname || prev.nickname,
              email: profile.email || session.user.email || prev.email,
              cpf: profile.cpf || prev.cpf,
              phone: profile.phone || prev.phone,
              avatarUrl: profile.avatar_url || prev.avatarUrl,
              role:
                rawSupabaseRole === 'goleiro'
                  ? 'goleiro'
                  : rawSupabaseRole === 'contratante'
                  ? 'contratante'
                  : prev.role,
              supabaseRole: rawSupabaseRole || undefined,
              isAdmin: hasAdminFlag,
              walletBalance: Number(profile.wallet_balance || 0),
              cashbackBalance: Number(profile.cashback_balance || 0),
              matchesPlayed: profile.matches_played || 0,
              cleanSheets: profile.clean_sheets || 0,
              penaltiesSaved: profile.penalties_saved || 0,
              mvpCount: profile.mvp_count || 0,
            }));
            setHasCompletedOnboarding(true);
          } else if (session.user.email) {
            setCurrentUser((prev) => ({
              ...prev,
              id: session.user.id,
              email: session.user.email || prev.email,
            }));
          }
        }
      })
      .finally(() => {
        setIsAuthSessionResolved(true);
      });

    // Ouvir alterações de estado de autenticação (login/logout/confirmação via token)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle()
          .then(({ data: profile }) => {
            if (profile) {
              const rawSupabaseRole = String(profile.role || '');
              const hasAdminFlag =
                rawSupabaseRole.trim().toLowerCase() === 'admin' ||
                Boolean(profile.is_admin);
              setCurrentUser((prev) => ({
                ...prev,
                id: profile.id,
                name: profile.name || session.user?.user_metadata?.name || prev.name,
                nickname: profile.nickname || session.user?.user_metadata?.nickname || prev.nickname,
                email: profile.email || session.user?.email || prev.email,
                cpf: profile.cpf || prev.cpf,
                phone: profile.phone || prev.phone,
                avatarUrl: profile.avatar_url || prev.avatarUrl,
                role:
                  rawSupabaseRole === 'goleiro'
                    ? 'goleiro'
                    : rawSupabaseRole === 'contratante'
                    ? 'contratante'
                    : prev.role,
                supabaseRole: rawSupabaseRole || undefined,
                isAdmin: hasAdminFlag,
                walletBalance: Number(profile.wallet_balance || 0),
                cashbackBalance: Number(profile.cashback_balance || 0),
              }));
              setHasCompletedOnboarding(true);
              setIsAuthModalOpen(false);
            }
          });
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(INITIAL_USER);
        setIsArenaModerationOpen(false);
        setIsAdminFinancialOpen(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Salvar alterações de perfil e partidas no armazenamento offline automaticamente
  useEffect(() => {
    saveOfflineUserProfile(currentUser).catch((e) => console.warn('[Save Offline Profile]', e));
  }, [currentUser]);

  useEffect(() => {
    if (matches && matches.length > 0) {
      saveOfflineMatches(matches).catch((e) => console.warn('[Save Offline Matches]', e));
    }
  }, [matches]);

  useEffect(() => {
    saveOfflineWeeklyTemplates(weeklyTemplates);
    saveOfflineFavoriteGoalkeepers(favoriteGoalkeeperIds);
    syncOrganizerRetentionToSupabase({
      organizerId: currentUser.id,
      weeklyTemplates,
      favoriteGoalkeeperIds,
    }).then(({ synced }) => setIsRetentionSynced(synced));
  }, [weeklyTemplates, favoriteGoalkeeperIds, currentUser.id]);

  // Sincronização de partidas oficiais do usuário direto do Supabase
  useEffect(() => {
    if (!isSupabaseConfigured || !currentUser.id || currentUser.id === 'usr-guest') return;
    fetchMatchesFromSupabase(currentUser.id).then((remoteMatches) => {
      if (remoteMatches.length > 0) {
        setMatches((prev) => {
          const map = new Map<string, MatchBooking>();
          prev.forEach((m) => map.set(m.id, m));
          remoteMatches.forEach((rm) => map.set(rm.id, rm));
          return Array.from(map.values());
        });
      }
    });
  }, [currentUser.id]);

  // Seed e sincronização inicial das Arenas Reais de Itapeva (SP) com Supabase
  useEffect(() => {
    seedAndFetchArenasFromSupabase(INITIAL_ITAPEVA_ARENAS, getOfflineArenas()).then(
      ({ arenas: syncedArenas }) => {
        if (syncedArenas.length > 0) {
          setArenas(syncedArenas);
          saveOfflineArenas(syncedArenas);
        }
      }
    );
  }, []);

  useEffect(() => {
    if (!isAdminUser) {
      setPendingWithdrawalsCount(0);
      return;
    }
    fetchAdminPixWithdrawalsFromSupabase().then(({ withdrawals }) => {
      setPendingWithdrawalsCount(withdrawals.filter((w) => w.status === 'pending').length);
    });
  }, [isAdminUser]);

  const handleUnauthorizedAdminRedirect = (reason?: string) => {
    setIsArenaModerationOpen(false);
    setIsAdminFinancialOpen(false);
    setHasCompletedOnboarding(true);
    setCurrentTab('home');
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/');
    }
    setSecurityAlertBanner(
      reason ||
        'Acesso bloqueado: área restrita exclusivamente ao administrador oficial do ParedãoGK (luizinhoitapevasp@gmail.com) ou perfil com role admin no Supabase. Você foi redirecionado para a página inicial.'
    );
  };

  // Guarda de Rotas Administrativas (URL direta, hash, query string e estado dos modais)
  useEffect(() => {
    if (typeof window === 'undefined' || !isAuthSessionResolved) return;

    const evaluateAdminRouteGuard = () => {
      const requestedAdminRoute = detectRequestedAdminRoute(
        window.location.pathname,
        window.location.hash,
        window.location.search
      );

      if (requestedAdminRoute) {
        if (isAdminUser) {
          setHasCompletedOnboarding(true);
          if (requestedAdminRoute === 'arenas') {
            setIsArenaModerationOpen(true);
          } else {
            setIsAdminFinancialOpen(true);
          }
          window.history.replaceState(null, '', '/');
        } else {
          handleUnauthorizedAdminRedirect(
            'Acesso bloqueado: esta rota administrativa é exclusiva do administrador oficial do ParedãoGK. Você foi redirecionado para a página inicial.'
          );
        }
      }
    };

    evaluateAdminRouteGuard();

    window.addEventListener('popstate', evaluateAdminRouteGuard);
    window.addEventListener('hashchange', evaluateAdminRouteGuard);
    return () => {
      window.removeEventListener('popstate', evaluateAdminRouteGuard);
      window.removeEventListener('hashchange', evaluateAdminRouteGuard);
    };
  }, [isAuthSessionResolved, isAdminUser]);

  // Bloqueio defensivo caso modais admin sejam acionados sem permissão
  useEffect(() => {
    if (!isAuthSessionResolved) return;
    if (!isAdminUser && (isArenaModerationOpen || isAdminFinancialOpen)) {
      handleUnauthorizedAdminRedirect();
    }
  }, [isAuthSessionResolved, isAdminUser, isArenaModerationOpen, isAdminFinancialOpen]);

  useEffect(() => {
    if (arenas.length > 0) {
      saveOfflineArenas(arenas);
    }
  }, [arenas]);

  // Supabase Realtime: Escuta instantânea nas tabelas notifications, matches e canal de broadcast CajuPay
  useEffect(() => {
    const unsubscribeRealtime = subscribeToRealtimeBookingsAndNotifications({
      onNotification: (notification) => {
        setUnreadNotifications((prev) => prev + 1);
      },
      onMatchChange: (matchRecord, eventType) => {
        if (!matchRecord) return;
        setMatches((prev) => {
          const exists = prev.some((m) => m.id === matchRecord.id);
          if (exists) {
            return prev.map((m) => (m.id === matchRecord.id ? { ...m, ...matchRecord } : m));
          }
          return [matchRecord, ...prev];
        });
      },
      onGoalkeeperCallAlert: (callData) => {
        // Formatar objeto de convocação recebido via Realtime
        const formattedBooking: MatchBooking = {
          id: callData.id || `match-rt-${Date.now()}`,
          organizerId: callData.organizerId || callData.organizer_id || '',
          organizerName: callData.organizerName || callData.organizer_name || 'Capitão Organizador',
          goalkeeperId: callData.goalkeeperId || callData.goalkeeper_id || currentUser.id,
          goalkeeperName: callData.goalkeeperName || callData.goalkeeper_name || currentUser.name,
          goalkeeperPhoto:
            callData.goalkeeperPhoto ||
            callData.goalkeeper_photo ||
            '',
          arenaName: callData.arenaName || callData.arena_name || 'Arena Itapeva',
          address: callData.address || 'Itapeva - SP',
          city: callData.city || 'Itapeva - SP',
          date: callData.date || new Date().toLocaleDateString('pt-BR'),
          time: callData.time || '19:30 - 21:00',
          modality: (callData.modality as any) || 'Society',
          competitiveLevel: (callData.competitiveLevel as any) || (callData.competitive_level as any) || 'Competitivo',
          price: Number(callData.price || 25),
          houseFee: Number(callData.houseFee || 5),
          goalkeeperPayout: Number(callData.goalkeeperPayout || Math.max(0, Number(callData.price || 25) - 5)),
          cashbackEarned: Number(callData.cashbackEarned || callData.cashback_earned || 2.5),
          status: 'confirmed',
          createdAt: callData.createdAt || callData.created_at || new Date().toISOString(),
          paymentStatus: 'paid',
          notes: callData.notes || 'Partida confirmada via Radar ParedãoGK Itapeva.',
        };

        setRealtimeAlertBooking(formattedBooking);
        setIsCallAlertOpen(true);
        setUnreadNotifications((prev) => prev + 1);
        setRecentBooking(formattedBooking);

        // Atualizar lista de partidas
        setMatches((prev) => {
          if (prev.some((m) => m.id === formattedBooking.id)) return prev;
          return [formattedBooking, ...prev];
        });
      },
    });

    return () => {
      unsubscribeRealtime();
    };
  }, [currentUser]);

  // Simular evento em tempo real da liquidação do Pix CajuPay (para teste no front-end)
  const handleSimulateRealtimeCall = async () => {
    const sampleCall: MatchBooking = {
      id: `call-pix-${Date.now().toString().slice(-4)}`,
      organizerId: 'org-realtime-test',
      organizerName: 'Capitão Marcos (Tropa do Campinho)',
      goalkeeperId: currentUser.id,
      goalkeeperName: currentUser.name,
      goalkeeperPhoto: currentUser.avatarUrl || '',
      arenaName: 'Arena Belletti Itapeva',
      address: 'R. Benjamin Constant, 990 - Jardim Ferrari, Itapeva - SP',
      city: 'Itapeva - SP',
      date: new Date().toLocaleDateString('pt-BR'),
      time: '20:00 - 21:30',
      modality: 'Society',
      competitiveLevel: 'Competitivo',
      price: 30,
      houseFee: 5,
      goalkeeperPayout: 25,
      pricingTier: 'faixa_3',
      cashbackEarned: 3.0,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      paymentStatus: 'paid',
      notes: 'Uniforme Preto ou Amarelo. Chuteira Society. Pagamento Pix já retido em garantia na CajuPay!',
    };

    // Disparar broadcast em tempo real com áudio de apito
    await broadcastBookingConfirmed(sampleCall);
  };

  // Aceitar convocação e navegar para a aba de chat
  const handleAcceptRealtimeCall = (booking: MatchBooking) => {
    setIsCallAlertOpen(false);
    // Adicionar à conversa
    const newConv: Conversation = {
      id: `conv-${booking.id}`,
      participantId: booking.organizerId || 'org-match',
      participantName: booking.organizerName || 'Contratante',
      participantNickname: 'Capitão da Partida',
      participantRole: 'contratante',
      participantAvatar: '',
      participantRating: 5.0,
      arenaName: booking.arenaName,
      matchDate: booking.date,
      lastMessage: 'Convocação aceita! Goleiro a caminho.',
      lastMessageTime: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      unreadCount: 0,
      messages: [
        {
          id: `msg-${Date.now()}`,
          senderId: currentUser.id,
          text: `Fala parceiro! Convocação aceita para o jogo na ${booking.arenaName} (${booking.time}). Pode contar comigo no gol!`,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          isMine: true,
          status: 'delivered',
        },
      ],
    };
    setConversations((prev) => [newConv, ...prev]);
    setCurrentTab('chat');
  };

  // Direct WhatsApp support trigger
  const handleOpenWhatsApp = () => {
    const text = encodeURIComponent(
      `Olá equipe ParedãoGK! Sou o usuário ${currentUser.name} (${currentUser.role}) e gostaria de tirar uma dúvida sobre a plataforma.`
    );
    window.open(`https://wa.me/5515981596443?text=${text}`, '_blank');
  };

  // Toggle user role between Contratante and Goleiro GK
  const handleToggleRole = () => {
    const nextRole: UserRole = currentUser.role === 'contratante' ? 'goleiro' : 'contratante';
    setCurrentUser((prev) => ({
      ...prev,
      role: nextRole,
      nickname: nextRole === 'goleiro' ? 'Muralha GK' : 'Capitão Oficial',
      height: nextRole === 'goleiro' ? '1.90m' : prev.height,
      dominantFoot: nextRole === 'goleiro' ? 'destro' : prev.dominantFoot,
    }));
  };

  // Handle direct goalkeeper selection from vitrine
  const handleSelectGoalkeeper = (gk: Goalkeeper) => {
    setPrefillArena(null);
    setPrefillTemplate(null);
    setPrefillGoalkeeper(gk);
    setIsIntelligentCallOpen(true);
  };

  // Handle convoking GK directly at an approved arena
  const handleConvokeAtArena = (arena: ArenaField) => {
    setPrefillTemplate(null);
    setPrefillGoalkeeper(null);
    setPrefillArena(arena);
    setIsIntelligentCallOpen(true);
  };

  // Handle community arena submission & admin moderation
  const handleArenaSubmitted = (newArena: ArenaField) => {
    setArenas((prev) => [newArena, ...prev.filter((a) => a.id !== newArena.id)]);
    setUnreadNotifications((prev) => prev + 1);
  };

  const handleArenaModerated = (
    arenaId: string,
    action: 'approve' | 'archive' | 'delete'
  ) => {
    if (action === 'delete') {
      setArenas((prev) => prev.filter((a) => a.id !== arenaId));
      return;
    }
    const nextStatus = action === 'approve' ? 'approved' : 'archived';
    setArenas((prev) =>
      prev.map((a) =>
        a.id === arenaId ? { ...a, status: nextStatus, updatedAt: new Date().toISOString() } : a
      )
    );
    if (action === 'approve') {
      setUnreadNotifications((prev) => prev + 1);
    }
  };

  // Salvar e gerenciar Modelos de Pelada Recorrente & Elenco Fixo
  const handleSaveWeeklyTemplate = (
    tpl: Omit<WeeklyMatchTemplate, 'id' | 'organizerId' | 'createdAt'>
  ) => {
    const newTemplate: WeeklyMatchTemplate = {
      ...tpl,
      id: `tpl-${Date.now().toString().slice(-6)}`,
      organizerId: currentUser.id,
      createdAt: new Date().toISOString(),
    };
    setWeeklyTemplates((prev) => [newTemplate, ...prev]);
  };

  const handleDeleteWeeklyTemplate = (templateId: string) => {
    setWeeklyTemplates((prev) => prev.filter((t) => t.id !== templateId));
  };

  const handleUseWeeklyTemplate = (template: WeeklyMatchTemplate) => {
    setPrefillArena(null);
    setPrefillGoalkeeper(null);
    setPrefillTemplate(template);
    setIsIntelligentCallOpen(true);
  };

  const handleToggleFavoriteGoalkeeper = (gkId: string) => {
    setFavoriteGoalkeeperIds((prev) =>
      prev.includes(gkId) ? prev.filter((id) => id !== gkId) : [...prev, gkId]
    );
  };

  // Atualizar Linha do Tempo de Segurança da Partida (2h, 45m, cancelamento)
  const handleUpdateMatchSafetyStatus = (
    match: MatchBooking,
    updates: {
      checkin2hConfirmed?: boolean;
      enRoute45mConfirmed?: boolean;
      goalkeeperCancelled?: boolean;
    }
  ) => {
    const nowTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const patched: MatchBooking = {
      ...match,
      ...updates,
      checkin2hConfirmedAt: updates.checkin2hConfirmed ? nowTime : match.checkin2hConfirmedAt,
      enRoute45mAt: updates.enRoute45mConfirmed ? nowTime : match.enRoute45mAt,
    };

    setMatches((prev) => prev.map((m) => (m.id === match.id ? patched : m)));
    if (recentBooking?.id === match.id) {
      setRecentBooking(patched);
    }

    if (updates.goalkeeperCancelled) {
      setUnreadNotifications((prev) => prev + 1);
    }

    updateMatchSafetyTimeline({ match, ...updates }).catch((err) =>
      console.warn('[Safety Timeline Sync]', err)
    );
  };

  // Sistema de Alerta SOS (Substituição Relâmpago)
  const handleTriggerSos = async (
    match: MatchBooking,
    radiusKm: number,
    urgencyBonus: number
  ) => {
    const result = await triggerSosSubstitution({
      match,
      organizer: currentUser,
      radiusKm,
      urgencyBonus,
    });

    const nowTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const sosUpdatedMatch: MatchBooking = {
      ...match,
      status: 'searching',
      sosTriggered: true,
      sosTriggeredAt: nowTime,
      sosBonus: urgencyBonus,
      sosRadiusKm: radiusKm,
      sosNotifiedCount: result.notifiedGoalkeepers.length,
      price: match.price + urgencyBonus,
      houseFee: match.houseFee ?? 5,
      goalkeeperPayout: Math.max(0, match.price + urgencyBonus - (match.houseFee ?? 5)),
    };

    setMatches((prev) => prev.map((m) => (m.id === match.id ? sosUpdatedMatch : m)));
    if (recentBooking?.id === match.id) {
      setRecentBooking(sosUpdatedMatch);
    }
    setUnreadNotifications((prev) => prev + 1);

    return result;
  };

  // Reconvocar goleiro para a próxima semana a partir de uma partida concluída
  const handleReinviteNextWeek = async (match: MatchBooking) => {
    const { newBooking } = await reinviteGoalkeeperNextWeek({
      sourceMatch: match,
      organizer: currentUser,
      favoriteGoalkeeperIds,
    });

    setMatches((prev) => [newBooking, ...prev]);
    setRecentBooking(newBooking);
    setUnreadNotifications((prev) => prev + 1);
  };

  // Handle booking confirmed
  const handleBookingConfirmed = (booking: MatchBooking) => {
    setRecentBooking(booking);
    setUnreadNotifications((prev) => prev + 1);
    setCurrentUser((prev) => ({
      ...prev,
      walletBalance: Math.max(0, prev.walletBalance - booking.price),
      cashbackBalance: prev.cashbackBalance + booking.cashbackEarned,
      matchesPlayed: prev.matchesPlayed + 1,
    }));

    // Create real match conversation thread for this booking
    const newConv: Conversation = {
      id: `conv-${booking.id}`,
      participantId: booking.goalkeeperId || 'gk-match',
      participantName: booking.goalkeeperName || 'Goleiro Convocado',
      participantNickname: 'Goleiro Escalado',
      participantRole: 'goleiro',
      participantAvatar: booking.goalkeeperPhoto || '',
      participantRating: 4.95,
      arenaName: booking.arenaName,
      matchDate: `${booking.date}`,
      lastMessage: 'Convocação confirmada! Canal de alinhamento pré-jogo aberto.',
      lastMessageTime: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      unreadCount: 0,
      messages: [
        {
          id: `msg-sys-${Date.now()}`,
          senderId: 'system',
          text: `Partida confirmada na ${booking.arenaName} (${booking.date}). Canal liberado para alinhamento de uniforme e horário de chegada.`,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          isMine: false,
          status: 'read'
        }
      ]
    };
    setConversations((prev) => [newConv, ...prev]);
    setMatches((prev) => [booking, ...prev]);
  };

  // Abrir modal de avaliação pós-jogo
  const handleOpenReviewModal = (booking: MatchBooking) => {
    setSelectedMatchForReview(booking);
    setIsReviewModalOpen(true);
  };

  // Salvar Feedback Pós-Partida AI diretamente no estado das partidas + cache offline
  const handleSaveMatchAiFeedback = (bookingId: string, feedback: PostMatchAiFeedbackResult) => {
    setMatches((prev) =>
      prev.map((m) => (m.id === bookingId ? { ...m, aiFeedback: feedback } : m))
    );
    if (recentBooking && recentBooking.id === bookingId) {
      setRecentBooking((prev) => (prev ? { ...prev, aiFeedback: feedback } : null));
    }
  };

  // Sucesso na avaliação pós-jogo (salva no Supabase e atualiza estados locais)
  const handleReviewSuccess = (
    bookingId: string,
    rating: number,
    comment: string,
    tags: string[],
    isMvp: boolean,
    extras?: {
      cleanSheetConfirmed?: boolean;
      penaltiesSaved?: number;
      aiFeedback?: PostMatchAiFeedbackResult | null;
    }
  ) => {
    const today = new Date().toLocaleDateString('pt-BR');

    // 1. Atualizar histórico geral de partidas
    setMatches((prev) =>
      prev.map((m) =>
        m.id === bookingId
          ? {
              ...m,
              status: 'completed',
              ratingGiven: rating,
              reviewComment: comment,
              reviewTags: tags,
              mvpGiven: isMvp,
              cleanSheetGiven: extras?.cleanSheetConfirmed ?? m.cleanSheetGiven,
              penaltiesSavedGiven: extras?.penaltiesSaved ?? m.penaltiesSavedGiven,
              aiFeedback: extras?.aiFeedback ?? m.aiFeedback,
              reviewedAt: today,
            }
          : m
      )
    );

    // 2. Atualizar banner de partida recente
    if (recentBooking && recentBooking.id === bookingId) {
      setRecentBooking((prev) =>
        prev
          ? {
              ...prev,
              status: 'completed',
              ratingGiven: rating,
              reviewComment: comment,
              reviewTags: tags,
              mvpGiven: isMvp,
              cleanSheetGiven: extras?.cleanSheetConfirmed ?? prev.cleanSheetGiven,
              penaltiesSavedGiven: extras?.penaltiesSaved ?? prev.penaltiesSavedGiven,
              aiFeedback: extras?.aiFeedback ?? prev.aiFeedback,
              reviewedAt: today,
            }
          : null
      );
    }

    // 3. Notificar o usuário com alerta de sucesso
    setUnreadNotifications((prev) => prev + 1);
  };

  // Handle sending real messages in conversation
  const handleSendMessage = (conversationId: string, text: string, type: 'text' | 'location' = 'text') => {
    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderId: currentUser.id,
      text: text,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      isMine: true,
      status: 'delivered',
      type: type,
    };

    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              lastMessage: type === 'location' ? '📍 Localização confirmada' : text,
              lastMessageTime: newMessage.timestamp,
              messages: [...c.messages, newMessage],
            }
          : c
      )
    );
  };

  // Handle wallet balance update
  const handleUpdateBalance = (newBalance: number, newCashback: number) => {
    setCurrentUser((prev) => ({
      ...prev,
      walletBalance: newBalance,
      cashbackBalance: newCashback,
    }));
  };

  // Handle Futshop purchase
  const handlePurchaseSuccess = (amount: number, cashbackEarned: number) => {
    setCurrentUser((prev) => ({
      ...prev,
      walletBalance: Math.max(0, prev.walletBalance - amount),
      cashbackBalance: prev.cashbackBalance + cashbackEarned,
    }));
    setUnreadNotifications((prev) => prev + 1);
  };

  // Handle Avatar Update (Save local + offline + Supabase profile)
  const handleSaveAvatar = (newAvatarUrl: string) => {
    setCurrentUser((prev) => {
      const updated = { ...prev, avatarUrl: newAvatarUrl };
      saveOfflineUserProfile(updated);
      return updated;
    });

    if (isSupabaseConfigured && currentUser.id) {
      supabase
        .from('profiles')
        .update({ avatar_url: newAvatarUrl })
        .eq('id', currentUser.id)
        .then(({ error }) => {
          if (error) {
            console.warn('[Supabase Avatar Update]:', error.message);
          }
        });
    }
    setIsAvatarModalOpen(false);
  };

  // Handle Profile & Preferred Cachê AI update
  const handleSaveProfilePricing = (updates: Partial<UserProfile>) => {
    setCurrentUser((prev) => {
      const updated = { ...prev, ...updates };
      saveOfflineUserProfile(updated);
      return updated;
    });
  };

  // Handle Logout (reset to onboarding / auth)
  const handleLogout = () => {
    if (isSupabaseConfigured) {
      supabase.auth.signOut().catch((err) => console.warn('[Supabase SignOut]', err));
    }
    setHasCompletedOnboarding(false);
    setIsAuthModalOpen(true);
  };

  // 1. Show Onboarding Flow if not completed
  if (!hasCompletedOnboarding) {
    return (
      <OnboardingCarousel
        onComplete={() => {
          setHasCompletedOnboarding(true);
          setIsAuthModalOpen(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-[#020617] dark:text-slate-100 flex flex-col selection:bg-emerald-500/30 selection:text-emerald-700 dark:selection:text-emerald-300 transition-colors duration-200">
      {/* Top Application Bar */}
      <TopHeader
        user={currentUser}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenDrawer={() => setIsDrawerOpen(true)}
        onOpenAvatarModal={() => setIsAvatarModalOpen(true)}
        onToggleRole={handleToggleRole}
        onOpenWhatsApp={handleOpenWhatsApp}
      />

      {/* Security Access Denied Banner */}
      {securityAlertBanner && (
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 pt-4">
          <div
            role="alert"
            className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-500/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-red-800 dark:text-red-200 shadow-lg shadow-red-500/10"
          >
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 font-extrabold">
                !
              </div>
              <div>
                <span className="font-bold text-red-900 dark:text-white block">
                  Acesso Administrativo Restrito
                </span>
                <span className="text-red-700 dark:text-red-300">{securityAlertBanner}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSecurityAlertBanner(null)}
              className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-800 dark:text-red-200 font-semibold cursor-pointer transition-colors self-end sm:self-center shrink-0"
            >
              Entendi
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Success Banner */}
      {confirmationBanner && (
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 pt-4">
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/40 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 shadow-lg shadow-emerald-500/10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 font-bold">
                ✓
              </div>
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">Ativação de Conta Concluída!</span>
                <span className="text-slate-600 dark:text-slate-300">{confirmationBanner}</span>
              </div>
            </div>
            <button
              onClick={() => setConfirmationBanner(null)}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-semibold cursor-pointer transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 pt-5">
        {currentTab === 'home' && (
          <HomeTab
            user={currentUser}
            matches={matches}
            arenas={arenas}
            weeklyTemplates={weeklyTemplates}
            favoriteGoalkeeperIds={favoriteGoalkeeperIds}
            isRetentionSynced={isRetentionSynced}
            onOpenIntelligentCall={() => {
              setPrefillArena(null);
              setPrefillTemplate(null);
              setPrefillGoalkeeper(null);
              setIsIntelligentCallOpen(true);
            }}
            onConvokeAtArena={handleConvokeAtArena}
            onOpenSubmitArena={() => setIsArenaSubmissionOpen(true)}
            onOpenArenaModeration={isAdminUser ? () => setIsArenaModerationOpen(true) : undefined}
            onSelectGoalkeeper={handleSelectGoalkeeper}
            onOpenWhatsApp={handleOpenWhatsApp}
            onOpenFutshop={() => setIsFutshopModalOpen(true)}
            recentBooking={recentBooking}
            onOpenReviewModal={handleOpenReviewModal}
            onOpenHistory={() => setIsHistoryModalOpen(true)}
            onOpenPerformance={() => setCurrentTab('performance')}
            onOpenAuth={() => setIsAuthModalOpen(true)}
            onSaveWeeklyTemplate={handleSaveWeeklyTemplate}
            onDeleteWeeklyTemplate={handleDeleteWeeklyTemplate}
            onUseWeeklyTemplate={handleUseWeeklyTemplate}
            onToggleFavoriteGoalkeeper={handleToggleFavoriteGoalkeeper}
            onUpdateMatchSafetyStatus={handleUpdateMatchSafetyStatus}
            onTriggerSos={handleTriggerSos}
            onReinviteNextWeek={handleReinviteNextWeek}
          />
        )}

        {currentTab === 'chat' && (
          <ChatTab
            user={currentUser}
            conversations={conversations}
            onSendMessage={handleSendMessage}
            onOpenWhatsApp={handleOpenWhatsApp}
            onOpenRadar={() => setIsIntelligentCallOpen(true)}
          />
        )}

        {currentTab === 'performance' && (
          <div className="pb-24">
            <GoalkeeperPerformanceDashboard
              user={currentUser}
              matches={matches}
              onOpenHistory={() => setIsHistoryModalOpen(true)}
              onOpenAuth={() => setIsAuthModalOpen(true)}
              onOpenPdfReport={({ scope, stats }) =>
                setPdfReportModal({
                  isOpen: true,
                  scope,
                  stats,
                  transactions: [],
                })
              }
              theme={theme}
            />
          </div>
        )}

        {currentTab === 'notifications' && (
          <NotificationsTab
            userId={currentUser.id}
            onNavigateTab={(tab) => setCurrentTab(tab)}
          />
        )}

        {currentTab === 'wallet' && (
          <WalletTab
            user={currentUser}
            matches={matches}
            theme={theme}
            onUpdateBalance={handleUpdateBalance}
            onOpenProfilePricing={() => setIsProfilePricingModalOpen(true)}
            onOpenAdminFinancial={isAdminUser ? () => setIsAdminFinancialOpen(true) : undefined}
            onOpenPdfReport={({ scope, walletSummary, transactions }) =>
              setPdfReportModal({
                isOpen: true,
                scope,
                walletSummary,
                transactions,
              })
            }
          />
        )}
      </main>

      {/* Fixed Ergonomic Bottom Tab Bar */}
      <BottomNavigation
        currentTab={currentTab}
        onChangeTab={(tab) => {
          setCurrentTab(tab);
          if (tab === 'chat') setUnreadMessages(0);
          if (tab === 'notifications') setUnreadNotifications(0);
        }}
        unreadMessagesCount={unreadMessages}
        unreadNotificationsCount={unreadNotifications}
        userRole={currentUser.role}
      />

      {/* Profile & Navigation Drawer Menu */}
      <DrawerMenu
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        user={currentUser}
        onToggleRole={handleToggleRole}
        onOpenAvatarModal={() => setIsAvatarModalOpen(true)}
        onOpenProfilePricing={() => setIsProfilePricingModalOpen(true)}
        onOpenWallet={() => setCurrentTab('wallet')}
        onOpenPerformance={() => setCurrentTab('performance')}
        onOpenPdfReport={() =>
          setPdfReportModal({
            isOpen: true,
            scope: 'completo',
            transactions: [],
          })
        }
        onOpenSubmitArena={() => setIsArenaSubmissionOpen(true)}
        onOpenArenaModeration={isAdminUser ? () => setIsArenaModerationOpen(true) : undefined}
        pendingArenasCount={isAdminUser ? arenas.filter((a) => a.status === 'pending').length : 0}
        onOpenAdminFinancial={isAdminUser ? () => setIsAdminFinancialOpen(true) : undefined}
        pendingWithdrawalsCount={isAdminUser ? pendingWithdrawalsCount : 0}
        onOpenHistory={() => setIsHistoryModalOpen(true)}
        onOpenFutshop={() => setIsFutshopModalOpen(true)}
        onOpenHelp={() => setIsHelpModalOpen(true)}
        onOpenTerms={() => setIsTermsModalOpen(true)}
        onOpenWhatsApp={handleOpenWhatsApp}
        onLogout={handleLogout}
      />

      {/* Avatar Selection & Upload Modal */}
      <AvatarSelectionModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        currentAvatar={currentUser.avatarUrl}
        userName={currentUser.name}
        userRole={currentUser.role}
        onSaveAvatar={handleSaveAvatar}
      />

      {/* Profile Settings & Cachê AI Pricing Modal */}
      <ProfilePricingModal
        isOpen={isProfilePricingModalOpen}
        onClose={() => setIsProfilePricingModalOpen(false)}
        user={currentUser}
        onSaveProfile={handleSaveProfilePricing}
        onOpenAvatarModal={() => setIsAvatarModalOpen(true)}
      />

      {/* Arena Submission Modal (Status automático: pending) */}
      <ArenaSubmissionModal
        isOpen={isArenaSubmissionOpen}
        onClose={() => setIsArenaSubmissionOpen(false)}
        user={currentUser}
        onArenaSubmitted={handleArenaSubmitted}
      />

      {/* Restricted Admin Moderation Modal (Aprovar / Arquivar / Excluir) */}
      <ArenaModerationModal
        isOpen={isArenaModerationOpen}
        onClose={() => setIsArenaModerationOpen(false)}
        user={currentUser}
        arenas={arenas}
        onArenaModerated={handleArenaModerated}
        onUnauthorizedRedirect={handleUnauthorizedAdminRedirect}
      />

      {/* Restricted Admin Financial Console (Saques Pix CajuPay & Webhooks HMAC-SHA256) */}
      <AdminFinancialModal
        isOpen={isAdminFinancialOpen}
        onClose={() => setIsAdminFinancialOpen(false)}
        user={currentUser}
        onWithdrawalsCountChange={(count) => setPendingWithdrawalsCount(count)}
        onUnauthorizedRedirect={handleUnauthorizedAdminRedirect}
      />

      {/* Intelligent GK Radar Matchmaking Modal */}
      <IntelligentCallModal
        isOpen={isIntelligentCallOpen}
        onClose={() => {
          setIsIntelligentCallOpen(false);
          setPrefillArena(null);
          setPrefillTemplate(null);
          setPrefillGoalkeeper(null);
        }}
        onBookingConfirmed={handleBookingConfirmed}
        user={currentUser}
        prefillArena={prefillArena}
        prefillTemplate={prefillTemplate}
        prefillGoalkeeper={prefillGoalkeeper}
        approvedArenas={arenas.filter((a) => a.status === 'approved')}
        onOpenAuth={() => setIsAuthModalOpen(true)}
      />

      {/* Match History Modal */}
      <MatchHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        onOpenChat={() => setCurrentTab('chat')}
        currentUser={currentUser}
        matches={matches}
        onOpenReview={handleOpenReviewModal}
        onSaveAiFeedback={handleSaveMatchAiFeedback}
        onReinviteNextWeek={handleReinviteNextWeek}
        onQuickTriggerSos={(match) => {
          handleTriggerSos(match, 10, 15);
          setCurrentTab('home');
        }}
        onOpenPdfReport={({ scope, selectedMatch }) =>
          setPdfReportModal({
            isOpen: true,
            scope,
            selectedMatch,
            transactions: [],
          })
        }
      />

      {/* Corporate PDF & Print Report Modal */}
      <CorporatePdfReportModal
        isOpen={pdfReportModal.isOpen}
        onClose={() => setPdfReportModal((prev) => ({ ...prev, isOpen: false }))}
        user={currentUser}
        matches={matches}
        stats={pdfReportModal.stats}
        walletSummary={pdfReportModal.walletSummary}
        transactions={pdfReportModal.transactions ?? []}
        selectedMatch={pdfReportModal.selectedMatch}
        initialScope={pdfReportModal.scope}
      />

      {/* Post Match Review Modal (Salva pontuação no Supabase e atualiza perfil) */}
      <PostMatchReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        booking={selectedMatchForReview}
        currentUser={currentUser}
        onReviewSuccess={handleReviewSuccess}
      />

      {/* Futshop Modal */}
      <FutshopModal
        isOpen={isFutshopModalOpen}
        onClose={() => setIsFutshopModalOpen(false)}
        user={currentUser}
        onPurchaseSuccess={handlePurchaseSuccess}
      />

      {/* Help & FAQ Modal */}
      <HelpFaqModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        onOpenWhatsApp={handleOpenWhatsApp}
      />

      {/* Terms of Use Modal */}
      <TermsModal
        isOpen={isTermsModalOpen}
        onClose={() => setIsTermsModalOpen(false)}
      />

      {/* Authentication & Registration Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={(user) => {
          setCurrentUser(user);
          setIsAuthModalOpen(false);
        }}
        initialRole={currentUser.role}
      />

      {/* Pop-up de Convocação Instantânea via Supabase Realtime (CajuPay Pix Liquidado) */}
      <GoalkeeperCallAlertModal
        isOpen={isCallAlertOpen}
        onClose={() => setIsCallAlertOpen(false)}
        booking={realtimeAlertBooking}
        onAcceptAndOpen={handleAcceptRealtimeCall}
        onOpenWhatsApp={handleOpenWhatsApp}
      />

      {/* Indicador Visual Discreto de Conectividade PWA (Online / Offline & Auto-Sync) */}
      <OfflineIndicator />

      {/* Botão Flutuante de Teste Realtime (Apenas em ambiente de desenvolvimento / validação) */}
      <div className="fixed bottom-20 right-4 z-40 hidden sm:block">
        <button
          type="button"
          onClick={handleSimulateRealtimeCall}
          title="Disparar Convocação Realtime simulada com apito"
          className="group flex items-center gap-2 px-3 py-2 rounded-xl bg-white/95 dark:bg-slate-900/90 hover:bg-emerald-50 dark:hover:bg-emerald-950 border border-emerald-500/50 hover:border-emerald-500 dark:hover:border-emerald-400 text-xs font-mono text-emerald-700 dark:text-emerald-400 shadow-xl shadow-slate-900/10 dark:shadow-black/60 backdrop-blur-md transition-all cursor-pointer hover:scale-105 active:scale-95"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-ping" />
          <span>⚡ Testar Alerta Realtime</span>
        </button>
      </div>
    </div>
  );
}
