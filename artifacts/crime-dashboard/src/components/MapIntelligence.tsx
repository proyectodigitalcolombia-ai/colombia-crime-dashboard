import { useState, useCallback, useEffect } from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  useGetBlockades,
  useGetCrimesByDepartment,
} from "@workspace/api-client-react";
import {
  Layers, Eye, EyeOff, AlertTriangle, MapPin, Moon, Shield, Route,
  ChevronLeft, ChevronRight, Info, Building2, Hospital, Car,
} from "lucide-react";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const GEO_URL =
  "https://gist.githubusercontent.com/john-guerra/43c7656821069d00dcbc/raw/be6a6e239cd5b5b803c6e7c2ec405b793a9064dd/colombia.geo.json";

/* ═══════════════════════════════════════════════════════
   DATOS ESTÁTICOS — COLOMBIA
   ═══════════════════════════════════════════════════════ */

const ARMED: Record<string, { level: number; groups: string[] }> = {
  "Bogotá D.C.": { level: 0, groups: [] }, "Cundinamarca": { level: 1, groups: ["Disidencias FARC"] },
  "Boyacá": { level: 1, groups: ["ELN"] }, "Antioquia": { level: 2, groups: ["Clan del Golfo","Disidencias FARC"] },
  "Caldas": { level: 1, groups: ["Disidencias FARC"] }, "Risaralda": { level: 1, groups: ["Disidencias FARC"] },
  "Quindío": { level: 0, groups: [] }, "Valle del Cauca": { level: 2, groups: ["Disidencias FARC","Clan del Golfo"] },
  "Cauca": { level: 3, groups: ["Estado Mayor Central","ELN"] }, "Nariño": { level: 3, groups: ["Estado Mayor Central","ELN"] },
  "Tolima": { level: 2, groups: ["Disidencias FARC"] }, "Huila": { level: 2, groups: ["Disidencias FARC"] },
  "Meta": { level: 2, groups: ["Estado Mayor Central"] }, "Casanare": { level: 2, groups: ["Disidencias FARC"] },
  "Arauca": { level: 3, groups: ["ELN","Disidencias FARC"] }, "Santander": { level: 1, groups: ["ELN"] },
  "Norte de Santander": { level: 2, groups: ["ELN","Clan del Golfo"] }, "Bolívar": { level: 2, groups: ["Clan del Golfo","ELN"] },
  "Atlántico": { level: 1, groups: ["Clan del Golfo"] }, "Córdoba": { level: 3, groups: ["Clan del Golfo"] },
  "Sucre": { level: 2, groups: ["Clan del Golfo"] }, "Cesar": { level: 2, groups: ["Clan del Golfo","ELN"] },
  "Magdalena": { level: 2, groups: ["Clan del Golfo"] }, "La Guajira": { level: 1, groups: ["Clan del Golfo"] },
  "Chocó": { level: 3, groups: ["Clan del Golfo","ELN"] }, "Caquetá": { level: 3, groups: ["Estado Mayor Central"] },
  "Putumayo": { level: 3, groups: ["Estado Mayor Central"] }, "Guaviare": { level: 2, groups: ["Estado Mayor Central"] },
  "Vichada": { level: 1, groups: ["Disidencias FARC"] }, "Guainía": { level: 1, groups: ["Disidencias FARC"] },
  "Vaupés": { level: 1, groups: ["Disidencias FARC"] }, "Amazonas": { level: 0, groups: [] },
};

const NIGHT_RISK: Record<string, number> = {
  "Bogotá D.C.": 55, "Cundinamarca": 70, "Boyacá": 65, "Antioquia": 72, "Caldas": 60,
  "Risaralda": 58, "Quindío": 55, "Valle del Cauca": 68, "Cauca": 75, "Nariño": 78,
  "Tolima": 72, "Huila": 68, "Meta": 80, "Casanare": 75, "Arauca": 82,
  "Santander": 65, "Norte de Santander": 70, "Bolívar": 62, "Atlántico": 50, "Córdoba": 65,
  "Sucre": 60, "Cesar": 68, "Magdalena": 65, "La Guajira": 60, "Chocó": 75,
  "Caquetá": 80, "Putumayo": 82, "Guaviare": 78, "Vichada": 70, "Guainía": 65,
  "Vaupés": 70, "Amazonas": 60,
};

const ROAD: Record<string, { score: "good"|"regular"|"difficult"; notes: string }> = {
  "Bogotá D.C.": { score:"good", notes:"Acceso urbano controlado" }, "Cundinamarca": { score:"regular", notes:"Tramo La Vega: curvas y neblina" },
  "Boyacá": { score:"regular", notes:"Alto de Sote: deslizamientos en lluvias" }, "Antioquia": { score:"regular", notes:"Túnel de Occidente: restricciones de altura" },
  "Caldas": { score:"difficult", notes:"Vía Neira-Irra: derrumbes frecuentes" }, "Risaralda": { score:"good", notes:"Doble calzada en buen estado" },
  "Quindío": { score:"good", notes:"Autopista del Café en buen estado" }, "Valle del Cauca": { score:"good", notes:"Mayores desvíos en zonas rurales" },
  "Cauca": { score:"difficult", notes:"Bloqueos frecuentes. Popayán-Piendamó: alto riesgo" }, "Nariño": { score:"difficult", notes:"Vía Rumichaca: neblina y deslizamientos" },
  "Tolima": { score:"regular", notes:"Zona de Fresno: curvas pronunciadas" }, "Huila": { score:"regular", notes:"Vía Neiva-Mocoa: tramos sin pavimentar" },
  "Meta": { score:"good", notes:"Llano abierto, atención en neblina" }, "Casanare": { score:"regular", notes:"Sin doble calzada, vigilancia reducida" },
  "Arauca": { score:"difficult", notes:"Vías en mal estado, sin doble calzada" }, "Santander": { score:"good", notes:"Ruta del Sol en buen estado" },
  "Norte de Santander": { score:"regular", notes:"Cúcuta-Tibú: zona de conflicto" }, "Bolívar": { score:"regular", notes:"Mompox: barcazas en temporada seca" },
  "Atlántico": { score:"good", notes:"Acceso a puertos en buen estado" }, "Córdoba": { score:"regular", notes:"Accesos rurales en mal estado" },
  "Sucre": { score:"regular", notes:"Inundaciones en temporada" }, "Cesar": { score:"good", notes:"Troncal del Caribe en buen estado" },
  "Magdalena": { score:"regular", notes:"Santa Marta: tráfico portuario alto" }, "La Guajira": { score:"regular", notes:"Accesos secundarios sin pavimentar" },
  "Chocó": { score:"difficult", notes:"Sin vías pavimentadas en mayoría" }, "Caquetá": { score:"difficult", notes:"Vías en mal estado, lluvias frecuentes" },
  "Putumayo": { score:"difficult", notes:"Tramos inestables" }, "Guaviare": { score:"difficult", notes:"Acceso fluvial o aéreo" },
  "Vichada": { score:"difficult", notes:"Sin vías primarias" }, "Guainía": { score:"difficult", notes:"Sin vías primarias" },
  "Vaupés": { score:"difficult", notes:"Sin vías terrestres" }, "Amazonas": { score:"difficult", notes:"Acceso fluvial/aéreo" },
};

/* ── PEAJES COLOMBIA (fuente: INVIAS / ANI) ── */
interface Peaje { name: string; route: string; lat: number; lng: number; dept: string; tarifa_c2?: string; }
const PEAJES: Peaje[] = [
  { name: "Peaje Chusacá",        route: "Ruta 40 Bogotá-Girardot",          lat: 4.424,  lng: -74.415, dept: "Cundinamarca",    tarifa_c2: "$14.200" },
  { name: "Peaje Mondoñedo",      route: "Ruta 50 Bogotá-Medellín",          lat: 4.731,  lng: -74.402, dept: "Cundinamarca",    tarifa_c2: "$11.900" },
  { name: "Peaje El Rosal",       route: "Ruta 50 Bogotá-Medellín",          lat: 4.851,  lng: -74.263, dept: "Cundinamarca",    tarifa_c2: "$12.600" },
  { name: "Peaje Alto del Vino",  route: "Ruta 50 Bogotá-Medellín",          lat: 5.091,  lng: -74.548, dept: "Cundinamarca",    tarifa_c2: "$13.400" },
  { name: "Peaje Villeta",        route: "Ruta 50 Bogotá-Medellín",          lat: 5.018,  lng: -74.475, dept: "Cundinamarca",    tarifa_c2: "$11.200" },
  { name: "Peaje La Vega",        route: "Ruta 50 Bogotá-Medellín",          lat: 4.999,  lng: -74.340, dept: "Cundinamarca",    tarifa_c2: "$10.800" },
  { name: "Peaje Guaduas",        route: "Ruta 50 Bogotá-Medellín",          lat: 5.067,  lng: -74.588, dept: "Cundinamarca",    tarifa_c2: "$12.100" },
  { name: "Peaje Puerto Salgar",  route: "Ruta 50 Bogotá-Medellín",          lat: 5.471,  lng: -74.659, dept: "Cundinamarca",    tarifa_c2: "$10.500" },
  { name: "Peaje Cisneros",       route: "Ruta 60 Medellín-Bogotá",          lat: 6.535,  lng: -74.817, dept: "Antioquia",       tarifa_c2: "$11.700" },
  { name: "Peaje San Mateo",      route: "Ruta 62 Medellín-Bogotá",          lat: 6.174,  lng: -75.601, dept: "Antioquia",       tarifa_c2: "$14.800" },
  { name: "Peaje Hatillo",        route: "Ruta 62 Medellín-Bogotá",          lat: 6.090,  lng: -75.478, dept: "Antioquia",       tarifa_c2: "$13.200" },
  { name: "Peaje La Pintada",     route: "Ruta 25 Medellín-Cali",            lat: 5.753,  lng: -75.596, dept: "Antioquia",       tarifa_c2: "$12.900" },
  { name: "Peaje Camilo C.",      route: "Ruta 62 Antioquia",                lat: 6.448,  lng: -75.272, dept: "Antioquia",       tarifa_c2: "$11.500" },
  { name: "Peaje La Felisa",      route: "Ruta 25 Caldas-Valle",             lat: 5.514,  lng: -75.649, dept: "Caldas",          tarifa_c2: "$13.600" },
  { name: "Peaje Irra",           route: "Ruta 25 Eje Cafetero",             lat: 5.367,  lng: -75.567, dept: "Caldas",          tarifa_c2: "$10.200" },
  { name: "Peaje Armenia",        route: "Ruta 40 Eje Cafetero",             lat: 4.534,  lng: -75.675, dept: "Quindío",         tarifa_c2: "$9.800"  },
  { name: "Peaje Cartago",        route: "Ruta 25 Risaralda-Valle",          lat: 4.755,  lng: -75.913, dept: "Valle del Cauca", tarifa_c2: "$11.100" },
  { name: "Peaje Mediacanoa",     route: "Ruta 25 Bogotá-Cali",              lat: 3.756,  lng: -76.256, dept: "Valle del Cauca", tarifa_c2: "$13.800" },
  { name: "Peaje Buga",           route: "Ruta 25 Bogotá-Cali",              lat: 3.902,  lng: -76.297, dept: "Valle del Cauca", tarifa_c2: "$12.400" },
  { name: "Peaje Tulúa",          route: "Ruta 25 Bogotá-Cali",              lat: 4.094,  lng: -76.193, dept: "Valle del Cauca", tarifa_c2: "$11.300" },
  { name: "Peaje La Paila",       route: "Ruta 25 Valle-Eje Cafetero",       lat: 4.308,  lng: -75.905, dept: "Valle del Cauca", tarifa_c2: "$10.700" },
  { name: "Peaje Palmaseca",      route: "Ruta 25 Cali-Norte",               lat: 3.668,  lng: -76.382, dept: "Valle del Cauca", tarifa_c2: "$9.500"  },
  { name: "Peaje La Uribe",       route: "Ruta 25 Cali-Popayán",             lat: 3.108,  lng: -76.542, dept: "Cauca",           tarifa_c2: "$12.700" },
  { name: "Peaje Pescador",       route: "Ruta 25 Cauca",                    lat: 2.716,  lng: -76.499, dept: "Cauca",           tarifa_c2: "$11.600" },
  { name: "Peaje La Ye",          route: "Ruta 45A Bogotá-Bucaramanga",      lat: 5.532,  lng: -73.376, dept: "Boyacá",          tarifa_c2: "$13.100" },
  { name: "Peaje Puente Nacional", route: "Ruta 45A Bogotá-Bucaramanga",     lat: 5.879,  lng: -73.690, dept: "Santander",       tarifa_c2: "$10.900" },
  { name: "Peaje San Gil",        route: "Ruta 45A Bucaramanga-Bogotá",      lat: 6.556,  lng: -73.135, dept: "Santander",       tarifa_c2: "$12.300" },
  { name: "Peaje Ruitoque",       route: "Ruta 66 Bucaramanga-Bogotá",       lat: 7.014,  lng: -73.067, dept: "Santander",       tarifa_c2: "$11.000" },
  { name: "Peaje Lebrija",        route: "Ruta 45A Norte",                   lat: 7.121,  lng: -73.218, dept: "Santander",       tarifa_c2: "$10.300" },
  { name: "Peaje La Caro",        route: "Autopista Norte Bogotá",            lat: 4.919,  lng: -74.010, dept: "Cundinamarca",    tarifa_c2: "$9.200"  },
  { name: "Peaje Briceño",        route: "Autopista Norte Bogotá-Tunja",      lat: 5.223,  lng: -74.023, dept: "Cundinamarca",    tarifa_c2: "$9.700"  },
  { name: "Peaje Neusa",          route: "Ruta 45 Bogotá-Tunja",             lat: 5.265,  lng: -73.914, dept: "Cundinamarca",    tarifa_c2: "$10.400" },
  { name: "Peaje Ventaquemada",   route: "Ruta 55 Tunja-Bogotá",             lat: 5.353,  lng: -73.518, dept: "Boyacá",          tarifa_c2: "$9.100"  },
  { name: "Peaje Tunja Norte",    route: "Ruta 55 Boyacá",                   lat: 5.597,  lng: -73.316, dept: "Boyacá",          tarifa_c2: "$10.600" },
  { name: "Peaje Barbosa",        route: "Ruta 45A Bogotá-Bucaramanga",      lat: 5.936,  lng: -73.618, dept: "Santander",       tarifa_c2: "$11.800" },
  { name: "Peaje Girardot",       route: "Ruta 40 Bogotá-Ibagué",            lat: 4.303,  lng: -74.802, dept: "Cundinamarca",    tarifa_c2: "$10.100" },
  { name: "Peaje Espinal",        route: "Ruta 40 Ibagué-Neiva",             lat: 4.153,  lng: -74.883, dept: "Tolima",          tarifa_c2: "$9.900"  },
  { name: "Peaje Neiva",          route: "Ruta 45 Neiva-Bogotá",             lat: 2.935,  lng: -75.291, dept: "Huila",           tarifa_c2: "$12.000" },
  { name: "Peaje Bosconia",       route: "Ruta 80 Costa Atlántica",          lat: 9.971,  lng: -73.878, dept: "Cesar",           tarifa_c2: "$10.500" },
  { name: "Peaje Ciénaga",        route: "Ruta 90 Santa Marta-Barranquilla", lat: 11.001, lng: -74.251, dept: "Magdalena",       tarifa_c2: "$8.700"  },
  { name: "Peaje Galapa",         route: "Ruta 90 Barranquilla-Cartagena",   lat: 10.899, lng: -74.889, dept: "Atlántico",       tarifa_c2: "$8.900"  },
  { name: "Peaje Turbaco",        route: "Ruta 90 Cartagena-Montería",       lat: 10.328, lng: -75.421, dept: "Bolívar",         tarifa_c2: "$9.300"  },
  { name: "Peaje Sincelejo",      route: "Ruta 25 Costa",                    lat: 9.304,  lng: -75.397, dept: "Sucre",           tarifa_c2: "$8.500"  },
  { name: "Peaje Montería",       route: "Ruta 25 Córdoba",                  lat: 8.757,  lng: -75.889, dept: "Córdoba",         tarifa_c2: "$9.100"  },
];

