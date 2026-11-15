import { createClient } from '@supabase/supabase-js';
import {
  MatchBooking,
  WeeklyMatchTemplate,
  UserProfile,
  Transaction,
  WalletDashboardSummary,
  PostMatchAiFeedbackResult,
  ArenaField,
  ArenaModerationStatus,
  ArenaSurfaceType,
  ModalityType,
  NotificationItem,
  AdminPixWithdrawal,
  AdminPixWithdrawalStatus,
  MercadoPagoWebhookConfig,
  MercadoPagoWebhookEventType,
  MercadoPagoWebhookLog,
} from '../types';
import { evaluateGoalkeeperArenaProximity, normalizeSearchText } from '../utils/arenaProximitySearch';
import { classifyGoalkeeperTier, getMatchGoalkeeperNetPayout, getTierByTotalPrice, ITAPEVA_HOUSE_FEE } from '../utils/cachePricingAI';
import { validateCPF } from '../utils/validations';
import {
  getOfflineAdminWithdrawals,
  saveOfflineAdminWithdrawals,
  getOfflineWebhookConfig,
  saveOfflineWebhookConfig,
  getOfflineWebhookLogs,
  saveOfflineWebhookLogs,
} from '../utils/offlineStorage';

/**
 * Inicialização do cliente Supabase para o ParedãoGK
 * Utiliza as variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('your-project') &&
  !supabaseUrl.includes('placeholder')
);

// Fallback seguro de execução caso as credenciais reais ainda não tenham sido configuradas no .env
const clientUrl = isSupabaseConfigured ? supabaseUrl : 'https://paredaogk-project.supabase.co';
const clientKey = isSupabaseConfigured
  ? supabaseAnonKey
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcmVkYW9nayIsInJvbGUiOiJhbW9uIiwiaWF0IjoxNjQxOTQwNDAwLCJleHAiOjE5NTczMDA0MDB9.placeholder';

export const supabase = createClient(clientUrl, clientKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Retorna a URL base de redirecionamento dinâmico para a confirmação de e-mail e templates do Supabase.
 * Garante que {{ .ConfirmationURL }} no template aponte com precisão para o applet em qualquer ambiente.
 */
export function getAuthRedirectUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return import.meta.env.VITE_APP_URL || 'http://localhost:3000';
}

/**
 * Valida rigorosamente a resposta HTTP antes de executar o parse JSON,
 * prevenindo erros como "Unexpected end of JSON input" quando o endpoint
 * retorna corpo vazio, HTML de fallback ou erro de gateway.
 */
export async function safeParseJsonResponse<T = any>(
  response: Response,
  contextLabel = 'API Mercado Pago'
): Promise<{
  valid: boolean;
  data: T | null;
  rawText: string;
  errorMessage?: string;
}> {
  let rawText = '';
  try {
    rawText = await response.text();
  } catch (err: any) {
    return {
      valid: false,
      data: null,
      rawText: '',
      errorMessage: `Não foi possível ler a resposta de ${contextLabel}: ${err?.message || 'erro de leitura'}.`,
    };
  }

  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      valid: false,
      data: null,
      rawText: '',
      errorMessage: `${contextLabel} retornou uma resposta vazia (HTTP ${response.status}).`,
    };
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const isHtmlFallback =
    contentType.includes('text/html') ||
    trimmed.startsWith('<!') ||
    trimmed.toLowerCase().startsWith('<html');

  if (isHtmlFallback) {
    return {
      valid: false,
      data: null,
      rawText: trimmed.slice(0, 200),
      errorMessage: `${contextLabel} respondeu HTML em vez de JSON (HTTP ${response.status}). Verifique o roteamento /api/*.`,
    };
  }

  const looksLikeJson =
    contentType.includes('application/json') ||
    contentType.includes('+json') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[');

  if (!looksLikeJson) {
    return {
      valid: false,
      data: null,
      rawText: trimmed.slice(0, 200),
      errorMessage: `${contextLabel} retornou conteúdo inválido não-JSON (HTTP ${response.status}).`,
    };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== 'object') {
      return {
        valid: false,
        data: null,
        rawText: trimmed.slice(0, 200),
        errorMessage: `${contextLabel} retornou JSON com estrutura inesperada.`,
      };
    }
    return {
      valid: true,
      data: parsed as T,
      rawText: trimmed,
    };
  } catch {
    return {
      valid: false,
      data: null,
      rawText: trimmed.slice(0, 200),
      errorMessage: `Resposta JSON malformada recebida de ${contextLabel} (HTTP ${response.status}).`,
    };
  }
}

/**
 * Dispara requisição para a rota de e-mail de boas-vindas
 */
