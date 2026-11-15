import React from 'react';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  color?: string;
  strokeWidth?: number;
}

/**
 * PAREDÃOGK CUSTOM VECTOR ICON DESIGN SYSTEM
 * 
 * Precision geometric vector icons crafted specifically for goalkeeper performance,
 * soccer matchmaking, Mercado Pago Pix finances, and dark mode (#020617 / #22c55e / #38bdf8).
 */

// ==========================================
// 1. AÇÕES DE CAMPO & TEMÁTICA GOLEIRO
// ==========================================

/**
 * GkGloveBallIcon: Ícone de 'Convocação GK'
 * Representa uma luva profissional de goleiro com grip firme agarrando uma bola de futebol.
 */
export const GkGloveBallIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    {/* Bola de Futebol (Sendo agarrada pela luva) */}
    <circle cx="15.5" cy="8.5" r="5" />
    <path d="M15.5 6.5l1.5 1.2v1.6l-1.5 1.2-1.5-1.2v-1.6z" />
    <path d="M15.5 6.5V3.5" />
    <path d="M17 7.7l2.8-1.4" />
    <path d="M17 9.3l2.8 1.4" />
    <path d="M14 7.7l-2.8-1.4" />
    <path d="M14 9.3l-2.8 1.4" />

    {/* Luva de Goleiro: Palma e Dedos com Grip de Alta Aderência */}
    {/* Punho / Munhequeira de Proteção */}
    <path d="M3 19.5h5.5c.8 0 1.5.7 1.5 1.5v0c0 .6-.4 1-1 1H3.5c-.8 0-1.5-.7-1.5-1.5v0c0-.6.4-1 1-1z" />
    {/* Palma da luva */}
    <path d="M4 19.5V15c0-1.5.8-2.5 2-3l3.5-1.2" />
    {/* Polegar de contenção */}
    <path d="M9.5 10.8c.6-.8 1.5-1.3 2.5-1.3h.5" />
    {/* Dedos envolvendo a bola superior e lateral */}
    <path d="M8 12.5l2-4.5c.4-.9 1.4-1.5 2.4-1.3l.6.1" />
    <path d="M6 14.5l-1-4c-.3-1 .2-2 1.2-2.3.9-.3 2 .2 2.3 1.2l.5 2" />
    {/* Costura de reforço da luva no dorso */}
    <path d="M4.5 16.5l3.5-1" strokeDasharray="1 1" />
  </svg>
);

/**
 * GkWhistleIcon: Apito de Árbitro Profissional
 * Utilizado para alertas, convocações realtime e sinalizações de jogo.
 */
export const GkWhistleIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    {/* Anel de Cordão do Árbitro */}
    <circle cx="4.5" cy="6.5" r="2.5" />
    <path d="M7 6.5h1.5" />
    {/* Câmara Esférica de Ressonância (Onde fica a bolinha de cortiça) */}
    <circle cx="10" cy="15.5" r="5.5" />
    {/* Bocal de Sopro / Saída do Ar */}
    <path d="M10 10h9.5a1.5 1.5 0 0 1 1.5 1.5v1.5a1 1 0 0 1-1 1H15" />
    {/* Fenda Superior de Saída Acústica (Trinado) */}
    <path d="M12.5 10V7.5h3V10" />
    {/* Ondas Sonoras de Apito */}
    <path d="M19 6c1 .8 1.8 2 2 3.5" />
    <path d="M21 4c1.5 1.2 2.5 3 2.8 5" />
  </svg>
);

/**
 * GkStarRatingIcon: Avaliação 1-5★ e Luva de Ouro
 * Estrela geométrica de precisão atlética.
 */
export const GkStarRatingIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  fill = 'none',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    <line x1="12" y1="2" x2="12" y2="17.77" opacity="0.3" />
  </svg>
);

// ==========================================
// 2. NAVEGAÇÃO PRINCIPAL (BOTTOM NAV)
// ==========================================

