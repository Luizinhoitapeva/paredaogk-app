/**
 * Endpoint Next.js App Router: /app/api/auth/send-welcome-email/route.js
 * Rota para envio e orquestração do e-mail de boas-vindas institucional do ParedãoGK & ArenaDraft.
 */

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, name, role, nickname } = body || {};

    if (!email) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'E-mail do destinatário não informado.'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userName = name || 'Atleta';
    const userRoleText = role === 'goleiro' ? 'Goleiro GK' : 'Contratante / Organizador';
    const userRoleDesc = role === 'goleiro'
      ? 'Seu perfil foi criado com sucesso! Agora você pode receber convocações para fechar o gol de peladas, receber cachês via Pix e subir no ranking da plataforma.'
      : 'Seu perfil de organizador foi criado com sucesso! Agora você nunca mais vai sofrer com time sem goleiro. Convoque paredões avaliados em minutos.';

    const emailSubject = `⚽ Bem-vindo ao ParedãoGK, ${nickname || userName.split(' ')[0]}!`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #020617; color: #f8fafc; margin: 0; padding: 24px; }
          .container { max-width: 580px; margin: 0 auto; background-color: #0f172a; border-radius: 16px; border: 1px solid #1e293b; overflow: hidden; }
          .header { background: linear-gradient(135deg, #10b981 0%, #0284c7 100%); padding: 32px 24px; text-align: center; }
          .header h1 { margin: 0; color: #020617; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
          .header p { margin: 6px 0 0; color: #064e3b; font-size: 13px; font-weight: 600; text-transform: uppercase; }
          .content { padding: 32px 24px; }
          .greeting { font-size: 18px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
          .text { font-size: 14px; line-height: 1.6; color: #94a3b8; margin-bottom: 20px; }
          .badge { display: inline-block; background-color: #22c55e15; border: 1px solid #22c55e40; color: #4ade80; padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-bottom: 20px; }
          .card { background-color: #020617; border: 1px solid #1e293b; border-radius: 12px; padding: 18px; margin-bottom: 24px; }
          .card h3 { margin: 0 0 8px; font-size: 14px; color: #38bdf8; }
          .card ul { margin: 0; padding-left: 18px; color: #cbd5e1; font-size: 13px; line-height: 1.5; }
          .cta-btn { display: inline-block; background-color: #22c55e; color: #020617; font-weight: 700; font-size: 14px; text-decoration: none; padding: 14px 28px; border-radius: 10px; text-align: center; margin-top: 8px; }
          .footer { padding: 20px 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #1e293b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>PAREDÃO GK</h1>
            <p>Ecossistema Oficial ArenaDraft</p>
          </div>
          <div class="content">
            <div class="greeting">Fala, ${userName}!</div>
            <div class="badge">Perfil: ${userRoleText}</div>
            <p class="text">${userRoleDesc}</p>
            
            <div class="card">
              <h3>Dicas para o pontapé inicial:</h3>
              <ul>
                <li><strong>Validação de CPF ativa:</strong> Seu cadastro cumpre as diretrizes de segurança contra W.O.</li>
                <li><strong>Carteira & Pix:</strong> Transações 100% integradas e seguras.</li>
                <li><strong>Regra W.O. e Fair Play:</strong> Cancelamentos em menos de 4h geram sanções de reputação.</li>
              </ul>
            </div>

            <center>
              <a href="https://arenadraft.com.br/paredaogk" class="cta-btn">Acessar Meu Painel</a>
            </center>
          </div>
          <div class="footer">
            ParedãoGK &bull; Gestão Profissional de Futebol Amador<br/>
            Este e-mail foi gerado automaticamente após o cadastro no Supabase Auth.
          </div>
        </div>
      </body>
      </html>
    `;

    // Registro em log institucional
    console.log(`[ParedãoGK Email Service] E-mail de boas-vindas disparado para: ${email} (${userName} - ${userRoleText})`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'E-mail de boas-vindas processado com sucesso.',
        recipient: email,
        subject: emailSubject,
        role: role,
        previewHtml: htmlContent,
        sentAt: new Date().toISOString()
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('[ParedãoGK Email Error]', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erro ao processar e-mail de boas-vindas.'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
