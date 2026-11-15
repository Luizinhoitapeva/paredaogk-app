import express, { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import QRCode from 'qrcode';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);

function cleanEnvSecret(val?: string): string {
  if (!val) return '';
  return val.trim().replace(/^["']|["']$/g, '').trim();
}

function isPlaceholderSecret(val?: string): boolean {
  const trimmed = cleanEnvSecret(val);
  return (
    !trimmed ||
    trimmed.startsWith('MY_') ||
    trimmed.includes('your-') ||
    trimmed.includes('placeholder')
  );
}

function getMercadoPagoCredentials(clientPublicKey?: string) {
  const envPublicKey = cleanEnvSecret(
    process.env.VITE_MERCADOPAGO_PUBLIC_KEY || process.env.MERCADOPAGO_PUBLIC_KEY || ''
  );
  const cleanClientPublicKey = cleanEnvSecret(clientPublicKey);
  const publicKey = !isPlaceholderSecret(envPublicKey)
    ? envPublicKey
    : !isPlaceholderSecret(cleanClientPublicKey)
    ? cleanClientPublicKey
    : '';

  const envAccessToken = cleanEnvSecret(
    process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || ''
  );
  const accessToken = !isPlaceholderSecret(envAccessToken) ? envAccessToken : '';
  const isTestToken = /^TEST-/i.test(accessToken);
  const isProductionToken = /^APP_USR-/i.test(accessToken);

  return {
    publicKey,
    accessToken,
    isLiveConfigured: Boolean(accessToken),
    isTestToken,
    isProductionToken,
    tokenMode: isTestToken
      ? ('test' as const)
      : isProductionToken
      ? ('production' as const)
      : accessToken
      ? ('custom' as const)
      : ('missing' as const),
  };
}

function getServerSupabaseAdminClient(preferServiceRoleOnly = false) {
  const url = cleanEnvSecret(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
  );
  const serviceRoleKey = cleanEnvSecret(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      ''
  );
  const anonKey = cleanEnvSecret(
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
  );

  const selectedKey = !isPlaceholderSecret(serviceRoleKey)
    ? serviceRoleKey
    : !preferServiceRoleOnly && !isPlaceholderSecret(anonKey)
    ? anonKey
    : '';

  if (isPlaceholderSecret(url) || isPlaceholderSecret(selectedKey)) {
    return null;
  }

  return createClient(url, selectedKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function extractMissingColumnFromSupabaseError(error: any): string | null {
  const msg = String(error?.message || error?.details || error?.hint || '');
  if (!msg) return null;
  const pgrstMatch = msg.match(/Could not find the '([^']+)' column of/i);
  if (pgrstMatch?.[1]) return pgrstMatch[1];
  const pgMatch = msg.match(/column "?([a-zA-Z0-9_]+)"? (?:of relation "[^"]+" )?does not exist/i);
  if (pgMatch?.[1]) return pgMatch[1];
  return null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(val?: string | null): boolean {
  return Boolean(val && UUID_REGEX.test(val.trim()));
}

async function resilientSupabaseUpsert(
  supabaseClient: any,
  table: string,
  row: Record<string, any>,
  onConflict = 'id'
): Promise<{ error: any; data?: any; skippedColumns: string[] }> {
  const payload: Record<string, any> = { ...row };
  const skippedColumns: string[] = [];

  for (let attempt = 0; attempt < 12; attempt++) {
    const { data, error } = await supabaseClient
      .from(table)
      .upsert([payload], { onConflict })
      .select('*')
      .maybeSingle();

    if (!error) {
      return { error: null, data, skippedColumns };
    }

    const missingCol = extractMissingColumnFromSupabaseError(error);
    if (missingCol && Object.prototype.hasOwnProperty.call(payload, missingCol)) {
      skippedColumns.push(missingCol);
      delete payload[missingCol];
      continue;
    }

    if (/invalid input syntax for type uuid/i.test(String(error?.message || ''))) {
      if (payload.match_id && !isValidUuid(String(payload.match_id))) {
        skippedColumns.push('match_id');
        payload.match_id = null;
        continue;
      }
    }

    return { error, data, skippedColumns };
  }

  return { error: new Error(`Max retries reached upserting ${table}`), skippedColumns };
}

async function resilientSupabaseUpdate(
  supabaseClient: any,
  table: string,
  updates: Record<string, any>,
  matchColumn: string,
  matchValue: string
): Promise<{ error: any; data?: any; skippedColumns: string[] }> {
  const payload: Record<string, any> = { ...updates };
  const skippedColumns: string[] = [];

  for (let attempt = 0; attempt < 8; attempt++) {
    if (Object.keys(payload).length === 0) {
      return { error: new Error(`Nenhuma coluna válida restante para atualizar ${table}`), skippedColumns };
    }

    const { data, error } = await supabaseClient
      .from(table)
      .update(payload)
      .eq(matchColumn, matchValue)
      .select('*')
      .maybeSingle();

    if (!error) {
      return { error: null, data, skippedColumns };
    }

    const missingCol = extractMissingColumnFromSupabaseError(error);
    if (missingCol && Object.prototype.hasOwnProperty.call(payload, missingCol)) {
      skippedColumns.push(missingCol);
      delete payload[missingCol];
      continue;
    }

    return { error, data, skippedColumns };
  }

  return { error: new Error(`Max retries reached updating ${table}`), skippedColumns };
}

function isValidBrazilianCpf(rawCpf: string): boolean {
  const cpf = rawCpf.replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  if (cpf === '12345678909') return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (10 - i);
  }
  let rest = (sum * 10) % 11;
  const firstDigit = rest === 10 || rest === 11 ? 0 : rest;
  if (firstDigit !== parseInt(cpf.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (11 - i);
  }
  rest = (sum * 10) % 11;
  const secondDigit = rest === 10 || rest === 11 ? 0 : rest;
  return secondDigit === parseInt(cpf.charAt(10), 10);
}

function sanitizeEmvAscii(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 .\-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatMercadoPagoExpirationIso(expiresInSeconds: number): string {
  const clampedSeconds = Math.max(300, Math.min(2592000, Number(expiresInSeconds) || 1800));
  const brtOffsetMs = -3 * 60 * 60 * 1000;
  const targetUtc = new Date(Date.now() + clampedSeconds * 1000);
  const brtShifted = new Date(targetUtc.getTime() + brtOffsetMs);
  return `${brtShifted.toISOString().slice(0, 23)}-03:00`;
}

function computeCrc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(id: string, value: string): string {
  const len = String(Buffer.byteLength(value, 'utf8')).padStart(2, '0');
  return `${id}${len}${value}`;
}

function buildEmvPixPayload(params: {
  pixKey: string;
  merchantName: string;
  merchantCity: string;
  amount: number;
  txId: string;
}): string {
  const merchantAccountInfo = tlv('00', 'br.gov.bcb.pix') + tlv('01', params.pixKey.trim());
  const amountStr = params.amount.toFixed(2);
  const cleanTxId = params.txId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || '***';
  const additionalData = tlv('05', cleanTxId);
  const cleanName = sanitizeEmvAscii(params.merchantName).toUpperCase().slice(0, 25) || 'PAREDAOGK';
  const cleanCity = sanitizeEmvAscii(params.merchantCity).toUpperCase().slice(0, 15) || 'ITAPEVA SP';

  const partial =
    tlv('00', '01') +
    tlv('26', merchantAccountInfo) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', amountStr) +
    tlv('58', 'BR') +
    tlv('59', cleanName) +
    tlv('60', cleanCity) +
    tlv('62', additionalData) +
    '6304';

  return `${partial}${computeCrc16Ccitt(partial)}`;
}

function normalizeCleanBase64(existingBase64?: string | null): string | null {
  if (!existingBase64 || typeof existingBase64 !== 'string') return null;
  const cleaned = existingBase64
    .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, '')
    .replace(/\s+/g, '');
  return cleaned || null;
}

async function ensureQrCodeDataUrl(qrCodeText: string, existingBase64?: string | null): Promise<string | null> {
  const cleanBase64 = normalizeCleanBase64(existingBase64);
  if (cleanBase64) {
    return `data:image/png;base64,${cleanBase64}`;
  }
  if (!qrCodeText) return null;
  try {
    return await QRCode.toDataURL(qrCodeText, {
      width: 280,
      margin: 1,
      color: {
        dark: '#020617',
        light: '#ffffff',
      },
    });
  } catch (err) {
    console.warn('[QRCode Generation Warning]', err);
    return null;
  }
}

async function safeParseExternalJsonResponse(response: globalThis.Response): Promise<{
  valid: boolean;
  data: any;
  rawText: string;
  reason?: string;
}> {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  let rawText = '';
  try {
    rawText = await response.text();
  } catch (err: any) {
    return { valid: false, data: null, rawText: '', reason: err?.message || 'empty_body_read_error' };
  }

  const trimmed = rawText.trim();
  if (!trimmed) {
    return { valid: false, data: null, rawText: '', reason: 'empty_response_body' };
  }

  const looksLikeJson =
    contentType.includes('application/json') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[');

  if (!looksLikeJson) {
    return {
      valid: false,
      data: null,
      rawText: trimmed.slice(0, 300),
      reason: `non_json_content_type:${contentType || 'unknown'}`,
    };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, data: null, rawText: trimmed.slice(0, 300), reason: 'invalid_json_root' };
    }
    return { valid: true, data: parsed, rawText: trimmed };
  } catch (err: any) {
    return {
      valid: false,
      data: null,
      rawText: trimmed.slice(0, 300),
      reason: err?.message || 'json_parse_error',
    };
  }
}

const MERCADOPAGO_WEBHOOK_SIGNING_SECRET =
  process.env.MERCADOPAGO_WEBHOOK_SECRET ||
  process.env.MERCADOPAGO_ACCESS_TOKEN ||
  'mpwhsec_paredaogk_itapeva_2026';

interface RuntimeWebhookConfig {
  id: string;
  webhookUrl: string;
  signingSecret: string;
  isActive: boolean;
  subscribedEvents: string[];
  updatedAt: string;
  updatedBy?: string;
}

interface RuntimeWebhookLog {
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

interface PixChargeRecord {
  id: string;
  userId?: string;
  type: 'wallet_deposit' | 'match_booking';
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  provider: 'mercadopago' | 'mercadopago-sandbox';
  qrCodeText: string;
  qrCodeBase64: string | null;
  ticketUrl?: string | null;
  receiptCode?: string;
  matchId?: string;
  description?: string;
  slotsCount?: number;
  goalkeeperIds?: string[];
  supabaseCredited: boolean;
  createdAt: string;
  expiresAt: string;
  confirmedAt?: string;
}

const SERVER_ITAPEVA_BASE_COORDS = { lat: -23.9822, lng: -48.8756 };

const SERVER_REGIONAL_COORDS: Record<string, { lat: number; lng: number }> = {
  'itapeva': { lat: -23.9822, lng: -48.8756 },
  'centro': { lat: -23.9822, lng: -48.8756 },
  'araxa': { lat: -23.9781, lng: -48.8672 },
  'jardim ferrari': { lat: -23.9894, lng: -48.8825 },
  'vila aparecida': { lat: -23.9756, lng: -48.8834 },
  'vila oPHIR': { lat: -23.9765, lng: -48.8615 },
  'jardim maringa': { lat: -23.9912, lng: -48.8691 },
  'parque sao jorge': { lat: -23.9958, lng: -48.8841 },
  'vila mariana': { lat: -23.9685, lng: -48.8712 },
  'taquarivai': { lat: -23.9244, lng: -48.6939 },
  'nova campina': { lat: -24.1225, lng: -48.9022 },
  'ribeirao branco': { lat: -24.2208, lng: -48.7656 },
  'itabera': { lat: -23.8619, lng: -49.1372 },
  'buri': { lat: -23.7975, lng: -48.5928 },
  'capao bonito': { lat: -24.0056, lng: -48.3489 },
  'itapetininga': { lat: -23.5917, lng: -48.0531 },
};

function normalizeGeoKey(val?: string | null): string {
  return String(val || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function haversineKmServer(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return Number((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
}

function resolveCoordsServer(
  city?: string | null,
  neighborhood?: string | null,
  lat?: number | null,
  lng?: number | null
): { lat: number; lng: number } {
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat !== 0 &&
    lng !== 0
  ) {
    return { lat, lng };
  }
  const combined = `${normalizeGeoKey(neighborhood)} ${normalizeGeoKey(city)}`;
  for (const [key, coords] of Object.entries(SERVER_REGIONAL_COORDS)) {
    if (combined.includes(normalizeGeoKey(key))) {
      return coords;
    }
  }
  return SERVER_ITAPEVA_BASE_COORDS;
}

function computeServerProfileDistanceKm(
  profile: Record<string, any>,
  originCity?: string | null,
  originAddress?: string | null
): number {
  const storedDistance = Number(profile.distance_km);
  const hasStored = Number.isFinite(storedDistance) && storedDistance > 0;
  const originCoords = resolveCoordsServer(originCity, originAddress);
  const targetCoords = resolveCoordsServer(
    profile.city,
    profile.neighborhood,
    typeof profile.latitude === 'number' ? profile.latitude : Number(profile.lat),
    typeof profile.longitude === 'number' ? profile.longitude : Number(profile.lng)
  );
  const geoDist = haversineKmServer(
    originCoords.lat,
    originCoords.lng,
    targetCoords.lat,
    targetCoords.lng
  );
  if (hasStored && geoDist <= 1) {
    return Number(storedDistance.toFixed(1));
  }
  return geoDist > 0 ? geoDist : hasStored ? Number(storedDistance.toFixed(1)) : 2.5;
}

function getEvolutionApiConfig() {
  const apiUrl = cleanEnvSecret(process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
  const apiKey = cleanEnvSecret(process.env.EVOLUTION_API_KEY || '');
  const instanceName = cleanEnvSecret(process.env.EVOLUTION_INSTANCE_NAME || 'paredaogk');
  const configured =
    Boolean(apiUrl) &&
    Boolean(apiKey) &&
    !isPlaceholderSecret(apiUrl) &&
    !isPlaceholderSecret(apiKey);
  return { apiUrl, apiKey, instanceName, configured };
}

function normalizePhoneBrazilE164(rawPhone?: string | null): string {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits || digits.length < 10) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

async function sendEvolutionWhatsappText(params: {
  phone: string;
  text: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const cfg = getEvolutionApiConfig();
  const normalizedPhone = normalizePhoneBrazilE164(params.phone);
  if (!normalizedPhone) {
    return { sent: false, reason: 'invalid_phone' };
  }
  if (!cfg.configured) {
    return { sent: false, reason: 'evolution_api_not_configured' };
  }

  try {
    const endpoint = `${cfg.apiUrl}/message/sendText/${encodeURIComponent(cfg.instanceName)}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.apiKey,
      },
      body: JSON.stringify({
        number: normalizedPhone,
        text: params.text,
        delay: 600,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return { sent: false, reason: `http_${response.status}:${errText.slice(0, 120)}` };
    }
    return { sent: true };
  } catch (err: any) {
    return { sent: false, reason: err?.message || 'evolution_fetch_error' };
  }
}

const pixChargesStore = new Map<string, PixChargeRecord>();

const runtimeWebhookConfig: RuntimeWebhookConfig = {
  id: 'mercadopago-webhook-default',
  webhookUrl: `${process.env.VITE_APP_URL || process.env.APP_URL || ''}/api/webhook-mercadopago`,
  signingSecret: MERCADOPAGO_WEBHOOK_SIGNING_SECRET,
  isActive: true,
  subscribedEvents: [
    'payment.confirmed',
    'custody.released',
    'withdrawal.processed',
    'withdrawal.rejected',
  ],
  updatedAt: new Date().toISOString(),
  updatedBy: 'sistema',
};

const webhookEventLogs: RuntimeWebhookLog[] = [];

function pushWebhookLog(entry: RuntimeWebhookLog) {
  webhookEventLogs.unshift(entry);
  if (webhookEventLogs.length > 100) {
    webhookEventLogs.length = 100;
  }
}

function verifyMercadoPagoHmac(
  rawBody: string,
  signature: string | undefined,
  secret: string,
  mpManifestParams?: { dataId?: string; requestId?: string }
) {
  if (!signature) {
    return { valid: false, expected: '' };
  }
  const secretsToCheck = Array.from(
    new Set(
      [
        secret,
        process.env.MERCADOPAGO_WEBHOOK_SECRET,
        process.env.MERCADOPAGO_ACCESS_TOKEN,
      ].filter((s): s is string => Boolean(s && !isPlaceholderSecret(s)))
    )
  );

  // Suporte ao formato oficial x-signature do Mercado Pago: "ts=...,v1=..."
  let mpTs = '';
  let mpV1 = '';
  if (signature.includes('ts=') && signature.includes('v1=')) {
    const parts = signature.split(',');
    for (const part of parts) {
      const [k, v] = part.split('=').map((s) => s.trim());
      if (k === 'ts') mpTs = v || '';
      if (k === 'v1') mpV1 = v || '';
    }
  }

  let expectedPrimary = '';
  for (const candidateSecret of secretsToCheck) {
    // 1. Verificar formato nativo Mercado Pago (ts + v1 com manifest)
    if (mpTs && mpV1) {
      const manifestParts: string[] = [];
      if (mpManifestParams?.dataId) manifestParts.push(`id:${mpManifestParams.dataId}`);
      if (mpManifestParams?.requestId) manifestParts.push(`request-id:${mpManifestParams.requestId}`);
      manifestParts.push(`ts:${mpTs}`);
      const manifest = `${manifestParts.join(';')};`;

      const mpCalc = crypto.createHmac('sha256', candidateSecret).update(manifest).digest('hex');
      if (!expectedPrimary) expectedPrimary = mpCalc;

      const sigBuf = Buffer.from(mpV1, 'utf8');
      const calcBuf = Buffer.from(mpCalc, 'utf8');
      if (sigBuf.length === calcBuf.length && crypto.timingSafeEqual(sigBuf, calcBuf)) {
        return { valid: true, expected: mpCalc };
      }
    }

    // 2. Verificar HMAC-SHA256 padrão sobre o rawBody
    const calculatedSignature = crypto
      .createHmac('sha256', candidateSecret)
      .update(rawBody)
      .digest('hex');

    if (!expectedPrimary) expectedPrimary = calculatedSignature;

    const cleanSig = signature.replace(/^sha256=/i, '').trim();
    const signatureBuffer = Buffer.from(cleanSig, 'utf8');
    const calculatedBuffer = Buffer.from(calculatedSignature, 'utf8');
    if (
      signatureBuffer.length === calculatedBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, calculatedBuffer)
    ) {
      return { valid: true, expected: calculatedSignature };
    }
  }

  return { valid: false, expected: expectedPrimary };
}

const HOUSE_FEE_BRL = 5;

function detectProfileBalanceColumns(profile: Record<string, any> | null | undefined) {
  const row = profile || {};
  const availableCandidates = ['wallet_balance', 'balance', 'saldo', 'available_balance'];
  const custodyCandidates = ['pending_balance', 'custody_balance', 'saldo_custodia', 'escrow_balance'];

  const availableCol =
    availableCandidates.find((col) => Object.prototype.hasOwnProperty.call(row, col)) ||
    'wallet_balance';
  const custodyCol =
    custodyCandidates.find((col) => Object.prototype.hasOwnProperty.call(row, col)) ||
    'pending_balance';
  const hasUpdatedAt = Object.prototype.hasOwnProperty.call(row, 'updated_at');

  return { availableCol, custodyCol, hasUpdatedAt };
}

async function resolveSupabaseProfileForCredit(params: {
  supabaseClient: any;
  userId?: string;
  payerEmail?: string;
  profileName?: string;
}): Promise<{ profile: Record<string, any> | null; resolvedUserId: string; error?: string }> {
  const { supabaseClient, userId, payerEmail, profileName } = params;
  const cleanUserId = userId && userId !== 'usr-guest' ? userId.trim() : '';
  const cleanEmail = payerEmail ? payerEmail.trim().toLowerCase() : '';
  const cleanName = profileName ? profileName.trim() : '';

  if (cleanUserId && isValidUuid(cleanUserId)) {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', cleanUserId)
      .maybeSingle();

    if (!error && data) {
      return { profile: data, resolvedUserId: String(data.id || cleanUserId) };
    }
    if (error) {
      console.warn('[Supabase Profile Fetch by ID Warning]', error.message);
    }
  }

  if (cleanEmail) {
    const { data: byEmail, error: emailErr } = await supabaseClient
      .from('profiles')
      .select('*')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (!emailErr && byEmail) {
      return { profile: byEmail, resolvedUserId: String(byEmail.id) };
    }
  }

  if (cleanName) {
    const { data: byName, error: nameErr } = await supabaseClient
      .from('profiles')
      .select('*')
      .ilike('name', cleanName)
      .limit(1)
      .maybeSingle();

    if (!nameErr && byName) {
      return { profile: byName, resolvedUserId: String(byName.id) };
    }
  }

  // Se houver UUID válido do Supabase Auth sem linha em profiles ainda, criar perfil base
  if (cleanUserId && isValidUuid(cleanUserId)) {
    let fallbackName = cleanEmail ? cleanEmail.split('@')[0] : 'Atleta ParedaoGK';
    let resolvedAuthEmail = cleanEmail;

    try {
      const { data: authData } = await supabaseClient.auth.admin.getUserById(cleanUserId);
      if (authData?.user) {
        resolvedAuthEmail = authData.user.email || resolvedAuthEmail;
        fallbackName =
          (authData.user.user_metadata?.full_name as string) ||
          (authData.user.user_metadata?.name as string) ||
          fallbackName;
      }
    } catch {
      // Ignorar quando a chave não possuir escopo auth.admin
    }

    const baseProfile: Record<string, any> = {
      id: cleanUserId,
      name: fallbackName,
      email: resolvedAuthEmail || `${cleanUserId}@paredaogk.local`,
      role: 'contratante',
      wallet_balance: 0,
      pending_balance: 0,
      cashback_balance: 0,
      created_at: new Date().toISOString(),
    };

    const upsertRes = await resilientSupabaseUpsert(supabaseClient, 'profiles', baseProfile, 'id');
    if (!upsertRes.error) {
      return {
        profile: upsertRes.data || baseProfile,
        resolvedUserId: cleanUserId,
      };
    }

    return {
      profile: null,
      resolvedUserId: cleanUserId,
      error: upsertRes.error?.message || 'profile_creation_failed',
    };
  }

  return { profile: null, resolvedUserId: '', error: 'profile_not_found' };
}

async function creditSupabaseWalletFromWebhook(params: {
  paymentId: string;
  userId?: string;
  goalkeeperId?: string;
  goalkeeperName?: string;
  payerEmail?: string;
  paymentType: 'wallet_deposit' | 'match_booking';
  event: string;
  grossAmountBrl: number;
  houseFeeBrl: number;
  netAmountBrl: number;
  receiptCode: string;
  matchId?: string;
  arenaName?: string;
  description?: string;
}): Promise<{
  credited: boolean;
  newBalance?: number;
  newCustodyBalance?: number;
  creditedColumn?: string;
  resolvedTargetUserId?: string;
  alreadyProcessed?: boolean;
  reason?: string;
}> {
  const {
    paymentId,
    userId,
    goalkeeperId,
    goalkeeperName,
    payerEmail,
    paymentType,
    event,
    grossAmountBrl,
    houseFeeBrl,
    netAmountBrl,
    receiptCode,
    matchId,
    arenaName,
    description,
  } = params;

  if (!grossAmountBrl || grossAmountBrl <= 0) {
    return { credited: false, reason: 'amount_missing_or_invalid' };
  }

  const supabaseClient = getServerSupabaseAdminClient(false);
  if (!supabaseClient) {
    return { credited: false, reason: 'supabase_credentials_not_configured' };
  }

  try {
    const cleanPaymentKey = paymentId.replace(/[^a-zA-Z0-9_-]/g, '');
    const txId =
      event === 'custody.released' ? `tx-mp-rel-${cleanPaymentKey}` : `tx-mp-${cleanPaymentKey}`;
    const feeTxId = `tx-mp-fee-${cleanPaymentKey}`;

    const { data: existingTx } = await supabaseClient
      .from('wallet_transactions')
      .select('id, status')
      .eq('id', txId)
      .maybeSingle();

    const isBookingFlow = paymentType === 'match_booking' || event === 'custody.released';

    // Para contratação de goleiro, tentar primeiro o perfil do goleiro; se for ID local/catálogo (não-UUID),
    // usar o perfil autenticado do contratante para registrar custódia e separar Taxa da Casa sem falhar.
    let profileLookup: { profile: Record<string, any> | null; resolvedUserId: string; error?: string } = {
      profile: null,
      resolvedUserId: '',
    };

    if (isBookingFlow && (goalkeeperId || goalkeeperName)) {
      profileLookup = await resolveSupabaseProfileForCredit({
        supabaseClient,
        userId: goalkeeperId,
        profileName: goalkeeperName,
      });
    }

    if (!profileLookup.profile || !profileLookup.resolvedUserId) {
      profileLookup = await resolveSupabaseProfileForCredit({
        supabaseClient,
        userId,
        payerEmail,
      });
    }

    if (!profileLookup.profile || !profileLookup.resolvedUserId) {
      return {
        credited: false,
        reason: profileLookup.error || 'userId_or_profile_not_found',
      };
    }

    const profile = profileLookup.profile;
    const targetUserId = profileLookup.resolvedUserId;
    const { availableCol, custodyCol, hasUpdatedAt } = detectProfileBalanceColumns(profile);

    const currentAvailable = Number(profile[availableCol] ?? 0);
    const currentCustody = Number(profile[custodyCol] ?? 0);

    if (existingTx && (existingTx.status === 'completed' || existingTx.status === 'pending')) {
      return {
        credited: true,
        alreadyProcessed: true,
        newBalance: Number(currentAvailable.toFixed(2)),
        newCustodyBalance: Number(currentCustody.toFixed(2)),
        creditedColumn:
          paymentType === 'match_booking' && event !== 'custody.released' ? custodyCol : availableCol,
        resolvedTargetUserId: targetUserId,
      };
    }

    const nowIso = new Date().toISOString();
    const isCustodyCredit = paymentType === 'match_booking' && event !== 'custody.released';
    const isCustodyRelease = event === 'custody.released';

    // Valor líquido creditado após dedução da taxa da casa
    const creditValue = Number((netAmountBrl > 0 ? netAmountBrl : grossAmountBrl).toFixed(2));

    let nextAvailable = currentAvailable;
    let nextCustody = currentCustody;
    let creditedColumn = availableCol;

    const profileUpdatePayload: Record<string, any> = {};

    if (isCustodyRelease) {
      nextCustody = Number(Math.max(0, currentCustody - creditValue).toFixed(2));
      nextAvailable = Number((currentAvailable + creditValue).toFixed(2));
      profileUpdatePayload[availableCol] = nextAvailable;
      if (Object.prototype.hasOwnProperty.call(profile, custodyCol)) {
        profileUpdatePayload[custodyCol] = nextCustody;
      }
      creditedColumn = availableCol;
    } else if (isCustodyCredit && Object.prototype.hasOwnProperty.call(profile, custodyCol)) {
      nextCustody = Number((currentCustody + creditValue).toFixed(2));
      profileUpdatePayload[custodyCol] = nextCustody;
      creditedColumn = custodyCol;
    } else {
      nextAvailable = Number((currentAvailable + creditValue).toFixed(2));
      profileUpdatePayload[availableCol] = nextAvailable;
      creditedColumn = availableCol;
    }

    if (hasUpdatedAt) {
      profileUpdatePayload.updated_at = nowIso;
    }

    // 1. Gravar transação líquida principal (com colunas opcionais resilientes)
    const txDescription =
      houseFeeBrl > 0
        ? `${description || (isCustodyCredit ? 'Cachê em Custódia ParedãoGK' : 'Recarga Pix Mercado Pago')} · Bruto R$ ${grossAmountBrl.toFixed(2)} | Taxa Casa R$ ${houseFeeBrl.toFixed(2)} | Líquido R$ ${creditValue.toFixed(2)}`
        : description || 'Recarga Pix Mercado Pago Confirmada (Webhook)';

    const mainTxRow: Record<string, any> = {
      id: txId,
      user_id: targetUserId,
      type: isCustodyCredit || isCustodyRelease ? 'match_cache' : 'pix_in',
      amount: creditValue,
      gross_amount: grossAmountBrl,
      house_fee: houseFeeBrl,
      net_amount: creditValue,
      description: txDescription,
      status: isCustodyCredit ? 'pending' : 'completed',
      receipt_code: receiptCode,
      provider: 'mercadopago',
      match_id: matchId || null,
      arena_name: arenaName || null,
      created_at: nowIso,
    };

    const mainTxRes = await resilientSupabaseUpsert(
      supabaseClient,
      'wallet_transactions',
      mainTxRow,
      'id'
    );

    if (mainTxRes.error) {
      return { credited: false, reason: `wallet_transactions_error: ${mainTxRes.error.message}` };
    }

    // 2. Se houver Taxa da Casa (R$ 5,00), registrar lançamento separado da Taxa da Casa para auditoria contábil
    if (houseFeeBrl > 0 && !isCustodyRelease) {
      const feeOwnerId = isValidUuid(userId) ? String(userId).trim() : targetUserId;
      const feeTxRow: Record<string, any> = {
        id: feeTxId,
        user_id: feeOwnerId,
        type: 'house_fee',
        amount: -Number(houseFeeBrl.toFixed(2)),
        gross_amount: grossAmountBrl,
        house_fee: houseFeeBrl,
        net_amount: creditValue,
        description: `Taxa da Casa ParedãoGK (R$ ${houseFeeBrl.toFixed(2)}) · Pagamento Pix ${receiptCode}`,
        status: 'completed',
        receipt_code: `${receiptCode}-FEE`,
        provider: 'mercadopago',
        match_id: matchId || null,
        arena_name: arenaName || null,
        created_at: nowIso,
      };
      const feeTxRes = await resilientSupabaseUpsert(
        supabaseClient,
        'wallet_transactions',
        feeTxRow,
        'id'
      );
      if (feeTxRes.error) {
        console.warn('[Webhook House Fee Tx Note]', feeTxRes.error.message);
      }
    }

    // 3. Atualizar saldo na tabela profiles usando o nome exato da coluna existente
    let profUpdateRes = await resilientSupabaseUpdate(
      supabaseClient,
      'profiles',
      profileUpdatePayload,
      'id',
      targetUserId
    );

    // Fallback de nome de coluna caso a coluna inferida falhe por cache/schema divergente
    if (profUpdateRes.error) {
      const missingCol = extractMissingColumnFromSupabaseError(profUpdateRes.error);
      if (missingCol === custodyCol && custodyCol !== availableCol) {
        nextAvailable = Number((currentAvailable + creditValue).toFixed(2));
        const fallbackUpdate: Record<string, any> = {
          [availableCol]: nextAvailable,
        };
        creditedColumn = availableCol;
        profUpdateRes = await resilientSupabaseUpdate(
          supabaseClient,
          'profiles',
          fallbackUpdate,
          'id',
          targetUserId
        );
      }
    }

    if (profUpdateRes.error) {
      return {
        credited: false,
        reason: `profiles_update_error: ${profUpdateRes.error.message}`,
      };
    }

    // 4. Notificação resiliente ao usuário/goleiro
    await resilientSupabaseUpsert(
      supabaseClient,
      'notifications',
      {
        id: `notif-mp-${cleanPaymentKey}-${Date.now().toString().slice(-4)}`,
        user_id: targetUserId,
        category: 'wallet',
        title: isCustodyCredit
          ? '🛡️ Cachê Protegido em Custódia Mercado Pago!'
          : isCustodyRelease
          ? '🔓 Custódia Liberada para Saque!'
          : '💰 Recarga Pix Mercado Pago Confirmada!',
        description:
          houseFeeBrl > 0
            ? `Pagamento de R$ ${grossAmountBrl.toFixed(2)} confirmado (Taxa da Casa: R$ ${houseFeeBrl.toFixed(2)} · Valor líquido creditado: R$ ${creditValue.toFixed(2)}). Comprovante: ${receiptCode}.`
            : `Crédito de R$ ${creditValue.toFixed(2)} adicionado à sua carteira digital. Comprovante: ${receiptCode}.`,
        read: false,
        created_at: nowIso,
      },
      'id'
    ).catch(() => undefined);

    return {
      credited: true,
      newBalance: nextAvailable,
      newCustodyBalance: nextCustody,
      creditedColumn,
      resolvedTargetUserId: targetUserId,
    };
  } catch (err: any) {
    console.error('[Server Webhook Supabase Credit Error]', err?.message || err);
    return { credited: false, reason: err?.message || 'unexpected_error' };
  }
}

async function processApprovedWebhookPayload(params: {
  parsedPayload: Record<string, any>;
  signatureHeader: string;
  hmacValid: boolean;
  source: 'live' | 'test_dispatch';
}) {
  const { parsedPayload, signatureHeader, hmacValid, source } = params;
  const nowIso = new Date().toISOString();
  const event = String(
    parsedPayload?.event || parsedPayload?.action || parsedPayload?.type || 'payment.confirmed'
  );
  const data = parsedPayload?.data || {};
  const paymentId = String(
    data?.id || parsedPayload?.paymentId || parsedPayload?.id || `mp_${Date.now()}`
  );
  const statusNormalized = String(
    data?.status || parsedPayload?.status || ''
  ).toLowerCase();

  const isPaymentApprovedEvent =
    event === 'payment.confirmed' ||
    event === 'payment.approved' ||
    event === 'pix.confirmed' ||
    event === 'pix.paid' ||
    event === 'custody.released' ||
    statusNormalized === 'approved' ||
    statusNormalized === 'paid' ||
    statusNormalized === 'confirmed' ||
    statusNormalized === 'released';

  const existingCharge = pixChargesStore.get(paymentId);
  const grossAmountBrl = Number(
    data?.transaction_amount ??
      data?.amount_brl ??
      (data?.amount ? Number(data.amount) / 100 : existingCharge?.amount ?? 0)
  );

  // Recuperar userId mesmo em lambdas serverless stateless (metadata, external_reference ou payer.email)
  const externalRef = String(data?.external_reference || parsedPayload?.external_reference || '');
  const walletRefMatch = externalRef.match(/^wallet_([a-zA-Z0-9-]+?)_\d+$/);
  const userId = String(
    data?.metadata?.user_id ||
      parsedPayload?.metadata?.user_id ||
      data?.user_id ||
      existingCharge?.userId ||
      walletRefMatch?.[1] ||
      ''
  ).trim();

  const goalkeeperId = String(
    data?.metadata?.goalkeeper_id ||
      parsedPayload?.metadata?.goalkeeper_id ||
      data?.goalkeeper_id ||
      ''
  ).trim();

  const rawGoalkeeperIdsStr = String(
    data?.metadata?.goalkeeper_ids || parsedPayload?.metadata?.goalkeeper_ids || ''
  ).trim();
  const parsedGoalkeeperIds = Array.from(
    new Set([
      ...(rawGoalkeeperIdsStr
        ? rawGoalkeeperIdsStr.split(',').map((s) => s.trim()).filter(Boolean)
        : []),
      ...(Array.isArray(existingCharge?.goalkeeperIds) ? existingCharge.goalkeeperIds : []),
      ...(goalkeeperId ? [goalkeeperId] : []),
    ])
  );

  const goalkeeperName = String(
    data?.metadata?.goalkeeper_name ||
      parsedPayload?.metadata?.goalkeeper_name ||
      data?.goalkeeper_name ||
      ''
  ).trim();

  const payerEmail = String(
    data?.metadata?.payer_email ||
      data?.payer?.email ||
      parsedPayload?.payer?.email ||
      ''
  )
    .trim()
    .toLowerCase();

  const rawPaymentType = String(
    data?.metadata?.type ||
      parsedPayload?.metadata?.type ||
      existingCharge?.type ||
      (externalRef.startsWith('mtch') || Boolean(goalkeeperId) || parsedGoalkeeperIds.length > 0
        ? 'match_booking'
        : 'wallet_deposit')
  ).toLowerCase();
  const paymentType: 'wallet_deposit' | 'match_booking' =
    rawPaymentType === 'match_booking' ? 'match_booking' : 'wallet_deposit';

  const slotsCount = Math.min(
    2,
    Math.max(
      1,
      Number(
        data?.metadata?.slots_count ||
          existingCharge?.slotsCount ||
          (parsedGoalkeeperIds.length > 1 ? parsedGoalkeeperIds.length : 1)
      )
    )
  );

  const explicitHouseFee = data?.house_fee_brl ?? data?.metadata?.house_fee_brl;
  const houseFeeBrl =
    explicitHouseFee !== undefined && explicitHouseFee !== null && explicitHouseFee !== ''
      ? Math.min(grossAmountBrl, Math.max(0, Number(explicitHouseFee)))
      : paymentType === 'match_booking' && grossAmountBrl > 0
      ? Math.min(grossAmountBrl, HOUSE_FEE_BRL * slotsCount)
      : 0;

  const netAmountBrl = Number(Math.max(0, grossAmountBrl - houseFeeBrl).toFixed(2));

  const receiptCode = String(
    data?.pix_receipt ||
      existingCharge?.receiptCode ||
      `MP-${paymentId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || Date.now().toString().slice(-6)}`
  );

  const matchId = data?.metadata?.match_id || existingCharge?.matchId;
  const arenaName = data?.metadata?.arena_name;

  let supabaseCredited = existingCharge?.supabaseCredited || false;
  let newWalletBalance: number | undefined;
  let newCustodyBalance: number | undefined;
  let creditedColumn: string | undefined;
  let resolvedTargetUserId: string | undefined = parsedGoalkeeperIds[0] || goalkeeperId || userId || undefined;
  let creditReason: string | undefined;
  let alreadyProcessed = existingCharge?.status === 'completed';

  if (isPaymentApprovedEvent && !alreadyProcessed) {
    if (grossAmountBrl > 0 && (userId || goalkeeperId || parsedGoalkeeperIds.length > 0 || goalkeeperName || payerEmail)) {
      if (paymentType === 'match_booking' && parsedGoalkeeperIds.length > 1) {
        const slotTargets = parsedGoalkeeperIds.slice(0, slotsCount);
        const perSlotGross = Number((grossAmountBrl / slotTargets.length).toFixed(2));
        const perSlotFee = Number((houseFeeBrl / slotTargets.length).toFixed(2));
        const perSlotNet = Number((netAmountBrl / slotTargets.length).toFixed(2));

        let anyCredited = false;
        for (let idx = 0; idx < slotTargets.length; idx++) {
          const gkTargetId = slotTargets[idx];
          const slotRes = await creditSupabaseWalletFromWebhook({
            paymentId: `${paymentId}_slot${idx + 1}`,
            userId,
            goalkeeperId: gkTargetId,
            goalkeeperName: idx === 0 ? goalkeeperName || undefined : undefined,
            payerEmail: payerEmail || undefined,
            paymentType,
            event,
            grossAmountBrl: perSlotGross,
            houseFeeBrl: perSlotFee,
            netAmountBrl: perSlotNet,
            receiptCode: `${receiptCode}-V${idx + 1}`,
            matchId,
            arenaName,
            description:
              existingCharge?.description ||
              `Convocação Vaga ${idx + 1}/${slotTargets.length} ParedãoGK`,
          });
          if (slotRes.credited) {
            anyCredited = true;
            newWalletBalance = slotRes.newBalance;
            newCustodyBalance = slotRes.newCustodyBalance;
            creditedColumn = slotRes.creditedColumn;
            resolvedTargetUserId = slotRes.resolvedTargetUserId || resolvedTargetUserId;
          } else if (slotRes.reason) {
            creditReason = slotRes.reason;
          }
        }
        supabaseCredited = anyCredited;
      } else {
        const creditResult = await creditSupabaseWalletFromWebhook({
          paymentId,
          userId,
          goalkeeperId: parsedGoalkeeperIds[0] || goalkeeperId || undefined,
          goalkeeperName: goalkeeperName || undefined,
          payerEmail: payerEmail || undefined,
          paymentType,
          event,
          grossAmountBrl,
          houseFeeBrl,
          netAmountBrl,
          receiptCode,
          matchId,
          arenaName,
          description:
            existingCharge?.description ||
            data?.description ||
            (paymentType === 'match_booking'
              ? 'Contratação de Goleiro via Pix Mercado Pago'
              : 'Recarga Carteira Digital ParedãoGK'),
        });
        supabaseCredited = creditResult.credited;
        newWalletBalance = creditResult.newBalance;
        newCustodyBalance = creditResult.newCustodyBalance;
        creditedColumn = creditResult.creditedColumn;
        resolvedTargetUserId = creditResult.resolvedTargetUserId || resolvedTargetUserId;
        creditReason = creditResult.reason;
        alreadyProcessed = Boolean(creditResult.alreadyProcessed);
      }
    } else {
      creditReason = 'missing_payer_identifier_or_amount';
    }

    const updatedCharge: PixChargeRecord = {
      id: paymentId,
      userId: userId || resolvedTargetUserId || undefined,
      type: paymentType,
      amount: grossAmountBrl,
      status: 'completed',
      provider: existingCharge?.provider || 'mercadopago',
      qrCodeText: existingCharge?.qrCodeText || '',
      qrCodeBase64: existingCharge?.qrCodeBase64 || null,
      ticketUrl: existingCharge?.ticketUrl || null,
      receiptCode,
      matchId,
      description: existingCharge?.description,
      supabaseCredited,
      createdAt: existingCharge?.createdAt || nowIso,
      expiresAt: existingCharge?.expiresAt || nowIso,
      confirmedAt: nowIso,
    };
    pixChargesStore.set(paymentId, updatedCharge);
  }

  const responseBody = {
    success: true,
    received: true,
    authenticated: hmacValid,
    event,
    status: data?.status || 'processed',
    paymentType,
    paymentId,
    userId: userId || resolvedTargetUserId || undefined,
    goalkeeperId: goalkeeperId || undefined,
    resolvedTargetUserId,
    amount: grossAmountBrl,
    grossAmount: grossAmountBrl,
    houseFee: houseFeeBrl,
    netAmount: netAmountBrl,
    creditedColumn,
    receiptCode,
    supabaseCredited,
    creditReason,
    newWalletBalance,
    newCustodyBalance,
    alreadyProcessed,
    matchId,
    processedAt: nowIso,
  };

  pushWebhookLog({
    id: `whlog-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    event,
    endpointUrl: runtimeWebhookConfig.webhookUrl || '/api/webhook-mercadopago',
    httpStatus: 200,
    hmacValid,
    signatureHeader,
    payload: parsedPayload,
    responseBody,
    source,
    createdAt: nowIso,
  });

  return responseBody;
}

const WEBHOOK_MERCADOPAGO_PATHS = [
  '/api/webhook-mercadopago',
  '/api/webhook-mercadopago/',
  '/webhook-mercadopago',
  '/webhook-mercadopago/',
];

// Preservar req.body caso já tenha sido parseado pelo runtime serverless (Vercel/Node)
app.use((req: any, _res: Response, next: express.NextFunction) => {
  if (
    req.body !== undefined &&
    (Buffer.isBuffer(req.body) ||
      typeof req.body === 'string' ||
      (typeof req.body === 'object' && req.body !== null && Object.keys(req.body).length > 0))
  ) {
    req._body = true;
  }
  next();
});

// Capturar raw body para validação criptográfica HMAC no webhook do Mercado Pago
app.use(WEBHOOK_MERCADOPAGO_PATHS, express.raw({ type: '*/*' }));
app.use(express.json());

// Endpoint de integridade
app.get('/api/health', (_req: Request, res: Response) => {
  const creds = getMercadoPagoCredentials();
  res.json({
    status: 'ok',
    app: 'ParedãoGK',
    mercadopagoConfigured: creds.isLiveConfigured,
    mercadopagoPublicKeyConfigured: Boolean(creds.publicKey),
    time: new Date().toISOString(),
  });
});

const MERCADOPAGO_PAYMENTS_PRODUCTION_URL = 'https://api.mercadopago.com/v1/payments';

function maskEmailForLog(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

function validateMercadoPagoProductionPixPayload(params: {
  headers: Record<string, string>;
  payload: Record<string, any>;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const { headers, payload } = params;

  if (!headers['Authorization'] || !headers['Authorization'].startsWith('Bearer ')) {
    errors.push('Cabeçalho Authorization Bearer ausente ou inválido.');
  }
  if (!headers['X-Idempotency-Key'] || headers['X-Idempotency-Key'].trim().length < 4) {
    errors.push('Cabeçalho X-Idempotency-Key ausente ou inválido.');
  }
  if (headers['Content-Type'] !== 'application/json') {
    errors.push('Cabeçalho Content-Type deve ser application/json.');
  }

  if (payload.payment_method_id !== 'pix') {
    errors.push("Campo payment_method_id deve ser estritamente 'pix'.");
  }
  if (
    typeof payload.transaction_amount !== 'number' ||
    !Number.isFinite(payload.transaction_amount) ||
    payload.transaction_amount < 0.01
  ) {
    errors.push('Campo transaction_amount inválido (deve ser numérico >= 0.01).');
  }
  if (typeof payload.description !== 'string' || payload.description.trim().length < 3) {
    errors.push('Campo description obrigatório e deve conter descrição clara da cobrança.');
  }
  if (typeof payload.external_reference !== 'string' || !payload.external_reference.trim()) {
    errors.push('Campo external_reference não pode ser vazio.');
  }
  if (
    typeof payload.date_of_expiration !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/.test(payload.date_of_expiration)
  ) {
    errors.push('Campo date_of_expiration deve seguir ISO-8601 com fuso horário (ex: -03:00).');
  }

  const payer = payload.payer;
  if (!payer || typeof payer !== 'object') {
    errors.push('Objeto payer obrigatório ausente.');
  } else {
    if (typeof payer.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payer.email)) {
      errors.push('Campo payer.email obrigatório e válido.');
    }
    if (typeof payer.first_name !== 'string' || !payer.first_name.trim()) {
      errors.push('Campo payer.first_name não pode estar vazio.');
    }
    if (typeof payer.last_name !== 'string' || !payer.last_name.trim()) {
      errors.push('Campo payer.last_name não pode estar vazio.');
    }
    if (payer.identification !== undefined) {
      if (
        !payer.identification ||
        payer.identification.type !== 'CPF' ||
        !isValidBrazilianCpf(String(payer.identification.number || ''))
      ) {
        errors.push('Campo payer.identification.number inválido ou vazio.');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 1. Rota de API: /api/gerar-pix-mercadopago
 * Força chamadas ao endpoint real de produção do Mercado Pago (POST https://api.mercadopago.com/v1/payments)
 * sem fallback para sandbox quando configurado ou em ambiente de produção, validando cabeçalhos,
 * payload Pix e dados reais do pagador autenticado para evitar erros [QRCD10] / [QR104DES].
 */
async function handleGerarPixMercadoPago(req: Request, res: Response) {
  try {
    const {
      amount,
      valor,
      description,
      payer: bodyPayer,
      customer,
      user: bodyUser,
      matchId,
      userId,
      goalkeeperId,
      goalkeeperIds,
      goalkeeperName,
      arenaName,
      slotsCount,
      publicKey: bodyPublicKey,
      mercadoPagoPublicKey,
      idempotencyKey: bodyIdempotencyKey,
      type = 'wallet_deposit',
      expiresIn = 1800,
    } = req.body || {};

    const paymentAmount = Number(amount || valor || 25);

    if (!paymentAmount || isNaN(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valor de pagamento inválido.',
      });
    }

    const normalizedGoalkeeperIds = Array.from(
      new Set([
        ...(Array.isArray(goalkeeperIds) ? goalkeeperIds.map((g: any) => String(g || '').trim()).filter(Boolean) : []),
        ...(goalkeeperId ? [String(goalkeeperId).trim()] : []),
      ])
    );
    const resolvedSlotsCount = Math.min(
      2,
      Math.max(1, Number(slotsCount || (normalizedGoalkeeperIds.length > 1 ? normalizedGoalkeeperIds.length : 1)))
    );
    const houseFee =
      type === 'match_booking'
        ? Math.min(paymentAmount, HOUSE_FEE_BRL * resolvedSlotsCount)
        : 0;
    const goalkeeperNet = Math.max(0, Number((paymentAmount - houseFee).toFixed(2)));

    // Header de Idempotência: preservar chave válida recebida ou gerar UUID v4 único por requisição
    const headerIdempotencyKey = req.headers['x-idempotency-key'];
    const rawIdempotency =
      typeof headerIdempotencyKey === 'string' && headerIdempotencyKey.trim()
        ? headerIdempotencyKey.trim()
        : typeof bodyIdempotencyKey === 'string' && bodyIdempotencyKey.trim()
        ? bodyIdempotencyKey.trim()
        : '';
    const idempotencyKey =
      rawIdempotency.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || crypto.randomUUID();

    const clientPublicKey =
      (req.headers['x-mercadopago-public-key'] as string | undefined) ||
      (typeof bodyPublicKey === 'string' ? bodyPublicKey : undefined) ||
      (typeof mercadoPagoPublicKey === 'string' ? mercadoPagoPublicKey : undefined);
    const {
      publicKey,
      accessToken,
      isLiveConfigured,
      isTestToken,
      tokenMode,
    } = getMercadoPagoCredentials(clientPublicKey);

    const isVercelOrProductionEnv =
      process.env.VERCEL === '1' ||
      Boolean(process.env.VERCEL_ENV) ||
      process.env.NODE_ENV === 'production';

    if (isTestToken) {
      console.error('[Mercado Pago Pix Production Guard]', {
        timestamp: new Date().toISOString(),
        reason: 'TEST_TOKEN_REJECTED',
        tokenMode,
        tokenPrefix: accessToken.slice(0, 12),
        publicKeyConfigured: Boolean(publicKey),
        vercelEnv: process.env.VERCEL_ENV || process.env.NODE_ENV || 'local',
        message:
          'MERCADOPAGO_ACCESS_TOKEN inicia com TEST- (sandbox/homologação). Isso gera QR Code de teste [QR104DES]. Substitua pelo token de PRODUÇÃO (APP_USR-...).',
      });
      return res.status(400).json({
        success: false,
        provider: 'mercadopago',
        error:
          'Credencial de TESTE/HOMOLOGAÇÃO (TEST-...) detectada em MERCADOPAGO_ACCESS_TOKEN. Configure o Access Token de PRODUÇÃO (APP_USR-...) para emitir Pix válido sem o erro [QR104DES].',
        tokenMode,
        idempotencyKey,
        publicKeyConfigured: Boolean(publicKey),
        accessTokenConfigured: true,
      });
    }

    if (!isLiveConfigured && isVercelOrProductionEnv) {
      console.error('[Mercado Pago Pix Production Guard]', {
        timestamp: new Date().toISOString(),
        reason: 'MISSING_ACCESS_TOKEN_IN_PRODUCTION',
        vercelEnv: process.env.VERCEL_ENV || process.env.NODE_ENV,
        publicKeyConfigured: Boolean(publicKey),
        message:
          'MERCADOPAGO_ACCESS_TOKEN não configurado nas variáveis de ambiente de produção/Vercel.',
      });
      return res.status(500).json({
        success: false,
        provider: 'mercadopago',
        error:
          'MERCADOPAGO_ACCESS_TOKEN não configurado no ambiente de produção. Adicione o token APP_USR-... nas variáveis de ambiente da Vercel.',
        tokenMode: 'missing',
        idempotencyKey,
        publicKeyConfigured: Boolean(publicKey),
        accessTokenConfigured: false,
      });
    }

    // Resolver usuário autenticado via Bearer JWT do Supabase (se disponível)
    let authSessionUser: {
      id?: string;
      email?: string;
      name?: string;
      cpf?: string;
      phone?: string;
    } = {};

    const authHeader = req.headers.authorization;
    const bearerToken =
      typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : '';

    if (bearerToken) {
      const supabaseAdmin = getServerSupabaseAdminClient();
      if (supabaseAdmin) {
        try {
          const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(bearerToken);
          if (!authErr && authData?.user) {
            authSessionUser.id = authData.user.id;
            authSessionUser.email = authData.user.email || undefined;
            authSessionUser.name =
              (authData.user.user_metadata?.full_name as string) ||
              (authData.user.user_metadata?.name as string) ||
              undefined;
            authSessionUser.cpf = (authData.user.user_metadata?.cpf as string) || undefined;
            authSessionUser.phone = (authData.user.user_metadata?.phone as string) || undefined;

            const { data: profileRow } = await supabaseAdmin
              .from('profiles')
              .select('name, email, cpf, phone')
              .eq('id', authData.user.id)
              .maybeSingle();

            if (profileRow) {
              authSessionUser.name = profileRow.name || authSessionUser.name;
              authSessionUser.email = profileRow.email || authSessionUser.email;
              authSessionUser.cpf = profileRow.cpf || authSessionUser.cpf;
              authSessionUser.phone = profileRow.phone || authSessionUser.phone;
            }
          }
        } catch (authLookupErr: any) {
          console.warn('[Mercado Pago Auth Payer Lookup Warning]', authLookupErr?.message);
        }
      }
    }

    const requestCustomer = bodyPayer || customer || bodyUser || {};
    const resolvedUserId =
      authSessionUser.id ||
      (userId && userId !== 'usr-guest' ? String(userId) : undefined) ||
      (bodyUser?.id && bodyUser.id !== 'usr-guest' ? String(bodyUser.id) : undefined);

    const resolvedEmail = String(
      authSessionUser.email || requestCustomer?.email || ''
    )
      .trim()
      .toLowerCase();

    if (!resolvedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resolvedEmail)) {
      return res.status(400).json({
        success: false,
        error:
          'Dados do pagador inválidos: é obrigatório informar um e-mail válido do usuário autenticado para gerar o Pix.',
      });
    }

    const rawBodyName =
      requestCustomer?.first_name && requestCustomer?.last_name
        ? `${requestCustomer.first_name} ${requestCustomer.last_name}`
        : requestCustomer?.name;
    const rawFullName = String(authSessionUser.name || rawBodyName || '').trim();
    const cleanedFullName = rawFullName.replace(/\s+/g, ' ').trim();
    const nameParts = cleanedFullName ? cleanedFullName.split(' ') : [];
    const emailAlias = resolvedEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '') || 'Atleta';
    const firstName = (
      String(requestCustomer?.first_name || nameParts[0] || emailAlias).trim() || 'Atleta'
    ).slice(0, 60);
    const lastName = (
      String(
        requestCustomer?.last_name ||
          (nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'ParedaoGK')
      ).trim() || 'ParedaoGK'
    ).slice(0, 60);

    const rawCpf = String(
      authSessionUser.cpf ||
        requestCustomer?.identification?.number ||
        requestCustomer?.cpf ||
        ''
    ).replace(/\D/g, '');
    const validCpf = isValidBrazilianCpf(rawCpf) ? rawCpf : '';

    const effectiveWebhookUrl =
      runtimeWebhookConfig.webhookUrl && !runtimeWebhookConfig.webhookUrl.startsWith('/')
        ? runtimeWebhookConfig.webhookUrl
        : `${req.protocol}://${req.get('host')}/api/webhook-mercadopago`;

    const isPublicHttpsWebhook =
      effectiveWebhookUrl.startsWith('https://') &&
      !effectiveWebhookUrl.includes('localhost') &&
      !effectiveWebhookUrl.includes('127.0.0.1');

    const resolvedDescription = String(
      description ||
        (type === 'wallet_deposit'
          ? `Recarga Carteira Digital ParedaoGK - R$ ${paymentAmount.toFixed(2)}`
          : `Convocacao Goleiro ParedaoGK - Partida #${matchId || Date.now()}`)
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 250);

    const expirationDateIso = formatMercadoPagoExpirationIso(Number(expiresIn) || 1800);
    const externalReference = String(
      matchId ||
        (resolvedUserId ? `wallet_${resolvedUserId}_${Date.now()}` : `pgk_${Date.now()}`)
    )
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64);

    const resolvedHouseFee = houseFee;
    const resolvedNetAmount = goalkeeperNet;

    const metadataPayload: Record<string, string> = {
      platform: 'ParedaoGK',
      type: String(type === 'match_booking' ? 'match_booking' : 'wallet_deposit'),
      payer_email: resolvedEmail,
      gross_amount_brl: paymentAmount.toFixed(2),
      house_fee_brl: resolvedHouseFee.toFixed(2),
      net_amount_brl: resolvedNetAmount.toFixed(2),
      slots_count: String(resolvedSlotsCount),
    };
    if (resolvedUserId) {
      metadataPayload.user_id = String(resolvedUserId);
    }
    if (goalkeeperId) {
      metadataPayload.goalkeeper_id = String(goalkeeperId);
    }
    if (normalizedGoalkeeperIds.length > 0) {
      metadataPayload.goalkeeper_ids = normalizedGoalkeeperIds.join(',').slice(0, 180);
    }
    if (goalkeeperName) {
      metadataPayload.goalkeeper_name = String(goalkeeperName).slice(0, 80);
    }
    if (arenaName) {
      metadataPayload.arena_name = String(arenaName).slice(0, 80);
    }
    if (matchId || type === 'match_booking') {
      metadataPayload.match_id = String(matchId || `mtch-${Date.now()}`);
    }
    if (publicKey) {
      metadataPayload.public_key_ref = `${publicKey.slice(0, 12)}...`;
    }

    const payerPayload: Record<string, any> = {
      email: resolvedEmail,
      first_name: firstName,
      last_name: lastName,
    };
    if (validCpf) {
      payerPayload.identification = {
        type: 'CPF',
        number: validCpf,
      };
    }

    const payloadMercadoPago: Record<string, any> = {
      transaction_amount: Number(paymentAmount.toFixed(2)),
      description: resolvedDescription,
      payment_method_id: 'pix',
      date_of_expiration: expirationDateIso,
      external_reference: externalReference,
      payer: payerPayload,
      metadata: metadataPayload,
    };

    if (isPublicHttpsWebhook) {
      payloadMercadoPago.notification_url = effectiveWebhookUrl;
    }

    let mpResponse: any = null;
    let isLiveResponse = false;
    let liveApiStatus = 0;
    let liveApiErrorMessage = '';
    let liveApiCauses: any[] | undefined;
    let mpResponseRequestId = '';

    if (isLiveConfigured) {
      const mpHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'X-Idempotency-Key': idempotencyKey,
        'User-Agent': 'ParedaoGK-App/3.0',
      };

      const validationCheck = validateMercadoPagoProductionPixPayload({
        headers: mpHeaders,
        payload: payloadMercadoPago,
      });

      if (!validationCheck.valid) {
        console.error('[Mercado Pago Pix Payload Validation Failed]', {
          timestamp: new Date().toISOString(),
          endpoint: MERCADOPAGO_PAYMENTS_PRODUCTION_URL,
          idempotencyKey,
          errors: validationCheck.errors,
          payloadSummary: {
            transaction_amount: payloadMercadoPago.transaction_amount,
            payment_method_id: payloadMercadoPago.payment_method_id,
            descriptionLength: String(payloadMercadoPago.description || '').length,
            date_of_expiration: payloadMercadoPago.date_of_expiration,
            external_reference: payloadMercadoPago.external_reference,
            payer: {
              email: maskEmailForLog(resolvedEmail),
              first_name: firstName,
              last_name: lastName,
              hasCpf: Boolean(validCpf),
            },
          },
        });
        return res.status(400).json({
          success: false,
          provider: 'mercadopago',
          error: `Payload Pix inválido para produção do Mercado Pago: ${validationCheck.errors.join(' ')}`,
          validationErrors: validationCheck.errors,
          idempotencyKey,
          publicKeyConfigured: Boolean(publicKey),
          accessTokenConfigured: true,
        });
      }

      try {
        const response = await fetch(MERCADOPAGO_PAYMENTS_PRODUCTION_URL, {
          method: 'POST',
          headers: mpHeaders,
          body: JSON.stringify(payloadMercadoPago),
          signal: AbortSignal.timeout(12000),
        });

        liveApiStatus = response.status;
        mpResponseRequestId = response.headers.get('x-request-id') || '';
        const parsedMp = await safeParseExternalJsonResponse(response);

        if (response.ok && parsedMp.valid && parsedMp.data) {
          mpResponse = parsedMp.data;
          isLiveResponse = true;
        } else {
          liveApiCauses = Array.isArray(parsedMp.data?.cause) ? parsedMp.data.cause : undefined;
          liveApiErrorMessage =
            parsedMp.data?.message ||
            parsedMp.data?.error ||
            parsedMp.reason ||
            `HTTP ${response.status} ${response.statusText || ''}`.trim();

          console.error('[Mercado Pago Production API Rejection]', {
            timestamp: new Date().toISOString(),
            endpoint: MERCADOPAGO_PAYMENTS_PRODUCTION_URL,
            httpStatus: response.status,
            httpStatusText: response.statusText,
            mpRequestId: mpResponseRequestId || undefined,
            idempotencyKey,
            tokenMode,
            tokenMask: `${accessToken.slice(0, 12)}...${accessToken.slice(-4)}`,
            publicKeyConfigured: Boolean(publicKey),
            requestPayloadSummary: {
              transaction_amount: payloadMercadoPago.transaction_amount,
              payment_method_id: payloadMercadoPago.payment_method_id,
              description: payloadMercadoPago.description,
              date_of_expiration: payloadMercadoPago.date_of_expiration,
              external_reference: payloadMercadoPago.external_reference,
              notification_url: payloadMercadoPago.notification_url || null,
              payer: {
                email: maskEmailForLog(resolvedEmail),
                first_name: firstName,
                last_name: lastName,
                hasCpf: Boolean(validCpf),
              },
              metadata: payloadMercadoPago.metadata,
            },
            mpErrorMessage: liveApiErrorMessage,
            mpErrorCode: parsedMp.data?.error || undefined,
            mpCauses: liveApiCauses || null,
            mpRawResponse: parsedMp.rawText,
          });
        }
      } catch (fetchErr: any) {
        liveApiStatus = 502;
        liveApiErrorMessage = fetchErr?.message || 'network_error';
        console.error('[Mercado Pago Production Fetch Exception]', {
          timestamp: new Date().toISOString(),
          endpoint: MERCADOPAGO_PAYMENTS_PRODUCTION_URL,
          idempotencyKey,
          tokenMode,
          errorName: fetchErr?.name || 'Error',
          errorMessage: liveApiErrorMessage,
          stack: fetchErr?.stack,
        });
      }
    }

    const nowIso = new Date().toISOString();

    if (isLiveConfigured && !isLiveResponse) {
      return res.status(liveApiStatus >= 400 && liveApiStatus < 600 ? liveApiStatus : 502).json({
        success: false,
        provider: 'mercadopago',
        error: `Rejeição da API de produção do Mercado Pago: ${liveApiErrorMessage || 'resposta inválida'}.`,
        mpStatus: liveApiStatus || 502,
        mpRequestId: mpResponseRequestId || undefined,
        mpCauses: liveApiCauses,
        tokenMode,
        idempotencyKey,
        publicKeyConfigured: Boolean(publicKey),
        accessTokenConfigured: true,
      });
    }

    if (isLiveResponse && mpResponse) {
      const chargeId = String(mpResponse.id || `mp_${Date.now()}`);
      const isMpLiveMode = mpResponse.live_mode !== false;
      const txData = mpResponse.point_of_interaction?.transaction_data || {};
      // Preservar qr_code verbatim sem truncamento (apenas removendo quebras de linha acidentais)
      const qrCodeText =
        typeof txData.qr_code === 'string' ? txData.qr_code.replace(/[\r\n]+/g, '') : '';
      const cleanRawBase64 = normalizeCleanBase64(txData.qr_code_base64);
      const ticketUrl = typeof txData.ticket_url === 'string' ? txData.ticket_url : null;

      if (!isMpLiveMode) {
        console.error('[Mercado Pago Sandbox/Test Response Blocked]', {
          timestamp: new Date().toISOString(),
          endpoint: MERCADOPAGO_PAYMENTS_PRODUCTION_URL,
          paymentId: chargeId,
          live_mode: mpResponse.live_mode,
          status: mpResponse.status,
          status_detail: mpResponse.status_detail,
          mpRequestId: mpResponseRequestId || undefined,
          idempotencyKey,
          tokenMode,
          qrCodePreview: qrCodeText.slice(0, 60),
          message:
            'Mercado Pago retornou live_mode=false (homologação/teste), o que provoca erro [QR104DES] nos bancos.',
        });
        return res.status(422).json({
          success: false,
          provider: 'mercadopago',
          id: chargeId,
          liveMode: false,
          error:
            'O Mercado Pago gerou um Pix em modo de teste/homologação (live_mode=false), que causa o erro [QR104DES]. Verifique se MERCADOPAGO_ACCESS_TOKEN é de Produção (APP_USR-...) e se as credenciais de produção estão ativadas na conta.',
          mpRequestId: mpResponseRequestId || undefined,
          tokenMode,
          idempotencyKey,
          publicKeyConfigured: Boolean(publicKey),
          accessTokenConfigured: true,
        });
      }

      if (!qrCodeText) {
        console.error('[Mercado Pago Missing QR Code Payload]', {
          timestamp: new Date().toISOString(),
          endpoint: MERCADOPAGO_PAYMENTS_PRODUCTION_URL,
          paymentId: chargeId,
          status: mpResponse.status,
          status_detail: mpResponse.status_detail,
          point_of_interaction: mpResponse.point_of_interaction || null,
          mpRequestId: mpResponseRequestId || undefined,
          idempotencyKey,
        });
        return res.status(502).json({
          success: false,
          provider: 'mercadopago',
          id: chargeId,
          error:
            'Mercado Pago respondeu sem point_of_interaction.transaction_data.qr_code válido.',
          mpRequestId: mpResponseRequestId || undefined,
          idempotencyKey,
          publicKeyConfigured: Boolean(publicKey),
          accessTokenConfigured: true,
        });
      }

      const qrCodeBase64 = await ensureQrCodeDataUrl(qrCodeText, cleanRawBase64);
      const expiresAt = mpResponse.date_of_expiration || expirationDateIso;

      const record: PixChargeRecord = {
        id: chargeId,
        userId: resolvedUserId || undefined,
        type: type === 'match_booking' ? 'match_booking' : 'wallet_deposit',
        amount: paymentAmount,
        status: mpResponse.status === 'approved' ? 'completed' : 'pending',
        provider: 'mercadopago',
        qrCodeText,
        qrCodeBase64,
        ticketUrl,
        matchId,
        description: resolvedDescription,
        slotsCount: resolvedSlotsCount,
        goalkeeperIds: normalizedGoalkeeperIds,
        supabaseCredited: false,
        createdAt: nowIso,
        expiresAt,
      };
      pixChargesStore.set(chargeId, record);

      return res.status(200).json({
        success: true,
        provider: 'mercadopago',
        liveMode: true,
        tokenMode,
        id: chargeId,
        status: mpResponse.status || 'pending',
        amount: paymentAmount,
        slotsCount: resolvedSlotsCount,
        houseFee,
        goalkeeperNet,
        qrCodeText,
        qrCodeBase64,
        ticketUrl,
        point_of_interaction: {
          transaction_data: {
            qr_code: qrCodeText,
            qr_code_base64: cleanRawBase64,
            ticket_url: ticketUrl,
          },
        },
        payer: {
          email: resolvedEmail,
          first_name: firstName,
          last_name: lastName,
          hasCpf: Boolean(validCpf),
        },
        expiresAt,
        idempotencyKey,
        publicKeyConfigured: Boolean(publicKey),
        accessTokenConfigured: true,
      });
    }

    // Modo homologação local (apenas quando MERCADOPAGO_ACCESS_TOKEN não está configurado)
    const chargeId = `mp_pix_${Date.now()}_${idempotencyKey.slice(0, 6)}`;
    const sandboxPixKey =
      process.env.MERCADOPAGO_SANDBOX_PIX_KEY ||
      process.env.PAREDAOGK_PIX_KEY ||
      '15981596443';
    const pixCode = buildEmvPixPayload({
      pixKey: sandboxPixKey,
      merchantName: 'PAREDAOGK ESPORTES',
      merchantCity: 'ITAPEVA SP',
      amount: paymentAmount,
      txId: `PGK${idempotencyKey.replace(/-/g, '').slice(0, 18)}`,
    });
    const qrCodeBase64 = await ensureQrCodeDataUrl(pixCode, null);
    const cleanSandboxRawBase64 = normalizeCleanBase64(qrCodeBase64);

    const sandboxRecord: PixChargeRecord = {
      id: chargeId,
      userId: resolvedUserId || undefined,
      type: type === 'match_booking' ? 'match_booking' : 'wallet_deposit',
      amount: paymentAmount,
      status: 'pending',
      provider: 'mercadopago-sandbox',
      qrCodeText: pixCode,
      qrCodeBase64,
      ticketUrl: null,
      matchId,
      description: resolvedDescription,
      slotsCount: resolvedSlotsCount,
      goalkeeperIds: normalizedGoalkeeperIds,
      supabaseCredited: false,
      createdAt: nowIso,
      expiresAt: expirationDateIso,
    };
    pixChargesStore.set(chargeId, sandboxRecord);

    return res.status(200).json({
      success: true,
      provider: 'mercadopago-sandbox',
      id: chargeId,
      status: 'pending',
      amount: paymentAmount,
      slotsCount: resolvedSlotsCount,
      houseFee,
      goalkeeperNet,
      qrCodeText: pixCode,
      qrCodeBase64,
      ticketUrl: null,
      point_of_interaction: {
        transaction_data: {
          qr_code: pixCode,
          qr_code_base64: cleanSandboxRawBase64,
          ticket_url: null,
        },
      },
      payer: {
        email: resolvedEmail,
        first_name: firstName,
        last_name: lastName,
        hasCpf: Boolean(validCpf),
      },
      expiresAt: expirationDateIso,
      idempotencyKey,
      publicKeyConfigured: Boolean(publicKey),
      accessTokenConfigured: false,
      note: 'Pix EMV gerado em modo homologação local (configure MERCADOPAGO_ACCESS_TOKEN e VITE_MERCADOPAGO_PUBLIC_KEY para produção).',
    });
  } catch (error: any) {
    console.error('[Mercado Pago Gerar Pix Server Error]', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno ao processar pagamento Pix Mercado Pago.',
    });
  }
}

app.post('/api/gerar-pix-mercadopago', handleGerarPixMercadoPago);

/**
 * 1b. Consulta de status em tempo real de uma cobrança Pix Mercado Pago
 * Consulta também GET /v1/payments/:id no Mercado Pago caso seja pagamento live pendente.
 */
app.get('/api/mercadopago/payment-status/:paymentId', async (req: Request, res: Response) => {
  const { paymentId } = req.params;
  let charge = pixChargesStore.get(paymentId);

  const { accessToken, isLiveConfigured } = getMercadoPagoCredentials();
  if (isLiveConfigured && /^\d+$/.test(paymentId) && (!charge || charge.status === 'pending')) {
    try {
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'ParedaoGK-App/3.0',
        },
      });
      const parsed = await safeParseExternalJsonResponse(mpRes);
      if (mpRes.ok && parsed.valid && parsed.data && parsed.data.status === 'approved') {
        await processApprovedWebhookPayload({
          parsedPayload: {
            event: 'payment.confirmed',
            data: parsed.data,
          },
          signatureHeader: 'mercadopago_polling_verified',
          hmacValid: true,
          source: 'live',
        });
        charge = pixChargesStore.get(paymentId);
      }
    } catch {
      // Manter estado local se polling remoto falhar
    }
  }

  if (!charge) {
    return res.status(404).json({
      success: false,
      error: 'Cobrança Pix Mercado Pago não encontrada.',
    });
  }

  return res.status(200).json({
    success: true,
    charge,
  });
});

/**
 * 1c. Endpoint de Homologação: Simula um webhook oficial Mercado Pago payment.confirmed
 */
app.post('/api/mercadopago/simulate-webhook', async (req: Request, res: Response) => {
  try {
    const { paymentId, amount, userId, goalkeeperId, payerEmail, matchId, type, houseFee, description } = req.body || {};
    const resolvedPaymentId = String(paymentId || `mp_sim_${Date.now()}`);
    const existingCharge = pixChargesStore.get(resolvedPaymentId);
    const resolvedAmount = Number(amount || existingCharge?.amount || 25);
    const resolvedType =
      type === 'match_booking' || existingCharge?.type === 'match_booking' || Boolean(goalkeeperId)
        ? 'match_booking'
        : 'wallet_deposit';

    if (!resolvedAmount || isNaN(resolvedAmount) || resolvedAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valor inválido para simulação de confirmação Pix.',
      });
    }

    const nowIso = new Date().toISOString();
    const receiptCode = `MP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const webhookPayload = {
      id: `evt_mp_sim_${Date.now().toString().slice(-6)}`,
      event: 'payment.confirmed',
      action: 'payment.updated',
      type: 'payment',
      created_at: nowIso,
      provider: 'mercadopago',
      data: {
        id: resolvedPaymentId,
        transaction_amount: resolvedAmount,
        amount_brl: resolvedAmount,
        ...(houseFee !== undefined ? { house_fee_brl: Number(houseFee) } : {}),
        currency_id: 'BRL',
        status: 'approved',
        pix_receipt: receiptCode,
        ...(payerEmail ? { payer: { email: String(payerEmail).trim().toLowerCase() } } : {}),
        metadata: {
          platform: 'ParedaoGK',
          type: resolvedType,
          user_id: userId || existingCharge?.userId || undefined,
          goalkeeper_id: goalkeeperId || undefined,
          match_id: matchId || existingCharge?.matchId || undefined,
          payer_email: payerEmail ? String(payerEmail).trim().toLowerCase() : undefined,
          description: description || 'Recarga Carteira Digital ParedãoGK (Mercado Pago)',
          simulation: true,
        },
      },
    };

    const rawBody = JSON.stringify(webhookPayload);
    const signature = crypto
      .createHmac('sha256', runtimeWebhookConfig.signingSecret)
      .update(rawBody)
      .digest('hex');

    const result = await processApprovedWebhookPayload({
      parsedPayload: webhookPayload,
      signatureHeader: signature,
      hmacValid: true,
      source: 'test_dispatch',
    });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[Mercado Pago Simulate Webhook Error]', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Erro ao simular webhook de confirmação Mercado Pago.',
    });
  }
});

/**
 * 2. Rota de API: POST /api/webhook-mercadopago
 * Recebe notificações de pagamento Pix do Mercado Pago (Webhooks v1/v2 e IPN),
 * valida assinatura/payload quando presente, consulta /v1/payments/:id e responde
 * com status 200 OK e { success: true }.
 */
async function handleWebhookMercadoPago(req: Request, res: Response) {
  const receivedAt = new Date().toISOString();
  try {
    const rawBodyBuffer = req.body;
    const rawBody = Buffer.isBuffer(rawBodyBuffer)
      ? rawBodyBuffer.toString('utf8')
      : typeof rawBodyBuffer === 'string'
      ? rawBodyBuffer
      : JSON.stringify(rawBodyBuffer || {});

    const signature =
      (req.headers['x-signature'] as string) ||
      (req.headers['x-mercadopago-signature'] as string) ||
      '';
    const requestIdHeader = (req.headers['x-request-id'] as string) || '';

    let parsedPayload: Record<string, any> = {};
    if (
      rawBodyBuffer &&
      !Buffer.isBuffer(rawBodyBuffer) &&
      typeof rawBodyBuffer === 'object'
    ) {
      parsedPayload = rawBodyBuffer as Record<string, any>;
    } else {
      try {
        parsedPayload = JSON.parse(rawBody || '{}');
      } catch {
        parsedPayload = { raw: rawBody };
      }
    }

    const queryDataId = (req.query['data.id'] || req.query['id'] || '') as string;
    const notificationPaymentId = String(
      parsedPayload?.data?.id || queryDataId || parsedPayload?.id || ''
    ).trim();
    const notificationType = String(
      parsedPayload?.type || req.query['topic'] || parsedPayload?.event || ''
    ).toLowerCase();
    const eventName = String(
      parsedPayload?.event || parsedPayload?.action || notificationType || 'payment.updated'
    );

    if (!runtimeWebhookConfig.isActive) {
      const responseBody = {
        success: false,
        received: false,
        error: 'Webhook endpoint pausado administrativamente.',
      };
      pushWebhookLog({
        id: `whlog-${Date.now()}`,
        event: eventName,
        endpointUrl: runtimeWebhookConfig.webhookUrl || '/api/webhook-mercadopago',
        httpStatus: 503,
        hmacValid: false,
        signatureHeader: signature || '(ausente)',
        payload: parsedPayload,
        responseBody,
        source: 'live',
        createdAt: receivedAt,
      });
      return res.status(503).json(responseBody);
    }

    // Se houver cabeçalho de assinatura HMAC (ou secret configurado para verificação estrita)
    let hmacValid = true;
    if (signature) {
      const check = verifyMercadoPagoHmac(
        rawBody,
        signature,
        runtimeWebhookConfig.signingSecret,
        {
          dataId: notificationPaymentId ? notificationPaymentId.toLowerCase() : '',
          requestId: requestIdHeader,
        }
      );
      hmacValid = check.valid;
      if (!hmacValid && !isPlaceholderSecret(process.env.MERCADOPAGO_WEBHOOK_SECRET)) {
        const responseBody = {
          success: false,
          error: 'Assinatura de webhook Mercado Pago inválida.',
        };
        pushWebhookLog({
          id: `whlog-${Date.now()}`,
          event: eventName,
          endpointUrl: runtimeWebhookConfig.webhookUrl || '/api/webhook-mercadopago',
          httpStatus: 401,
          hmacValid: false,
          signatureHeader: signature,
          payload: parsedPayload,
          responseBody,
          source: 'live',
          createdAt: receivedAt,
        });
        return res.status(401).json(responseBody);
      }
    }

    // Se for notificação padrão do Mercado Pago com data.id numérico, consultar /v1/payments/:id para confirmar status oficial
    let enrichedPayload = parsedPayload;
    const { accessToken, isLiveConfigured } = getMercadoPagoCredentials();
    if (
      isLiveConfigured &&
      notificationPaymentId &&
      /^\d+$/.test(notificationPaymentId) &&
      (notificationType === 'payment' || eventName.includes('payment') || !notificationType)
    ) {
      try {
        const mpRes = await fetch(
          `https://api.mercadopago.com/v1/payments/${encodeURIComponent(notificationPaymentId)}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'User-Agent': 'ParedaoGK-App/3.0',
            },
          }
        );
        const parsedMpPayment = await safeParseExternalJsonResponse(mpRes);
        if (mpRes.ok && parsedMpPayment.valid && parsedMpPayment.data) {
          enrichedPayload = {
            ...parsedPayload,
            event:
              parsedMpPayment.data.status === 'approved'
                ? 'payment.confirmed'
                : eventName,
            data: {
              ...(parsedPayload?.data || {}),
              ...parsedMpPayment.data,
              id: String(parsedMpPayment.data.id || notificationPaymentId),
              amount_brl: Number(parsedMpPayment.data.transaction_amount || 0),
            },
          };
        }
      } catch (mpLookupErr: any) {
        console.warn('[Mercado Pago Webhook Lookup Warning]', mpLookupErr?.message);
      }
    }

    const responseBody = await processApprovedWebhookPayload({
      parsedPayload: enrichedPayload,
      signatureHeader: signature || 'mercadopago_webhook_event',
      hmacValid,
      source: 'live',
    });

    console.log(`[Mercado Pago Webhook] Evento processado: ${responseBody.event}`, {
      paymentId: responseBody.paymentId,
      paymentType: responseBody.paymentType,
      grossAmount: responseBody.grossAmount,
      houseFee: responseBody.houseFee,
      netAmount: responseBody.netAmount,
      userId: responseBody.userId,
      resolvedTargetUserId: responseBody.resolvedTargetUserId,
      creditedColumn: responseBody.creditedColumn,
      newWalletBalance: responseBody.newWalletBalance,
      newCustodyBalance: responseBody.newCustodyBalance,
      supabaseCredited: responseBody.supabaseCredited,
      creditReason: responseBody.creditReason,
    });

    return res.status(200).json(responseBody);
  } catch (err: any) {
    console.error('[Mercado Pago Webhook Handler Error]', err);
    return res.status(500).json({
      success: false,
      error: 'Erro interno ao processar o webhook Mercado Pago.',
    });
  }
}