/**
 * GkRadarIcon: Início / Radar Inteligente
 * Campo de futebol tático com radar concêntrico de localização de goleiros.
 */
export const GkRadarIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    {/* Linhas do Campo Tático */}
    <rect x="2.5" y="4" width="19" height="16" rx="2.5" />
    <line x1="12" y1="4" x2="12" y2="20" />
    <circle cx="12" cy="12" r="3.5" />
    {/* Área do Goleiro Esquerda & Direita */}
    <path d="M2.5 8.5h3v7h-3" />
    <path d="M21.5 8.5h-3v7h3" />
    {/* Feixe de Varredura Radar */}
    <circle cx="12" cy="12" r="1" fill={color} />
    <path d="M12 12l4-4" />
    <path d="M17.5 6.5a7 7 0 0 1 0 11" opacity="0.4" />
  </svg>
);

/**
 * GkMetricsIcon: Métricas GK / Ranking Semanal
 * Escudo de performance com gráficos de evolução de defesas e notas.
 */
export const GkMetricsIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    {/* Escudo Geométrico do Paredão */}
    <path d="M12 2.5l8 3v6c0 5.2-3.4 9.8-8 11-4.6-1.2-8-5.8-8-11v-6l8-3z" />
    {/* Colunas do Histograma de Desempenho */}
    <line x1="8" y1="15" x2="8" y2="12" />
    <line x1="12" y1="15" x2="12" y2="9" />
    <line x1="16" y1="15" x2="16" y2="7" />
    {/* Linha de Tendência Ascendente de Clean Sheets */}
    <path d="M7 11.5l3.5-3 2.5 2 4-4" />
    <circle cx="17" cy="6.5" r="0.75" fill={color} />
  </svg>
);

/**
 * GkChatIcon: Conversas / Chat da Arena
 * Balão de mensagem tática com geometria de bola de futebol.
 */
export const GkChatIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <path d="M20.5 11a8 8 0 0 1-12.8 6.4L3 19l1.6-4.2A8 8 0 1 1 20.5 11z" />
    {/* Ponto Tático Central de Convocação */}
    <circle cx="9" cy="11" r="1" fill={color} />
    <circle cx="13" cy="11" r="1" fill={color} />
    <circle cx="17" cy="11" r="1" fill={color} />
  </svg>
);

/**
 * GkBellIcon: Notificações / Alertas da Partida
 * Sino sinalizador do estádio com farol de aviso.
 */
export const GkBellIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    {/* Faixa Tática Superior */}
    <path d="M12 2v2" />
    <circle cx="18.5" cy="5.5" r="1.5" fill="#22c55e" stroke="none" />
  </svg>
);

/**
 * GkWalletPixIcon: Carteira Digital & Pix Mercado Pago
 * Carteira atlética com chave Pix geométrica integrada em destaque.
 */
export const GkWalletPixIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    {/* Corpo da Carteira */}
    <rect x="2.5" y="5.5" width="19" height="14" rx="3" />
    {/* Aba do Fecho */}
    <path d="M15.5 10.5h6v4h-6a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2z" />
    {/* Chave Pix Geométrica / Moeda Central */}
    <path d="M7 12.5l2.5-2.5 2.5 2.5-2.5 2.5z" />
    <circle cx="17.5" cy="12.5" r="1" fill={color} />
  </svg>
);

/**
 * GkCoinPixIcon: Moeda Mercado Pago Pix / Ganhos
 * Destaque financeiro com símbolo monetário e raio de liquidação instantânea.
 */
export const GkCoinPixIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <circle cx="12" cy="12" r="9.5" />
    {/* Losango Central Pix */}
    <path d="M12 6.5l4 4-4 4-4-4z" />
    <path d="M12 11v6.5" />
    <path d="M9.5 15.5h5" />
  </svg>
);

// ==========================================
// 3. MENU LATERAL (DRAWER) & PERFIL
// ==========================================

/**
 * GkProfileIcon: Perfil do Atleta / Capitão com Selo de Verificação
 */
