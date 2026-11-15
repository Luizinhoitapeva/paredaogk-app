import { Goalkeeper, MatchBooking } from '../types';
import { normalizeSearchText } from './arenaProximitySearch';

export const DEFAULT_MATCHMAKING_RADIUS_KM = 30;

export interface GeoPoint {
  lat: number;
  lng: number;
}

// Coordenadas reais da cidade-base Itapeva (SP) e municípios/bairros do entorno (raio 30 km e além)
const REGIONAL_COORDINATES: Array<{ keywords: string[]; coords: GeoPoint }> = [
  { keywords: ['belletti', 'jardim ferrari', 'ferrari'], coords: { lat: -23.9748, lng: -48.8832 } },
  { keywords: ['jades', 'distrito industrial', 'moulatlet'], coords: { lat: -23.9635, lng: -48.8594 } },
  { keywords: ['araxa', 'araxá'], coords: { lat: -23.9895, lng: -48.8678 } },
  { keywords: ['pilao', 'recanto'], coords: { lat: -24.0012, lng: -48.8915 } },
  { keywords: ['vila aparecida', 'aparecida'], coords: { lat: -23.9772, lng: -48.8682 } },
  { keywords: ['jardim europa', 'europa', 'maringa'], coords: { lat: -23.9885, lng: -48.8842 } },
  { keywords: ['taquarivai'], coords: { lat: -23.9242, lng: -48.6934 } }, // ~19.6 km de Itapeva
  { keywords: ['nova campina'], coords: { lat: -24.1217, lng: -48.9022 } }, // ~15.7 km de Itapeva
  { keywords: ['ribeirao branco'], coords: { lat: -24.2211, lng: -48.7656 } }, // ~28.8 km de Itapeva
  { keywords: ['buri'], coords: { lat: -23.7975, lng: -48.5917 } }, // ~35.4 km de Itapeva (fora de 30 km)
  { keywords: ['itabera'], coords: { lat: -23.8617, lng: -49.1372 } }, // ~29.7 km de Itapeva
  { keywords: ['capao bonito'], coords: { lat: -24.0069, lng: -48.3489 } }, // ~53.5 km de Itapeva (fora de 30 km)
  { keywords: ['itarare'], coords: { lat: -24.1125, lng: -49.3319 } }, // ~48.5 km de Itapeva
  { keywords: ['sorocaba'], coords: { lat: -23.5015, lng: -47.4526 } }, // ~154 km
  { keywords: ['sao paulo', 'pinheiros', 'morumbi'], coords: { lat: -23.5505, lng: -46.6333 } },
  { keywords: ['itapeva', 'centro'], coords: { lat: -23.9822, lng: -48.8756 } },
];

export const ITAPEVA_BASE_COORDS: GeoPoint = { lat: -23.9822, lng: -48.8756 };

export function calculateHaversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Number((R * c).toFixed(1));
}

export function resolveLocationCoordinates(locationText?: string | null): GeoPoint | null {
  const normalized = normalizeSearchText(locationText);
  if (!normalized) return null;
  for (const entry of REGIONAL_COORDINATES) {
    if (entry.keywords.some((kw) => normalized.includes(normalizeSearchText(kw)))) {
      return entry.coords;
    }
  }
  return null;
}

export function computeGoalkeeperDistanceKm(params: {
  profile: Record<string, any>;
  targetCity?: string;
  targetArena?: string;
  targetAddress?: string;
}): number {
  const { profile, targetCity = 'Itapeva - SP', targetArena = '', targetAddress = '' } = params;
  const targetCoords =
    resolveLocationCoordinates(`${targetArena} ${targetAddress} ${targetCity}`) ||
    ITAPEVA_BASE_COORDS;

  const lat = Number(profile.latitude ?? profile.lat);
  const lng = Number(profile.longitude ?? profile.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
    return calculateHaversineKm(targetCoords, { lat, lng });
  }

  const profileLocText = `${profile.neighborhood || ''} ${profile.city || ''}`;
  const profileCoords = resolveLocationCoordinates(profileLocText);
  if (profileCoords) {
    const calculated = calculateHaversineKm(targetCoords, profileCoords);
    if (calculated > 0) return calculated;
  }

  const explicitDist = Number(profile.distance_km ?? profile.distanceKm);
  if (Number.isFinite(explicitDist) && explicitDist > 0) {
    return Number(explicitDist.toFixed(1));
  }

  return 2.8;
}

