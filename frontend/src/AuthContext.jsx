import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchMe, login as apiLogin, register as apiRegister } from './api';
import { clearToken, getToken, setToken } from './authStorage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [authError, setAuthError] = useState('');

  const bootstrap = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setInitializing(false);
      return;
    }

    try {
      const { user: current } = await fetchMe();
      setUser(current);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(async (credentials) => {
    setAuthError('');
    const { user: loggedIn, token } = await apiLogin(credentials);
    setToken(token);
    setUser(loggedIn);
    return loggedIn;
  }, []);

  const register = useCallback(async (payload) => {
    setAuthError('');
    const { user: created, token } = await apiRegister(payload);
    setToken(token);
    setUser(created);
    return created;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setAuthError('');
  }, []);

  const value = useMemo(
    () => ({
      user,
      initializing,
      authError,
      setAuthError,
      login,
      register,
      logout,
    }),
    [user, initializing, authError, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
