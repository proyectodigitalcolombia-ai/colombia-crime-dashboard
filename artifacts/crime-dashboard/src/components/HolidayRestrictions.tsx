import { useMemo, useState } from "react";

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

export function HolidayRestrictions({ dark = true }: Props) {
  const now = new Date();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [showVias, setShowVias] = useState(false);

  const panel  = dark ? E.panel : "#ffffff";
  const text   = dark ? "rgba(255,255,255,0.87)" : "#1e293b";
  const muted  = dark ? E.dim : "#6b7280";
  const border = dark ? E.border : "rgba(0,0,0,0.08)";

  const { activo, proximos, pasados } = useMemo(() => ({
    activo:   PUENTES.find(p => getStatus(p, now) === "activa") ?? null,
    proximos: PUENTES.filter(p => getStatus(p, now) === "proxima"),
    pasados:  PUENTES.filter(p => getStatus(p, now) === "pasada"),
  }), []);

  const siguiente = proximos[0] ?? null;
  const msHasta   = siguiente ? siguiente.inicio.getTime() - now.getTime() : 0;

  /* ── PRINT VIEW ── */
  if (showPrint) return <PrintView onBack={() => setShowPrint(false)} now={now} activo={activo} proximos={proximos} />;

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
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={() => setShowVias(!showVias)} style={{
            padding:"8px 14px", borderRadius:8, fontSize:11, fontWeight:700,
            background:"transparent", color:E.cyan,
            border:`1px solid ${E.cyan}`, cursor:"pointer" }}>
            {showVias ? "Ocultar vías" : "🛣️ Ver 38 vías"}
          </button>
          <button onClick={() => setShowPrint(true)} style={{
            padding:"8px 16px", borderRadius:8, fontSize:11, fontWeight:700,
            background:E.cyan, color:"#060a10", border:"none", cursor:"pointer" }}>
            🖨️ Informe cliente
          </button>
        </div>
      </div>

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
   PRINT VIEW
   ════════════════════════════════════════════════════════════════ */
function PrintView({ onBack, now, activo, proximos }: {
  onBack: () => void;
  now: Date;
  activo: Puente | null;
  proximos: Puente[];
}) {
  return (
    <div style={{ background:"#fff", color:"#111", fontFamily:"Arial, sans-serif",
      padding:"36px 48px", minHeight:"100vh" }}>
      {/* Back btn */}
      <button onClick={onBack} style={{ marginBottom:24, padding:"7px 16px", borderRadius:6,
        background:"#0f172a", color:"#fff", border:"none", cursor:"pointer", fontSize:12 }}>
        ← Volver al dashboard
      </button>

      {/* Header */}
      <div style={{ borderBottom:"3px solid #0f172a", paddingBottom:16, marginBottom:24,
        display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:20, fontWeight:900, color:"#0f172a", letterSpacing:"-0.02em" }}>
            RESTRICCIÓN VEHICULAR — PUENTES FESTIVOS 2026
          </div>
          <div style={{ fontSize:12, color:"#475569", marginTop:3 }}>
            Vehículos con peso ≥ 3.4 toneladas · Red Vial Nacional Primaria · Colombia
          </div>
          <div style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>
            Fuente: Boletín Estratégico MinTransporte 19 mar 2026 · Res. 761/2013 y 2307/2014
          </div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:10, color:"#94a3b8" }}>SafeNode S.A.S · Área de Seguridad</div>
          <div style={{ fontSize:11, fontWeight:700, color:"#0f172a" }}>
            {now.toLocaleDateString("es-CO",{day:"numeric",month:"long",year:"numeric"})}
          </div>
        </div>
      </div>

      {/* Status */}
      {activo && (
        <div style={{ background:"#fef2f2", border:"2px solid #ef4444", borderRadius:6,
          padding:"10px 16px", marginBottom:20 }}>
          <strong style={{ color:"#dc2626" }}>🚫 RESTRICCIÓN ACTIVA: {activo.nombre}</strong>
        </div>
      )}

      {/* Main table */}
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, marginBottom:28 }}>
        <thead>
          <tr style={{ background:"#0f172a", color:"#fff" }}>
            {["Festivo","Inicio restricción","Fin restricción","Fuente"].map(h => (
              <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontWeight:700 }}>{h}</th>
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
            return (
              <tr key={p.id} style={{ background: i%2===0 ? "#f8fafc" : "#fff",
                borderBottom:"1px solid #e2e8f0" }}>
                <td style={{ padding:"8px 12px", fontWeight:700, color:"#0f172a" }}>{p.nombre}</td>
                <td style={{ padding:"8px 12px", color:"#dc2626", fontWeight:600 }}>
                  {p.inicio.toLocaleString("es-CO",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}
                </td>
                <td style={{ padding:"8px 12px", color:"#16a34a", fontWeight:600 }}>
                  {p.fin.toLocaleString("es-CO",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}
                </td>
                <td style={{ padding:"8px 12px" }}>
                  <span style={{ padding:"2px 8px", borderRadius:20, fontSize:9, fontWeight:800,
                    background: p.fuente==="oficial" ? "#f0fdf4" : "#fefce8",
                    color: p.fuente==="oficial" ? "#15803d" : "#b45309" }}>
                    {p.fuente==="oficial" ? "✓ OFICIAL" : "~ ESTIMADO"}
                  </span>
                  {" "}
                  <span style={{ padding:"2px 8px", borderRadius:20, fontSize:9, fontWeight:800,
                    background: status==="activa" ? "#fef2f2" : status==="proxima" ? "#fefce8" : "#f0fdf4",
                    color: status==="activa" ? "#dc2626" : status==="proxima" ? "#b45309" : "#15803d" }}>
                    {status==="activa" ? "ACTIVA" : status==="proxima" ? "PRÓXIMA" : "FINALIZADA"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Detail for upcoming */}
      {proximos.slice(0,3).map(p => (
        <div key={p.id} style={{ marginBottom:20, pageBreakInside:"avoid" as const }}>
          <div style={{ fontSize:13, fontWeight:800, color:"#0f172a",
            borderBottom:"2px solid #0f172a", paddingBottom:5, marginBottom:10 }}>
            {p.nombre}
            {p.fuente==="estimado" && <span style={{ fontSize:9, color:"#b45309",
              marginLeft:8, fontWeight:600 }}>HORARIO ESTIMADO</span>}
          </div>
          {p.nota && <div style={{ fontSize:10, color:"#92400e", background:"#fef3c7",
            padding:"6px 10px", borderRadius:4, marginBottom:8 }}>⚠️ {p.nota}</div>}
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:10 }}>
            <thead>
              <tr style={{ background:"#f1f5f9" }}>
                {["Día","Fecha","Horario","Aplicación"].map(h => (
                  <th key={h} style={{ padding:"5px 8px", textAlign:"left",
                    fontWeight:700, color:"#475569" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.horarios.map((r, i) => (
                <tr key={i} style={{ borderBottom:"1px solid #e2e8f0",
                  background: r.festivo ? "#fefce8" : i%2===0 ? "#f8fafc" : "#fff" }}>
                  <td style={{ padding:"5px 8px", fontWeight:700,
                    color: r.festivo ? "#b45309" : "#0f172a" }}>{r.dia}</td>
                  <td style={{ padding:"5px 8px", color:"#475569" }}>{r.fecha}</td>
                  <td style={{ padding:"5px 8px", fontWeight:700,
                    color: r.noAplica ? "#15803d" : "#dc2626" }}>{r.horario}</td>
                  <td style={{ padding:"5px 8px", color:"#64748b" }}>{r.aplicacion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* Exemptions + roads in 2 cols */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, marginBottom:20 }}>
        <div>
          <div style={{ fontSize:12, fontWeight:800, color:"#0f172a",
            borderBottom:"2px solid #0f172a", paddingBottom:4, marginBottom:8 }}>
            CARGA EXENTA (no aplica restricción)
          </div>
          {EXENCIONES_CARGA.map(ex => (
            <div key={ex} style={{ fontSize:10, color:"#334155", marginBottom:4 }}>
              ✓ {ex}
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize:12, fontWeight:800, color:"#0f172a",
            borderBottom:"2px solid #0f172a", paddingBottom:4, marginBottom:8 }}>
            VÍAS CON EXCEPCIÓN (NO aplica restricción)
          </div>
          {VIAS_EXCEPCION.map(v => (
            <div key={v} style={{ fontSize:10, color:"#334155", marginBottom:4 }}>✓ {v}</div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop:"1px solid #e2e8f0", paddingTop:10,
        display:"flex", justifyContent:"space-between", fontSize:9, color:"#94a3b8" }}>
        <div>SafeNode S.A.S · Área de Inteligencia en Seguridad del Transporte</div>
        <div>Documento informativo — Verificar con resolución oficial MinTransporte antes de programar despachos</div>
      </div>
    </div>
  );
}
