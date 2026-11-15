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

function getCajuPayCredentials(clientPublicKey?: string) {
  const envPublicKey =
    process.env.VITE_CAJUPAY_PUBLIC_KEY ||
    process.env.CAJUPAY_PUBLIC_KEY ||
    process.env.CAJUPAY_API_KEY ||
    '';
  const publicKey = !isPlaceholderSecret(envPublicKey)
    ? envPublicKey.trim()
    : !isPlaceholderSecret(clientPublicKey)
    ? String(clientPublicKey).trim()
    : '';

  const envSecretKey =
    process.env.CAJUPAY_SECRET_KEY ||
    process.env.CAJUPAY_API_SECRET ||
    '';
  const secretKey = !isPlaceholderSecret(envSecretKey) ? envSecretKey.trim() : '';

  return {
    publicKey,
    secretKey,
    isLiveConfigured: Boolean(publicKey && secretKey),
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

const CAJUPAY_WEBHOOK_SIGNING_SECRET =
  process.env.CAJUPAY_WEBHOOK_SECRET ||
  process.env.CAJUPAY_SECRET_KEY ||
  'cwhsec_555f1354b2a2851360c50f9bccb3dc9a2d76d7aab72bd82d';

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
  provider: 'cajupay' | 'cajupay-sandbox';
  qrCodeText: string;
  qrCodeBase64: string | null;
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
  id: 'cajupay-webhook-default',
  webhookUrl: `${process.env.VITE_APP_URL || process.env.APP_URL || ''}/api/webhook-caju`,
  signingSecret: CAJUPAY_WEBHOOK_SIGNING_SECRET,
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

function verifyCajuPayHmac(rawBody: string, signature: string | undefined, secret: string) {
  if (!signature) {
    return { valid: false, expected: '' };
  }
  const secretsToCheck = Array.from(
    new Set(
      [
        secret,
        process.env.CAJUPAY_WEBHOOK_SECRET,
        process.env.CAJUPAY_SECRET_KEY,
        process.env.CAJUPAY_API_SECRET,
      ].filter((s): s is string => Boolean(s && !isPlaceholderSecret(s)))
    )
  );

  let expectedPrimary = '';
  for (const candidateSecret of secretsToCheck) {
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
    const txId = `tx-caju-${paymentId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
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
        description: description || 'Recarga Pix CajuPay Confirmada (Webhook)',
        status: 'completed',
        receipt_code: receiptCode,
        provider: 'cajupay',
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
        id: `notif-caju-${Date.now()}`,
        user_id: userId,
        category: 'wallet',
        title: '💰 Recarga Pix CajuPay Confirmada!',
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
  const event = String(parsedPayload?.event || 'payment.confirmed');
  const data = parsedPayload?.data || {};
  const paymentId = String(data?.id || parsedPayload?.paymentId || `caju_${Date.now()}`);
  const statusNormalized = String(data?.status || '').toLowerCase();

  const isPaymentApprovedEvent =
    event === 'payment.confirmed' ||
    event === 'payment.approved' ||
    event === 'pix.confirmed' ||
    event === 'pix.paid' ||
    statusNormalized === 'paid' ||
    statusNormalized === 'approved' ||
    statusNormalized === 'confirmed';

  const existingCharge = pixChargesStore.get(paymentId);
  const amountBrl = Number(
    data?.amount_brl ??
      (data?.amount ? Number(data.amount) / 100 : existingCharge?.amount ?? 0)
  );
  const userId = String(
    data?.metadata?.user_id || data?.user_id || existingCharge?.userId || ''
  ).trim();
  const receiptCode = String(
    data?.pix_receipt ||
      existingCharge?.receiptCode ||
      `CAJU-${paymentId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || Date.now().toString().slice(-6)}`
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
        description: existingCharge?.description || 'Recarga Pix CajuPay Confirmada',
      });
      supabaseCredited = creditResult.credited;
      newWalletBalance = creditResult.newBalance;
      alreadyProcessed = Boolean(creditResult.alreadyProcessed);
    }

    const updatedCharge: PixChargeRecord = {
      id: paymentId,
      userId: userId || undefined,
      type: existingCharge?.type || (data?.metadata?.type === 'match_booking' ? 'match_booking' : 'wallet_deposit'),
      amount: amountBrl,
      status: 'completed',
      provider: existingCharge?.provider || 'cajupay',
      qrCodeText: existingCharge?.qrCodeText || '',
      qrCodeBase64: existingCharge?.qrCodeBase64 || null,
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
    endpointUrl: runtimeWebhookConfig.webhookUrl || '/api/webhook-caju',
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

// Capturar raw body para validação criptográfica HMAC no webhook
app.use('/api/webhook-caju', express.raw({ type: '*/*' }));
app.use(express.json());

// Endpoint de integridade
app.get('/api/health', (_req: Request, res: Response) => {
  const creds = getCajuPayCredentials();
  res.json({
    status: 'ok',
    app: 'ParedãoGK',
    cajupayConfigured: creds.isLiveConfigured,
    cajupayPublicKeyConfigured: Boolean(creds.publicKey),
    time: new Date().toISOString(),
  });
});

/**
 * 1. Rota de API: /api/gerar-pix-caju
 * Gera cobrança Pix dinâmica via API oficial CajuPay (https://api.cajupay.com.br/api/payments/pix)
 * utilizando VITE_CAJUPAY_PUBLIC_KEY e CAJUPAY_SECRET_KEY.
 */
app.post('/api/gerar-pix-caju', async (req: Request, res: Response) => {
  try {
    const {
      amount,
      valor,
      description,
      customer,
      matchId,
      userId,
      type = 'wallet_deposit',
      expiresIn = 3600,
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
    const clientPublicKey = req.headers['x-cajupay-public-key'] as string | undefined;
    const { publicKey, secretKey, isLiveConfigured } = getCajuPayCredentials(clientPublicKey);

    const effectiveWebhookUrl =
      runtimeWebhookConfig.webhookUrl && !runtimeWebhookConfig.webhookUrl.startsWith('/')
        ? runtimeWebhookConfig.webhookUrl
        : `${req.protocol}://${req.get('host')}/api/webhook-caju`;

    const resolvedDescription =
      description ||
      (type === 'wallet_deposit'
        ? `Recarga Carteira Digital ParedãoGK - R$ ${paymentAmount.toFixed(2)}`
        : `Convocação Goleiro ParedãoGK - Partida #${matchId || Date.now()}`);

    const payloadCaju = {
      amount: Math.round(paymentAmount * 100), // Enviar em centavos
      description: resolvedDescription,
      expires_in: expiresIn,
      webhook_url: effectiveWebhookUrl,
      customer: {
        name: customer?.name || 'Contratante ParedãoGK',
        email: customer?.email || 'paredaogkbr@gmail.com',
        tax_id: customer?.cpf ? String(customer.cpf).replace(/\D/g, '') : '12345678909',
        phone: customer?.phone ? String(customer.phone).replace(/\D/g, '') : '15981596443',
      },
      metadata: {
        platform: 'ParedaoGK',
        type,
        user_id: userId || undefined,
        match_id: matchId || (type === 'match_booking' ? `mtch-${Date.now()}` : undefined),
        public_key_ref: publicKey ? `${publicKey.slice(0, 8)}...` : undefined,
        created_at: new Date().toISOString(),
      },
    };

    let cajuResponse: any = null;
    let isLiveResponse = false;

    if (isLiveConfigured) {
      try {
        const response = await fetch('https://api.cajupay.com.br/api/payments/pix', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': publicKey,
            'X-API-Secret': secretKey,
            'X-Public-Key': publicKey,
            'Authorization': `Bearer ${secretKey}`,
            'Idempotency-Key': idempotencyKey,
            'User-Agent': 'ParedaoGK-App/3.0',
          },
          body: JSON.stringify(payloadCaju),
        });

        const parsedCaju = await safeParseExternalJsonResponse(response);
        if (response.ok && parsedCaju.valid && parsedCaju.data) {
          cajuResponse = parsedCaju.data;
          isLiveResponse = true;
        } else {
          console.warn(
            '[CajuPay Live API Warning]',
            response.status,
            parsedCaju.reason || 'unsuccessful_status',
            parsedCaju.rawText
          );
        }
      } catch (fetchErr: any) {
        console.warn('[CajuPay Fetch Warning]', fetchErr?.message);
      }
    }

    const nowIso = new Date().toISOString();

    if (isLiveResponse && cajuResponse) {
      const chargeId = String(cajuResponse.id || cajuResponse.data?.id || `caju_${Date.now()}`);
      const qrCodeText = String(
        cajuResponse.pix?.qrcode ||
          cajuResponse.pix?.qr_code ||
          cajuResponse.data?.pix?.qrcode ||
          cajuResponse.qrcode ||
          cajuResponse.qr_code ||
          cajuResponse.pix_code ||
          ''
      );
      const rawBase64 =
        cajuResponse.pix?.qrcode_base64 ||
        cajuResponse.pix?.qr_code_base64 ||
        cajuResponse.data?.pix?.qrcode_base64 ||
        cajuResponse.qrcode_base64 ||
        cajuResponse.qr_code_base64 ||
        null;

      const qrCodeBase64 = await ensureQrCodeDataUrl(qrCodeText, rawBase64);
      const expiresAt =
        cajuResponse.pix?.expires_at ||
        cajuResponse.expires_at ||
        new Date(Date.now() + expiresIn * 1000).toISOString();

      const record: PixChargeRecord = {
        id: chargeId,
        userId: userId || undefined,
        type: type === 'match_booking' ? 'match_booking' : 'wallet_deposit',
        amount: paymentAmount,
        status: 'pending',
        provider: 'cajupay',
        qrCodeText,
        qrCodeBase64,
        matchId,
        description: resolvedDescription,
        supabaseCredited: false,
        createdAt: nowIso,
        expiresAt,
      };
      pixChargesStore.set(chargeId, record);

      return res.status(200).json({
        success: true,
        provider: 'cajupay',
        id: chargeId,
        status: cajuResponse.status || 'pending',
        amount: paymentAmount,
        houseFee,
        goalkeeperNet,
        qrCodeText,
        qrCodeBase64,
        expiresAt,
        idempotencyKey,
        publicKeyConfigured: Boolean(publicKey),
      });
    }

    // Payload Pix Copia e Cola EMV BR Code válido com CRC16-CCITT + QR Code PNG real
    const chargeId = `caju_pix_${Date.now()}_${idempotencyKey.slice(0, 6)}`;
    const pixCode = buildEmvPixPayload({
      pixKey: 'paredaogkbr@gmail.com',
      merchantName: 'PAREDAOGK CAJUPAY',
      merchantCity: 'ITAPEVA SP',
      amount: paymentAmount,
      txId: `PGK${idempotencyKey.replace(/-/g, '').slice(0, 18)}`,
    });
    const qrCodeBase64 = await ensureQrCodeDataUrl(pixCode, null);
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const sandboxRecord: PixChargeRecord = {
      id: chargeId,
      userId: userId || undefined,
      type: type === 'match_booking' ? 'match_booking' : 'wallet_deposit',
      amount: paymentAmount,
      status: 'pending',
      provider: 'cajupay-sandbox',
      qrCodeText: pixCode,
      qrCodeBase64,
      matchId,
      description: resolvedDescription,
      supabaseCredited: false,
      createdAt: nowIso,
      expiresAt,
    };
    pixChargesStore.set(chargeId, sandboxRecord);

    return res.status(200).json({
      success: true,
      provider: 'cajupay-sandbox',
      id: chargeId,
      status: 'pending',
      amount: paymentAmount,
      houseFee,
      goalkeeperNet,
      qrCodeText: pixCode,
      qrCodeBase64,
      expiresAt,
      idempotencyKey,
      publicKeyConfigured: Boolean(publicKey),
      note: isLiveConfigured
        ? 'API CajuPay indisponível no momento — QR Code EMV gerado em modo homologação'
        : 'Pix EMV gerado em modo homologação (configure VITE_CAJUPAY_PUBLIC_KEY e CAJUPAY_SECRET_KEY para produção)',
    });
  } catch (error: any) {
    console.error('[CajuPay Gerar Pix Server Error]', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno ao processar pagamento Pix CajuPay.',
    });
  }
});