export function filterGoalkeepersWithinRadius<T extends { distanceKm: number; rating?: number; availableToday?: boolean }>(
  goalkeepers: T[],
  maxRadiusKm: number = DEFAULT_MATCHMAKING_RADIUS_KM
): T[] {
  return goalkeepers
    .filter((gk) => Number(gk.distanceKm ?? 0) <= maxRadiusKm)
    .sort((a, b) => {
      const availScore = Number(Boolean(b.availableToday)) - Number(Boolean(a.availableToday));
      if (availScore !== 0) return availScore;
      const distDiff = Number(a.distanceKm ?? 0) - Number(b.distanceKm ?? 0);
      if (Math.abs(distDiff) >= 0.5) return distDiff;
      return Number(b.rating ?? 0) - Number(a.rating ?? 0);
    });
}

export function computeEndTimeFromStartAndDuration(
  startTime: string,
  durationMinutes: number
): string {
  const [hStr, mStr] = (startTime || '20:00').split(':');
  const startH = Number(hStr);
  const startM = Number(mStr);
  if (!Number.isFinite(startH) || !Number.isFinite(startM)) {
    return `${startTime || '20:00'} - 21:00`;
  }
  const totalStartMinutes = startH * 60 + startM;
  const totalEndMinutes = (totalStartMinutes + Math.max(30, durationMinutes)) % (24 * 60);
  const endH = Math.floor(totalEndMinutes / 60);
  const endM = totalEndMinutes % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(startH)}:${pad(startM)} - ${pad(endH)}:${pad(endM)}`;
}

/**
 * Verifica se a partida confirmada está a 20 minutos (ou menos) do horário agendado
 * para acionar a notificação "Você está a caminho do jogo em [Local]?".
 */
export function shouldTrigger20MinEnRouteAlert(
  match: MatchBooking,
  now: Date = new Date()
): boolean {
  if (
    !match ||
    match.status === 'completed' ||
    match.status === 'cancelled' ||
    match.goalkeeperCancelled ||
    match.enRoute20mConfirmed ||
    match.enRoute45mConfirmed ||
    match.operationalStatus === 'en_route'
  ) {
    return false;
  }

  const timeMatch = String(match.time || '').match(/(\d{1,2}):(\d{2})/);
  if (!timeMatch) return false;
  const matchHour = Number(timeMatch[1]);
  const matchMin = Number(timeMatch[2]);
  if (!Number.isFinite(matchHour) || !Number.isFinite(matchMin)) return false;

  const dateText = normalizeSearchText(match.date || '');
  const isoMatch = String(match.date || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  const brMatch = String(match.date || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);

  const targetDate = new Date(now);
  if (isoMatch) {
    targetDate.setFullYear(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  } else if (brMatch) {
    targetDate.setFullYear(Number(brMatch[3]), Number(brMatch[2]) - 1, Number(brMatch[1]));
  } else if (dateText.includes('amanha')) {
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (!dateText.includes('hoje')) {
    return false;
  }

  targetDate.setHours(matchHour, matchMin, 0, 0);
  const diffMinutes = (targetDate.getTime() - now.getTime()) / 60000;
  return diffMinutes <= 20 && diffMinutes >= -30;
}

export function formatDurationLabel(minutes?: number): string {
  const mins = Number(minutes || 60);
  if (mins === 60) return '1h';
  if (mins === 90) return '1h30';
  if (mins === 120) return '2h';
  if (mins === 150) return '2h30';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

export type EligibleGoalkeeperCandidate = Goalkeeper & {
  phone?: string;
  email?: string;
};
