export type UserRole = 'contratante' | 'goleiro';

export type TabType = 'home' | 'chat' | 'notifications' | 'wallet' | 'performance';

export interface UserProfile {
  id: string;
  name: string;
  nickname?: string;
  cpf: string;
  isCpfVerified: boolean;
  email: string;
  phone: string;
  birthDate: string;
  age: number;
  role: UserRole;
  avatarUrl: string;
  rating: number;
  matchesPlayed: number;
  cleanSheets: number;
  penaltiesSaved: number;
  mvpCount: number;
  city: string;
  neighborhood: string;
  height?: string;
  dominantFoot?: 'destro' | 'canhoto' | 'ambidestro';
  categories?: ('society' | 'campo' | 'futsal' | 'areia')[];
  favoriteGloves?: string;
  walletBalance: number;
  pendingBalance: number;
  cashbackBalance: number;
  preferredCache?: number;
  technicalLevel?: 'Iniciante' | 'Intermediário' | 'Avançado' | 'Elite / Profissional';
  pricingTier?: PricingTierCode;
  tierPinned?: boolean;
  isEliteMember: boolean;
  supabaseRole?: string;
  isAdmin?: boolean;
  createdAt: string;
}

export interface Goalkeeper {
  id: string;
  name: string;
  nickname: string;
  photo: string;
  rating: number;
  reviewsCount: number;
  matchesPlayed: number;
  cleanSheets: number;
  penaltiesSaved: number;
  pricePerMatch: number;
  distanceKm: number;
  neighborhood: string;
  city: string;
  height: string;
  dominantFoot: 'destro' | 'canhoto' | 'ambidestro';
  modalities: ('Society' | 'Campo 11' | 'Futsal' | 'Areia' | 'Fut7')[];
  availableToday: boolean;
  responseTimeMinutes: number;
  badges: string[];
  bio: string;
  favoriteBrand: string;
  level: 'Iniciante' | 'Intermediário' | 'Avançado' | 'Profissional / Base';
  phone?: string;
  latitude?: number;
  longitude?: number;
}

export type ModalityType = 'Society' | 'Fut7' | 'Campo 11' | 'Futsal' | 'Areia';

export type GameDifficultyLevel = 'Não quero informar' | 'Fácil' | 'Médio' | 'Difícil';

export type MatchSlotMode = 'random' | 'specific' | 'mixed';

export type MatchOperationalStatus =
  | 'awaiting_acceptance'
  | 'awaiting_custody_payment'
  | 'accepted'
  | 'en_route'
  | 'arrived'
  | 'completed'
  | 'cancelled';

export interface MatchGoalkeeperCandidate {
  id: string;
  name: string;
  nickname?: string;
  photo?: string;
  rating?: number;
  distanceKm?: number;
  phone?: string;
  appliedAt: string;
  slotIndex?: number;
}

export interface MatchGoalkeeperSlot {
  slotIndex: number;
  mode: MatchSlotMode;
  goalkeeperId?: string;
  goalkeeperName?: string;
  goalkeeperPhoto?: string;
  goalkeeperPhone?: string;
  distanceKm?: number;
  status: 'open' | 'accepted' | 'en_route' | 'completed' | 'cancelled';
  acceptedAt?: string;
  enRouteAt?: string;
}

export interface MatchReview {
  id: string;
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
  createdAt: string;
}

export interface WeeklyMatchTemplate {
  id: string;
  organizerId: string;
  title: string;
  arenaName: string;
  address: string;
  city?: string;
  dayOfWeek: string;
  time: string;
  modality: ModalityType;
  competitiveLevel: 'Resenha / Amigável' | 'Competitivo' | 'Varzea / Torneio';
  price: number;
  favoriteGoalkeeperId?: string;
  favoriteGoalkeeperName?: string;
  notes?: string;
  createdAt: string;
}

