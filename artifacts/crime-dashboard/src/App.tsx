import { Component, type ReactNode } from "react";
import { Switch, Route } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div style={{
          minHeight: "100vh", background: "#070c15", color: "#ef4444",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "40px", fontFamily: "monospace",
        }}>
          <div style={{ fontSize: "24px", marginBottom: "16px" }}>Error de renderizado</div>
          <div style={{ fontSize: "14px", color: "#f59e0b", maxWidth: "800px", wordBreak: "break-all" }}>
            {err.message}
          </div>
          <pre style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "16px", maxWidth: "800px", overflow: "auto" }}>
            {err.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