export async function sendWelcomeEmailNotification(payload: {
  email: string;
  name: string;
  role: 'contratante' | 'goleiro';
  nickname?: string;
}) {
  try {
    const res = await fetch('/api/auth/send-welcome-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const parsed = await safeParseJsonResponse(res, 'Serviço de E-mail');
    if (!parsed.valid || !parsed.data) {
      return { success: false, error: parsed.errorMessage || 'Resposta inválida do serviço de e-mail' };
    }
    return parsed.data;
  } catch (error) {
    console.warn('[ParedãoGK Email Notification warning]', error);
    return { success: false, error: 'Falha ao notificar serviço de e-mail' };
  }
}

function mapProfileRowToUserProfile(
  row: any,
  authUser: { id: string; email?: string | null; user_metadata?: Record<string, any> },
  fallbackRole: 'contratante' | 'goleiro' = 'contratante'
): UserProfile {
  const rawRole = String(row?.role || authUser.user_metadata?.role || fallbackRole);
  const uiRole: 'contratante' | 'goleiro' = rawRole === 'goleiro' ? 'goleiro' : 'contratante';
  const resolvedEmail = String(row?.email || authUser.email || '').trim();

  return {
    id: String(row?.id || authUser.id),
    name: row?.name || authUser.user_metadata?.name || resolvedEmail.split('@')[0] || 'Atleta ParedãoGK',
    nickname: row?.nickname || authUser.user_metadata?.nickname || 'Itapeva',
    cpf: row?.cpf || authUser.user_metadata?.formatted_cpf || authUser.user_metadata?.cpf || '',
    isCpfVerified: Boolean(row?.is_cpf_verified ?? row?.cpf ?? authUser.user_metadata?.cpf),
    email: resolvedEmail,
    phone: row?.phone || authUser.user_metadata?.phone || '',
    birthDate: row?.birth_date || authUser.user_metadata?.birth_date || '',
    age: Number(row?.age || authUser.user_metadata?.age || 18),
    role: uiRole,
    supabaseRole: rawRole,
    isAdmin: resolvedEmail.toLowerCase() === 'luizinhoitapevasp@gmail.com',
    avatarUrl: row?.avatar_url || '',
    rating: Number(row?.rating ?? 5.0),
    matchesPlayed: Number(row?.matches_played ?? 0),
    cleanSheets: Number(row?.clean_sheets ?? 0),
    penaltiesSaved: Number(row?.penalties_saved ?? 0),
    mvpCount: Number(row?.mvp_count ?? 0),
    city: row?.city || 'Itapeva - SP',
    neighborhood: row?.neighborhood || 'Centro',
    height: row?.height || authUser.user_metadata?.height || undefined,
    dominantFoot: row?.dominant_foot || authUser.user_metadata?.dominant_foot || undefined,
    categories: row?.categories || authUser.user_metadata?.categories || undefined,
    favoriteGloves: row?.favorite_gloves || authUser.user_metadata?.favorite_gloves || undefined,
    preferredCache: Number(row?.preferred_cache ?? 20),
    technicalLevel: row?.technical_level || 'Iniciante',
    pricingTier: row?.pricing_tier || 'faixa_1',
    walletBalance: Number(row?.wallet_balance ?? 0),
    pendingBalance: Number(row?.pending_balance ?? 0),
    cashbackBalance: Number(row?.cashback_balance ?? 0),
    isEliteMember: Boolean(row?.is_elite_member),
    createdAt: row?.created_at || new Date().toISOString(),
  };
}

/**
 * Garante leitura e gravação real do perfil do usuário autenticado na tabela 'profiles' do Supabase.
 */
export async function fetchOrCreateSupabaseProfile(params: {
  authUser: { id: string; email?: string | null; user_metadata?: Record<string, any> };
  fallbackRole?: 'contratante' | 'goleiro';
}): Promise<UserProfile> {
  const { authUser, fallbackRole = 'contratante' } = params;
  const meta = authUser.user_metadata || {};

  const { data: existingProfile, error: selectErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  if (selectErr) {
    console.warn('[Supabase Profile Read Warning]', selectErr.message);
  }

  if (existingProfile) {
    return mapProfileRowToUserProfile(existingProfile, authUser, fallbackRole);
  }

  const rawRole = String(meta.role || fallbackRole);
  const newProfileRow = {
    id: authUser.id,
    name: meta.name || authUser.email?.split('@')[0] || 'Atleta ParedãoGK',
    nickname: meta.nickname || 'Itapeva',
    cpf: meta.formatted_cpf || meta.cpf || '',
    is_cpf_verified: Boolean(meta.cpf),
    email: (authUser.email || '').trim(),
    phone: meta.phone || '',
    birth_date: meta.birth_date || '',
    age: Number(meta.age || 18),
    role: rawRole === 'goleiro' ? 'goleiro' : 'contratante',
    avatar_url: '',
    rating: 5.0,
    matches_played: 0,
    clean_sheets: 0,
    penalties_saved: 0,
    mvp_count: 0,
    city: 'Itapeva - SP',
    neighborhood: 'Centro',
    height: rawRole === 'goleiro' ? meta.height || '1.88m' : null,
    dominant_foot: rawRole === 'goleiro' ? meta.dominant_foot || 'destro' : null,
    categories: rawRole === 'goleiro' ? meta.categories || ['society', 'futsal'] : null,
    favorite_gloves: rawRole === 'goleiro' ? meta.favorite_gloves || null : null,
    preferred_cache: 20,
    technical_level: 'Iniciante',
    wallet_balance: 0.0,
    pending_balance: 0.0,
    cashback_balance: 0.0,
    is_elite_member: false,
    created_at: new Date().toISOString(),
  };

  const { data: insertedProfile, error: upsertErr } = await supabase
    .from('profiles')
    .upsert(newProfileRow, { onConflict: 'id' })
    .select('*')
    .maybeSingle();

  if (upsertErr) {
    console.warn('[Supabase Profile Upsert Warning]', upsertErr.message);
  }

  return mapProfileRowToUserProfile(insertedProfile || newProfileRow, authUser, fallbackRole);
}

/**
 * Salva a avaliação pós-jogo na tabela 'match_reviews' do Supabase
 * e atualiza a média e histórico no perfil do goleiro ('profiles')
 */
export async function submitGoalkeeperReview(review: {
  bookingId: string;
  contractorId: string;
  contractorName: string;
  goalkeeperId: string;
  goalkeeperName: string;
  rating: number; // 1 to 5 estrelas
  comment: string;
  tags?: string[];
  cleanSheetConfirmed?: boolean;
  penaltiesSaved?: number;
  isMvp?: boolean;
}) {
  const reviewId = `rev-${Date.now()}`;
  const reviewRecord = {
    id: reviewId,
    booking_id: review.bookingId,
    contractor_id: review.contractorId,
    contractor_name: review.contractorName,
    goalkeeper_id: review.goalkeeperId,
    goalkeeper_name: review.goalkeeperName,
    rating: review.rating,
    comment: review.comment,
    tags: review.tags || [],
    clean_sheet: Boolean(review.cleanSheetConfirmed),
    penalties_saved: Number(review.penaltiesSaved || 0),
    is_mvp: Boolean(review.isMvp),
    created_at: new Date().toISOString(),
  };

  let updatedStats: {
    newRating: number;
    newMatches: number;
    newCleanSheets: number;
    newPenaltiesSaved: number;
    newMvpCount: number;
  } | null = null;

  if (isSupabaseConfigured) {
    try {
      // 1. Gravar a avaliação na tabela match_reviews
      const { error: reviewError } = await supabase
        .from('match_reviews')
        .insert([reviewRecord]);

      if (reviewError) {
        console.warn('[Supabase match_reviews insert note]', reviewError.message);
      }

      // 2. Buscar dados atuais do goleiro para recálculo da média
      const { data: gkProfile, error: profileFetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', review.goalkeeperId)
        .maybeSingle();

      if (!profileFetchError && gkProfile) {
        const prevRating = Number(gkProfile.rating || 5.0);
        const prevMatches = Number(gkProfile.matches_played || 0);
        const calculatedRating = Number(((prevRating * prevMatches + review.rating) / (prevMatches + 1)).toFixed(2));
        const calculatedMatches = prevMatches + 1;
        const calculatedCleanSheets = Number(gkProfile.clean_sheets || 0) + (review.cleanSheetConfirmed ? 1 : 0);
        const calculatedPenalties = Number(gkProfile.penalties_saved || 0) + (review.penaltiesSaved || 0);
        const calculatedMvp = Number(gkProfile.mvp_count || 0) + (review.isMvp ? 1 : 0);

        updatedStats = {
          newRating: calculatedRating,
          newMatches: calculatedMatches,
          newCleanSheets: calculatedCleanSheets,
          newPenaltiesSaved: calculatedPenalties,
          newMvpCount: calculatedMvp,
        };

        // 3. Atualizar o perfil do jogador no Supabase de forma resiliente
        const { error: updateProfileErr } = await resilientClientProfileUpdate(review.goalkeeperId, {
          rating: calculatedRating,
          matches_played: calculatedMatches,
          clean_sheets: calculatedCleanSheets,
          penalties_saved: calculatedPenalties,
          mvp_count: calculatedMvp,
        });

        if (updateProfileErr) {
          console.warn('[Supabase update profile error]', updateProfileErr.message);
        }
      }
    } catch (err) {
      console.error('[Supabase Review Submission Error]', err);
    }
  }

  return {
    success: true,
    review: reviewRecord,
    updatedStats,
  };
}

/**
 * Busca estatísticas detalhadas e histórico de avaliações do goleiro no Supabase
 */
export async function fetchGoalkeeperPerformanceMetrics(goalkeeperId: string) {
  if (!isSupabaseConfigured) {
    return null;
  }

  try {
    // 1. Dados do perfil
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', goalkeeperId)
      .maybeSingle();

    // 2. Histórico de avaliações recebidas
    const { data: reviews } = await supabase
      .from('match_reviews')
      .select('*')
      .eq('goalkeeper_id', goalkeeperId)
      .order('created_at', { ascending: false });

    // 3. Partidas vinculadas
    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .eq('goalkeeper_id', goalkeeperId)
      .order('date', { ascending: false });

    return {
      profile,
      reviews: reviews || [],
      matches: matches || [],
    };
  } catch (err) {
    console.warn('[Supabase fetchGoalkeeperPerformanceMetrics]', err);
    return null;
  }
}

export interface SmartFilterCriteria {
  region: string; // 'todos' | 'centro' | 'jardim_ferrari' | 'distrito_industrial' | 'vila_aparecida' | 'recanto_pilao' | 'jardim_europa'
  technicalLevel: string; // 'todos' | 'elite' | 'avancado' | 'recreativo'
  timeSlot: string; // 'todos' | 'manha' | 'tarde' | 'noite' | 'hoje_online'
  maxDistanceKm: number; // 5, 10, 15, 25, 50
  modality?: string; // 'todos' | 'society' | 'fut7' | 'campo' | 'futsal'
  searchQuery?: string;
  arenaQuery?: string; // Busca por nome de arena ou proximidade de endereço via lista de partidas
}

export interface GoalkeepersQueryResult {
  goalkeepers: any[];
  realCount: number;
  totalRealInDb: number;
  isSupabaseConfigured: boolean;
}

function filterGoalkeepersInMemory(
  list: any[],
  filters: SmartFilterCriteria,
  matches: MatchBooking[] = []
): any[] {
  const filtered = list.filter((gk) => {
    // 1. Região / Bairro de Itapeva (SP)
    if (filters.region !== 'todos') {
      const textToSearch = normalizeSearchText(`${gk.neighborhood || ''} ${gk.city || ''} ${gk.nickname || ''}`);
      if (filters.region === 'centro' && !textToSearch.includes('centro')) {
        return false;
      }
      if (
        filters.region === 'jardim_ferrari' &&
        !textToSearch.includes('ferrari') &&
        !textToSearch.includes('belletti')
      ) {
        return false;
      }
      if (
        filters.region === 'distrito_industrial' &&
        !textToSearch.includes('distrito') &&
        !textToSearch.includes('industrial') &&
        !textToSearch.includes('jades')
      ) {
        return false;
      }
      if (
        filters.region === 'vila_aparecida' &&
        !textToSearch.includes('aparecida') &&
        !textToSearch.includes('vila')
      ) {
        return false;
      }
      if (
        filters.region === 'recanto_pilao' &&
        !textToSearch.includes('pilao') &&
        !textToSearch.includes('recanto')
      ) {
        return false;
      }
      if (
        filters.region === 'jardim_europa' &&
        !textToSearch.includes('europa') &&
        !textToSearch.includes('maringa')
      ) {
        return false;
      }
    }

    // 2. Nível Técnico (Elite/Avançado Faixa 3, Intermediário Faixa 2, Iniciante Faixa 1)
    if (filters.technicalLevel === 'elite') {
      const isElite = gk.level === 'Profissional / Base' || gk.rating > 4.9;
      if (!isElite) return false;
    } else if (filters.technicalLevel === 'avancado') {
      const isAvancado = gk.level === 'Avançado' || gk.rating >= 4.8;
      if (!isAvancado) return false;
    } else if (filters.technicalLevel === 'recreativo') {
      const isRecreativo = gk.level === 'Intermediário' || gk.level === 'Iniciante' || gk.rating <= 4.9;
      if (!isRecreativo) return false;
    }

    // 3. Horário Disponível / Hoje
    if (filters.timeSlot === 'hoje_online' && !gk.availableToday) {
      return false;
    }

    // 4. Distância Máxima em km
    if (gk.distanceKm && gk.distanceKm > filters.maxDistanceKm) {
      return false;
    }

    // 5. Modalidade (Society, Fut7, Campo 11, Futsal)
    if (filters.modality && filters.modality !== 'todos') {
      const hasModality = gk.modalities?.some((m: string) =>
        m.toLowerCase().includes(filters.modality!.toLowerCase())
      );
      if (!hasModality) return false;
    }

    // 6. Busca de texto (Search query)
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const query = normalizeSearchText(filters.searchQuery);
      const matchName = normalizeSearchText(gk.name).includes(query);
      const matchNickname = normalizeSearchText(gk.nickname).includes(query);
      const matchNeighborhood = normalizeSearchText(gk.neighborhood).includes(query);
      if (!matchName && !matchNickname && !matchNeighborhood) return false;
    }

    // 7. Busca por nome de arena ou proximidade de endereço via lista de partidas
    if (filters.arenaQuery && filters.arenaQuery.trim()) {
      const evalResult = evaluateGoalkeeperArenaProximity(gk, filters.arenaQuery, matches);
      if (!evalResult.matched) return false;
    }

    return true;
  });

  if (filters.arenaQuery && filters.arenaQuery.trim()) {
    return [...filtered].sort((a, b) => {
      const scoreA = evaluateGoalkeeperArenaProximity(a, filters.arenaQuery!, matches).score;
      const scoreB = evaluateGoalkeeperArenaProximity(b, filters.arenaQuery!, matches).score;
      return scoreB - scoreA;
    });
  }

  return filtered;
}

/**
 * Consulta oficial de goleiros exclusivamente na tabela 'profiles' do Supabase.
 * Sem dados fictícios/mocks embutidos: quando vazio, retorna lista vazia para renderização do Empty State.
 */
export async function queryGoalkeepersSmart(
  filters: SmartFilterCriteria,
  matches: MatchBooking[] = []
): Promise<GoalkeepersQueryResult> {
  try {
    let dbGoalkeepers: any[] = [];

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'goleiro')
        .order('rating', { ascending: false });

      if (!error && data && data.length > 0) {
        dbGoalkeepers = data.map((p) => {
          const parsedRating = Number(p.rating || 5.0);
          const parsedMatches = Number(p.matches_played || 0);
          const autoTier = classifyGoalkeeperTier({
            rating: parsedRating,
            matchesPlayed: parsedMatches,
            technicalLevel: p.technical_level,
          });
          const pinnedValidPrice =
            p.preferred_cache && [20, 25, 30].includes(Number(p.preferred_cache))
              ? Number(p.preferred_cache)
              : autoTier.totalPrice;
          const mappedLevel =
            autoTier.tierCode === 'faixa_3'
              ? 'Profissional / Base'
              : autoTier.tierCode === 'faixa_2'
              ? 'Intermediário'
              : 'Iniciante';

          const rawCats = Array.isArray(p.categories) ? p.categories : [];
          const normalizedModalities =
            rawCats.length > 0
              ? rawCats.map((c: string) =>
                  c === 'campo'
                    ? 'Campo 11'
                    : c.charAt(0).toUpperCase() + c.slice(1)
                )
              : ['Society', 'Fut7', 'Futsal', 'Campo 11'];

          return {
            id: p.id,
            name: p.name || 'Goleiro GK',
            nickname: p.nickname || 'Paredão',
            photo: p.avatar_url || '',
            rating: parsedRating,
            reviewsCount: Number(p.reviews_count ?? parsedMatches),
            matchesPlayed: parsedMatches,
            cleanSheets: Number(p.clean_sheets || 0),
            penaltiesSaved: Number(p.penalties_saved || 0),
            pricePerMatch: pinnedValidPrice,
            distanceKm: Number(p.distance_km ?? 3.0),
            neighborhood: p.neighborhood || 'Centro',
            city: p.city || 'Itapeva - SP',
            height: p.height || '1.85m',
            dominantFoot: p.dominant_foot || 'destro',
            modalities: normalizedModalities,
            availableToday: p.available_today !== false,
            responseTimeMinutes: Number(p.response_time_minutes ?? 5),
            badges: [
              'Verificado Itapeva',
              `${autoTier.shortLabel} · R$ ${pinnedValidPrice}`,
            ],
            bio:
              p.bio ||
              `Goleiro oficial cadastrado na rede ParedãoGK (${p.city || 'Itapeva - SP'}).`,
            favoriteBrand: p.favorite_gloves || 'Luva Profissional',
            level: mappedLevel as any,
          };
        });
      }
    }

    const filteredDb = filterGoalkeepersInMemory(dbGoalkeepers, filters, matches);

    return {
      goalkeepers: filteredDb,
      realCount: filteredDb.length,
      totalRealInDb: dbGoalkeepers.length,
      isSupabaseConfigured,
    };
  } catch (err) {
    console.warn('[queryGoalkeepersSmart Error]', err);
    return {
      goalkeepers: [],
      realCount: 0,
      totalRealInDb: 0,
      isSupabaseConfigured,
    };
  }
}

/**
 * Consulta a lista de goleiros no Supabase aplicando os Smart Search Filters
 */
export async function queryGoalkeepersFromSupabase(
  filters: SmartFilterCriteria,
  matches: MatchBooking[] = []
): Promise<any[]> {
  const { goalkeepers } = await queryGoalkeepersSmart(filters, matches);
  return goalkeepers;
}

export interface RankedGoalkeeper {
  id: string;
  name: string;
  nickname: string;
  avatarUrl: string;
  rating: number;
  matchesPlayed: number;
  savesEstimated: number;
  cleanSheets: number;
  penaltiesSaved: number;
  mvpCount: number;
  neighborhood: string;
  weightedScore: number;
  badge: 'ouro' | 'prata' | 'bronze' | 'elite';
  isCurrentUser?: boolean;
}

/**
 * Busca e calcula o Ranking de Elite Semanal exclusivamente a partir das tabelas profiles e match_reviews do Supabase.
 * Retorna lista vazia quando ainda não existem goleiros cadastrados no banco oficial.
 */
