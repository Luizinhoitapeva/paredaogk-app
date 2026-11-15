import {
  CacheSuggestionInput,
  CacheSuggestionResult,
  GoalkeeperPricingTier,
  MatchBooking,
  PricingTierCode,
  TechnicalLevelOption,
} from '../types';

export const ITAPEVA_HOUSE_FEE = 5;

export const ITAPEVA_PRICING_TIERS: GoalkeeperPricingTier[] = [
  {
    tierCode: 'faixa_1',
    tierNumber: 1,
    label: 'Faixa 1 (Iniciante)',
    shortLabel: 'Faixa 1 · Iniciante',
    technicalLevelLabel: 'Iniciante',
    totalPrice: 20,
    goalkeeperNet: 15,
    houseFee: 5,
    ratingRule: 'Nota média < 4.8',
    description: 'R$ 15,00 líquido para o goleiro + R$ 5,00 taxa da casa',
  },
  {
    tierCode: 'faixa_2',
    tierNumber: 2,
    label: 'Faixa 2 (Intermediário)',
    shortLabel: 'Faixa 2 · Intermediário',
    technicalLevelLabel: 'Intermediário',
    totalPrice: 25,
    goalkeeperNet: 20,
    houseFee: 5,
    ratingRule: 'Nota média entre 4.8 e 4.9',
    description: 'R$ 20,00 líquido para o goleiro + R$ 5,00 taxa da casa',
  },
  {
    tierCode: 'faixa_3',
    tierNumber: 3,
    label: 'Faixa 3 (Elite / Avançado)',
    shortLabel: 'Faixa 3 · Elite / Avançado',
    technicalLevelLabel: 'Elite / Avançado',
    totalPrice: 30,
    goalkeeperNet: 25,
    houseFee: 5,
    ratingRule: 'Nota média acima de 4.9',
    description: 'R$ 25,00 líquido para o goleiro + R$ 5,00 taxa da casa',
  },
];

export function getTierByCode(tierCode?: PricingTierCode | null): GoalkeeperPricingTier {
  return (
    ITAPEVA_PRICING_TIERS.find((t) => t.tierCode === tierCode) || ITAPEVA_PRICING_TIERS[1]
  );
}

export function getTierByTotalPrice(price?: number | null): GoalkeeperPricingTier {
  const num = Number(price || 25);
  if (num <= 22) return ITAPEVA_PRICING_TIERS[0];
  if (num <= 27) return ITAPEVA_PRICING_TIERS[1];
  return ITAPEVA_PRICING_TIERS[2];
}

export function getTierByTechnicalLevel(level?: string | null): GoalkeeperPricingTier {
  if (level === 'Iniciante') return ITAPEVA_PRICING_TIERS[0];
  if (level === 'Intermediário') return ITAPEVA_PRICING_TIERS[1];
  return ITAPEVA_PRICING_TIERS[2];
}

export function technicalLevelToTierOption(tierCode: PricingTierCode): TechnicalLevelOption {
  if (tierCode === 'faixa_1') return 'Iniciante';
  if (tierCode === 'faixa_2') return 'Intermediário';
  return 'Elite / Profissional';
}

/**
 * Classificação automática oficial do goleiro nas 3 faixas de Itapeva (SP)
 * com base na nota média e histórico de partidas:
 * - Nota < 4.8 -> Faixa 1 (Iniciante: R$ 20 total = R$ 15 GK + R$ 5 casa)
 * - Nota entre 4.8 e 4.9 (inclusive) -> Faixa 2 (Intermediário: R$ 25 total = R$ 20 GK + R$ 5 casa)
 * - Nota > 4.9 -> Faixa 3 (Elite / Avançado: R$ 30 total = R$ 25 GK + R$ 5 casa)
 * Obs.: Goleiros recém-cadastrados sem histórico (< 3 jogos e nota padrão) iniciam na Faixa 1 ou conforme rating auditado.
 */
