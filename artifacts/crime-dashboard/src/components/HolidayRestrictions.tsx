import { useMemo, useState, useEffect } from "react";
import { useAuth, apiFetch } from "@/context/AuthContext";
import { RefreshCw, Download, Eye, Building2, ChevronDown } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/* ───────── PALETTE ───────── */
const E = {
  cyan:   "#00d4ff",
  amber:  "#f59e0b",
  green:  "#10b981",
  red:    "#ef4444",
  purple: "#a855f7",
  bg:     "#070c15",
  panel:  "#0c1220",
  border: "rgba(255,255,255,0.07)",
  dim:    "rgba(255,255,255,0.45)",
};

/* ───────── TYPES ───────── */
interface HorarioRow {
  dia: string;
  fecha: string;
  festivo?: boolean;
  horario: string;
  aplicacion: string;
  noAplica?: boolean;
}

interface Puente {
  id: string;
  nombre: string;
  inicio: Date;
  fin: Date;
  fuente: "oficial" | "estimado";
  horarios: HorarioRow[];
  nota?: string;
}

/* ────────────────────────────────────────────────────────────────
   DATOS OFICIALES — Boletín MinTransporte 19 marzo 2026
   Fuente: mintransporte.gov.co/publicaciones/12311/
   Aplica a: vehículos ≥ 3.4 toneladas (3.400 kg)
   ──────────────────────────────────────────────────────────────── */
