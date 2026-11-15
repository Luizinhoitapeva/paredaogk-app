import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: true, // Deixa o Vercel fazer o parse do JSON do Mercado Pago
  },
};

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(200).json({ success: true, message: 'Webhook Mercado Pago ativo' });
  }

  try {
    const body = req.body;
    console.log('Webhook MP Recebido:', JSON.stringify(body));

    // Extrai o ID do pagamento da notificação (suporta v1 e v2)
    const paymentId = body?.data?.id || body?.id;
    if (!paymentId) {
      return res.status(200).json({ received: true, warning: 'No payment id found' });
    }

    // Consulta os detalhes do pagamento diretamente na API oficial do Mercado Pago
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`
      }
    });

    if (!mpResponse.ok) {
      console.error('Erro ao buscar pagamento no MP:', await mpResponse.text());
      return res.status(200).json({ received: true, error: 'Failed to fetch payment from MP' });
    }

    const payment = await mpResponse.json();

    if (payment.status === 'approved') {
      const grossAmount = Number(payment.transaction_amount || 0);
      const externalRef = payment.external_reference || ''; // Ex: "wallet_UUID_timestamp" ou e-mail
      
      // Tenta extrair o userId do external_reference ou metadados
      let userId = payment.metadata?.user_id;
      if (!userId && externalRef.startsWith('wallet_')) {
        const parts = externalRef.split('_');
        if (parts.length > 1) userId = parts[1];
      }

      if (userId && grossAmount > 0) {
        const safePaymentId = String(paymentId);

        // 1. Grava no extrato (wallet_transactions) usando ID textual seguro
        await supabaseAdmin.from('wallet_transactions').insert({
          user_id: userId,
          amount: grossAmount,
          type: 'deposit',
          status: 'approved',
          payment_id: safePaymentId,
          description: `Recarga Pix Mercado Pago - Cód: MP-${safePaymentId}`
        });

        // 2. Atualiza o saldo do usuário na tabela profiles de forma segura
        // Busca o saldo atual primeiro para evitar conflitos de incremento
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('id, wallet_balance')
          .eq('id', userId)
          .single();

        const currentBalance = Number(profile?.wallet_balance || 0);
        const newBalance = currentBalance + grossAmount;

        await supabaseAdmin
          .from('profiles')
          .update({ wallet_balance: newBalance })
          .eq('id', userId);

        console.log(`Saldo creditado com sucesso! User: ${userId}, Novo Saldo: R$ ${newBalance}`);
      }
    }

    return res.status(200).json({ success: true, received: true });
  } catch (error: any) {
    console.error('Erro crítico no webhook do Mercado Pago:', error);
    return res.status(200).json({ success: true, error: error.message });
  }
}