/* ── POLICÍA DE CARRETERAS (fuente: Policía Nacional) ── */
interface PuestoPolicia { name: string; sector: string; lat: number; lng: number; dept: string; tipo: string; }
const POLICIA_CARRETERAS: PuestoPolicia[] = [
  { name: "Base Carreteras Norte",      sector: "Autopista Norte Km 18",           lat: 4.914,  lng: -74.052, dept: "Bogotá D.C.",   tipo: "Base" },
  { name: "Base Carreteras Sur",        sector: "Autopista Sur Km 14",             lat: 4.521,  lng: -74.138, dept: "Cundinamarca",   tipo: "Base" },
  { name: "Puesto Carreteras Anolaima", sector: "Vía Bogotá-Honda Km 55",          lat: 4.768,  lng: -74.462, dept: "Cundinamarca",   tipo: "Puesto" },
  { name: "Puesto Carreteras Villeta",  sector: "Ruta 50 Km 80",                   lat: 5.014,  lng: -74.473, dept: "Cundinamarca",   tipo: "Puesto" },
  { name: "Base Carreteras Honda",      sector: "Intersección Honda-La Dorada",    lat: 5.213,  lng: -74.740, dept: "Cundinamarca",   tipo: "Base" },
  { name: "Puesto Carreteras La Ye",    sector: "Ruta 45A Boyacá Km 105",          lat: 5.533,  lng: -73.374, dept: "Boyacá",         tipo: "Puesto" },
  { name: "Base Carreteras Tunja",      sector: "Ruta 55 Norte de Tunja",          lat: 5.611,  lng: -73.353, dept: "Boyacá",         tipo: "Base" },
  { name: "Puesto Carreteras Sogamoso", sector: "Ruta 55 Boyacá",                  lat: 5.717,  lng: -72.932, dept: "Boyacá",         tipo: "Puesto" },
  { name: "Base Carreteras Bucaramanga",sector: "Autopista Florida-Piedecuesta",   lat: 7.013,  lng: -73.140, dept: "Santander",      tipo: "Base" },
  { name: "Puesto Carreteras San Gil",  sector: "Ruta 45A San Gil",                lat: 6.555,  lng: -73.136, dept: "Santander",      tipo: "Puesto" },
  { name: "Puesto Carreteras Barranca", sector: "Vía Barrancabermeja-Bogotá",      lat: 7.064,  lng: -73.852, dept: "Santander",      tipo: "Puesto" },
  { name: "Base Carreteras Medellín N", sector: "Autopista Norte Medellín Km 10",  lat: 6.353,  lng: -75.544, dept: "Antioquia",      tipo: "Base" },
  { name: "Base Carreteras Medellín S", sector: "Autopista Sur Medellín",          lat: 6.168,  lng: -75.606, dept: "Antioquia",      tipo: "Base" },
  { name: "Puesto Carreteras La Pintada",sector:"Ruta 25 Antioquia-Caldas",        lat: 5.752,  lng: -75.596, dept: "Antioquia",      tipo: "Puesto" },
  { name: "Puesto Carreteras Manizales", sector:"Autopista Manizales-Bogotá",      lat: 5.070,  lng: -75.510, dept: "Caldas",         tipo: "Puesto" },
  { name: "Base Carreteras Pereira",    sector: "Ruta 25 Pereira",                 lat: 4.811,  lng: -75.694, dept: "Risaralda",      tipo: "Base" },
  { name: "Base Carreteras Cali N",     sector: "Autopista Cali-Bogotá",           lat: 3.553,  lng: -76.362, dept: "Valle del Cauca",tipo: "Base" },
  { name: "Puesto Carreteras Buga",     sector: "Ruta 25 Buga",                    lat: 3.903,  lng: -76.296, dept: "Valle del Cauca",tipo: "Puesto" },
  { name: "Puesto Carreteras Palmira",  sector: "Ruta 25 Palmira-Cali",            lat: 3.534,  lng: -76.303, dept: "Valle del Cauca",tipo: "Puesto" },
  { name: "Base Carreteras Popayán",    sector: "Ruta 25 Popayán",                 lat: 2.442,  lng: -76.606, dept: "Cauca",          tipo: "Base" },
  { name: "Puesto Carreteras Pasto",    sector: "Ruta 25 Pasto-Ipiales",           lat: 1.213,  lng: -77.281, dept: "Nariño",         tipo: "Puesto" },
  { name: "Base Carreteras Ibagué",     sector: "Ruta 40 Ibagué",                  lat: 4.432,  lng: -75.241, dept: "Tolima",         tipo: "Base" },
  { name: "Puesto Carreteras Girardot", sector: "Ruta 40 Girardot",                lat: 4.302,  lng: -74.803, dept: "Cundinamarca",   tipo: "Puesto" },
  { name: "Base Carreteras Neiva",      sector: "Ruta 45A Neiva",                  lat: 2.934,  lng: -75.290, dept: "Huila",          tipo: "Base" },
  { name: "Puesto Carreteras Villavicencio",sector:"Ruta 40 Villavicencio",       lat: 4.151,  lng: -73.636, dept: "Meta",           tipo: "Puesto" },
  { name: "Base Carreteras Barranquilla",sector:"Ruta 90 Barranquilla",            lat: 10.961, lng: -74.797, dept: "Atlántico",      tipo: "Base" },
  { name: "Puesto Carreteras Santa Marta",sector:"Ruta 90 Santa Marta",            lat: 11.232, lng: -74.199, dept: "Magdalena",      tipo: "Puesto" },
  { name: "Base Carreteras Cartagena",  sector: "Ruta 90 Cartagena",               lat: 10.391, lng: -75.479, dept: "Bolívar",        tipo: "Base" },
  { name: "Puesto Carreteras Montería", sector: "Ruta 25 Montería",                lat: 8.758,  lng: -75.888, dept: "Córdoba",        tipo: "Puesto" },
  { name: "Base Carreteras Cúcuta",     sector: "Ruta 55 Cúcuta",                  lat: 7.890,  lng: -72.507, dept: "Norte de Santander",tipo:"Base" },
  { name: "Puesto Carreteras Arauca",   sector: "Vía Arauca-Tame",                 lat: 7.083,  lng: -70.758, dept: "Arauca",         tipo: "Puesto" },
];

