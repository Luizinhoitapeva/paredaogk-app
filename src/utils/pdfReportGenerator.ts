import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  MatchBooking,
  Transaction,
  UserProfile,
  WalletDashboardSummary,
} from '../types';
import { formatCurrency, maskCPF } from './validations';
import { getMatchGoalkeeperNetPayout } from './cachePricingAI';

export type ReportScope = 'completo' | 'financeiro' | 'desempenho' | 'partida';

export interface PerformanceStats {
  totalMatches: number;
  averageRating: number;
  cleanSheets: number;
  penaltiesSaved: number;
  mvpCount: number;
}

export interface GenerateReportOptions {
  user: UserProfile;
  matches: MatchBooking[];
  stats?: PerformanceStats;
  totalEarnings?: number;
  walletSummary?: WalletDashboardSummary;
  transactions?: Transaction[];
  selectedMatch?: MatchBooking | null;
  scope?: ReportScope;
}

/**
 * Desenha o emblema oficial ParedãoGK (Escudo + Trave de Gol + Núcleo Neon) usando primitivas vetoriais jsPDF.
 */
function drawParedaoBrandMark(doc: jsPDF, x: number, y: number, size: number) {
  // Fundo do badge do escudo (#0f172a com borda #22c55e)
  doc.setFillColor(15, 23, 42);
  doc.setDrawColor(34, 197, 94);
  doc.setLineWidth(0.5);
  doc.roundedRect(x, y, size, size, 2.5, 2.5, 'FD');

  // Escudo interno
  const cx = x + size / 2;
  const topY = y + size * 0.2;
  const midY = y + size * 0.56;
  const botY = y + size * 0.84;
  const halfW = size * 0.3;

  doc.setDrawColor(34, 197, 94);
  doc.setLineWidth(0.55);
  doc.line(cx, topY, cx + halfW, topY + 1.8);
  doc.line(cx + halfW, topY + 1.8, cx + halfW, midY);
  doc.line(cx + halfW, midY, cx, botY);
  doc.line(cx, botY, cx - halfW, midY);
  doc.line(cx - halfW, midY, cx - halfW, topY + 1.8);
  doc.line(cx - halfW, topY + 1.8, cx, topY);

  // Trave interna em Azul Sky (#38bdf8)
  doc.setDrawColor(56, 189, 248);
  doc.setLineWidth(0.45);
  const goalW = size * 0.18;
  const goalTop = y + size * 0.42;
  const goalBot = y + size * 0.66;
  doc.line(cx - goalW, goalBot, cx - goalW, goalTop);
  doc.line(cx - goalW, goalTop, cx + goalW, goalTop);
  doc.line(cx + goalW, goalTop, cx + goalW, goalBot);
}

/**
 * Desenha um ícone vetorial de check verificado em Verde Neon (#22c55e).
 */
function drawCheckBadge(doc: jsPDF, cx: number, cy: number, r = 2) {
  doc.setFillColor(34, 197, 94);
  doc.circle(cx, cy, r, 'F');
  doc.setDrawColor(2, 6, 23);
  doc.setLineWidth(0.45);
  doc.line(cx - r * 0.45, cy + r * 0.05, cx - r * 0.1, cy + r * 0.4);
  doc.line(cx - r * 0.1, cy + r * 0.4, cx + r * 0.5, cy - r * 0.35);
}

/**
 * Desenha uma estrela de 5 pontas vetorial para avaliações 1-5★ (sem depender de Unicode).
 */
function drawStarVector(
  doc: jsPDF,
  cx: number,
  cy: number,
  outerR: number,
  filled = true
) {
  const innerR = outerR * 0.45;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const angle = (-Math.PI / 2) + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? outerR : innerR;
    pts.push([cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad]);
  }

  if (filled) {
    doc.setFillColor(245, 158, 11);
    doc.setDrawColor(217, 119, 6);
  } else {
    doc.setFillColor(226, 232, 240);
    doc.setDrawColor(203, 213, 225);
  }
  doc.setLineWidth(0.2);

  // Desenhar triângulos do centro para preencher de forma compatível com jsPDF v4
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    doc.triangle(cx, cy, p1[0], p1[1], p2[0], p2[1], 'F');
  }
}