export async function fetchWeeklyGoalkeeperRanking(currentUserId?: string): Promise<RankedGoalkeeper[]> {
  try {
    if (!isSupabaseConfigured) {
      return [];
    }

    const [profilesRes, reviewsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .eq('role', 'goleiro')
        .order('rating', { ascending: false })
        .limit(20),
      supabase
        .from('match_reviews')
        .select('goalkeeper_id, rating, clean_sheet, penalties_saved, is_mvp')
        .limit(200),
    ]);

    const rawProfiles = !profilesRes.error && profilesRes.data ? profilesRes.data : [];
    if (rawProfiles.length === 0) {
      return [];
    }

    const reviewAggregates = new Map<
      string,
      { count: number; sumRating: number; cleanSheets: number; penalties: number; mvps: number }
    >();

    if (!reviewsRes.error && reviewsRes.data) {
      reviewsRes.data.forEach((rev: any) => {
        if (!rev.goalkeeper_id) return;
        const curr = reviewAggregates.get(rev.goalkeeper_id) || {
          count: 0,
          sumRating: 0,
          cleanSheets: 0,
          penalties: 0,
          mvps: 0,
        };
        curr.count += 1;
        curr.sumRating += Number(rev.rating || 5);
        if (rev.clean_sheet) curr.cleanSheets += 1;
        curr.penalties += Number(rev.penalties_saved || 0);
        if (rev.is_mvp) curr.mvps += 1;
        reviewAggregates.set(rev.goalkeeper_id, curr);
      });
    }

    const ranked: RankedGoalkeeper[] = rawProfiles.map((p) => {
      const agg = reviewAggregates.get(p.id);
      const matchesPlayed = Math.max(Number(p.matches_played || 0), agg?.count || 0);
      const rating =
        agg && agg.count > 0
          ? Number((agg.sumRating / agg.count).toFixed(2))
          : Number(p.rating || 5.0);
      const cleanSheets = Math.max(Number(p.clean_sheets || 0), agg?.cleanSheets || 0);
      const penaltiesSaved = Math.max(Number(p.penalties_saved || 0), agg?.penalties || 0);
      const mvpCount = Math.max(Number(p.mvp_count || 0), agg?.mvps || 0);
      const savesEstimated = Number(p.saves_count ?? matchesPlayed * 5);

      const score = Math.round(
        rating * 35 +
          savesEstimated * 2.5 +
          cleanSheets * 12 +
          penaltiesSaved * 18 +
          mvpCount * 15
      );

      return {
        id: p.id,
        name: p.name || 'Goleiro GK',
        nickname: p.nickname || 'Muralha',
        avatarUrl: p.avatar_url || '',
        rating,
        matchesPlayed,
        savesEstimated,
        cleanSheets,
        penaltiesSaved,
        mvpCount,
        neighborhood: `${p.neighborhood || 'Centro'} (${p.city || 'Itapeva - SP'})`,
        weightedScore: score,
        badge: 'elite' as 'ouro' | 'prata' | 'bronze' | 'elite',
        isCurrentUser: currentUserId === p.id,
      };
    });

    ranked.sort((a, b) => b.weightedScore - a.weightedScore);

    if (ranked[0]) ranked[0].badge = 'ouro';
    if (ranked[1]) ranked[1].badge = 'prata';
    if (ranked[2]) ranked[2].badge = 'bronze';

    return ranked;
  } catch (err) {
    console.warn('[Weekly Ranking Fetch Error]', err);
    return [];
  }
}


/**
 * Síntese de áudio nativa (Web Audio API) para apito de alerta de convocação
 * Funciona sem dependência de rede ou arquivos mp3 externos
 */
export function playWhistleNotification() {
  try {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Primeiro tom (880Hz - Lá5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    gain1.gain.setValueAtTime(0.25, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.18);

    // Segundo tom (1174.66Hz - Ré6) - Tom triunfal de notificação
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.12);
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.38);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.38);
  } catch (audioErr) {
    console.warn('[Audio Alert Notice]', audioErr);
  }
}

/**
 * Configura a escuta em tempo real (Supabase Realtime) nas tabelas 'notifications' e 'matches',
 * além do canal de broadcast direto para liquidação instantânea via Mercado Pago.
 */
export function subscribeToRealtimeBookingsAndNotifications(callbacks: {
  onNotification: (newRecord: any) => void;
  onMatchChange: (matchRecord: any, eventType: string) => void;
  onGoalkeeperCallAlert: (callData: any) => void;
}) {
  const channel = supabase.channel('paredaogk-realtime-matches');

  // 1. Escuta em tempo real na tabela 'notifications'
  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'notifications' },
    (payload) => {
      console.log('[Supabase Realtime Notifications]', payload);
      callbacks.onNotification(payload.new);
      playWhistleNotification();
    }
  );

  // 2. Escuta em tempo real na tabela 'matches'
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'matches' },
    (payload) => {
      console.log('[Supabase Realtime Matches]', payload);
      const newRec = payload.new as Record<string, any> | undefined;
      callbacks.onMatchChange(newRec, payload.eventType);
      if (newRec && (newRec.status === 'confirmed' || newRec.status === 'in_progress')) {
        callbacks.onGoalkeeperCallAlert(newRec);
        playWhistleNotification();
      }
    }
  );

  // 3. Canal de Broadcast imediato para liquidação de pagamento Mercado Pago Pix
  channel.on(
    'broadcast',
    { event: 'mercadopago_payment_liquidated' },
    ({ payload }) => {
      console.log('[Supabase Realtime Broadcast: Mercado Pago Liquidado]', payload);
      callbacks.onGoalkeeperCallAlert(payload);
      playWhistleNotification();
    }
  );

  // 4. Canal de Broadcast para Alerta SOS (Substituição Relâmpago) e Reconvocação Prioritária
  channel.on(
    'broadcast',
    { event: 'sos_goalkeeper_alert' },
    ({ payload }) => {
      console.log('[Supabase Realtime Broadcast: SOS Substituição Relâmpago]', payload);
      callbacks.onGoalkeeperCallAlert(payload);
      playWhistleNotification();
    }
  );

  channel.on(
    'broadcast',
    { event: 'weekly_reinvite_alert' },
    ({ payload }) => {
      console.log('[Supabase Realtime Broadcast: Reconvocação Semanal]', payload);
      callbacks.onGoalkeeperCallAlert(payload);
      playWhistleNotification();
    }
  );

  channel.subscribe((status) => {
    console.log(`[Supabase Realtime Channel Status: ${status}]`);
  });

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Dispara o evento de liquidação e confirmação de convocação para o canal Realtime
 */
export async function broadcastBookingConfirmed(booking: any) {
  try {
    const channel = supabase.channel('paredaogk-realtime-matches');
    await channel.send({
      type: 'broadcast',
      event: 'mercadopago_payment_liquidated',
      payload: booking,
    });

    // Se o Supabase estiver com credenciais ativas, grava também nas tabelas matches e notifications
    if (isSupabaseConfigured) {
      await supabase.from('matches').upsert([
        {
          id: booking.id,
          organizer_id: booking.organizerId || 'usr-contratante',
          organizer_name: booking.organizerName || 'Contratante',
          goalkeeper_id: booking.goalkeeperId || null,
          goalkeeper_name: booking.goalkeeperName || 'Goleiro GK',
          arena_name: booking.arenaName,
          date: booking.date,
          time: booking.time,
          modality: booking.modality,
          price: booking.price,
          status: 'confirmed',
          payment_provider: 'mercadopago',
          payment_status: 'paid',
          created_at: new Date().toISOString(),
        },
      ]);

      if (booking.goalkeeperId) {
        await supabase.from('notifications').insert([
          {
            id: `notif-${Date.now()}`,
            title: '🚨 Nova Convocação Confirmada via Pix!',
            description: `Partida confirmada na ${booking.arenaName} (${booking.date} às ${booking.time}). Cachê de R$ ${booking.price?.toFixed(2)} liquidado via Mercado Pago.`,
            user_id: booking.goalkeeperId,
            category: 'match',
            created_at: new Date().toISOString(),
          },
        ]);
      }
    }
  } catch (err) {
    console.warn('[Broadcast booking warning]', err);
  }
}

/**
 * Sincroniza modelos semanais de pelada e elenco fixo (favoritos) na tabela 'profiles' do Supabase
 */
export async function syncOrganizerRetentionToSupabase(params: {
  organizerId: string;
  weeklyTemplates: WeeklyMatchTemplate[];
  favoriteGoalkeeperIds: string[];
}): Promise<{ synced: boolean }> {
  if (!isSupabaseConfigured || !params.organizerId) {
    return { synced: false };
  }

  try {
    const { error } = await resilientClientProfileUpdate(params.organizerId, {
      weekly_templates: params.weeklyTemplates,
      favorite_goalkeepers: params.favoriteGoalkeeperIds,
    });

    if (error) {
      console.warn('[Supabase syncOrganizerRetention note]', error.message);
      return { synced: false };
    }
    return { synced: true };
  } catch (err) {
    console.warn('[Supabase syncOrganizerRetention error]', err);
    return { synced: false };
  }
}

/**
 * Reconvoca o goleiro da partida (ou favoritos do Elenco Fixo) para a próxima semana
 * sincronizando com as tabelas 'matches' e 'notifications' do Supabase.
 */
export async function reinviteGoalkeeperNextWeek(params: {
  sourceMatch: MatchBooking;
  organizer: UserProfile;
  favoriteGoalkeeperIds: string[];
  targetGoalkeeper?: { id: string; name: string; photo?: string };
}): Promise<{ newBooking: MatchBooking; syncedToSupabase: boolean }> {
  const nextWeekDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR');
  const targetGkId = params.targetGoalkeeper?.id || params.sourceMatch.goalkeeperId || params.favoriteGoalkeeperIds[0] || '';
  const targetGkName = params.targetGoalkeeper?.name || params.sourceMatch.goalkeeperName || 'Goleiro Favorito';
  const targetGkPhoto = params.targetGoalkeeper?.photo || params.sourceMatch.goalkeeperPhoto;

  const tier = getTierByTotalPrice(params.sourceMatch.price);
  const effectivePrice = Number(params.sourceMatch.price || tier.totalPrice);
  const newBooking: MatchBooking = {
    id: `mtch-wk-${Date.now().toString().slice(-6)}`,
    organizerId: params.organizer.id,
    organizerName: params.organizer.name,
    goalkeeperId: targetGkId,
    goalkeeperName: targetGkName,
    goalkeeperPhoto: targetGkPhoto,
    arenaName: params.sourceMatch.arenaName,
    address: params.sourceMatch.address,
    city: params.sourceMatch.city || 'Itapeva - SP',
    date: `Próx. Semana (${nextWeekDate})`,
    time: params.sourceMatch.time,
    modality: params.sourceMatch.modality,
    price: effectivePrice,
    houseFee: params.sourceMatch.houseFee ?? ITAPEVA_HOUSE_FEE,
    goalkeeperPayout: Math.max(0, effectivePrice - (params.sourceMatch.houseFee ?? ITAPEVA_HOUSE_FEE)),
    pricingTier: params.sourceMatch.pricingTier ?? tier.tierCode,
    cashbackEarned: Number((effectivePrice * 0.1).toFixed(2)),
    status: 'confirmed',
    competitiveLevel: params.sourceMatch.competitiveLevel,
    paymentStatus: 'paid',
    createdAt: new Date().toISOString(),
    notes: `Reconvocação Semanal Prioritária · ${params.sourceMatch.notes || 'Elenco Fixo ParedãoGK'}`,
    checkin2hConfirmed: false,
    enRoute45mConfirmed: false,
    isWeeklyRecurrence: true,
    priorityGoalkeeperId: targetGkId,
  };

  let syncedToSupabase = false;

  try {
    const channel = supabase.channel('paredaogk-realtime-matches');
    await channel.send({
      type: 'broadcast',
      event: 'weekly_reinvite_alert',
      payload: newBooking,
    });

    if (isSupabaseConfigured) {
      const { error: matchErr } = await supabase.from('matches').upsert([
        {
          id: newBooking.id,
          organizer_id: newBooking.organizerId,
          organizer_name: newBooking.organizerName,
          goalkeeper_id: newBooking.goalkeeperId || null,
          goalkeeper_name: newBooking.goalkeeperName,
          arena_name: newBooking.arenaName,
          date: newBooking.date,
          time: newBooking.time,
          modality: newBooking.modality,
          price: newBooking.price,
          status: 'confirmed',
          payment_provider: 'mercadopago',
          payment_status: 'paid',
          created_at: newBooking.createdAt,
        },
      ]);

      const priorityList = Array.from(
        new Set([targetGkId, ...params.favoriteGoalkeeperIds].filter(Boolean))
      ).slice(0, 4);
      const notificationsPayload = priorityList.map((gkId, idx) => ({
        id: `notif-wk-${Date.now()}-${idx}`,
        title:
          idx === 0
            ? '⭐ Convite Prioritário: Reconvocação Semanal!'
            : '🧤 Convite Backup: Elenco Fixo da Pelada',
        description: `${params.organizer.name} convidou você para repetir a pelada na ${newBooking.arenaName} (${newBooking.date} · ${newBooking.time}). Cachê de R$ ${newBooking.price.toFixed(2)}.`,
        user_id: gkId,
        category: 'match',
        created_at: new Date().toISOString(),
      }));

      let notifErr: any = null;
      if (notificationsPayload.length > 0) {
        const res = await supabase.from('notifications').insert(notificationsPayload);
        notifErr = res.error;
      }
      syncedToSupabase = !matchErr && !notifErr;
    }
  } catch (err) {
    console.warn('[reinviteGoalkeeperNextWeek warning]', err);
  }

  playWhistleNotification();
  return { newBooking, syncedToSupabase };
}

/**
 * Atualiza a linha do tempo de segurança da partida confirmada (Check-in 2h, A caminho 45min ou Cancelamento)
 * na tabela 'matches' e registra aviso em 'notifications' se necessário.
 */
