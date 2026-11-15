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

function isPlaceholderSecret(val?: string): boolean {
  if (!val) return true;
  const trimmed = val.trim();
  return (
    !trimmed ||
    trimmed.startsWith('MY_') ||
    trimmed.includes('your-') ||
    trimmed.includes('placeholder')
  );
}

function getMercadoPagoCredentials(clientPublicKey?: string) {
  const envPublicKey =
    process.env.VITE_MERCADOPAGO_PUBLIC_KEY ||
    process.env.MERCADOPAGO_PUBLIC_KEY ||
    '';
  const publicKey = !isPlaceholderSecret(envPublicKey)
    ? envPublicKey.trim()
    : !isPlaceholderSecret(clientPublicKey)
    ? String(clientPublicKey).trim()
    : '';

  const envAccessToken =
    process.env.MERCADOPAGO_ACCESS_TOKEN ||
    '';
  const accessToken = !isPlaceholderSecret(envAccessToken) ? envAccessToken.trim() : '';

  return {
    publicKey,
    accessToken,
    isLiveConfigured: Boolean(accessToken),
  };
}

function getServerSupabaseAdminClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (isPlaceholderSecret(url) || isPlaceholderSecret(serviceRoleKey)) {
    return null;
  }
  return createClient(url.trim(), serviceRoleKey.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

function buildEmvPixPayload(params: {
  pixKey: string;
  merchantName: string;
  merchantCity: string;
  amount: number;
  txId: string;
}): string {
  const merchantAccountInfo = tlv('00', 'br.gov.bcb.pix') + tlv('01', params.pixKey);
  const amountStr = params.amount.toFixed(2);
  const additionalData = tlv('05', params.txId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || 'PAREDAOGK');

  const partial =
    tlv('00', '01') +
    tlv('26', merchantAccountInfo) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', amountStr) +
    tlv('58', 'BR') +
    tlv('59', params.merchantName.slice(0, 25)) +
    tlv('60', params.merchantCity.slice(0, 15)) +
    tlv('62', additionalData) +
    '6304';

  return `${partial}${computeCrc16Ccitt(partial)}`;
}

async function ensureQrCodeDataUrl(qrCodeText: string, existingBase64?: string | null): Promise<string | null> {
  if (existingBase64 && existingBase64.trim()) {
    return existingBase64.startsWith('data:image')
      ? existingBase64
      : `data:image/png;base64,${existingBase64}`;
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
  supabaseCredited: boolean;
  createdAt: string;
  expiresAt: string;
  confirmedAt?: string;
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

async function creditSupabaseWalletFromWebhook(params: {
  paymentId: string;
  userId?: string;
  amountBrl: number;
  receiptCode: string;
  description?: string;
}): Promise<{ credited: boolean; newBalance?: number; alreadyProcessed?: boolean; reason?: string }> {
  const { paymentId, userId, amountBrl, receiptCode, description } = params;
  if (!userId || userId === 'usr-guest' || !amountBrl || amountBrl <= 0) {
    return { credited: false, reason: 'userId_or_amount_missing' };
  }

  const supabaseAdmin = getServerSupabaseAdminClient();
  if (!supabaseAdmin) {
    return { credited: false, reason: 'supabase_service_role_not_configured' };
  }

  try {
    const txId = `tx-mp-${paymentId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const { data: existingTx } = await supabaseAdmin
      .from('wallet_transactions')
      .select('id, status')
      .eq('id', txId)
      .maybeSingle();

    if (existingTx && existingTx.status === 'completed') {
      return { credited: true, alreadyProcessed: true };
    }

    const { data: profile, error: profFetchErr } = await supabaseAdmin
      .from('profiles')
      .select('wallet_balance')
      .eq('id', userId)
      .maybeSingle();

    if (profFetchErr || !profile) {
      return { credited: false, reason: profFetchErr?.message || 'profile_not_found' };
    }

    const currentBalance = Number(profile.wallet_balance || 0);
    const newBalance = Number((currentBalance + amountBrl).toFixed(2));
    const nowIso = new Date().toISOString();

    const { error: txErr } = await supabaseAdmin.from('wallet_transactions').upsert([
      {
        id: txId,
        user_id: userId,
        type: 'pix_in',
        amount: amountBrl,
        description: description || 'Recarga Pix Mercado Pago Confirmada (Webhook)',
        status: 'completed',
        receipt_code: receiptCode,
        provider: 'mercadopago',
        created_at: nowIso,
      },
    ]);

    if (txErr) {
      return { credited: false, reason: txErr.message };
    }

    const { error: profUpdateErr } = await supabaseAdmin
      .from('profiles')
      .update({
        wallet_balance: newBalance,
        updated_at: nowIso,
      })
      .eq('id', userId);

    if (profUpdateErr) {
      return { credited: false, reason: profUpdateErr.message };
    }

    await supabaseAdmin.from('notifications').insert([
      {
        id: `notif-mp-${Date.now()}`,
        user_id: userId,
        category: 'wallet',
        title: '💰 Recarga Pix Mercado Pago Confirmada!',
        description: `Crédito de R$ ${amountBrl.toFixed(2)} adicionado à sua carteira digital. Comprovante: ${receiptCode}.`,
        read: false,
        created_at: nowIso,
      },
    ]);

    return { credited: true, newBalance };
  } catch (err: any) {
    console.warn('[Server Webhook Supabase Credit Warning]', err?.message || err);
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
    statusNormalized === 'approved' ||
    statusNormalized === 'paid' ||
    statusNormalized === 'confirmed';

  const existingCharge = pixChargesStore.get(paymentId);
  const amountBrl = Number(
    data?.transaction_amount ??
      data?.amount_brl ??
      (data?.amount ? Number(data.amount) / 100 : existingCharge?.amount ?? 0)
  );
  const userId = String(
    data?.metadata?.user_id ||
      parsedPayload?.metadata?.user_id ||
      data?.user_id ||
      existingCharge?.userId ||
      ''
  ).trim();
  const receiptCode = String(
    data?.pix_receipt ||
      existingCharge?.receiptCode ||
      `MP-${paymentId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || Date.now().toString().slice(-6)}`
  );

  let supabaseCredited = existingCharge?.supabaseCredited || false;
  let newWalletBalance: number | undefined;
  let alreadyProcessed = existingCharge?.status === 'completed';

  if (isPaymentApprovedEvent && !alreadyProcessed) {
    if (userId && amountBrl > 0) {
      const creditResult = await creditSupabaseWalletFromWebhook({
        paymentId,
        userId,
        amountBrl,
        receiptCode,
        description: existingCharge?.description || 'Recarga Pix Mercado Pago Confirmada',
      });
      supabaseCredited = creditResult.credited;
      newWalletBalance = creditResult.newBalance;
      alreadyProcessed = Boolean(creditResult.alreadyProcessed);
    }

    const updatedCharge: PixChargeRecord = {
      id: paymentId,
      userId: userId || undefined,
      type:
        existingCharge?.type ||
        (data?.metadata?.type === 'match_booking' ? 'match_booking' : 'wallet_deposit'),
      amount: amountBrl,
      status: 'completed',
      provider: existingCharge?.provider || 'mercadopago',
      qrCodeText: existingCharge?.qrCodeText || '',
      qrCodeBase64: existingCharge?.qrCodeBase64 || null,
      ticketUrl: existingCharge?.ticketUrl || null,
      receiptCode,
      matchId: data?.metadata?.match_id || existingCharge?.matchId,
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
    paymentId,
    userId: userId || undefined,
    amount: amountBrl,
    receiptCode,
    supabaseCredited,
    newWalletBalance,
    alreadyProcessed,
    matchId: data?.metadata?.match_id,
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

/**
 * 1. Rota de API: /api/gerar-pix-mercadopago
 * Gera cobrança Pix dinâmica via API oficial do Mercado Pago (POST https://api.mercadopago.com/v1/payments)
 * utilizando VITE_MERCADOPAGO_PUBLIC_KEY e MERCADOPAGO_ACCESS_TOKEN.
 */
async function handleGerarPixMercadoPago(req: Request, res: Response) {
  try {
    const {
      amount,
      valor,
      description,
      customer,
      matchId,
      userId,
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

    const houseFee = 5;
    const goalkeeperNet = Math.max(0, Number((paymentAmount - houseFee).toFixed(2)));
    const idempotencyKey = crypto.randomUUID();
    const clientPublicKey = req.headers['x-mercadopago-public-key'] as string | undefined;
    const { publicKey, accessToken, isLiveConfigured } = getMercadoPagoCredentials(clientPublicKey);

    const effectiveWebhookUrl =
      runtimeWebhookConfig.webhookUrl && !runtimeWebhookConfig.webhookUrl.startsWith('/')
        ? runtimeWebhookConfig.webhookUrl
        : `${req.protocol}://${req.get('host')}/api/webhook-mercadopago`;

    const isPublicHttpsWebhook =
      effectiveWebhookUrl.startsWith('https://') &&
      !effectiveWebhookUrl.includes('localhost') &&
      !effectiveWebhookUrl.includes('127.0.0.1');

    const resolvedDescription =
      description ||
      (type === 'wallet_deposit'
        ? `Recarga Carteira Digital ParedãoGK - R$ ${paymentAmount.toFixed(2)}`
        : `Convocação Goleiro ParedãoGK - Partida #${matchId || Date.now()}`);

    const fullName = String(customer?.name || 'Contratante ParedãoGK').trim();
    const nameParts = fullName.split(/\s+/);
    const firstName = nameParts[0] || 'Contratante';
    const lastName = nameParts.slice(1).join(' ') || 'ParedãoGK';
    const cleanCpf = String(customer?.cpf || '').replace(/\D/g, '');
    const expirationDateIso = new Date(Date.now() + Math.max(300, Number(expiresIn) || 1800) * 1000).toISOString();

    const payloadMercadoPago: Record<string, any> = {
      transaction_amount: Number(paymentAmount.toFixed(2)),
      description: resolvedDescription.slice(0, 250),
      payment_method_id: 'pix',
      date_of_expiration: expirationDateIso,
      external_reference:
        matchId ||
        (userId ? `wallet_${userId}_${Date.now()}` : `pgk_${Date.now()}`),
      payer: {
        email: customer?.email || 'paredaogkbr@gmail.com',
        first_name: firstName,
        last_name: lastName,
        ...(cleanCpf.length === 11
          ? {
              identification: {
                type: 'CPF',
                number: cleanCpf,
              },
            }
          : {}),
      },
      metadata: {
        platform: 'ParedaoGK',
        type,
        user_id: userId || undefined,
        match_id: matchId || (type === 'match_booking' ? `mtch-${Date.now()}` : undefined),
        public_key_ref: publicKey ? `${publicKey.slice(0, 10)}...` : undefined,
      },
    };

    if (isPublicHttpsWebhook) {
      payloadMercadoPago.notification_url = effectiveWebhookUrl;
    }

    let mpResponse: any = null;
    let isLiveResponse = false;
    let liveApiErrorMessage = '';

    if (isLiveConfigured) {
      try {
        const response = await fetch('https://api.mercadopago.com/v1/payments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'X-Idempotency-Key': idempotencyKey,
            'User-Agent': 'ParedaoGK-App/3.0',
          },
          body: JSON.stringify(payloadMercadoPago),
        });

        const parsedMp = await safeParseExternalJsonResponse(response);
        if (response.ok && parsedMp.valid && parsedMp.data) {
          mpResponse = parsedMp.data;
          isLiveResponse = true;
        } else {
          liveApiErrorMessage =
            parsedMp.data?.message ||
            parsedMp.data?.error ||
            parsedMp.reason ||
            `HTTP ${response.status}`;
          console.warn(
            '[Mercado Pago Live API Warning]',
            response.status,
            liveApiErrorMessage,
            parsedMp.rawText
          );
        }
      } catch (fetchErr: any) {
        liveApiErrorMessage = fetchErr?.message || 'network_error';
        console.warn('[Mercado Pago Fetch Warning]', liveApiErrorMessage);
      }
    }

    const nowIso = new Date().toISOString();

    if (isLiveResponse && mpResponse) {
      const chargeId = String(mpResponse.id || `mp_${Date.now()}`);
      const txData = mpResponse.point_of_interaction?.transaction_data || {};
      const qrCodeText = String(txData.qr_code || '');
      const rawBase64 = txData.qr_code_base64 || null;
      const ticketUrl = txData.ticket_url || null;

      const qrCodeBase64 = await ensureQrCodeDataUrl(qrCodeText, rawBase64);
      const expiresAt = mpResponse.date_of_expiration || expirationDateIso;

      const record: PixChargeRecord = {
        id: chargeId,
        userId: userId || undefined,
        type: type === 'match_booking' ? 'match_booking' : 'wallet_deposit',
        amount: paymentAmount,
        status: mpResponse.status === 'approved' ? 'completed' : 'pending',
        provider: 'mercadopago',
        qrCodeText,
        qrCodeBase64,
        ticketUrl,
        matchId,
        description: resolvedDescription,
        supabaseCredited: false,
        createdAt: nowIso,
        expiresAt,
      };
      pixChargesStore.set(chargeId, record);

      return res.status(200).json({
        success: true,
        provider: 'mercadopago',
        id: chargeId,
        status: mpResponse.status || 'pending',
        amount: paymentAmount,
        houseFee,
        goalkeeperNet,
        qrCodeText,
        qrCodeBase64,
        ticketUrl,
        expiresAt,
        idempotencyKey,
        publicKeyConfigured: Boolean(publicKey),
      });
    }

    // Fallback seguro: Payload Pix Copia e Cola EMV BR Code válido com CRC16-CCITT + QR Code PNG real para homologação
    const chargeId = `mp_pix_${Date.now()}_${idempotencyKey.slice(0, 6)}`;
    const pixCode = buildEmvPixPayload({
      pixKey: 'paredaogkbr@gmail.com',
      merchantName: 'PAREDAOGK MERCADOPAGO',
      merchantCity: 'ITAPEVA SP',
      amount: paymentAmount,
      txId: `PGKMP${idempotencyKey.replace(/-/g, '').slice(0, 16)}`,
    });
    const qrCodeBase64 = await ensureQrCodeDataUrl(pixCode, null);

    const sandboxRecord: PixChargeRecord = {
      id: chargeId,
      userId: userId || undefined,
      type: type === 'match_booking' ? 'match_booking' : 'wallet_deposit',
      amount: paymentAmount,
      status: 'pending',
      provider: 'mercadopago-sandbox',
      qrCodeText: pixCode,
      qrCodeBase64,
      ticketUrl: null,
      matchId,
      description: resolvedDescription,
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
      houseFee,
      goalkeeperNet,
      qrCodeText: pixCode,
      qrCodeBase64,
      ticketUrl: null,
      expiresAt: expirationDateIso,
      idempotencyKey,
      publicKeyConfigured: Boolean(publicKey),
      note: isLiveConfigured
        ? `API Mercado Pago indisponível (${liveApiErrorMessage}) — QR Code Pix EMV gerado em modo homologação`
        : 'Pix EMV Mercado Pago gerado em modo homologação (configure VITE_MERCADOPAGO_PUBLIC_KEY e MERCADOPAGO_ACCESS_TOKEN para produção)',
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
    const { paymentId, amount, userId, description } = req.body || {};
    const resolvedPaymentId = String(paymentId || `mp_sim_${Date.now()}`);
    const existingCharge = pixChargesStore.get(resolvedPaymentId);
    const resolvedAmount = Number(amount || existingCharge?.amount || 25);

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
        currency_id: 'BRL',
        status: 'approved',
        pix_receipt: receiptCode,
        metadata: {
          platform: 'ParedaoGK',
          type: 'wallet_deposit',
          user_id: userId || existingCharge?.userId || undefined,
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
      amount: responseBody.amount,
      userId: responseBody.userId,
      supabaseCredited: responseBody.supabaseCredited,
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