/* ── HOSPITALES DE REFERENCIA (fuente: Min. Salud) ── */
interface Hospital { name: string; city: string; level: string; lat: number; lng: number; dept: string; tel?: string; }
const HOSPITALES: Hospital[] = [
  { name: "Hospital Santa Clara",       city: "Bogotá",        level: "III", lat: 4.610,  lng: -74.085, dept: "Bogotá D.C.",   tel: "(601) 362-3900" },
  { name: "Hospital El Tunal",          city: "Bogotá",        level: "III", lat: 4.542,  lng: -74.126, dept: "Bogotá D.C.",   tel: "(601) 276-8900" },
  { name: "Hospital La Victoria",       city: "Bogotá",        level: "III", lat: 4.583,  lng: -74.068, dept: "Bogotá D.C.",   tel: "(601) 327-9500" },
  { name: "Hospital Simón Bolívar",     city: "Bogotá",        level: "III", lat: 4.706,  lng: -74.055, dept: "Bogotá D.C.",   tel: "(601) 660-7676" },
  { name: "Hospital Pablo Tobón Uribe", city: "Medellín",      level: "IV",  lat: 6.269,  lng: -75.574, dept: "Antioquia",     tel: "(604) 445-9000" },
  { name: "Clínica Las Américas",       city: "Medellín",      level: "IV",  lat: 6.231,  lng: -75.604, dept: "Antioquia",     tel: "(604) 342-1010" },
  { name: "Hospital San Vicente",       city: "Medellín",      level: "IV",  lat: 6.300,  lng: -75.562, dept: "Antioquia",     tel: "(604) 516-6666" },
  { name: "Hospital Universitario de Caldas", city:"Manizales",level:"III",  lat: 5.065,  lng: -75.510, dept: "Caldas",        tel: "(606) 879-8080" },
  { name: "Hospital San Juan de Dios",  city: "Armenia",       level: "III", lat: 4.533,  lng: -75.672, dept: "Quindío",       tel: "(606) 740-8000" },
  { name: "Hospital Santa Mónica",      city: "Dosquebradas", level: "III",  lat: 4.837,  lng: -75.682, dept: "Risaralda",     tel: "(606) 330-0300" },
  { name: "Hospital Universitario del Valle", city:"Cali",     level:"IV",   lat: 3.437,  lng: -76.548, dept: "Valle del Cauca",tel:"(602) 620-1080" },
  { name: "Clínica Imbanaco",           city: "Cali",          level: "IV",  lat: 3.430,  lng: -76.537, dept: "Valle del Cauca",tel:"(602) 682-1000" },
  { name: "Hospital Universitario Hernando Moncaleano",city:"Neiva",level:"III",lat:2.937,lng:-75.288, dept:"Huila",            tel:"(608) 875-0052" },
  { name: "Hospital Universitario de Santander", city:"Bucaramanga",level:"III",lat:7.126,lng:-73.121, dept:"Santander",        tel:"(607) 634-6110" },
  { name: "Clínica Chicamocha",         city: "Bucaramanga",   level: "III", lat: 7.112,  lng: -73.113, dept: "Santander",      tel: "(607) 657-9800" },
  { name: "Hospital Erasmo Meoz",       city: "Cúcuta",        level: "III", lat: 7.891,  lng: -72.514, dept: "Norte de Santander",tel:"(607) 582-7000"},
  { name: "Hospital Federico Lleras Acosta", city:"Ibagué",    level:"III",  lat: 4.434,  lng: -75.238, dept: "Tolima",         tel: "(608) 277-0700" },
  { name: "Hospital San Rafael",        city: "Tunja",         level: "III", lat: 5.541,  lng: -73.358, dept: "Boyacá",         tel: "(608) 744-3900" },
  { name: "Hospital San Jorge",         city: "Pereira",       level: "III", lat: 4.804,  lng: -75.694, dept: "Risaralda",      tel: "(606) 315-3800" },
  { name: "Hospital Universitario Cari",city:"Barranquilla",   level:"III",  lat: 10.980, lng: -74.784, dept: "Atlántico",      tel: "(605) 370-5740" },
  { name: "Clínica General del Norte",  city: "Barranquilla",  level: "III", lat: 10.974, lng: -74.808, dept: "Atlántico",      tel: "(605) 340-1111" },
  { name: "Hospital Universitario San Jorge",city:"Cartagena",level:"III",   lat: 10.402, lng: -75.510, dept: "Bolívar",        tel: "(605) 660-0100" },
  { name: "Hospital Santa Rosa de Osos",city:"Santa Rosa",     level:"II",   lat: 6.636,  lng: -75.460, dept: "Antioquia",      tel: "(604) 855-5000" },
  { name: "Hospital Marco Fidel Suárez",city:"Bello",          level:"III",  lat: 6.352,  lng: -75.558, dept: "Antioquia",      tel: "(604) 452-0450" },
  { name: "ESE Hospital San Francisco", city:"Villavicencio",  level:"III",  lat: 4.153,  lng: -73.638, dept: "Meta",           tel: "(608) 673-0000" },
  { name: "Hospital Civil de Ipiales",  city:"Ipiales",        level:"II",   lat: 0.832,  lng: -77.644, dept: "Nariño",         tel: "(602) 773-4000" },
  { name: "Hospital Susana López de Valencia",city:"Popayán",  level:"III",  lat: 2.439,  lng: -76.607, dept: "Cauca",          tel: "(602) 820-9060" },
  { name: "Hospital Departamental de Nariño",city:"Pasto",     level:"III",  lat: 1.215,  lng: -77.282, dept: "Nariño",         tel: "(602) 729-7777" },
  { name: "Hospital Rosario Pumarejo",  city:"Valledupar",     level:"III",  lat: 10.481, lng: -73.249, dept: "Cesar",          tel: "(605) 581-0610" },
  { name: "Hospital Regional de Urabá", city:"Apartadó",       level:"II",   lat: 7.884,  lng: -76.627, dept: "Antioquia",      tel: "(604) 828-3333" },
];

/* ── EJÉRCITO NACIONAL — Brigadas y Batallones (fuente: Ejército Nacional de Colombia) ── */
interface BaseEjercito { name: string; unidad: string; division: string; lat: number; lng: number; dept: string; tipo: string; address?: string; tel?: string; }
const EJERCITO: BaseEjercito[] = [
  { name:"Escuela Militar de Cadetes 'J.M. Córdova'", unidad:"ESMIC",        division:"Comandancia General", lat: 4.612,  lng:-74.065, dept:"Bogotá D.C.",          tipo:"Escuela",           address:"Calle 80 No. 38A-00, Bogotá",                  tel:"(601) 220-0200" },
  { name:"Comando Ejército Nacional",                  unidad:"Comandancia",  division:"Comandancia General", lat: 4.617,  lng:-74.074, dept:"Bogotá D.C.",          tipo:"Comando",           address:"Av. El Dorado CAN, Bogotá",                    tel:"(601) 220-7700" },
  { name:"Centro de Entrenamiento Tolemaida",          unidad:"CENAE",        division:"Comandancia General", lat: 4.082,  lng:-74.647, dept:"Cundinamarca",         tipo:"Centro Instrucción",address:"Vía Bogotá–Girardot Km 95, Nilo",              tel:"(608) 244-3000" },
  { name:"Brigada 1 — Bogotá",                         unidad:"BR1",          division:"1ª División",         lat: 4.614,  lng:-74.069, dept:"Bogotá D.C.",          tipo:"Brigada",           address:"Carrera 52 No. 13-00, Bogotá",                 tel:"(601) 220-7000" },
  { name:"Brigada 13 — Bogotá",                        unidad:"BR13",         division:"1ª División",         lat: 4.698,  lng:-74.082, dept:"Bogotá D.C.",          tipo:"Brigada",           address:"Av. El Dorado No. 66B-00, Bogotá",             tel:"(601) 220-5100" },
  { name:"Brigada 8 — Villavicencio",                  unidad:"BR8",          division:"4ª División",         lat: 4.148,  lng:-73.640, dept:"Meta",                 tipo:"Brigada",           address:"Calle 44 No. 22-00, Villavicencio",            tel:"(608) 662-8000" },
  { name:"Brigada 7 — Villavicencio",                  unidad:"BR7",          division:"4ª División",         lat: 4.153,  lng:-73.635, dept:"Meta",                 tipo:"Brigada",           address:"Calle 21 No. 38-60, Villavicencio",            tel:"(608) 673-5000" },
  { name:"Brigada 22 — Puerto Inírida",                unidad:"BR22",         division:"4ª División",         lat: 3.866,  lng:-67.927, dept:"Guainía",              tipo:"Brigada",           address:"Av. Colombia s/n, Puerto Inírida" },
  { name:"Brigada 28 — San José del Guaviare",         unidad:"BR28",         division:"4ª División",         lat: 2.575,  lng:-72.644, dept:"Guaviare",             tipo:"Brigada",           address:"Carrera 21 s/n, San José del Guaviare" },
  { name:"Brigada 12 — Florencia",                     unidad:"BR12",         division:"6ª División",         lat: 1.614,  lng:-75.607, dept:"Caquetá",              tipo:"Brigada",           address:"Calle 15 No. 10-00, Florencia",                tel:"(608) 435-5000" },
  { name:"Brigada 26 — Mocoa",                         unidad:"BR26",         division:"6ª División",         lat: 1.149,  lng:-76.649, dept:"Putumayo",             tipo:"Brigada",           address:"Carrera 8 No. 10-00, Mocoa",                  tel:"(608) 420-5000" },
  { name:"Brigada 27 — Larandia",                      unidad:"BR27 / BAFIM", division:"6ª División",         lat: 1.487,  lng:-75.273, dept:"Caquetá",              tipo:"Brigada",           address:"Vía Florencia–La Montañita Km 12, Caquetá" },
  { name:"Brigada 4 — Medellín",                       unidad:"BR4",          division:"7ª División",         lat: 6.270,  lng:-75.568, dept:"Antioquia",            tipo:"Brigada",           address:"Calle 30 No. 65A-01, Medellín",               tel:"(604) 250-0400" },
  { name:"Brigada 11 — Montería",                      unidad:"BR11",         division:"7ª División",         lat: 8.759,  lng:-75.887, dept:"Córdoba",              tipo:"Brigada",           address:"Carrera 2 No. 30-50, Montería",               tel:"(604) 782-5000" },
  { name:"Brigada 17 — Carepa (Urabá)",                unidad:"BR17",         division:"7ª División",         lat: 7.764,  lng:-76.655, dept:"Antioquia",            tipo:"Brigada",           address:"Calle 75 s/n, Carepa, Antioquia" },
  { name:"Brigada 14 — Bogotá (Movilizable)",          unidad:"BR14",         division:"5ª División",         lat: 4.620,  lng:-74.060, dept:"Bogotá D.C.",          tipo:"Brigada",           address:"Av. El Dorado CAN, Bogotá",                    tel:"(601) 220-8000" },
  { name:"Brigada 2 — Barranquilla",                   unidad:"BR2",          division:"8ª División",         lat: 10.962, lng:-74.803, dept:"Atlántico",            tipo:"Brigada",           address:"Calle 17 No. 14-100, Barranquilla",           tel:"(605) 330-5000" },
  { name:"Brigada 10 — Valledupar",                    unidad:"BR10",         division:"8ª División",         lat: 10.477, lng:-73.254, dept:"Cesar",                tipo:"Brigada",           address:"Carrera 9 No. 16-20, Valledupar",             tel:"(605) 574-5000" },
  { name:"Brigada 5 — Bucaramanga",                    unidad:"BR5",          division:"2ª División",         lat: 7.127,  lng:-73.122, dept:"Santander",            tipo:"Brigada",           address:"Carrera 15 No. 33-54, Bucaramanga",           tel:"(607) 634-5000" },
  { name:"Brigada 30 — Cúcuta",                        unidad:"BR30",         division:"2ª División",         lat: 7.887,  lng:-72.503, dept:"Norte de Santander",   tipo:"Brigada",           address:"Av. 7 No. 1E-60, Cúcuta",                     tel:"(607) 591-5000" },
  { name:"Brigada 3 — Cali",                           unidad:"BR3",          division:"3ª División",         lat: 3.434,  lng:-76.541, dept:"Valle del Cauca",      tipo:"Brigada",           address:"Carrera 1 No. 26-20, Cali",                   tel:"(602) 883-5000" },
  { name:"Brigada 23 — Popayán",                       unidad:"BR23",         division:"3ª División",         lat: 2.442,  lng:-76.607, dept:"Cauca",                tipo:"Brigada",           address:"Carrera 9 No. 20-00, Popayán",                tel:"(602) 820-5000" },
  { name:"Brigada 29 — Pasto",                         unidad:"BR29",         division:"3ª División",         lat: 1.215,  lng:-77.281, dept:"Nariño",               tipo:"Brigada",           address:"Av. Panamericana No. 1-35, Pasto",             tel:"(602) 729-5000" },
  { name:"Brigada 18 — Arauca",                        unidad:"BR18",         division:"2ª División",         lat: 7.085,  lng:-70.761, dept:"Arauca",               tipo:"Brigada",           address:"Carrera 22 No. 18-00, Arauca",                tel:"(607) 885-5000" },
  { name:"Brigada de Selva 16 — Leticia",              unidad:"BSELT",        division:"4ª División",         lat:-4.192,  lng:-69.939, dept:"Amazonas",             tipo:"Brigada Selva",     address:"Carrera 11 s/n, Leticia" },
  { name:"Brigada Fluvial 1 — Barrancabermeja",        unidad:"BRFLU1",       division:"2ª División",         lat: 7.063,  lng:-73.852, dept:"Santander",            tipo:"Brigada Fluvial",   address:"Av. El Centro s/n, Barrancabermeja",          tel:"(607) 622-5000" },
  { name:"Batallón San Mateo — Pereira",               unidad:"BASAN",        division:"3ª División",         lat: 4.812,  lng:-75.696, dept:"Risaralda",            tipo:"Batallón",          address:"Calle 50 No. 12-20, Pereira",                 tel:"(606) 335-5000" },
  { name:"Batallón de Alta Montaña 1 — Tunja",         unidad:"BAMO1",        division:"2ª División",         lat: 5.541,  lng:-73.357, dept:"Boyacá",               tipo:"Batallón",          address:"Av. Norte Km 3, Tunja",                       tel:"(608) 740-5000" },
  { name:"Batallón de Alta Montaña 2 — Sogamoso",      unidad:"BAMO2",        division:"2ª División",         lat: 5.716,  lng:-72.932, dept:"Boyacá",               tipo:"Batallón",          address:"Vía Sogamoso–Duitama Km 5" },
  { name:"Batallón de Alta Montaña 5 — Ipiales",       unidad:"BAMO5",        division:"3ª División",         lat: 0.832,  lng:-77.644, dept:"Nariño",               tipo:"Batallón",          address:"Vía Ipiales–Pasto Km 2" },
];