export async function updateMatchSafetyTimeline(params: {
  match: MatchBooking;
  checkin2hConfirmed?: boolean;
  enRoute45mConfirmed?: boolean;
  goalkeeperCancelled?: boolean;
}): Promise<{ synced: boolean }> {
  if (!isSupabaseConfigured) {
    return { synced: false };
  }

  try {
    const updatePayload: Record<string, any> = {};
    if (typeof params.checkin2hConfirmed === 'boolean') {
      updatePayload.checkin_2h_confirmed = params.checkin2hConfirmed;
    }
    if (typeof params.enRoute45mConfirmed === 'boolean') {
      updatePayload.en_route_45m_confirmed = params.enRoute45mConfirmed;
    }
    if (typeof params.goalkeeperCancelled === 'boolean') {
      updatePayload.goalkeeper_cancelled = params.goalkeeperCancelled;
      if (params.goalkeeperCancelled) {
        updatePayload.status = 'searching';
      }
    }

    const { error } = await supabase
      .from('matches')
      .update(updatePayload)
      .eq('id', params.match.id);

    if (params.goalkeeperCancelled) {
      await supabase.from('notifications').insert([
        {
          id: `notif-cancel-${Date.now()}`,
          title: '⚠️ Goleiro não confirmou / cancelou presença',
          description: `A partida na ${params.match.arenaName} (${params.match.time}) precisa de atenção. Acione o SOS para substituição relâmpago.`,
          user_id: params.match.organizerId,
          category: 'match',
          created_at: new Date().toISOString(),
        },
      ]);
    }

    return { synced: !error };
  } catch (err) {
    console.warn('[updateMatchSafetyTimeline warning]', err);
    return { synced: false };
  }
}

/**
 * Sistema de Alerta SOS (Substituição Relâmpago):
 * Consulta goleiros disponíveis num raio de km próximo à arena na tabela 'profiles',
 * atualiza 'matches' com o bônus de urgência e dispara alertas prioritários em 'notifications' + Realtime.
 */
export async function triggerSosSubstitution(params: {
  match: MatchBooking;
  organizer: UserProfile;
  radiusKm: number;
  urgencyBonus: number;
}): Promise<{
  notifiedGoalkeepers: { id: string; name: string; distanceKm: number }[];
  syncedToSupabase: boolean;
}> {
  let candidates: { id: string; name: string; distanceKm: number }[] = [];

  try {
    if (isSupabaseConfigured) {
      const { data: profilesData, error } = await supabase
        .from('profiles')
        .select('id, name, nickname, neighborhood, city, distance_km')
        .eq('role', 'goleiro')
        .limit(20);

      if (!error && profilesData && profilesData.length > 0) {
        candidates = profilesData
          .filter((p) => p.id !== params.match.goalkeeperId)
          .map((p, idx) => ({
            id: p.id,
            name: p.name || p.nickname || 'Goleiro GK',
            distanceKm: Number(p.distance_km ?? (2.1 + idx * 1.4).toFixed(1)),
          }))
          .filter((c) => c.distanceKm <= params.radiusKm);
      }
    }

    candidates.sort((a, b) => a.distanceKm - b.distanceKm);

    const sosPayload = {
      ...params.match,
      status: 'searching',
      sosTriggered: true,
      sosBonus: params.urgencyBonus,
      sosRadiusKm: params.radiusKm,
      price: params.match.price + params.urgencyBonus,
      notes: `🚨 ALERTA SOS SUBSTITUIÇÃO RELÂMPAGO (+R$ ${params.urgencyBonus.toFixed(2)} Bônus Urgência) · Raio ${params.radiusKm}km`,
    };

    const channel = supabase.channel('paredaogk-realtime-matches');
    await channel.send({
      type: 'broadcast',
      event: 'sos_goalkeeper_alert',
      payload: sosPayload,
    });

    let syncedToSupabase = false;
    if (isSupabaseConfigured) {
      const { error: matchErr } = await supabase
        .from('matches')
        .update({
          status: 'searching',
          price: params.match.price + params.urgencyBonus,
        })
        .eq('id', params.match.id);

      const notifRows = candidates.slice(0, 6).map((gk, idx) => ({
        id: `notif-sos-${Date.now()}-${idx}`,
        title: `🚨 SOS RELÂMPAGO (+R$ ${params.urgencyBonus} Bônus)!`,
        description: `Substituição urgente na ${params.match.arenaName} (${params.match.address}) às ${params.match.time}. Cachê total: R$ ${(params.match.price + params.urgencyBonus).toFixed(2)}.`,
        user_id: gk.id,
        category: 'radar',
        created_at: new Date().toISOString(),
      }));

      const { error: notifErr } = await supabase.from('notifications').insert(notifRows);
      syncedToSupabase = !matchErr && !notifErr;
    }

    playWhistleNotification();
    return {
      notifiedGoalkeepers: candidates,
      syncedToSupabase,
    };
  } catch (err) {
    console.warn('[triggerSosSubstitution warning]', err);
    return {
      notifiedGoalkeepers: candidates,
      syncedToSupabase: false,
    };
  }
}

/**
 * Busca dados completos da carteira e Dashboard de Ganhos nas tabelas do Supabase:
 * 'profiles' (saldos), 'wallet_transactions' (saques Pix Mercado Pago, depósitos e cashbacks) e 'matches'.
 */
export async function fetchWalletDashboardFromSupabase(params: {
  user: UserProfile;
  localMatches: MatchBooking[];
  localTransactions: Transaction[];
}): Promise<WalletDashboardSummary> {
  const { user, localMatches, localTransactions } = params;

  let walletBalance = user.walletBalance;
  let pendingCustodyBalance = user.pendingBalance;
  let cashbackBalance = user.cashbackBalance;
  let dbTransactions: Transaction[] = [...localTransactions];
  let syncedFromSupabase = false;

  if (isSupabaseConfigured && user.id) {
    try {
      const [profileRes, txRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('wallet_balance, pending_balance, cashback_balance')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('wallet_transactions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (!profileRes.error && profileRes.data) {
        walletBalance = Number(profileRes.data.wallet_balance ?? walletBalance);
        pendingCustodyBalance = Number(profileRes.data.pending_balance ?? pendingCustodyBalance);
        cashbackBalance = Number(profileRes.data.cashback_balance ?? cashbackBalance);
        syncedFromSupabase = true;
      }

      if (!txRes.error && txRes.data && txRes.data.length > 0) {
        const mappedTx: Transaction[] = txRes.data.map((row: any) => ({
          id: row.id,
          type: row.type || 'match_cache',
          amount: Number(row.amount || 0),
          description: row.description || 'Movimentação Carteira ParedãoGK',
          date: row.created_at
            ? new Date(row.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
            : 'Recente',
          status: row.status || 'completed',
          pixKey: row.pix_key,
          pixKeyType: row.pix_key_type,
          receiptCode: row.receipt_code || `MP-${String(row.id).slice(-6).toUpperCase()}`,
          provider: row.provider || 'mercadopago',
          matchId: row.match_id,
          arenaName: row.arena_name,
        }));

        // Mesclar transações do Supabase com eventuais itens locais ainda não sincronizados
        const merged = [...mappedTx];
        localTransactions.forEach((lt) => {
          if (!merged.some((mt) => mt.id === lt.id)) {
            merged.push(lt);
          }
        });
        dbTransactions = merged;
        syncedFromSupabase = true;
      }
    } catch (err) {
      console.warn('[Supabase fetchWalletDashboardFromSupabase warning]', err);
    }
  }

  // Calcular saldo em custódia e ganhos por partida combinando partidas + transações
  const completedMatches = localMatches.filter((m) => m.status === 'completed');
  const activeEscrowMatches = localMatches.filter(
    (m) => m.status === 'confirmed' || m.status === 'searching' || m.status === 'in_progress'
  );

  const matchCacheTxTotal = dbTransactions
    .filter((t) => t.type === 'match_cache' && t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  const completedMatchesEarnings = completedMatches.reduce(
    (sum, m) => sum + getMatchGoalkeeperNetPayout(m),
    0
  );
  const totalMatchEarnings = Math.max(matchCacheTxTotal, completedMatchesEarnings);

  const escrowFromMatches = activeEscrowMatches.reduce(
    (sum, m) => sum + getMatchGoalkeeperNetPayout(m),
    0
  );
  const effectiveCustody = pendingCustodyBalance > 0 ? pendingCustodyBalance : escrowFromMatches;

  const cashbackFromMatches = localMatches.reduce((sum, m) => sum + Number(m.cashbackEarned || 0), 0);
  const cashbackFromTx = dbTransactions
    .filter((t) => t.type === 'cashback_credit' && t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);
  const effectiveCashback = Math.max(cashbackBalance, cashbackFromTx, cashbackFromMatches);

  const totalPixWithdrawn = dbTransactions
    .filter((t) => t.type === 'pix_out')
    .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);

  return {
    walletBalance,
    pendingCustodyBalance: effectiveCustody,
    cashbackBalance: effectiveCashback,
    totalMatchEarnings,
    totalPixWithdrawn,
    transactions: dbTransactions,
    syncedFromSupabase,
  };
}

function extractClientMissingColumn(error: any): string | null {
  const msg = String(error?.message || error?.details || error?.hint || '');
  if (!msg) return null;
  const pgrstMatch = msg.match(/Could not find the '([^']+)' column of/i);
  if (pgrstMatch?.[1]) return pgrstMatch[1];
  const pgMatch = msg.match(/column "?([a-zA-Z0-9_]+)"? (?:of relation "[^"]+" )?does not exist/i);
  if (pgMatch?.[1]) return pgMatch[1];
  return null;
}

async function resilientClientUpsert(
  table: string,
  row: Record<string, any>,
  onConflict = 'id'
): Promise<{ error: any }> {
  const payload: Record<string, any> = { ...row };
  for (let attempt = 0; attempt < 8; attempt++) {
    const { error } = await supabase.from(table).upsert([payload], { onConflict });
    if (!error) return { error: null };
    const missingCol = extractClientMissingColumn(error);
    if (missingCol && Object.prototype.hasOwnProperty.call(payload, missingCol)) {
      delete payload[missingCol];
      continue;
    }
    return { error };
  }
  return { error: new Error(`Falha ao gravar em ${table}`) };
}

async function resilientClientProfileUpdate(
  userId: string,
  updates: Record<string, any>
): Promise<{ error: any }> {
  const payload: Record<string, any> = { ...updates };
  for (let attempt = 0; attempt < 6; attempt++) {
    if (Object.keys(payload).length === 0) {
      return { error: new Error('Nenhuma coluna válida para atualizar perfil') };
    }
    const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
    if (!error) return { error: null };
    const missingCol = extractClientMissingColumn(error);
    if (missingCol && Object.prototype.hasOwnProperty.call(payload, missingCol)) {
      delete payload[missingCol];
      continue;
    }
    return { error };
  }
  return { error: new Error('Falha ao atualizar saldo do perfil') };
}

/**
 * Grava uma nova transação (saque Pix Mercado Pago, depósito, cachê ou cashback) na tabela
 * 'wallet_transactions' e atualiza os saldos em 'profiles' no Supabase sem falhar por colunas opcionais.
 */
export async function recordWalletTransactionInSupabase(params: {
  userId: string;
  transaction: Transaction;
  newWalletBalance: number;
  newCashbackBalance?: number;
}): Promise<{ synced: boolean }> {
  if (!isSupabaseConfigured || !params.userId || params.userId === 'usr-guest') {
    return { synced: false };
  }

  try {
    const { error: txErr } = await resilientClientUpsert('wallet_transactions', {
      id: params.transaction.id,
      user_id: params.userId,
      type: params.transaction.type,
      amount: params.transaction.amount,
      description: params.transaction.description,
      status: params.transaction.status,
      pix_key: params.transaction.pixKey || null,
      pix_key_type: params.transaction.pixKeyType || null,
      receipt_code: params.transaction.receiptCode,
      provider: params.transaction.provider || 'mercadopago',
      match_id: params.transaction.matchId || null,
      arena_name: params.transaction.arenaName || null,
      created_at: new Date().toISOString(),
    });

    const profileUpdate: Record<string, any> = {
      wallet_balance: params.newWalletBalance,
    };
    if (typeof params.newCashbackBalance === 'number') {
      profileUpdate.cashback_balance = params.newCashbackBalance;
    }

    const { error: profErr } = await resilientClientProfileUpdate(params.userId, profileUpdate);

    return { synced: !txErr && !profErr };
  } catch (err) {
    console.warn('[Supabase recordWalletTransactionInSupabase warning]', err);
    return { synced: false };
  }
}

export interface MercadoPagoPixChargeResponse {
  success: boolean;
  provider: 'mercadopago' | 'mercadopago-sandbox';
  id: string;
  status: string;
  amount: number;
  houseFee: number;
  goalkeeperNet: number;
  qrCodeText: string;
  qrCodeBase64: string | null;
  ticketUrl?: string | null;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string | null;
      ticket_url?: string | null;
    };
  };
  payer?: {
    email?: string;
    first_name?: string;
    last_name?: string;
    hasCpf?: boolean;
  };
  expiresAt: string;
  idempotencyKey?: string;
  publicKeyConfigured?: boolean;
  accessTokenConfigured?: boolean;
  note?: string;
  error?: string;
}