app.post(WEBHOOK_MERCADOPAGO_PATHS, handleWebhookMercadoPago);

// Suporte a verificação GET/OPTIONS do endpoint pelo painel do Mercado Pago
app.get(WEBHOOK_MERCADOPAGO_PATHS, (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    active: runtimeWebhookConfig.isActive,
    endpoint: '/api/webhook-mercadopago',
  });
});

app.options(WEBHOOK_MERCADOPAGO_PATHS, (_req: Request, res: Response) => {
  return res.status(200).json({ success: true });
});

/**
 * 2b. Rotas Administrativas Webhooks Mercado Pago (Configuração, Logs e Disparo HMAC-SHA256)
 */
app.get('/api/admin/mercadopago-webhooks', (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    config: {
      ...runtimeWebhookConfig,
      signingSecretMasked: `${runtimeWebhookConfig.signingSecret.slice(0, 10)}••••••••${runtimeWebhookConfig.signingSecret.slice(-4)}`,
    },
    logs: webhookEventLogs,
  });
});

app.post('/api/admin/mercadopago-webhooks/config', (req: Request, res: Response) => {
  try {
    const { webhookUrl, signingSecret, isActive, subscribedEvents, updatedBy } = req.body || {};

    if (typeof webhookUrl === 'string' && webhookUrl.trim()) {
      runtimeWebhookConfig.webhookUrl = webhookUrl.trim();
    }
    if (typeof signingSecret === 'string' && signingSecret.trim().length >= 12) {
      runtimeWebhookConfig.signingSecret = signingSecret.trim();
    }
    if (typeof isActive === 'boolean') {
      runtimeWebhookConfig.isActive = isActive;
    }
    if (Array.isArray(subscribedEvents)) {
      runtimeWebhookConfig.subscribedEvents = subscribedEvents;
    }
    runtimeWebhookConfig.updatedAt = new Date().toISOString();
    runtimeWebhookConfig.updatedBy = updatedBy || 'admin';

    return res.status(200).json({
      success: true,
      config: runtimeWebhookConfig,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Erro ao salvar configuração de webhook Mercado Pago.',
    });
  }
});

