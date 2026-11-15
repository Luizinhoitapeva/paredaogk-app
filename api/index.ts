import app from '../server.ts';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: any, res: any) {
  const originalPath =
    (req.headers['x-vercel-original-path'] as string) ||
    (req.headers['x-forwarded-uri'] as string) ||
    (req.headers['x-invoke-path'] as string) ||
    '';

  const currentUrl = String(req.url || '/');
  if (
    originalPath &&
    originalPath.startsWith('/api/') &&
    (currentUrl === '/api/index' || currentUrl.startsWith('/api/index?'))
  ) {
    const queryIdx = currentUrl.indexOf('?');
    const querySuffix = queryIdx >= 0 && !originalPath.includes('?') ? currentUrl.slice(queryIdx) : '';
    req.url = `${originalPath}${querySuffix}`;
  } else if (currentUrl && !currentUrl.startsWith('/api/')) {
    req.url = `/api${currentUrl.startsWith('/') ? '' : '/'}${currentUrl}`;
  }

  return app(req, res);
}