export function classifyGoalkeeperTier(params: {
  rating?: number | null;
  matchesPlayed?: number | null;
  technicalLevel?: string | null;
}): GoalkeeperPricingTier {
  const hasRating = typeof params.rating === 'number' && !Number.isNaN(params.rating) && params.rating > 0;
  const rating = hasRating ? Number(params.rating) : 4.85;
  const matchesPlayed = Number(params.matchesPlayed ?? 0);

  if (rating < 4.8) {
    return ITAPEVA_PRICING_TIERS[0];
  }
  if (rating > 4.9) {
    // Caso o goleiro tenha 0 jogos registrados ainda, mas nota padrão inicial (ex: 5.0 de cadastro), mantém coerência se explicitamente Iniciante
    if (matchesPlayed === 0 && params.technicalLevel === 'Iniciante') {
      return ITAPEVA_PRICING_TIERS[0];
    }
    return ITAPEVA_PRICING_TIERS[2];
  }
  return ITAPEVA_PRICING_TIERS[1];
}

/**
 * Calcula a divisão financeira líquida para uma partida no modelo de taxa fixa de R$ 5,00 da casa.
 */
export function getGoalkeeperNetAndFee(totalPrice: number, customHouseFee?: number): {
  totalPrice: number;
  houseFee: number;
  goalkeeperNet: number;
  tier: GoalkeeperPricingTier;
} {
  const cleanTotal = Math.max(0, Number(totalPrice || 0));
  const houseFee = cleanTotal > 0 ? Math.min(cleanTotal, customHouseFee ?? ITAPEVA_HOUSE_FEE) : 0;
  const goalkeeperNet = Number(Math.max(0, cleanTotal - houseFee).toFixed(2));
  return {
    totalPrice: cleanTotal,
    houseFee,
    goalkeeperNet,
    tier: getTierByTotalPrice(cleanTotal),
  };
}

export function getMatchGoalkeeperNetPayout(match: Partial<MatchBooking>): number {
  if (typeof match.goalkeeperPayout === 'number' && !Number.isNaN(match.goalkeeperPayout)) {
    return match.goalkeeperPayout;
  }
  const total = Number(match.price || 0);
  if (total <= 0) return 0;
  const fee = typeof match.houseFee === 'number' ? match.houseFee : ITAPEVA_HOUSE_FEE;
  return Number(Math.max(0, total - fee).toFixed(2));
}

/**
 * Motor inteligente determinístico de precificação regional de Itapeva (SP) em 3 faixas fixas
 * (R$ 20, R$ 25 e R$ 30) com taxa fixa da casa de R$ 5,00.
 */