app.post('/api/admin/mercadopago-webhooks/test', (req: Request, res: Response) => {
  try {
    const {
      event = 'payment.confirmed',
      webhookUrl,
      simulateInvalidSignature = false,
      customAmount = 25,
    } = req.body || {};

    const nowIso = new Date().toISOString();
    const numericAmount = Number(customAmount || 25);
    const houseFee = 5;
    const netAmount = Math.max(0, numericAmount - houseFee);

    const payload: Record<string, any> = {
      id: `evt_mp_${Date.now().toString().slice(-6)}`,
      event,
      created_at: nowIso,
      provider: 'mercadopago',
      data: {
        id: `mp_${Date.now().toString().slice(-8)}`,
        transaction_amount: numericAmount,
        amount_brl: numericAmount,
        house_fee_brl: houseFee,
        goalkeeper_net_brl: netAmount,
        currency_id: 'BRL',
        status:
          event === 'payment.confirmed'
            ? 'approved'
            : event === 'custody.released'
            ? 'released'
            : event === 'withdrawal.processed'
            ? 'withdrawal_completed'
            : 'withdrawal_rejected',
        pix_receipt: `MP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        metadata: {
          platform: 'ParedaoGK',
          city: 'Itapeva - SP',
          match_id: `mtch-test-${Date.now().toString().slice(-4)}`,
        },
      },
    };

    const rawBody = JSON.stringify(payload);
    const realSignature = crypto
      .createHmac('sha256', runtimeWebhookConfig.signingSecret)
      .update(rawBody)
      .digest('hex');

    const sentSignature = simulateInvalidSignature
      ? `invalid_hmac_${realSignature.slice(13)}`
      : realSignature;

    const { valid } = verifyMercadoPagoHmac(
      rawBody,
      sentSignature,
      runtimeWebhookConfig.signingSecret
    );

    const httpStatus = !runtimeWebhookConfig.isActive ? 503 : valid ? 200 : 401;
    const responseBody = !runtimeWebhookConfig.isActive
      ? { received: false, error: 'Webhook pausado na configuração admin.' }
      : valid
      ? {
          received: true,
          authenticated: true,
          algorithm: 'HMAC-SHA256',
          event,
          processedAt: nowIso,
        }
      : {
          received: false,
          authenticated: false,
          error: 'Assinatura Mercado Pago inválida (rejeitado por timingSafeEqual).',
        };

    const logEntry: RuntimeWebhookLog = {
      id: `whlog-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      event,
      endpointUrl: webhookUrl || runtimeWebhookConfig.webhookUrl || '/api/webhook-mercadopago',
      httpStatus,
      hmacValid: valid && runtimeWebhookConfig.isActive,
      signatureHeader: sentSignature,
      payload,
      responseBody,
      source: 'test_dispatch',
      createdAt: nowIso,
    };

    pushWebhookLog(logEntry);

    return res.status(200).json({
      success: true,
      log: logEntry,
      hmacValid: logEntry.hmacValid,
      httpStatus,
      signatureHeader: sentSignature,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Erro ao testar disparo de webhook HMAC-SHA256.',
    });
  }
});

/**
 * 3. Rota de API: /api/auth/send-welcome-email
 * Envio e registro de e-mail de boas-vindas na autenticação de usuários
 */
app.post('/api/auth/send-welcome-email', (req: Request, res: Response) => {
  try {
    const { email, name, role, nickname } = req.body || {};

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'E-mail do destinatário não informado.'
      });
    }

    const userName = name || 'Atleta';
    const userRoleText = role === 'goleiro' ? 'Goleiro GK' : 'Contratante / Organizador';
    const emailSubject = `⚽ Bem-vindo ao ParedãoGK, ${nickname || userName.split(' ')[0]}!`;

    console.log(`[ParedãoGK Server Auth] E-mail de boas-vindas emitido para: ${email} (${userName} - ${userRoleText})`);

    return res.status(200).json({
      success: true,
      message: 'E-mail de boas-vindas processado e enfileirado com sucesso.',
      recipient: email,
      subject: emailSubject,
      role,
      sentAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[ParedãoGK Server Auth Email Error]', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Erro ao processar e-mail de boas-vindas.'
    });
  }
});