/* ── FUERZA AÉREA COLOMBIANA — Bases y CACOM (fuente: FAC) ── */
interface BaseFAC { name: string; codigo: string; lat: number; lng: number; dept: string; tipo: string; aeronaves?: string; address?: string; tel?: string; }
const FUERZA_AEREA: BaseFAC[] = [
  { name:"CATAM — Bogotá",                       codigo:"CATAM",    lat: 4.698,  lng:-74.145, dept:"Bogotá D.C.",        tipo:"Base Principal",           aeronaves:"C-130, CN-235, Bell 412",        address:"Av. El Dorado con Kr 52, Bogotá",             tel:"(601) 220-5000" },
  { name:"CACOM-1 Palanquero",                   codigo:"CACOM1",   lat: 5.478,  lng:-74.661, dept:"Cundinamarca",       tipo:"Combate",                  aeronaves:"Kfir C10, Super Tucano",         address:"Vía Puerto Salgar–La Dorada, Cundinamarca",   tel:"(601) 236-5000" },
  { name:"CACOM-2 Apiay — Villavicencio",        codigo:"CACOM2",   lat: 4.095,  lng:-73.567, dept:"Meta",               tipo:"Combate",                  aeronaves:"Kfir C10, FAC 2100",             address:"Vía Villavicencio–Puerto López Km 15",        tel:"(608) 677-5000" },
  { name:"CACOM-3 Barranquilla",                 codigo:"CACOM3",   lat:10.888,  lng:-74.784, dept:"Atlántico",          tipo:"Combate / Vigilancia",     aeronaves:"OV-10, Super Tucano",            address:"Aeropuerto Ernesto Cortissoz s/n, Soledad",   tel:"(605) 345-5000" },
  { name:"CACOM-4 Melgar (Tolemaida)",           codigo:"CACOM4",   lat: 4.082,  lng:-74.647, dept:"Cundinamarca",       tipo:"Entrenamiento/Combate",    aeronaves:"T-27 Tucano, T-37",              address:"Vía Bogotá–Girardot Km 95, Nilo",            tel:"(608) 244-5000" },
  { name:"CACOM-5 Rionegro — José M. Córdova",  codigo:"CACOM5",   lat: 6.128,  lng:-75.419, dept:"Antioquia",          tipo:"Combate / Transporte",     aeronaves:"C-27J, CN-235",                  address:"Aeropuerto JMC, Rionegro",                    tel:"(604) 562-8000" },
  { name:"CACOM-6 Tres Esquinas",                codigo:"CACOM6",   lat: 0.722,  lng:-75.240, dept:"Caquetá",            tipo:"Combate Contrainsurgencia",aeronaves:"Super Tucano, helicópteros",     address:"Vía Morelia–Tres Esquinas, Caquetá" },
  { name:"CABAR Cali — Alfonso B. Aragón",       codigo:"CABAR",    lat: 3.544,  lng:-76.381, dept:"Valle del Cauca",    tipo:"Base Regional",            aeronaves:"CN-235, helicópteros",           address:"Aeropuerto Alfonso Bonilla Aragón, Palmira",  tel:"(602) 665-5000" },
  { name:"GAAMA Marandúa — Vichada",             codigo:"GAAMA",    lat: 4.867,  lng:-70.433, dept:"Vichada",            tipo:"Amazonia / Vigilancia",    aeronaves:"Super Tucano, helicópteros",     address:"Vía Marandúa s/n, Puerto Carreño" },
  { name:"GAUR Pasto — Antonio Nariño",          codigo:"GAUR",     lat: 1.396,  lng:-77.291, dept:"Nariño",             tipo:"Base Regional",            aeronaves:"Helicópteros UH-60",             address:"Aeropuerto Antonio Nariño, La Florida",       tel:"(602) 729-8000" },
  { name:"GACAR Bucaramanga — Palonegro",        codigo:"GACAR",    lat: 7.132,  lng:-73.185, dept:"Santander",          tipo:"Base Regional",            aeronaves:"CN-235, PC-7",                   address:"Aeropuerto Palonegro, Lebrija",               tel:"(607) 636-5000" },
  { name:"GAMAN San Andrés",                     codigo:"GAMAN",    lat:12.577,  lng:-81.713, dept:"San Andrés",         tipo:"Vigilancia Marítima",      aeronaves:"Búfalo, helicópteros",           address:"Aeropuerto El Embrujo, San Andrés" },
  { name:"Escuela Militar de Aviación — Cali",   codigo:"EMAVI",    lat: 3.544,  lng:-76.382, dept:"Valle del Cauca",    tipo:"Escuela",                  aeronaves:"T-35 Pillán, PC-7",              address:"Calle 50 Av. 2N No. 4-37, Cali",             tel:"(602) 665-1000" },
  { name:"Base Florencia — Caquetá",             codigo:"BAFLO",    lat: 1.589,  lng:-75.564, dept:"Caquetá",            tipo:"Apoyo Contrainsurgencia",  aeronaves:"Helicópteros Black Hawk",        address:"Aeropuerto Gustavo A. Mejía, Florencia",      tel:"(608) 435-8000" },
  { name:"Base Arauca — Santiago Pérez",         codigo:"BAARAU",   lat: 7.088,  lng:-70.737, dept:"Arauca",             tipo:"Base Fronteriza",          aeronaves:"Helicópteros, Super Tucano",     address:"Aeropuerto Santiago Pérez, Arauca",           tel:"(607) 885-8000" },
];

/* ── ARMADA NACIONAL — Bases Navales e Infantería de Marina (fuente: Armada) ── */
interface BaseNaval { name: string; codigo: string; lat: number; lng: number; dept: string; tipo: string; oceano?: string; capacidad?: string; address?: string; tel?: string; }
const ARMADA: BaseNaval[] = [
  { name:"ARC Bolívar — Cartagena (sede principal)",    codigo:"BOLÍVAR",  lat:10.420, lng:-75.550, dept:"Bolívar",          tipo:"Base Naval Principal",        oceano:"Caribe",   capacidad:"Fragatas, Corvetas, Submarinos",        address:"Isla de Manzanillo, Manga, Cartagena",       tel:"(605) 650-7000" },
  { name:"Base Naval Buenaventura",                     codigo:"BNAVBUE",  lat: 3.888, lng:-77.071, dept:"Valle del Cauca",  tipo:"Base Naval Pacífico",         oceano:"Pacífico", capacidad:"Patrulleras, helicópteros",             address:"Bahía de Buenaventura s/n, Valle",           tel:"(602) 241-5000" },
  { name:"COTECMAR — Cartagena",                        codigo:"COTECMAR", lat:10.418, lng:-75.548, dept:"Bolívar",          tipo:"Astillero / I+D",             oceano:"Caribe",   capacidad:"Construcción y mantenimiento naval",    address:"Mamonal Km 9, Cartagena",                    tel:"(605) 653-1100" },
  { name:"Base Naval Leticia",                          codigo:"BNAVLET",  lat:-4.193, lng:-69.940, dept:"Amazonas",         tipo:"Base Fluvial Amazónica",      oceano:"Fluvial",  capacidad:"Lanchas de patrulla fluvial",          address:"Carrera 11 s/n, Leticia, Amazonas" },
  { name:"Base Naval Puerto Leguízamo",                 codigo:"BNAVLEG",  lat:-0.195, lng:-74.773, dept:"Putumayo",         tipo:"Base Fluvial",                oceano:"Fluvial",  capacidad:"Patrulleras fluviales",                address:"Ribera río Putumayo s/n, Puerto Leguízamo" },
  { name:"Base Naval Puerto Carreño",                   codigo:"BNAVCAR",  lat: 6.192, lng:-67.486, dept:"Vichada",          tipo:"Base Fluvial Frontera",       oceano:"Fluvial",  capacidad:"Patrulleras OAF",                      address:"Ribera río Orinoco s/n, Puerto Carreño" },
  { name:"Batallón Fluvial de IM 50 — Barrancabermeja", codigo:"BAFIM50",  lat: 7.063, lng:-73.852, dept:"Santander",        tipo:"Infantería de Marina Fluvial",oceano:"Fluvial",  capacidad:"Operaciones río Magdalena",             address:"Malecón río Magdalena s/n, Barrancabermeja",  tel:"(607) 622-7000" },
  { name:"Base Naval Tumaco",                           codigo:"BNAVTUM",  lat: 1.808, lng:-78.762, dept:"Nariño",           tipo:"Base Naval Pacífico Sur",     oceano:"Pacífico", capacidad:"Guardacostas, patrulleras",             address:"Isla El Morro s/n, Tumaco",                  tel:"(602) 727-5000" },
  { name:"Base Naval San Andrés",                       codigo:"BNAVSAN",  lat:12.535, lng:-81.700, dept:"San Andrés",       tipo:"Base Naval Caribe Insular",   oceano:"Caribe",   capacidad:"Guardacostas, vigilancia marítima",     address:"North End s/n, San Andrés" },
  { name:"Base Naval Bahía Málaga",                     codigo:"BNAVMAL",  lat: 3.985, lng:-77.274, dept:"Valle del Cauca",  tipo:"Base Operaciones Submarinas", oceano:"Pacífico", capacidad:"Submarinos Tipo 209, Pijao",            address:"Bahía Málaga s/n, Buenaventura" },
  { name:"Batallón IM 1 — Coveñas",                    codigo:"BAIM1",    lat: 9.399, lng:-75.693, dept:"Sucre",            tipo:"Infantería de Marina",        oceano:"Caribe",   capacidad:"Batallón anfibio",                     address:"Zona Industrial, Coveñas, Sucre" },
  { name:"Escuela Naval de Cadetes 'Almirante Padilla'",codigo:"ENAP",    lat:10.408, lng:-75.542, dept:"Bolívar",          tipo:"Escuela Naval",               oceano:"Caribe",   capacidad:"Formación oficiales navales",           address:"Manga, Cartagena de Indias",                 tel:"(605) 650-8000" },
  { name:"Base Naval Turbo (Golfo de Urabá)",           codigo:"BNAVTUR",  lat: 8.099, lng:-76.729, dept:"Antioquia",        tipo:"Base Naval Caribe",           oceano:"Caribe",   capacidad:"Guardacostas, zona Urabá",             address:"Muelle El Waffe s/n, Turbo, Antioquia" },
  { name:"Centro de Aviación Naval — Cartagena",        codigo:"CAVN",     lat:10.393, lng:-75.511, dept:"Bolívar",          tipo:"Aviación Naval",              oceano:"Caribe",   capacidad:"Helicópteros Bell 412, BO-105",         address:"Bocagrande, Cartagena",                      tel:"(605) 650-7500" },
  { name:"Estación Guardacostas Barranquilla",          codigo:"EGCBAQ",   lat:10.961, lng:-74.803, dept:"Atlántico",        tipo:"Guardacostas",                oceano:"Caribe",   capacidad:"Patrulleras oceánicas",                address:"Puerto Colombia s/n, Barranquilla",           tel:"(605) 372-5000" },
  { name:"Base Naval Puerto Inírida",                   codigo:"BNAVINI",  lat: 3.866, lng:-67.927, dept:"Guainía",          tipo:"Base Fluvial Amazónica",      oceano:"Fluvial",  capacidad:"Patrulleras fluviales OAF",            address:"Ribera Inírida s/n, Puerto Inírida" },
];

