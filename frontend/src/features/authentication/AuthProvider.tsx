import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { AUTH_EXPIRED_EVENT, apiRequest, setAccessToken, setRefreshToken } from "../../api/client";
import { User } from "../../types/api";

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

type AuthContextValue = {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AUTH_USER_KEY = "hr-roster-user";
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  });

  useEffect(() => {
    const expireSession = () => {
      setAccessToken(null);
      setRefreshToken(null);
      localStorage.removeItem(AUTH_USER_KEY);
      setUser(null);
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, expireSession);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, expireSession);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login: async (email: string, password: string) => {
        const response = await apiRequest<AuthResponse>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password })
        });
        setAccessToken(response.accessToken);
        setRefreshToken(response.refreshToken);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(response.user));
        setUser(response.user);
      },
      logout: () => {
        setAccessToken(null);
        setRefreshToken(null);
        localStorage.removeItem(AUTH_USER_KEY);
        setUser(null);
      }
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