/**
 * 4. Rota de API: /api/sugerir-cache-ia
 * Assistente inteligente para sugestão de cachê ideal de goleiro com base em
 * modalidade, nível técnico, distância em km e urgência da convocação.
 */
app.post('/api/sugerir-cache-ia', async (req: Request, res: Response) => {
  try {
    const {
      modality = 'Society',
      technicalLevel = 'Intermediário',
      distanceKm = 5,
      urgency = 'normal',
      rating = 4.85,
      matchesPlayed = 10,
      arenaName = '',
      city = 'Itapeva - SP',
      baseline,
    } = req.body || {};

    const snapToOfficialTier = (val: number): 20 | 25 | 30 => {
      if (val <= 22) return 20;
      if (val <= 27) return 25;
      return 30;
    };

    const safeBaseline = baseline || {
      suggestedPrice: 25,
      minPrice: 20,
      maxPrice: 30,
      rationale: `Modelo regional Itapeva (SP): para ${modality} (${technicalLevel}) a ${distanceKm}km, a Faixa 2 sugere R$ 25,00 (R$ 20,00 para o goleiro + R$ 5,00 taxa da casa).`,
      tips: [
        'Faixas oficiais de Itapeva: Faixa 1 R$ 20 (<4.8★) · Faixa 2 R$ 25 (4.8-4.9★) · Faixa 3 R$ 30 (>4.9★).',
        'A taxa fixa da plataforma é de R$ 5,00 em qualquer faixa, garantindo custódia Mercado Pago.',
      ],
      source: 'smart-engine',
    };

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const isGeminiAvailable = Boolean(
      geminiApiKey &&
      geminiApiKey.trim().length > 10 &&
      !geminiApiKey.includes('MY_GEMINI_API_KEY')
    );

    if (!isGeminiAvailable) {
      return res.status(200).json({
        success: true,
        suggestion: {
          ...safeBaseline,
          source: 'smart-engine',
        },
      });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const urgencyDesc =
        urgency === 'sos_urgent'
          ? 'Urgência máxima / Substituição SOS (< 2 horas)'
          : urgency === 'same_day'
          ? 'Mesmo dia (< 6 horas)'
          : 'Agendamento normal antecipado';

      const prompt = `Você é o consultor oficial de precificação regional de Itapeva (SP) do ParedãoGK (${city}).
O sistema opera EXCLUSIVAMENTE com 3 faixas fixas de cachê total (sempre com taxa fixa da casa de R$ 5,00):
- Faixa 1 (Iniciante | Nota média < 4.8): R$ 20,00 total (R$ 15,00 goleiro + R$ 5,00 casa)
- Faixa 2 (Intermediário | Nota média entre 4.8 e 4.9): R$ 25,00 total (R$ 20,00 goleiro + R$ 5,00 casa)
- Faixa 3 (Elite / Avançado | Nota média acima de 4.9): R$ 30,00 total (R$ 25,00 goleiro + R$ 5,00 casa)

Parâmetros da partida/atleta:
- Modalidade: ${modality}
- Nível Técnico: ${technicalLevel}
- Nota média: ${rating}★ | Partidas disputadas: ${matchesPlayed}
- Distância até a Arena: ${distanceKm} km ${arenaName ? `(${arenaName})` : ''}
- Urgência: ${urgencyDesc}
- Referência calculada: R$ ${safeBaseline.suggestedPrice},00.

Retorne um JSON objetivo em português do Brasil com:
- suggestedPrice: obrigatoriamente 20, 25 ou 30
- minPrice: 20
- maxPrice: 30
- rationale: 1 frase curta explicando a faixa escolhida, o repasse líquido ao goleiro e a taxa fixa de R$ 5,00 da casa
- tips: array com exatamente 2 dicas práticas e curtas (até 110 caracteres cada).`;

      const aiResponse = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          temperature: 0.25,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedPrice: { type: Type.NUMBER },
              minPrice: { type: Type.NUMBER },
              maxPrice: { type: Type.NUMBER },
              rationale: { type: Type.STRING },
              tips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['suggestedPrice', 'minPrice', 'maxPrice', 'rationale', 'tips'],
          },
        },
      });

      const rawText = aiResponse.text;
      if (rawText) {
        const parsed = JSON.parse(rawText);
        const suggested = snapToOfficialTier(Number(parsed.suggestedPrice || safeBaseline.suggestedPrice));

        return res.status(200).json({
          success: true,
          suggestion: {
            suggestedPrice: suggested,
            minPrice: 20,
            maxPrice: 30,
            rationale: parsed.rationale || safeBaseline.rationale,
            tips: Array.isArray(parsed.tips) && parsed.tips.length > 0 ? parsed.tips.slice(0, 2) : safeBaseline.tips,
            source: 'gemini-ai',
          },
        });
      }
    } catch (geminiErr: any) {
      console.warn('[ParedãoGK Gemini Pricing Fallback]', geminiErr?.message || geminiErr);
    }

    return res.status(200).json({
      success: true,
      suggestion: {
        ...safeBaseline,
        source: 'smart-engine',
      },
    });
  } catch (error: any) {
    console.error('[Sugerir Cache IA Error]', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Erro ao calcular sugestão de cachê.',
    });
  }
});

