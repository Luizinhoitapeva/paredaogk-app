import { ArenaField, Goalkeeper, MatchBooking } from '../types';

export type ArenaMatchReason = 'direct_match' | 'address_proximity' | 'neighborhood_match' | null;

export interface ArenaProximityEvaluation {
  matched: boolean;
  reason: ArenaMatchReason;
  matchedArenaName?: string;
  matchedAddress?: string;
  score: number;
}

export interface ArenaSuggestion {
  arenaName: string;
  address: string;
  city: string;
  matchesCount: number;
}

const URBAN_ZONE_KEYWORDS: Record<string, string[]> = {
  zona_oeste: [
    'pinheiros',
    'vila madalena',
    'madalena',
    'pompeia',
    'perdizes',
    'barra funda',
    'jaguare',
    'lapa',
    'butanta',
    'agua branca',
    'nicolas boer',
    'playball',
    'vila anglo',
  ],
  zona_sul: [
    'morumbi',
    'moema',
    'ibirapuera',
    'vila olimpia',
    'olimpia',
    'itaim',
    'brooklin',
    'santo amaro',
    'giovanni gronchi',
    'marechal estenio',
    'paraiso',
    'vila mariana',
    'campo belo',
    'roberto gomes pedrosa',
  ],
  zona_norte: [
    'santana',
    'tucuruvi',
    'casa verde',
    'freguesia',
    'mandaqui',
    'parada inglesa',
  ],
  zona_leste: [
    'tatuape',
    'mooca',
    'itaquera',
    'penha',
    'analia franco',
    'vila prudente',
  ],
  centro: [
    'centro',
    'bela vista',
    'consolacao',
    'paulista',
    'republica',
    'higienopolis',
    'augusta',
  ],
  osasco: [
    'osasco',
    'presidente altino',
    'carapicuiba',
  ],
  itapeva: [
    'itapeva',
    'jardim ferrari',
    'ferrari',
    'benjamin constant',
    'distrito industrial',
    'antonio moulatlet',
    'recanto pilao',
    'pilao dagua',
    'belletti',
    'jades',
    'araxa',
    'arena itapeva',
  ],
};

export function normalizeSearchText(value?: string | null): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeQuery(query: string): string[] {
  const stopWords = new Set(['de', 'da', 'do', 'dos', 'das', 'em', 'na', 'no', 'av', 'avenida', 'rua', 'r']);
  return normalizeSearchText(query)
    .split(/[\s,.-]+/)
    .filter((token) => token.length >= 2 && !stopWords.has(token));
}

export function getMatchingUrbanZones(text: string): string[] {
  const normalized = normalizeSearchText(text);
  if (!normalized) return [];

  return Object.entries(URBAN_ZONE_KEYWORDS)
    .filter(([, keywords]) => keywords.some((kw) => normalized.includes(kw)))
    .map(([zone]) => zone);
}

/**
 * Filtra a lista de partidas cujos dados de arena, endereço ou cidade correspondem ao termo buscado.
 */
export function findMatchingArenasFromMatches(
  arenaQuery: string,
  matches: MatchBooking[]
): MatchBooking[] {
  const normalizedQuery = normalizeSearchText(arenaQuery);
  if (!normalizedQuery) return [];

  const tokens = tokenizeQuery(arenaQuery);

  return matches.filter((match) => {
    const searchable = normalizeSearchText(
      `${match.arenaName || ''} ${match.address || ''} ${match.city || ''}`
    );
    if (!searchable) return false;
    if (searchable.includes(normalizedQuery)) return true;
    return tokens.length > 0 && tokens.every((token) => searchable.includes(token));
  });
}

/**
 * Extrai arenas únicas a partir da lista de partidas para exibição de sugestões rápidas.
 */
