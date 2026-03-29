/* Calendario oficial de restricciones vehiculares Colombia 2026
   Fuente: Boletín MinTransporte — vehículos >= 3.4 toneladas */

export interface HorarioRow {
  dia: string;
  fecha: string;
  festivo?: boolean;
  horario: string;
  aplicacion: string;
  noAplica?: boolean;
}

export interface Puente {
  id: string;
  nombre: string;
  inicio: Date;
  fin: Date;
  fuente: "oficial" | "estimado";
  nota?: string;
  horarios: HorarioRow[];
}

export const PUENTES: Puente[] = [
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
    nota: "Dom 29, Lun 30, Mar 31 mar y Vie 3 abr: sin restricción nacional",
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
    nota: "Viernes inicia a las 14:00. Sábado Bogotá–Ibagué amplía hasta las 18:00.",
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
  {
    id: "boyaca-2026",
    nombre: "Batalla de Boyacá",
    inicio: new Date("2026-08-06T15:00:00"),
    fin:    new Date("2026-08-09T23:00:00"),
    fuente: "estimado",
    nota: "Horarios estimados — pendiente boletín oficial segundo semestre MinTransporte.",
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
    nota: "Horarios estimados — pendiente boletín oficial.",
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
    horarios: [
      { dia:"LUNES",   fecha:"7 dic 2026",  horario:"15:00–22:00", aplicacion:"Cundinamarca éxodo + Bogotá–Ibagué (ambos sentidos)" },
      { dia:"MAR (F)", fecha:"8 dic 2026",  festivo:true, horario:"06:00–15:00", aplicacion:"Todas las vías (ambos sentidos)" },
    ],
  },
  {
    id: "navidad-2026",
    nombre: "Navidad",
    inicio: new Date("2026-12-24T15:00:00"),
    fin:    new Date("2026-12-28T23:00:00"),
    fuente: "estimado",
    nota: "Horarios estimados — sin restricción el 25 (festivo nacional).",
    horarios: [
      { dia:"JUEVES",   fecha:"24 dic 2026", horario:"15:00–22:00", aplicacion:"Cundinamarca éxodo + Bogotá–Ibagué (ambos sentidos)" },
      { dia:"VIE (F)",  fecha:"25 dic 2026", festivo:true, horario:"NO APLICA", aplicacion:"Sin restricción — Día de Navidad", noAplica:true },
      { dia:"SÁBADO",   fecha:"26 dic 2026", horario:"15:00–23:00", aplicacion:"Solo retorno: Ibagué–Bogotá" },
      { dia:"DOMINGO",  fecha:"27 dic 2026", horario:"10:00–23:00", aplicacion:"Todas las vías (ambos sentidos)" },
      { dia:"LUNES",    fecha:"28 dic 2026", horario:"10:00–23:00", aplicacion:"Todas las vías (ambos sentidos)" },
    ],
  },
];

/** Devuelve el puente que inicia dentro de los próximos `daysAhead` días desde `now`. */
export function findUpcomingPuente(daysAhead: number, now: Date = new Date()): Puente | null {
  const windowEnd = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  return PUENTES.find(p => p.inicio > now && p.inicio <= windowEnd) ?? null;
}