/**
 * Chama o backend integrado à API oficial do Mercado Pago (/v1/payments) utilizando
 * VITE_MERCADOPAGO_PUBLIC_KEY, MERCADOPAGO_ACCESS_TOKEN, X-Idempotency-Key e os dados reais
 * do usuário autenticado via Supabase Auth para gerar QR Code base64 e Copia e Cola sem truncamentos.
 */
export async function generateMercadoPagoPixCharge(params: {
  amount: number;
  userId?: string;
  goalkeeperId?: string;
  goalkeeperName?: string;
  arenaName?: string;
  description?: string;
  matchId?: string;
  type?: 'wallet_deposit' | 'match_booking';
  customer?: {
    name?: string;
    email?: string;
    cpf?: string;
    phone?: string;
  };
}): Promise<MercadoPagoPixChargeResponse> {
  const rawPublicKey = (import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY || '').trim();
  const publicKey =
    rawPublicKey && !rawPublicKey.startsWith('MY_') && !rawPublicKey.includes('placeholder')
      ? rawPublicKey
      : '';

  // Recuperar dados reais e token Bearer do usuário logado via Supabase Auth + profiles
  let authUserId = params.userId && params.userId !== 'usr-guest' ? params.userId : undefined;
  let authEmail = (params.customer?.email || '').trim();
  let authName = (params.customer?.name || '').trim();
  let authPhone = (params.customer?.phone || '').trim();
  let authCpf = (params.customer?.cpf || '').trim();
  let sessionAccessToken = '';

  if (isSupabaseConfigured) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        sessionAccessToken = session.access_token;
      }
      if (session?.user) {
        authUserId = authUserId || session.user.id;
        authEmail = authEmail || (session.user.email || '').trim();
        authName =
          authName ||
          String(session.user.user_metadata?.full_name || session.user.user_metadata?.name || '').trim();
        authPhone = authPhone || String(session.user.user_metadata?.phone || '').trim();
        authCpf = authCpf || String(session.user.user_metadata?.cpf || '').trim();

        if ((!authCpf || !authName || !authEmail) && authUserId) {
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('name, email, cpf, phone')
            .eq('id', authUserId)
            .maybeSingle();

          if (profileRow) {
            authName = authName || String(profileRow.name || '').trim();
            authEmail = authEmail || String(profileRow.email || '').trim();
            authCpf = authCpf || String(profileRow.cpf || '').trim();
            authPhone = authPhone || String(profileRow.phone || '').trim();
          }
        }
      }
    } catch {
      // Prosseguir com os dados disponíveis do usuário em sessão se getSession falhar
    }
  }

  const normalizedEmail = authEmail.toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error(
      'É necessário estar autenticado com um e-mail válido no seu perfil para gerar a cobrança Pix.'
    );
  }

  const cleanCpfDigits = authCpf.replace(/\D/g, '');
  const validCpf = validateCPF(cleanCpfDigits) ? cleanCpfDigits : '';

  const normalizedName = authName.replace(/\s+/g, ' ').trim() || normalizedEmail.split('@')[0];
  const nameParts = normalizedName.split(' ');
  const firstName = nameParts[0] || 'Atleta';
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : firstName;

  const idempotencyKey =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `pgk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Idempotency-Key': idempotencyKey,
  };
  if (publicKey) {
    headers['X-MercadoPago-Public-Key'] = publicKey;
  }
  if (sessionAccessToken) {
    headers['Authorization'] = `Bearer ${sessionAccessToken}`;
  }

  const resolvedCustomer = {
    name: normalizedName,
    first_name: firstName,
    last_name: lastName,
    email: normalizedEmail,
    cpf: validCpf,
    phone: authPhone.replace(/\D/g, ''),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let response: Response;
  try {
    response = await fetch('/api/gerar-pix-mercadopago', {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        amount: params.amount,
        valor: params.amount,
        publicKey: publicKey || undefined,
        idempotencyKey,
        userId: authUserId,
        goalkeeperId: params.goalkeeperId,
        goalkeeperName: params.goalkeeperName,
        arenaName: params.arenaName,
        type: params.type || 'wallet_deposit',
        matchId: params.matchId,
        description:
          params.description || `Recarga Carteira Digital ParedaoGK - R$ ${params.amount.toFixed(2)}`,
        payer: {
          email: normalizedEmail,
          first_name: firstName,
          last_name: lastName,
          ...(validCpf
            ? {
                identification: {
                  type: 'CPF',
                  number: validCpf,
                },
              }
            : {}),
        },
        user: {
          id: authUserId,
          ...resolvedCustomer,
        },
        customer: resolvedCustomer,
      }),
    });
  } catch (networkErr: any) {
    if (networkErr?.name === 'AbortError') {
      throw new Error('Timeout de rede ao aguardar resposta da API Pix do Mercado Pago.');
    }
    throw new Error(
      networkErr?.message
        ? `Falha de conexão com o servidor Pix Mercado Pago (${networkErr.message}).`
        : 'Não foi possível conectar ao servidor Pix Mercado Pago.'
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const parsed = await safeParseJsonResponse<MercadoPagoPixChargeResponse>(
    response,
    'API Mercado Pago Pix'
  );
  if (!parsed.valid || !parsed.data) {
    throw new Error(
      parsed.errorMessage ||
        'A API do Mercado Pago retornou uma resposta inválida ou vazia ao gerar o Pix.'
    );
  }

  const data = parsed.data as MercadoPagoPixChargeResponse & {
    mpCauses?: Array<{ code?: string | number; description?: string }>;
  };
  if (!response.ok || !data?.success) {
    const firstCause = Array.isArray(data?.mpCauses) && data.mpCauses.length > 0
      ? ` [${data.mpCauses.map((c) => c.description || c.code).filter(Boolean).join('; ')}]`
      : '';
    throw new Error(
      `${data?.error || `Falha ao gerar cobrança Pix no Mercado Pago (HTTP ${response.status}).`}${firstCause}`
    );
  }

  const rawQrText =
    data.point_of_interaction?.transaction_data?.qr_code || data.qrCodeText || '';
  data.qrCodeText = rawQrText.replace(/[\r\n]+/g, '');

  const rawBase64Candidate =
    data.qrCodeBase64 || data.point_of_interaction?.transaction_data?.qr_code_base64 || '';
  if (rawBase64Candidate) {
    const cleanBase64 = rawBase64Candidate
      .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, '')
      .replace(/\s+/g, '');
    data.qrCodeBase64 = cleanBase64 ? `data:image/png;base64,${cleanBase64}` : null;
  }

  return data;
}

/**
 * Consulta status de confirmação da cobrança Pix Mercado Pago (atualizado via /v1/payments ou webhook /api/webhook-mercadopago).
 */
export async function checkMercadoPagoPaymentStatus(paymentId: string): Promise<{
  status: 'pending' | 'completed' | 'failed';
  receiptCode?: string;
  supabaseCredited?: boolean;
}> {
  try {
    const res = await fetch(`/api/mercadopago/payment-status/${encodeURIComponent(paymentId)}`);
    if (!res.ok) return { status: 'pending' };
    const parsed = await safeParseJsonResponse(res, 'Status Pix Mercado Pago');
    if (!parsed.valid || !parsed.data) return { status: 'pending' };
    const json = parsed.data;
    return {
      status: json?.charge?.status || 'pending',
      receiptCode: json?.charge?.receiptCode,
      supabaseCredited: Boolean(json?.charge?.supabaseCredited),
    };
  } catch {
    return { status: 'pending' };
  }
}

/**
 * Dispara simulação homologada de webhook payment.confirmed do Mercado Pago no servidor.
 */
export async function simulateMercadoPagoWebhookConfirmation(params: {
  paymentId: string;
  amount: number;
  userId?: string;
  description?: string;
}): Promise<{
  success: boolean;
  paymentId: string;
  amount: number;
  receiptCode: string;
  supabaseCredited: boolean;
  newWalletBalance?: number;
}> {
  let res: Response;
  try {
    res = await fetch('/api/mercadopago/simulate-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentId: params.paymentId,
        amount: params.amount,
        userId: params.userId && params.userId !== 'usr-guest' ? params.userId : undefined,
        description: params.description,
      }),
    });
  } catch (networkErr: any) {
    throw new Error(
      networkErr?.message || 'Falha de rede ao comunicar com o webhook de homologação Mercado Pago.'
    );
  }

  const parsed = await safeParseJsonResponse(res, 'Webhook Simulação Mercado Pago');
  if (!parsed.valid || !parsed.data) {
    throw new Error(
      parsed.errorMessage || 'Resposta vazia ou inválida ao confirmar pagamento no webhook Mercado Pago.'
    );
  }

  const data = parsed.data;
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'Falha ao confirmar pagamento via webhook Mercado Pago.');
  }

  return {
    success: true,
    paymentId: String(data.paymentId || params.paymentId),
    amount: Number(data.amount || params.amount),
    receiptCode: String(data.receiptCode || `MP-${Date.now().toString().slice(-6)}`),
    supabaseCredited: Boolean(data.supabaseCredited),
    newWalletBalance: typeof data.newWalletBalance === 'number' ? data.newWalletBalance : undefined,
  };
}

/**
 * Persiste permanentemente o crédito Pix na tabela 'wallet_transactions' e atualiza
 * 'profiles.wallet_balance' no Supabase de forma idempotente (evita crédito duplicado).
 */
export async function creditWalletDepositInSupabase(params: {
  userId: string;
  paymentId: string;
  amount: number;
  receiptCode: string;
  description?: string;
  fallbackCurrentBalance?: number;
}): Promise<{
  synced: boolean;
  newWalletBalance: number;
  transaction: Transaction;
  alreadyCredited?: boolean;
  errorMessage?: string;
}> {
  const txId = `tx-mp-${params.paymentId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const transaction: Transaction = {
    id: txId,
    type: 'pix_in',
    amount: params.amount,
    description: params.description || 'Recarga Pix Mercado Pago Instantânea',
    date: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
    status: 'completed',
    receiptCode: params.receiptCode,
    provider: 'mercadopago',
  };

  if (!isSupabaseConfigured || !params.userId || params.userId === 'usr-guest') {
    const localBalance = Number(((params.fallbackCurrentBalance || 0) + params.amount).toFixed(2));
    return {
      synced: false,
      newWalletBalance: localBalance,
      transaction,
      errorMessage: 'Usuário não autenticado no Supabase.',
    };
  }

  try {
    // 1. Verificar idempotência e ler perfil completo (detectando coluna real de saldo)
    const [{ data: existingTx }, { data: profileRow, error: profileReadErr }] = await Promise.all([
      supabase
        .from('wallet_transactions')
        .select('id, status')
        .eq('id', txId)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('*')
        .eq('id', params.userId)
        .maybeSingle(),
    ]);

    if (profileReadErr) {
      throw new Error(profileReadErr.message);
    }

    const balanceCol =
      profileRow && Object.prototype.hasOwnProperty.call(profileRow, 'wallet_balance')
        ? 'wallet_balance'
        : profileRow && Object.prototype.hasOwnProperty.call(profileRow, 'balance')
        ? 'balance'
        : profileRow && Object.prototype.hasOwnProperty.call(profileRow, 'saldo')
        ? 'saldo'
        : 'wallet_balance';

    const currentDbBalance = Number(
      profileRow?.[balanceCol] ?? params.fallbackCurrentBalance ?? 0
    );

    if (existingTx && existingTx.status === 'completed') {
      return {
        synced: true,
        alreadyCredited: true,
        newWalletBalance: Number(currentDbBalance.toFixed(2)),
        transaction,
      };
    }

    const updatedBalance = Number((currentDbBalance + params.amount).toFixed(2));
    const nowIso = new Date().toISOString();

    const { error: txErr } = await resilientClientUpsert('wallet_transactions', {
      id: txId,
      user_id: params.userId,
      type: 'pix_in',
      amount: params.amount,
      gross_amount: params.amount,
      house_fee: 0,
      net_amount: params.amount,
      description: transaction.description,
      status: 'completed',
      receipt_code: params.receiptCode,
      provider: 'mercadopago',
      created_at: nowIso,
    });

    if (txErr) {
      throw new Error(txErr.message);
    }

    const { error: profErr } = await resilientClientProfileUpdate(params.userId, {
      [balanceCol]: updatedBalance,
    });

    if (profErr) {
      throw new Error(profErr.message);
    }

    return {
      synced: true,
      newWalletBalance: updatedBalance,
      transaction,
    };
  } catch (err: any) {
    console.warn('[Supabase creditWalletDepositInSupabase Error]', err);
    return {
      synced: false,
      newWalletBalance: Number(((params.fallbackCurrentBalance || 0) + params.amount).toFixed(2)),
      transaction,
      errorMessage: err?.message || 'Erro ao persistir saldo no Supabase.',
    };
  }
}

