import { createContext, useContext, ReactNode, useEffect, useState } from "react";
import { useTransportMe } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import type { TransportUser } from "@workspace/api-client-react";

type AuthContextType = {
  user: TransportUser | undefined;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState<string | null>(localStorage.getItem("transport_token"));

  const { data: user, isLoading, error } = useTransportMe({
    query: {
      queryKey: ["transport-me", token],
      enabled: !!token,
      retry: false,
    },
  });

  useEffect(() => {
    if (error || (!token && !isLoading)) {
      if (!window.location.pathname.endsWith("/login")) {
        setLocation("/login");
      }
    }
  }, [error, token, isLoading, setLocation]);

  const login = (newToken: string) => {
    localStorage.setItem("transport_token", newToken);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem("transport_token");
    setToken(null);
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