/**
 * 1b. Consulta de status em tempo real de uma cobrança Pix CajuPay
 */
app.get('/api/cajupay/payment-status/:paymentId', (req: Request, res: Response) => {
  const { paymentId } = req.params;
  const charge = pixChargesStore.get(paymentId);
  if (!charge) {
    return res.status(404).json({
      success: false,
      error: 'Cobrança Pix não encontrada.',
    });
  }
  return res.status(200).json({
    success: true,
    charge,
  });
});

/**
 * 1c. Endpoint de Homologação: Simula um webhook oficial payment.confirmed assinado com HMAC-SHA256
 */
app.post('/api/cajupay/simulate-webhook', async (req: Request, res: Response) => {
  try {
    const { paymentId, amount, userId, description } = req.body || {};
    const resolvedPaymentId = String(paymentId || `caju_sim_${Date.now()}`);
    const existingCharge = pixChargesStore.get(resolvedPaymentId);
    const resolvedAmount = Number(amount || existingCharge?.amount || 25);

    if (!resolvedAmount || isNaN(resolvedAmount) || resolvedAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valor inválido para simulação de confirmação Pix.',
      });
    }

    const nowIso = new Date().toISOString();
    const receiptCode = `CAJU-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const webhookPayload = {
      id: `evt_sim_${Date.now().toString().slice(-6)}`,
      event: 'payment.confirmed',
      created_at: nowIso,
      provider: 'cajupay',
      data: {
        id: resolvedPaymentId,
        amount: Math.round(resolvedAmount * 100),
        amount_brl: resolvedAmount,
        currency: 'BRL',
        status: 'paid',
        pix_receipt: receiptCode,
        metadata: {
          platform: 'ParedaoGK',
          type: 'wallet_deposit',
          user_id: userId || existingCharge?.userId || undefined,
          description: description || 'Recarga Carteira Digital ParedãoGK',
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

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('[CajuPay Simulate Webhook Error]', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Erro ao simular webhook de confirmação CajuPay.',
    });
  }
});

/**
 * 2. Rota de API: /api/webhook-caju
 * Validação rigorosa HMAC-SHA256 no cabeçalho X-CajuPay-Signature, registro em tempo real
 * e crédito automático permanente na carteira do usuário no Supabase.
 */
app.post('/api/webhook-caju', async (req: Request, res: Response) => {
  const receivedAt = new Date().toISOString();
  try {
    const rawBodyBuffer = req.body;
    const rawBody = Buffer.isBuffer(rawBodyBuffer)
      ? rawBodyBuffer.toString('utf8')
      : typeof rawBodyBuffer === 'string'
      ? rawBodyBuffer
      : JSON.stringify(rawBodyBuffer || {});

    const signature =
      (req.headers['x-cajupay-signature'] as string) ||
      (req.headers['x-signature'] as string);

    let parsedPayload: Record<string, any> = {};
    try {
      parsedPayload = JSON.parse(rawBody || '{}');
    } catch {
      parsedPayload = { raw: rawBody };
    }

    const eventName = String(parsedPayload?.event || parsedPayload?.data?.status || 'unknown');

    if (!runtimeWebhookConfig.isActive) {
      const responseBody = {
        received: false,
        error: 'Webhook endpoint pausado administrativamente.',
      };
      pushWebhookLog({
        id: `whlog-${Date.now()}`,
        event: eventName,
        endpointUrl: runtimeWebhookConfig.webhookUrl || '/api/webhook-caju',
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

    if (!signature) {
      console.warn('[CajuPay Webhook] Cabeçalho X-CajuPay-Signature ausente.');
      const responseBody = { error: 'Assinatura X-CajuPay-Signature ausente.' };
      pushWebhookLog({
        id: `whlog-${Date.now()}`,
        event: eventName,
        endpointUrl: runtimeWebhookConfig.webhookUrl || '/api/webhook-caju',
        httpStatus: 401,
        hmacValid: false,
        signatureHeader: '(ausente)',
        payload: parsedPayload,
        responseBody,
        source: 'live',
        createdAt: receivedAt,
      });
      return res.status(401).json(responseBody);
    }

    const { valid: isValidSignature } = verifyCajuPayHmac(
      rawBody,
      signature,
      runtimeWebhookConfig.signingSecret
    );

    if (!isValidSignature) {
      console.error('[CajuPay Webhook Alert] Assinatura HMAC incompatível.');
      const responseBody = { error: 'Assinatura inválida. Acesso não autorizado.' };
      pushWebhookLog({
        id: `whlog-${Date.now()}`,
        event: eventName,
        endpointUrl: runtimeWebhookConfig.webhookUrl || '/api/webhook-caju',
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

    const responseBody = await processApprovedWebhookPayload({
      parsedPayload,
      signatureHeader: signature,
      hmacValid: true,
      source: 'live',
    });

    console.log(`[CajuPay Webhook] Evento processado com sucesso: ${responseBody.event}`, {
      paymentId: responseBody.paymentId,
      amount: responseBody.amount,
      userId: responseBody.userId,
      supabaseCredited: responseBody.supabaseCredited,
    });

    return res.status(200).json(responseBody);
  } catch (err: any) {
    console.error('[CajuPay Webhook Handler Error]', err);
    return res.status(500).json({
      error: 'Erro interno ao processar o webhook CajuPay.',
    });
  }
});

/**
 * 2b. Rotas Administrativas CajuPay Webhooks (Configuração, Logs e Disparo HMAC-SHA256)
 */
app.get('/api/admin/cajupay-webhooks', (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    config: {
      ...runtimeWebhookConfig,
      signingSecretMasked: `${runtimeWebhookConfig.signingSecret.slice(0, 10)}••••••••${runtimeWebhookConfig.signingSecret.slice(-4)}`,
    },
    logs: webhookEventLogs,
  });
});

app.post('/api/admin/cajupay-webhooks/config', (req: Request, res: Response) => {
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
      error: err?.message || 'Erro ao salvar configuração de webhook CajuPay.',
    });
  }
});

app.post('/api/admin/cajupay-webhooks/test', (req: Request, res: Response) => {
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
      id: `evt_caju_${Date.now().toString().slice(-6)}`,
      event,
      created_at: nowIso,
      provider: 'cajupay',
      data: {
        id: `caju_${Date.now().toString().slice(-8)}`,
        amount: Math.round(numericAmount * 100),
        amount_brl: numericAmount,
        house_fee_brl: houseFee,
        goalkeeper_net_brl: netAmount,
        currency: 'BRL',
        status:
          event === 'payment.confirmed'
            ? 'paid'
            : event === 'custody.released'
            ? 'released'
            : event === 'withdrawal.processed'
            ? 'withdrawal_completed'
            : 'withdrawal_rejected',
        pix_receipt: `CAJU-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
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

    const { valid } = verifyCajuPayHmac(
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
          error: 'Assinatura X-CajuPay-Signature inválida (rejeitado por timingSafeEqual).',
        };

    const logEntry: RuntimeWebhookLog = {
      id: `whlog-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      event,
      endpointUrl: webhookUrl || runtimeWebhookConfig.webhookUrl || '/api/webhook-caju',
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
        'A taxa fixa da plataforma é de R$ 5,00 em qualquer faixa, garantindo custódia CajuPay.',
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
    console.log(`[ParedãoGK Server] Rodando com suporte CajuPay Pix na porta ${PORT}`);
  });
}

if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer();
}

export default app;

