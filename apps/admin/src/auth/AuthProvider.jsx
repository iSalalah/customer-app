import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { api, onUnauthorized } from '../api/client.js';

const AuthContext = createContext(null);

/**
 * Staff authentication state.
 *
 * `staff` and `permissions` come from GET /auth/staff/me. They drive which
 * controls are drawn and nothing else - every one of them is re-derived by the
 * API on each call, so editing this state in a debugger changes the UI and
 * grants no access whatsoever.
 */
export function AuthProvider({ children }) {
  const [staff, setStaff] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [status, setStatus] = useState('loading');
  const queryClient = useQueryClient();

  const clear = useCallback(() => {
    setStaff(null);
    setPermissions(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  // Restores the session on a page reload: the cookie may still be valid.
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then(({ data }) => {
        if (cancelled) return;
        setStaff(data.staff);
        setPermissions(data.permissions);
        setStatus('authenticated');
      })
      .catch(() => {
        if (!cancelled) setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The API is the authority: an unrecoverable 401 clears local state.
  useEffect(() => onUnauthorized(clear), [clear]);

  const login = useCallback(async (username, password) => {
    const { data } = await api.login(username, password);
    setStaff(data.staff);
    setPermissions(data.permissions);
    setStatus('authenticated');
    return data.staff;
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    clear();
  }, [clear]);

  const value = useMemo(
    () => ({
      staff,
      permissions,
      status,
      isAuthenticated: status === 'authenticated',
      isLoading: status === 'loading',
      login,
      logout,
    }),
    [staff, permissions, status, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

export default AuthProvider;