/**
 * 5. Rota de API: /api/feedback-pos-partida-ia
 * Gera resumo analítico, parecer técnico, pontos fortes estruturados e nota consolidada (1-5★)
 * via Gemini API com fallback determinístico local para modo offline.
 */
app.post('/api/feedback-pos-partida-ia', async (req: Request, res: Response) => {
  try {
    const {
      arenaName = 'Arena ParedãoGK',
      modality = 'Society',
      competitiveLevel = 'Competitivo',
      goalkeeperName = 'Goleiro GK',
      organizerName = 'Capitão Organizador',
      authorRole = 'contratante',
      goalsConceded = 1,
      hardSavesCount = 5,
      penaltiesSaved = 0,
      punctualityOnTime = true,
      distributionQuality = 'boa',
      aerialExitQuality = 'segura',
      matchObservations = '',
      baseline,
    } = req.body || {};

    const allowedTags = [
      '🧤 Fechou o Gol',
      '⚽ Pegou Pênalti',
      '⏱️ Pontualidade 100%',
      '🚀 Reposição Rápida',
      '🗣️ Comando de Zaga',
      '🔥 Reflexo Puro',
      '🛡️ Saída Aérea Firme',
      '🤝 Fair Play Exemplar',
    ];

    const safeBaseline = baseline || {
      consolidatedRating: 4,
      analyticalSummary: `Análise de atuação na ${arenaName} (${modality}) com ${hardSavesCount} defesas difíceis.`,
      technicalOpinion: `${goalkeeperName} teve atuação consistente em quadra, com boa resposta nas finalizações e saída segura.`,
      strengths: [
        {
          criterion: 'Defesas Difíceis',
          score: 4.5,
          highlight: `${hardSavesCount} defesas decisivas ao longo da partida.`,
        },
        {
          criterion: 'Saída de Gol',
          score: 4.3,
          highlight: `Leitura ${aerialExitQuality} nas bolas cruzadas e coberturas.`,
        },
        {
          criterion: 'Reposição de Bola',
          score: 4.2,
          highlight: `Distribuição ${distributionQuality} com as mãos e os pés.`,
        },
      ],
      improvementPoint: 'Manter a comunicação contínua com a linha defensiva nas bolas paradas.',
      suggestedTags: ['🧤 Fechou o Gol', '⏱️ Pontualidade 100%'],
      suggestedCleanSheet: Number(goalsConceded) === 0,
      suggestedPenaltiesSaved: Number(penaltiesSaved) || 0,
      suggestedIsMvp: Number(goalsConceded) === 0 || Number(penaltiesSaved) > 0,
      source: 'offline-engine',
      generatedAt: new Date().toISOString(),
    };

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const isGeminiAvailable = Boolean(
      geminiApiKey &&
        geminiApiKey.trim().length > 10 &&
        !geminiApiKey.includes('MY_GEMINI_API_KEY')
    );

    if (!isGeminiAvailable) {
      return res.status(200).json({
        success: true,
        feedback: {
          ...safeBaseline,
          source: 'offline-engine',
          generatedAt: new Date().toISOString(),
        },
      });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const perspective =
        authorRole === 'goleiro'
          ? `o próprio goleiro (${goalkeeperName}) realizando sua autoavaliação tática pós-jogo`
          : `o organizador (${organizerName}) avaliando a atuação do goleiro ${goalkeeperName}`;

      const prompt = `Você é o Analista Tático Oficial de Goleiros do ParedãoGK.
Gere um Feedback Pós-Partida AI objetivo, técnico e em português do Brasil para ${perspective}.

Dados da partida:
- Arena: ${arenaName}
- Modalidade: ${modality} (${competitiveLevel})
- Goleiro: ${goalkeeperName}
- Gols sofridos: ${goalsConceded}
- Defesas difíceis registradas: ${hardSavesCount}
- Pênaltis defendidos: ${penaltiesSaved}
- Pontualidade: ${punctualityOnTime ? 'Chegou no horário / adiantado' : 'Chegou com atraso'}
- Qualidade da reposição de bola: ${distributionQuality}
- Saída de gol / bola aérea: ${aerialExitQuality}
- Observações do usuário: ${matchObservations?.trim() || 'Nenhuma observação adicional informada.'}

Regras do JSON:
1. consolidatedRating: número inteiro de 1 a 5 (nota final consolidada em estrelas).
2. analyticalSummary: 1 a 2 frases curtas com o resumo analítico da partida (tom esportivo profissional).
3. technicalOpinion: parecer técnico completo e natural (entre 140 e 280 caracteres), pronto para preencher o campo de comentário da avaliação pós-jogo.
4. strengths: array com 3 a 4 critérios avaliados obrigatoriamente estruturando os pontos fortes (incluindo Defesas Difíceis, Saída de Gol e Reposição de Bola), cada um com criterion (string), score (número entre 1.0 e 5.0) e highlight (1 frase curta).
5. improvementPoint: 1 recomendação objetiva e construtiva para o próximo jogo.
6. suggestedTags: escolha de 2 a 5 tags EXATAMENTE dentre esta lista permitida: ${allowedTags.join(', ')}.`;

      const aiResponse = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              consolidatedRating: { type: Type.INTEGER },
              analyticalSummary: { type: Type.STRING },
              technicalOpinion: { type: Type.STRING },
              strengths: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    criterion: { type: Type.STRING },
                    score: { type: Type.NUMBER },
                    highlight: { type: Type.STRING },
                  },
                  required: ['criterion', 'score', 'highlight'],
                },
              },
              improvementPoint: { type: Type.STRING },
              suggestedTags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'consolidatedRating',
              'analyticalSummary',
              'technicalOpinion',
              'strengths',
              'improvementPoint',
              'suggestedTags',
            ],
          },
        },
      });

      const rawText = aiResponse.text;
      if (rawText) {
        const parsed = JSON.parse(rawText);
        const clampedRating = Math.max(
          1,
          Math.min(5, Math.round(Number(parsed.consolidatedRating || safeBaseline.consolidatedRating)))
        );

        const sanitizedStrengths =
          Array.isArray(parsed.strengths) && parsed.strengths.length > 0
            ? parsed.strengths.slice(0, 4).map((s: any) => ({
                criterion: String(s.criterion || 'Critério Técnico'),
                score: Number(Math.max(1, Math.min(5, Number(s.score || 4.5))).toFixed(1)),
                highlight: String(s.highlight || ''),
              }))
            : safeBaseline.strengths;

        const validTags = Array.isArray(parsed.suggestedTags)
          ? parsed.suggestedTags.filter((t: string) => allowedTags.includes(t))
          : [];

        return res.status(200).json({
          success: true,
          feedback: {
            consolidatedRating: clampedRating,
            analyticalSummary: String(parsed.analyticalSummary || safeBaseline.analyticalSummary),
            technicalOpinion: String(parsed.technicalOpinion || safeBaseline.technicalOpinion),
            strengths: sanitizedStrengths,
            improvementPoint: String(parsed.improvementPoint || safeBaseline.improvementPoint),
            suggestedTags:
              validTags.length > 0 ? validTags.slice(0, 5) : safeBaseline.suggestedTags,
            suggestedCleanSheet: Number(goalsConceded) === 0,
            suggestedPenaltiesSaved: Math.max(0, Number(penaltiesSaved) || 0),
            suggestedIsMvp:
              clampedRating === 5 || Number(penaltiesSaved) > 0 || (Number(goalsConceded) === 0 && Number(hardSavesCount) >= 4),
            source: 'gemini-ai',
            generatedAt: new Date().toISOString(),
          },
        });
      }
    } catch (geminiErr: any) {
      console.warn('[ParedãoGK Post-Match Feedback Gemini Fallback]', geminiErr?.message || geminiErr);
    }

    return res.status(200).json({
      success: true,
      feedback: {
        ...safeBaseline,
        source: 'offline-engine',
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[Feedback Pos Partida IA Error]', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Erro ao gerar feedback pós-partida.',
    });
  }
});

