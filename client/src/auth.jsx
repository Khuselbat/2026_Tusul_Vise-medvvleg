import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, setUnauthorizedHandler } from './api.js';
import { Loading } from './components/ui.jsx';

const AuthCtx = createContext(null);

export const HOME_BY_ROLE = { APPLICANT: '/app', OPERATOR: '/operator', ADMIN: '/admin' };
export const ROLE_LABEL = { APPLICANT: 'Мэдүүлэгч', OPERATOR: 'Оператор', ADMIN: 'Админ' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = уншиж байна
  const [expired, setExpired] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get('/api/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser((u) => {
        if (u) setExpired(true);
        return null;
      });
    });
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api.post('/api/auth/login', { email, password });
    setUser(r.user);
    setExpired(false);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      /* */
    }
    setUser(null);
    navigate('/');
  }, [navigate]);

  const value = useMemo(() => ({ user, setUser, login, logout, expired, setExpired }), [user, login, logout, expired]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

/** Эрхээр хамгаалагдсан хэсэг. Нэвтрээгүй бол /login руу буцах замтай нь. */
export function RequireRole({ role, children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (user === undefined) return <Loading />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (user.role !== role) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  return children;
}
