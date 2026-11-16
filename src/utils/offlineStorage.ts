/**
 * Gerenciador de Armazenamento Local Seguro para o ParedãoGK (PWA Offline)
 * Suporta IndexedDB com fallback automático para localStorage seguro
 */

import {
  UserProfile,
  MatchBooking,
  Transaction,
  WeeklyMatchTemplate,
  ArenaField,
  AdminPixWithdrawal,
  MercadoPagoWebhookConfig,
  MercadoPagoWebhookLog,
} from '../types';

const DB_NAME = 'ParedaoGK_OfflineStore';
const DB_VERSION = 1;
const STORES = {
  USER_PROFILE: 'user_profile',
  MATCHES: 'matches',
  WALLET: 'wallet_data',
  SYNC_QUEUE: 'sync_queue',
};

const LOCAL_STORAGE_PREFIX = 'pgk_offline_';

/**
 * Inicializa a conexão com o IndexedDB do navegador
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result as IDBDatabase;
      if (!db.objectStoreNames.contains(STORES.USER_PROFILE)) {
        db.createObjectStore(STORES.USER_PROFILE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.MATCHES)) {
        db.createObjectStore(STORES.MATCHES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.WALLET)) {
        db.createObjectStore(STORES.WALLET, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Salva o perfil do usuário para visualização offline
 */
export async function saveOfflineUserProfile(profile: UserProfile): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORES.USER_PROFILE, 'readwrite');
    tx.objectStore(STORES.USER_PROFILE).put(profile);
  } catch (err) {
    // Fallback para localStorage
    try {
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}profile`, JSON.stringify(profile));
    } catch (e) {
      console.warn('[OfflineStore Profile LocalStorage Error]', e);
    }
  }
}

/**
 * Higieniza o perfil removendo qualquer vestígio de dados fake de testes antigos
 */
function sanitizeProfile(profile: any): UserProfile | null {
  if (!profile) return null;
  const isFakeName =
    profile.name === 'Rodrigo Mendonça' ||
    profile.nickname === 'Capitão Digão' ||
    profile.id === 'usr-current' && profile.city === 'São Paulo' && profile.matchesPlayed === 38;
  const isFakeEmail = profile.email === 'rodrigo.mendonca@arenadraft.com.br' || profile.email?.includes('rodrigo');
  const isFakePhone = profile.phone === '(11) 98765-4321' || profile.phone === '11987654321';
  if (isFakeName || isFakeEmail || isFakePhone) {
    return null;
  }
  return profile;
}

const LEGACY_MOCK_MATCH_IDS = new Set(['mtch-100', 'mtch-101', 'mtch-102', 'mtch-103']);
const LEGACY_MOCK_GK_IDS = new Set(['gk-1', 'gk-2', 'gk-3', 'gk-4', 'gk-5', 'gk-6']);
const LEGACY_MOCK_TEMPLATE_IDS = new Set(['tpl-weekly-1', 'tpl-weekly-2']);

/**
 * Varre e limpa todo o cache legado residual de demonstração (IndexedDB e LocalStorage)
 */
export async function clearLegacyTestCache(): Promise<void> {
  try {
    if (typeof window === 'undefined') return;

    // 1. Limpar LocalStorage de vestígios antigos e mocks de demonstração
    const keysToCheck = ['profile', 'matches', 'wallet', 'queue', 'weekly_templates', 'favorite_gks'];
    keysToCheck.forEach((key) => {
      const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${key}`);
      if (
        raw &&
        (raw.includes('Rodrigo Mendonça') ||
          raw.includes('Capitão Digão') ||
          raw.includes('rodrigo.mendonca') ||
          raw.includes('11987654321') ||
          raw.includes('(11) 98765-4321') ||
          raw.includes('Marcos Vinícius Silva') ||
          raw.includes('Arena Morumbi Soccer Club') ||
          raw.includes('tpl-weekly-1'))
      ) {
        localStorage.removeItem(`${LOCAL_STORAGE_PREFIX}${key}`);
      }
    });

    // 2. Limpar no IndexedDB
    try {
      const db = await openDatabase();
      const tx = db.transaction([STORES.USER_PROFILE, STORES.MATCHES], 'readwrite');
      const profileStore = tx.objectStore(STORES.USER_PROFILE);
      const req = profileStore.getAll();
      req.onsuccess = () => {
        if (req.result) {
          req.result.forEach((p: any) => {
            if (
              p.name === 'Rodrigo Mendonça' ||
              p.nickname === 'Capitão Digão' ||
              p.email?.includes('rodrigo') ||
              (p.id === 'usr-current' && p.city === 'São Paulo' && p.matchesPlayed === 38)
            ) {
              profileStore.delete(p.id);
            }
          });
        }
      };

      const matchStore = tx.objectStore(STORES.MATCHES);
      const matchReq = matchStore.getAll();
      matchReq.onsuccess = () => {
        if (matchReq.result) {
          matchReq.result.forEach((m: any) => {
            if (LEGACY_MOCK_MATCH_IDS.has(m.id) || LEGACY_MOCK_GK_IDS.has(m.goalkeeperId)) {
              matchStore.delete(m.id);
            }
          });
        }
      };
    } catch {
      // Ignorar caso IndexedDB não esteja disponível
    }
  } catch (err) {
    console.warn('[Cache Cleanup Note]', err);
  }
}