/**
 * Escuta alterações em tempo real na carteira do usuário logado no Supabase (profiles + wallet_transactions).
 */
export function subscribeToUserWalletRealtime(
  userId: string,
  onWalletUpdated: () => void
) {
  if (!isSupabaseConfigured || !userId || userId === 'usr-guest') {
    return () => {};
  }

  const channel = supabase
    .channel(`paredaogk-wallet-${userId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
      () => onWalletUpdated()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${userId}` },
      () => onWalletUpdated()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}


/**
 * Atualiza o cachê base sugerido, nível técnico e preferências no perfil do atleta no Supabase.
 */
export async function updateUserPricingProfileInSupabase(params: {
  userId: string;
  preferredCache: number;
  technicalLevel: string;
  nickname?: string;
  neighborhood?: string;
  city?: string;
  favoriteGloves?: string;
}): Promise<{ synced: boolean }> {
  if (!isSupabaseConfigured || !params.userId) {
    return { synced: false };
  }

  try {
    const { error } = await resilientClientProfileUpdate(params.userId, {
      preferred_cache: params.preferredCache,
      technical_level: params.technicalLevel,
      nickname: params.nickname,
      neighborhood: params.neighborhood,
      city: params.city,
      favorite_gloves: params.favoriteGloves,
    });

    return { synced: !error };
  } catch (err) {
    console.warn('[Supabase updateUserPricingProfileInSupabase warning]', err);
    return { synced: false };
  }
}

/**
 * Salva o Feedback Pós-Partida AI diretamente na tabela de histórico de partidas ('matches')
 * no Supabase e, opcionalmente, consolida a avaliação em 'match_reviews' e 'profiles'.
 */
export async function savePostMatchAiFeedbackToSupabase(params: {
  match: MatchBooking;
  feedback: PostMatchAiFeedbackResult;
  reviewerId: string;
  reviewerName: string;
  applyAsOfficialReview?: boolean;
}): Promise<{ synced: boolean; reviewSaved: boolean }> {
  if (!isSupabaseConfigured || !params.match?.id) {
    return { synced: false, reviewSaved: false };
  }

  let synced = false;
  let reviewSaved = false;

  try {
    const matchUpdatePayload: Record<string, any> = {
      status: 'completed',
      ai_feedback: params.feedback,
    };

    if (params.applyAsOfficialReview) {
      matchUpdatePayload.rating_given = params.feedback.consolidatedRating;
      matchUpdatePayload.review_comment = params.feedback.technicalOpinion;
      matchUpdatePayload.review_tags = params.feedback.suggestedTags;
      matchUpdatePayload.mvp_given = params.feedback.suggestedIsMvp;
      matchUpdatePayload.clean_sheet_given = params.feedback.suggestedCleanSheet;
      matchUpdatePayload.penalties_saved_given = params.feedback.suggestedPenaltiesSaved;
      matchUpdatePayload.reviewed_at = new Date().toISOString();
    }

    const { error: fullErr } = await supabase
      .from('matches')
      .update(matchUpdatePayload)
      .eq('id', params.match.id);

    if (!fullErr) {
      synced = true;
    } else {
      // Fallback seguro caso colunas extras ainda não existam no schema remoto
      console.warn('[Supabase matches AI feedback update note]', fullErr.message);
      const { error: minimalErr } = await supabase
        .from('matches')
        .update({
          status: 'completed',
          notes: `${params.match.notes ? `${params.match.notes} · ` : ''}[Parecer AI ★${params.feedback.consolidatedRating}] ${params.feedback.analyticalSummary}`,
        })
        .eq('id', params.match.id);
      synced = !minimalErr;
    }

    if (params.applyAsOfficialReview) {
      const reviewRes = await submitGoalkeeperReview({
        bookingId: params.match.id,
        contractorId: params.reviewerId,
        contractorName: params.reviewerName,
        goalkeeperId: params.match.goalkeeperId || '',
        goalkeeperName: params.match.goalkeeperName || 'Goleiro GK',
        rating: params.feedback.consolidatedRating,
        comment: params.feedback.technicalOpinion,
        tags: params.feedback.suggestedTags,
        cleanSheetConfirmed: params.feedback.suggestedCleanSheet,
        penaltiesSaved: params.feedback.suggestedPenaltiesSaved,
        isMvp: params.feedback.suggestedIsMvp,
      });
      reviewSaved = Boolean(reviewRes.success);
    }
  } catch (err) {
    console.warn('[savePostMatchAiFeedbackToSupabase warning]', err);
  }

  return { synced, reviewSaved };
}

// ==========================================
// 8. ARENAS OFICIAIS DE ITAPEVA & MODERAÇÃO ADMIN
// ==========================================

export const OFFICIAL_ADMIN_EMAIL = 'luizinhoitapevasp@gmail.com';

export const ADMIN_EMAILS = [
  OFFICIAL_ADMIN_EMAIL,
];

export interface AdminCheckSubject {
  id?: string;
  email?: string | null;
  role?: string | null;
  supabaseRole?: string | null;
  isAdmin?: boolean | null;
}

/**
 * Verificação estrita de Administrador: somente luizinhoitapevasp@gmail.com
 */
export function isAuthorizedAdmin(subject?: string | AdminCheckSubject | null): boolean {
  if (!subject) return false;
  const rawEmail = typeof subject === 'string' ? subject : subject.email;
  if (!rawEmail) return false;
  return rawEmail.trim().toLowerCase() === OFFICIAL_ADMIN_EMAIL;
}

/**
 * Valida acesso administrativo diretamente contra a sessão autenticada do Supabase Auth.
 */
export async function verifySupabaseAdminAccess(
  subject?: AdminCheckSubject | null
): Promise<boolean> {
  if (!isAuthorizedAdmin(subject)) return false;

  if (!isSupabaseConfigured) {
    return false;
  }

  try {
    const [userRes, sessionRes] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getSession(),
    ]);

    const verifiedEmail =
      userRes.data?.user?.email || sessionRes.data?.session?.user?.email;

    if (!verifiedEmail) {
      return false;
    }

    return verifiedEmail.trim().toLowerCase() === OFFICIAL_ADMIN_EMAIL;
  } catch {
    return false;
  }
}

function mapArenaRowToModel(row: any): ArenaField {
  return {
    id: String(row.id),
    name: row.name || 'Arena Parceira',
    address: row.address || 'Itapeva - SP',
    city: row.city || 'Itapeva - SP',
    neighborhood: row.neighborhood || undefined,
    phone: row.phone || '',
    instagram: row.instagram || undefined,
    surfaceType: (row.surface_type || row.surfaceType || 'Grama Sintética') as ArenaSurfaceType,
    mainModality: (row.main_modality || row.mainModality || 'Society') as ModalityType,
    photoUrl: row.photo_url || row.photoUrl || '/assets/aistudio/Arena_Itapeva_6f597b9b.png',
    isLogoPhoto: Boolean(row.is_logo_photo ?? row.isLogoPhoto ?? false),
    description: row.description || undefined,
    status: (row.status || 'pending') as ArenaModerationStatus,
    submittedById: row.submitted_by_id || row.submittedById || undefined,
    submittedByName: row.submitted_by_name || row.submittedByName || undefined,
    submittedByEmail: row.submitted_by_email || row.submittedByEmail || undefined,
    isOfficialSeed: Boolean(row.is_official_seed ?? row.isOfficialSeed ?? false),
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || undefined,
  };
}

function mapArenaModelToRow(arena: ArenaField): Record<string, any> {
  return {
    id: arena.id,
    name: arena.name,
    address: arena.address,
    city: arena.city || 'Itapeva - SP',
    neighborhood: arena.neighborhood || null,
    phone: arena.phone,
    instagram: arena.instagram || null,
    surface_type: arena.surfaceType,
    main_modality: arena.mainModality,
    photo_url: arena.photoUrl,
    is_logo_photo: Boolean(arena.isLogoPhoto),
    description: arena.description || null,
    status: arena.status,
    submitted_by_id: arena.submittedById || null,
    submitted_by_name: arena.submittedByName || null,
    submitted_by_email: arena.submittedByEmail || null,
    is_official_seed: Boolean(arena.isOfficialSeed),
    created_at: arena.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Redimensiona a foto da arena via HTML5 Canvas (máx. 960px, JPEG 0.82) para
 * otimizar upload ao Supabase Storage e fallback offline.
 */
export async function resizeArenaImageFile(
  file: File,
  maxDimension = 960
): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagem inválida ou corrompida.'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Contexto Canvas indisponível.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({ blob, dataUrl });
            } else {
              reject(new Error('Não foi possível comprimir a imagem da arena.'));
            }
          },
          'image/jpeg',
          0.82
        );
      };
      img.src = String(event.target?.result || '');
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Redimensiona e envia a foto da arena para o bucket 'arenas' no Supabase Storage.
 * Caso o bucket remoto ainda não esteja provisionado, retorna o DataURL comprimido com segurança.
 */
