import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import type { ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { setAuthTokenGetter } from "@workspace/api-client-react";

setAuthTokenGetter(() => localStorage.getItem("transcontrol_token"));

import LoginPage from "@/pages/LoginPage";
import DispatchesPage from "@/pages/DispatchesPage";
import DispatchDetail from "@/pages/DispatchDetail";
import AdminEmpresasPage from "@/pages/AdminEmpresasPage";
import AdminUsuariosPage from "@/pages/AdminUsuariosPage";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

interface GuardProps {
  component: ComponentType;
  requiredRoles?: string[];
}

function AuthGuard({ component: Component, requiredRoles }: GuardProps) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Redirect to="/login" />;
  if (requiredRoles && !requiredRoles.includes(user.role)) {
    return <Redirect to="/despachos" />;
  }
  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}

function Router() {
  return (
    <AuthProvider>
      <Switch>
        <Route path="/login" component={LoginPage} />

        <Route path="/despachos">
          {() => <AuthGuard component={DispatchesPage} />}
        </Route>

        <Route path="/despachos/:id">
          {() => <AuthGuard component={DispatchDetail} />}
        </Route>

        <Route path="/admin/empresas">
          {() => <AuthGuard component={AdminEmpresasPage} requiredRoles={["superadmin"]} />}
        </Route>

        <Route path="/admin/usuarios">
          {() => <AuthGuard component={AdminUsuariosPage} requiredRoles={["superadmin", "admin"]} />}
        </Route>

        <Route path="/">
          {() => {
            const base = import.meta.env.BASE_URL.replace(/\/$/, "");
            window.location.replace(base + "/login");
            return null;
          }}
        </Route>

        <Route component={NotFound} />
      </Switch>
    </AuthProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