export interface MatchBooking {
  id: string;
  organizerId: string;
  organizerName: string;
  goalkeeperId?: string;
  goalkeeperName?: string;
  goalkeeperPhoto?: string;
  arenaName: string;
  address: string;
  city: string;
  date: string;
  dateIso?: string;
  time: string;
  durationMinutes?: number;
  modality: ModalityType;
  price: number;
  houseFee?: number;
  goalkeeperPayout?: number;
  pricingTier?: PricingTierCode;
  cashbackEarned: number;
  status: 'searching' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  competitiveLevel: 'Resenha / Amigável' | 'Competitivo' | 'Varzea / Torneio' | GameDifficultyLevel;
  gameLevel?: GameDifficultyLevel;
  goalkeeperSlotsCount?: 1 | 2;
  selectionMode?: MatchSlotMode;
  slots?: MatchGoalkeeperSlot[];
  candidates?: MatchGoalkeeperCandidate[];
  operationalStatus?: MatchOperationalStatus;
  acceptedAt?: string;
  radiusKm?: number;
  notifiedGoalkeepersCount?: number;
  notes?: string;
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded';
  createdAt?: string;
  ratingGiven?: number;
  reviewComment?: string;
  reviewTags?: string[];
  reviewedAt?: string;
  mvpGiven?: boolean;
  cleanSheetGiven?: boolean;
  penaltiesSavedGiven?: number;
  // Linha do tempo de segurança, rastreamento operacional (20m antes -> A Caminho) & SOS
  checkin2hConfirmed?: boolean;
  checkin2hConfirmedAt?: string;
  enRoute45mConfirmed?: boolean;
  enRoute45mAt?: string;
  enRoute20mNotified?: boolean;
  enRoute20mNotifiedAt?: string;
  enRoute20mConfirmed?: boolean;
  enRoute20mAt?: string;
  goalkeeperCancelled?: boolean;
  sosTriggered?: boolean;
  sosTriggeredAt?: string;
  sosBonus?: number;
  sosRadiusKm?: number;
  sosNotifiedCount?: number;
  // Recorrência semanal / Elenco fixo
  isWeeklyRecurrence?: boolean;
  templateId?: string;
  priorityGoalkeeperId?: string;
  // Feedback Pós-Partida AI
  aiFeedback?: PostMatchAiFeedbackResult;
}

export interface PostMatchStrengthCriterion {
  criterion: string;
  score: number;
  highlight: string;
}

export interface PostMatchAiFeedbackInput {
  matchId: string;
  arenaName: string;
  modality: ModalityType;
  competitiveLevel?: string;
  goalkeeperName: string;
  organizerName?: string;
  authorRole: UserRole;
  goalsConceded: number;
  hardSavesCount: number;
  penaltiesSaved: number;
  punctualityOnTime: boolean;
  distributionQuality: 'excelente' | 'boa' | 'regular';
  aerialExitQuality: 'firme' | 'segura' | 'oscilante';
  matchObservations?: string;
}

export interface PostMatchAiFeedbackResult {
  consolidatedRating: number;
  analyticalSummary: string;
  technicalOpinion: string;
  strengths: PostMatchStrengthCriterion[];
  improvementPoint: string;
  suggestedTags: string[];
  suggestedCleanSheet: boolean;
  suggestedPenaltiesSaved: number;
  suggestedIsMvp: boolean;
  source: 'gemini-ai' | 'offline-engine';
  generatedAt: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  isMine: boolean;
  status: 'sent' | 'delivered' | 'read';
  type?: 'text' | 'location' | 'quick_action';
  locationData?: {
    arenaName: string;
    address: string;
  };
}

export interface Conversation {
  id: string;
  participantId: string;
  participantName: string;
  participantNickname?: string;
  participantRole: UserRole;
  participantAvatar: string;
  participantRating: number;
  arenaName?: string;
  matchDate?: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  messages: ChatMessage[];
}

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  category: 'match' | 'wallet' | 'system' | 'radar';
  actionTab?: 'home' | 'chat' | 'wallet' | 'notifications';
  matchId?: string;
  arenaName?: string;
  actionType?: 'confirm_en_route' | 'accept_match';
}

export interface Transaction {
  id: string;
  type: 'pix_in' | 'pix_out' | 'match_payment' | 'match_cache' | 'cashback_credit' | 'platform_fee';
  amount: number;
  description: string;
  date: string;
  status: 'pending' | 'completed' | 'processing' | 'cancelled' | 'rejected';
  pixKey?: string;
  pixKeyType?: 'cpf' | 'phone' | 'email' | 'random';
  receiptCode: string;
  provider?: 'mercadopago' | 'arenadraft' | 'internal';
  matchId?: string;
  arenaName?: string;
  adminNotes?: string;
}

export type CacheUrgencyLevel = 'normal' | 'same_day' | 'sos_urgent';
export type TechnicalLevelOption =
  | 'Iniciante'
  | 'Intermediário'
  | 'Avançado'
  | 'Elite / Profissional';