export async function uploadArenaPhotoToSupabase(
  file: File,
  arenaId: string
): Promise<{ photoUrl: string; uploadedToBucket: boolean }> {
  const { blob, dataUrl } = await resizeArenaImageFile(file);

  if (!isSupabaseConfigured) {
    return { photoUrl: dataUrl, uploadedToBucket: false };
  }

  try {
    const safeId = arenaId.replace(/[^a-zA-Z0-9_-]/g, '');
    const filePath = `submissions/${safeId}-${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('arenas')
      .upload(filePath, blob, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      console.warn('[Supabase Storage Arenas Upload Warning]', uploadError.message);
      return { photoUrl: dataUrl, uploadedToBucket: false };
    }

    const { data: publicUrlData } = supabase.storage
      .from('arenas')
      .getPublicUrl(filePath);

    if (publicUrlData?.publicUrl) {
      return { photoUrl: publicUrlData.publicUrl, uploadedToBucket: true };
    }
  } catch (err) {
    console.warn('[uploadArenaPhotoToSupabase warning]', err);
  }

  return { photoUrl: dataUrl, uploadedToBucket: false };
}

/**
 * Garante que as 4 arenas reais iniciais de Itapeva-SP existam como 'approved' no Supabase
 * e retorna a lista completa consolidada (oficiais + comunidade).
 */
export async function seedAndFetchArenasFromSupabase(
  seedArenas: ArenaField[],
  localArenas?: ArenaField[] | null
): Promise<{ arenas: ArenaField[]; synced: boolean }> {
  const mergeWithSeeds = (remoteOrLocal: ArenaField[]): ArenaField[] => {
    const map = new Map<string, ArenaField>();
    for (const seed of seedArenas) {
      map.set(seed.id, seed);
    }
    for (const item of remoteOrLocal) {
      map.set(item.id, item);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  };

  if (!isSupabaseConfigured) {
    return {
      arenas: mergeWithSeeds(localArenas || []),
      synced: false,
    };
  }

  try {
    const { data: existingRows, error: fetchError } = await supabase
      .from('arenas')
      .select('*')
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.warn('[Supabase fetch arenas warning]', fetchError.message);
      return {
        arenas: mergeWithSeeds(localArenas || []),
        synced: false,
      };
    }

    const mappedRemote = (existingRows || []).map(mapArenaRowToModel);
    const existingIds = new Set(mappedRemote.map((a) => a.id));
    const missingSeeds = seedArenas.filter((s) => !existingIds.has(s.id));

    if (missingSeeds.length > 0) {
      const { error: seedErr } = await supabase
        .from('arenas')
        .upsert(missingSeeds.map(mapArenaModelToRow), { onConflict: 'id' });

      if (seedErr) {
        console.warn('[Supabase seed arenas warning]', seedErr.message);
      }
    }

    return {
      arenas: mergeWithSeeds([...(localArenas || []), ...mappedRemote]),
      synced: true,
    };
  } catch (err) {
    console.warn('[seedAndFetchArenasFromSupabase warning]', err);
    return {
      arenas: mergeWithSeeds(localArenas || []),
      synced: false,
    };
  }
}

/**
 * Submete uma nova arena/campo cadastrada por um usuário com status automático 'pending'.
 */
export async function submitNewArenaToSupabase(
  arenaInput: Omit<ArenaField, 'status' | 'createdAt'> & { createdAt?: string }
): Promise<{ arena: ArenaField; synced: boolean }> {
  const newArena: ArenaField = {
    ...arenaInput,
    status: 'pending',
    createdAt: arenaInput.createdAt || new Date().toISOString(),
  };

  if (!isSupabaseConfigured) {
    return { arena: newArena, synced: false };
  }

  try {
    const { error } = await supabase
      .from('arenas')
      .upsert([mapArenaModelToRow(newArena)], { onConflict: 'id' });

    if (error) {
      console.warn('[Supabase submitNewArena warning]', error.message);
      return { arena: newArena, synced: false };
    }

    return { arena: newArena, synced: true };
  } catch (err) {
    console.warn('[submitNewArenaToSupabase warning]', err);
    return { arena: newArena, synced: false };
  }
}

/**
 * Executa ação de moderação do Administrador sobre uma arena submetida:
 * - approve: muda status para 'approved' (vai ao ar na vitrine + radar)
 * - archive: muda status para 'archived'
 * - delete: exclui permanentemente do banco
 */
export async function moderateArenaInSupabase(
  arenaId: string,
  action: 'approve' | 'archive' | 'delete'
): Promise<{ synced: boolean }> {
  if (!isSupabaseConfigured) {
    return { synced: false };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!isAuthorizedAdmin(session?.user?.email)) {
    return { synced: false };
  }

  try {
    if (action === 'delete') {
      const { error } = await supabase.from('arenas').delete().eq('id', arenaId);
      if (error) {
        console.warn('[Supabase delete arena warning]', error.message);
        return { synced: false };
      }
      return { synced: true };
    }

    const nextStatus: ArenaModerationStatus = action === 'approve' ? 'approved' : 'archived';
    const { error } = await supabase
      .from('arenas')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', arenaId);

    if (error) {
      console.warn('[Supabase moderate arena warning]', error.message);
      return { synced: false };
    }

    return { synced: true };
  } catch (err) {
    console.warn('[moderateArenaInSupabase warning]', err);
    return { synced: false };
  }
}

/**
 * Busca partidas oficiais do usuário/rede na tabela 'matches' do Supabase.
 */
export async function fetchMatchesFromSupabase(userId?: string): Promise<MatchBooking[]> {
  if (!isSupabaseConfigured) return [];
  try {
    let query = supabase
      .from('matches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(40);

    if (userId && userId !== 'usr-guest') {
      query = query.or(`organizer_id.eq.${userId},goalkeeper_id.eq.${userId}`);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((row: any) => {
      const price = Number(row.price || 25);
      const houseFee = Number(row.house_fee ?? ITAPEVA_HOUSE_FEE);
      const tier = getTierByTotalPrice(price);
      return {
        id: String(row.id),
        organizerId: row.organizer_id || '',
        organizerName: row.organizer_name || 'Organizador',
        goalkeeperId: row.goalkeeper_id || undefined,
        goalkeeperName: row.goalkeeper_name || undefined,
        goalkeeperPhoto: row.goalkeeper_photo || undefined,
        arenaName: row.arena_name || 'Arena Itapeva',
        address: row.address || 'Itapeva - SP',
        city: row.city || 'Itapeva - SP',
        date: row.date || 'Recente',
        time: row.time || '20:00 - 21:00',
        modality: (row.modality || 'Society') as ModalityType,
        price,
        houseFee,
        goalkeeperPayout: Number(row.goalkeeper_payout ?? Math.max(0, price - houseFee)),
        pricingTier: row.pricing_tier || tier.tierCode,
        cashbackEarned: Number(row.cashback_earned ?? Number((price * 0.1).toFixed(2))),
        status: row.status || 'confirmed',
        competitiveLevel: row.competitive_level || 'Competitivo',
        ratingGiven: row.rating_given ? Number(row.rating_given) : undefined,
        reviewComment: row.review_comment || undefined,
        reviewTags: Array.isArray(row.review_tags) ? row.review_tags : undefined,
        mvpGiven: Boolean(row.mvp_given),
        cleanSheetGiven: Boolean(row.clean_sheet_given),
        penaltiesSavedGiven: row.penalties_saved_given ? Number(row.penalties_saved_given) : undefined,
        aiFeedback: row.ai_feedback || undefined,
        reviewedAt: row.reviewed_at || undefined,
        notes: row.notes || undefined,
        paymentStatus: row.payment_status || 'paid',
        createdAt: row.created_at || undefined,
        checkin2hConfirmed: Boolean(row.checkin_2h_confirmed),
        enRoute45mConfirmed: Boolean(row.en_route_45m_confirmed),
        goalkeeperCancelled: Boolean(row.goalkeeper_cancelled),
      };
    });
  } catch (err) {
    console.warn('[fetchMatchesFromSupabase warning]', err);
    return [];
  }
}

/**
 * Busca notificações reais do usuário na tabela 'notifications' do Supabase.
 */
export async function fetchNotificationsFromSupabase(userId?: string): Promise<NotificationItem[]> {
  if (!isSupabaseConfigured) return [];
  try {
    let query = supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (userId && userId !== 'usr-guest') {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((row: any) => ({
      id: String(row.id),
      title: row.title || 'Notificação ParedãoGK',
      description: row.description || '',
      timestamp: row.created_at
        ? new Date(row.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
        : 'Agora',
      read: Boolean(row.read),
      category: (row.category || 'system') as NotificationItem['category'],
      actionTab: row.category === 'wallet' ? 'wallet' : row.category === 'radar' ? 'home' : undefined,
    }));
  } catch (err) {
    console.warn('[fetchNotificationsFromSupabase warning]', err);
    return [];
  }
}

// ==========================================
// 9. ADMIN FINANCEIRO: SAQUES PIX & WEBHOOKS MERCADO PAGO
// ==========================================

function mapTransactionStatusToAdmin(rawStatus?: string): AdminPixWithdrawalStatus {
  const normalized = String(rawStatus || '').toLowerCase();
  if (normalized === 'completed' || normalized === 'approved' || normalized === 'paid') {
    return 'approved';
  }
  if (normalized === 'rejected' || normalized === 'cancelled' || normalized === 'failed') {
    return 'rejected';
  }
  return 'pending';
}

export function registerAdminWithdrawalRequestLocal(params: {
  transaction: Transaction;
  user: UserProfile;
}): AdminPixWithdrawal {
  const requestedAmount = Math.abs(Number(params.transaction.amount || 0));
  const houseFee = ITAPEVA_HOUSE_FEE;
  const grossAmount = Number((requestedAmount + houseFee).toFixed(2));
  const netPayout = Number(Math.max(0, grossAmount - houseFee).toFixed(2));

  const item: AdminPixWithdrawal = {
    id: params.transaction.id,
    userId: params.user.id,
    athleteName: params.user.name || 'Goleiro GK',
    athleteEmail: params.user.email,
    athleteNickname: params.user.nickname,
    pixKey: params.transaction.pixKey || params.user.cpf || '',
    pixKeyType: params.transaction.pixKeyType || 'cpf',
    grossAmount,
    houseFee,
    netPayout,
    requestedAmount,
    status: mapTransactionStatusToAdmin(params.transaction.status),
    receiptCode: params.transaction.receiptCode,
    adminNotes: params.transaction.adminNotes,
    matchId: params.transaction.matchId,
    arenaName: params.transaction.arenaName,
    provider: 'mercadopago',
    requestedAt: new Date().toISOString(),
  };

  const existing = getOfflineAdminWithdrawals();
  const next = [item, ...existing.filter((x) => x.id !== item.id)];
  saveOfflineAdminWithdrawals(next);
  return item;
}

/**
 * Busca todas as solicitações de saque Pix (type = 'pix_out') nas tabelas
 * 'wallet_transactions' e 'profiles' do Supabase, unificando com fila local.
 */
export async function fetchAdminPixWithdrawalsFromSupabase(): Promise<{
  withdrawals: AdminPixWithdrawal[];
  syncedFromSupabase: boolean;
}> {
  if (isSupabaseConfigured) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!isAuthorizedAdmin(session?.user?.email)) {
      return { withdrawals: [], syncedFromSupabase: false };
    }
  }

  const localCache = getOfflineAdminWithdrawals();
  let syncedFromSupabase = false;
  let remoteList: AdminPixWithdrawal[] = [];

  if (isSupabaseConfigured) {
    try {
      const { data: txRows, error: txErr } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('type', 'pix_out')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!txErr && txRows) {
        syncedFromSupabase = true;
        const userIds = Array.from(new Set(txRows.map((r: any) => r.user_id).filter(Boolean)));
        const profilesMap = new Map<string, any>();

        if (userIds.length > 0) {
          const { data: profRows } = await supabase
            .from('profiles')
            .select('id, name, email, nickname')
            .in('id', userIds);

          (profRows || []).forEach((p: any) => {
            profilesMap.set(p.id, p);
          });
        }

        remoteList = txRows.map((row: any) => {
          const prof = profilesMap.get(row.user_id);
          const requestedAmount = Math.abs(Number(row.amount || 0));
          const houseFee = Number(row.house_fee ?? ITAPEVA_HOUSE_FEE);
          const grossAmount = Number((requestedAmount + houseFee).toFixed(2));
          const netPayout = Number(Math.max(0, grossAmount - houseFee).toFixed(2));

          return {
            id: String(row.id),
            userId: String(row.user_id || ''),
            athleteName: prof?.name || row.athlete_name || 'Goleiro GK',
            athleteEmail: prof?.email || row.athlete_email || undefined,
            athleteNickname: prof?.nickname || undefined,
            pixKey: row.pix_key || 'Chave não informada',
            pixKeyType: (row.pix_key_type || 'cpf') as AdminPixWithdrawal['pixKeyType'],
            grossAmount,
            houseFee,
            netPayout,
            requestedAmount,
            status: mapTransactionStatusToAdmin(row.status),
            receiptCode: row.receipt_code || `MP-${String(row.id).slice(-6).toUpperCase()}`,
            adminNotes: row.admin_notes || undefined,
            rejectionReason: row.rejection_reason || undefined,
            matchId: row.match_id || undefined,
            arenaName: row.arena_name || undefined,
            provider: 'mercadopago',
            requestedAt: row.created_at || new Date().toISOString(),
            processedAt: row.updated_at || undefined,
          };
        });
      }
    } catch (err) {
      console.warn('[fetchAdminPixWithdrawalsFromSupabase warning]', err);
    }
  }

  const mergedMap = new Map<string, AdminPixWithdrawal>();
  localCache.forEach((item) => mergedMap.set(item.id, item));
  remoteList.forEach((item) => mergedMap.set(item.id, item));

  const consolidated = Array.from(mergedMap.values()).sort(
    (a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
  );

  saveOfflineAdminWithdrawals(consolidated);
  return {
    withdrawals: consolidated,
    syncedFromSupabase,
  };
}

/**
 * Autoriza pagamento, registra comprovante ou rejeita uma solicitação de saque Pix
 * na tabela 'wallet_transactions', atualizando 'profiles' (em caso de estorno) e 'notifications'.
 */
export async function processAdminPixWithdrawalInSupabase(params: {
  withdrawal: AdminPixWithdrawal;
  action: 'approve' | 'reject' | 'attach_receipt';
  receiptCode?: string;
  rejectionReason?: string;
  adminEmail: string;
}): Promise<{ updated: AdminPixWithdrawal; syncedToSupabase: boolean }> {
  if (!isAuthorizedAdmin(params.adminEmail)) {
    throw new Error('Acesso negado: apenas o administrador oficial pode processar saques Pix.');
  }
  const nowIso = new Date().toISOString();
  const nextStatus: AdminPixWithdrawalStatus =
    params.action === 'reject' ? 'rejected' : 'approved';
  const dbStatus = nextStatus === 'approved' ? 'completed' : 'rejected';

  const finalReceiptCode =
    params.receiptCode?.trim() ||
    params.withdrawal.receiptCode ||
    `MP-PIX-${Date.now().toString().slice(-6)}`;

  const updated: AdminPixWithdrawal = {
    ...params.withdrawal,
    status: nextStatus,
    receiptCode: finalReceiptCode,
    rejectionReason: params.action === 'reject' ? params.rejectionReason || 'Divergência na chave Pix' : undefined,
    adminNotes:
      params.action === 'attach_receipt'
        ? `Comprovante registrado por ${params.adminEmail}`
        : params.action === 'approve'
        ? `Repasse Pix autorizado por ${params.adminEmail}`
        : `Rejeitado por ${params.adminEmail}: ${params.rejectionReason || 'Revisão administrativa'}`,
    processedAt: nowIso,
    processedBy: params.adminEmail,
  };

  let syncedToSupabase = false;

  if (isSupabaseConfigured) {
    try {
      const { error: txUpdateErr } = await supabase
        .from('wallet_transactions')
        .update({
          status: dbStatus,
          receipt_code: finalReceiptCode,
          description:
            nextStatus === 'approved'
              ? `Saque Pix Mercado Pago Pago (${params.withdrawal.pixKeyType.toUpperCase()})`
              : `Saque Pix Rejeitado (${params.rejectionReason || 'Estornado à carteira'})`,
        })
        .eq('id', params.withdrawal.id);

      if (params.action === 'reject' && params.withdrawal.userId) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', params.withdrawal.userId)
          .maybeSingle();

        if (prof) {
          const balanceCol = Object.prototype.hasOwnProperty.call(prof, 'wallet_balance')
            ? 'wallet_balance'
            : Object.prototype.hasOwnProperty.call(prof, 'balance')
            ? 'balance'
            : Object.prototype.hasOwnProperty.call(prof, 'saldo')
            ? 'saldo'
            : 'wallet_balance';
          const refundedBalance = Number(
            (Number(prof[balanceCol] || 0) + params.withdrawal.requestedAmount).toFixed(2)
          );
          await resilientClientProfileUpdate(params.withdrawal.userId, {
            [balanceCol]: refundedBalance,
          });
        }
      }

      if (params.withdrawal.userId) {
        await supabase.from('notifications').insert([
          {
            id: `notif-pix-${Date.now()}`,
            user_id: params.withdrawal.userId,
            category: 'wallet',
            title:
              nextStatus === 'approved'
                ? '💸 Saque Pix Mercado Pago Aprovado & Pago!'
                : '⚠️ Solicitação de Saque Pix Rejeitada',
            description:
              nextStatus === 'approved'
                ? `Repasse líquido de R$ ${params.withdrawal.netPayout.toFixed(2)} enviado para ${params.withdrawal.pixKey}. Comprovante: ${finalReceiptCode}.`
                : `Seu saque de R$ ${params.withdrawal.requestedAmount.toFixed(2)} foi rejeitado (${params.rejectionReason || 'verifique sua chave Pix'}) e o saldo foi estornado.`,
            read: false,
            created_at: nowIso,
          },
        ]);
      }

      syncedToSupabase = !txUpdateErr;
    } catch (err) {
      console.warn('[processAdminPixWithdrawalInSupabase warning]', err);
    }
  }

  const existing = getOfflineAdminWithdrawals();
  const nextList = [updated, ...existing.filter((w) => w.id !== updated.id)];
  saveOfflineAdminWithdrawals(nextList);

  return { updated, syncedToSupabase };
}

/**
 * Busca configuração e logs de Webhooks Mercado Pago integrando API Express + Supabase + Cache local
 */
export async function fetchMercadoPagoWebhookConfigAndLogs(defaultEndpointUrl: string): Promise<{
  config: MercadoPagoWebhookConfig;
  logs: MercadoPagoWebhookLog[];
  syncedFromSupabase: boolean;
}> {
  const defaultConfig: MercadoPagoWebhookConfig = getOfflineWebhookConfig() || {
    id: 'mercadopago-webhook-default',
    webhookUrl: defaultEndpointUrl,
    signingSecret: 'mpwhsec_paredaogk_itapeva_2026',
    isActive: true,
    subscribedEvents: [
      'payment.confirmed',
      'custody.released',
      'withdrawal.processed',
      'withdrawal.rejected',
    ],
    updatedAt: new Date().toISOString(),
  };

  if (isSupabaseConfigured) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!isAuthorizedAdmin(session?.user?.email)) {
      return { config: defaultConfig, logs: [], syncedFromSupabase: false };
    }
  }

  let config = defaultConfig;
  const logsMap = new Map<string, MercadoPagoWebhookLog>();
  getOfflineWebhookLogs().forEach((l) => logsMap.set(l.id, l));
  let syncedFromSupabase = false;

  // 1. Buscar estado atual do servidor Express (/api/admin/mercadopago-webhooks)
  try {
    const res = await fetch('/api/admin/mercadopago-webhooks');
    if (res.ok) {
      const parsed = await safeParseJsonResponse(res, 'Admin Webhooks Mercado Pago');
      const json = parsed.valid ? parsed.data : null;
      if (json?.config) {
        config = {
          id: json.config.id || config.id,
          webhookUrl:
            json.config.webhookUrl && !json.config.webhookUrl.startsWith('/')
              ? json.config.webhookUrl
              : defaultEndpointUrl,
          signingSecret: json.config.signingSecret || config.signingSecret,
          isActive: typeof json.config.isActive === 'boolean' ? json.config.isActive : true,
          subscribedEvents: Array.isArray(json.config.subscribedEvents)
            ? json.config.subscribedEvents
            : config.subscribedEvents,
          updatedAt: json.config.updatedAt || config.updatedAt,
          updatedBy: json.config.updatedBy,
        };
      }
      if (Array.isArray(json?.logs)) {
        json.logs.forEach((l: MercadoPagoWebhookLog) => logsMap.set(l.id, l));
      }
    }
  } catch {
    // Seguir com fallback local/Supabase
  }

  // 2. Sincronizar com Supabase se configurado
  if (isSupabaseConfigured) {
    try {
      const [cfgRes, logsRes] = await Promise.all([
        supabase
          .from('cajupay_webhook_configs')
          .select('*')
          .eq('id', 'mercadopago-webhook-default')
          .maybeSingle(),
        supabase
          .from('cajupay_webhook_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (!cfgRes.error && cfgRes.data) {
        config = {
          id: String(cfgRes.data.id),
          webhookUrl: cfgRes.data.webhook_url || config.webhookUrl,
          signingSecret: cfgRes.data.signing_secret || config.signingSecret,
          isActive: cfgRes.data.is_active !== false,
          subscribedEvents: Array.isArray(cfgRes.data.subscribed_events)
            ? cfgRes.data.subscribed_events
            : config.subscribedEvents,
          updatedAt: cfgRes.data.updated_at || config.updatedAt,
          updatedBy: cfgRes.data.updated_by || undefined,
        };
        syncedFromSupabase = true;
      }

      if (!logsRes.error && Array.isArray(logsRes.data)) {
        logsRes.data.forEach((row: any) => {
          logsMap.set(String(row.id), {
            id: String(row.id),
            event: row.event || 'payment.confirmed',
            endpointUrl: row.endpoint_url || config.webhookUrl,
            httpStatus: Number(row.http_status || 200),
            hmacValid: Boolean(row.hmac_valid),
            signatureHeader: row.signature_header || '',
            payload: row.payload || {},
            responseBody: row.response_body || undefined,
            source: (row.source || 'live') as MercadoPagoWebhookLog['source'],
            createdAt: row.created_at || new Date().toISOString(),
          });
        });
        syncedFromSupabase = true;
      }
    } catch (err) {
      console.warn('[fetchMercadoPagoWebhookConfigAndLogs Supabase note]', err);
    }
  }

  const sortedLogs = Array.from(logsMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  saveOfflineWebhookConfig(config);
  saveOfflineWebhookLogs(sortedLogs);

  return { config, logs: sortedLogs, syncedFromSupabase };
}

/**
 * Salva configurações do Webhook Mercado Pago no servidor Express, Supabase e cache local
 */
export async function saveMercadoPagoWebhookConfig(params: {
  config: MercadoPagoWebhookConfig;
  adminEmail: string;
}): Promise<{ config: MercadoPagoWebhookConfig; syncedToSupabase: boolean }> {
  if (!isAuthorizedAdmin(params.adminEmail)) {
    throw new Error('Acesso administrativo negado: somente luizinhoitapevasp@gmail.com pode alterar webhooks.');
  }
  if (isSupabaseConfigured) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!isAuthorizedAdmin(session?.user?.email)) {
      throw new Error('Sessão administrativa inválida no Supabase Auth.');
    }
  }

  const updatedConfig: MercadoPagoWebhookConfig = {
    ...params.config,
    updatedAt: new Date().toISOString(),
    updatedBy: params.adminEmail,
  };

  try {
    await fetch('/api/admin/mercadopago-webhooks/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedConfig),
    });
  } catch (err) {
    console.warn('[Server Webhook Config Sync]', err);
  }

  let syncedToSupabase = false;
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('cajupay_webhook_configs').upsert([
        {
          id: updatedConfig.id,
          webhook_url: updatedConfig.webhookUrl,
          signing_secret: updatedConfig.signingSecret,
          is_active: updatedConfig.isActive,
          subscribed_events: updatedConfig.subscribedEvents,
          updated_by: params.adminEmail,
          updated_at: updatedConfig.updatedAt,
        },
      ]);
      syncedToSupabase = !error;
    } catch (err) {
      console.warn('[Supabase saveMercadoPagoWebhookConfig note]', err);
    }
  }

  saveOfflineWebhookConfig(updatedConfig);
  return { config: updatedConfig, syncedToSupabase };
}

/**
 * Dispara payload de teste assinado com HMAC-SHA256 para validação de segurança do endpoint
 */
export async function dispatchMercadoPagoWebhookTest(params: {
  event: MercadoPagoWebhookEventType;
  webhookUrl: string;
  simulateInvalidSignature?: boolean;
  customAmount?: number;
}): Promise<{ log: MercadoPagoWebhookLog; syncedToSupabase: boolean }> {
  if (isSupabaseConfigured) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!isAuthorizedAdmin(session?.user?.email)) {
      throw new Error('Acesso administrativo negado ao disparar teste de webhook.');
    }
  }

  let log: MercadoPagoWebhookLog | null = null;

  try {
    const res = await fetch('/api/admin/mercadopago-webhooks/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const parsed = await safeParseJsonResponse(res, 'Teste Webhook Mercado Pago');
      const json = parsed.valid ? parsed.data : null;
      if (json?.log) {
        log = json.log as MercadoPagoWebhookLog;
      }
    }
  } catch (err) {
    console.warn('[dispatchMercadoPagoWebhookTest Server note]', err);
  }

  if (!log) {
    const nowIso = new Date().toISOString();
    log = {
      id: `whlog-${Date.now()}`,
      event: params.event,
      endpointUrl: params.webhookUrl,
      httpStatus: params.simulateInvalidSignature ? 401 : 200,
      hmacValid: !params.simulateInvalidSignature,
      signatureHeader: params.simulateInvalidSignature
        ? 'invalid_hmac_signature_test'
        : 'local_hmac_sha256_verified',
      payload: {
        id: `evt_mp_${Date.now().toString().slice(-6)}`,
        event: params.event,
        created_at: nowIso,
        data: {
          transaction_amount: params.customAmount || 25,
          amount_brl: params.customAmount || 25,
          house_fee_brl: 5,
          goalkeeper_net_brl: Math.max(0, (params.customAmount || 25) - 5),
        },
      },
      responseBody: {
        received: !params.simulateInvalidSignature,
        authenticated: !params.simulateInvalidSignature,
      },
      source: 'test_dispatch',
      createdAt: nowIso,
    };
  }

  let syncedToSupabase = false;
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('cajupay_webhook_logs').insert([
        {
          id: log.id,
          event: log.event,
          endpoint_url: log.endpointUrl,
          http_status: log.httpStatus,
          hmac_valid: log.hmacValid,
          signature_header: log.signatureHeader,
          payload: log.payload,
          response_body: log.responseBody || null,
          source: log.source,
          created_at: log.createdAt,
        },
      ]);
      syncedToSupabase = !error;
    } catch (err) {
      console.warn('[Supabase webhook log insert note]', err);
    }
  }

  const existingLogs = getOfflineWebhookLogs();
  saveOfflineWebhookLogs([log, ...existingLogs.filter((l) => l.id !== log!.id)]);

  return { log, syncedToSupabase };
}

/**
 * Escuta em tempo real novos logs de Webhook e pedidos de saque Pix no Supabase Realtime
 */
export function subscribeToAdminFinancialRealtime(callbacks: {
  onWithdrawalChange: () => void;
  onWebhookLog: (log: MercadoPagoWebhookLog) => void;
}) {
  if (!isSupabaseConfigured) return () => {};

  let isDisposed = false;
  let activeChannel: ReturnType<typeof supabase.channel> | null = null;

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (isDisposed || !isAuthorizedAdmin(session?.user?.email)) {
      return;
    }

    const channel = supabase.channel('paredaogk-admin-financial-realtime');

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'wallet_transactions' },
      () => {
        callbacks.onWithdrawalChange();
      }
    );

    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'cajupay_webhook_logs' },
      (payload) => {
        const row = payload.new as any;
        if (!row) return;
        callbacks.onWebhookLog({
          id: String(row.id),
          event: row.event || 'payment.confirmed',
          endpointUrl: row.endpoint_url || '/api/webhook-mercadopago',
          httpStatus: Number(row.http_status || 200),
          hmacValid: Boolean(row.hmac_valid),
          signatureHeader: row.signature_header || '',
          payload: row.payload || {},
          responseBody: row.response_body || undefined,
          source: (row.source || 'live') as MercadoPagoWebhookLog['source'],
          createdAt: row.created_at || new Date().toISOString(),
        });
      }
    );

    channel.subscribe();
    activeChannel = channel;
  });

  return () => {
    isDisposed = true;
    if (activeChannel) {
      supabase.removeChannel(activeChannel);
    }
  };
}





