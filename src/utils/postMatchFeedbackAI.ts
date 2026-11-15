import {
  PostMatchAiFeedbackInput,
  PostMatchAiFeedbackResult,
  PostMatchStrengthCriterion,
} from '../types';

export const ALLOWED_REVIEW_TAGS = [
  '🧤 Fechou o Gol',
  '⚽ Pegou Pênalti',
  '⏱️ Pontualidade 100%',
  '🚀 Reposição Rápida',
  '🗣️ Comando de Zaga',
  '🔥 Reflexo Puro',
  '🛡️ Saída Aérea Firme',
  '🤝 Fair Play Exemplar',
] as const;

function clampScore(value: number, min = 1, max = 5): number {
  return Number(Math.max(min, Math.min(max, value)).toFixed(1));
}

/**
 * Motor determinístico local para avaliação pós-partida (Modo Offline / Fallback seguro).
 * Estrutura automaticamente os pontos fortes (defesas difíceis, saída de gol, reposição),
 * consolida a nota final de 1 a 5 estrelas e redige parecer técnico para o histórico.
 */
export function calculateDeterministicPostMatchFeedback(
  input: PostMatchAiFeedbackInput
): PostMatchAiFeedbackResult {
  const savesScore = clampScore(
    3.1 + Math.min(1.5, input.hardSavesCount * 0.28) + (input.penaltiesSaved > 0 ? 0.45 : 0) - Math.max(0, input.goalsConceded - 3) * 0.25
  );

  const aerialBase =
    input.aerialExitQuality === 'firme' ? 4.8 : input.aerialExitQuality === 'segura' ? 4.2 : 3.2;
  const aerialScore = clampScore(aerialBase - (input.goalsConceded >= 5 ? 0.4 : 0));

  const distributionScore = clampScore(
    input.distributionQuality === 'excelente' ? 4.9 : input.distributionQuality === 'boa' ? 4.2 : 3.3
  );

  const leadershipBase = input.punctualityOnTime ? 4.8 : 3.0;
  const obsLower = (input.matchObservations || '').toLowerCase();
  const hasLeadershipNote =
    obsLower.includes('zaga') ||
    obsLower.includes('comunic') ||
    obsLower.includes('lider') ||
    obsLower.includes('orient');
  const leadershipScore = clampScore(leadershipBase + (hasLeadershipNote ? 0.2 : 0));

  const weightedRaw =
    savesScore * 0.4 + aerialScore * 0.25 + distributionScore * 0.2 + leadershipScore * 0.15;

  let consolidatedRating = Math.round(weightedRaw);
  if (input.goalsConceded === 0 && input.hardSavesCount >= 4 && input.punctualityOnTime) {
    consolidatedRating = 5;
  }
  if (!input.punctualityOnTime && consolidatedRating > 3) {
    consolidatedRating = Math.max(2, consolidatedRating - 1);
  }
  consolidatedRating = Math.max(1, Math.min(5, consolidatedRating));

  const strengths: PostMatchStrengthCriterion[] = [
    {
      criterion: 'Defesas Difíceis & Reflexo',
      score: savesScore,
      highlight:
        input.penaltiesSaved > 0
          ? `${input.hardSavesCount} defesa(s) decisiva(s) e ${input.penaltiesSaved} pênalti(s) defendido(s) em momento chave.`
          : input.hardSavesCount >= 5
          ? `Volume alto com ${input.hardSavesCount} defesas difíceis que seguraram o placar na ${input.arenaName}.`
          : `Atuação consistente com ${input.hardSavesCount} intervenção(ões) segura(s) sob a meta.`,
    },
    {
      criterion: 'Saída de Gol & Cobertura',
      score: aerialScore,
      highlight:
        input.aerialExitQuality === 'firme'
          ? 'Tempo de bola preciso nas saídas aéreas e encurtamento de ângulo no mano a mano.'
          : input.aerialExitQuality === 'segura'
          ? 'Boa leitura de profundidade para cortar cruzamentos e bolas alçadas na área.'
          : 'Manteve atenção na pequena área, com espaço para antecipar mais bolas longas.',
    },
    {
      criterion: 'Reposição & Jogo com os Pés',
      score: distributionScore,
      highlight:
        input.distributionQuality === 'excelente'
          ? `Ligação rápida de contra-ataque e passes limpos sob pressão no ${input.modality}.`
          : input.distributionQuality === 'boa'
          ? 'Distribuição equilibrada com as mãos e os pés para dar saída à equipe.'
          : 'Priorizou lançamentos de segurança sem comprometer a posse defensiva.',
    },
    {
      criterion: 'Pontualidade & Comando',
      score: leadershipScore,
      highlight: input.punctualityOnTime
        ? 'Chegada no horário previsto, postura firme na organização da marcação e fair play.'
        : 'Compromisso competitivo em quadra, com ponto de ajuste no horário de apresentação.',
    },
  ];

  // Ordenar pontos fortes do maior para o menor score
  strengths.sort((a, b) => b.score - a.score);

  const cleanSheet = input.goalsConceded === 0;
  const isMvp = consolidatedRating === 5 || input.penaltiesSaved > 0 || (cleanSheet && input.hardSavesCount >= 4);

  const suggestedTags: string[] = [];
  if (consolidatedRating >= 4 || input.hardSavesCount >= 4) suggestedTags.push('🧤 Fechou o Gol');
  if (input.penaltiesSaved > 0) suggestedTags.push('⚽ Pegou Pênalti');
  if (input.punctualityOnTime) suggestedTags.push('⏱️ Pontualidade 100%');
  if (input.distributionQuality === 'excelente') suggestedTags.push('🚀 Reposição Rápida');
  if (hasLeadershipNote || consolidatedRating >= 4) suggestedTags.push('🗣️ Comando de Zaga');
  if (input.hardSavesCount >= 6) suggestedTags.push('🔥 Reflexo Puro');
  if (input.aerialExitQuality === 'firme') suggestedTags.push('🛡️ Saída Aérea Firme');
  if (suggestedTags.length < 2) suggestedTags.push('🤝 Fair Play Exemplar');

  const topStrength = strengths[0]?.criterion || 'Defesas Difíceis';
  const secondStrength = strengths[1]?.criterion || 'Saída de Gol';

  const analyticalSummary =
    input.authorRole === 'goleiro'
      ? `Autoanálise técnica na ${input.arenaName} (${input.modality}): desempenho consolidado em ${consolidatedRating}.0★ com destaque principal para ${topStrength} (${strengths[0].score.toFixed(1)}/5) e ${secondStrength} (${strengths[1].score.toFixed(1)}/5).`
      : `Análise de performance de ${input.goalkeeperName} na ${input.arenaName} (${input.modality}): nota consolidada ${consolidatedRating}.0★, somando ${input.hardSavesCount} defesa(s) difícil(eis)${cleanSheet ? ' e meta invicta (Clean Sheet)' : ` com ${input.goalsConceded} gol(s) sofrido(s)`}.`;

  const obsSnippet = input.matchObservations?.trim()
    ? ` Observação registrada: ${input.matchObservations.trim().replace(/\.+$/, '')}.`
    : '';

  const technicalOpinion =
    input.authorRole === 'goleiro'
      ? `Atuação sólida no ${input.modality} na ${input.arenaName}: registrei ${input.hardSavesCount} defesas difíceis${input.penaltiesSaved > 0 ? ` e ${input.penaltiesSaved} pênalti(s) defendido(s)` : ''}, mantendo ${input.distributionQuality === 'excelente' ? 'reposição rápida para acelerar a transição ofensiva' : 'saída segura com a linha defensiva'} e saída de gol ${input.aerialExitQuality}.${obsSnippet}`
      : `${input.goalkeeperName} teve excelente leitura de jogo no ${input.modality} na ${input.arenaName}. Destacou-se em ${topStrength.toLowerCase()} (${input.hardSavesCount} defesas importantes${input.penaltiesSaved > 0 ? ` e ${input.penaltiesSaved} pênalti(s) pego(s)` : ''}), apresentou saída de gol ${input.aerialExitQuality} e reposição ${input.distributionQuality}.${cleanSheet ? ' Terminou a partida sem sofrer gols (Clean Sheet).' : ''}${obsSnippet}`;

  const lowestCriterion = strengths[strengths.length - 1];
  const improvementPoint = !input.punctualityOnTime
    ? 'Reforçar a chegada com 15 minutos de antecedência para aquecimento pré-jogo.'
    : lowestCriterion.score < 4.0
    ? `Evoluir em ${lowestCriterion.criterion.toLowerCase()} para manter regularidade nos jogos competitivos.`
    : 'Manter a comunicação constante com os zagueiros em bolas paradas e contra-ataques rápidos.';

  return {
    consolidatedRating,
    analyticalSummary,
    technicalOpinion,
    strengths,
    improvementPoint,
    suggestedTags: suggestedTags.slice(0, 5),
    suggestedCleanSheet: cleanSheet,
    suggestedPenaltiesSaved: input.penaltiesSaved,
    suggestedIsMvp: isMvp,
    source: 'offline-engine',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Solicita o Feedback Pós-Partida AI via rota server-side (/api/feedback-pos-partida-ia),
 * com fallback determinístico automático caso offline ou sem resposta da API.
 */
export async function fetchPostMatchAiFeedback(
  input: PostMatchAiFeedbackInput
): Promise<PostMatchAiFeedbackResult> {
  const baseline = calculateDeterministicPostMatchFeedback(input);

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return baseline;
  }

  try {
    const response = await fetch('/api/feedback-pos-partida-ia', {
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
    if (data && data.success && data.feedback) {
      return {
        ...baseline,
        ...data.feedback,
      };
    }

    return baseline;
  } catch {
    return baseline;
  }
}