export const GkProfileIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    {/* Cabeça do Atleta com Faixa/Boné de Goleiro */}
    <circle cx="11" cy="7.5" r="4.5" />
    <path d="M6.8 6.5h8.4" />
    {/* Ombros & Tronco */}
    <path d="M3 19.5c0-3.3 3.6-6 8-6 1.8 0 3.4.5 4.6 1.3" />
    {/* Selo de Verificação Integrado */}
    <circle cx="18" cy="17" r="4" fill="#22c55e" stroke="none" />
    <path d="M16.5 17l1 1 2-2" stroke="#020617" strokeWidth="1.8" />
  </svg>
);

/**
 * GkSettingsIcon: Configurações Táticas
 * Engrenagem geométrica esportiva.
 */
export const GkSettingsIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

/**
 * GkFutshopIcon: Futshop ArenaDraft
 * Bolsa de equipamentos esportivos, chuteiras e luvas oficiais.
 */
export const GkFutshopIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    {/* Sacola Esportiva */}
    <path d="M4 8h16l-1.5 12.5a2 2 0 0 1-2 1.5h-9a2 2 0 0 1-2-1.5L4 8z" />
    {/* Alça Reforçada */}
    <path d="M8.5 8V5.5a3.5 3.5 0 0 1 7 0V8" />
    {/* Faixa Tática Central com Estrela de Desconto */}
    <line x1="4" y1="12" x2="20" y2="12" strokeDasharray="1.5 1.5" />
    <circle cx="12" cy="15.5" r="1.5" fill={color} />
  </svg>
);

/**
 * GkHelpFaqIcon: FAQ & Central de Ajuda Tática
 * Prancheta tática do treinador com interrogação e marcações de campo.
 */
export const GkHelpFaqIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <rect x="4" y="3.5" width="16" height="17" rx="3" />
    {/* Ponto de Interrogação Tático */}
    <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-1.8 2-2 3" />
    <circle cx="12.5" cy="15.5" r="0.75" fill={color} />
    {/* Grampo da Prancheta */}
    <path d="M9 3.5V2h6v1.5" />
  </svg>
);

/**
 * GkTermsDocIcon: Termos de Uso & Regras Anti-W.O.
 * Documento oficial com traves e selo de conformidade.
 */
export const GkTermsDocIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <path d="M14 2H5.5A2.5 2.5 0 0 0 3 4.5v15A2.5 2.5 0 0 0 5.5 22h13a2.5 2.5 0 0 0 2.5-2.5V8l-7-6z" />
    <polyline points="14 2 14 8 20 8" />
    {/* Cláusulas do Contrato de Partida */}
    <line x1="7" y1="12" x2="17" y2="12" />
    <line x1="7" y1="16" x2="13" y2="16" />
  </svg>
);

// ==========================================
// 4. ÍCONES UTILITÁRIOS ESSENCIAIS
// ==========================================

export const GkShieldIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <path d="M12 2.5l8 3v6.2c0 5.3-3.4 10-8 11.3-4.6-1.3-8-6-8-11.3V5.5l8-3z" />
    <path d="M12 7.5v9" opacity="0.3" />
    <path d="M8 12h8" opacity="0.3" />
  </svg>
);

export const GkCheckCircleIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <circle cx="12" cy="12" r="9.5" />
    <polyline points="8 12 11 15 16 9" />
  </svg>
);

export const GkCheckIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <polyline points="4 12 9 17 20 6" />
  </svg>
);

export const GkCloseIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const GkCameraIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

export const GkDownloadIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export const GkSearchIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <circle cx="11" cy="11" r="7.5" />
    <line x1="21" y1="21" x2="16.5" y2="16.5" />
    <circle cx="11" cy="11" r="1.5" fill={color} opacity="0.3" />
  </svg>
);

export const GkFilterIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

export const GkMapPinIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

export const GkClockIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <circle cx="12" cy="12" r="9.5" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

