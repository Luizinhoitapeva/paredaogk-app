import app from '../server.ts';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: any, res: any) {
  const rawUrl = String(req.url || '');
  const queryIndex = rawUrl.indexOf('?');
  const querySuffix = queryIndex >= 0 ? rawUrl.slice(queryIndex) : '';
  req.url = `/api/webhook-mercadopago${querySuffix}`;
  return app(req, res);
}