export function calculateSmartCacheEstimate(input: CacheSuggestionInput): CacheSuggestionResult {
  const autoClassifiedTier = classifyGoalkeeperTier({
    rating: input.rating,
    matchesPlayed: input.matchesPlayed,
    technicalLevel: input.technicalLevel,
  });

  // Se o usuário fixou uma faixa manualmente, respeita; caso contrário, pondera nível + classificação + contexto
  let chosenTier: GoalkeeperPricingTier;
  if (input.pinnedTier) {
    chosenTier = getTierByCode(input.pinnedTier);
  } else {
    const levelTier = getTierByTechnicalLevel(input.technicalLevel);
    // Combina nota/histórico com o nível técnico selecionado e urgência/distância
    let tierScore =
      typeof input.rating === 'number' && input.rating > 0
        ? autoClassifiedTier.tierNumber
        : levelTier.tierNumber;

    // Se o nível técnico escolhido for explicitamente diferente e não houver rating travado, segue o nível
    if (typeof input.rating !== 'number' || input.rating <= 0) {
      tierScore = levelTier.tierNumber;
    } else if (input.technicalLevel === 'Iniciante' && tierScore > 1) {
      tierScore = 1;
    } else if (input.technicalLevel === 'Elite / Profissional' || input.technicalLevel === 'Avançado') {
      tierScore = Math.max(tierScore, input.rating > 4.9 ? 3 : 2) as 1 | 2 | 3;
    }

    // Urgência SOS (<2h) ou Campo 11 com deslocamento maior pode promover 1 faixa até o teto da Faixa 3 (R$ 30)
    if (
      (input.urgency === 'sos_urgent' || (input.modality === 'Campo 11' && input.distanceKm >= 10)) &&
      tierScore < 3
    ) {
      tierScore = (tierScore + 1) as 1 | 2 | 3;
    }

    chosenTier =
      ITAPEVA_PRICING_TIERS.find((t) => t.tierNumber === tierScore) || ITAPEVA_PRICING_TIERS[1];
  }

  const clampedKm = Math.max(1, Math.min(30, Math.round(input.distanceKm || 4)));
  const urgencyLabel =
    input.urgency === 'sos_urgent'
      ? 'chamada de emergência SOS (<2h)'
      : input.urgency === 'same_day'
      ? 'convocação para o mesmo dia'
      : 'agendamento antecipado';

  const ratingContext =
    typeof input.rating === 'number' && input.rating > 0
      ? ` (nota média ${input.rating.toFixed(2)}★ e ${input.matchesPlayed ?? 0} jogos)`
      : '';

  const rationale = `${chosenTier.label} selecionada para ${input.modality} a ${clampedKm} km (${urgencyLabel})${ratingContext}: total de R$ ${chosenTier.totalPrice},00 via Pix CajuPay, sendo R$ ${chosenTier.goalkeeperNet},00 líquido para o goleiro e R$ ${ITAPEVA_HOUSE_FEE},00 de taxa fixa da casa.`;

  const tips = [
    `Tabela oficial Itapeva (SP): Faixa 1 R$ 20 (<4.8★) · Faixa 2 R$ 25 (4.8–4.9★) · Faixa 3 R$ 30 (>4.9★).`,
    input.urgency === 'sos_urgent'
      ? 'Chamadas SOS priorizam goleiros próximos com repasse integral sem alteração na taxa fixa de R$ 5,00.'
      : `Taxa fixa única de R$ ${ITAPEVA_HOUSE_FEE},00 da plataforma garante custódia CajuPay e seguro atleta.`,
  ];

  return {
    suggestedPrice: chosenTier.totalPrice,
    minPrice: 20,
    maxPrice: 30,
    tierCode: chosenTier.tierCode,
    tierNumber: chosenTier.tierNumber,
    tierLabel: chosenTier.label,
    goalkeeperNet: chosenTier.goalkeeperNet,
    houseFee: ITAPEVA_HOUSE_FEE,
    autoClassifiedTier,
    breakdown: {
      baseModality: chosenTier.goalkeeperNet,
      technicalBonus: 0,
      distanceAllowance: 0,
      urgencyBonus: 0,
      goalkeeperNet: chosenTier.goalkeeperNet,
      houseFee: ITAPEVA_HOUSE_FEE,
    },
    rationale,
    tips,
    source: 'smart-engine',
  };
}

/**
 * Consulta a rota server-side /api/sugerir-cache-ia (Gemini + Motor Regional de Itapeva)
 * garantindo que a resposta respeite sempre as 3 faixas fixas (R$ 20, R$ 25 ou R$ 30).
 */
export async function fetchAiCacheSuggestion(
  input: CacheSuggestionInput
): Promise<CacheSuggestionResult> {
  const baseline = calculateSmartCacheEstimate(input);

  try {
    const response = await fetch('/api/sugerir-cache-ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...input,
        baseline,
      }),
    });

    if (!response.ok) {
      return baseline;
    }

    const rawText = await response.text();
    const trimmed = rawText.trim();
    if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
      return baseline;
    }

    const data = JSON.parse(trimmed);
    if (data && data.success && data.suggestion) {
      const tier = getTierByTotalPrice(data.suggestion.suggestedPrice);
      return {
        ...baseline,
        suggestedPrice: tier.totalPrice,
        minPrice: 20,
        maxPrice: 30,
        tierCode: tier.tierCode,
        tierNumber: tier.tierNumber,
        tierLabel: tier.label,
        goalkeeperNet: tier.goalkeeperNet,
        houseFee: ITAPEVA_HOUSE_FEE,
        breakdown: {
          ...baseline.breakdown,
          baseModality: tier.goalkeeperNet,
          goalkeeperNet: tier.goalkeeperNet,
          houseFee: ITAPEVA_HOUSE_FEE,
        },
        rationale: data.suggestion.rationale || baseline.rationale,
        tips:
          Array.isArray(data.suggestion.tips) && data.suggestion.tips.length > 0
            ? data.suggestion.tips
            : baseline.tips,
        source: data.suggestion.source || 'gemini-ai',
      };
    }

    return baseline;
  } catch {
    return baseline;
  }
}