const PUENTES: Puente[] = [
  /* ══ YA PASADOS ══ */
  {
    id: "reyes-2026",
    nombre: "Reyes Magos",
    inicio: new Date("2026-01-09T15:00:00"),
    fin:    new Date("2026-01-13T23:00:00"),
    fuente: "estimado",
    horarios: [
      { dia:"VIERNES",   fecha:"9 ene 2026",  horario:"15:00–22:00", aplicacion:"Cundinamarca (éxodo Bogotá) + Bogotá–Ibagué (ambos sentidos)" },
      { dia:"SÁBADO",    fecha:"10 ene 2026", horario:"06:00–15:00", aplicacion:"Todas las vías (ambos sentidos) excl. Rumichaca–Popayán · Medellín–Caño Alegre: 12:00–19:00" },
      { dia:"DOMINGO",   fecha:"11 ene 2026", horario:"15:00–23:00", aplicacion:"Solo retorno Ibagué–Melgar–Fusagasugá–Bogotá" },
      { dia:"LUNES (F)", fecha:"12 ene 2026", festivo:true, horario:"10:00–23:00", aplicacion:"Todas las vías (ambos sentidos) · Bogotá–Villavicencio sin excepción · Bogotá–Ibagué: 08:00–01:00" },
    ],
  },
  {
    id: "san-jose-2026",
    nombre: "Día de San José",
    inicio: new Date("2026-03-20T15:00:00"),
    fin:    new Date("2026-03-23T23:00:00"),
    fuente: "oficial",
    horarios: [
      { dia:"VIERNES",   fecha:"20 mar 2026", horario:"15:00–22:00", aplicacion:"Cundinamarca (éxodo Bogotá) + Bogotá–Fusagasugá–Melgar–Ibagué e Ibagué–Calarcá–La Paila (ambos sentidos)" },
      { dia:"SÁBADO",    fecha:"21 mar 2026", horario:"06:00–15:00", aplicacion:"Todas las vías (ambos sentidos) excl. Rumichaca–Popayán · Medellín–Caño Alegre: 12:00–19:00" },
      { dia:"DOMINGO",   fecha:"22 mar 2026", horario:"15:00–23:00", aplicacion:"Solo retorno: Ibagué–Melgar–Fusagasugá–Soacha–Bogotá" },
      { dia:"LUNES (F)", fecha:"23 mar 2026", festivo:true, horario:"10:00–23:00", aplicacion:"Todas las vías (ambos sentidos) · Bogotá–Villavicencio sin excepción · Bogotá–Ibagué: 08:00–01:00 del martes" },
    ],
  },
  {
    id: "semana-santa-2026",
    nombre: "Semana Santa",
    inicio: new Date("2026-03-27T15:00:00"),
    fin:    new Date("2026-04-05T23:00:00"),
    fuente: "oficial",
    nota: "Dom 29, Lun 30, Mar 31 mar y Vie 3 abr: NO APLICA restricción a nivel nacional",
    horarios: [
      { dia:"VIERNES",   fecha:"27 mar 2026", horario:"15:00–22:00", aplicacion:"Cundinamarca éxodo + Bogotá–Ibagué (ambos sentidos) + Popayán–Pasto–Rumichaca (ambos sentidos)" },
      { dia:"SÁBADO",    fecha:"28 mar 2026", horario:"06:00–15:00", aplicacion:"Todas las vías (ambos sentidos) · Medellín–Caño Alegre: 12:00–19:00" },
      { dia:"DOMINGO",   fecha:"29 mar 2026", horario:"NO APLICA",   aplicacion:"Sin restricción nacional — garantía de abastecimiento", noAplica:true },
      { dia:"LUNES",     fecha:"30 mar 2026", horario:"NO APLICA",   aplicacion:"Sin restricción nacional", noAplica:true },
      { dia:"MARTES",    fecha:"31 mar 2026", horario:"NO APLICA",   aplicacion:"Sin restricción nacional", noAplica:true },
      { dia:"MIÉRCOLES", fecha:"1 abr 2026",  horario:"12:00–23:00", aplicacion:"Cundinamarca éxodo + Bogotá–Ibagué + Popayán–Pasto–Rumichaca (ambos sentidos)" },
      { dia:"JUE (F)",   fecha:"2 abr 2026",  festivo:true, horario:"06:00–15:00", aplicacion:"Todas las vías (ambos sentidos) · Bogotá–Ibagué: 06:00–18:00" },
      { dia:"VIE (F)",   fecha:"3 abr 2026",  festivo:true, horario:"NO APLICA",   aplicacion:"Sin restricción nacional — Viernes Santo", noAplica:true },
      { dia:"SÁBADO",    fecha:"4 abr 2026",  horario:"14:00–23:00", aplicacion:"Solo: Bogotá–Fusagasugá–Melgar–Ibagué" },
      { dia:"DOMINGO",   fecha:"5 abr 2026",  horario:"10:00–23:00", aplicacion:"Todas las vías (ambos sentidos) · Bogotá–Villavicencio sin excepción · Bogotá–Ibagué: 08:00–01:00 del lunes" },
    ],
  },
  /* ══ PRÓXIMOS — DATOS OFICIALES ══ */
  {
    id: "trabajo-2026",
    nombre: "Día del Trabajo",
    inicio: new Date("2026-04-30T15:00:00"),
    fin:    new Date("2026-05-03T23:00:00"),
    fuente: "oficial",
    horarios: [
      { dia:"JUEVES",    fecha:"30 abr 2026", horario:"15:00–22:00", aplicacion:"Cundinamarca éxodo desde Bogotá + Bogotá–Ibagué (ambos sentidos)" },
      { dia:"VIE (F)",   fecha:"1 may 2026",  festivo:true, horario:"06:00–15:00", aplicacion:"Todas las vías (ambos sentidos) excl. Rumichaca–Popayán · Medellín–Caño Alegre: 12:00–19:00" },
      { dia:"SÁBADO",    fecha:"2 may 2026",  horario:"15:00–23:00", aplicacion:"Solo retorno: Ibagué–Melgar–Fusagasugá–Soacha–Bogotá" },
      { dia:"DOMINGO",   fecha:"3 may 2026",  horario:"10:00–23:00", aplicacion:"Todas las vías (ambos sentidos) · Bogotá–Villavicencio sin excepción · Bogotá–Ibagué: 08:00–01:00 del lunes" },
    ],
  },
  {
    id: "ascension-2026",
    nombre: "Día de la Ascensión",
    inicio: new Date("2026-05-15T15:00:00"),
    fin:    new Date("2026-05-18T23:00:00"),
    fuente: "oficial",
    horarios: [
      { dia:"VIERNES",   fecha:"15 may 2026", horario:"15:00–22:00", aplicacion:"Cundinamarca éxodo + Bogotá–Fusagasugá–Melgar–Ibagué e Ibagué–Calarcá–La Paila (ambos sentidos)" },
      { dia:"SÁBADO",    fecha:"16 may 2026", horario:"06:00–15:00", aplicacion:"Todas las vías (ambos sentidos) excl. Rumichaca–Popayán · Medellín–Caño Alegre: 12:00–19:00" },
      { dia:"DOMINGO",   fecha:"17 may 2026", horario:"15:00–23:00", aplicacion:"Solo retorno: Ibagué–Melgar–Fusagasugá–Soacha–Bogotá" },
      { dia:"LUNES (F)", fecha:"18 may 2026", festivo:true, horario:"10:00–23:00", aplicacion:"Todas las vías (ambos sentidos) · Bogotá–Villavicencio sin excepción · Bogotá–Ibagué: 08:00–01:00 del martes" },
    ],
  },
  {
    id: "corpus-2026",
    nombre: "Corpus Christi",
    inicio: new Date("2026-06-05T15:00:00"),
    fin:    new Date("2026-06-08T23:00:00"),
    fuente: "oficial",
    horarios: [
      { dia:"VIERNES",   fecha:"5 jun 2026",  horario:"15:00–22:00", aplicacion:"Cundinamarca éxodo + Bogotá–Ibagué (ambos sentidos)" },
      { dia:"SÁBADO",    fecha:"6 jun 2026",  horario:"06:00–15:00", aplicacion:"Todas las vías (ambos sentidos) excl. Rumichaca–Popayán · Medellín–Caño Alegre: 12:00–19:00" },
      { dia:"DOMINGO",   fecha:"7 jun 2026",  horario:"15:00–23:00", aplicacion:"Solo retorno: Ibagué–Melgar–Fusagasugá–Soacha–Bogotá" },
      { dia:"LUNES (F)", fecha:"8 jun 2026",  festivo:true, horario:"10:00–23:00", aplicacion:"Todas las vías (ambos sentidos) · Bogotá–Villavicencio sin excepción · Bogotá–Ibagué: 08:00–01:00 del martes" },
    ],
  },
  {
    id: "sagrado-2026",
    nombre: "Sagrado Corazón de Jesús",
    inicio: new Date("2026-06-12T15:00:00"),
    fin:    new Date("2026-06-15T23:00:00"),
    fuente: "oficial",
    horarios: [
      { dia:"VIERNES",   fecha:"12 jun 2026", horario:"15:00–22:00", aplicacion:"Cundinamarca éxodo + Bogotá–Ibagué (ambos sentidos)" },
      { dia:"SÁBADO",    fecha:"13 jun 2026", horario:"06:00–15:00", aplicacion:"Todas las vías (ambos sentidos) excl. Rumichaca–Popayán · Medellín–Caño Alegre: 12:00–19:00" },
      { dia:"DOMINGO",   fecha:"14 jun 2026", horario:"15:00–23:00", aplicacion:"Solo retorno: Ibagué–Melgar–Fusagasugá–Soacha–Bogotá" },
      { dia:"LUNES (F)", fecha:"15 jun 2026", festivo:true, horario:"10:00–23:00", aplicacion:"Todas las vías (ambos sentidos) · Bogotá–Villavicencio sin excepción · Bogotá–Ibagué: 08:00–01:00 del martes" },
    ],
  },
  {
    id: "san-pedro-2026",
    nombre: "San Pedro y San Pablo",
    inicio: new Date("2026-06-26T14:00:00"),
    fin:    new Date("2026-06-29T23:00:00"),
    fuente: "oficial",
    nota: "Viernes inicia a las 14:00 (no 15:00). Sábado Bogotá–Ibagué amplía hasta las 18:00.",
    horarios: [
      { dia:"VIERNES",   fecha:"26 jun 2026", horario:"14:00–22:00", aplicacion:"Cundinamarca éxodo + Bogotá–Ibagué (ambos sentidos)" },
      { dia:"SÁBADO",    fecha:"27 jun 2026", horario:"06:00–15:00", aplicacion:"Todas las vías excl. Rumichaca–Popayán · Bogotá–Ibagué: 06:00–18:00 · Medellín–Caño Alegre: 12:00–19:00" },
      { dia:"DOMINGO",   fecha:"28 jun 2026", horario:"15:00–23:00", aplicacion:"Solo retorno: Ibagué–Melgar–Fusagasugá–Soacha–Bogotá" },
      { dia:"LUNES (F)", fecha:"29 jun 2026", festivo:true, horario:"10:00–23:00", aplicacion:"Todas las vías (ambos sentidos) · Bogotá–Villavicencio: 10:00–01:00 del martes · Bogotá–Ibagué: 08:00–01:00 del martes" },
    ],
  },
  {
    id: "independencia-2026",
    nombre: "Independencia de Colombia",
    inicio: new Date("2026-07-17T15:00:00"),
    fin:    new Date("2026-07-20T23:00:00"),
    fuente: "oficial",
    horarios: [
      { dia:"VIERNES",   fecha:"17 jul 2026", horario:"15:00–22:00", aplicacion:"Cundinamarca éxodo + Bogotá–Ibagué (ambos sentidos)" },
      { dia:"SÁBADO",    fecha:"18 jul 2026", horario:"06:00–15:00", aplicacion:"Todas las vías excl. Rumichaca–Popayán · Medellín–Caño Alegre: 12:00–19:00" },
      { dia:"DOMINGO",   fecha:"19 jul 2026", horario:"15:00–23:00", aplicacion:"Solo retorno: Ibagué–Melgar–Fusagasugá–Soacha–Bogotá" },
      { dia:"LUNES (F)", fecha:"20 jul 2026", festivo:true, horario:"10:00–23:00", aplicacion:"Todas las vías (ambos sentidos) · Bogotá–Villavicencio sin excepción · Bogotá–Ibagué: 08:00–01:00 del martes" },
    ],
  },
  /* ══ SEGUNDO SEMESTRE — Estimado (patrón histórico, pendiente boletín oficial) ══ */
  {
    id: "boyaca-2026",
    nombre: "Batalla de Boyacá",
    inicio: new Date("2026-08-06T15:00:00"),
    fin:    new Date("2026-08-09T23:00:00"),
    fuente: "estimado",
    nota: "Festivo en viernes. Horarios estimados con base en patrón histórico MinTransporte.",
    horarios: [
      { dia:"JUEVES",    fecha:"6 ago 2026",  horario:"15:00–22:00", aplicacion:"Cundinamarca éxodo + Bogotá–Ibagué (ambos sentidos)" },
      { dia:"VIE (F)",   fecha:"7 ago 2026",  festivo:true, horario:"06:00–15:00", aplicacion:"Todas las vías (ambos sentidos) excl. Rumichaca–Popayán · Medellín–Caño Alegre: 12:00–19:00" },
      { dia:"SÁBADO",    fecha:"8 ago 2026",  horario:"15:00–23:00", aplicacion:"Solo retorno: Ibagué–Bogotá" },
      { dia:"DOMINGO",   fecha:"9 ago 2026",  horario:"10:00–23:00", aplicacion:"Todas las vías (ambos sentidos) · Bogotá–Villavicencio sin excepción" },
    ],
  },
  {
    id: "asuncion-2026",
    nombre: "Asunción de la Virgen",
    inicio: new Date("2026-08-14T15:00:00"),
    fin:    new Date("2026-08-17T23:00:00"),
    fuente: "estimado",
    nota: "Horarios estimados — pendiente boletín oficial segundo semestre MinTransporte.",
    horarios: [
      { dia:"VIERNES",   fecha:"14 ago 2026", horario:"15:00–22:00", aplicacion:"Cundinamarca éxodo + Bogotá–Ibagué (ambos sentidos)" },
      { dia:"SÁBADO",    fecha:"15 ago 2026", horario:"06:00–15:00", aplicacion:"Todas las vías (ambos sentidos) · Medellín–Caño Alegre: 12:00–19:00" },
      { dia:"DOMINGO",   fecha:"16 ago 2026", horario:"15:00–23:00", aplicacion:"Solo retorno: Ibagué–Bogotá" },
      { dia:"LUNES (F)", fecha:"17 ago 2026", festivo:true, horario:"10:00–23:00", aplicacion:"Todas las vías (ambos sentidos) · Bogotá–Villavicencio sin excepción" },
    ],
  },
  {
    id: "raza-2026",
    nombre: "Día de la Raza",
    inicio: new Date("2026-10-09T15:00:00"),
    fin:    new Date("2026-10-12T23:00:00"),
    fuente: "estimado",
    nota: "Horarios estimados — pendiente boletín oficial.",
    horarios: [
      { dia:"VIERNES",   fecha:"9 oct 2026",  horario:"15:00–22:00", aplicacion:"Cundinamarca éxodo + Bogotá–Ibagué (ambos sentidos)" },
      { dia:"SÁBADO",    fecha:"10 oct 2026", horario:"06:00–15:00", aplicacion:"Todas las vías (ambos sentidos) · Medellín–Caño Alegre: 12:00–19:00" },
      { dia:"DOMINGO",   fecha:"11 oct 2026", horario:"15:00–23:00", aplicacion:"Solo retorno: Ibagué–Bogotá" },
      { dia:"LUNES (F)", fecha:"12 oct 2026", festivo:true, horario:"10:00–23:00", aplicacion:"Todas las vías (ambos sentidos) · Bogotá–Villavicencio sin excepción" },
    ],
  },
  {
    id: "santos-2026",
    nombre: "Todos los Santos",
    inicio: new Date("2026-10-30T15:00:00"),
    fin:    new Date("2026-11-02T23:00:00"),
    fuente: "estimado",
    nota: "Horarios estimados — pendiente boletín oficial.",
    horarios: [
      { dia:"VIERNES",   fecha:"30 oct 2026", horario:"15:00–22:00", aplicacion:"Cundinamarca éxodo + Bogotá–Ibagué (ambos sentidos)" },
      { dia:"SÁBADO",    fecha:"31 oct 2026", horario:"06:00–15:00", aplicacion:"Todas las vías (ambos sentidos) · Medellín–Caño Alegre: 12:00–19:00" },
      { dia:"DOMINGO",   fecha:"1 nov 2026",  horario:"15:00–23:00", aplicacion:"Solo retorno: Ibagué–Bogotá" },
      { dia:"LUNES (F)", fecha:"2 nov 2026",  festivo:true, horario:"10:00–23:00", aplicacion:"Todas las vías (ambos sentidos) · Bogotá–Villavicencio sin excepción" },
    ],
  },
  {
    id: "cartagena-2026",
    nombre: "Independencia de Cartagena",
    inicio: new Date("2026-11-13T15:00:00"),
    fin:    new Date("2026-11-16T23:00:00"),
    fuente: "estimado",
    nota: "Horarios estimados — pendiente boletín oficial.",
    horarios: [
      { dia:"VIERNES",   fecha:"13 nov 2026", horario:"15:00–22:00", aplicacion:"Cundinamarca éxodo + Bogotá–Ibagué (ambos sentidos)" },
      { dia:"SÁBADO",    fecha:"14 nov 2026", horario:"06:00–15:00", aplicacion:"Todas las vías (ambos sentidos) · Medellín–Caño Alegre: 12:00–19:00" },
      { dia:"DOMINGO",   fecha:"15 nov 2026", horario:"15:00–23:00", aplicacion:"Solo retorno: Ibagué–Bogotá" },
      { dia:"LUNES (F)", fecha:"16 nov 2026", festivo:true, horario:"10:00–23:00", aplicacion:"Todas las vías (ambos sentidos) · Bogotá–Villavicencio sin excepción" },
    ],
  },
  {
    id: "inmaculada-2026",
    nombre: "Inmaculada Concepción",
    inicio: new Date("2026-12-07T15:00:00"),
    fin:    new Date("2026-12-08T23:00:00"),
    fuente: "estimado",
    nota: "Festivo en martes. Horarios estimados — pendiente boletín oficial.",
    horarios: [
      { dia:"LUNES",     fecha:"7 dic 2026",  horario:"15:00–22:00", aplicacion:"Cundinamarca éxodo + Bogotá–Ibagué (ambos sentidos)" },
      { dia:"MAR (F)",   fecha:"8 dic 2026",  festivo:true, horario:"06:00–23:00", aplicacion:"Todas las vías (ambos sentidos)" },
    ],
  },
  {
    id: "navidad-2026",
    nombre: "Navidad",
    inicio: new Date("2026-12-24T15:00:00"),
    fin:    new Date("2026-12-28T23:00:00"),
    fuente: "estimado",
    nota: "Festivo en viernes. Horarios estimados — pendiente boletín oficial.",
    horarios: [
      { dia:"JUEVES",    fecha:"24 dic 2026", horario:"15:00–22:00", aplicacion:"Cundinamarca éxodo + Bogotá–Ibagué (ambos sentidos)" },
      { dia:"VIE (F)",   fecha:"25 dic 2026", festivo:true, horario:"06:00–15:00", aplicacion:"Todas las vías (ambos sentidos)" },
      { dia:"SÁBADO",    fecha:"26 dic 2026", horario:"15:00–23:00", aplicacion:"Solo retorno: Ibagué–Bogotá" },
      { dia:"DOMINGO",   fecha:"27 dic 2026", horario:"10:00–23:00", aplicacion:"Todas las vías (ambos sentidos)" },
    ],
  },
];