export type PricingTierCode = 'faixa_1' | 'faixa_2' | 'faixa_3';

export interface GoalkeeperPricingTier {
  tierCode: PricingTierCode;
  tierNumber: 1 | 2 | 3;
  label: string;
  shortLabel: string;
  technicalLevelLabel: string;
  totalPrice: 20 | 25 | 30;
  goalkeeperNet: 15 | 20 | 25;
  houseFee: 5;
  ratingRule: string;
  description: string;
}

export interface CacheSuggestionInput {
  modality: ModalityType;
  technicalLevel: TechnicalLevelOption;
  distanceKm: number;
  urgency: CacheUrgencyLevel;
  rating?: number;
  matchesPlayed?: number;
  pinnedTier?: PricingTierCode | null;
  arenaName?: string;
  city?: string;
}

export interface CacheSuggestionResult {
  suggestedPrice: number;
  minPrice: number;
  maxPrice: number;
  tierCode: PricingTierCode;
  tierNumber: 1 | 2 | 3;
  tierLabel: string;
  goalkeeperNet: number;
  houseFee: number;
  autoClassifiedTier: GoalkeeperPricingTier;
  breakdown: {
    baseModality: number;
    technicalBonus: number;
    distanceAllowance: number;
    urgencyBonus: number;
    goalkeeperNet: number;
    houseFee: number;
  };
  rationale: string;
  tips: string[];
  source: 'gemini-ai' | 'smart-engine';
}

export interface WalletDashboardSummary {
  walletBalance: number;
  pendingCustodyBalance: number;
  cashbackBalance: number;
  totalMatchEarnings: number;
  totalPixWithdrawn: number;
  transactions: Transaction[];
  syncedFromSupabase: boolean;
}

export interface ShopProduct {
  id: string;
  name: string;
  brand: string;
  category: 'Luvas' | 'Chuteiras' | 'Acessórios' | 'Kits GK';
  price: number;
  originalPrice: number;
  cashbackPercent: number;
  image: string;
  rating: number;
  tag?: string;
  description: string;
}

export type ArenaSurfaceType =
  | 'Grama Sintética'
  | 'Grama Natural'
  | 'Quadra de Areia'
  | 'Futsal Indoor';

export type ArenaModerationStatus = 'approved' | 'pending' | 'archived';

export interface ArenaField {
  id: string;
  name: string;
  address: string;
  city: string;
  neighborhood?: string;
  phone: string;
  instagram?: string;
  surfaceType: ArenaSurfaceType;
  mainModality: ModalityType;
  photoUrl: string;
  isLogoPhoto?: boolean;
  description?: string;
  status: ArenaModerationStatus;
  submittedById?: string;
  submittedByName?: string;
  submittedByEmail?: string;
  isOfficialSeed?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type AdminPixWithdrawalStatus = 'pending' | 'approved' | 'rejected';

export interface AdminPixWithdrawal {
  id: string;
  userId: string;
  athleteName: string;
  athleteEmail?: string;
  athleteNickname?: string;
  pixKey: string;
  pixKeyType: 'cpf' | 'phone' | 'email' | 'random';
  grossAmount: number;
  houseFee: number;
  netPayout: number;
  requestedAmount: number;
  status: AdminPixWithdrawalStatus;
  receiptCode: string;
  adminNotes?: string;
  rejectionReason?: string;
  matchId?: string;
  arenaName?: string;
  provider: 'mercadopago';
  requestedAt: string;
  processedAt?: string;
  processedBy?: string;
}

export type MercadoPagoWebhookEventType =
  | 'payment.confirmed'
  | 'custody.released'
  | 'withdrawal.processed'
  | 'withdrawal.rejected';

export interface MercadoPagoWebhookConfig {
  id: string;
  webhookUrl: string;
  signingSecret: string;
  isActive: boolean;
  subscribedEvents: MercadoPagoWebhookEventType[];
  updatedAt: string;
  updatedBy?: string;
}

export interface MercadoPagoWebhookLog {
  id: string;
  event: string;
  endpointUrl: string;
  httpStatus: number;
  hmacValid: boolean;
  signatureHeader: string;
  payload: Record<string, any>;
  responseBody?: Record<string, any>;
  source: 'live' | 'test_dispatch';
  createdAt: string;
}