/* ── BOMBEROS COLOMBIA — Cuerpos de Bomberos (fuente: DIGER / UNGRD) ── */
interface Bombero { name: string; ciudad: string; lat: number; lng: number; dept: string; tel?: string; address?: string; tipo: string; }
const BOMBEROS: Bombero[] = [
  { name:"Cuerpo Oficial de Bomberos de Bogotá",       ciudad:"Bogotá",         lat: 4.671,  lng:-74.082, dept:"Bogotá D.C.",          tipo:"Cuerpo Oficial",    address:"Calle 76 No. 32-29, Bogotá",             tel:"119" },
  { name:"Cuerpo de Bomberos de Medellín",             ciudad:"Medellín",       lat: 6.253,  lng:-75.576, dept:"Antioquia",            tipo:"Cuerpo Oficial",    address:"Calle 44B No. 76-98, Medellín",          tel:"119" },
  { name:"Cuerpo de Bomberos de Cali",                 ciudad:"Cali",           lat: 3.456,  lng:-76.532, dept:"Valle del Cauca",      tipo:"Cuerpo Oficial",    address:"Av. 4 Norte No. 10N-42, Cali",           tel:"119" },
  { name:"Cuerpo de Bomberos de Barranquilla",         ciudad:"Barranquilla",   lat:10.980,  lng:-74.796, dept:"Atlántico",            tipo:"Cuerpo Oficial",    address:"Calle 37 No. 36-50, Barranquilla",       tel:"119" },
  { name:"Cuerpo de Bomberos de Cartagena",            ciudad:"Cartagena",      lat:10.400,  lng:-75.513, dept:"Bolívar",              tipo:"Cuerpo Oficial",    address:"Av. Venezuela No. 4-101, Cartagena",     tel:"119" },
  { name:"Cuerpo de Bomberos de Bucaramanga",          ciudad:"Bucaramanga",    lat: 7.112,  lng:-73.125, dept:"Santander",            tipo:"Cuerpo Oficial",    address:"Calle 45 No. 27-32, Bucaramanga",        tel:"119" },
  { name:"Cuerpo de Bomberos de Cúcuta",               ciudad:"Cúcuta",         lat: 7.894,  lng:-72.515, dept:"Norte de Santander",   tipo:"Cuerpo Oficial",    address:"Av. 7 No. 0-38, Cúcuta",                tel:"119" },
  { name:"Cuerpo de Bomberos de Manizales",            ciudad:"Manizales",      lat: 5.068,  lng:-75.516, dept:"Caldas",               tipo:"Cuerpo Oficial",    address:"Calle 18 No. 20-18, Manizales",          tel:"119" },
  { name:"Cuerpo de Bomberos de Pereira",              ciudad:"Pereira",        lat: 4.810,  lng:-75.700, dept:"Risaralda",            tipo:"Cuerpo Oficial",    address:"Calle 19 No. 9-19, Pereira",             tel:"119" },
  { name:"Cuerpo de Bomberos de Ibagué",               ciudad:"Ibagué",         lat: 4.438,  lng:-75.240, dept:"Tolima",               tipo:"Cuerpo Oficial",    address:"Carrera 6 No. 20-41, Ibagué",            tel:"119" },
  { name:"Cuerpo de Bomberos de Neiva",                ciudad:"Neiva",          lat: 2.930,  lng:-75.293, dept:"Huila",                tipo:"Cuerpo Oficial",    address:"Carrera 5 No. 15-09, Neiva",             tel:"119" },
  { name:"Cuerpo de Bomberos de Santa Marta",          ciudad:"Santa Marta",    lat:11.238,  lng:-74.199, dept:"Magdalena",            tipo:"Cuerpo Oficial",    address:"Calle 22 No. 3-76, Santa Marta",         tel:"119" },
  { name:"Cuerpo de Bomberos de Villavicencio",        ciudad:"Villavicencio",  lat: 4.151,  lng:-73.640, dept:"Meta",                 tipo:"Cuerpo Oficial",    address:"Calle 15 No. 34-70, Villavicencio",      tel:"119" },
  { name:"Cuerpo de Bomberos de Pasto",                ciudad:"Pasto",          lat: 1.213,  lng:-77.287, dept:"Nariño",               tipo:"Cuerpo Oficial",    address:"Carrera 22 No. 17-01, Pasto",            tel:"119" },
  { name:"Cuerpo de Bomberos de Popayán",              ciudad:"Popayán",        lat: 2.438,  lng:-76.614, dept:"Cauca",                tipo:"Cuerpo Oficial",    address:"Carrera 9 No. 11-30, Popayán",           tel:"119" },
  { name:"Cuerpo de Bomberos de Valledupar",           ciudad:"Valledupar",     lat:10.481,  lng:-73.253, dept:"Cesar",                tipo:"Cuerpo Oficial",    address:"Calle 16 No. 6-50, Valledupar",          tel:"119" },
  { name:"Cuerpo de Bomberos de Montería",             ciudad:"Montería",       lat: 8.762,  lng:-75.886, dept:"Córdoba",              tipo:"Cuerpo Oficial",    address:"Carrera 4 No. 28-20, Montería",          tel:"119" },
  { name:"Cuerpo de Bomberos de Florencia",            ciudad:"Florencia",      lat: 1.617,  lng:-75.612, dept:"Caquetá",              tipo:"Cuerpo Oficial",    address:"Carrera 9 No. 11-30, Florencia",         tel:"119" },
  { name:"Cuerpo de Bomberos de Tunja",                ciudad:"Tunja",          lat: 5.540,  lng:-73.361, dept:"Boyacá",               tipo:"Cuerpo Oficial",    address:"Carrera 11 No. 20-44, Tunja",            tel:"119" },
  { name:"Cuerpo de Bomberos de Sincelejo",            ciudad:"Sincelejo",      lat: 9.305,  lng:-75.399, dept:"Sucre",                tipo:"Cuerpo Oficial",    address:"Calle 20 No. 20-55, Sincelejo",          tel:"119" },
  { name:"Cuerpo de Bomberos de Riohacha",             ciudad:"Riohacha",       lat:11.544,  lng:-72.908, dept:"La Guajira",           tipo:"Cuerpo Oficial",    address:"Calle 1 No. 4-87, Riohacha",             tel:"119" },
  { name:"Cuerpo de Bomberos de Quibdó",               ciudad:"Quibdó",         lat: 5.697,  lng:-76.658, dept:"Chocó",                tipo:"Cuerpo Oficial",    address:"Carrera 4 No. 25-00, Quibdó",            tel:"119" },
  { name:"Cuerpo de Bomberos de Armenia",              ciudad:"Armenia",        lat: 4.536,  lng:-75.676, dept:"Quindío",              tipo:"Cuerpo Oficial",    address:"Carrera 19 No. 8-77, Armenia",           tel:"119" },
  { name:"Cuerpo de Bomberos de Leticia",              ciudad:"Leticia",        lat:-4.195,  lng:-69.937, dept:"Amazonas",             tipo:"Cuerpo Oficial",    address:"Carrera 11 No. 9-35, Leticia",           tel:"119" },
  { name:"Cuerpo de Bomberos de Yopal",                ciudad:"Yopal",          lat: 5.337,  lng:-72.396, dept:"Casanare",             tipo:"Cuerpo Oficial",    address:"Calle 8 No. 20-40, Yopal",               tel:"119" },
  { name:"Cuerpo de Bomberos de Arauca",               ciudad:"Arauca",         lat: 7.087,  lng:-70.759, dept:"Arauca",               tipo:"Cuerpo Oficial",    address:"Carrera 20 No. 18-00, Arauca",           tel:"119" },
  { name:"Cuerpo de Bomberos de Mocoa",                ciudad:"Mocoa",          lat: 1.148,  lng:-76.650, dept:"Putumayo",             tipo:"Cuerpo Oficial",    address:"Calle 10 No. 5-00, Mocoa",               tel:"119" },
  { name:"Cuerpo de Bomberos de Inírida",              ciudad:"Inírida",        lat: 3.864,  lng:-67.925, dept:"Guainía",              tipo:"Cuerpo Oficial",    address:"Carrera 6 s/n, Puerto Inírida",          tel:"119" },
  { name:"Cuerpo de Bomberos de San José del Guaviare",ciudad:"Gvr.",          lat: 2.573,  lng:-72.643, dept:"Guaviare",             tipo:"Cuerpo Oficial",    address:"Carrera 25 s/n, San José del Guaviare",  tel:"119" },
  { name:"Cuerpo de Bomberos de Mitú",                 ciudad:"Mitú",           lat: 1.253,  lng:-70.234, dept:"Vaupés",               tipo:"Cuerpo Oficial",    address:"Carrera 4 s/n, Mitú",                    tel:"119" },
  { name:"Cuerpo de Bomberos de Buenaventura",         ciudad:"Buenaventura",   lat: 3.883,  lng:-77.018, dept:"Valle del Cauca",      tipo:"Cuerpo Oficial",    address:"Calle 10 No. 3-00, Buenaventura",        tel:"119" },
  { name:"Cuerpo de Bomberos de Bello",                ciudad:"Bello",          lat: 6.344,  lng:-75.556, dept:"Antioquia",            tipo:"Voluntarios",       address:"Calle 50 No. 45-20, Bello",              tel:"119" },
  { name:"Cuerpo de Bomberos de Itagüí",               ciudad:"Itagüí",         lat: 6.181,  lng:-75.606, dept:"Antioquia",            tipo:"Voluntarios",       address:"Calle 33 No. 50-40, Itagüí",             tel:"119" },
  { name:"Cuerpo de Bomberos de Palmira",              ciudad:"Palmira",        lat: 3.534,  lng:-76.304, dept:"Valle del Cauca",      tipo:"Voluntarios",       address:"Carrera 25 No. 28-00, Palmira",          tel:"119" },
  { name:"Cuerpo de Bomberos de Tuluá",                ciudad:"Tuluá",          lat: 4.086,  lng:-76.197, dept:"Valle del Cauca",      tipo:"Voluntarios",       address:"Calle 25 No. 25-00, Tuluá",              tel:"119" },
];