/* ───────── VÍAS OFICIALES (Boletín MinTransporte) ───────── */
const VIAS_RESTRINGIDAS = [
  "Armenia – Montenegro – Quimbaya",
  "Barranquilla – Cartagena (Vía al Mar)",
  "Barbosa (Ant.) – Cisneros – San José del Nus",
  "Bogotá (cll 245) – Chía – Ubaté – Chiquinquirá – San Gil – Bucaramanga",
  "Bogotá – Choachí",
  "Bogotá (Peaje Patios) – La Calera – Guasca – Guatavita – Sesquilé",
  "Bogotá (Puente de Guadua) – La Vega – Villeta – Guaduas – Honda",
  "Bogotá (Límite Soacha) – Fusagasugá – Melgar – Ibagué ⚡",
  "Bogotá (cll 245) – Tocancipá – Tunja",
  "Bogotá (Uval Km.0) – Villavicencio – Acacías ⚡⚡",
  "Bosconia – Zambrano – Carmen de Bolívar – Cartagena",
  "Bucaramanga – Pamplona – Cúcuta",
  "Bucaramanga – El Playón – San Alberto",
  "Cali – Popayán",
  "Carreto – Calamar – Santo Tomás – Sabanagrande (Atl.)",
  "Medellín – Cruce Ruta 45 (Caño Alegre) ⚡",
  "Ibagué – Cajamarca – Calarcá – La Paila ⚡",
  "Ibagué – Alvarado – Armero – Mariquita",
  "Manizales – Mariquita – Honda",
  "Montería – Cereté – Lorica – Coveñas – Tolú – Cruz del Viso",
  "Mosquera (Peaje Río Bogotá) – Facatativá – Los Alpes",
  "Neiva – Garzón – Pitalito",
  "Neiva – Espinal – Girardot",
  "Popayán – Mojarras – Pasto – Ipiales – Rumichaca (solo Semana Santa)",
  "Primavera – Amagá – Bolombolo – Ciudad Bolívar",
  "Primavera – La Pintada – La Felisa – La Manuela",
  "Puerto Araujo – Puerto Boyacá",
  "Puerta de Hierro – Magangué – Mompós – El Banco",
  "Santa Marta – Palomino",
  "Sincelejo – El Carmen de Bolívar",
  "Sogamoso – Toquilla",
  "Tunja – Barbosa",
  "Tunja – Chiquinquirá",
  "Tunja – Duitama – Sogamoso (incluye variante Tunja)",
  "Villavicencio – Cumaral",
  "Villavicencio – Puerto López",
  "Ye de Ciénaga – Fundación – San Roque – Aguachica",
  "Ye de Hatillo (Barbosa-Ant.) – Yarumal – Caucasia",
];

const VIAS_EXCEPCION = [
  "Barranquilla – Ye de Ciénaga",
  "Bucaramanga – La Lizama",
  "Cúcuta – Ye de Astilleros – Sardinata – Ocaña",
  "Girardot – Nariño – Guataquí – Cambao",
  "Medellín – Santa Fe de Antioquia – Mutatá",
  "Palmira – Ye de Villa Rica",
  "Pereira – Cartago – La Paila",
];

const EXENCIONES_CARGA = [
  "Alimentos perecederos",
  "Combustible (vacío o lleno)",
  "Medicamentos y material hospitalario",
  "Vehículos de emergencia y socorro",
  "Animales vivos",
  "Correo oficial",
  "Fuerzas Militares y Policía Nacional",
  "Servicio público urbano de pasajeros",
];