export const GkCalendarIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <rect x="3" y="4" width="18" height="18" rx="3" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <circle cx="8" cy="14" r="1" fill={color} />
    <circle cx="12" cy="14" r="1" fill={color} />
    <circle cx="16" cy="14" r="1" fill={color} />
  </svg>
);

export const GkRefreshIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

export const GkChevronRightIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export const GkChevronDownIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export const GkFlameIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);

export const GkWifiOffIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
    <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
    <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
    <line x1="12" y1="20" x2="12.01" y2="20" />
  </svg>
);

export const GkHistoryIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <polyline points="12 7 12 12 15 15" />
  </svg>
);

export const GkLogoutIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export const GkWhatsAppIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    <path d="M9.5 9c.3-.5.7-.5 1 0l.9 1.5c.2.3.1.6-.1.8l-.5.5c.6 1.2 1.6 2.2 2.8 2.8l.5-.5c.2-.2.5-.3.8-.1l1.5.9c.5.3.5.7 0 1-1.2 1.2-2.5 1-3.8.3-2.1-1.1-3.8-2.8-4.9-4.9-.7-1.3-.9-2.6.3-3.8z" />
  </svg>
);

export const GkArrowUpRightIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <line x1="7" y1="17" x2="17" y2="7" />
    <polyline points="7 7 17 7 17 17" />
  </svg>
);

export const GkArrowDownLeftIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <line x1="17" y1="7" x2="7" y2="17" />
    <polyline points="17 17 7 17 7 7" />
  </svg>
);

export const GkCopyIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

export const GkQrCodeIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3h-3z" />
    <path d="M20 14v3h-3" />
    <path d="M14 20h6" />
  </svg>
);

export const GkMenuIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="16" y2="12" />
    <line x1="4" y1="18" x2="20" y2="18" />
  </svg>
);

export const GkSunIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <circle cx="12" cy="12" r="4.2" />
    <line x1="12" y1="2.2" x2="12" y2="4.2" />
    <line x1="12" y1="19.8" x2="12" y2="21.8" />
    <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
    <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
    <line x1="2.2" y1="12" x2="4.2" y2="12" />
    <line x1="19.8" y1="12" x2="21.8" y2="12" />
    <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
    <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
  </svg>
);

export const GkMoonIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
  </svg>
);

export const GkHeartIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

export const GkSosAlertIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <circle cx="12" cy="17" r="0.8" fill={color} />
  </svg>
);

export const GkPlusIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const GkTrashIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

export const GkAiSparkIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <path d="M12 2.5l2.2 5.3L19.5 10l-5.3 2.2L12 17.5l-2.2-5.3L4.5 10l5.3-2.2L12 2.5z" />
    <path d="M18.5 16l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
    <circle cx="5.5" cy="18.5" r="1" fill={color} />
  </svg>
);

export const GkPrinterIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <polyline points="6 9 6 3 18 3 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="7" rx="1" />
    <line x1="9" y1="17.5" x2="15" y2="17.5" />
    <circle cx="17.5" cy="11.5" r="0.8" fill={color} />
  </svg>
);

export const GkInstagramIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.2" cy="6.8" r="1" fill={color} stroke="none" />
  </svg>
);

export const GkStadiumArenaIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <line x1="12" y1="5" x2="12" y2="19" />
    <circle cx="12" cy="12" r="3" />
    <path d="M2.5 9h2.8v6H2.5" />
    <path d="M21.5 9h-2.8v6h2.8" />
    <path d="M6.5 3.5l1.5 1.5" />
    <path d="M17.5 3.5l-1.5 1.5" />
  </svg>
);

export const GkUploadPhotoIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="M21 15l-4.5-4.5a1.5 1.5 0 0 0-2.1 0L7 18" />
    <path d="M12 3v5" />
    <polyline points="9.5 5.5 12 3 14.5 5.5" />
  </svg>
);

export const GkShieldCheckAdminIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <path d="M12 2.5l8 3v6.2c0 5.3-3.4 10-8 11.3-4.6-1.3-8-6-8-11.3V5.5l8-3z" />
    <polyline points="8.8 12.2 11 14.4 15.5 9.8" />
  </svg>
);

