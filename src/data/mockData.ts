import { UserProfile, Goalkeeper, MatchBooking, Conversation, NotificationItem, Transaction, ShopProduct, WeeklyMatchTemplate, ArenaField } from '../types';

export const INITIAL_USER: UserProfile = {
  id: 'usr-guest',
  name: 'Visitante ParedãoGK',
  nickname: 'Itapeva',
  cpf: '',
  isCpfVerified: false,
  email: '',
  phone: '',
  birthDate: '',
  age: 18,
  role: 'contratante',
  avatarUrl: '',
  rating: 5.0,
  matchesPlayed: 0,
  cleanSheets: 0,
  penaltiesSaved: 0,
  mvpCount: 0,
  city: 'Itapeva - SP',
  neighborhood: 'Centro',
  height: '1.85m',
  dominantFoot: 'destro',
  categories: ['society', 'futsal', 'campo'],
  favoriteGloves: '',
  walletBalance: 0.00,
  pendingBalance: 0.00,
  cashbackBalance: 0.00,
  preferredCache: 20,
  technicalLevel: 'Iniciante',
  pricingTier: 'faixa_1',
  isEliteMember: false,
  createdAt: new Date().toISOString(),
};

export const MOCK_GOALKEEPERS: Goalkeeper[] = [];

export const MOCK_MATCHES: MatchBooking[] = [];

export const INITIAL_WEEKLY_TEMPLATES: WeeklyMatchTemplate[] = [];

export const INITIAL_FAVORITE_GOALKEEPER_IDS: string[] = [];

export const MOCK_CONVERSATIONS: Conversation[] = [];

export const MOCK_NOTIFICATIONS: NotificationItem[] = [];

export const MOCK_TRANSACTIONS: Transaction[] = [];

export const MOCK_SHOP_PRODUCTS: ShopProduct[] = [
  {
    id: 'prod-1',
    name: 'Luva Profissional Penalty Delta Pro Rollfinger',
    brand: 'Penalty',
    category: 'Luvas',
    price: 189.90,
    originalPrice: 249.90,
    cashbackPercent: 12,
    image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=300&h=300&q=80',
    rating: 4.9,
    tag: 'Mais Vendida',
    description: 'Látex natural 4mm alemão com corte rollfinger para amortecimento total em chutes fortes no society.'
  },
  {
    id: 'prod-2',
    name: 'Luva Poker Champion Deep Grip Palma Contact',
    brand: 'Poker',
    category: 'Luvas',
    price: 219.00,
    originalPrice: 289.00,
    cashbackPercent: 15,
    image: 'https://images.unsplash.com/photo-1511886929837-354d827aae26?auto=format&fit=crop&w=300&h=300&q=80',
    rating: 4.95,
    tag: 'Elite GK',
    description: 'Aderência máxima mesmo em grama molhada ou chuvosa. Munhequeira elástica reforçada com fecho duplo.'
  },
  {
    id: 'prod-3',
    name: 'Kit Protetor Joelheira + Cotoveleira GK Indoor',
    brand: 'ArenaDraft Gear',
    category: 'Acessórios',
    price: 89.90,
    originalPrice: 119.00,
    cashbackPercent: 10,
    image: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=300&h=300&q=80',
    rating: 4.8,
    tag: 'Anti-Impacto',
    description: 'Espuma injetada com alta densidade contra abrasão de quadras de futsal e grama sintética.'
  },
  {
    id: 'prod-4',
    name: 'Chuteira Society Nike Phantom GX Academy TF',
    brand: 'Nike',
    category: 'Chuteiras',
    price: 359.90,
    originalPrice: 429.90,
    cashbackPercent: 8,
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=300&h=300&q=80',
    rating: 4.9,
    tag: 'Precisão',
    description: 'Travas baixas com borracha aderente que proporciona estabilidade extrema nos saltos do goleiro.'
  }
];

