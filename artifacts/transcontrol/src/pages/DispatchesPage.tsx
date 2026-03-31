import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  useListDispatches,
  useGetDispatchSummary,
  useCreateDispatch,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Download, Search, Eye, FilterX, Plus, Truck, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { format } from "date-fns";

const statusConfig = {
  a_tiempo: { label: "A tiempo", className: "bg-emerald-500 hover:bg-emerald-600 text-white" },
  demorado: { label: "Demorado", className: "bg-amber-500 hover:bg-amber-600 text-white" },
  llegado: { label: "Llegado", className: "bg-blue-500 hover:bg-blue-600 text-white" },
  salida: { label: "Salida", className: "bg-rose-500 hover:bg-rose-600 text-white" },
};

const dispatchSchema = z.object({
  plate: z.string().min(1, "Placa es requerida"),
  origin: z.string().min(1, "Origen es requerido"),
  destination: z.string().min(1, "Destino es requerido"),
  generator: z.string().optional(),
  driver: z.string().optional(),
  driverPhone: z.string().optional(),
  consecutive: z.string().optional(),
  status: z.enum(["a_tiempo", "demorado", "llegado", "salida"]),
});

export default function DispatchesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filters, setFilters] = useState({ plate: "", origin: "", destination: "", generator: "", status: "all" });
  const [activeFilters, setActiveFilters] = useState({ plate: "", origin: "", destination: "", generator: "", status: "all" });
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  const { data: summary } = useGetDispatchSummary({ query: { queryKey: ["transcontrol-dispatches-summary"] } });

  const queryParams = useMemo(() => {
    const params: { page: number; pageSize: number; plate?: string; origin?: string; destination?: string; generator?: string; status?: string } = { page: currentPage, pageSize: PAGE_SIZE };
    if (activeFilters.plate) params.plate = activeFilters.plate;
    if (activeFilters.origin) params.origin = activeFilters.origin;
    if (activeFilters.destination) params.destination = activeFilters.destination;
    if (activeFilters.generator) params.generator = activeFilters.generator;
    if (activeFilters.status !== "all") params.status = activeFilters.status;
    return params;
  }, [activeFilters, currentPage]);

  const { data: dispatchesResponse, isLoading } = useListDispatches(queryParams, {
    query: { queryKey: ["transcontrol-dispatches", queryParams] },
  });

  const dispatches = dispatchesResponse?.data || [];
  const createDispatchMutation = useCreateDispatch();

  const form = useForm<z.infer<typeof dispatchSchema>>({
    resolver: zodResolver(dispatchSchema),
    defaultValues: { plate: "", origin: "", destination: "", generator: "", driver: "", driverPhone: "", consecutive: "", status: "a_tiempo" },
  });

  const handleSearch = () => { setCurrentPage(1); setActiveFilters({ ...filters }); };
  const handleClearFilters = () => {
    const empty = { plate: "", origin: "", destination: "", generator: "", status: "all" };
    setFilters(empty); setActiveFilters(empty); setCurrentPage(1);
  };

  const handleExport = () => {
    if (!dispatches.length) return;
    const exportData = dispatches.map(d => ({
      "Consecutivo": d.consecutive || "-",
      "Manifiesto": d.manifest || "-",
      "Placa": d.plate,
      "Conductor": d.driver || "-",
      "Teléfono": d.driverPhone || "-",
      "Origen": d.origin,
      "Destino": d.destination,
      "Vía": d.via || "-",
      "Generador": d.generator || "-",
      "Transportadora": d.transportCompany || "-",
      "Estado": statusConfig[d.status as keyof typeof statusConfig]?.label || d.status,
      "Fecha Salida": d.departureDate || "-",
      "Hora Salida": d.departureTime || "-",
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Despachos");
    XLSX.writeFile(wb, `TransControl_Despachos_${format(new Date(), "yyyyMMdd")}.xlsx`);
  };

  const onCreateDispatch = (values: z.infer<typeof dispatchSchema>) => {
    createDispatchMutation.mutate({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["transcontrol-dispatches"] });
        queryClient.invalidateQueries({ queryKey: ["transcontrol-dispatches-summary"] });
        setIsModalOpen(false);
        form.reset();
        toast({ title: "Despacho creado exitosamente" });
      },
      onError: () => toast({ title: "Error al crear el despacho", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Monitoreo de Despachos</h1>
        <div className="flex gap-2">
          {user?.role !== "superadmin" && (
            <Button onClick={() => setIsModalOpen(true)} variant="default" size="sm" className="h-9">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Despacho
            </Button>
          )}
          <Button onClick={handleExport} variant="outline" size="sm" className="h-9">
            <Download className="mr-2 h-4 w-4" />
            Exportar Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5" /> Total Activos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">{summary?.total || 0}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-l-4 border-l-emerald-500">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> A Tiempo
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-emerald-600">{summary?.aTime || 0}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-l-4 border-l-amber-500">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Demorados
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-amber-600">{summary?.demorado || 0}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-l-4 border-l-blue-500">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-blue-500" /> Llegados
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-blue-600">{summary?.llegado || 0}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-l-4 border-l-rose-500">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-rose-500" /> Salida
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-rose-600">{summary?.salida || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border/60">
        <CardHeader className="p-4 border-b bg-muted/20">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
            <Input placeholder="Placa..." value={filters.plate} onChange={(e) => setFilters({ ...filters, plate: e.target.value })} className="h-9" />
            <Input placeholder="Origen..." value={filters.origin} onChange={(e) => setFilters({ ...filters, origin: e.target.value })} className="h-9" />
            <Input placeholder="Destino..." value={filters.destination} onChange={(e) => setFilters({ ...filters, destination: e.target.value })} className="h-9" />
            <Input placeholder="Generador..." value={filters.generator} onChange={(e) => setFilters({ ...filters, generator: e.target.value })} className="h-9" />
            <Select value={filters.status} onValueChange={(val) => setFilters({ ...filters, status: val })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="a_tiempo">A tiempo</SelectItem>
                <SelectItem value="demorado">Demorado</SelectItem>
                <SelectItem value="llegado">Llegado</SelectItem>
                <SelectItem value="salida">Salida</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button onClick={handleSearch} className="h-9 flex-1">
                <Search className="h-4 w-4 mr-2" /> Buscar
              </Button>
              <Button onClick={handleClearFilters} variant="outline" size="icon" className="h-9 w-9 shrink-0">
                <FilterX className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-[90px] font-semibold">Consec.</TableHead>
                <TableHead className="w-[100px] font-semibold">Placa</TableHead>
                <TableHead className="font-semibold">Conductor</TableHead>
                <TableHead className="font-semibold">Ruta</TableHead>
                <TableHead className="font-semibold">Generador</TableHead>
                <TableHead className="font-semibold">Salida</TableHead>
                <TableHead className="w-[120px] font-semibold">Estado</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Cargando despachos...</TableCell></TableRow>
              ) : dispatches.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No se encontraron despachos con los filtros actuales.</TableCell></TableRow>
              ) : (
                dispatches.map((dispatch) => {
                  const statusInfo = statusConfig[dispatch.status as keyof typeof statusConfig] || { label: dispatch.status, className: "bg-gray-500 text-white" };
                  return (
                    <TableRow key={dispatch.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-muted-foreground">{dispatch.consecutive || "-"}</TableCell>
                      <TableCell className="font-mono font-medium">{dispatch.plate}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{dispatch.driver || "-"}</span>
                          <span className="text-xs text-muted-foreground">{dispatch.driverPhone || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <span className="truncate max-w-[110px]" title={dispatch.origin}>{dispatch.origin}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="truncate max-w-[110px]" title={dispatch.destination}>{dispatch.destination}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm truncate max-w-[140px]">{dispatch.generator || "-"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col text-sm">
                          <span>{dispatch.departureDate || "-"}</span>
                          <span className="text-xs text-muted-foreground">{dispatch.departureTime || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`${statusInfo.className} border-0 shadow-sm font-semibold`}>
                          {statusInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link href={`/despachos/${dispatch.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10 hover:text-primary">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <div className="p-4 border-t text-xs text-muted-foreground flex justify-between items-center gap-4">
          <span>
            {dispatchesResponse?.total
              ? `Mostrando ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, dispatchesResponse.total)} de ${dispatchesResponse.total} registros`
              : "Sin resultados"}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>
              Anterior
            </Button>
            <span className="text-xs font-medium">Pág. {currentPage} / {Math.max(1, Math.ceil((dispatchesResponse?.total ?? 0) / PAGE_SIZE))}</span>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={currentPage >= Math.ceil((dispatchesResponse?.total ?? 0) / PAGE_SIZE)} onClick={() => setCurrentPage(p => p + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Crear Nuevo Despacho</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onCreateDispatch)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="consecutive" render={({ field }) => (
                  <FormItem><FormLabel>Consecutivo</FormLabel><FormControl><Input placeholder="Ej: 34507973" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="plate" render={({ field }) => (
                  <FormItem><FormLabel>Placa *</FormLabel><FormControl><Input placeholder="Ej: WFL190" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="origin" render={({ field }) => (
                  <FormItem><FormLabel>Origen *</FormLabel><FormControl><Input placeholder="Ciudad de origen" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="destination" render={({ field }) => (
                  <FormItem><FormLabel>Destino *</FormLabel><FormControl><Input placeholder="Ciudad de destino" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="driver" render={({ field }) => (
                  <FormItem><FormLabel>Conductor</FormLabel><FormControl><Input placeholder="Nombre completo" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="driverPhone" render={({ field }) => (
                  <FormItem><FormLabel>Teléfono Conductor</FormLabel><FormControl><Input placeholder="Ej: 3001234567" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="generator" render={({ field }) => (
                  <FormItem className="col-span-2"><FormLabel>Generador de Carga</FormLabel><FormControl><Input placeholder="Empresa generadora" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="a_tiempo">A tiempo</SelectItem>
                      <SelectItem value="demorado">Demorado</SelectItem>
                      <SelectItem value="llegado">Llegado</SelectItem>
                      <SelectItem value="salida">Salida</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createDispatchMutation.isPending}>
                  {createDispatchMutation.isPending ? "Guardando..." : "Crear Despacho"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