/**
 * Limpa o perfil salvo localmente (usado no logout ou quando não há sessão Supabase ativa)
 */
export async function clearOfflineUserProfile(): Promise<void> {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`${LOCAL_STORAGE_PREFIX}profile`);
    }
    const db = await openDatabase();
    const tx = db.transaction(STORES.USER_PROFILE, 'readwrite');
    tx.objectStore(STORES.USER_PROFILE).clear();
  } catch {
    // Ignore storage errors
  }
}

/**
 * Obtém o perfil do usuário salvo offline garantindo sanitização de dados fake
 */
export async function getOfflineUserProfile(): Promise<UserProfile | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.USER_PROFILE, 'readonly');
      const req = tx.objectStore(STORES.USER_PROFILE).getAll();
      req.onsuccess = () => {
        if (req.result && req.result.length > 0) {
          const sanitized = sanitizeProfile(req.result[0]);
          if (!sanitized) {
            try {
              const delTx = db.transaction(STORES.USER_PROFILE, 'readwrite');
              delTx.objectStore(STORES.USER_PROFILE).delete(req.result[0].id);
            } catch {}
          }
          resolve(sanitized);
        } else {
          resolve(sanitizeProfile(getLocalStorageFallback('profile')));
        }
      };
      req.onerror = () => resolve(sanitizeProfile(getLocalStorageFallback('profile')));
    });
  } catch {
    return sanitizeProfile(getLocalStorageFallback('profile'));
  }
}

/**
 * Salva a lista de partidas jogadas/agendadas para acesso offline
 */
export async function saveOfflineMatches(matches: MatchBooking[]): Promise<void> {
  const capped = (matches || []).slice(0, 60);
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORES.MATCHES, 'readwrite');
    const store = tx.objectStore(STORES.MATCHES);
    capped.forEach((m) => store.put(m));
  } catch (err) {
    try {
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}matches`, JSON.stringify(capped));
    } catch (e) {
      console.warn('[OfflineStore Matches LocalStorage Error]', e);
    }
  }
}

function sanitizeMatches(list: MatchBooking[]): MatchBooking[] {
  return (list || []).filter(
    (m) => !LEGACY_MOCK_MATCH_IDS.has(m.id) && !LEGACY_MOCK_GK_IDS.has(m.goalkeeperId || '')
  );
}

/**
 * Obtém as partidas salvas offline
 */
export async function getOfflineMatches(): Promise<MatchBooking[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.MATCHES, 'readonly');
      const req = tx.objectStore(STORES.MATCHES).getAll();
      req.onsuccess = () => {
        if (req.result && req.result.length > 0) {
          resolve(sanitizeMatches(req.result as MatchBooking[]));
        } else {
          resolve(sanitizeMatches(getLocalStorageFallback('matches') || []));
        }
      };
      req.onerror = () => resolve(sanitizeMatches(getLocalStorageFallback('matches') || []));
    });
  } catch {
    return sanitizeMatches(getLocalStorageFallback('matches') || []);
  }
}

/**
 * Salva extrato da carteira digital e saldos para visualização offline
 */
export async function saveOfflineWallet(walletData: {
  balance: number;
  cashback: number;
  transactions: Transaction[];
}): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORES.WALLET, 'readwrite');
    tx.objectStore(STORES.WALLET).put({ key: 'current_wallet', ...walletData });
  } catch (err) {
    try {
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}wallet`, JSON.stringify(walletData));
    } catch (e) {
      console.warn('[OfflineStore Wallet LocalStorage Error]', e);
    }
  }
}

/**
 * Obtém os dados da carteira salvos offline
 */
export async function getOfflineWallet(): Promise<{
  balance: number;
  cashback: number;
  transactions: Transaction[];
} | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.WALLET, 'readonly');
      const req = tx.objectStore(STORES.WALLET).get('current_wallet');
      req.onsuccess = () => {
        if (req.result) {
          resolve(req.result);
        } else {
          resolve(getLocalStorageFallback('wallet'));
        }
      };
      req.onerror = () => resolve(getLocalStorageFallback('wallet'));
    });
  } catch {
    return getLocalStorageFallback('wallet');
  }
}