export const TERMS_OF_USE_TEXT = {
  title: 'Termos de Uso, Código de Conduta e Regras Operacionais ParedãoGK',
  lastUpdated: '10 de Novembro de 2026',
  sections: [
    {
      title: '1. Regras de Ausência, Pontualidade e Penalidades de W.O.',
      content: `O compromisso com o horário e a presença é o pilar central do ParedãoGK. O goleiro contratado deve se apresentar no local da partida com antecedência mínima de 15 (quinze) minutos.

Em caso de ausência injustificada (W.O.):
- Suspensão imediata de 7 (sete) dias para novas convocações na plataforma;
- Aplicação de multa de 50% do valor do cachê da partida debitada diretamente da carteira digital;
- Em caso de reincidência, a conta será banida permanentemente do ecossistema ParedãoGK e ArenaDraft.`
    },
    {
      title: '2. Tabela Oficial de Cachês (Itapeva-SP) e Taxa Fixa da Casa',
      content: `O modelo regional de Itapeva (SP) utiliza 3 faixas fixas de convocação com taxa fixa única da casa de R$ 5,00 por partida para manutenção da custódia segura CajuPay e seguro atleta:
- Faixa 1 (Iniciante | Nota média < 4.8): R$ 20,00 total (R$ 15,00 para o goleiro + R$ 5,00 taxa da casa);
- Faixa 2 (Intermediário | Nota média entre 4.8 e 4.9): R$ 25,00 total (R$ 20,00 para o goleiro + R$ 5,00 taxa da casa);
- Faixa 3 (Elite / Avançado | Nota média acima de 4.9): R$ 30,00 total (R$ 25,00 para o goleiro + R$ 5,00 taxa da casa).

O contratante realiza o pagamento antecipado via Pix CajuPay. O repasse líquido do goleiro é liberado para saque instantâneo após o término do jogo.`
    },
    {
      title: '3. Seguro Atleta & Parceria ArenaDraft',
      content: `Todas as partidas contratadas e ativas pela plataforma contam com cobertura emergencial para acidentes pessoais durante o período da partida, contemplando reembolso de despesas médico-hospitalares (DMHO) de primeiros socorros em caso de fraturas ou entorses articulares.`
    },
    {
      title: '4. Requisitos Legais de Maioridade e Validação de CPF',
      content: `Para cadastrar-se como Contratante ou Goleiro no ParedãoGK, o usuário deve possuir no mínimo 16 (dezesseis) anos completos e fornecer um Cadastro de Pessoas Físicas (CPF) válido e ativo perante a Receita Federal do Brasil, sob pena de bloqueio cadastral.`
    },
    {
      title: '5. Código de Conduta, Respeito e Fair Play',
      content: `Agressões físicas, ofensas verbais ou atitudes antidesportivas acarretam expulsão sumária e processo administrativo interno. Os goleiros são parceiros do futebol amador e merecem respeito dentro e fora de campo.`
    },
    {
      title: '6. Suporte Oficial, Atendimento e Contato',
      content: `Para resolução de litígios, dúvidas sobre pagamentos Pix via CajuPay ou orientações contratuais, entre em contato diretamente com nossa equipe oficial:\n• E-mail: paredaogkbr@gmail.com\n• Plantão WhatsApp 24h: (15) 98159-6443`
    }
  ]
};

export const INITIAL_ITAPEVA_ARENAS: ArenaField[] = [
  {
    id: 'arena-itapeva-belletti',
    name: 'Arena Belletti Itapeva',
    address: 'R. Benjamin Constant, 990 - Jardim Ferrari, Itapeva - SP',
    city: 'Itapeva - SP',
    neighborhood: 'Jardim Ferrari',
    phone: '(15) 99128-9886',
    instagram: '@bellettiacademyitapeva',
    surfaceType: 'Grama Sintética',
    mainModality: 'Society',
    photoUrl: '/assets/aistudio/arena_belleti_5f1e1bb4.png',
    isLogoPhoto: false,
    description: 'Complexo esportivo completo com campo society oficial, estacionamento e estrutura premium.',
    status: 'approved',
    isOfficialSeed: true,
    createdAt: '2026-11-01T10:00:00.000Z',
  },
  {
    id: 'arena-itapeva-jades',
    name: 'Arena Jades Futebol Society',
    address: 'R. Antônio Moulatlet - Distrito Industrial, Itapeva - SP',
    city: 'Itapeva - SP',
    neighborhood: 'Distrito Industrial',
    phone: '(15) 99672-5203',
    instagram: '@arenajades',
    surfaceType: 'Grama Sintética',
    mainModality: 'Society',
    photoUrl: '/assets/aistudio/arena_jades_f46ee65b.png',
    isLogoPhoto: true,
    description: 'Quadra society tradicional em Itapeva com jogos semanais competitivos e peladas noturnas.',
    status: 'approved',
    isOfficialSeed: true,
    createdAt: '2026-11-01T10:05:00.000Z',
  },
  {
    id: 'arena-itapeva-araxa',
    name: 'Araxá Futebol Society e Escolinha',
    address: 'Itapeva - SP',
    city: 'Itapeva - SP',
    neighborhood: 'Itapeva',
    phone: '(15) 98134-3579',
    instagram: '@araxa_itapeva',
    surfaceType: 'Grama Sintética',
    mainModality: 'Fut7',
    photoUrl: '/assets/aistudio/arax__3ada295f.png',
    isLogoPhoto: true,
    description: 'Centro de futebol society e escolinha oficial com horários fixos para peladas e torneios.',
    status: 'approved',
    isOfficialSeed: true,
    createdAt: '2026-11-01T10:10:00.000Z',
  },
  {
    id: 'arena-itapeva-recanto',
    name: 'Arena Itapeva - Campo e Quadra Society',
    address: "Recanto Pilao D'agua, Itapeva - SP",
    city: 'Itapeva - SP',
    neighborhood: "Recanto Pilao D'agua",
    phone: '(15) 99771-8988',
    surfaceType: 'Grama Sintética',
    mainModality: 'Society',
    photoUrl: '/assets/aistudio/Arena_Itapeva_6f597b9b.png',
    isLogoPhoto: false,
    description: 'Quadra coberta com grama sintética de alta qualidade.',
    status: 'approved',
    isOfficialSeed: true,
    createdAt: '2026-11-01T10:15:00.000Z',
  },
];

