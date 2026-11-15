import React, { useEffect, useRef } from 'react';
import { UserProfile } from '../types';
import { isAuthorizedAdmin, verifySupabaseAdminAccess } from '../lib/supabaseClient';
import { GkShieldCheckAdminIcon as AdminShield } from './icons';

export type AdminRouteTarget = 'arenas' | 'financial' | null;

const ADMIN_PATH_REGEX = /^\/(admin|moderacao|admin-pix|financeiro-admin|webhooks-admin)(\/.*)?$/i;
const ADMIN_HASH_REGEX = /^#\/?(admin|moderacao|admin-pix|financeiro-admin|webhooks-admin)(\/.*)?$/i;

/**
 * Detecta tentativas de acesso direto a rotas administrativas via URL, hash ou query string.
 */
export function detectRequestedAdminRoute(
  pathname: string,
  hash: string,
  search: string
): AdminRouteTarget {
  const cleanPath = (pathname || '').trim();
  const cleanHash = (hash || '').trim();
  const params = new URLSearchParams(search || '');

  const queryAdminHint = [
    params.get('admin'),
    params.get('route'),
    params.get('view'),
    params.get('tab'),
    params.get('panel'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const combined = `${cleanPath} ${cleanHash} ${queryAdminHint}`.toLowerCase();

  const isAdminPath = ADMIN_PATH_REGEX.test(cleanPath);
  const isAdminHash = ADMIN_HASH_REGEX.test(cleanHash);
  const isAdminQuery =
    params.has('admin') ||
    /(^|\s)(admin|moderacao|admin-arenas|admin-pix|financeiro-admin|webhooks-admin)(\s|$)/.test(
      queryAdminHint
    );

  if (!isAdminPath && !isAdminHash && !isAdminQuery) {
    return null;
  }

  if (combined.includes('arena') || combined.includes('moderacao')) {
    return 'arenas';
  }

  return 'financial';
}

interface AdminRouteGuardProps {
  user: UserProfile;
  isOpen: boolean;
  onUnauthorized: (reason: string) => void;
  children: React.ReactNode;
}

const DEFAULT_DENIED_MESSAGE =
  'Acesso bloqueado: área administrativa restrita ao administrador oficial (luizinhoitapevasp@gmail.com) ou perfil com role admin no Supabase.';

export const AdminRouteGuard: React.FC<AdminRouteGuardProps> = ({
  user,
  isOpen,
  onUnauthorized,
  children,
}) => {
  const hasTriggeredRef = useRef(false);
  const isSyncAuthorized = isAuthorizedAdmin(user);

  useEffect(() => {
    if (!isOpen) {
      hasTriggeredRef.current = false;
      return;
    }

    if (!isSyncAuthorized) {
      if (!hasTriggeredRef.current) {
        hasTriggeredRef.current = true;
        onUnauthorized(DEFAULT_DENIED_MESSAGE);
      }
      return;
    }

    let cancelled = false;
    verifySupabaseAdminAccess(user).then((verified) => {
      if (!cancelled && !verified && !hasTriggeredRef.current) {
        hasTriggeredRef.current = true;
        onUnauthorized(DEFAULT_DENIED_MESSAGE);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, isSyncAuthorized, user.id, user.email, user.isAdmin, user.supabaseRole]);

  if (!isOpen) return null;

  if (!isSyncAuthorized) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
        <div className="max-w-md w-full p-6 rounded-3xl bg-white dark:bg-[#020617] border border-red-500/40 text-center space-y-3 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-500 flex items-center justify-center mx-auto">
            <AdminShield className="w-6 h-6" />
          </div>
          <h3 className="font-display font-extrabold text-base text-slate-900 dark:text-white">
            Acesso Administrativo Bloqueado
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Redirecionando para a página inicial...
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