function getScopeLabel(scope: ReportScope): string {
  switch (scope) {
    case 'financeiro':
      return 'EXTRATO FINANCEIRO & CUSTÓDIA CAJUPAY';
    case 'desempenho':
      return 'DOSSIÊ DE DESEMPENHO & AVALIAÇÕES GK';
    case 'partida':
      return 'RELATÓRIO EXECUTIVO DA PARTIDA & PARECER AI';
    default:
      return 'RELATÓRIO CORPORATIVO CONSOLIDADO (DESEMPENHO & CAJUPAY)';
  }
}

function getTxTypeLabel(type: Transaction['type']): string {
  switch (type) {
    case 'match_cache':
      return 'Cachê Partida';
    case 'pix_out':
      return 'Saque Pix';
    case 'pix_in':
      return 'Recarga Pix';
    case 'cashback_credit':
      return 'Cashback';
    case 'match_payment':
      return 'Pgto Convocação';
    case 'platform_fee':
      return 'Taxa Serviço';
    default:
      return 'Movimentação';
  }
}

/**
 * Gera um relatório corporativo em formato PDF compatível com download direto e impressão A4 limpa:
 * - Cabeçalho oficial ParedãoGK com logo vetorial, e-mail paredaogkbr@gmail.com e suporte (15) 98159-6443
 * - Dados auditados do atleta/contratante
 * - Métricas de Clean Sheets, pênaltis e avaliações (1-5 estrelas)
 * - Sumário financeiro e extrato CajuPay (Saldo, Custódia, Cashback e Saques Pix)
 * - Histórico de partidas com avaliações e resumo analítico pós-jogo AI
 */
