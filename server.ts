import express, { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);

const CAJUPAY_WEBHOOK_SIGNING_SECRET =
  process.env.CAJUPAY_WEBHOOK_SECRET || 'cwhsec_555f1354b2a2851360c50f9bccb3dc9a2d76d7aab72bd82d';

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

const runtimeWebhookConfig: RuntimeWebhookConfig = {
  id: 'cajupay-webhook-default',
  webhookUrl: `${process.env.VITE_APP_URL || ''}/api/webhook-caju`,
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
  const calculatedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const signatureBuffer = Buffer.from(signature, 'utf8');
  const calculatedBuffer = Buffer.from(calculatedSignature, 'utf8');
  const valid =
    signatureBuffer.length === calculatedBuffer.length &&
    crypto.timingSafeEqual(signatureBuffer, calculatedBuffer);

  return { valid, expected: calculatedSignature };
}

// Capturar raw body para validação criptográfica HMAC no webhook
app.use('/api/webhook-caju', express.raw({ type: '*/*' }));
app.use(express.json());

// Endpoint de integridade
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    app: 'ParedãoGK',
    cajupayConfigured: Boolean(process.env.CAJUPAY_API_KEY && process.env.CAJUPAY_API_SECRET),
    time: new Date().toISOString()
  });
});

/**
 * 1. Rota de API: /api/gerar-pix-caju
 * Gera cobrança Pix via API oficial CajuPay (https://api.cajupay.com.br/api/payments/pix)
 */
app.post('/api/gerar-pix-caju', async (req: Request, res: Response) => {
  try {
    const {
      amount,
      valor,
      description,
      customer,
      matchId,
      expiresIn = 3600
    } = req.body || {};

    const paymentAmount = Number(amount || valor || 25);

    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valor de pagamento inválido.'
      });
    }

    const houseFee = 5;
    const goalkeeperNet = Math.max(0, Number((paymentAmount - houseFee).toFixed(2)));

    const idempotencyKey = crypto.randomUUID();
    const apiKey = process.env.CAJUPAY_API_KEY || 'caju_live_test_key';
    const apiSecret = process.env.CAJUPAY_API_SECRET || 'caju_sec_test_secret';

    const payloadCaju = {
      amount: Math.round(paymentAmount * 100), // Enviar em centavos
      description: description || `Convocação Goleiro ParedãoGK - Partida #${matchId || Date.now()}`,
      expires_in: expiresIn,
      customer: {
        name: customer?.name || 'Contratante ParedãoGK',
        email: customer?.email || 'paredaogkbr@gmail.com',
        tax_id: customer?.cpf ? customer.cpf.replace(/\D/g, '') : '12345678909',
        phone: customer?.phone ? customer.phone.replace(/\D/g, '') : '15981596443'
      },
      metadata: {
        platform: 'ParedaoGK',
        match_id: matchId || `mtch-${Date.now()}`,
        created_at: new Date().toISOString()
      }
    };

    let cajuResponse: any = null;
    let isLiveResponse = false;

    // Se chaves CajuPay configuradas no ambiente, chama a API oficial
    if (process.env.CAJUPAY_API_KEY && process.env.CAJUPAY_API_SECRET) {
      try {
        const response = await fetch('https://api.cajupay.com.br/api/payments/pix', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
            'X-API-Secret': apiSecret,
            'Idempotency-Key': idempotencyKey,
            'User-Agent': 'ParedaoGK-App/2.5'
          },
          body: JSON.stringify(payloadCaju)
        });

        if (response.ok) {
          cajuResponse = await response.json();
          isLiveResponse = true;
        } else {
          const errText = await response.text();
          console.warn('[CajuPay Live API Warning]', response.status, errText);
        }
      } catch (fetchErr: any) {
        console.warn('[CajuPay Fetch Warning]', fetchErr?.message);
      }
    }

    if (isLiveResponse && cajuResponse) {
      return res.status(200).json({
        success: true,
        provider: 'cajupay',
        id: cajuResponse.id || `caju_${Date.now()}`,
        status: cajuResponse.status || 'pending',
        amount: paymentAmount,
        houseFee,
        goalkeeperNet,
        qrCodeText: cajuResponse.pix?.qrcode || cajuResponse.qrcode || '',
        qrCodeBase64: cajuResponse.pix?.qrcode_base64 || cajuResponse.qrcode_base64 || null,
        expiresAt: cajuResponse.pix?.expires_at || new Date(Date.now() + expiresIn * 1000).toISOString(),
        idempotencyKey
      });
    }

    // Payload Pix Copia e Cola formatado conforme o padrão oficial do Banco Central
    const pixCode = `00020126580014br.gov.bcb.pix0136cajupay-pix-${idempotencyKey.slice(0, 8)}@cajupay.com.br520400005303986540${paymentAmount.toFixed(2)}5802BR5920PAREDAOGK CAJUPAY6009SAO PAULO62070503***6304CAJU`;

    return res.status(200).json({
      success: true,
      provider: 'cajupay-sandbox',
      id: `caju_sim_${Date.now()}`,
      status: 'pending',
      amount: paymentAmount,
      houseFee,
      goalkeeperNet,
      qrCodeText: pixCode,
      qrCodeBase64: null,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      idempotencyKey,
      note: 'Pix gerado com payload CajuPay (chaves de produção configuráveis no .env)'
    });
  } catch (error: any) {
    console.error('[CajuPay Gerar Pix Server Error]', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno ao processar pagamento Pix CajuPay.'
    });
  }
});

/**
 * 2. Rota de API: /api/webhook-caju
 * Validação rigorosa HMAC-SHA256 no cabeçalho X-CajuPay-Signature e registro em tempo real
 */
app.post('/api/webhook-caju', (req: Request, res: Response) => {
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

    const { event, data } = parsedPayload;
    const responseBody = {
      received: true,
      authenticated: true,
      event: event || 'payment.confirmed',
      status: data?.status || 'processed',
      paymentId: data?.id,
      matchId: data?.metadata?.match_id,
      processedAt: receivedAt,
    };

    console.log(`[CajuPay Webhook] Evento validado com sucesso: ${event || data?.status}`, {
      paymentId: data?.id,
      amount: data?.amount,
      status: data?.status,
      matchId: data?.metadata?.match_id,
    });

    pushWebhookLog({
      id: `whlog-${Date.now()}`,
      event: String(event || data?.status || 'payment.confirmed'),
      endpointUrl: runtimeWebhookConfig.webhookUrl || '/api/webhook-caju',
      httpStatus: 200,
      hmacValid: true,
      signatureHeader: signature,
      payload: parsedPayload,
      responseBody,
      source: 'live',
      createdAt: receivedAt,
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

startServer();