/**
 * 4. Rota de API: POST /api/convocacao/notificar-goleiros
 * Filtra atletas cadastrados como goleiros (role = 'goalkeeper' ou 'goleiro') num raio de até 30 km,
 * registra alertas na tabela 'notifications' do Supabase e dispara mensagens WhatsApp via Evolution API.
 */
app.post('/api/convocacao/notificar-goleiros', async (req: Request, res: Response) => {
  try {
    const {
      matchId,
      arenaName = 'Araxá Futebol Society',
      address = 'Itapeva - SP',
      city = 'Itapeva - SP',
      date = 'Hoje',
      time = '20:00 - 21:00',
      durationMinutes = 60,
      modality = 'Society',
      gameLevel = 'Médio',
      price = 25,
      slotsCount = 1,
      radiusKm = 30,
      organizerName = 'Contratante ParedãoGK',
      selectionMode = 'random',
      selectedGoalkeeperIds = [],
      eligibleGoalkeepers = [],
    } = req.body || {};

    const maxRadiusKm = Math.min(50, Math.max(1, Number(radiusKm || 30)));
    const resolvedSlotsCount = Math.min(2, Math.max(1, Number(slotsCount || 1)));
    const totalPrice = Number(price || 25);
    const feeTotal = Math.min(totalPrice, HOUSE_FEE_BRL * resolvedSlotsCount);
    const netPerSlot = Number(Math.max(0, (totalPrice - feeTotal) / resolvedSlotsCount).toFixed(2));
    const evolutionConfig = getEvolutionApiConfig();

    const supabaseClient = getServerSupabaseAdminClient(false);
    let eligibleTargets: Array<{
      id: string;
      name: string;
      phone?: string;
      city?: string;
      neighborhood?: string;
      distanceKm: number;
    }> = [];

    if (supabaseClient) {
      const { data: profilesData, error: profilesErr } = await supabaseClient
        .from('profiles')
        .select('*')
        .in('role', ['goleiro', 'goalkeeper'])
        .limit(60);

      if (!profilesErr && Array.isArray(profilesData) && profilesData.length > 0) {
        eligibleTargets = profilesData
          .map((p: any) => ({
            id: String(p.id),
            name: String(p.name || p.nickname || 'Goleiro GK'),
            phone: p.phone ? String(p.phone) : undefined,
            city: p.city ? String(p.city) : 'Itapeva - SP',
            neighborhood: p.neighborhood ? String(p.neighborhood) : 'Centro',
            distanceKm: computeServerProfileDistanceKm(p, city, address),
          }))
          .filter((gk) => gk.distanceKm <= maxRadiusKm)
          .sort((a, b) => a.distanceKm - b.distanceKm);
      }
    }

    if (eligibleTargets.length === 0 && Array.isArray(eligibleGoalkeepers) && eligibleGoalkeepers.length > 0) {
      eligibleTargets = eligibleGoalkeepers
        .map((gk: any) => ({
          id: String(gk.id),
          name: String(gk.name || 'Goleiro GK'),
          phone: gk.phone ? String(gk.phone) : undefined,
          city: gk.city || 'Itapeva - SP',
          neighborhood: gk.neighborhood || 'Centro',
          distanceKm: Number(gk.distanceKm ?? 2.5),
        }))
        .filter((gk) => gk.distanceKm <= maxRadiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm);
    }

    const explicitTargetIds = Array.isArray(selectedGoalkeeperIds)
      ? selectedGoalkeeperIds.map((id: any) => String(id || '').trim()).filter(Boolean)
      : [];

    const finalTargets =
      selectionMode === 'specific' && explicitTargetIds.length > 0
        ? eligibleTargets.filter((gk) => explicitTargetIds.includes(gk.id))
        : eligibleTargets;

    const effectiveTargets = finalTargets.length > 0 ? finalTargets : eligibleTargets;
    const nowIso = new Date().toISOString();

    let panelNotifiedCount = 0;
    let whatsappSentCount = 0;
    const dispatchDetails: Array<{
      id: string;
      name: string;
      distanceKm: number;
      panelNotified: boolean;
      whatsappSent: boolean;
      whatsappReason?: string;
    }> = [];

    for (let idx = 0; idx < effectiveTargets.length; idx++) {
      const target = effectiveTargets[idx];
      let panelNotified = false;

      if (supabaseClient && isValidUuid(target.id)) {
        const notifRes = await resilientSupabaseUpsert(
          supabaseClient,
          'notifications',
          {
            id: `notif-conv-${Date.now()}-${idx}`,
            user_id: target.id,
            category: 'radar',
            title:
              selectionMode === 'specific'
                ? `🧤 Convocação Direta: ${arenaName}`
                : `⚽ Bora Jogar! Vaga a ${target.distanceKm} km`,
            description: `${organizerName} abriu ${resolvedSlotsCount} vaga(s) de ${modality} (${durationMinutes} min · Nível ${gameLevel}) em ${arenaName} (${date} · ${time}). Líquido GK: R$ ${netPerSlot.toFixed(2)} (Taxa Casa R$ ${HOUSE_FEE_BRL.toFixed(2)}).`,
            read: false,
            created_at: nowIso,
          },
          'id'
        );
        panelNotified = !notifRes.error;
        if (panelNotified) panelNotifiedCount += 1;
      }

      const whatsappText = [
        `🧤 *ParedãoGK · Nova Convocação (${target.distanceKm} km de distância)*`,
        `📍 Local: *${arenaName}* (${address})`,
        `🗓 Data/Horário: *${date}* · *${time}* (${durationMinutes} min)`,
        `⚽ Modalidade: *${modality}* | Nível: *${gameLevel}*`,
        `💰 Cachê Líquido GK: *R$ ${netPerSlot.toFixed(2)}* (Taxa Casa R$ 5,00 separada)`,
        `👉 Abra o app ParedãoGK para aceitar agora!`,
      ].join('\n');

      const waRes = target.phone
        ? await sendEvolutionWhatsappText({ phone: target.phone, text: whatsappText })
        : { sent: false, reason: 'missing_phone' };

      if (waRes.sent) whatsappSentCount += 1;

      dispatchDetails.push({
        id: target.id,
        name: target.name,
        distanceKm: target.distanceKm,
        panelNotified,
        whatsappSent: waRes.sent,
        whatsappReason: waRes.reason,
      });
    }

    return res.status(200).json({
      success: true,
      matchId: matchId || `mtch-${Date.now()}`,
      radiusKm: maxRadiusKm,
      eligibleCount: effectiveTargets.length,
      panelNotifiedCount,
      whatsappSentCount,
      evolutionConfigured: evolutionConfig.configured,
      evolutionInstance: evolutionConfig.configured ? evolutionConfig.instanceName : null,
      dispatches: dispatchDetails,
    });
  } catch (err: any) {
    console.error('[Convocacao Notificar Goleiros Error]', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Erro ao notificar goleiros no raio de 30 km.',
    });
  }
});

