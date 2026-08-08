import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AUTH_EXPIRED_EVENT, apiRequest, clearAuthActivity, recordAuthActivity, setAccessToken, setRefreshToken } from "../../api/client";
import { OrganisationSummary, User } from "../../types/api";

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

type AuthContextValue = {
  user: User | null;
  organisations: OrganisationSummary[];
  login: (identifier: string, password: string, orgCode?: string) => Promise<void>;
  switchOrganisation: (organisationId: string) => Promise<void>;
  logout: () => void;
  updateCurrentUser: (patch: Partial<User>) => void;
  refreshOrganisations: () => Promise<void>;
};

const AUTH_USER_KEY = "hr-roster-user";
const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  });
  const [organisations, setOrganisations] = useState<OrganisationSummary[]>([]);

  const fetchOrganisations = useCallback(async () => {
    try {
      const orgs = await apiRequest<OrganisationSummary[]>("/auth/organisations");
      setOrganisations(orgs);
    } catch {
      setOrganisations([]);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void fetchOrganisations();
    } else {
      setOrganisations([]);
    }
  }, [user, fetchOrganisations]);

  useEffect(() => {
    const expireSession = () => {
      setAccessToken(null);
      setRefreshToken(null);
      clearAuthActivity();
      localStorage.removeItem(AUTH_USER_KEY);
      setUser(null);
      setOrganisations([]);
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, expireSession);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, expireSession);
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    recordAuthActivity();
    let timeoutId = window.setTimeout(expireForInactivity, INACTIVITY_LIMIT_MS);
    const resetTimer = () => {
      recordAuthActivity();
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(expireForInactivity, INACTIVITY_LIMIT_MS);
    };
    const events: Array<keyof WindowEventMap> = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];

    function expireForInactivity() {
      setAccessToken(null);
      setRefreshToken(null);
      clearAuthActivity();
      localStorage.removeItem(AUTH_USER_KEY);
      setUser(null);
      setOrganisations([]);
    }

    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    return () => {
      window.clearTimeout(timeoutId);
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      organisations,
      login: async (identifier: string, password: string, orgCode?: string) => {
        const response = await apiRequest<AuthResponse>("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            orgCode: orgCode ? orgCode.trim() : undefined,
            email: identifier,
            password
          })
        });
        setAccessToken(response.accessToken);
        setRefreshToken(response.refreshToken);
        recordAuthActivity();
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(response.user));
        setUser(response.user);
      },
      switchOrganisation: async (organisationId: string) => {
        const response = await apiRequest<AuthResponse>("/auth/switch-organisation", {
          method: "POST",
          body: JSON.stringify({ organisationId })
        });
        setAccessToken(response.accessToken);
        setRefreshToken(response.refreshToken);
        recordAuthActivity();
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(response.user));
        setUser(response.user);
        window.location.reload();
      },
      logout: () => {
        setAccessToken(null);
        setRefreshToken(null);
        clearAuthActivity();
        localStorage.removeItem(AUTH_USER_KEY);
        setUser(null);
        setOrganisations([]);
      },
      updateCurrentUser: (patch: Partial<User>) => {
        setUser((current) => {
          if (!current) {
            return current;
          }
          const updated = { ...current, ...patch };
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updated));
          return updated;
        });
      },
      refreshOrganisations: fetchOrganisations
    }),
    [user, organisations, fetchOrganisations]
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
