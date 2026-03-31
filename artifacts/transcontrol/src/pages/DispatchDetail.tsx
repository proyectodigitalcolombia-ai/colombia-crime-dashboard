import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetDispatch,
  useUpdateDispatch,
  useListCheckpoints,
  useUpdateCheckpoint,
  useCreateCheckpoint,
  useListObservations,
  useCreateObservation,
  type Checkpoint,
  type Observation,
  CreateObservationBodyObservationType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Clock, MapPin, Navigation, Truck, User, Building, Phone, CalendarDays, Edit, Plus } from "lucide-react";
import { format } from "date-fns";

const statusConfig = {
  a_tiempo: { label: "A tiempo", className: "bg-emerald-500 text-white" },
  demorado: { label: "Demorado", className: "bg-amber-500 text-white" },
  llegado: { label: "Llegado", className: "bg-blue-500 text-white" },
  salida: { label: "Salida", className: "bg-rose-500 text-white" },
};

const observationColors = {
  gestion_interna: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50",
  informacion_cliente: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50",
  recomendado_en: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50",
  otro: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700",
};

const observationLabels = {
  gestion_interna: "Gestión Interna",
  informacion_cliente: "Información a Cliente",
  recomendado_en: "Recomendado en",
  otro: "Otro",
};

export default function DispatchDetail() {
  const params = useParams();
  const dispatchId = Number(params.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeCheckpoint, setActiveCheckpoint] = useState<Checkpoint | null>(null);
  const [isNewCheckpointModal, setIsNewCheckpointModal] = useState(false);
  const [newCheckpointLocation, setNewCheckpointLocation] = useState("");
  const [realDate, setRealDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [realTime, setRealTime] = useState(format(new Date(), "HH:mm"));
  const [novelty, setNovelty] = useState("");

  const [obsType, setObsType] = useState<CreateObservationBodyObservationType>(CreateObservationBodyObservationType.gestion_interna);
  const [obsDetail, setObsDetail] = useState("");

  const { data: dispatch, isLoading: loadingDispatch } = useGetDispatch(dispatchId, {
    query: { queryKey: ["transcontrol-dispatch", dispatchId], enabled: !!dispatchId },
  });

  const { data: checkpoints = [], isLoading: loadingCheckpoints } = useListCheckpoints(dispatchId, {
    query: { queryKey: ["transcontrol-checkpoints", dispatchId], enabled: !!dispatchId },
  });

  const { data: observations = [], isLoading: loadingObservations } = useListObservations(dispatchId, {
    query: { queryKey: ["transcontrol-observations", dispatchId], enabled: !!dispatchId, refetchInterval: 30000 },
  });

  const updateDispatchMutation = useUpdateDispatch();
  const updateCheckpointMutation = useUpdateCheckpoint();
  const createCheckpointMutation = useCreateCheckpoint();
  const createObservationMutation = useCreateObservation();

  if (loadingDispatch) {
    return <div className="p-8 text-center text-muted-foreground">Cargando detalles del despacho...</div>;
  }

  if (!dispatch) {
    return <div className="p-8 text-center text-red-500 font-medium">Despacho no encontrado</div>;
  }

  const statusInfo = statusConfig[dispatch.status as keyof typeof statusConfig] || { label: dispatch.status, className: "bg-gray-500 text-white" };

  const handleUpdateStatus = (newStatus: string) => {
    updateDispatchMutation.mutate({ dispatchId, data: { status: newStatus } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["transcontrol-dispatch", dispatchId] });
        toast({ title: "Estado actualizado correctamente" });
      },
    });
  };

  const handleCreateCheckpoint = () => {
    if (!newCheckpointLocation) return;
    createCheckpointMutation.mutate({ dispatchId, data: { location: newCheckpointLocation } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["transcontrol-checkpoints", dispatchId] });
        setIsNewCheckpointModal(false);
        setNewCheckpointLocation("");
        toast({ title: "Punto de control creado" });
      },
    });
  };

  const handleUpdateCheckpoint = () => {
    if (!activeCheckpoint) return;
    updateCheckpointMutation.mutate(
      { dispatchId, checkpointId: activeCheckpoint.id, data: { realDate, realTime, novelty: novelty || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["transcontrol-checkpoints", dispatchId] });
          setActiveCheckpoint(null);
          toast({ title: "Punto de control actualizado" });
        },
        onError: () => toast({ title: "Error al actualizar el punto", variant: "destructive" }),
      }
    );
  };

  const handleCreateObservation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!obsDetail.trim()) return;
    createObservationMutation.mutate(
      { dispatchId, data: { observationType: obsType, detail: obsDetail.trim() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["transcontrol-observations", dispatchId] });
          setObsDetail("");
          toast({ title: "Observación registrada" });
        },
        onError: () => toast({ title: "Error al guardar la observación", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-10">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link href="/despachos">
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              Despacho {dispatch.consecutive}
              <Badge className={`${statusInfo.className} hover:${statusInfo.className} border-0 ml-2`}>
                {statusInfo.label}
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
              <Truck className="h-3.5 w-3.5" /> Placa: <span className="font-mono font-medium text-foreground">{dispatch.plate}</span>
              {dispatch.trailer && <span className="text-muted-foreground">| Trailer: <span className="font-mono font-medium text-foreground">{dispatch.trailer}</span></span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dispatch.status} onValueChange={handleUpdateStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Cambiar Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a_tiempo">A tiempo</SelectItem>
              <SelectItem value="demorado">Demorado</SelectItem>
              <SelectItem value="llegado">Llegado</SelectItem>
              <SelectItem value="salida">Salida</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6 lg:col-span-1">
          <Card className="shadow-sm">
            <CardHeader className="py-4 border-b bg-muted/10">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Navigation className="h-4 w-4 text-primary" /> Ruta y Tiempos
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Origen</Label>
                  <div className="font-medium text-sm mt-0.5">{dispatch.origin}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Destino</Label>
                  <div className="font-medium text-sm mt-0.5">{dispatch.destination}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Salida</Label>
                  <div className="font-medium text-sm mt-0.5 flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    {dispatch.departureDate || "-"} {dispatch.departureTime || ""}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Vía</Label>
                  <div className="font-medium text-sm mt-0.5">{dispatch.via || "-"}</div>
                </div>
              </div>
              {(dispatch.restrictionStart || dispatch.restrictionEnd) && (
                <div className="pt-2 border-t border-border/50">
                  <Label className="text-xs text-muted-foreground uppercase">Horario de Restricción</Label>
                  <div className="font-medium text-sm mt-0.5 flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Clock className="h-3.5 w-3.5" />
                    {dispatch.restrictionStart || "?"} – {dispatch.restrictionEnd || "?"}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="py-4 border-b bg-muted/10">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4 text-primary" /> Conductor y Vehículo
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Nombre</Label>
                  <div className="font-medium text-sm mt-0.5">{dispatch.driver || "-"}</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase">Cédula</Label>
                    <div className="font-medium text-sm mt-0.5">{dispatch.driverCc || "-"}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase">Teléfono</Label>
                    <div className="font-medium text-sm mt-0.5 flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      {dispatch.driverPhone || "-"}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase">Marca / Color</Label>
                    <div className="font-medium text-sm mt-0.5">{dispatch.brand || "-"} / {dispatch.color || "-"}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase">Modelo</Label>
                    <div className="font-medium text-sm mt-0.5">{dispatch.model || "-"}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="py-4 border-b bg-muted/10">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building className="h-4 w-4 text-primary" /> Clientes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Generador de Carga</Label>
                <div className="font-medium text-sm mt-0.5">{dispatch.generator || "-"}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Transportadora</Label>
                <div className="font-medium text-sm mt-0.5">{dispatch.transportCompany || "-"}</div>
              </div>
              {dispatch.insurer && (
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Aseguradora</Label>
                  <div className="font-medium text-sm mt-0.5">{dispatch.insurer}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card className="shadow-sm overflow-hidden flex flex-col h-[500px]">
            <CardHeader className="py-4 border-b bg-muted/10 shrink-0 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" /> Puntos de Control en Ruta
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setIsNewCheckpointModal(true)} className="h-8 text-xs">
                <Plus className="h-3 w-3 mr-1" /> Nuevo Punto
              </Button>
            </CardHeader>
            <div className="overflow-auto flex-1 p-0">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
                  <TableRow>
                    <TableHead className="w-[32px] text-center">#</TableHead>
                    <TableHead className="min-w-[120px]">Ubicación</TableHead>
                    <TableHead className="w-[100px] text-xs">Planeado</TableHead>
                    <TableHead className="w-[100px] text-xs">Ajustado</TableHead>
                    <TableHead className="w-[100px] text-xs">Real</TableHead>
                    <TableHead className="w-[70px] text-xs text-right">Km</TableHead>
                    <TableHead className="w-[60px] text-xs text-right">Horas</TableHead>
                    <TableHead className="w-[70px] text-xs text-right">Vel.</TableHead>
                    <TableHead className="min-w-[100px] text-xs">Novedad</TableHead>
                    <TableHead className="w-[44px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingCheckpoints ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8">Cargando...</TableCell></TableRow>
                  ) : checkpoints.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No hay puntos de control definidos</TableCell></TableRow>
                  ) : (
                    checkpoints.map((cp: Checkpoint) => {
                      const isCompleted = !!cp.realDate;
                      return (
                        <TableRow key={cp.id} className={isCompleted ? "bg-emerald-500/5" : ""}>
                          <TableCell className="text-center text-xs font-medium text-muted-foreground">{cp.order}</TableCell>
                          <TableCell className="font-medium text-xs">{cp.location}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            <div className="flex flex-col"><span>{cp.plannedDate || "-"}</span><span>{cp.plannedTime || ""}</span></div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {cp.adjustedDate ? (
                              <div className="flex flex-col text-blue-600 dark:text-blue-400"><span>{cp.adjustedDate}</span><span>{cp.adjustedTime || ""}</span></div>
                            ) : <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell className="text-xs">
                            {isCompleted ? (
                              <div className="flex flex-col font-semibold text-emerald-600 dark:text-emerald-400"><span>{cp.realDate}</span><span>{cp.realTime}</span></div>
                            ) : <span className="text-muted-foreground italic text-[11px]">Pendiente</span>}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">{cp.distanceKm != null ? cp.distanceKm.toFixed(0) : "-"}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{cp.timeHours != null ? cp.timeHours.toFixed(1) : "-"}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{cp.speedKmh != null ? `${cp.speedKmh.toFixed(0)}` : "-"}</TableCell>
                          <TableCell className="text-xs max-w-[120px] truncate" title={cp.novelty || ""}>{cp.novelty || "-"}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                              setActiveCheckpoint(cp);
                              setRealDate(cp.realDate || format(new Date(), "yyyy-MM-dd"));
                              setRealTime(cp.realTime || format(new Date(), "HH:mm"));
                              setNovelty(cp.novelty || "");
                            }}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="py-4 border-b bg-muted/10">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> Bitácora de Observaciones
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex flex-col md:flex-row h-[400px]">
              <div className="flex-1 border-r border-border overflow-y-auto p-4 space-y-4">
                {loadingObservations ? (
                  <div className="text-center text-sm text-muted-foreground py-4">Cargando...</div>
                ) : observations.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">No hay observaciones registradas</div>
                ) : (
                  observations.map((obs: Observation) => {
                    const colorClass = observationColors[obs.observationType as keyof typeof observationColors] || observationColors.otro;
                    const label = observationLabels[obs.observationType as keyof typeof observationLabels] || "Otro";
                    return (
                      <div key={obs.id} className="text-sm space-y-1 pb-4 border-b border-border/50 last:border-0 last:pb-0">
                        <div className="flex justify-between items-start gap-2">
                          <Badge variant="outline" className={`${colorClass} text-[10px] uppercase font-semibold tracking-wider`}>
                            {label}
                          </Badge>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {format(new Date(obs.createdAt), "dd/MM/yy HH:mm")}
                          </span>
                        </div>
                        <p className="mt-1.5 font-medium leading-snug">{obs.detail}</p>
                        <p className="text-xs text-muted-foreground font-medium">Por: {obs.createdByName}</p>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="w-full md:w-[320px] shrink-0 p-4 bg-muted/5 flex flex-col">
                <h3 className="text-sm font-semibold mb-3">Nueva Observación</h3>
                <form onSubmit={handleCreateObservation} className="flex flex-col h-full gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tipo</Label>
                    <Select value={obsType} onValueChange={(v) => setObsType(v as CreateObservationBodyObservationType)}>
                      <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gestion_interna">Gestión Interna</SelectItem>
                        <SelectItem value="informacion_cliente">Información a Cliente</SelectItem>
                        <SelectItem value="recomendado_en">Recomendado en</SelectItem>
                        <SelectItem value="otro">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 flex-1 flex flex-col">
                    <Label className="text-xs">Detalle</Label>
                    <Textarea
                      className="flex-1 resize-none bg-background min-h-[120px]"
                      placeholder="Escriba el detalle de la observación..."
                      value={obsDetail}
                      onChange={(e) => setObsDetail(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={createObservationMutation.isPending || !obsDetail.trim()}>
                    {createObservationMutation.isPending ? "Guardando..." : "Registrar Observación"}
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isNewCheckpointModal} onOpenChange={setIsNewCheckpointModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>Nuevo Punto de Control</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="location">Ubicación</Label>
              <Input id="location" placeholder="Nombre del lugar..." value={newCheckpointLocation} onChange={(e) => setNewCheckpointLocation(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewCheckpointModal(false)}>Cancelar</Button>
            <Button onClick={handleCreateCheckpoint} disabled={createCheckpointMutation.isPending || !newCheckpointLocation}>Crear Punto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!activeCheckpoint} onOpenChange={(open) => !open && setActiveCheckpoint(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>Registrar Paso por {activeCheckpoint?.location}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="realDate">Fecha Real</Label>
                <Input id="realDate" type="date" value={realDate} onChange={(e) => setRealDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="realTime">Hora Real</Label>
                <Input id="realTime" type="time" value={realTime} onChange={(e) => setRealTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="novelty">Novedad (Opcional)</Label>
              <Input id="novelty" placeholder="Ej: Retén en la vía, lluvia fuerte..." value={novelty} onChange={(e) => setNovelty(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveCheckpoint(null)}>Cancelar</Button>
            <Button onClick={handleUpdateCheckpoint} disabled={updateCheckpointMutation.isPending}>
              {updateCheckpointMutation.isPending ? "Guardando..." : "Guardar Registro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
