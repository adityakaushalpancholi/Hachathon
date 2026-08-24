import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { auth as authApi, tokenStore, onUnauthorized } from '../api/index.js';

const AuthContext = createContext(null);

/**
 * Session state.
 *
 * On boot the app calls `/auth/me` with whatever token is in localStorage. The
 * server answers with the user *and* a `panel` field naming the role it will
 * actually honour. The client never decides its own access level — it only
 * renders what the server has already agreed to.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((payload) => {
    tokenStore.set(payload.token);
    setSession(payload);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setSession(null);
  }, []);

  // Rehydrate on load.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!tokenStore.get()) {
        setLoading(false);
        return;
      }
      try {
        const me = await authApi.me();
        if (!cancelled) setSession(me);
      } catch {
        tokenStore.clear(); // expired or revoked
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Any 401 anywhere in the app drops the session, so a revoked token cannot
  // leave a half-authenticated panel on screen.
  useEffect(() => onUnauthorized(() => setSession(null)), []);

  const login = useCallback(
    async (phone, password) => {
      const payload = await authApi.login(phone, password);
      applySession(payload);
      return payload;
    },
    [applySession],
  );

  const register = useCallback(
    async (payload) => {
      const result = await authApi.register(payload);
      applySession(result);
      return result;
    },
    [applySession],
  );

  const refresh = useCallback(async () => {
    const me = await authApi.me();
    setSession(me);
    return me;
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      role: session?.panel ?? null,
      workerProfile: session?.workerProfile ?? null,
      cooperative: session?.cooperative ?? null,
      isAuthenticated: Boolean(session),
      loading,
      login,
      register,
      logout,
      refresh,
      setSession,
    }),
    [session, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Where each role lands after signing in. */
export const HOME_FOR_ROLE = {
  customer: '/app',
  worker: '/work',
  admin: '/admin',
};
