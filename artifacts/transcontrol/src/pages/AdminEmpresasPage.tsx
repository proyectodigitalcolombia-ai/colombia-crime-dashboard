import { useState } from "react";
import {
  useListTenants,
  useCreateTenant,
  useUpdateTenant,
  type Tenant,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Edit2, ToggleLeft, ToggleRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Redirect } from "wouter";

const tenantSchema = z.object({
  name: z.string().min(2, "El nombre de la empresa es requerido"),
  nit: z.string().min(1, "El NIT es requerido"),
  contactName: z.string().optional(),
  contactEmail: z.string().email("Correo inválido").or(z.literal("")).optional(),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
});

export default function AdminEmpresasPage() {
  const { user } = useAuth();
  if (user?.role !== "superadmin") return <Redirect href="/despachos" />;

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  const { data: tenants = [], isLoading } = useListTenants({ query: { queryKey: ["transcontrol-tenants"] } });
  const createMutation = useCreateTenant();
  const updateMutation = useUpdateTenant();

  const form = useForm<z.infer<typeof tenantSchema>>({
    resolver: zodResolver(tenantSchema),
    defaultValues: { name: "", nit: "", contactName: "", contactEmail: "", contactPhone: "", address: "", city: "" },
  });

  const handleOpenCreate = () => {
    setEditingTenant(null);
    form.reset({ name: "", nit: "", contactName: "", contactEmail: "", contactPhone: "", address: "", city: "" });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    form.reset({
      name: tenant.name || "",
      nit: tenant.nit || "",
      contactName: tenant.contactName || "",
      contactEmail: tenant.contactEmail || "",
      contactPhone: tenant.contactPhone || "",
      address: tenant.address || "",
      city: tenant.city || "",
    });
    setIsModalOpen(true);
  };

  const onSubmit = (values: z.infer<typeof tenantSchema>) => {
    if (editingTenant) {
      updateMutation.mutate(
        { tenantId: editingTenant.id, data: values },
        {
          onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["transcontrol-tenants"] }); setIsModalOpen(false); toast({ title: "Empresa actualizada correctamente" }); },
          onError: () => toast({ title: "Error al actualizar la empresa", variant: "destructive" }),
        }
      );
    } else {
      createMutation.mutate(
        { data: values },
        {
          onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["transcontrol-tenants"] }); setIsModalOpen(false); toast({ title: "Empresa creada exitosamente" }); },
          onError: () => toast({ title: "Error al crear la empresa", variant: "destructive" }),
        }
      );
    }
  };

  const handleToggleActive = (t: Tenant) => {
    updateMutation.mutate(
      { tenantId: t.id, data: { isActive: !t.isActive } },
      {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["transcontrol-tenants"] }); toast({ title: t.isActive ? "Empresa desactivada" : "Empresa activada" }); },
        onError: () => toast({ title: "Error al cambiar el estado", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" /> Gestión de Empresas
        </h1>
        <Button onClick={handleOpenCreate}>
          <Plus className="mr-2 h-4 w-4" /> Nueva Empresa
        </Button>
      </div>

      <Card className="shadow-sm border-border/60">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="font-semibold">Empresa</TableHead>
                <TableHead className="font-semibold">NIT</TableHead>
                <TableHead className="font-semibold">Contacto</TableHead>
                <TableHead className="font-semibold">Ciudad</TableHead>
                <TableHead className="font-semibold">Estado</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Cargando empresas...</TableCell></TableRow>
              ) : tenants.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No hay empresas registradas</TableCell></TableRow>
              ) : (
                tenants.map((t: Tenant) => (
                  <TableRow key={t.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium text-sm">{t.name}</TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">{t.nit}</TableCell>
                    <TableCell>
                      <div className="flex flex-col text-sm">
                        <span>{t.contactName || "-"}</span>
                        <span className="text-xs text-muted-foreground">{t.contactEmail || "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{t.city || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={t.isActive ? "default" : "secondary"} className={t.isActive ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border-emerald-200" : ""}>
                        {t.isActive ? "Activa" : "Inactiva"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => handleOpenEdit(t)} title="Editar empresa">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className={`h-8 w-8 ${t.isActive ? "text-emerald-600 hover:text-red-600" : "text-muted-foreground hover:text-emerald-600"}`}
                          onClick={() => handleToggleActive(t)}
                          title={t.isActive ? "Desactivar empresa" : "Activar empresa"}
                        >
                          {t.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingTenant ? "Editar Empresa" : "Registrar Nueva Empresa"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem className="col-span-2"><FormLabel>Razón Social *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="nit" render={({ field }) => (
                  <FormItem><FormLabel>NIT *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="city" render={({ field }) => (
                  <FormItem><FormLabel>Ciudad</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="contactName" render={({ field }) => (
                  <FormItem className="col-span-2"><FormLabel>Nombre de Contacto</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="contactEmail" render={({ field }) => (
                  <FormItem><FormLabel>Correo de Contacto</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="contactPhone" render={({ field }) => (
                  <FormItem><FormLabel>Teléfono</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem className="col-span-2"><FormLabel>Dirección</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {createMutation.isPending || updateMutation.isPending ? "Guardando..." : "Guardar Empresa"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