/**
 * Adiciona uma ação pendente à fila de sincronização (ex: avaliação enviada offline)
 */
export async function queueOfflineSyncAction(action: {
  type: 'review' | 'booking' | 'profile_update';
  payload: any;
  createdAt: string;
}): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
    tx.objectStore(STORES.SYNC_QUEUE).add(action);
  } catch (err) {
    const queue = JSON.parse(localStorage.getItem(`${LOCAL_STORAGE_PREFIX}queue`) || '[]');
    queue.push(action);
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}queue`, JSON.stringify(queue));
  }
}

/**
 * Processa a fila de ações pendentes quando a conexão for restabelecida
 */
export async function processPendingOfflineSync(
  syncHandler: (action: { type: string; payload: any }) => Promise<boolean>
): Promise<number> {
  let processedCount = 0;

  try {
    const db = await openDatabase();
    const tx = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.SYNC_QUEUE);
    const req = store.getAll();

    req.onsuccess = async () => {
      const actions = req.result || [];
      for (const item of actions) {
        try {
          const success = await syncHandler(item);
          if (success && item.id) {
            const deleteTx = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
            deleteTx.objectStore(STORES.SYNC_QUEUE).delete(item.id);
            processedCount++;
          }
        } catch (e) {
          console.warn('[Sync Item Failed]', item, e);
        }
      }
    };
  } catch (err) {
    const queue = JSON.parse(localStorage.getItem(`${LOCAL_STORAGE_PREFIX}queue`) || '[]');
    const remaining = [];
    for (const item of queue) {
      try {
        const success = await syncHandler(item);
        if (success) {
          processedCount++;
        } else {
          remaining.push(item);
        }
      } catch {
        remaining.push(item);
      }
    }
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}queue`, JSON.stringify(remaining));
  }

  return processedCount;
}

function getLocalStorageFallback(key: string): any {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveOfflineWeeklyTemplates(templates: WeeklyMatchTemplate[]): void {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}weekly_templates`, JSON.stringify(templates));
  } catch (e) {
    console.warn('[OfflineStore WeeklyTemplates Error]', e);
  }
}

export function getOfflineWeeklyTemplates(): WeeklyMatchTemplate[] | null {
  const list = getLocalStorageFallback('weekly_templates') as WeeklyMatchTemplate[] | null;
  if (!list) return null;
  return list.filter((t) => !LEGACY_MOCK_TEMPLATE_IDS.has(t.id));
}

export function saveOfflineFavoriteGoalkeepers(ids: string[]): void {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}favorite_gks`, JSON.stringify(ids));
  } catch (e) {
    console.warn('[OfflineStore Favorites Error]', e);
  }
}

export function getOfflineFavoriteGoalkeepers(): string[] | null {
  const list = getLocalStorageFallback('favorite_gks') as string[] | null;
  if (!list) return null;
  return list.filter((id) => !LEGACY_MOCK_GK_IDS.has(id));
}

export function saveOfflineArenas(arenas: ArenaField[]): void {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}arenas`, JSON.stringify(arenas));
  } catch (e) {
    console.warn('[OfflineStore Arenas Error]', e);
  }
}

export function getOfflineArenas(): ArenaField[] | null {
  return getLocalStorageFallback('arenas');
}

export function saveOfflineAdminWithdrawals(items: AdminPixWithdrawal[]): void {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}admin_withdrawals`, JSON.stringify(items));
  } catch (e) {
    console.warn('[OfflineStore AdminWithdrawals Error]', e);
  }
}

export function getOfflineAdminWithdrawals(): AdminPixWithdrawal[] {
  return (getLocalStorageFallback('admin_withdrawals') as AdminPixWithdrawal[] | null) || [];
}

export function saveOfflineWebhookConfig(config: MercadoPagoWebhookConfig): void {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}mercadopago_webhook_config`, JSON.stringify(config));
  } catch (e) {
    console.warn('[OfflineStore WebhookConfig Error]', e);
  }
}

export function getOfflineWebhookConfig(): MercadoPagoWebhookConfig | null {
  return getLocalStorageFallback('mercadopago_webhook_config') as MercadoPagoWebhookConfig | null;
}

export function saveOfflineWebhookLogs(logs: MercadoPagoWebhookLog[]): void {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}mercadopago_webhook_logs`, JSON.stringify(logs.slice(0, 80)));
  } catch (e) {
    console.warn('[OfflineStore WebhookLogs Error]', e);
  }
}

export function getOfflineWebhookLogs(): MercadoPagoWebhookLog[] {
  return (getLocalStorageFallback('mercadopago_webhook_logs') as MercadoPagoWebhookLog[] | null) || [];
}