const radarMatchesMemory = new Map<string, Record<string, any>>();

/**
 * 4.5 Rota de API: POST /api/convocacao/publicar-radar
 * Publica a partida gratuitamente no radar de 30 km (status: 'searching', payment_status: 'pending')
 * sem bloquear ou cobrar o contratante antecipadamente.
 */
app.post('/api/convocacao/publicar-radar', async (req: Request, res: Response) => {
  try {
    const { match, organizerUserId } = req.body || {};
    if (!match || !match.arenaName) {
      return res.status(400).json({
        success: false,
        error: 'Dados da partida obrigatórios para publicar no radar.',
      });
    }

    const slotsCount = Math.min(
      2,
      Math.max(1, Number(match.goalkeeperSlotsCount || match.slots?.length || 1))
    );
    const totalAmount = Number(match.price || 25);
    const totalHouseFee = Math.min(totalAmount, HOUSE_FEE_BRL * slotsCount);
    const totalNetCustody = Number(Math.max(0, totalAmount - totalHouseFee).toFixed(2));
    const nowIso = new Date().toISOString();
    const cleanMatchKey = String(match.id || `mtch-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '');

    radarMatchesMemory.set(cleanMatchKey, {
      ...match,
      id: cleanMatchKey,
      price: totalAmount,
      houseFee: totalHouseFee,
      goalkeeperPayout: totalNetCustody,
      goalkeeperSlotsCount: slotsCount,
      status: 'searching',
      paymentStatus: 'pending',
      operationalStatus: match.operationalStatus || 'awaiting_acceptance',
      candidates: Array.isArray(match.candidates) ? match.candidates : [],
      createdAt: match.createdAt || nowIso,
    });

    const supabaseClient = getServerSupabaseAdminClient(false);
    let matchPersisted = false;

    if (supabaseClient) {
      const matchRow: Record<string, any> = {
        id: cleanMatchKey,
        organizer_id: isValidUuid(match.organizerId)
          ? match.organizerId
          : isValidUuid(organizerUserId)
          ? organizerUserId
          : null,
        organizer_name: match.organizerName || 'Contratante',
        goalkeeper_id: isValidUuid(match.goalkeeperId) ? match.goalkeeperId : null,
        goalkeeper_name: match.goalkeeperName || 'Aguardando Aceite / No Radar (30 km)',
        arena_name: match.arenaName,
        address: match.address || 'Itapeva - SP',
        city: match.city || 'Itapeva - SP',
        date: match.date || 'Hoje',
        time: match.time || '20:00 - 21:00',
        modality: match.modality || 'Society',
        competitive_level: match.gameLevel || match.competitiveLevel || 'Médio',
        price: totalAmount,
        house_fee: totalHouseFee,
        goalkeeper_payout: totalNetCustody,
        cashback_earned: Number((totalAmount * 0.1).toFixed(2)),
        status: 'searching',
        payment_provider: 'pending',
        payment_status: 'pending',
        notes: match.notes || '',
        created_at: match.createdAt || nowIso,
      };

      const matchRes = await resilientSupabaseUpsert(supabaseClient, 'matches', matchRow, 'id');
      matchPersisted = !matchRes.error;
    }

    return res.status(200).json({
      success: true,
      matchId: cleanMatchKey,
      status: 'searching',
      paymentStatus: 'pending',
      matchPersisted,
    });
  } catch (err: any) {
    console.error('[Publicar Radar Gratis Error]', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Erro ao publicar partida gratuitamente no radar.',
    });
  }
});

/**
 * 4.6 Rota de API: GET /api/convocacao/partidas-radar
 * Lista partidas abertas (status = 'searching') para exibição no Radar do Goleiro (30 km).
 */
app.get('/api/convocacao/partidas-radar', async (_req: Request, res: Response) => {
  try {
    const mergedMap = new Map<string, any>();

    for (const [id, m] of radarMatchesMemory.entries()) {
      if (m && (m.status === 'searching' || m.paymentStatus !== 'paid')) {
        mergedMap.set(id, m);
      }
    }

    const supabaseClient = getServerSupabaseAdminClient(false);
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('matches')
        .select('*')
        .eq('status', 'searching')
        .order('created_at', { ascending: false })
        .limit(40);

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const id = String(row.id);
          const existingMem = mergedMap.get(id);
          const slotsCount = row.goalkeeper_slots_count === 2 ? 2 : 1;
          const price = Number(row.price || 25);
          const houseFee = Number(row.house_fee ?? HOUSE_FEE_BRL * slotsCount);

          mergedMap.set(id, {
            id,
            organizerId: row.organizer_id || existingMem?.organizerId || '',
            organizerName: row.organizer_name || existingMem?.organizerName || 'Contratante',
            goalkeeperId: row.goalkeeper_id || existingMem?.goalkeeperId || undefined,
            goalkeeperName: row.goalkeeper_name || existingMem?.goalkeeperName || undefined,
            arenaName: row.arena_name || existingMem?.arenaName || 'Arena Itapeva',
            address: row.address || existingMem?.address || 'Itapeva - SP',
            city: row.city || existingMem?.city || 'Itapeva - SP',
            date: row.date || existingMem?.date || 'Hoje',
            time: row.time || existingMem?.time || '20:00 - 21:00',
            durationMinutes: row.duration_minutes ? Number(row.duration_minutes) : existingMem?.durationMinutes || 90,
            modality: row.modality || existingMem?.modality || 'Society',
            competitiveLevel: row.competitive_level || existingMem?.competitiveLevel || 'Médio',
            gameLevel: row.game_level || row.competitive_level || existingMem?.gameLevel || 'Médio',
            goalkeeperSlotsCount: slotsCount,
            price,
            houseFee,
            goalkeeperPayout: Number(row.goalkeeper_payout ?? Math.max(0, price - houseFee)),
            cashbackEarned: Number(row.cashback_earned ?? Number((price * 0.1).toFixed(2))),
            status: row.status || 'searching',
            paymentStatus: row.payment_status || 'pending',
            operationalStatus:
              existingMem?.operationalStatus ||
              ((existingMem?.candidates?.length || 0) > 0 ? 'awaiting_custody_payment' : 'awaiting_acceptance'),
            radiusKm: existingMem?.radiusKm || 30,
            candidates: existingMem?.candidates || [],
            slots: existingMem?.slots || undefined,
            notes: row.notes || existingMem?.notes || '',
            createdAt: row.created_at || existingMem?.createdAt || new Date().toISOString(),
          });
        }
      }
    }

    const list = Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    return res.status(200).json({
      success: true,
      count: list.length,
      matches: list,
    });
  } catch (err: any) {
    console.error('[Partidas Radar Error]', err);
    return res.status(500).json({
      success: false,
      matches: [],
      error: err?.message || 'Erro ao buscar partidas no radar.',
    });
  }
});

/**
 * 4.7 Rota de API: POST /api/convocacao/candidatar
 * Registra aceite / candidatura do goleiro em uma partida aberta no radar.
 */
app.post('/api/convocacao/candidatar', async (req: Request, res: Response) => {
  try {
    const { matchId, match, candidate } = req.body || {};
    const targetId = String(matchId || match?.id || '').trim();
    if (!targetId || !candidate?.id) {
      return res.status(400).json({
        success: false,
        error: 'matchId e dados do candidato são obrigatórios.',
      });
    }

    const nowIso = new Date().toISOString();
    const existing = radarMatchesMemory.get(targetId) || match || { id: targetId };
    const existingCandidates = Array.isArray(existing.candidates) ? existing.candidates : [];
    const normalizedCandidate = {
      id: String(candidate.id),
      name: String(candidate.name || 'Goleiro GK'),
      nickname: candidate.nickname ? String(candidate.nickname) : undefined,
      photo: candidate.photo ? String(candidate.photo) : undefined,
      rating: candidate.rating ? Number(candidate.rating) : 5.0,
      distanceKm: typeof candidate.distanceKm === 'number' ? candidate.distanceKm : undefined,
      phone: candidate.phone ? String(candidate.phone) : undefined,
      appliedAt: candidate.appliedAt || nowIso,
    };

    const updatedCandidates = [
      normalizedCandidate,
      ...existingCandidates.filter((c: any) => c.id !== normalizedCandidate.id),
    ];

    const updatedRecord = {
      ...existing,
      id: targetId,
      goalkeeperId: existing.goalkeeperId || normalizedCandidate.id,
      goalkeeperName:
        existing.goalkeeperName && !String(existing.goalkeeperName).includes('Aguardando')
          ? existing.goalkeeperName
          : normalizedCandidate.name,
      operationalStatus:
        existing.paymentStatus === 'paid' ? 'accepted' : 'awaiting_custody_payment',
      candidates: updatedCandidates,
    };

    radarMatchesMemory.set(targetId, updatedRecord);

    const supabaseClient = getServerSupabaseAdminClient(false);
    let synced = false;
    if (supabaseClient) {
      const updatePayload: Record<string, any> = {
        goalkeeper_name: updatedRecord.goalkeeperName,
      };
      if (isValidUuid(normalizedCandidate.id)) {
        updatePayload.goalkeeper_id = normalizedCandidate.id;
      }
      const { error } = await resilientSupabaseUpdate(
        supabaseClient,
        'matches',
        updatePayload,
        'id',
        targetId
      );
      synced = !error;

      if (isValidUuid(existing.organizerId)) {
        await resilientSupabaseUpsert(
          supabaseClient,
          'notifications',
          {
            id: `notif-cand-${Date.now()}`,
            user_id: existing.organizerId,
            category: 'match',
            title: `🧤 ${normalizedCandidate.name} aceitou sua convocação!`,
            description: `Partida em ${existing.arenaName || 'Arena'} (${existing.date || 'Hoje'} · ${existing.time || ''}). Selecione o goleiro para efetivar a custódia.`,
            read: false,
            created_at: nowIso,
          },
          'id'
        );
      }
    }

    return res.status(200).json({
      success: true,
      synced,
      match: updatedRecord,
    });
  } catch (err: any) {
    console.error('[Convocacao Candidatar Error]', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Erro ao registrar candidatura do goleiro.',
    });
  }
});

/**
 * 4.8 Rota de API: POST /api/perfil/ativar-goleiro-radar
 * Ativa o usuário já logado na base oficial de goleiros (profiles) sem exigir novo login.
 */
app.post('/api/perfil/ativar-goleiro-radar', async (req: Request, res: Response) => {
  try {
    const {
      userId,
      email,
      name,
      nickname,
      neighborhood,
      city,
      favoriteGloves,
      preferredCache,
      technicalLevel,
      height,
      dominantFoot,
      categories,
    } = req.body || {};

    if (!userId && !email) {
      return res.status(400).json({
        success: false,
        error: 'Usuário autenticado obrigatório para ativar perfil no radar.',
      });
    }

    const supabaseClient = getServerSupabaseAdminClient(false);
    let synced = false;

    if (supabaseClient) {
      const lookup = await resolveSupabaseProfileForCredit({
        supabaseClient,
        userId,
        payerEmail: email,
      });

      const resolvedId = lookup.resolvedUserId || (isValidUuid(userId) ? userId : null);
      const updatePayload: Record<string, any> = {
        role: 'goleiro',
        available_today: true,
        nickname: nickname || undefined,
        neighborhood: neighborhood || undefined,
        city: city || 'Itapeva - SP',
        favorite_gloves: favoriteGloves || undefined,
        preferred_cache: preferredCache ? Number(preferredCache) : 25,
        technical_level: technicalLevel || undefined,
        height: height || undefined,
        dominant_foot: dominantFoot || undefined,
        categories: Array.isArray(categories) && categories.length > 0 ? categories : undefined,
      };

      if (resolvedId) {
        const upRes = await resilientSupabaseUpdate(
          supabaseClient,
          'profiles',
          updatePayload,
          'id',
          resolvedId
        );
        synced = !upRes.error;
      } else if (isValidUuid(userId)) {
        const upsertRes = await resilientSupabaseUpsert(
          supabaseClient,
          'profiles',
          {
            id: userId,
            email: email || '',
            name: name || nickname || 'Goleiro GK',
            ...updatePayload,
            created_at: new Date().toISOString(),
          },
          'id'
        );
        synced = !upsertRes.error;
      }
    }

    return res.status(200).json({
      success: true,
      synced,
      role: 'goleiro',
      availableToday: true,
    });
  } catch (err: any) {
    console.error('[Ativar Goleiro Radar Error]', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Erro ao ativar perfil de goleiro no radar.',
    });
  }
});

/**
 * 5. Rota de API: POST /api/convocacao/confirmar-custodia
 * Persiste a partida no Supabase, aplica a retenção fixa da Taxa da Casa (R$ 5,00 por vaga)
 * e credita o líquido correspondente em custódia (pending_balance) + wallet_transactions.
 */
app.post('/api/convocacao/confirmar-custodia', async (req: Request, res: Response) => {
  try {
    const {
      match,
      payerUserId,
      payerEmail,
      paymentMethod = 'pix',
      paymentId,
    } = req.body || {};

    if (!match || !match.arenaName) {
      return res.status(400).json({
        success: false,
        error: 'Dados da partida obrigatórios para registrar custódia.',
      });
    }

    const slotsCount = Math.min(2, Math.max(1, Number(match.goalkeeperSlotsCount || match.slots?.length || 1)));
    const totalAmount = Number(match.price || 25);
    const totalHouseFee = Math.min(totalAmount, HOUSE_FEE_BRL * slotsCount);
    const totalNetCustody = Number(Math.max(0, totalAmount - totalHouseFee).toFixed(2));
    const netPerSlot = Number((totalNetCustody / slotsCount).toFixed(2));
    const nowIso = new Date().toISOString();
    const cleanMatchKey = String(match.id || `mtch-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '');

    const supabaseClient = getServerSupabaseAdminClient(false);
    let matchPersisted = false;
    let supabaseCredited = false;
    let slotsCredited = 0;

    if (supabaseClient) {
      const slotList: Array<{ goalkeeperId?: string; goalkeeperName?: string }> =
        Array.isArray(match.slots) && match.slots.length > 0
          ? match.slots.slice(0, slotsCount)
          : [
              {
                goalkeeperId: match.goalkeeperId,
                goalkeeperName: match.goalkeeperName,
              },
            ];

      const matchRow: Record<string, any> = {
        id: cleanMatchKey,
        organizer_id: isValidUuid(match.organizerId) ? match.organizerId : payerUserId || null,
        organizer_name: match.organizerName || 'Contratante',
        goalkeeper_id: isValidUuid(slotList[0]?.goalkeeperId) ? slotList[0]?.goalkeeperId : null,
        goalkeeper_name:
          slotList
            .map((s) => s.goalkeeperName)
            .filter(Boolean)
            .join(' & ') ||
          match.goalkeeperName ||
          'Aguardando Goleiro (Radar 30km)',
        arena_name: match.arenaName,
        address: match.address || 'Itapeva - SP',
        city: match.city || 'Itapeva - SP',
        date: match.date || 'Hoje',
        time: match.time || '20:00 - 21:00',
        modality: match.modality || 'Society',
        competitive_level: match.gameLevel || match.competitiveLevel || 'Médio',
        price: totalAmount,
        house_fee: totalHouseFee,
        goalkeeper_payout: totalNetCustody,
        cashback_earned: Number((totalAmount * 0.1).toFixed(2)),
        status: match.status || 'confirmed',
        payment_provider: paymentMethod === 'wallet' ? 'wallet' : 'mercadopago',
        payment_status: 'paid',
        notes: match.notes || '',
        created_at: match.createdAt || nowIso,
      };

      const matchRes = await resilientSupabaseUpsert(supabaseClient, 'matches', matchRow, 'id');
      matchPersisted = !matchRes.error;

      // Deduzir saldo da carteira do contratante caso tenha escolhido pagamento por saldo
      if (paymentMethod === 'wallet' && (payerUserId || payerEmail)) {
        const payerLookup = await resolveSupabaseProfileForCredit({
          supabaseClient,
          userId: payerUserId,
          payerEmail,
        });
        if (payerLookup.profile && payerLookup.resolvedUserId) {
          const { availableCol } = detectProfileBalanceColumns(payerLookup.profile);
          const currBal = Number(payerLookup.profile[availableCol] ?? 0);
          const nextBal = Number(Math.max(0, currBal - totalAmount).toFixed(2));
          await resilientSupabaseUpdate(
            supabaseClient,
            'profiles',
            { [availableCol]: nextBal },
            'id',
            payerLookup.resolvedUserId
          );

          await resilientSupabaseUpsert(
            supabaseClient,
            'wallet_transactions',
            {
              id: `tx-wpay-${cleanMatchKey}`,
              user_id: payerLookup.resolvedUserId,
              type: 'match_payment',
              amount: -totalAmount,
              gross_amount: totalAmount,
              house_fee: totalHouseFee,
              net_amount: totalNetCustody,
              description: `Pagamento Convocação ${slotsCount} vaga(s) · ${match.arenaName} (Taxa Casa R$ ${totalHouseFee.toFixed(2)})`,
              status: 'completed',
              provider: 'wallet',
              match_id: cleanMatchKey,
              arena_name: match.arenaName,
              created_at: nowIso,
            },
            'id'
          );
        }
      }

      // Creditar custódia líquida para cada vaga de goleiro e registrar Taxa da Casa (R$ 5,00/vaga)
      const perSlotGross = Number((totalAmount / slotList.length).toFixed(2));
      const perSlotFee = Number((totalHouseFee / slotList.length).toFixed(2));
      const basePaymentKey = String(paymentId || `cust_${cleanMatchKey}`).replace(/[^a-zA-Z0-9_-]/g, '');

      for (let idx = 0; idx < slotList.length; idx++) {
        const slot = slotList[idx];
        const creditRes = await creditSupabaseWalletFromWebhook({
          paymentId: `${basePaymentKey}_v${idx + 1}`,
          userId: payerUserId,
          goalkeeperId: slot.goalkeeperId,
          goalkeeperName: slot.goalkeeperName,
          payerEmail,
          paymentType: 'match_booking',
          event: 'payment.confirmed',
          grossAmountBrl: perSlotGross,
          houseFeeBrl: perSlotFee,
          netAmountBrl: netPerSlot,
          receiptCode: `CUST-${cleanMatchKey.slice(-4).toUpperCase()}-V${idx + 1}`,
          matchId: cleanMatchKey,
          arenaName: match.arenaName,
          description: `Custódia Vaga ${idx + 1}/${slotList.length} · ${match.arenaName}`,
        });
        if (creditRes.credited) {
          supabaseCredited = true;
          slotsCredited += 1;
        }
      }
    }

    radarMatchesMemory.delete(cleanMatchKey);

    return res.status(200).json({
      success: true,
      matchId: cleanMatchKey,
      slotsCount,
      totalAmount,
      totalHouseFee,
      totalNetCustody,
      netPerSlot,
      slotsCredited,
      matchPersisted,
      supabaseCredited,
    });
  } catch (err: any) {
    console.error('[Confirmar Custodia Error]', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Erro ao processar separação financeira de custódia e taxa da casa.',
    });
  }
});

// Garantir resposta JSON válida para rotas /api/* desconhecidas ou erros de middleware
app.all('/api/*', (_req: Request, res: Response) => {
  return res.status(404).json({
    success: false,
    error: 'Endpoint da API ParedãoGK não encontrado.',
  });
});

app.use((err: any, req: Request, res: Response, next: express.NextFunction) => {
  if (req.path.startsWith('/api/')) {
    return res.status(err?.status || 500).json({
      success: false,
      error: err?.message || 'Erro interno no processamento da requisição.',
    });
  }
  return next(err);
});

// Inicialização com Vite middlewares
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ParedãoGK Server] Rodando com suporte Mercado Pago Pix na porta ${PORT}`);
  });
}

if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer();
}

export default app;