/* ── BÁSCULAS DE PESAJE INVIAS (fuente: INVIAS — Subdirección de Gestión de la Red) ── */
interface Bascula { name: string; route: string; lat: number; lng: number; dept: string; km?: string; }
const BASCULAS: Bascula[] = [
  { name:"Báscula Siberia",          route:"Ruta 25 Bogotá–Medellín",         lat: 4.920, lng:-74.093, dept:"Cundinamarca",       km:"Km 18" },
  { name:"Báscula La Caro",          route:"Autopista Norte Bogotá–Tunja",    lat: 4.919, lng:-74.010, dept:"Cundinamarca",       km:"Km 22" },
  { name:"Báscula Briceño",          route:"Autopista Norte Bogotá–Tunja",    lat: 5.222, lng:-74.023, dept:"Cundinamarca",       km:"Km 51" },
  { name:"Báscula Gachancipá",       route:"Ruta 45 Bogotá–Sogamoso",         lat: 5.013, lng:-73.892, dept:"Cundinamarca",       km:"Km 49" },
  { name:"Báscula Choachí",          route:"Vía al Llano (Ruta 40)",          lat: 4.306, lng:-73.930, dept:"Cundinamarca",       km:"Km 44" },
  { name:"Báscula Facatativá",       route:"Ruta 50 Bogotá–Manizales",        lat: 4.819, lng:-74.356, dept:"Cundinamarca",       km:"Km 40" },
  { name:"Báscula El Vino",          route:"Ruta 50 Bogotá–Honda",            lat: 5.233, lng:-74.343, dept:"Cundinamarca",       km:"Km 78" },
  { name:"Báscula Girardot",         route:"Ruta 40 Bogotá–Ibagué",           lat: 4.303, lng:-74.804, dept:"Cundinamarca",       km:"Km 132" },
  { name:"Báscula Honda",            route:"Ruta 50 Honda–Puerto Berrío",     lat: 5.213, lng:-74.741, dept:"Tolima",             km:"Km 4" },
  { name:"Báscula Espinal",          route:"Ruta 40 Ibagué–Neiva",            lat: 4.153, lng:-74.884, dept:"Tolima",             km:"Km 60" },
  { name:"Báscula Ibagué",           route:"Ruta 40 Ibagué",                  lat: 4.433, lng:-75.241, dept:"Tolima",             km:"Km 202" },
  { name:"Báscula Neiva",            route:"Ruta 45 Neiva–Bogotá",            lat: 2.934, lng:-75.292, dept:"Huila",              km:"Km 305" },
  { name:"Báscula Pitalito",         route:"Ruta 45B Huila–Mocoa",            lat: 1.856, lng:-76.050, dept:"Huila",              km:"Km 15" },
  { name:"Báscula Tunja",            route:"Ruta 55 Tunja–Sogamoso",          lat: 5.597, lng:-73.316, dept:"Boyacá",             km:"Km 148" },
  { name:"Báscula Sogamoso",         route:"Ruta 55 Boyacá",                  lat: 5.717, lng:-72.932, dept:"Boyacá",             km:"Km 198" },
  { name:"Báscula Barbosa",          route:"Ruta 45A Bogotá–Bucaramanga",     lat: 5.936, lng:-73.618, dept:"Santander",          km:"Km 180" },
  { name:"Báscula Puente Nacional",  route:"Ruta 45A Bogotá–Bucaramanga",     lat: 5.879, lng:-73.691, dept:"Santander",          km:"Km 160" },
  { name:"Báscula San Gil",          route:"Ruta 45A Bucaramanga–Bogotá",     lat: 6.556, lng:-73.135, dept:"Santander",          km:"Km 93" },
  { name:"Báscula La Lizama",        route:"Ruta 45A Bucaramanga–Barranca",   lat: 7.108, lng:-73.424, dept:"Santander",          km:"Km 24" },
  { name:"Báscula Bucaramanga",      route:"Autopista Florida–Piedecuesta",   lat: 7.013, lng:-73.140, dept:"Santander",          km:"Km 4" },
  { name:"Báscula Pamplona",         route:"Ruta 55 Cúcuta–Bucaramanga",      lat: 7.375, lng:-72.654, dept:"Norte de Santander", km:"Km 78" },
  { name:"Báscula Cúcuta",           route:"Ruta 55 Cúcuta",                  lat: 7.890, lng:-72.507, dept:"Norte de Santander", km:"Km 2" },
  { name:"Báscula Aguachica",        route:"Ruta 45 Bogotá–Barranquilla",     lat: 8.307, lng:-73.617, dept:"Cesar",              km:"Km 518" },
  { name:"Báscula Bosconia",         route:"Ruta 80 Costa Atlántica",         lat: 9.970, lng:-73.878, dept:"Cesar",              km:"Km 50" },
  { name:"Báscula Valledupar",       route:"Ruta 80 Valledupar",              lat:10.481, lng:-73.253, dept:"Cesar",              km:"Km 94" },
  { name:"Báscula Ciénaga",          route:"Ruta 90 Santa Marta–Barranquilla",lat:11.001, lng:-74.251, dept:"Magdalena",          km:"Km 14" },
  { name:"Báscula Santa Marta",      route:"Ruta 90 Santa Marta",             lat:11.231, lng:-74.199, dept:"Magdalena",          km:"Km 0" },
  { name:"Báscula Palermo",          route:"Ruta 45 Magdalena",               lat:10.543, lng:-74.661, dept:"Magdalena",          km:"Km 58" },
  { name:"Báscula Galapa",           route:"Ruta 90 Barranquilla–Cartagena",  lat:10.899, lng:-74.889, dept:"Atlántico",          km:"Km 16" },
  { name:"Báscula Sabanalarga",      route:"Ruta 90 Atlántico",               lat:10.634, lng:-74.922, dept:"Atlántico",          km:"Km 47" },
  { name:"Báscula Turbaco",          route:"Ruta 90 Cartagena–Barranquilla",  lat:10.337, lng:-75.423, dept:"Bolívar",            km:"Km 12" },
  { name:"Báscula Carmen de Bolívar",route:"Ruta 25 Bolívar",                 lat: 9.722, lng:-75.121, dept:"Bolívar",            km:"Km 95" },
  { name:"Báscula La Caucana",       route:"Ruta 25 Sucre",                   lat: 8.802, lng:-75.142, dept:"Sucre",              km:"Km 145" },
  { name:"Báscula Sincelejo",        route:"Ruta 25 Sincelejo",               lat: 9.305, lng:-75.399, dept:"Sucre",              km:"Km 108" },
  { name:"Báscula Planeta Rica",     route:"Ruta 25 Córdoba",                 lat: 8.411, lng:-75.584, dept:"Córdoba",            km:"Km 178" },
  { name:"Báscula Montería",         route:"Ruta 25 Montería",                lat: 8.758, lng:-75.887, dept:"Córdoba",            km:"Km 210" },
  { name:"Báscula El Tigre",         route:"Ruta 62 Antioquia",               lat: 7.082, lng:-74.764, dept:"Antioquia",          km:"Km 105" },
  { name:"Báscula La Pintada",       route:"Ruta 25 Antioquia–Caldas",        lat: 5.753, lng:-75.597, dept:"Antioquia",          km:"Km 310" },
  { name:"Báscula La Felisa",        route:"Ruta 25 Caldas",                  lat: 5.514, lng:-75.649, dept:"Caldas",             km:"Km 338" },
  { name:"Báscula Irra",             route:"Ruta 25 Eje Cafetero",            lat: 5.367, lng:-75.567, dept:"Caldas",             km:"Km 361" },
  { name:"Báscula Manizales",        route:"Ruta 50 Manizales",               lat: 5.073, lng:-75.467, dept:"Caldas",             km:"Km 280" },
  { name:"Báscula Pereira",          route:"Ruta 25 Risaralda",               lat: 4.812, lng:-75.696, dept:"Risaralda",          km:"Km 385" },
  { name:"Báscula Armenia",          route:"Ruta 40 Eje Cafetero",            lat: 4.534, lng:-75.675, dept:"Quindío",            km:"Km 297" },
  { name:"Báscula Cartago",          route:"Ruta 25 Risaralda–Valle",         lat: 4.756, lng:-75.913, dept:"Valle del Cauca",    km:"Km 419" },
  { name:"Báscula La Paila",         route:"Ruta 25 Valle del Cauca",         lat: 4.308, lng:-75.905, dept:"Valle del Cauca",    km:"Km 445" },
  { name:"Báscula Tulúa",            route:"Ruta 25 Bogotá–Cali",             lat: 4.094, lng:-76.193, dept:"Valle del Cauca",    km:"Km 471" },
  { name:"Báscula Buga",             route:"Ruta 25 Bogotá–Cali",             lat: 3.902, lng:-76.297, dept:"Valle del Cauca",    km:"Km 493" },
  { name:"Báscula Mediacanoa",       route:"Ruta 25 Bogotá–Cali",             lat: 3.756, lng:-76.256, dept:"Valle del Cauca",    km:"Km 511" },
  { name:"Báscula Cali Norte",       route:"Autopista Cali–Bogotá",           lat: 3.550, lng:-76.534, dept:"Valle del Cauca",    km:"Km 537" },
  { name:"Báscula El Bordo",         route:"Ruta 25 Cali–Popayán",            lat: 2.836, lng:-76.543, dept:"Cauca",              km:"Km 600" },
  { name:"Báscula Popayán",          route:"Ruta 25 Cauca",                   lat: 2.442, lng:-76.607, dept:"Cauca",              km:"Km 638" },
  { name:"Báscula Pescador",         route:"Ruta 25 Cauca",                   lat: 2.716, lng:-76.499, dept:"Cauca",              km:"Km 618" },
  { name:"Báscula Pasto",            route:"Ruta 25 Nariño",                  lat: 1.213, lng:-77.287, dept:"Nariño",             km:"Km 738" },
  { name:"Báscula Ipiales",          route:"Ruta 25 Frontera Ecuador",        lat: 0.831, lng:-77.644, dept:"Nariño",             km:"Km 807" },
  { name:"Báscula Villavicencio",    route:"Ruta 40 Vía al Llano",            lat: 4.151, lng:-73.636, dept:"Meta",               km:"Km 90" },
  { name:"Báscula Florencia",        route:"Ruta 45A Caquetá",                lat: 1.614, lng:-75.607, dept:"Caquetá",            km:"Km 12" },
  { name:"Báscula Mocoa",            route:"Ruta 45A Putumayo",               lat: 1.149, lng:-76.650, dept:"Putumayo",           km:"Km 5" },
  { name:"Báscula Arauca",           route:"Ruta 55 Arauca–Bogotá",           lat: 7.087, lng:-70.759, dept:"Arauca",             km:"Km 8" },
  { name:"Báscula Yopal",            route:"Ruta 65 Casanare",                lat: 5.337, lng:-72.396, dept:"Casanare",           km:"Km 10" },
  { name:"Báscula Riohacha",         route:"Ruta 90A La Guajira",             lat:11.544, lng:-72.908, dept:"La Guajira",         km:"Km 6" },
  { name:"Báscula Buenaventura",     route:"Ruta 25 Puerto–Cali",             lat: 3.883, lng:-77.018, dept:"Valle del Cauca",    km:"Km 3" },
];

/* ── tipos / helpers ── */
type LayerKey = "grupos" | "riesgo" | "delitos" | "vias" | "ninguna";
type BasemapKey = "dark" | "streets" | "satellite";

const BASEMAPS: Record<BasemapKey, { label: string; url: string }> = {
  dark:      { label: "Oscuro",   url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" },
  streets:   { label: "Calles",   url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" },
  satellite: { label: "Satélite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" },
};

function normalize(s: string) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase(); }
function matchDept(raw: string): string {
  const n = normalize(raw);
  return Object.keys(ARMED).find(k => normalize(k).startsWith(n.slice(0,5))) ?? raw;
}
function armedColor(l: number) { return ["#1a2a1a","#2d4a1e","#7a3a00","#6b0000"][l] ?? "#1a2a1a"; }
function nightColor(v: number) {
  if (v < 60) return "#1a2a3a"; if (v < 70) return "#1e3a5f"; if (v < 75) return "#5c3d00"; return "#5c0000";
}
function roadColor(s: "good"|"regular"|"difficult") {
  return { good:"#0a2e1a", regular:"#2e2a00", difficult:"#3a0a00" }[s];
}
function crimeColor(v: number, max: number) {
  const t = max > 0 ? v / max : 0;
  if (t < 0.2) return "#0a1e2a"; if (t < 0.4) return "#0a2e4a"; if (t < 0.6) return "#1a3a5c"; if (t < 0.8) return "#5c2a00"; return "#6b0000";
}

function FitBounds() {
  const map = useMap();
  useEffect(() => { map.fitBounds([[-4.2,-79],[12.5,-66.8]], { padding:[10,10] }); }, [map]);
  return null;
}

/* ── Marker DivIcon factory ── */
function makeIcon(symbol: string, bg: string, border: string, size = 22) {
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;background:${bg};border:2px solid ${border};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.55)}px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.5)">${symbol}</div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
    popupAnchor: [0, -size/2],
  });
}

import { Marker } from "react-leaflet";