/* ───────── HELPERS ───────── */
function getStatus(p: Puente, now: Date) {
  if (now >= p.inicio && now <= p.fin) return "activa";
  if (now < p.inicio) return "proxima";
  return "pasada";
}
function msToCountdown(ms: number) {
  if (ms <= 0) return "—";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${h.toString().padStart(2,"0")}h ${m.toString().padStart(2,"0")}m`;
}

/* ════════════════════════════════════════════════════════════════
   COMPONENT
   ════════════════════════════════════════════════════════════════ */
interface Props { dark?: boolean }

type SyncStatus = {
  lastChecked: string | null;
  lastChanged: string | null;
  bulletinTitle: string | null;
  bulletinUrls: string[];
  newDetected: boolean;
  sourceUrl: string;
};

interface ClientCompany {
  id: number;
  name: string;
  nit: string;
  contact_name: string;
  contact_phone: string;
  city: string;
  logo: string | null;
  address: string;
}

export function HolidayRestrictions({ dark = true }: Props) {
  const now = new Date();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [showVias, setShowVias] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [clientCompanies, setClientCompanies] = useState<ClientCompany[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);

  const panel  = dark ? E.panel : "#ffffff";
  const text   = dark ? "rgba(255,255,255,0.87)" : "#1e293b";
  const muted  = dark ? E.dim : "#6b7280";
  const border = dark ? E.border : "rgba(0,0,0,0.08)";

  const { activo, proximos, pasados } = useMemo(() => ({
    activo:   PUENTES.find(p => getStatus(p, now) === "activa") ?? null,
    proximos: PUENTES.filter(p => getStatus(p, now) === "proxima"),
    pasados:  PUENTES.filter(p => getStatus(p, now) === "pasada"),
  }), []);

  useEffect(() => {
    const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
    fetch(`${API_BASE}/api/restrictions/sync-status`)
      .then(r => r.ok ? r.json() : null)
      .then(data => data && setSyncStatus(data))
      .catch(() => {});
    // Load client companies for the selector
    apiFetch("/companies")
      .then(r => r.ok ? r.json() : [])
      .then((list: ClientCompany[]) => setClientCompanies(list))
      .catch(() => {});
  }, []);

  /* Resolve which company data to use for the report */
  const selectedClient = clientCompanies.find(c => c.id === selectedCompanyId) ?? null;

  /* Merge selected client company over the user's profile for report data */
  const reportCompany = {
    companyName:      selectedClient?.name       ?? user?.companyName      ?? "SafeNode S.A.S.",
    companyNit:       selectedClient?.nit        ?? user?.companyNit       ?? "",
    companyLogo:      selectedClient?.logo       ?? user?.companyLogo      ?? null,
    companyCity:      selectedClient?.city       ?? user?.companyCity      ?? "",
    analystName:      user?.analystName          ?? "Analista de Seguridad",
    analystCargo:     user?.analystCargo         ?? "",
    analystPhone:     selectedClient?.contact_phone ?? user?.analystPhone  ?? "",
    footerDisclaimer: user?.footerDisclaimer     ?? "Documento informativo — Verificar con resolución oficial MinTransporte antes de programar despachos.",
  };

  const siguiente = proximos[0] ?? null;
  const msHasta   = siguiente ? siguiente.inicio.getTime() - now.getTime() : 0;

  /* ── PDF DOWNLOAD — professional vector layout ── */
  const downloadPDF = () => {
    setIsDownloading(true);
    try {
      const doc  = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W    = doc.internal.pageSize.getWidth();   // 210
      const ML   = 14, MR = 14, MT = 14;
      const IW   = W - ML - MR;                        // 182

      /* ── palette ── */
      const NAVY    = [15,  23,  42]  as [number,number,number]; // #0f172a
      const SLATE   = [30,  41,  59]  as [number,number,number]; // #1e293b
      const MUTED   = [71,  85, 105]  as [number,number,number]; // #475569
      const ALT_ROW = [241,245, 249]  as [number,number,number]; // #f1f5f9
      const WHITE   = [255,255, 255]  as [number,number,number];
      const RED_FG  = [185,  28,  28] as [number,number,number];
      const AMB_FG  = [146,  64,  14] as [number,number,number];
      const GRN_FG  = [21,  128,  61] as [number,number,number];

      /* ── report identity ── */
      const companyName  = reportCompany.companyName;
      const companyNit   = reportCompany.companyNit;
      const companyCity  = reportCompany.companyCity;
      const analystName  = reportCompany.analystName;
      const analystCargo = reportCompany.analystCargo;
      const disclaimer   = reportCompany.footerDisclaimer;

      const dateStr = now.toLocaleDateString("es-CO", {
        day: "numeric", month: "long", year: "numeric" });

      let Y = MT;

      /* ═══════════════════════════════════════════════
         HEADER — two-zone layout
         Zone A (left ~60%): logo + company name/NIT
         Zone B (right ~40%): date + analyst info
         Full-width title bar below both zones
         ═══════════════════════════════════════════════ */
      const LOGO_W = 22, LOGO_H = 14;
      const LEFT_W = IW * 0.60;    // ≈109mm
      const RIGHT_X = ML + LEFT_W + 4;
      const RIGHT_W = IW - LEFT_W - 4;

      // Logo (optional)
      let textX = ML;
      if (reportCompany.companyLogo) {
        try {
          const ext = reportCompany.companyLogo.startsWith("data:image/png") ? "PNG" : "JPEG";
          doc.addImage(reportCompany.companyLogo, ext, ML, Y, LOGO_W, LOGO_H);
          textX = ML + LOGO_W + 4;
        } catch { /* skip on error */ }
      }

      // Company name & NIT — left zone row 1
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...NAVY);
      doc.text(companyName, textX, Y + 5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      const nitLine = companyNit ? `NIT ${companyNit}${companyCity ? "   |   " + companyCity : ""}` : companyCity;
      if (nitLine) doc.text(nitLine, textX, Y + 11);

      // Date — right zone row 1
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(dateStr, RIGHT_X + RIGHT_W, Y + 5, { align: "right" });

      // Analyst — right zone row 2
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...NAVY);
      doc.text(analystName, RIGHT_X + RIGHT_W, Y + 11, { align: "right" });

      if (analystCargo) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...MUTED);
        doc.text(analystCargo, RIGHT_X + RIGHT_W, Y + 16, { align: "right" });
      }

      Y += LOGO_H + 5;  // ≈ 33mm from top

      // Full-width dark title bar
      doc.setFillColor(...SLATE);
      doc.rect(ML, Y, IW, 10, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...WHITE);
      doc.text("RESTRICCION VEHICULAR — PUENTES FESTIVOS 2026", ML + 4, Y + 7);
      Y += 10;

      // Subtitle line (on white bg)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(
        "Vehiculos con peso >= 3.4 t  |  Red Vial Nacional Primaria  |  Colombia  |  " +
        "Fuente: Boletin MinTransporte 19 mar 2026  |  Res. 761/2013 y 2307/2014",
        ML, Y + 4);
      Y += 8;

      /* ═══ helpers ═══ */
      const sectionBar = (title: string) => {
        doc.setFillColor(...NAVY);
        doc.rect(ML, Y, IW, 7, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...WHITE);
        doc.text(title, ML + 3, Y + 5);
        Y += 7;
      };

      /* ═══════════════════════════════════════════════
         ACTIVE RESTRICTION ALERT (left-accent stripe)
         ═══════════════════════════════════════════════ */
      if (activo) {
        const alertH = 10;
        // light-red fill
        doc.setFillColor(254, 242, 242);
        doc.rect(ML, Y, IW, alertH, "F");
        // left red accent stripe
        doc.setFillColor(...RED_FG);
        doc.rect(ML, Y, 3, alertH, "F");
        // border
        doc.setDrawColor(252, 165, 165);
        doc.setLineWidth(0.4);
        doc.rect(ML, Y, IW, alertH, "S");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...RED_FG);
        doc.text(
          `RESTRICCION ACTIVA: ${activo.nombre.toUpperCase()}`,
          ML + 7, Y + alertH / 2 + 1.5);
        Y += alertH + 5;
      }

      /* ═══════════════════════════════════════════════
         CALENDAR TABLE
         Column widths total = 182mm exactly:
           #(9) | Festivo(40) | Inicio(32) | Fin(32) | D(9) | Estado(28) | Fuente(32)
         ═══════════════════════════════════════════════ */
      sectionBar("CALENDARIO DE RESTRICCIONES 2026");

      const calRows = PUENTES.map((p, i) => {
        const s = now >= p.inicio && now <= p.fin ? "ACTIVA"
                : now < p.inicio ? "PROXIMA" : "PASADA";
        const dias = Math.ceil((p.fin.getTime() - p.inicio.getTime()) / 86400000);
        const fmt = (d: Date) => d.toLocaleString("es-CO", {
          weekday: "short", day: "2-digit", month: "short",
          hour: "2-digit", minute: "2-digit" });
        return [String(i + 1), p.nombre, fmt(p.inicio), fmt(p.fin), String(dias), s,
                p.fuente === "oficial" ? "OFICIAL" : "ESTIMADO"];
      });

      autoTable(doc, {
        startY: Y,
        head: [["#", "Festivo", "Inicio restriccion", "Fin restriccion", "D", "Estado", "Fuente"]],
        body: calRows,
        margin: { left: ML, right: MR },
        theme: "plain",
        styles: {
          fontSize: 7, cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
          lineColor: [203, 213, 225], lineWidth: 0.3,
          textColor: NAVY, valign: "middle", overflow: "linebreak",
        },
        headStyles: {
          fillColor: [51, 65, 85], textColor: WHITE, fontStyle: "bold",
          fontSize: 7, lineColor: [51, 65, 85], lineWidth: 0.3,
        },
        alternateRowStyles: { fillColor: ALT_ROW },
        columnStyles: {
          0: { cellWidth: 9,  halign: "center" },
          1: { cellWidth: 40, fontStyle: "bold" },
          2: { cellWidth: 32 },
          3: { cellWidth: 32 },
          4: { cellWidth: 9,  halign: "center" },
          5: { cellWidth: 28, halign: "center", fontStyle: "bold" },
          6: { cellWidth: 32, halign: "center" },
        },
        tableLineColor: [203, 213, 225],
        tableLineWidth: 0.3,
        didDrawCell: (data) => {
          if (data.column.index === 5 && data.section === "body") {
            const v = String(data.cell.raw ?? "");
            const fg = v === "ACTIVA"  ? RED_FG
                     : v === "PROXIMA" ? AMB_FG : GRN_FG;
            doc.setTextColor(fg[0], fg[1], fg[2]);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(6.5);
            doc.text(v,
              data.cell.x + data.cell.width / 2,
              data.cell.y + data.cell.height / 2 + 0.7,
              { align: "center" });
          }
        },
      });

      Y = (doc as any).lastAutoTable.finalY + 8;

      /* ═══════════════════════════════════════════════
         DETAILED SCHEDULES — next 3 holidays
         Col widths: Dia(24) | Fecha(26) | Horario(36) | Aplicacion(96) = 182
         ═══════════════════════════════════════════════ */
      for (const p of proximos.slice(0, 3)) {
        if (Y > 230) { doc.addPage(); Y = MT; }

        sectionBar(`HORARIO DETALLADO — ${p.nombre.toUpperCase()}`);

        if (p.nota) {
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.3);
          doc.rect(ML, Y, IW, 7, "FD");
          // left accent
          doc.setFillColor(...MUTED);
          doc.rect(ML, Y, 2, 7, "F");
          doc.setFont("helvetica", "italic");
          doc.setFontSize(7);
          doc.setTextColor(...MUTED);
          doc.text(`Nota: ${p.nota}`, ML + 5, Y + 5);
          Y += 8;
        }

        autoTable(doc, {
          startY: Y,
          head: [["Dia", "Fecha", "Horario de restriccion", "Aplicacion geografica"]],
          body: p.horarios.map(r => [r.dia, r.fecha, r.horario, r.aplicacion]),
          margin: { left: ML, right: MR },
          theme: "plain",
          styles: {
            fontSize: 7, cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
            lineColor: [203, 213, 225], lineWidth: 0.3,
            textColor: NAVY, valign: "middle", overflow: "linebreak",
          },
          headStyles: {
            fillColor: [51, 65, 85], textColor: WHITE, fontStyle: "bold",
            fontSize: 7, lineColor: [51, 65, 85], lineWidth: 0.3,
          },
          alternateRowStyles: { fillColor: ALT_ROW },
          columnStyles: {
            0: { cellWidth: 24, fontStyle: "bold" },
            1: { cellWidth: 26 },
            2: { cellWidth: 36, fontStyle: "bold" },
            3: { cellWidth: 96 },
          },
          tableLineColor: [203, 213, 225],
          tableLineWidth: 0.3,
        });
        Y = (doc as any).lastAutoTable.finalY + 8;
      }

      /* ═══════════════════════════════════════════════
         EXEMPTIONS + EXCEPTION ROADS — two columns
         Each col = (182 - 5) / 2 = 88.5mm
         ═══════════════════════════════════════════════ */
      if (Y > 210) { doc.addPage(); Y = MT; }

      const GAP  = 5;
      const COLW = (IW - GAP) / 2;      // ≈ 88.5mm
      const COL2 = ML + COLW + GAP;

      /* left header */
      doc.setFillColor(...NAVY);
      doc.rect(ML, Y, COLW, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...WHITE);
      doc.text("CARGA EXENTA — SIN RESTRICCION", ML + 3, Y + 5);

      /* right header */
      doc.setFillColor(...NAVY);
      doc.rect(COL2, Y, COLW, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...WHITE);
      doc.text("VIAS CON EXCEPCION — SIN RESTRICCION", COL2 + 3, Y + 5);

      const tblY = Y + 7;

      autoTable(doc, {
        startY: tblY,
        body: EXENCIONES_CARGA.map(ex => [`- ${ex}`]),
        margin: { left: ML, right: COL2 - 1 },
        theme: "plain",
        styles: { fontSize: 7, cellPadding: { top: 2, bottom: 2, left: 3, right: 2 },
          lineColor: [203, 213, 225], lineWidth: 0.25, textColor: NAVY },
        alternateRowStyles: { fillColor: ALT_ROW },
        tableLineColor: [203, 213, 225],
        tableLineWidth: 0.25,
      });
      const leftFinalY = (doc as any).lastAutoTable.finalY;

      autoTable(doc, {
        startY: tblY,
        body: VIAS_EXCEPCION.map(v => [`- ${v}`]),
        margin: { left: COL2, right: MR },
        theme: "plain",
        styles: { fontSize: 7, cellPadding: { top: 2, bottom: 2, left: 3, right: 2 },
          lineColor: [203, 213, 225], lineWidth: 0.25, textColor: NAVY },
        alternateRowStyles: { fillColor: ALT_ROW },
        tableLineColor: [203, 213, 225],
        tableLineWidth: 0.25,
      });
      const rightFinalY = (doc as any).lastAutoTable.finalY;

      Y = Math.max(leftFinalY, rightFinalY) + 8;

      /* ═══════════════════════════════════════════════
         FOOTER — every page
         ═══════════════════════════════════════════════ */
      const pages = doc.getNumberOfPages();
      for (let pg = 1; pg <= pages; pg++) {
        doc.setPage(pg);
        const pH = doc.internal.pageSize.getHeight();

        doc.setDrawColor(...SLATE);
        doc.setLineWidth(0.5);
        doc.line(ML, pH - 14, W - MR, pH - 14);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(...NAVY);
        doc.text(
          companyName + (companyCity ? "  |  " + companyCity : ""),
          ML, pH - 9);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(...MUTED);
        const disc = disclaimer ?? "Documento informativo — Verificar con resolucion oficial MinTransporte antes de programar despachos.";
        doc.text(disc, ML, pH - 5);
        doc.text(
          `Pag. ${pg}/${pages}  |  Generado: ${now.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}`,
          W - MR, pH - 5, { align: "right" });
      }

      doc.save(`restricciones-vehiculares-${now.toISOString().slice(0, 10)}.pdf`);
    } finally {
      setIsDownloading(false);
    }
  };

  /* ── PRINT VIEW ── */
  if (showPrint) return <PrintView onBack={() => setShowPrint(false)} now={now} activo={activo} proximos={proximos} user={user} />;

  /* ── PUENTE CARD ── */
  function PuenteCard({ p }: { p: Puente }) {
    const status = getStatus(p, now);
    const isOpen = expanded === p.id;
    const sc = status === "activa" ? E.red : status === "proxima" ? E.amber : muted;
    const sl = status === "activa" ? "ACTIVA" : status === "proxima" ? "PRÓXIMA" : "FINALIZADA";

    return (
      <div
        onClick={() => setExpanded(isOpen ? null : p.id)}
        style={{
          background: isOpen ? (dark ? "rgba(0,212,255,0.05)" : "#f0f9ff") : panel,
          border: `1px solid ${isOpen ? "rgba(0,212,255,0.2)" : border}`,
          borderRadius: 10, padding: "14px 18px", cursor: "pointer",
          transition: "all 0.15s", marginBottom: 8,
        }}
      >
        {/* Header row */}
        <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          <div style={{ width:9, height:9, borderRadius:"50%", background:sc, flexShrink:0,
            boxShadow: status==="activa" ? `0 0 10px ${E.red}` : "none" }} />
          <div style={{ flex:1, minWidth:150 }}>
            <div style={{ fontSize:14, fontWeight:700, color:text }}>{p.nombre}</div>
            <div style={{ fontSize:11, color:muted, marginTop:2 }}>
              {p.inicio.toLocaleDateString("es-CO",{day:"numeric",month:"short"})} →{" "}
              {p.fin.toLocaleDateString("es-CO",{day:"numeric",month:"short",year:"numeric"})}
            </div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {p.fuente === "oficial" ? (
              <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:10,
                background:"rgba(16,185,129,0.12)", color:E.green }}>✓ OFICIAL</span>
            ) : (
              <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:10,
                background:"rgba(245,158,11,0.1)", color:E.amber }}>~ ESTIMADO</span>
            )}
            <span style={{ fontSize:10, fontWeight:800, padding:"2px 10px", borderRadius:20,
              textTransform:"uppercase", letterSpacing:"0.08em",
              background: status==="activa" ? "rgba(239,68,68,0.15)"
                : status==="proxima" ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.05)",
              color:sc }}>
              {sl}
            </span>
            <span style={{ fontSize:16, color:muted, transition:"transform 0.15s",
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
          </div>
        </div>

        {/* Expanded: schedule table */}
        {isOpen && (
          <div style={{ marginTop:14, paddingTop:14, borderTop:`1px solid ${border}` }}>
            {p.nota && (
              <div style={{ fontSize:12, color:E.amber, background:"rgba(245,158,11,0.08)",
                border:"1px solid rgba(245,158,11,0.2)", borderRadius:6, padding:"8px 12px", marginBottom:12 }}>
                ⚠️ {p.nota}
              </div>
            )}
            <div style={{ fontSize:11, fontWeight:700, color:muted, textTransform:"uppercase",
              letterSpacing:"0.08em", marginBottom:8 }}>Horario detallado</div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr>
                  {["Día","Fecha","Horario","Aplicación"].map(h => (
                    <th key={h} style={{ textAlign:"left", padding:"6px 10px", fontSize:10,
                      fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em",
                      color:muted, borderBottom:`1px solid ${border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.horarios.map((r, i) => (
                  <tr key={i} style={{ background: i%2===0
                    ? (dark ? "rgba(255,255,255,0.02)" : "#f8fafc") : "transparent" }}>
                    <td style={{ padding:"7px 10px", fontWeight:700, color:r.festivo ? E.amber : text,
                      whiteSpace:"nowrap" }}>{r.dia}</td>
                    <td style={{ padding:"7px 10px", color:muted, whiteSpace:"nowrap" }}>{r.fecha}</td>
                    <td style={{ padding:"7px 10px", fontWeight:700, whiteSpace:"nowrap",
                      color: r.noAplica ? E.green : r.horario.includes("06:00") ? E.cyan : E.red }}>
                      {r.horario}
                    </td>
                    <td style={{ padding:"7px 10px", color:muted, fontSize:11 }}>{r.aplicacion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  /* ── MAIN VIEW ── */
  return (
    <div style={{ color:text }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
        marginBottom:24, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:800, color:text, margin:0, letterSpacing:"-0.02em" }}>
            🚧 Restricciones Puentes Festivos 2026
          </h2>
          <p style={{ fontSize:12, color:muted, margin:"5px 0 0" }}>
            Vehículos ≥ 3.4 t · Red Vial Nacional ·{" "}
            <a href="https://mintransporte.gov.co/publicaciones/12311/boletin-estrategico-de-seguridad-y-movilidad/"
              target="_blank" rel="noreferrer"
              style={{ color:E.cyan, textDecoration:"none" }}>
              Boletín MinTransporte 19 mar 2026 ↗
            </a>
            {" "}· Res. 761/2013 y 2307/2014
          </p>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>

          {/* Company selector (only shown when there are client companies) */}
          {clientCompanies.length > 0 && (
            <div style={{ position:"relative" }}>
              <button
                onClick={() => setShowCompanyPicker(p => !p)}
                style={{
                  padding:"8px 12px", borderRadius:8, fontSize:11, fontWeight:700,
                  background: selectedClient ? "rgba(0,212,255,0.12)" : "transparent",
                  color: selectedClient ? E.cyan : E.dim,
                  border:`1px solid ${selectedClient ? E.cyan : E.border}`,
                  cursor:"pointer", display:"flex", alignItems:"center", gap:6,
                  maxWidth:200, overflow:"hidden" }}>
                <Building2 size={12} />
                <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {selectedClient ? selectedClient.name : "Mi empresa"}
                </span>
                <ChevronDown size={11} style={{ flexShrink:0, opacity:0.7 }} />
              </button>

              {showCompanyPicker && (
                <div style={{
                  position:"absolute", top:"calc(100% + 6px)", right:0, zIndex:50,
                  background: dark ? "#0f1929" : "#fff",
                  border:`1px solid ${E.border}`, borderRadius:10, padding:"6px 4px",
                  minWidth:220, boxShadow:"0 8px 32px rgba(0,0,0,0.35)" }}>
                  {/* "Mi empresa" option */}
                  <button
                    onClick={() => { setSelectedCompanyId(null); setShowCompanyPicker(false); }}
                    style={{
                      display:"block", width:"100%", padding:"8px 12px",
                      background: selectedCompanyId === null ? "rgba(0,212,255,0.1)" : "transparent",
                      color: selectedCompanyId === null ? E.cyan : text,
                      border:"none", borderRadius:7, cursor:"pointer", fontSize:12,
                      fontWeight: selectedCompanyId === null ? 700 : 400, textAlign:"left" }}>
                    Mi empresa
                  </button>
                  {/* Divider */}
                  <div style={{ height:1, background:E.border, margin:"4px 8px" }} />
                  {/* Client companies */}
                  {clientCompanies.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedCompanyId(c.id); setShowCompanyPicker(false); }}
                      style={{
                        display:"block", width:"100%", padding:"8px 12px",
                        background: selectedCompanyId === c.id ? "rgba(0,212,255,0.1)" : "transparent",
                        color: selectedCompanyId === c.id ? E.cyan : text,
                        border:"none", borderRadius:7, cursor:"pointer", fontSize:12,
                        fontWeight: selectedCompanyId === c.id ? 700 : 400, textAlign:"left",
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {c.name}
                      {c.nit && (
                        <span style={{ fontSize:10, opacity:0.55, marginLeft:6 }}>· {c.nit}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button onClick={() => setShowVias(!showVias)} style={{
            padding:"8px 14px", borderRadius:8, fontSize:11, fontWeight:700,
            background:"transparent", color:E.cyan,
            border:`1px solid ${E.cyan}`, cursor:"pointer" }}>
            {showVias ? "Ocultar vías" : "🛣️ Ver 38 vías"}
          </button>
          <button onClick={() => setShowPrint(true)} style={{
            padding:"8px 14px", borderRadius:8, fontSize:11, fontWeight:700,
            background:"transparent", color:E.cyan,
            border:`1px solid ${E.cyan}`, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            <Eye size={13} /> Vista previa
          </button>
          <button onClick={downloadPDF} disabled={isDownloading} style={{
            padding:"8px 16px", borderRadius:8, fontSize:11, fontWeight:700,
            background: isDownloading ? "#334155" : E.cyan,
            color:"#060a10", border:"none", cursor: isDownloading ? "wait" : "pointer",
            display:"flex", alignItems:"center", gap:6, opacity: isDownloading ? 0.75 : 1 }}>
            <Download size={13} />
            {isDownloading ? "Generando PDF..." : "Descargar PDF"}
          </button>
        </div>
      </div>

      {/* Sync status banner */}
      {syncStatus && (
        <div style={{
          background: syncStatus.newDetected
            ? "rgba(245,158,11,0.1)" : dark ? "rgba(0,212,255,0.05)" : "rgba(0,180,220,0.06)",
          border: `1px solid ${syncStatus.newDetected ? "rgba(245,158,11,0.35)" : "rgba(0,212,255,0.18)"}`,
          borderRadius: 10, padding: "10px 16px", marginBottom: 16,
          display: "flex", alignItems: "center", gap: 10, fontSize: 11,
        }}>
          <RefreshCw size={13} color={syncStatus.newDetected ? E.amber : E.cyan} style={{ flexShrink: 0 }} />
          <span style={{ color: syncStatus.newDetected ? E.amber : E.cyan, fontWeight: 600 }}>
            {syncStatus.newDetected ? "⚠ Nuevo boletín MinTransporte detectado — " : "Sincronización activa con MinTransporte — "}
          </span>
          <span style={{ color: muted }}>
            Revisado: {syncStatus.lastChecked
              ? new Date(syncStatus.lastChecked).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })
              : "pendiente"}
            {syncStatus.bulletinTitle && <> · {syncStatus.bulletinTitle}</>}
          </span>
        </div>
      )}

      {/* Status hero */}
      {activo ? (
        <div style={{ display:"flex", alignItems:"center", gap:14,
          background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.35)",
          borderRadius:12, padding:"18px 24px", marginBottom:20 }}>
          <div style={{ width:18, height:18, borderRadius:"50%", background:E.red,
            boxShadow:`0 0 14px ${E.red}`, flexShrink:0 }} />
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:E.red }}>
              🚫 RESTRICCIÓN ACTIVA — {activo.nombre.toUpperCase()}
            </div>
            <div style={{ fontSize:12, color:muted, marginTop:3 }}>
              Aplica hasta el {activo.fin.toLocaleString("es-CO")} · Vehículos ≥ 3.4 toneladas restringidos
            </div>
          </div>
        </div>
      ) : siguiente ? (
        <div style={{ display:"flex", alignItems:"center", gap:20,
          background:"rgba(16,185,129,0.07)", border:"1px solid rgba(16,185,129,0.25)",
          borderRadius:12, padding:"18px 24px", marginBottom:20, flexWrap:"wrap" }}>
          <div style={{ width:14, height:14, borderRadius:"50%", background:E.green }} />
          <div style={{ flex:1, minWidth:180 }}>
            <div style={{ fontSize:14, fontWeight:800, color:E.green }}>✅ Sin restricción activa</div>
            <div style={{ fontSize:12, color:muted, marginTop:3 }}>
              Próxima: <strong style={{ color:text }}>{siguiente.nombre}</strong>{" — "}
              inicia {siguiente.inicio.toLocaleDateString("es-CO",{weekday:"long",day:"numeric",month:"long"})} a las{" "}
              {siguiente.inicio.toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:10, color:muted, textTransform:"uppercase", letterSpacing:"0.1em" }}>Faltan</div>
            <div style={{ fontSize:24, fontWeight:900, color:E.amber, fontVariantNumeric:"tabular-nums" }}>
              {msToCountdown(msHasta)}
            </div>
          </div>
        </div>
      ) : null}

      {/* KPIs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:24 }}>
        {[
          { label:"Total 2026",  val:PUENTES.length,    col:E.cyan,  icon:"📅" },
          { label:"Próximas",    val:proximos.length,   col:E.amber, icon:"⏳" },
          { label:"Finalizadas", val:pasados.length,    col:E.green, icon:"✅" },
          { label:"Activa ahora",val:activo ? 1 : 0,    col:activo ? E.red : muted, icon:"🚫" },
        ].map(k => (
          <div key={k.label} style={{ background:panel, border:`1px solid ${border}`, borderRadius:10,
            padding:"14px 16px", textAlign:"center" }}>
            <div style={{ fontSize:20 }}>{k.icon}</div>
            <div style={{ fontSize:26, fontWeight:900, color:k.col, lineHeight:1.1 }}>{k.val}</div>
            <div style={{ fontSize:10, color:muted, marginTop:3 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Road network panel */}
      {showVias && (
        <div style={{ background:panel, border:`1px solid ${border}`, borderRadius:12,
          padding:"18px 20px", marginBottom:20 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
            <div>
              <div style={{ fontSize:12, fontWeight:800, color:E.red, marginBottom:10 }}>
                🚫 38 Vías restringidas (Red Vial Nacional)
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:4 }}>
                {VIAS_RESTRINGIDAS.map((v,i) => (
                  <div key={i} style={{ fontSize:11, color:muted, display:"flex", gap:6 }}>
                    <span style={{ color: v.includes("⚡") ? E.amber : E.red, flexShrink:0 }}>
                      {(i+1).toString().padStart(2,"0")}.
                    </span>
                    <span style={{ color: v.includes("⚡⚡") ? E.red : v.includes("⚡") ? E.amber : muted }}>
                      {v.replace("⚡⚡","").replace("⚡","")}
                      {v.includes("⚡⚡") && <span style={{ color:E.red, fontWeight:700 }}> ★ sin excepción</span>}
                      {v.includes("⚡") && !v.includes("⚡⚡") && <span style={{ color:E.amber, fontWeight:700 }}> ★ horario especial</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize:12, fontWeight:800, color:E.green, marginBottom:10 }}>
                ✅ 7 Vías con excepción (NO aplica restricción)
              </div>
              {VIAS_EXCEPCION.map((v,i) => (
                <div key={i} style={{ fontSize:11, color:muted, display:"flex", gap:6, marginBottom:5 }}>
                  <span style={{ color:E.green }}>✓</span> {v}
                </div>
              ))}
              <div style={{ marginTop:20 }}>
                <div style={{ fontSize:12, fontWeight:800, color:E.cyan, marginBottom:10 }}>
                  📦 Carga exenta (no aplica restricción)
                </div>
                {EXENCIONES_CARGA.map(ex => (
                  <div key={ex} style={{ fontSize:11, color:muted, display:"flex", gap:6, marginBottom:5 }}>
                    <span style={{ color:E.cyan }}>✓</span> {ex}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Puente lists */}
      {activo && (
        <Section title="● Restricción activa" color={E.red}>
          <PuenteCard p={activo} />
        </Section>
      )}
      {proximos.length > 0 && (
        <Section title="Próximas restricciones" color={E.amber}>
          {proximos.map(p => <PuenteCard key={p.id} p={p} />)}
        </Section>
      )}
      {pasados.length > 0 && (
        <Section title="Finalizadas 2026" color={muted}>
          {pasados.map(p => <PuenteCard key={p.id} p={p} />)}
        </Section>
      )}

      {/* Weight note */}
      <div style={{ background:"rgba(0,212,255,0.05)", border:"1px solid rgba(0,212,255,0.15)",
        borderRadius:10, padding:"12px 16px", fontSize:12, color:muted, marginTop:8 }}>
        <strong style={{ color:E.cyan }}>Criterio oficial:</strong> La restricción aplica a vehículos con <strong style={{ color:text }}>peso bruto vehicular ≥ 3.4 toneladas (3.400 kg)</strong> en la red vial nacional. Incluye tractomulas, camiones de carga, volquetas y similares. Basado en Resoluciones MinTransporte <strong style={{ color:text }}>761/2013</strong> y <strong style={{ color:text }}>2307/2014</strong>. Los horarios del segundo semestre son estimados — verificar con el boletín oficial cuando sea publicado.
      </div>
    </div>
  );
}

/* ── SECTION WRAPPER ── */
function Section({ title, color, children }: { title:string; color:string; children:React.ReactNode }) {
  return (
    <div style={{ marginBottom:24 }}>
      <div style={{ fontSize:11, fontWeight:700, color, textTransform:"uppercase",
        letterSpacing:"0.1em", marginBottom:10 }}>{title}</div>
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   PRINT VIEW  (content shared by preview + PDF capture)
   ════════════════════════════════════════════════════════════════ */
const CELL      = "2px solid #1e293b";
const CELL_DARK = "2px solid #0f172a";

function PrintViewContent({ now, activo, proximos, user }: {
  now: Date;
  activo: Puente | null;
  proximos: Puente[];
  user: import("@/context/AuthContext").UserConfig | null;
}) {
  const primaryColor = user?.primaryColor ?? "#0f172a";

  const thStyle: React.CSSProperties = {
    padding: "9px 12px", textAlign: "left", fontWeight: 800,
    fontSize: 11, letterSpacing: "0.05em",
    border: CELL_DARK,
    color: "#ffffff", background: "transparent",
  };
  const tdStyle = (alt: boolean, bold?: boolean): React.CSSProperties => ({
    padding: "8px 12px", fontSize: 11, border: CELL,
    background: alt ? "#f0f4f8" : "#ffffff",
    fontWeight: bold ? 700 : 400,
    color: "#0f172a",
    verticalAlign: "top",
  });

  const sectionHead: React.CSSProperties = {
    fontSize: 12, fontWeight: 900, color: "#ffffff",
    background: "#0f172a",
    padding: "9px 14px",
    letterSpacing: "0.07em",
    border: CELL_DARK,
    marginBottom: 0,
  };

  return (
    <div style={{ background:"#fff", color:"#0f172a", fontFamily:"'Segoe UI',Arial,sans-serif",
      padding:"32px 42px" }}>

      {/* ── EXECUTIVE HEADER ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
        borderBottom:`3px solid #0f172a`, paddingBottom:14, marginBottom:22 }}>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          {user?.companyLogo && (
            <img src={user.companyLogo} alt="Logo" style={{ height:52, objectFit:"contain" }} />
          )}
          <div>
            <div style={{ fontSize:9, fontWeight:800, letterSpacing:"0.12em", textTransform:"uppercase",
              color:"#0f172a", marginBottom:2 }}>
              {user?.companyName ?? "SafeNode S.A.S."}
              {user?.companyNit ? <span style={{ fontWeight:400 }}> · NIT {user.companyNit}</span> : ""}
            </div>
            <div style={{ fontSize:18, fontWeight:900, color:"#0f172a", letterSpacing:"-0.02em", lineHeight:1.2 }}>
              RESTRICCIÓN VEHICULAR — PUENTES FESTIVOS 2026
            </div>
            <div style={{ fontSize:11, color:"#334155", marginTop:3 }}>
              Vehículos con peso ≥ 3.4 toneladas · Red Vial Nacional Primaria · Colombia
            </div>
            <div style={{ fontSize:9, color:"#475569", marginTop:2 }}>
              Fuente: Boletín Estratégico MinTransporte 19 mar 2026 · Res. 761/2013 y 2307/2014
            </div>
          </div>
        </div>
        <div style={{ textAlign:"right", flexShrink:0, paddingLeft:16 }}>
          <div style={{ fontSize:10, color:"#334155" }}>
            {user?.analystName ?? "Analista de Seguridad"}
          </div>
          {user?.analystCargo && (
            <div style={{ fontSize:9, color:"#475569" }}>{user.analystCargo}</div>
          )}
          {user?.analystPhone && (
            <div style={{ fontSize:9, color:"#475569" }}>{user.analystPhone}</div>
          )}
          <div style={{ fontSize:11, fontWeight:800, color:"#0f172a", marginTop:6 }}>
            {now.toLocaleDateString("es-CO",{day:"numeric",month:"long",year:"numeric"})}
          </div>
        </div>
      </div>

      {/* ── ALERTA ACTIVA ── */}
      {activo && (
        <div style={{ background:"#f1f5f9", border:CELL, borderRadius:4,
          padding:"10px 16px", marginBottom:18, display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:10, height:10, borderRadius:"50%", background:"#0f172a", flexShrink:0 }} />
          <strong style={{ color:"#0f172a", fontSize:12 }}>RESTRICCIÓN ACTIVA: {activo.nombre}</strong>
        </div>
      )}

      {/* ── TABLA RESUMEN TODOS LOS PUENTES ── */}
      <div style={{ marginBottom:24 }}>
        <div style={sectionHead}>CALENDARIO DE RESTRICCIONES 2026</div>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
          <thead>
            <tr style={{ background:"#0f172a" }}>
              {["#","Festivo","Inicio restricción","Fin restricción","Días","Estado","Fuente"].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PUENTES.map((p, i) => {
              const status = (() => {
                if (now >= p.inicio && now <= p.fin) return "activa";
                if (now < p.inicio) return "proxima";
                return "pasada";
              })();
              const dias = Math.ceil((p.fin.getTime() - p.inicio.getTime()) / 86400000);
              const alt = i % 2 === 0;
              return (
                <tr key={p.id}>
                  <td style={{ ...tdStyle(alt), width:28, textAlign:"center" }}>{i+1}</td>
                  <td style={{ ...tdStyle(alt, true) }}>{p.nombre}</td>
                  <td style={{ ...tdStyle(alt), fontWeight:600 }}>
                    {p.inicio.toLocaleString("es-CO",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}
                  </td>
                  <td style={{ ...tdStyle(alt), fontWeight:600 }}>
                    {p.fin.toLocaleString("es-CO",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}
                  </td>
                  <td style={{ ...tdStyle(alt), textAlign:"center" }}>{dias}</td>
                  <td style={{ ...tdStyle(alt) }}>
                    <span style={{
                      padding:"2px 8px", borderRadius:3, fontSize:9, fontWeight:800,
                      background: status==="activa" ? "#1e293b" : status==="proxima" ? "#334155" : "#f1f5f9",
                      color: "#ffffff",
                      border: `1px solid #0f172a`,
                    }}>
                      {status==="activa" ? "ACTIVA" : status==="proxima" ? "PRÓXIMA" : "FINALIZADA"}
                    </span>
                  </td>
                  <td style={{ ...tdStyle(alt) }}>
                    <span style={{
                      padding:"2px 8px", borderRadius:3, fontSize:9, fontWeight:800,
                      background: p.fuente==="oficial" ? "#0f172a" : "#f1f5f9",
                      color: p.fuente==="oficial" ? "#ffffff" : "#0f172a",
                      border: "1px solid #1e293b",
                    }}>
                      {p.fuente==="oficial" ? "✓ OFICIAL" : "~ ESTIMADO"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── HORARIOS DETALLADOS DE PRÓXIMOS ── */}
      {proximos.slice(0,3).map(p => (
        <div key={p.id} style={{ marginBottom:22, pageBreakInside:"avoid" as const }}>
          <div style={{ ...sectionHead, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span>HORARIO DETALLADO — {p.nombre.toUpperCase()}</span>
            {p.fuente==="estimado" && (
              <span style={{ fontSize:9, fontWeight:600, color:"rgba(255,255,255,0.7)" }}>HORARIO ESTIMADO</span>
            )}
          </div>
          {p.nota && (
            <div style={{ fontSize:10, color:"#0f172a", background:"#f1f5f9",
              border:CELL, padding:"6px 12px", marginBottom:0 }}>
              ⚠ {p.nota}
            </div>
          )}
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:10 }}>
            <thead>
              <tr style={{ background:"#0f172a" }}>
                {["Día","Fecha","Horario de restricción","Aplicación geográfica"].map(h => (
                  <th key={h} style={{ ...thStyle, fontSize:9, padding:"7px 10px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.horarios.map((r, i) => {
                const alt = i % 2 === 0;
                return (
                  <tr key={i}>
                    <td style={{ ...tdStyle(r.festivo ? false : alt, true),
                      background: r.festivo ? "#e2e8f0" : alt ? "#f0f4f8" : "#ffffff",
                      color:"#0f172a", whiteSpace:"nowrap", width:80 }}>
                      {r.dia}
                    </td>
                    <td style={{ ...tdStyle(alt), whiteSpace:"nowrap", color:"#0f172a", width:80 }}>{r.fecha}</td>
                    <td style={{ ...tdStyle(alt, true), whiteSpace:"nowrap", width:120, color:"#0f172a" }}>
                      {r.horario}
                    </td>
                    <td style={{ ...tdStyle(alt), color:"#0f172a" }}>{r.aplicacion}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {/* ── EXENCIONES + VÍAS ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20 }}>
        <div>
          <div style={{ ...sectionHead, fontSize:10 }}>CARGA EXENTA — NO APLICA RESTRICCIÓN</div>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:9 }}>
            <tbody>
              {EXENCIONES_CARGA.map((ex, i) => (
                <tr key={ex}>
                  <td style={{ ...tdStyle(i%2===0), paddingLeft:10 }}>
                    <span style={{ fontWeight:800, marginRight:5 }}>✓</span>{ex}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div style={{ ...sectionHead, fontSize:10 }}>VÍAS CON EXCEPCIÓN — SIN RESTRICCIÓN</div>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:9 }}>
            <tbody>
              {VIAS_EXCEPCION.map((v, i) => (
                <tr key={v}>
                  <td style={{ ...tdStyle(i%2===0), paddingLeft:10 }}>
                    <span style={{ fontWeight:800, marginRight:5 }}>✓</span>{v}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── FOOTER EJECUTIVO ── */}
      <div style={{ borderTop:`3px solid #0f172a`, paddingTop:10, marginTop:8,
        display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
        <div>
          <div style={{ fontSize:10, fontWeight:700, color:"#0f172a" }}>
            {user?.companyName ?? "SafeNode S.A.S."} {user?.companyCity ? `· ${user.companyCity}` : ""}
          </div>
          <div style={{ fontSize:9, color:"#334155" }}>
            {user?.footerDisclaimer ?? "Documento informativo — Verificar con resolución oficial MinTransporte antes de programar despachos."}
          </div>
        </div>
        <div style={{ fontSize:9, color:"#475569", textAlign:"right" }}>
          <div>Generado: {now.toLocaleString("es-CO",{dateStyle:"short",timeStyle:"short"})}</div>
          <div>Fuente: mintransporte.gov.co · Res. 761/2013</div>
        </div>
      </div>
    </div>
  );
}

function PrintView({ onBack, now, activo, proximos, user }: {
  onBack: () => void;
  now: Date;
  activo: Puente | null;
  proximos: Puente[];
  user: import("@/context/AuthContext").UserConfig | null;
}) {
  return (
    <div>
      <button onClick={onBack} className="print:hidden" style={{ margin:"16px 42px 0", padding:"7px 16px", borderRadius:6,
        background:"#0f172a", color:"#fff", border:"none", cursor:"pointer", fontSize:12 }}>
        ← Volver al dashboard
      </button>
      <PrintViewContent now={now} activo={activo} proximos={proximos} user={user} />
    </div>
  );
}
