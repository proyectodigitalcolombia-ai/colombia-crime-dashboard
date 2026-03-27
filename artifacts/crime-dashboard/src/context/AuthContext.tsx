import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

export interface UserConfig {
  id: number;
  email: string;
  companyName: string;
  companySubtitle: string;
  analystName: string;
  analystEmail: string;
  analystPhone: string;
  primaryColor: string;
  footerDisclaimer: string;
  isAdmin: boolean;
}

interface AuthContextValue {
  user: UserConfig | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateConfig: (patch: Partial<Omit<UserConfig, "id" | "email" | "isAdmin">>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "safenode_token";
const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const API = `${BASE}/api`;

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  setAuthTokenGetter(() => token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  setAuthTokenGetter(null);
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`${API}${path}`, { ...options, headers });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) { setLoading(false); return; }
    setAuthTokenGetter(() => token);
    apiFetch("/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(data => setUser(data?.user ?? null))
      .catch(() => { clearToken(); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? "Error al iniciar sesión");
    storeToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    clearToken();
    setUser(null);
  }, []);

  const updateConfig = useCallback(async (patch: Partial<Omit<UserConfig, "id" | "email" | "isAdmin">>) => {
    const r = await apiFetch("/auth/config", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? "Error al guardar");
    setUser(data.user);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateConfig }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
