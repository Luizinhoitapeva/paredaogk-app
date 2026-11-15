import crypto from 'crypto';

/**
 * Endpoint Next.js App Router: /api/webhook-caju
 * Responsável por receber os webhooks do CajuPay e validar a assinatura HMAC-SHA256
 * Signing Secret: cwhsec_555f1354b2a2851360c50f9bccb3dc9a2d76d7aab72bd82d
 */
const DEFAULT_SIGNING_SECRET = 'cwhsec_555f1354b2a2851360c50f9bccb3dc9a2d76d7aab72bd82d';

export async function POST(request) {
  try {
    const rawBody = await request.text();

    // Obter cabeçalho de assinatura de segurança da CajuPay
    const signature =
      request.headers.get('x-cajupay-signature') ||
      request.headers.get('X-CajuPay-Signature') ||
      request.headers.get('x-signature');

    const signingSecret = process.env.CAJUPAY_WEBHOOK_SECRET || DEFAULT_SIGNING_SECRET;

    // Se o cabeçalho de assinatura estiver ausente
    if (!signature) {
      console.warn('[CajuPay Webhook] Cabeçalho X-CajuPay-Signature ausente.');
      return new Response(
        JSON.stringify({
          error: 'Assinatura X-CajuPay-Signature ausente.'
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validação matemática rigorosa da assinatura HMAC-SHA256
    const calculatedSignature = crypto
      .createHmac('sha256', signingSecret)
      .update(rawBody)
      .digest('hex');

    // Validação constante contra ataques de timing
    const signatureBuffer = Buffer.from(signature, 'utf8');
    const calculatedBuffer = Buffer.from(calculatedSignature, 'utf8');

    const isValidSignature =
      signatureBuffer.length === calculatedBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, calculatedBuffer);

    if (!isValidSignature) {
      console.error('[CajuPay Webhook Security Alert] Assinatura HMAC inválida recebida.');
      return new Response(
        JSON.stringify({
          error: 'Assinatura inválida. Acesso não autorizado.'
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Processamento do payload JSON validado com segurança
    const payload = JSON.parse(rawBody);
    const { event, data } = payload;

    console.log(`[CajuPay Webhook] Evento recebido com sucesso: ${event || data?.status}`, {
      paymentId: data?.id,
      amount: data?.amount,
      status: data?.status,
      matchId: data?.metadata?.match_id
    });

    // Mapeamento de status de pagamento aprovado
    const isApproved =
      event === 'payment.approved' ||
      event === 'payment.paid' ||
      event === 'charge.paid' ||
      data?.status === 'approved' ||
      data?.status === 'paid' ||
      data?.status === 'confirmed';

    return new Response(
      JSON.stringify({
        received: true,
        authenticated: true,
        status: isApproved ? 'payment_confirmed' : 'event_acknowledged',
        paymentId: data?.id,
        matchId: data?.metadata?.match_id,
        processedAt: new Date().toISOString()
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[CajuPay Webhook Error]', err);
    return new Response(
      JSON.stringify({
        error: 'Erro interno ao processar o webhook CajuPay.'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
