import { useAuth } from "@/context/AuthContext";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { LogOut, Truck, Building2, Users } from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  if (!user) return null;

  const isSuperadmin = user.role === "superadmin";
  const isAdmin = user.role === "admin" || user.role === "superadmin";

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="bg-card border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="font-bold text-lg tracking-tight text-primary flex items-center gap-2">
              <div className="bg-primary text-primary-foreground p-1 rounded">
                <Truck className="h-4 w-4" />
              </div>
              <span>TransControl</span>
            </div>
            <nav className="flex items-center gap-2 hidden md:flex">
              {!isSuperadmin && (
                <Button variant={location.startsWith("/despachos") ? "secondary" : "ghost"} size="sm" className="h-8 font-medium" asChild>
                  <Link href="/despachos">
                    <Truck className="mr-2 h-4 w-4 text-muted-foreground" />
                    Despachos en Ruta
                  </Link>
                </Button>
              )}
              {isSuperadmin && (
                <Button variant={location.startsWith("/admin/empresas") ? "secondary" : "ghost"} size="sm" className="h-8 font-medium" asChild>
                  <Link href="/admin/empresas">
                    <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                    Empresas
                  </Link>
                </Button>
              )}
              {isAdmin && (
                <Button variant={location.startsWith("/admin/usuarios") ? "secondary" : "ghost"} size="sm" className="h-8 font-medium" asChild>
                  <Link href="/admin/usuarios">
                    <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                    Usuarios
                  </Link>
                </Button>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end text-sm">
              <span className="font-semibold leading-none">{user.name}</span>
              <span className="text-muted-foreground text-xs capitalize mt-1">{user.role}</span>
            </div>
            <div className="h-8 w-px bg-border mx-1"></div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={logout} title="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 w-full p-4 md:p-6 mx-auto">
        <div className="max-w-[1600px] mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
