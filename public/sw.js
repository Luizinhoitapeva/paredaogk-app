const CACHE_NAME = 'paredao-gk-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/src/main.tsx',
  '/src/index.css',
  '/src/App.tsx',
  '/src/assets/images/hero_goalkeeper_save_1794330975279.jpg',
  '/src/assets/images/arena_soccer_turf_1794330976038.jpg',
  '/src/assets/images/elite_gk_gloves_1794330976706.jpg'
];

// Instalação: Pré-cache dos ativos estáticos essenciais da aplicação
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ParedãoGK ServiceWorker] Caching static assets & offline shell...');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[ParedãoGK ServiceWorker] Some assets could not be precached directly:', err);
      });
    })
  );
  self.skipWaiting();
});

// Ativação: Limpeza de caches obsoletos e controle imediato de clientes
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ParedãoGK ServiceWorker] Removing outdated cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Estratégia de Fetch: Network-First com Fallback transparente para o Cache
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Não interferir em requisições de API de terceiros ou websockets
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Tentar a rede primeiro para dados atualizados
      return fetch(event.request)
        .then((networkResponse) => {
          // Se obteve resposta válida, atualizar o cache em background (Stale-while-revalidate)
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Se estiver offline e houver versão em cache, responder com ela
          if (cachedResponse) {
            return cachedResponse;
          }

          // Se for requisição de navegação HTML, retornar a página inicial do SPA
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/') || caches.match('/index.html');
          }

          // Fallback para imagens
          if (event.request.headers.get('accept')?.includes('image/')) {
            return caches.match('/icon.svg');
          }

          return new Response('Offline: ParedãoGK cached mode', {
            status: 503,
            statusText: 'Service Unavailable (Offline)',
            headers: new Headers({ 'Content-Type': 'text/plain' })
          });
        });
    })
  );
});

// Escuta de mensagens do cliente (ex: solicitar sincronização manual ou skip waiting)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