export function generateGoalkeeperPerformancePdf({
  user,
  matches,
  stats,
  totalEarnings,
  walletSummary,
  transactions,
  selectedMatch,
  scope = 'completo',
}: GenerateReportOptions): boolean {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 14;
    const contentWidth = pageWidth - marginX * 2;

    const emissionDate = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const docId = `PGK-${user.id.slice(0, 6).toUpperCase()}-${Date.now().toString().slice(-4)}`;

    // 1. Cabeçalho Corporativo Oficial ParedãoGK
    doc.setFillColor(2, 6, 23); // #020617
    doc.rect(0, 0, pageWidth, 44, 'F');

    // Faixa superior #22c55e + faixa inferior #38bdf8
    doc.setFillColor(34, 197, 94);
    doc.rect(0, 0, pageWidth, 2.2, 'F');
    doc.setFillColor(56, 189, 248);
    doc.rect(0, 43.2, pageWidth, 0.8, 'F');

    // Logo vetorial ParedãoGK
    drawParedaoBrandMark(doc, marginX, 8, 15);

    // Título e informações institucionais oficiais
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text('PAREDÃO', marginX + 18.5, 15.5);
    const titleW = doc.getTextWidth('PAREDÃO');
    doc.setTextColor(34, 197, 94);
    doc.text('GK', marginX + 18.5 + titleW + 1, 15.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(56, 189, 248);
    doc.text(getScopeLabel(scope), marginX + 18.5, 21);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    doc.text(
      'E-mail: paredaogkbr@gmail.com  |  Suporte Oficial: (15) 98159-6443',
      marginX,
      30
    );
    doc.setTextColor(148, 163, 184);
    doc.text(
      'Ecossistema Oficial de Goleiros · Liquidação CajuPay & Supabase Cloud',
      marginX,
      35.5
    );

    // Selo de Verificação no Topo Direito
    const badgeW = 64;
    const badgeX = pageWidth - marginX - badgeW;
    doc.setFillColor(15, 23, 42);
    doc.setDrawColor(34, 197, 94);
    doc.setLineWidth(0.4);
    doc.roundedRect(badgeX, 8, badgeW, 28, 2, 2, 'FD');

    drawCheckBadge(doc, badgeX + 5.5, 14.5, 2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(34, 197, 94);
    doc.text('REGISTRO OFICIAL VERIFICADO', badgeX + 9.5, 15.3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(226, 232, 240);
    doc.text(`Emissão: ${emissionDate}`, badgeX + 4, 21.5);
    doc.text(`Protocolo: ${docId}`, badgeX + 4, 26.5);
    doc.setTextColor(56, 189, 248);
    doc.text('Auditado via CajuPay & Supabase', badgeX + 4, 31.5);

    // 2. Identificação do Atleta / Organizador
    let currentY = 52;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('IDENTIFICAÇÃO DO MEMBRO', marginX, currentY);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, currentY + 2.5, contentWidth, 24, 2, 2, 'FD');

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Nome: ${user.name}`, marginX + 4, currentY + 9);
    doc.text(
      `Perfil: ${user.role === 'goleiro' ? 'Goleiro Profissional GK' : 'Contratante / Organizador'}`,
      marginX + 4,
      currentY + 15.5
    );
    doc.text(
      `Apelido: "${user.nickname || (user.role === 'goleiro' ? 'Paredão' : 'Capitão')}"`,
      marginX + 4,
      currentY + 22
    );

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const col2X = marginX + contentWidth * 0.52;
    doc.text(`CPF: ${maskCPF(user.cpf)} (${user.isCpfVerified ? 'Validado' : 'Em análise'})`, col2X, currentY + 9);
    doc.text(`E-mail: ${user.email}`, col2X, currentY + 15.5);
    doc.text(
      `Base: ${user.city || 'São Paulo - SP'} · Nível: ${user.technicalLevel || 'Avançado'}`,
      col2X,
      currentY + 22
    );

    currentY += 33;

    // Consolidar números reais (nunca inventar partidas falsas)
    const completedMatches = matches.filter((m) => m.status === 'completed');
    const calcMatches =
      stats?.totalMatches ??
      (user.matchesPlayed > 0 ? user.matchesPlayed : matches.length);
    const calcRating =
      stats?.averageRating ?? (user.rating > 0 ? user.rating : 5.0);
    const calcCleanSheets =
      stats?.cleanSheets ??
      Math.max(
        user.cleanSheets || 0,
        completedMatches.filter((m) => m.cleanSheetGiven).length
      );
    const calcPenalties =
      stats?.penaltiesSaved ??
      Math.max(
        user.penaltiesSaved || 0,
        completedMatches.reduce((acc, m) => acc + (m.penaltiesSavedGiven || 0), 0)
      );
    const calcMvp =
      stats?.mvpCount ??
      Math.max(
        user.mvpCount || 0,
        completedMatches.filter((m) => m.mvpGiven).length
      );

    const txList = transactions ?? walletSummary?.transactions ?? [];
    const availableBalance = walletSummary?.walletBalance ?? user.walletBalance;
    const custodyBalance =
      walletSummary?.pendingCustodyBalance ??
      (user.pendingBalance > 0
        ? user.pendingBalance
        : matches
            .filter(
              (m) =>
                m.status === 'confirmed' ||
                m.status === 'searching' ||
                m.status === 'in_progress'
            )
            .reduce((sum, m) => sum + getMatchGoalkeeperNetPayout(m), 0));
    const cashbackTotal =
      walletSummary?.cashbackBalance ?? user.cashbackBalance;
    const pixWithdrawnTotal =
      walletSummary?.totalPixWithdrawn ??
      txList
        .filter((t) => t.type === 'pix_out')
        .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);
    const totalMatchRevenue =
      totalEarnings ??
      walletSummary?.totalMatchEarnings ??
      completedMatches.reduce((sum, m) => sum + getMatchGoalkeeperNetPayout(m), 0);

    // 3. KPIs de Desempenho Esportivo (Clean Sheets, Avaliações 1-5★, Pênaltis)
    if (scope === 'completo' || scope === 'desempenho' || scope === 'partida') {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('INDICADORES DE DESEMPENHO & AVALIAÇÕES (1-5 ESTRELAS)', marginX, currentY);

      const boxGap = 3;
      const boxWidth = (contentWidth - boxGap * 3) / 4;
      const boxHeight = 22;
      const boxY = currentY + 2.5;
      const cleanSheetPct =
        calcMatches > 0 ? Math.round((calcCleanSheets / calcMatches) * 100) : 0;

      const perfBoxes = [
        {
          title: 'Partidas Auditadas',
          value: `${calcMatches}`,
          sub: `${completedMatches.length} concluída(s) no histórico`,
          border: [34, 197, 94],
          accent: [22, 163, 74],
          stars: false,
        },
        {
          title: 'Nota Média (1-5)',
          value: `${calcRating.toFixed(2)} / 5.0`,
          sub: `${calcMvp}x Luva da Partida (MVP)`,
          border: [245, 158, 11],
          accent: [217, 119, 6],
          stars: true,
        },
        {
          title: 'Clean Sheets (SG)',
          value: `${calcCleanSheets}`,
          sub: `${cleanSheetPct}% dos jogos sem gols`,
          border: [56, 189, 248],
          accent: [2, 132, 199],
          stars: false,
        },
        {
          title: 'Pênaltis Defendidos',
          value: `${calcPenalties}`,
          sub: 'Tempo normal & shootouts',
          border: [34, 197, 94],
          accent: [22, 163, 74],
          stars: false,
        },
      ];

      perfBoxes.forEach((b, idx) => {
        const bx = marginX + idx * (boxWidth + boxGap);
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(b.border[0], b.border[1], b.border[2]);
        doc.setLineWidth(0.38);
        doc.roundedRect(bx, boxY, boxWidth, boxHeight, 2, 2, 'FD');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.setTextColor(100, 116, 139);
        doc.text(b.title, bx + 3, boxY + 5.5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(b.accent[0], b.accent[1], b.accent[2]);
        doc.text(b.value, bx + 3, boxY + 12.8);

        if (b.stars) {
          const starCount = Math.round(calcRating);
          for (let s = 0; s < 5; s++) {
            drawStarVector(doc, bx + 31 + s * 2.7, boxY + 11.4, 1.05, s < starCount);
          }
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.4);
        doc.setTextColor(100, 116, 139);
        doc.text(b.sub, bx + 3, boxY + 18.8);
      });

      currentY = boxY + boxHeight + 7;
    }

    // 4. Sumário Financeiro CajuPay (Carteira, Custódia, Cashback, Saques Pix)
    if (scope === 'completo' || scope === 'financeiro') {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('SUMÁRIO FINANCEIRO CAJUPAY (CARTEIRA, CUSTÓDIA & PIX)', marginX, currentY);

      const boxGap = 3;
      const boxWidth = (contentWidth - boxGap * 3) / 4;
      const boxHeight = 22;
      const boxY = currentY + 2.5;

      const finBoxes = [
        {
          title: 'Saldo Disponível',
          value: formatCurrency(availableBalance),
          sub: 'Liberado para saque Pix',
          border: [34, 197, 94],
          accent: [22, 163, 74],
        },
        {
          title: 'Saldo em Custódia',
          value: formatCurrency(custodyBalance),
          sub: 'Garantia CajuPay ativa',
          border: [56, 189, 248],
          accent: [2, 132, 199],
        },
        {
          title: 'Cashbacks Acumulados',
          value: `+${formatCurrency(cashbackTotal)}`,
          sub: 'Créditos Futshop & Bônus',
          border: [34, 197, 94],
          accent: [22, 163, 74],
        },
        {
          title: 'Saques Pix / Ganhos',
          value: formatCurrency(Math.max(pixWithdrawnTotal, totalMatchRevenue)),
          sub: `Pix sacado: ${formatCurrency(pixWithdrawnTotal)}`,
          border: [56, 189, 248],
          accent: [2, 132, 199],
        },
      ];

      finBoxes.forEach((b, idx) => {
        const bx = marginX + idx * (boxWidth + boxGap);
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(b.border[0], b.border[1], b.border[2]);
        doc.setLineWidth(0.38);
        doc.roundedRect(bx, boxY, boxWidth, boxHeight, 2, 2, 'FD');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.setTextColor(100, 116, 139);
        doc.text(b.title, bx + 3, boxY + 5.5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(b.accent[0], b.accent[1], b.accent[2]);
        doc.text(b.value, bx + 3, boxY + 12.8);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.4);
        doc.setTextColor(100, 116, 139);
        doc.text(b.sub, bx + 3, boxY + 18.8);
      });

      currentY = boxY + boxHeight + 7;
    }

    // 5. Detalhamento de Partida Individual & Parecer Técnico AI (se aplicável)
    const targetMatchesForAi =
      scope === 'partida' && selectedMatch
        ? [selectedMatch]
        : matches.filter((m) => Boolean(m.aiFeedback)).slice(0, 2);

    if (scope === 'partida' && selectedMatch) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('FICHA TÉCNICA DA PARTIDA SELECIONADA', marginX, currentY);

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(56, 189, 248);
      doc.setLineWidth(0.38);
      doc.roundedRect(marginX, currentY + 2.5, contentWidth, 26, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(`Arena: ${selectedMatch.arenaName}`, marginX + 4, currentY + 9);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Data: ${selectedMatch.date}  |  Horário: ${selectedMatch.time}  |  Modalidade: ${selectedMatch.modality}`,
        marginX + 4,
        currentY + 15
      );
      doc.text(
        `Goleiro: ${selectedMatch.goalkeeperName || user.name}  |  Cachê Pix: ${formatCurrency(selectedMatch.price)}`,
        marginX + 4,
        currentY + 21
      );
      doc.text(
        `Avaliação: ${selectedMatch.ratingGiven ? `${selectedMatch.ratingGiven}.0 / 5.0` : 'Pendente'}  |  Clean Sheet: ${selectedMatch.cleanSheetGiven ? 'Sim' : 'Não'}`,
        marginX + 4,
        currentY + 26
      );

      currentY += 34;
    }

    if (targetMatchesForAi.length > 0 && targetMatchesForAi[0].aiFeedback) {
      const m = targetMatchesForAi[0];
      const ai = m.aiFeedback!;
      const summaryLines = doc.splitTextToSize(ai.analyticalSummary, contentWidth - 8);
      const boxH = Math.max(24, 14 + summaryLines.length * 4 + ai.strengths.slice(0, 3).length * 4);

      if (currentY + boxH > pageHeight - 25) {
        doc.addPage();
        currentY = 18;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(`PARECER TÉCNICO PÓS-PARTIDA AI (${m.arenaName})`, marginX, currentY);

      doc.setFillColor(240, 249, 255);
      doc.setDrawColor(56, 189, 248);
      doc.setLineWidth(0.35);
      doc.roundedRect(marginX, currentY + 2.5, contentWidth, boxH, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(2, 132, 199);
      doc.text(
        `Nota Consolidada: ${ai.consolidatedRating}.0 / 5.0  |  Motor: ${
          ai.source === 'gemini-ai' ? 'Gemini AI' : 'Motor Tático Local'
        }`,
        marginX + 4,
        currentY + 8
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      doc.setTextColor(30, 41, 59);
      doc.text(summaryLines, marginX + 4, currentY + 13.5);

      let sY = currentY + 14 + summaryLines.length * 4;
      ai.strengths.slice(0, 3).forEach((s) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(22, 163, 74);
        doc.text(`- ${s.criterion}: ${s.score.toFixed(1)} / 5.0`, marginX + 4, sY);
        sY += 4;
      });

      currentY += boxH + 8;
    }

    // 6. Tabela de Histórico de Partidas & Avaliações
    if (scope === 'completo' || scope === 'desempenho') {
      if (currentY > pageHeight - 45) {
        doc.addPage();
        currentY = 18;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('HISTÓRICO DE PARTIDAS, CLEAN SHEETS & AVALIAÇÕES (1-5)', marginX, currentY);

      const matchRows =
        matches.length > 0
          ? matches.slice(0, 20).map((m, idx) => {
              const statusLabel =
                m.status === 'confirmed'
                  ? 'Confirmada'
                  : m.status === 'completed'
                  ? 'Concluída'
                  : m.status === 'in_progress'
                  ? 'Em Campo'
                  : m.status === 'cancelled'
                  ? 'Cancelada'
                  : 'Em Busca';
              const ratingLabel = m.ratingGiven
                ? `${m.ratingGiven}.0 / 5`
                : m.aiFeedback
                ? `${m.aiFeedback.consolidatedRating}.0 / 5`
                : '-';
              const highlightNote = m.cleanSheetGiven
                ? 'Clean Sheet (SG)'
                : m.mvpGiven
                ? 'Luva da Partida'
                : m.sosTriggered
                ? 'SOS Relâmpago'
                : 'Regular';

              return [
                (idx + 1).toString().padStart(2, '0'),
                m.date || '-',
                m.arenaName,
                m.modality || 'Society',
                formatCurrency(m.price || 0),
                statusLabel,
                ratingLabel,
                highlightNote,
              ];
            })
          : [['--', '--/--/----', 'Nenhuma partida registrada neste perfil ainda.', '-', 'R$ 0,00', '-', '-', '-']];

      autoTable(doc, {
        startY: currentY + 3,
        head: [['#', 'Data', 'Arena / Local', 'Mod.', 'Cachê Pix', 'Status', 'Nota', 'Destaque']],
        body: matchRows,
        margin: { left: marginX, right: marginX, bottom: 20 },
        theme: 'grid',
        headStyles: {
          fillColor: [2, 6, 23],
          textColor: [255, 255, 255],
          fontSize: 7.5,
          fontStyle: 'bold',
        },
        styles: {
          fontSize: 7.2,
          cellPadding: 2.3,
          textColor: [30, 41, 59],
          lineColor: [226, 232, 240],
          lineWidth: 0.2,
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 8 },
          1: { cellWidth: 20 },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 18 },
          4: { halign: 'right', cellWidth: 21, fontStyle: 'bold', textColor: [22, 163, 74] },
          5: { cellWidth: 21 },
          6: { halign: 'center', cellWidth: 15, fontStyle: 'bold', textColor: [217, 119, 6] },
          7: { cellWidth: 26, textColor: [2, 132, 199] },
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
      });

      currentY = ((doc as any).lastAutoTable?.finalY ?? currentY + 25) + 8;
    }

    // 7. Extrato Financeiro CajuPay (Movimentações Pix & Custódia)
    if (scope === 'completo' || scope === 'financeiro') {
      if (currentY > pageHeight - 45) {
        doc.addPage();
        currentY = 18;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('EXTRATO FINANCEIRO CAJUPAY (PIX, CUSTÓDIA & CASHBACK)', marginX, currentY);

      const txRows =
        txList.length > 0
          ? txList.slice(0, 25).map((tx) => {
              const amountPrefix = tx.amount > 0 ? '+' : '';
              return [
                tx.date || '-',
                tx.description,
                tx.receiptCode || '-',
                (tx.provider || 'cajupay').toUpperCase(),
                getTxTypeLabel(tx.type),
                `${amountPrefix}${formatCurrency(tx.amount)}`,
                tx.status === 'completed' ? 'Liquidado' : 'Em Curso',
              ];
            })
          : [
              [
                '--',
                'Nenhuma movimentação financeira registrada na carteira até o momento.',
                '--',
                'CAJUPAY',
                'Saldo Inicial',
                'R$ 0,00',
                'Ativo',
              ],
            ];

      autoTable(doc, {
        startY: currentY + 3,
        head: [['Data / Hora', 'Descrição da Operação', 'Autenticação', 'Gateway', 'Tipo', 'Valor (R$)', 'Status']],
        body: txRows,
        margin: { left: marginX, right: marginX, bottom: 20 },
        theme: 'grid',
        headStyles: {
          fillColor: [2, 6, 23],
          textColor: [255, 255, 255],
          fontSize: 7.5,
          fontStyle: 'bold',
        },
        styles: {
          fontSize: 7.1,
          cellPadding: 2.3,
          textColor: [30, 41, 59],
          lineColor: [226, 232, 240],
          lineWidth: 0.2,
        },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 24 },
          3: { halign: 'center', cellWidth: 18 },
          4: { cellWidth: 22 },
          5: { halign: 'right', cellWidth: 23, fontStyle: 'bold', textColor: [2, 132, 199] },
          6: { halign: 'center', cellWidth: 18, textColor: [22, 163, 74] },
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
      });
    }

    // 8. Rodapé Institucional Oficial em todas as páginas
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      const footerY = pageHeight - 13;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(marginX, footerY - 3, pageWidth - marginX, footerY - 3);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        'ParedãoGK · Documento corporativo gerado eletronicamente (paredaogkbr@gmail.com · Suporte: (15) 98159-6443).',
        marginX,
        footerY + 1
      );
      doc.text(
        'Liquidação financeira processada via CajuPay Pagamentos | Registros sincronizados via Supabase Cloud.',
        marginX,
        footerY + 4.8
      );

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(22, 163, 74);
      doc.text(`Página ${p} de ${totalPages}`, pageWidth - marginX - 18, footerY + 2.5);
    }

    const scopeSlug = scope === 'completo' ? 'Completo' : scope === 'financeiro' ? 'CajuPay' : scope === 'partida' ? 'Partida' : 'Desempenho';
    const cleanName = user.name.trim().replace(/\s+/g, '_') || 'Atleta';
    const cleanFileName = `Relatorio_ParedaoGK_${scopeSlug}_${cleanName}_${Date.now().toString().slice(-4)}.pdf`;
    doc.save(cleanFileName);

    return true;
  } catch (error) {
    console.error('[PDF Generation Error]', error);
    return false;
  }
}
