import { useState, useMemo } from "react";
import { 
  useListTransportUsers, 
  useCreateTransportUser, 
  useUpdateTransportUser,
  useListTenants,
  type TransportUser,
  type Tenant,
  CreateTransportUserBodyRole,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, Edit2, ToggleLeft, ToggleRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Redirect } from "wouter";

const userSchema = z.object({
  name: z.string().min(2, "El nombre es requerido"),
  email: z.string().email("Correo inválido"),
  password: z.string().optional(),
  role: z.enum(["admin", "controlador"]),
  tenantId: z.number().nullable().optional(),
});

type UserFormValues = z.infer<typeof userSchema>;

export default function AdminUsuariosPage() {
  const { user: currentUser } = useAuth();
  
  if (!currentUser || (currentUser.role !== "superadmin" && currentUser.role !== "admin")) {
    return <Redirect href="/despachos" />;
  }

  const isSuperadmin = currentUser.role === "superadmin";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<TransportUser | null>(null);

  const { data: users = [], isLoading } = useListTransportUsers({
    query: { queryKey: ["transport-users"] }
  });

  const { data: tenants = [] } = useListTenants({
    query: { queryKey: ["tenants"], enabled: isSuperadmin }
  });

  const createMutation = useCreateTransportUser();
  const updateMutation = useUpdateTransportUser();

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "controlador",
      tenantId: !isSuperadmin ? currentUser.tenantId : null,
    }
  });

  const handleOpenCreate = () => {
    setEditingUser(null);
    form.reset({
      name: "",
      email: "",
      password: "",
      role: "controlador",
      tenantId: !isSuperadmin ? currentUser.tenantId : null,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: TransportUser) => {
    setEditingUser(user);
    const safeRole = user.role === "admin" || user.role === "controlador" ? user.role : "controlador";
    form.reset({
      name: user.name,
      email: user.email,
      password: "",
      role: safeRole,
      tenantId: user.tenantId,
    });
    setIsModalOpen(true);
  };

  const handleToggleActive = (u: TransportUser) => {
    updateMutation.mutate(
      { userId: u.id, data: { isActive: !u.isActive } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["transport-users"] });
          toast({ title: u.isActive ? "Usuario desactivado" : "Usuario activado" });
        },
        onError: () => toast({ title: "Error al cambiar estado", variant: "destructive" }),
      }
    );
  };

  const onSubmit = (values: UserFormValues) => {
    const { password, ...rest } = values;
    
    if (editingUser) {
      const updateData: { name?: string; email?: string; role?: string; tenantId?: number | null; password?: string } = {
        name: rest.name,
        email: rest.email,
        role: rest.role,
        tenantId: isSuperadmin ? rest.tenantId : undefined,
      };
      if (password) updateData.password = password;

      updateMutation.mutate(
        { userId: editingUser.id, data: updateData },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transport-users"] });
            setIsModalOpen(false);
            toast({ title: "Usuario actualizado" });
          },
          onError: () => toast({ title: "Error al actualizar", variant: "destructive" })
        }
      );
    } else {
      if (!password) {
        form.setError("password", { message: "Requerido para nuevos usuarios" });
        return;
      }
      if (isSuperadmin && !rest.tenantId) {
        form.setError("tenantId", { message: "Debe seleccionar una empresa" });
        return;
      }
      const createData = {
        name: rest.name,
        email: rest.email,
        password,
        role: rest.role as CreateTransportUserBodyRole,
        tenantId: isSuperadmin ? rest.tenantId! : currentUser.tenantId,
      };
      createMutation.mutate(
        { data: createData },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transport-users"] });
            setIsModalOpen(false);
            toast({ title: "Usuario creado exitosamente" });
          },
          onError: () => toast({ title: "Error al crear", variant: "destructive" })
        }
      );
    }
  };

  const tenantMap = useMemo(() => {
    return tenants.reduce<Record<number, string>>((acc, t: Tenant) => {
      acc[t.id] = t.name;
      return acc;
    }, {});
  }, [tenants]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Gestión de Usuarios
        </h1>
        <Button onClick={handleOpenCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Usuario
        </Button>
      </div>

      <Card className="shadow-sm border-border/60">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="font-semibold">Nombre</TableHead>
                <TableHead className="font-semibold">Email</TableHead>
                <TableHead className="font-semibold">Rol</TableHead>
                {isSuperadmin && <TableHead className="font-semibold">Empresa</TableHead>}
                <TableHead className="font-semibold">Estado</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={isSuperadmin ? 6 : 5} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
              ) : users.length === 0 ? (
                <TableRow><TableCell colSpan={isSuperadmin ? 6 : 5} className="text-center py-8 text-muted-foreground">No hay usuarios registrados</TableCell></TableRow>
              ) : (
                users.map((u: TransportUser) => (
                  <TableRow key={u.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium text-sm">{u.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {u.role}
                      </Badge>
                    </TableCell>
                    {isSuperadmin && (
                      <TableCell className="text-sm">
                        {u.role === "superadmin" ? (
                          <span className="text-muted-foreground italic">Sistema</span>
                        ) : (
                          (u.tenantId !== null && u.tenantId !== undefined ? tenantMap[u.tenantId] : null) || "Sin asignar"
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge variant={u.isActive ? "default" : "secondary"} className={u.isActive ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border-emerald-200" : ""}>
                        {u.isActive ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.role !== "superadmin" && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() => handleOpenEdit(u)}
                            title="Editar"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 ${u.isActive ? "text-emerald-600 hover:text-red-600" : "text-muted-foreground hover:text-emerald-600"}`}
                            onClick={() => handleToggleActive(u)}
                            title={u.isActive ? "Desactivar usuario" : "Activar usuario"}
                          >
                            {u.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Editar Usuario" : "Crear Nuevo Usuario"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre Completo *</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Correo Electrónico *</FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña {editingUser ? "(Opcional)" : "*"}</FormLabel>
                    <FormControl><Input type="password" placeholder={editingUser ? "Dejar en blanco para no cambiar" : ""} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rol *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccione un rol" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isSuperadmin && <SelectItem value="admin">Administrador</SelectItem>}
                        <SelectItem value="controlador">Controlador</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {isSuperadmin && (
                <FormField
                  control={form.control}
                  name="tenantId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Empresa *</FormLabel>
                      <Select 
                        onValueChange={(v) => field.onChange(v ? parseInt(v) : null)} 
                        value={field.value?.toString() || ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione empresa" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {tenants.map((t: Tenant) => (
                            <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {createMutation.isPending || updateMutation.isPending ? "Guardando..." : "Guardar Usuario"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