export function MapIntelligence({ dark = true }: { dark?: boolean }) {
  const [activeLayer, setActiveLayer] = useState<LayerKey>("grupos");
  const [showBlockades,  setShowBlockades]  = useState(true);
  const [showPeajes,     setShowPeajes]     = useState(false);
  const [showPolicia,    setShowPolicia]    = useState(false);
  const [showHospitales, setShowHospitales] = useState(false);
  const [showEjercito,   setShowEjercito]   = useState(false);
  const [showFAC,        setShowFAC]        = useState(false);
  const [showArmada,     setShowArmada]     = useState(false);
  const [showBomberos,   setShowBomberos]   = useState(false);
  const [showBasculas,   setShowBasculas]   = useState(false);
  const [basemap, setBasemap] = useState<BasemapKey>("dark");
  const [panelOpen, setPanelOpen] = useState(true);
  const [geoData, setGeoData] = useState<any>(null);

  const { data: blockades = [] } = useGetBlockades(undefined, { query: { refetchInterval: 60000 } });
  const { data: crimesByDept = [] } = useGetCrimesByDepartment({});

  const crimeTotals = crimesByDept.reduce((acc: Record<string,number>, d: any) => {
    const key = matchDept(d.department ?? "");
    acc[key] = (acc[key] ?? 0) + (d.totalCount ?? 0);
    return acc;
  }, {} as Record<string,number>);
  const maxCrimes = Math.max(1, ...Object.values(crimeTotals));

  useEffect(() => { fetch(GEO_URL).then(r=>r.json()).then(setGeoData).catch(()=>{}); }, []);

  const geoStyle = useCallback((feature: any) => {
    const dept = matchDept(feature?.properties?.NOMBRE_DPT ?? feature?.properties?.name ?? "");
    let fillColor = "#141e2e";
    if (activeLayer === "grupos") fillColor = armedColor(ARMED[dept]?.level ?? 0);
    else if (activeLayer === "riesgo") fillColor = nightColor(NIGHT_RISK[dept] ?? 60);
    else if (activeLayer === "vias") fillColor = roadColor(ROAD[dept]?.score ?? "regular");
    else if (activeLayer === "delitos") fillColor = crimeColor(crimeTotals[dept] ?? 0, maxCrimes);
    else fillColor = "#141e2e";
    return { fillColor, fillOpacity: activeLayer==="ninguna"?0.12:0.72, color:"rgba(255,255,255,0.12)", weight:0.8 };
  }, [activeLayer, crimeTotals, maxCrimes]);

  const onEachFeature = useCallback((feature: any, layer: L.Layer) => {
    const dept = matchDept(feature?.properties?.NOMBRE_DPT ?? feature?.properties?.name ?? "");
    const armed = ARMED[dept];
    const road = ROAD[dept];
    const crimes = crimeTotals[dept] ?? 0;
    const armedLbl = ["Sin presencia","Baja","Media","Alta"][armed?.level ?? 0] ?? "—";
    const armedClr = ["#10b981","#f59e0b","#f97316","#ef4444"][armed?.level ?? 0] ?? "#888";
    const roadLbl = { good:"Buenas", regular:"Regular", difficult:"Difíciles" }[road?.score ?? "regular"];
    const roadClr = { good:"#10b981", regular:"#f59e0b", difficult:"#ef4444" }[road?.score ?? "regular"];
    layer.bindPopup(`
      <div style="font-family:sans-serif;font-size:13px;min-width:210px;color:#e2e8f0">
        <div style="font-weight:700;font-size:14px;margin-bottom:8px;color:#00d4ff">${dept}</div>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="color:#94a3b8;padding:2px 0">Grupos armados</td><td style="text-align:right;font-weight:600;color:${armedClr}">${armedLbl}</td></tr>
          ${armed?.groups?.length?`<tr><td colspan="2" style="font-size:11px;color:#64748b;padding-bottom:4px">${armed.groups.join(" · ")}</td></tr>`:""}
          <tr><td style="color:#94a3b8;padding:2px 0">Riesgo nocturno</td><td style="text-align:right;font-weight:600;color:#a78bfa">${NIGHT_RISK[dept]??"-"}/100</td></tr>
          <tr><td style="color:#94a3b8;padding:2px 0">Condiciones vías</td><td style="text-align:right;font-weight:600;color:${roadClr}">${roadLbl}</td></tr>
          <tr><td style="color:#94a3b8;padding:2px 0">Delitos registrados</td><td style="text-align:right;font-weight:600;color:#f59e0b">${crimes.toLocaleString("es-CO")}</td></tr>
          ${road?.notes?`<tr><td colspan="2" style="font-size:11px;color:#64748b;padding-top:4px;border-top:1px solid rgba(255,255,255,0.08)">${road.notes}</td></tr>`:""}
        </table>
      </div>`, { maxWidth:280, className:"dark-popup" });
  }, [crimeTotals]);

  const LAYERS = [
    { key:"grupos" as LayerKey,  label:"Presencia Armada",      icon:Shield,        color:"#ef4444", legend:[{label:"Sin presencia",color:"#1a2a1a"},{label:"Baja",color:"#2d4a1e"},{label:"Media",color:"#7a3a00"},{label:"Alta / Crítica",color:"#6b0000"}] },
    { key:"riesgo" as LayerKey,  label:"Riesgo Nocturno",       icon:Moon,          color:"#a78bfa", legend:[{label:"< 60",color:"#1a2a3a"},{label:"60–70",color:"#1e3a5f"},{label:"70–75",color:"#5c3d00"},{label:"> 75",color:"#5c0000"}] },
    { key:"delitos" as LayerKey, label:"Estadísticas Delictivas",icon:AlertTriangle, color:"#f59e0b", legend:[{label:"Muy bajo",color:"#0a1e2a"},{label:"Bajo",color:"#0a2e4a"},{label:"Medio",color:"#1a3a5c"},{label:"Alto",color:"#5c2a00"},{label:"Crítico",color:"#6b0000"}] },
    { key:"vias" as LayerKey,    label:"Condiciones Viales",    icon:Route,         color:"#10b981", legend:[{label:"Buenas",color:"#0a2e1a"},{label:"Regular",color:"#2e2a00"},{label:"Difíciles",color:"#3a0a00"}] },
    { key:"ninguna" as LayerKey, label:"Sin capa base",         icon:Layers,        color:"#64748b", legend:[] },
  ];

  const OVERLAYS = [
    { key:"bloqueos",   label:"Bloqueos activos",        icon:MapPin,     color:"#ef4444", active:showBlockades,  toggle:()=>setShowBlockades(p=>!p),  count:blockades.filter((b:any)=>b.lat&&b.lng).length },
    { key:"peajes",     label:"Peajes",                  icon:Car,        color:"#f59e0b", active:showPeajes,     toggle:()=>setShowPeajes(p=>!p),      count:PEAJES.length },
    { key:"policia",    label:"Policía de Carreteras",   icon:Shield,     color:"#3b82f6", active:showPolicia,    toggle:()=>setShowPolicia(p=>!p),     count:POLICIA_CARRETERAS.length },
    { key:"hospitales", label:"Hospitales de Referencia",icon:Hospital,   color:"#10b981", active:showHospitales, toggle:()=>setShowHospitales(p=>!p), count:HOSPITALES.length },
    { key:"ejercito",   label:"Ejército Nacional",       icon:Shield,     color:"#84cc16", active:showEjercito,   toggle:()=>setShowEjercito(p=>!p),   count:EJERCITO.length },
    { key:"fac",        label:"Fuerza Aérea Colombiana", icon:Building2,  color:"#38bdf8", active:showFAC,        toggle:()=>setShowFAC(p=>!p),         count:FUERZA_AEREA.length },
    { key:"armada",     label:"Armada Nacional",         icon:MapPin,     color:"#818cf8", active:showArmada,     toggle:()=>setShowArmada(p=>!p),      count:ARMADA.length },
    { key:"bomberos",   label:"Cuerpos de Bomberos",     icon:AlertTriangle, color:"#fb923c", active:showBomberos,toggle:()=>setShowBomberos(p=>!p),    count:BOMBEROS.length },
    { key:"basculas",   label:"Básculas de Pesaje INVIAS",icon:Car,          color:"#e879f9", active:showBasculas, toggle:()=>setShowBasculas(p=>!p),   count:BASCULAS.length },
  ];

  const activeLayerMeta = LAYERS.find(l=>l.key===activeLayer)!;
  const peajeIcon      = makeIcon("$",  "rgba(245,158,11,0.9)",   "#f59e0b", 20);
  const policiaIcon    = makeIcon("P",  "rgba(59,130,246,0.9)",   "#3b82f6", 20);
  const hospitalIcon   = makeIcon("✚",  "rgba(16,185,129,0.9)",  "#10b981", 20);
  const ejercitoIcon   = makeIcon("★",  "rgba(132,204,22,0.92)",  "#84cc16", 22);
  const facIcon        = makeIcon("✈",  "rgba(56,189,248,0.92)",  "#38bdf8", 22);
  const armadaIcon     = makeIcon("⚓",  "rgba(129,140,248,0.92)", "#818cf8", 22);
  const bomberoIcon    = makeIcon("🔥", "rgba(251,146,60,0.92)",  "#fb923c", 22);
  const basculaIcon    = makeIcon("⚖",  "rgba(232,121,249,0.92)", "#e879f9", 20);

  return (
    <div style={{ position:"relative", width:"100%", height:"calc(100vh - 120px)", minHeight:500, borderRadius:12, overflow:"hidden" }}>

      {/* MAP */}
      <MapContainer center={[4.5,-74.3]} zoom={6} style={{ width:"100%", height:"100%", background:"#070c15" }} zoomControl attributionControl={false}>
        <FitBounds />
        <TileLayer key={basemap} url={BASEMAPS[basemap].url} />

        {geoData && (
          <GeoJSON
            key={`${activeLayer}-${JSON.stringify(crimeTotals).length}`}
            data={geoData} style={geoStyle} onEachFeature={onEachFeature}
          />
        )}

        {/* Bloqueos */}
        {showBlockades && blockades.filter((b:any)=>b.lat&&b.lng).map((b:any) => {
          const c = b.source==="news_rss"?"#00d4ff":b.source==="news_import"?"#a78bfa":"#ef4444";
          return (
            <CircleMarker key={b.id} center={[b.lat,b.lng]} radius={8} pathOptions={{ color:c, fillColor:c, fillOpacity:0.85, weight:2 }}>
              <Popup className="dark-popup">
                <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:190 }}>
                  <div style={{ fontWeight:700,color:c,marginBottom:6 }}>🚧 Bloqueo {b.source==="news_rss"?"RSS":b.source==="news_import"?"IA":"Manual"}</div>
                  <div><span style={{ color:"#94a3b8" }}>Dept: </span>{b.department}</div>
                  <div><span style={{ color:"#94a3b8" }}>Ubicación: </span>{b.location}</div>
                  <div><span style={{ color:"#94a3b8" }}>Causa: </span>{b.cause}</div>
                  {b.notes&&<div style={{ marginTop:4,fontSize:12,color:"#64748b" }}>{b.notes}</div>}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* Peajes */}
        {showPeajes && PEAJES.map((p,i) => (
          <Marker key={`peaje-${i}`} position={[p.lat,p.lng]} icon={peajeIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:200 }}>
                <div style={{ fontWeight:700,color:"#f59e0b",marginBottom:6 }}>🛣️ {p.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Ruta</td><td style={{ textAlign:"right",fontSize:12 }}>{p.route}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Departamento</td><td style={{ textAlign:"right" }}>{p.dept}</td></tr>
                  {p.tarifa_c2&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Tarifa C2</td><td style={{ textAlign:"right",fontWeight:600,color:"#f59e0b" }}>{p.tarifa_c2}</td></tr>}
                </table>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Policía de Carreteras */}
        {showPolicia && POLICIA_CARRETERAS.map((p,i) => (
          <Marker key={`pol-${i}`} position={[p.lat,p.lng]} icon={policiaIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:200 }}>
                <div style={{ fontWeight:700,color:"#3b82f6",marginBottom:6 }}>🚔 {p.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Sector</td><td style={{ textAlign:"right",fontSize:12 }}>{p.sector}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Departamento</td><td style={{ textAlign:"right" }}>{p.dept}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Tipo</td><td style={{ textAlign:"right",fontWeight:600,color:"#3b82f6" }}>{p.tipo}</td></tr>
                </table>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Hospitales */}
        {showHospitales && HOSPITALES.map((h,i) => (
          <Marker key={`hosp-${i}`} position={[h.lat,h.lng]} icon={hospitalIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:200 }}>
                <div style={{ fontWeight:700,color:"#10b981",marginBottom:6 }}>🏥 {h.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Ciudad</td><td style={{ textAlign:"right" }}>{h.city}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Departamento</td><td style={{ textAlign:"right" }}>{h.dept}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Nivel</td><td style={{ textAlign:"right",fontWeight:600,color:"#10b981" }}>Nivel {h.level}</td></tr>
                  {h.tel&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Teléfono</td><td style={{ textAlign:"right",fontSize:11 }}>{h.tel}</td></tr>}
                </table>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Ejército Nacional */}
        {showEjercito && EJERCITO.map((e,i) => (
          <Marker key={`ej-${i}`} position={[e.lat,e.lng]} icon={ejercitoIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:230 }}>
                <div style={{ fontWeight:700,color:"#84cc16",marginBottom:6 }}>★ {e.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Unidad</td><td style={{ textAlign:"right",fontWeight:600,color:"#84cc16" }}>{e.unidad}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>División</td><td style={{ textAlign:"right",fontSize:12 }}>{e.division}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Tipo</td><td style={{ textAlign:"right" }}>{e.tipo}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Departamento</td><td style={{ textAlign:"right" }}>{e.dept}</td></tr>
                  {e.address&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Dirección</td><td style={{ textAlign:"right",fontSize:11,color:"#cbd5e1" }}>{e.address}</td></tr>}
                  {e.tel&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Teléfono</td><td style={{ textAlign:"right",fontWeight:600,color:"#84cc16" }}>{e.tel}</td></tr>}
                </table>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Fuerza Aérea Colombiana */}
        {showFAC && FUERZA_AEREA.map((f,i) => (
          <Marker key={`fac-${i}`} position={[f.lat,f.lng]} icon={facIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:230 }}>
                <div style={{ fontWeight:700,color:"#38bdf8",marginBottom:6 }}>✈ {f.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Código</td><td style={{ textAlign:"right",fontWeight:600,color:"#38bdf8" }}>{f.codigo}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Tipo</td><td style={{ textAlign:"right",fontSize:12 }}>{f.tipo}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Departamento</td><td style={{ textAlign:"right" }}>{f.dept}</td></tr>
                  {f.aeronaves&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Aeronaves</td><td style={{ textAlign:"right",fontSize:11,color:"#64748b" }}>{f.aeronaves}</td></tr>}
                  {f.address&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Dirección</td><td style={{ textAlign:"right",fontSize:11,color:"#cbd5e1" }}>{f.address}</td></tr>}
                  {f.tel&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Teléfono</td><td style={{ textAlign:"right",fontWeight:600,color:"#38bdf8" }}>{f.tel}</td></tr>}
                </table>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Armada Nacional */}
        {showArmada && ARMADA.map((a,i) => (
          <Marker key={`arm-${i}`} position={[a.lat,a.lng]} icon={armadaIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:230 }}>
                <div style={{ fontWeight:700,color:"#818cf8",marginBottom:6 }}>⚓ {a.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Código</td><td style={{ textAlign:"right",fontWeight:600,color:"#818cf8" }}>{a.codigo}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Tipo</td><td style={{ textAlign:"right",fontSize:12 }}>{a.tipo}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Océano/Zona</td><td style={{ textAlign:"right" }}>{a.oceano}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Departamento</td><td style={{ textAlign:"right" }}>{a.dept}</td></tr>
                  {a.capacidad&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Capacidad</td><td style={{ textAlign:"right",fontSize:11,color:"#64748b" }}>{a.capacidad}</td></tr>}
                  {a.address&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Dirección</td><td style={{ textAlign:"right",fontSize:11,color:"#cbd5e1" }}>{a.address}</td></tr>}
                  {a.tel&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Teléfono</td><td style={{ textAlign:"right",fontWeight:600,color:"#818cf8" }}>{a.tel}</td></tr>}
                </table>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Cuerpos de Bomberos */}
        {showBomberos && BOMBEROS.map((b,i) => (
          <Marker key={`bom-${i}`} position={[b.lat,b.lng]} icon={bomberoIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:230 }}>
                <div style={{ fontWeight:700,color:"#fb923c",marginBottom:6 }}>🔥 {b.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Ciudad</td><td style={{ textAlign:"right" }}>{b.ciudad}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Departamento</td><td style={{ textAlign:"right" }}>{b.dept}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Tipo</td><td style={{ textAlign:"right",fontWeight:600,color:b.tipo==="Cuerpo Oficial"?"#fb923c":"#fbbf24" }}>{b.tipo}</td></tr>
                  {b.address&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Dirección</td><td style={{ textAlign:"right",fontSize:11,color:"#cbd5e1" }}>{b.address}</td></tr>}
                  {b.tel&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Emergencias</td><td style={{ textAlign:"right",fontWeight:700,fontSize:15,color:"#ef4444" }}>{b.tel}</td></tr>}
                </table>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Básculas de Pesaje INVIAS */}
        {showBasculas && BASCULAS.map((b,i) => (
          <Marker key={`bas-${i}`} position={[b.lat,b.lng]} icon={basculaIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:210 }}>
                <div style={{ fontWeight:700,color:"#e879f9",marginBottom:6 }}>⚖ {b.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Ruta</td><td style={{ textAlign:"right",fontSize:12 }}>{b.route}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Departamento</td><td style={{ textAlign:"right" }}>{b.dept}</td></tr>
                  {b.km&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Punto</td><td style={{ textAlign:"right",fontWeight:600,color:"#e879f9" }}>{b.km}</td></tr>}
                  <tr><td colSpan={2} style={{ color:"#64748b",fontSize:11,paddingTop:4,borderTop:"1px solid rgba(255,255,255,0.08)" }}>Control de peso vehicular INVIAS</td></tr>
                </table>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* PANEL */}
      <div style={{
        position:"absolute", top:16, right:panelOpen?16:-272, zIndex:1000,
        width:268, background:"rgba(7,12,21,0.93)", backdropFilter:"blur(12px)",
        border:"1px solid rgba(255,255,255,0.1)", borderRadius:12,
        transition:"right 0.3s ease", boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
        maxHeight:"calc(100% - 32px)", overflowY:"auto",
      }}>
        {/* Header */}
        <div style={{ padding:"12px 14px", borderBottom:"1px solid rgba(255,255,255,0.07)", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, background:"rgba(7,12,21,0.97)", zIndex:1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Layers size={15} style={{ color:"#00d4ff" }} />
            <span style={{ fontSize:13, fontWeight:700, color:"rgba(255,255,255,0.9)", letterSpacing:"0.04em" }}>Capas del Mapa</span>
          </div>
          <button onClick={()=>setPanelOpen(false)} style={{ background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.4)",padding:2 }}>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Basemap */}
        <div style={{ padding:"10px 14px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:"rgba(255,255,255,0.35)", marginBottom:8 }}>Mapa base</div>
          <div style={{ display:"flex", gap:6 }}>
            {(Object.keys(BASEMAPS) as BasemapKey[]).map(k=>(
              <button key={k} onClick={()=>setBasemap(k)} style={{
                flex:1, padding:"5px 4px", borderRadius:6, fontSize:11, fontWeight:600, cursor:"pointer",
                background:basemap===k?"rgba(0,212,255,0.15)":"rgba(255,255,255,0.05)",
                color:basemap===k?"#00d4ff":"rgba(255,255,255,0.5)",
                border:`1px solid ${basemap===k?"rgba(0,212,255,0.3)":"rgba(255,255,255,0.07)"}`,
                transition:"all 0.15s",
              }}>{BASEMAPS[k].label}</button>
            ))}
          </div>
        </div>

        {/* Choropleth */}
        <div style={{ padding:"10px 14px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:"rgba(255,255,255,0.35)", marginBottom:8 }}>Capa departamental</div>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            {LAYERS.map(l => {
              const Icon=l.icon; const active=activeLayer===l.key;
              return (
                <button key={l.key} onClick={()=>setActiveLayer(l.key)} style={{
                  display:"flex", alignItems:"center", gap:9, padding:"7px 10px", borderRadius:7, cursor:"pointer", textAlign:"left", width:"100%",
                  background:active?`${l.color}18`:"transparent", border:`1px solid ${active?`${l.color}40`:"transparent"}`, transition:"all 0.15s",
                }}>
                  <div style={{ width:8,height:8,borderRadius:"50%",flexShrink:0,background:active?l.color:"rgba(255,255,255,0.2)" }} />
                  <Icon size={13} style={{ color:active?l.color:"rgba(255,255,255,0.35)",flexShrink:0 }} />
                  <span style={{ fontSize:12,fontWeight:active?600:400,color:active?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.5)" }}>{l.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Overlays */}
        <div style={{ padding:"10px 14px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:"rgba(255,255,255,0.35)", marginBottom:8 }}>Superposiciones</div>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            {OVERLAYS.map(o => {
              const Icon=o.icon;
              return (
                <button key={o.key} onClick={o.toggle} style={{
                  display:"flex", alignItems:"center", gap:9, padding:"7px 10px", width:"100%", borderRadius:7, cursor:"pointer",
                  background:o.active?`${o.color}12`:"transparent", border:`1px solid ${o.active?`${o.color}30`:"transparent"}`, transition:"all 0.15s",
                }}>
                  {o.active ? <Eye size={13} style={{ color:o.color }} /> : <EyeOff size={13} style={{ color:"rgba(255,255,255,0.35)" }} />}
                  <Icon size={13} style={{ color:o.active?o.color:"rgba(255,255,255,0.35)",flexShrink:0 }} />
                  <span style={{ fontSize:12,fontWeight:o.active?600:400,color:o.active?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.5)" }}>{o.label}</span>
                  {o.count>0&&(
                    <span style={{ marginLeft:"auto",fontSize:10,fontWeight:700,color:o.color,background:`${o.color}15`,borderRadius:10,padding:"1px 6px" }}>
                      {o.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        {activeLayerMeta.legend.length>0&&(
          <div style={{ padding:"10px 14px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"rgba(255,255,255,0.35)",marginBottom:8 }}>
              Leyenda — {activeLayerMeta.label}
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
              {activeLayerMeta.legend.map(l=>(
                <div key={l.label} style={{ display:"flex",alignItems:"center",gap:8 }}>
                  <div style={{ width:20,height:12,borderRadius:3,background:l.color,border:"1px solid rgba(255,255,255,0.15)",flexShrink:0 }} />
                  <span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Overlay legend */}
        {(showPeajes||showPolicia||showHospitales||showBlockades||showEjercito||showFAC||showArmada||showBomberos||showBasculas)&&(
          <div style={{ padding:"10px 14px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"rgba(255,255,255,0.35)",marginBottom:8 }}>Símbolos activos</div>
            <div style={{ display:"flex",flexDirection:"column",gap:5 }}>
              {showBlockades&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:12,height:12,borderRadius:"50%",background:"#ef4444",border:"2px solid #ef4444" }} /><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Bloqueo activo</span></div>}
              {showPeajes&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(245,158,11,0.9)",border:"2px solid #f59e0b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#fff" }}>$</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Peaje INVIAS/ANI</span></div>}
              {showPolicia&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(59,130,246,0.9)",border:"2px solid #3b82f6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#fff" }}>P</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Policía Carreteras</span></div>}
              {showHospitales&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(16,185,129,0.9)",border:"2px solid #10b981",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff" }}>✚</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Hospital referencia</span></div>}
              {showEjercito&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(132,204,22,0.92)",border:"2px solid #84cc16",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff" }}>★</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Ejército — Brigada/Batallón</span></div>}
              {showFAC&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(56,189,248,0.92)",border:"2px solid #38bdf8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff" }}>✈</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>FAC — Base / CACOM</span></div>}
              {showArmada&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(129,140,248,0.92)",border:"2px solid #818cf8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff" }}>⚓</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Armada — Base Naval/Fluvial</span></div>}
              {showBomberos&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(251,146,60,0.92)",border:"2px solid #fb923c",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11 }}>🔥</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Cuerpo de Bomberos — 119</span></div>}
              {showBasculas&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(232,121,249,0.92)",border:"2px solid #e879f9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff" }}>⚖</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Báscula de Pesaje INVIAS</span></div>}
            </div>
          </div>
        )}

        {/* Tip */}
        <div style={{ padding:"8px 14px 12px" }}>
          <div style={{ display:"flex",gap:6,alignItems:"flex-start" }}>
            <Info size={11} style={{ color:"rgba(255,255,255,0.3)",marginTop:1,flexShrink:0 }} />
            <span style={{ fontSize:10,color:"rgba(255,255,255,0.3)",lineHeight:1.5 }}>
              Haga clic en cualquier punto o departamento para ver detalles completos.
            </span>
          </div>
        </div>
      </div>

      {/* Panel toggle */}
      {!panelOpen&&(
        <button onClick={()=>setPanelOpen(true)} style={{
          position:"absolute",top:16,right:16,zIndex:1001,
          background:"rgba(7,12,21,0.93)",border:"1px solid rgba(255,255,255,0.15)",
          borderRadius:8,padding:"8px 10px",cursor:"pointer",
          display:"flex",alignItems:"center",gap:6,color:"#00d4ff",
          backdropFilter:"blur(12px)",boxShadow:"0 4px 16px rgba(0,0,0,0.4)",
        }}>
          <Layers size={16} /><ChevronLeft size={14} />
        </button>
      )}

      <style>{`
        .dark-popup .leaflet-popup-content-wrapper{background:#0c1220!important;border:1px solid rgba(255,255,255,0.1)!important;border-radius:10px!important;box-shadow:0 8px 32px rgba(0,0,0,0.6)!important}
        .dark-popup .leaflet-popup-tip{background:#0c1220!important}
        .dark-popup .leaflet-popup-content{margin:12px 14px!important}
        .leaflet-container{font-family:inherit}
      `}</style>
    </div>
  );
}
