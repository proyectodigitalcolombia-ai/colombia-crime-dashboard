import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import type { ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { setAuthTokenGetter } from "@workspace/api-client-react";

setAuthTokenGetter(() => localStorage.getItem("transport_token"));

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

interface ProtectedRouteProps {
  path: string;
  component: ComponentType;
  requiredRoles?: string[];
}

function ProtectedRoute({ path, component: Component, requiredRoles }: ProtectedRouteProps) {
  return (
    <Route path={path}>
      {() => {
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
      }}
    </Route>
  );
}

function Router() {
  return (
    <AuthProvider>
      <Switch>
        <Route path="/login" component={LoginPage} />

        <ProtectedRoute path="/despachos" component={DispatchesPage} />
        <ProtectedRoute path="/despachos/:id" component={DispatchDetail} />

        <ProtectedRoute
          path="/admin/empresas"
          component={AdminEmpresasPage}
          requiredRoles={["superadmin"]}
        />
        <ProtectedRoute
          path="/admin/usuarios"
          component={AdminUsuariosPage}
          requiredRoles={["superadmin", "admin"]}
        />

        <Route path="/">
          {() => {
            window.location.href = import.meta.env.BASE_URL + "login";
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
