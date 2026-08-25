import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { auth as authApi, tokenStore, onUnauthorized } from '../api/index.js';

const AuthContext = createContext(null);

/**
 * Session state.
 *
 * Only the token is ever stored, and only for the lifetime of the tab. Every
 * other fact about the account — name, role, panel, company, verification
 * state — is fetched from `/auth/me` and held in memory. Nothing about who you
 * are is read back off the browser.
 *
 * That is not tidiness. A stored user object is a claim the client makes about
 * itself, and it goes stale silently: an account demoted, deactivated or
 * verified server-side would keep rendering its old panel until something
 * happened to refresh it. Asking the server means the answer is current, and
 * the server is the only party entitled to give it.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((payload) => {
    tokenStore.set(payload.token);
    setSession(payload);
  }, []);

  /** Re-read the account from the server, discarding whatever is in memory. */
  const reloadFromServer = useCallback(async () => {
    const me = await authApi.me();
    setSession(me);
    return me;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setSession(null);
  }, []);

  // Rehydrate on load: token from the tab, everything else from the server.
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
        tokenStore.clear(); // expired, revoked, or the account was deactivated
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Re-read the account when the tab is brought back to the foreground.
   *
   * A panel left open in a background tab for an hour is showing an hour-old
   * answer, and the most common thing to change in that hour is exactly what
   * this payload carries — a verification approved, a role adjusted, an account
   * switched off. A failure here is left alone deliberately: the 401 handler
   * below already drops a dead session, and a transient network blip should not
   * throw someone out of a panel they are still entitled to.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && tokenStore.get()) {
        authApi.me().then(setSession, () => {});
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
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

  /**
   * Change the password, then adopt the session that comes back.
   *
   * The server mints a fresh token on success, so replacing the stored one here
   * keeps the client from holding a session issued before the credential moved.
   */
  const changePassword = useCallback(
    async (payload) => {
      const result = await authApi.changePassword(payload);
      applySession(result);
      return result;
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

  const refresh = reloadFromServer;

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      role: session?.panel ?? null,
      workerProfile: session?.workerProfile ?? null,
      cooperative: session?.cooperative ?? null,
      // The server's own description of the account — role, panel label, owner
      // flag, when the password last changed. The client renders this rather
      // than deducing any of it from the user document.
      account: session?.account ?? null,
      isAuthenticated: Boolean(session),
      // Display hint only. The database panel is gated server-side against the
      // deployment's owner list; this just avoids showing a door that opens
      // onto a 403.
      isOwner: Boolean(session?.account?.isOwner ?? session?.isOwner),
      loading,
      login,
      changePassword,
      register,
      logout,
      refresh,
      setSession,
    }),
    [session, loading, login, changePassword, register, logout, refresh],
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
