import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Registrar o Service Worker oficial do ParedãoGK para suporte PWA e modo offline
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[ParedãoGK PWA] Service Worker registrado com sucesso:', registration.scope);
      })
      .catch((error) => {
        console.warn('[ParedãoGK PWA] Falha no registro do Service Worker:', error);
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