export function getUniqueArenasFromMatches(
  matches: MatchBooking[],
  approvedArenas: ArenaField[] = []
): ArenaSuggestion[] {
  const map = new Map<string, ArenaSuggestion>();

  for (const arena of approvedArenas) {
    if (arena.status !== 'approved' || !arena.name) continue;
    const key = normalizeSearchText(arena.name);
    map.set(key, {
      arenaName: arena.name,
      address: arena.address || '',
      city: arena.city || 'Itapeva - SP',
      matchesCount: 1,
    });
  }

  for (const match of matches) {
    if (!match.arenaName) continue;
    const key = normalizeSearchText(match.arenaName);
    const existing = map.get(key);
    if (existing) {
      existing.matchesCount += 1;
    } else {
      map.set(key, {
        arenaName: match.arenaName,
        address: match.address || '',
        city: match.city || '',
        matchesCount: 1,
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Avalia se um goleiro corresponde à busca por nome de arena ou proximidade de endereço
 * utilizando os registros da lista de partidas.
 */
export function evaluateGoalkeeperArenaProximity(
  gk: Partial<Goalkeeper> & { id?: string; name?: string; nickname?: string; neighborhood?: string; city?: string; distanceKm?: number; availableToday?: boolean },
  arenaQuery: string,
  matches: MatchBooking[]
): ArenaProximityEvaluation {
  const normalizedQuery = normalizeSearchText(arenaQuery);
  if (!normalizedQuery) {
    return { matched: true, reason: null, score: 0 };
  }

  const matchedMatches = findMatchingArenasFromMatches(arenaQuery, matches);
  const gkName = normalizeSearchText(gk.name);
  const gkNickname = normalizeSearchText(gk.nickname);
  const gkLocationText = normalizeSearchText(`${gk.neighborhood || ''} ${gk.city || ''}`);
  const gkZones = getMatchingUrbanZones(gkLocationText);
  const distanceKm = Number(gk.distanceKm ?? 5);
  const availabilityBonus = gk.availableToday ? 20 : 0;

  // 1. Correspondência direta com partidas na arena/endereço pesquisado
  for (const match of matchedMatches) {
    const matchGkName = normalizeSearchText(match.goalkeeperName);
    const isSameId = Boolean(match.goalkeeperId && gk.id && match.goalkeeperId === gk.id);
    const isSameName = Boolean(
      matchGkName &&
        ((gkName && (matchGkName.includes(gkName) || gkName.includes(matchGkName))) ||
          (gkNickname && (matchGkName.includes(gkNickname) || gkNickname.includes(matchGkName))))
    );

    if (isSameId || isSameName) {
      return {
        matched: true,
        reason: 'direct_match',
        matchedArenaName: match.arenaName,
        matchedAddress: match.address,
        score: 100 + availabilityBonus - distanceKm,
      };
    }
  }

  // 2. Proximidade geográfica com o endereço/zona da(s) partida(s) encontrada(s)
  if (matchedMatches.length > 0) {
    for (const match of matchedMatches) {
      const matchLocationText = normalizeSearchText(
        `${match.arenaName || ''} ${match.address || ''} ${match.city || ''}`
      );
      const matchZones = getMatchingUrbanZones(matchLocationText);
      const sharesZone = gkZones.some((z) => matchZones.includes(z));
      const neighborhoodInAddress = Boolean(
        gk.neighborhood && matchLocationText.includes(normalizeSearchText(gk.neighborhood))
      );
      const sameCityAndClose = Boolean(
        match.city &&
          gk.city &&
          normalizeSearchText(match.city) === normalizeSearchText(gk.city) &&
          distanceKm <= 4.5
      );

      if (sharesZone || neighborhoodInAddress || sameCityAndClose) {
        return {
          matched: true,
          reason: 'address_proximity',
          matchedArenaName: match.arenaName,
          matchedAddress: match.address,
          score: 65 + availabilityBonus - distanceKm,
        };
      }
    }
  }

  // 3. Fallback inteligente: termo digitado corresponde diretamente ao bairro, cidade ou zona do goleiro
  const queryZones = getMatchingUrbanZones(normalizedQuery);
  const queryTokens = tokenizeQuery(arenaQuery);
  const directLocationMatch =
    gkLocationText.includes(normalizedQuery) ||
    (queryTokens.length > 0 && queryTokens.every((t) => gkLocationText.includes(t))) ||
    gkZones.some((z) => queryZones.includes(z));

  if (directLocationMatch) {
    return {
      matched: true,
      reason: 'neighborhood_match',
      score: 40 + availabilityBonus - distanceKm,
    };
  }

  return { matched: false, reason: null, score: 0 };
}