export const GkWebhookIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <circle cx="12" cy="5" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M12 7.5v4.5" />
    <path d="M12 12l-4.5 4.2" />
    <path d="M12 12l4.5 4.2" />
    <path d="M3.5 11.5a8.5 8.5 0 0 1 3-5.2" opacity="0.45" />
    <path d="M20.5 11.5a8.5 8.5 0 0 0-3-5.2" opacity="0.45" />
  </svg>
);

export const GkKeyLockIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <circle cx="7.5" cy="14.5" r="4" />
    <path d="M10.8 12l8.7-8.5" />
    <path d="M17 6l2.5 2.5" />
    <path d="M14.5 8.5l2 2" />
  </svg>
);

export const GkBankTransferIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <path d="M4 7h14" />
    <polyline points="14 3 18 7 14 11" />
    <path d="M20 17H6" />
    <polyline points="10 13 6 17 10 21" />
  </svg>
);

export const GkReceiptCheckIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block shrink-0 pointer-events-none select-none ${className}`}
    {...props}
  >
    <path d="M5 3v18l2.5-1.5L10 21l2-1.5L14 21l2.5-1.5L19 21V3l-2.5 1.5L14 3l-2 1.5L10 3 7.5 4.5 5 3z" />
    <polyline points="8.5 12.2 10.8 14.5 15.5 9.8" />
  </svg>
);

// ==========================================
// 5. DROP-IN ALIASES COMPATÍVEIS COM O ECOSSISTEMA
// ==========================================
export const Shield = GkShieldIcon;
export const Radar = GkRadarIcon;
export const Award = GkMetricsIcon;
export const MessageSquare = GkChatIcon;
export const MessageCircle = GkWhatsAppIcon;
export const Bell = GkBellIcon;
export const Wallet = GkWalletPixIcon;
export const User = GkProfileIcon;
export const ShoppingBag = GkFutshopIcon;
export const HelpCircle = GkHelpFaqIcon;
export const FileText = GkTermsDocIcon;
export const Check = GkCheckIcon;
export const CheckCircle2 = GkCheckCircleIcon;
export const CheckCheck = GkCheckIcon;
export const X = GkCloseIcon;
export const Camera = GkCameraIcon;
export const Download = GkDownloadIcon;
export const Search = GkSearchIcon;
export const Filter = GkFilterIcon;
export const MapPin = GkMapPinIcon;
export const Clock = GkClockIcon;
export const Calendar = GkCalendarIcon;
export const RefreshCw = GkRefreshIcon;
export const ChevronRight = GkChevronRightIcon;
export const ChevronDown = GkChevronDownIcon;
export const Flame = GkFlameIcon;
export const WifiOff = GkWifiOffIcon;
export const History = GkHistoryIcon;
export const LogOut = GkLogoutIcon;
export const ArrowUpRight = GkArrowUpRightIcon;
export const ArrowDownLeft = GkArrowDownLeftIcon;
export const QrCode = GkQrCodeIcon;
export const Copy = GkCopyIcon;
export const Menu = GkMenuIcon;
export const Star = GkStarRatingIcon;
export const DollarSign = GkCoinPixIcon;
export const Sun = GkSunIcon;
export const Moon = GkMoonIcon;
export const Heart = GkHeartIcon;
export const SosAlert = GkSosAlertIcon;
export const Plus = GkPlusIcon;
export const Trash2 = GkTrashIcon;
export const AiSpark = GkAiSparkIcon;
export const Printer = GkPrinterIcon;
export const Instagram = GkInstagramIcon;
export const StadiumArena = GkStadiumArenaIcon;
export const UploadPhoto = GkUploadPhotoIcon;
export const AdminShield = GkShieldCheckAdminIcon;
export const Webhook = GkWebhookIcon;
export const KeyLock = GkKeyLockIcon;
export const BankTransfer = GkBankTransferIcon;
export const ReceiptCheck = GkReceiptCheckIcon;

