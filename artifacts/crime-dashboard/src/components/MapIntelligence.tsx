import React, { useState, useCallback, useEffect, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, useMap, Marker, Polyline } from "react-leaflet";
import { PUNTOS_CRITICOS_BUN_BOG, WAYPOINTS_BUN_BOG } from "./routeDataBunBog";
import RouteManager, { type UserRoute, type RoutePoint } from "./RouteManager";
import MarkerClusterGroup from "react-leaflet-cluster";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  useGetBlockades,
  useGetCrimesByDepartment,
  useGetTelegramAlerts,
  type TelegramAlert,
} from "@workspace/api-client-react";
import {
  Layers, Eye, EyeOff, AlertTriangle, MapPin, Moon, Shield, Route,
  ChevronLeft, ChevronRight, Info, Building2, Hospital, Car, Truck,
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

/* ── HOTELES ESTRATÉGICOS COLOMBIA (4★ y 5★ — cadenas nacionales e internacionales) ── */
interface Hotel { name: string; cadena: string; ciudad: string; stars: number; lat: number; lng: number; dept: string; address: string; tel?: string; }
const HOTELES: Hotel[] = [
  /* ── BOGOTÁ ── */
  { name:"JW Marriott Bogotá",               cadena:"Marriott",    ciudad:"Bogotá",        stars:5, lat: 4.665, lng:-74.054, dept:"Bogotá D.C.",       address:"Calle 73 No. 8-60",             tel:"(601) 481-6000" },
  { name:"Grand Hyatt Bogotá",               cadena:"Hyatt",       ciudad:"Bogotá",        stars:5, lat: 4.625, lng:-74.115, dept:"Bogotá D.C.",       address:"Calle 24A No. 57A-60",          tel:"(601) 745-9999" },
  { name:"Hilton Bogotá Corferias",          cadena:"Hilton",      ciudad:"Bogotá",        stars:5, lat: 4.629, lng:-74.106, dept:"Bogotá D.C.",       address:"Carrera 37 No. 24-67",          tel:"(601) 330-6000" },
  { name:"Hotel Casa Medina",                cadena:"Sofitel MGallery",ciudad:"Bogotá",    stars:5, lat: 4.659, lng:-74.055, dept:"Bogotá D.C.",       address:"Carrera 7 No. 69A-22",          tel:"(601) 217-0288" },
  { name:"Hotel Estelar Parque de la 93",    cadena:"Estelar",     ciudad:"Bogotá",        stars:5, lat: 4.678, lng:-74.046, dept:"Bogotá D.C.",       address:"Calle 94A No. 13-41",           tel:"(601) 636-4800" },
  { name:"NH Collection Royal Bogotá",       cadena:"NH Hotels",   ciudad:"Bogotá",        stars:4, lat: 4.685, lng:-74.046, dept:"Bogotá D.C.",       address:"Calle 100 No. 19-61",           tel:"(601) 657-5000" },
  { name:"Hotel GHL Comfort San Diego",      cadena:"GHL",         ciudad:"Bogotá",        stars:4, lat: 4.623, lng:-74.067, dept:"Bogotá D.C.",       address:"Carrera 13 No. 24-80",          tel:"(601) 338-1600" },
  { name:"Hotel Tequendama Bogotá",          cadena:"GHL",         ciudad:"Bogotá",        stars:4, lat: 4.624, lng:-74.072, dept:"Bogotá D.C.",       address:"Carrera 10 No. 26-21",          tel:"(601) 382-0300" },
  { name:"Hotel Dann Carlton Bogotá",        cadena:"Dann",        ciudad:"Bogotá",        stars:5, lat: 4.651, lng:-74.055, dept:"Bogotá D.C.",       address:"Calle 47 No. 13-29",            tel:"(601) 346-0700" },
  /* ── MEDELLÍN ── */
  { name:"Hotel Intercontinental Medellín",  cadena:"IHG",         ciudad:"Medellín",      stars:5, lat: 6.205, lng:-75.574, dept:"Antioquia",         address:"Av. El Poblado No. 16-211",     tel:"(604) 319-4444" },
  { name:"Hotel Dann Carlton Medellín",      cadena:"Dann",        ciudad:"Medellín",      stars:5, lat: 6.202, lng:-75.571, dept:"Antioquia",         address:"Calle 1 Sur No. 43A-81",        tel:"(604) 444-5151" },
  { name:"Hotel Diez Hotel Medellín",        cadena:"Independiente",ciudad:"Medellín",     stars:5, lat: 6.209, lng:-75.572, dept:"Antioquia",         address:"Calle 8A No. 41-04",            tel:"(604) 321-1010" },
  { name:"Hampton by Hilton Medellín",       cadena:"Hilton",      ciudad:"Medellín",      stars:4, lat: 6.207, lng:-75.568, dept:"Antioquia",         address:"Carrera 43A No. 1-45",          tel:"(604) 312-8888" },
  { name:"Hotel Nutibara Medellín",          cadena:"GHL",         ciudad:"Medellín",      stars:4, lat: 6.244, lng:-75.573, dept:"Antioquia",         address:"Calle 52A No. 50-46",           tel:"(604) 511-5111" },
  /* ── CALI ── */
  { name:"Intercontinental Cali",            cadena:"IHG",         ciudad:"Cali",          stars:5, lat: 3.432, lng:-76.531, dept:"Valle del Cauca",   address:"Av. Colombia No. 2-72",         tel:"(602) 882-3225" },
  { name:"Hotel Estelar Río Cali",           cadena:"Estelar",     ciudad:"Cali",          stars:5, lat: 3.468, lng:-76.530, dept:"Valle del Cauca",   address:"Calle 18 Norte No. 2N-48",      tel:"(602) 485-0000" },
  { name:"Hotel GHL Collection Carlton",     cadena:"GHL",         ciudad:"Cali",          stars:4, lat: 3.440, lng:-76.536, dept:"Valle del Cauca",   address:"Carrera 3 No. 9-35",            tel:"(602) 688-5000" },
  { name:"Hotel Spiwak Chipichape",          cadena:"Spiwak",      ciudad:"Cali",          stars:4, lat: 3.468, lng:-76.543, dept:"Valle del Cauca",   address:"Av. 6N No. 28N-10 Chipichape",  tel:"(602) 665-2525" },
  /* ── BARRANQUILLA ── */
  { name:"Hotel El Prado Barranquilla",      cadena:"Independiente",ciudad:"Barranquilla", stars:5, lat:10.993, lng:-74.814, dept:"Atlántico",         address:"Carrera 54 No. 70-10",          tel:"(605) 369-7777" },
  { name:"Hampton by Hilton Barranquilla",   cadena:"Hilton",      ciudad:"Barranquilla",  stars:4, lat:10.994, lng:-74.815, dept:"Atlántico",         address:"Calle 76 No. 41B-91",           tel:"(605) 369-8000" },
  { name:"Hotel Dann Carlton Barranquilla",  cadena:"Dann",        ciudad:"Barranquilla",  stars:4, lat:10.992, lng:-74.813, dept:"Atlántico",         address:"Calle 75 No. 41B-141",          tel:"(605) 369-9999" },
  /* ── CARTAGENA ── */
  { name:"Sofitel Legend Santa Clara",       cadena:"Sofitel",     ciudad:"Cartagena",     stars:5, lat:10.421, lng:-75.549, dept:"Bolívar",           address:"Calle del Torno No. 39-29",     tel:"(605) 650-4700" },
  { name:"Hotel Charleston Santa Teresa",    cadena:"Charleston",  ciudad:"Cartagena",     stars:5, lat:10.421, lng:-75.548, dept:"Bolívar",           address:"Plaza de Santa Teresa",         tel:"(605) 664-9494" },
  { name:"Las Americas Grand Hotel",         cadena:"Independiente",ciudad:"Cartagena",    stars:5, lat:10.378, lng:-75.508, dept:"Bolívar",           address:"Cra 1 No. 9-223",               tel:"(605) 656-2900" },
  { name:"Hotel Intercontinental Cartagena", cadena:"IHG",         ciudad:"Cartagena",     stars:5, lat:10.390, lng:-75.483, dept:"Bolívar",           address:"Av. Almirante Brion s/n",       tel:"(605) 650-1010" },
  { name:"Hotel Capilla del Mar",            cadena:"Independiente",ciudad:"Cartagena",    stars:4, lat:10.399, lng:-75.503, dept:"Bolívar",           address:"Bocagrande Carrera 1 No. 7-40", tel:"(605) 664-6070" },
  /* ── BUCARAMANGA ── */
  { name:"Hotel Dann Carlton Bucaramanga",   cadena:"Dann",        ciudad:"Bucaramanga",   stars:5, lat: 7.113, lng:-73.114, dept:"Santander",         address:"Calle 34 No. 31-24",            tel:"(607) 643-1181" },
  { name:"Hotel Chicamocha Bucaramanga",     cadena:"Independiente",ciudad:"Bucaramanga",  stars:4, lat: 7.112, lng:-73.113, dept:"Santander",         address:"Calle 34 No. 31-15",            tel:"(607) 633-5000" },
  /* ── CÚCUTA ── */
  { name:"Hotel Bolívar Cúcuta",             cadena:"Independiente",ciudad:"Cúcuta",       stars:4, lat: 7.890, lng:-72.507, dept:"Norte de Santander",address:"Av. 0 No. 9E-38",               tel:"(607) 582-4700" },
  { name:"Hotel Tamá Cúcuta",                cadena:"Independiente",ciudad:"Cúcuta",       stars:4, lat: 7.891, lng:-72.511, dept:"Norte de Santander",address:"Calle 8 No. 7E-60",             tel:"(607) 583-5858" },
  /* ── SANTA MARTA ── */
  { name:"Hotel Irotama Resort",             cadena:"Irotama",     ciudad:"Santa Marta",   stars:5, lat:11.158, lng:-74.142, dept:"Magdalena",         address:"Km 14 Vía Barranquilla",        tel:"(605) 433-0034" },
  { name:"Hotel Zuana Beach Resort",         cadena:"Independiente",ciudad:"Santa Marta",  stars:4, lat:11.178, lng:-74.159, dept:"Magdalena",         address:"Km 10 Vía Barranquilla",        tel:"(605) 433-3800" },
  /* ── VILLAVICENCIO ── */
  { name:"Hotel Kumaral Villavicencio",      cadena:"Independiente",ciudad:"Villavicencio",stars:4, lat: 4.148, lng:-73.636, dept:"Meta",              address:"Carrera 30 No. 37A-22",         tel:"(608) 674-0505" },
  { name:"Hotel Movich Villavicencio",       cadena:"Movich",      ciudad:"Villavicencio", stars:4, lat: 4.150, lng:-73.632, dept:"Meta",              address:"Calle 39 No. 29-60",            tel:"(608) 670-0050" },
  /* ── PEREIRA ── */
  { name:"Hotel Movich Pereira",             cadena:"Movich",      ciudad:"Pereira",       stars:5, lat: 4.811, lng:-75.696, dept:"Risaralda",         address:"Calle 13 No. 12-53",            tel:"(606) 321-1010" },
  { name:"Hotel GHL Comfort Pereira",        cadena:"GHL",         ciudad:"Pereira",       stars:4, lat: 4.812, lng:-75.695, dept:"Risaralda",         address:"Av. 30 de Agosto No. 35-33",    tel:"(606) 335-9999" },
  /* ── MANIZALES ── */
  { name:"Hotel Estelar Manizales",          cadena:"Estelar",     ciudad:"Manizales",     stars:5, lat: 5.065, lng:-75.510, dept:"Caldas",            address:"Av. Santander No. 56-07",       tel:"(606) 881-0000" },
  { name:"Hotel Carretero Manizales",        cadena:"Independiente",ciudad:"Manizales",    stars:4, lat: 5.064, lng:-75.512, dept:"Caldas",            address:"Av. Santander No. 31-30",       tel:"(606) 881-8888" },
  /* ── ARMENIA ── */
  { name:"Hotel Mocawa Resort Armenia",      cadena:"Independiente",ciudad:"Armenia",      stars:4, lat: 4.542, lng:-75.686, dept:"Quindío",           address:"Km 1 Vía La Tebaida",           tel:"(606) 741-9999" },
  /* ── IBAGUÉ ── */
  { name:"Hotel Merlot Ibagué",              cadena:"Independiente",ciudad:"Ibagué",       stars:4, lat: 4.432, lng:-75.243, dept:"Tolima",            address:"Carrera 5 No. 60-49",           tel:"(608) 277-3737" },
  /* ── NEIVA ── */
  { name:"Hotel Acuario Neiva",              cadena:"Independiente",ciudad:"Neiva",        stars:4, lat: 2.932, lng:-75.294, dept:"Huila",             address:"Carrera 5 No. 22-35",           tel:"(608) 871-0000" },
  /* ── PASTO ── */
  { name:"Hotel Cuellar's Pasto",            cadena:"Independiente",ciudad:"Pasto",        stars:4, lat: 1.214, lng:-77.282, dept:"Nariño",            address:"Carrera 21 No. 18-25",          tel:"(602) 729-1212" },
  /* ── POPAYÁN ── */
  { name:"Hotel Dann Popayán",               cadena:"Dann",        ciudad:"Popayán",       stars:4, lat: 2.443, lng:-76.608, dept:"Cauca",             address:"Calle 4 No. 8-35",              tel:"(602) 824-5050" },
  /* ── MONTERÍA ── */
  { name:"Hotel Sinu Montería",              cadena:"Independiente",ciudad:"Montería",     stars:4, lat: 8.758, lng:-75.886, dept:"Córdoba",           address:"Carrera 2 No. 28-35",           tel:"(604) 782-3000" },
  /* ── VALLEDUPAR ── */
  { name:"Hotel Sicarare Valledupar",        cadena:"Independiente",ciudad:"Valledupar",   stars:4, lat:10.477, lng:-73.253, dept:"Cesar",             address:"Calle 9 No. 5-89",              tel:"(605) 574-4000" },
  /* ── TUNJA ── */
  { name:"Hotel Boyacá Plaza Tunja",         cadena:"Independiente",ciudad:"Tunja",        stars:4, lat: 5.541, lng:-73.360, dept:"Boyacá",            address:"Carrera 11 No. 20-44",          tel:"(608) 740-1616" },
  /* ── SAN ANDRÉS ── */
  { name:"Decameron Aquarium San Andrés",    cadena:"Decameron",   ciudad:"San Andrés",    stars:5, lat:12.572, lng:-81.719, dept:"San Andrés",        address:"Av. Colón No. 9-59",            tel:"(605) 512-0015" },
  { name:"Decameron Maryland San Andrés",    cadena:"Decameron",   ciudad:"San Andrés",    stars:4, lat:12.542, lng:-81.716, dept:"San Andrés",        address:"Km 8 Vía San Luis",             tel:"(605) 512-0550" },
  /* ── LETICIA ── */
  { name:"Decameron Decalodge Tikuna",       cadena:"Decameron",   ciudad:"Leticia",       stars:4, lat:-4.200, lng:-69.945, dept:"Amazonas",          address:"Km 8 Vía Leticia",              tel:"(608) 592-7600" },
  /* ── ARAUCA ── */
  { name:"Hotel Flamboyán Arauca",           cadena:"Independiente",ciudad:"Arauca",       stars:4, lat: 7.088, lng:-70.757, dept:"Arauca",            address:"Carrera 20 No. 19-36",          tel:"(607) 885-3434" },
  /* ── YOPAL ── */
  { name:"Hotel Los Llaneros Yopal",         cadena:"Independiente",ciudad:"Yopal",        stars:4, lat: 5.338, lng:-72.394, dept:"Casanare",          address:"Calle 8 No. 25-40",             tel:"(608) 635-5200" },
];

/* ── HOTELES DE CARRETERA — alojamiento para conductores de transporte de carga ── */
interface HotelCarretera { name: string; ruta: string; municipio: string; dept: string; lat: number; lng: number; address?: string; tel?: string; servicios?: string; }
const HOTELES_CARRETERA: HotelCarretera[] = [
  /* ── RUTA 45A — Bogotá → Puerto Salgar → La Dorada → Puerto Berrío → Medellín ── */
  { name:"Hotel El Paso",              ruta:"Ruta 45A — Km 131", municipio:"Puerto Salgar",      dept:"Cundinamarca",     lat: 5.467, lng:-74.653, address:"Carrera 5 No. 3-42",         tel:"(601) 858-0210",  servicios:"Parqueadero carga, restaurante 24h, mecánica" },
  { name:"Hotel El Nogal",             ruta:"Ruta 45A — Km 133", municipio:"Puerto Salgar",      dept:"Cundinamarca",     lat: 5.471, lng:-74.655, address:"Calle 4 No. 6-25",           tel:"(601) 858-1540",  servicios:"Parqueadero vigilado, cafetería" },
  { name:"Hotel Américas",             ruta:"Ruta 45 — Km 187",  municipio:"La Dorada",          dept:"Caldas",           lat: 5.454, lng:-74.672, address:"Carrera 3 No. 12-56",        tel:"(606) 853-2222",  servicios:"Parqueadero carga, lavandería, restaurante" },
  { name:"Hotel La Rivera",            ruta:"Ruta 45 — Km 190",  municipio:"La Dorada",          dept:"Caldas",           lat: 5.459, lng:-74.668, address:"Av. Paralela No. 8-30",      tel:"(606) 853-0800",  servicios:"Zona de descanso, wifi, tienda" },
  { name:"Hotel El Turista",           ruta:"Ruta 45 — Km 246",  municipio:"Puerto Berrío",      dept:"Antioquia",        lat: 6.487, lng:-74.402, address:"Calle 5 No. 7-45",           tel:"(604) 851-3030",  servicios:"Parqueadero carga, restaurante, ducha" },
  { name:"Hotel Puerto Magdalena",     ruta:"Ruta 45 — Km 248",  municipio:"Puerto Berrío",      dept:"Antioquia",        lat: 6.489, lng:-74.404, address:"Av. Río No. 8-60",           tel:"(604) 851-2020",  servicios:"Zona de descargue, restaurante 24h" },
  /* ── RUTA 45 — Honda / Girardot ── */
  { name:"Hotel Honda Real",           ruta:"Ruta 45 — Honda",   municipio:"Honda",              dept:"Tolima",           lat: 5.207, lng:-74.741, address:"Calle 10 No. 11-30",         tel:"(608) 251-1100",  servicios:"Parqueadero, cafetería, lavadero" },
  { name:"Hotel Tocarema",             ruta:"Ruta 45 — Girardot",municipio:"Girardot",           dept:"Cundinamarca",     lat: 4.302, lng:-74.806, address:"Carrera 11 No. 22-18",       tel:"(601) 833-3611",  servicios:"Parqueadero grande, restaurante, zona camping" },
  { name:"Residencias El Descanso",    ruta:"Ruta 45 — Espinal", municipio:"Espinal",            dept:"Tolima",           lat: 4.154, lng:-74.887, address:"Carrera 5 No. 8-30",         tel:"(608) 248-3030",  servicios:"Parqueadero carga, ducha, tienda" },
  /* ── RUTA 45A SUROCCIDENTE — Bogotá → Puerto Boyacá ── */
  { name:"Hotel El Río",               ruta:"Ruta 45 — Puerto Boyacá",municipio:"Puerto Boyacá", dept:"Boyacá",           lat: 5.976, lng:-74.590, address:"Av. Puerto Boyacá No. 5-45", tel:"(608) 648-3030",  servicios:"Parqueadero vigilado, mecánica pesada, restaurante" },
  /* ── RUTA 25 — Cali → Buga → Cartago → Manizales ── */
  { name:"Hotel Guadalajara",          ruta:"Ruta 25 — Buga",    municipio:"Guadalajara de Buga",dept:"Valle del Cauca",  lat: 3.901, lng:-76.301, address:"Calle 6 No. 14-49",          tel:"(602) 228-3442",  servicios:"Parqueadero, restaurante, ducha caliente" },
  { name:"Hotel El Terminal",          ruta:"Ruta 25 — Cartago", municipio:"Cartago",            dept:"Valle del Cauca",  lat: 4.748, lng:-75.915, address:"Carrera 7 No. 8-43",          tel:"(602) 212-4400",  servicios:"Parqueadero carga, lavandería, tienda" },
  { name:"Hotel Cuyabra",              ruta:"Ruta 25 — Cartago", municipio:"Cartago",            dept:"Valle del Cauca",  lat: 4.750, lng:-75.913, address:"Carrera 4 No. 8-55",          tel:"(602) 212-0088",  servicios:"Zona descanso, mecánica, cafetería" },
  { name:"Hotel El Viajero Palmira",   ruta:"Ruta 25 — Palmira", municipio:"Palmira",            dept:"Valle del Cauca",  lat: 3.520, lng:-76.302, address:"Calle 33 No. 25-12",          tel:"(602) 274-5555",  servicios:"Parqueadero gran capacidad, restaurante 24h" },
  /* ── RUTA 40 — Medellín → La Pintada → Riosucio ── */
  { name:"Hotel Las Tres Cascadas",    ruta:"Ruta 40 — La Pintada",municipio:"La Pintada",      dept:"Antioquia",        lat: 5.740, lng:-75.594, address:"Km 1 Vía La Pintada",        tel:"(604) 847-0505",  servicios:"Parqueadero, restaurante, zona camping camiones" },
  /* ── RUTA 25 NORTE — Medellín → Caucasia → Costa ── */
  { name:"Hotel Grand Caucasia",       ruta:"Ruta 25 — Caucasia", municipio:"Caucasia",          dept:"Antioquia",        lat: 7.989, lng:-75.197, address:"Calle 20 No. 18-44",          tel:"(604) 838-2115",  servicios:"Parqueadero carga, restaurante, ducha" },
  { name:"Residencias El Camionero",   ruta:"Ruta 25 — Caucasia", municipio:"Caucasia",          dept:"Antioquia",        lat: 7.991, lng:-75.198, address:"Carrera 19 No. 26-83",        tel:"(604) 838-3340",  servicios:"Zona pesada, taller, cafetería 24h" },
  { name:"Hotel Abad",                 ruta:"Ruta 25 — Planeta Rica",municipio:"Planeta Rica",   dept:"Córdoba",          lat: 8.408, lng:-75.588, address:"Carrera 6 No. 14-38",         tel:"(604) 766-2233",  servicios:"Parqueadero, lavadero, restaurante" },
  { name:"Hotel Sahagún Inn",          ruta:"Ruta 25 — Sahagún",  municipio:"Sahagún",           dept:"Córdoba",          lat: 8.945, lng:-75.443, address:"Calle 10 No. 8-42",           tel:"(604) 773-1234",  servicios:"Parqueadero vigilado, ducha, tienda" },
  { name:"Hotel Mompox Palace",        ruta:"Ruta 25 — Magangué", municipio:"Magangué",          dept:"Bolívar",          lat: 9.240, lng:-74.754, address:"Carrera 4 No. 16-45",         tel:"(605) 682-3030",  servicios:"Puerto fluvial, parqueadero, restaurante" },
  /* ── RUTA 55/TRONCAL — Bogotá → Tunja → Duitama → Bucaramanga → Cúcuta ── */
  { name:"Hotel Boyacá Real",          ruta:"Ruta 55 — Duitama", municipio:"Duitama",            dept:"Boyacá",           lat: 5.828, lng:-73.030, address:"Calle 16 No. 14-26",          tel:"(608) 760-3366",  servicios:"Parqueadero carga, cafetería, ducha" },
  { name:"Hotel Sogamoso Real",        ruta:"Ruta 55 — Sogamoso",municipio:"Sogamoso",           dept:"Boyacá",           lat: 5.716, lng:-72.928, address:"Carrera 11 No. 14-25",        tel:"(608) 772-1313",  servicios:"Parqueadero, mecánica, tienda" },
  { name:"Hotel Internacional Barranca",ruta:"Ruta 45 — Barrancabermeja",municipio:"Barrancabermeja",dept:"Santander",  lat: 7.065, lng:-73.855, address:"Carrera 6 No. 50-50",          tel:"(607) 622-7777",  servicios:"Zona industrial, parqueadero, restaurante 24h" },
  /* ── RUTA 55/62 — Bucaramanga → Aguachica → Costa Atlántica ── */
  { name:"Hotel El Ejecutivo",         ruta:"Ruta 55 — Aguachica",municipio:"Aguachica",         dept:"Cesar",            lat: 8.309, lng:-73.614, address:"Calle 9 No. 14-28",           tel:"(607) 565-3555",  servicios:"Parqueadero carga, restaurante, lavandería" },
  { name:"Hotel La Parada",            ruta:"Ruta 55 — San Alberto",municipio:"San Alberto",     dept:"Cesar",            lat: 8.026, lng:-73.396, address:"Calle 3 No. 5-25",             tel:"(607) 568-2020",  servicios:"Parqueadero vigilado, ducha, tienda 24h" },
  { name:"Hotel El Puente",            ruta:"Ruta 62 — Gamarra",  municipio:"Gamarra",           dept:"Cesar",            lat: 8.327, lng:-73.748, address:"Calle 3 No. 5-42",             tel:"(607) 569-1220",  servicios:"Cruce Ruta 55/62, parqueadero, mecánica" },
  { name:"Hotel El Minero",            ruta:"Ruta 62 — Santa Rosa del Sur",municipio:"Santa Rosa del Sur",dept:"Bolívar",lat: 7.959, lng:-74.043, address:"Calle 5 No. 4-30",             tel:"(607) 560-1050",  servicios:"Zona minera, parqueadero especial, restaurante" },
  /* ── RUTA 90 — Barranquilla → Ciénaga → Santa Marta ── */
  { name:"Hotel Viña del Mar",         ruta:"Ruta 90 — Ciénaga",  municipio:"Ciénaga",           dept:"Magdalena",        lat:11.007, lng:-74.251, address:"Carrera 1 No. 18-30",         tel:"(605) 426-1212",  servicios:"Costal, parqueadero, restaurante, ducha" },
  /* ── RUTA 90 — Troncal del Caribe ── */
  { name:"Residencias El Caminante",   ruta:"Ruta 90 — Zona Bananera",municipio:"Zona Bananera", dept:"Magdalena",        lat:10.778, lng:-74.102, address:"Km 45 Troncal Caribe",        tel:"(605) 413-5050",  servicios:"Corredor bananero, parqueadero 24h" },
  /* ── RUTA 45A — Bogotá → Villavicencio (Llanos) ── */
  { name:"Hotel Los Patios",           ruta:"Ruta 40 — Acacías",  municipio:"Acacías",           dept:"Meta",             lat: 3.988, lng:-73.764, address:"Carrera 6 No. 8-22",          tel:"(608) 669-2200",  servicios:"Zona llanera, parqueadero tanqueros, restaurante" },
  /* ── RUTA 45A/66 — Yopal → Arauca ── */
  { name:"Residencias La Llanura",     ruta:"Ruta 66 — Tame",     municipio:"Tame",              dept:"Arauca",           lat: 6.388, lng:-71.727, address:"Carrera 8 No. 5-30",          tel:"(607) 886-1100",  servicios:"Frontera llanera, parqueadero, mecánica" },
  /* ── RUTA 25 — Ipiales → Pasto → Popayán ── */
  { name:"Hotel El Trébol",            ruta:"Ruta 25 — Ipiales",  municipio:"Ipiales",           dept:"Nariño",           lat: 0.829, lng:-77.645, address:"Calle 8 No. 6-30",            tel:"(602) 773-2020",  servicios:"Frontera Ecuador, parqueadero, restaurante 24h" },
  { name:"Residencias El Descanso Sur",ruta:"Ruta 25 — La Unión", municipio:"La Unión",          dept:"Nariño",           lat: 1.607, lng:-77.128, address:"Km 2 Vía Pasto-Cali",         tel:"(602) 728-5533",  servicios:"Parqueadero, cafetería, ducha" },
  /* ── RUTA 25 — Zona Cafetera ── */
  { name:"Hotel El Cafetero",          ruta:"Ruta 25 — Anserma", municipio:"Anserma",            dept:"Caldas",           lat: 5.210, lng:-75.789, address:"Carrera 12 No. 7-43",         tel:"(606) 855-2222",  servicios:"Zona cafetera, parqueadero, mecánica" },
];

/* ── ESTACIONES DE SERVICIO — rutas nacionales de carga Colombia ── */
interface EstacionServicio { name: string; marca: string; ruta: string; municipio: string; dept: string; lat: number; lng: number; servicios: string; }
const ESTACIONES_SERVICIO: EstacionServicio[] = [
  /* ── RUTA 45A — Bogotá → Puerto Salgar → La Dorada → Puerto Berrío → Medellín ── */
  { name:"Terpel La Virgen",         marca:"Terpel",   ruta:"Ruta 45A — Km 18",  municipio:"Bogotá (salida)",   dept:"Bogotá D.C.",       lat: 4.755, lng:-74.133, servicios:"ACPM · Corriente · Extra · Minimarket · Servibay" },
  { name:"Primax Villeta",           marca:"Primax",   ruta:"Ruta 45A — Km 72",  municipio:"Villeta",           dept:"Cundinamarca",      lat: 5.010, lng:-74.472, servicios:"ACPM · Corriente · GNV · Taller · Restaurante" },
  { name:"Biomax Guaduero",          marca:"Biomax",   ruta:"Ruta 45A — Km 100", municipio:"Guaduero",          dept:"Cundinamarca",      lat: 5.255, lng:-74.580, servicios:"ACPM · Corriente · Extra · Lavadero camiones" },
  { name:"Terpel Puerto Salgar",     marca:"Terpel",   ruta:"Ruta 45A — Km 131", municipio:"Puerto Salgar",     dept:"Cundinamarca",      lat: 5.467, lng:-74.651, servicios:"ACPM · Corriente · Extra · GNV · Serviteca · Restaurante 24h" },
  { name:"Primax La Dorada",         marca:"Primax",   ruta:"Ruta 45 — Km 187",  municipio:"La Dorada",         dept:"Caldas",            lat: 5.452, lng:-74.670, servicios:"ACPM · Corriente · Extra · Lavadero · Mecánica pesada" },
  { name:"Biomax Puerto Berrío",     marca:"Biomax",   ruta:"Ruta 45 — Km 246",  municipio:"Puerto Berrío",     dept:"Antioquia",         lat: 6.488, lng:-74.401, servicios:"ACPM · Corriente · Minimarket · Parqueadero 24h" },
  { name:"Terpel Cisneros",          marca:"Terpel",   ruta:"Ruta 45 — Km 290",  municipio:"Cisneros",          dept:"Antioquia",         lat: 6.536, lng:-74.983, servicios:"ACPM · Corriente · Extra · Taller · Restaurante" },
  /* ── RUTA 40 — Medellín → La Pintada → Riosucio ── */
  { name:"Esso La Pintada",          marca:"Esso",     ruta:"Ruta 40 — Km 88",   municipio:"La Pintada",        dept:"Antioquia",         lat: 5.740, lng:-75.593, servicios:"ACPM · Corriente · Extra · Lavadero · Parqueadero" },
  { name:"Terpel Chinchiná",         marca:"Terpel",   ruta:"Ruta 40 — Chinchiná",municipio:"Chinchiná",        dept:"Caldas",            lat: 4.973, lng:-75.609, servicios:"ACPM · Corriente · Minimarket · Serviteca" },
  /* ── RUTA 25 — Cali → Buga → Cartago → Caucasia → Costa ── */
  { name:"Biomax Palmira",           marca:"Biomax",   ruta:"Ruta 25 — Palmira", municipio:"Palmira",           dept:"Valle del Cauca",   lat: 3.521, lng:-76.302, servicios:"ACPM · Corriente · Extra · GNV · Restaurante · Taller" },
  { name:"Primax Buga",              marca:"Primax",   ruta:"Ruta 25 — Buga",    municipio:"Guadalajara de Buga",dept:"Valle del Cauca",  lat: 3.902, lng:-76.300, servicios:"ACPM · Corriente · Extra · Lavadero · Minimarket" },
  { name:"Terpel Cartago",           marca:"Terpel",   ruta:"Ruta 25 — Cartago", municipio:"Cartago",           dept:"Valle del Cauca",   lat: 4.748, lng:-75.912, servicios:"ACPM · Corriente · Extra · GNV · Serviteca · Restaurante 24h" },
  { name:"Biomax La Virginia",       marca:"Biomax",   ruta:"Ruta 25 — La Virginia",municipio:"La Virginia",    dept:"Risaralda",         lat: 4.894, lng:-75.875, servicios:"ACPM · Corriente · Minimarket · Parqueadero" },
  { name:"Esso Caucasia",            marca:"Esso",     ruta:"Ruta 25 — Caucasia",municipio:"Caucasia",          dept:"Antioquia",         lat: 7.990, lng:-75.196, servicios:"ACPM · Corriente · Extra · Taller · Restaurante · Parqueadero 24h" },
  { name:"Primax Planeta Rica",      marca:"Primax",   ruta:"Ruta 25 — Planeta Rica",municipio:"Planeta Rica",  dept:"Córdoba",           lat: 8.408, lng:-75.587, servicios:"ACPM · Corriente · Minimarket · Lavadero" },
  { name:"Terpel Sahagún",           marca:"Terpel",   ruta:"Ruta 25 — Sahagún", municipio:"Sahagún",           dept:"Córdoba",           lat: 8.944, lng:-75.442, servicios:"ACPM · Corriente · GNV · Serviteca · Restaurante" },
  { name:"Biomax Sincelejo",         marca:"Biomax",   ruta:"Ruta 25 — Sincelejo",municipio:"Sincelejo",        dept:"Sucre",             lat: 9.304, lng:-75.398, servicios:"ACPM · Corriente · Extra · Taller · Minimarket 24h" },
  /* ── RUTA 55 — Bogotá → Tunja → Duitama → Bucaramanga → Cúcuta ── */
  { name:"Terpel Tunja Norte",       marca:"Terpel",   ruta:"Ruta 55 — Tunja",   municipio:"Tunja",             dept:"Boyacá",            lat: 5.540, lng:-73.360, servicios:"ACPM · Corriente · Extra · GNV · Minimarket · Servibay" },
  { name:"Primax Duitama",           marca:"Primax",   ruta:"Ruta 55 — Duitama", municipio:"Duitama",           dept:"Boyacá",            lat: 5.828, lng:-73.030, servicios:"ACPM · Corriente · Extra · Taller · Restaurante" },
  { name:"Biomax Sogamoso",          marca:"Biomax",   ruta:"Ruta 55 — Sogamoso",municipio:"Sogamoso",          dept:"Boyacá",            lat: 5.715, lng:-72.929, servicios:"ACPM · Corriente · Lavadero · Parqueadero camiones" },
  { name:"Esso Bucaramanga Norte",   marca:"Esso",     ruta:"Ruta 55 — Bucaramanga",municipio:"Bucaramanga",    dept:"Santander",         lat: 7.165, lng:-73.110, servicios:"ACPM · Corriente · Extra · GNV · Serviteca · Restaurante 24h" },
  { name:"Terpel Cúcuta",            marca:"Terpel",   ruta:"Ruta 55 — Cúcuta",  municipio:"Cúcuta",            dept:"Norte de Santander",lat: 7.892, lng:-72.508, servicios:"ACPM · Corriente · Extra · Taller · Minimarket — frontera Venezuela" },
  /* ── RUTA 45 / TRONCAL DEL MAGDALENA — Barrancabermeja → Aguachica → Barranquilla ── */
  { name:"Primax Barrancabermeja",   marca:"Primax",   ruta:"Ruta 45 — Barrancabermeja",municipio:"Barrancabermeja",dept:"Santander",     lat: 7.064, lng:-73.857, servicios:"ACPM · Corriente · Extra · GNV · Lavadero industrial · Restaurante" },
  { name:"Biomax Aguachica",         marca:"Biomax",   ruta:"Ruta 55 — Aguachica",municipio:"Aguachica",         dept:"Cesar",            lat: 8.310, lng:-73.612, servicios:"ACPM · Corriente · Minimarket · Taller · Parqueadero" },
  { name:"Terpel Bosconia",          marca:"Terpel",   ruta:"Ruta 80 — Bosconia", municipio:"Bosconia",          dept:"Cesar",            lat:10.026, lng:-73.882, servicios:"ACPM · Corriente · Extra · Cruce Ruta 80 · Restaurante 24h" },
  /* ── RUTA 90 — Barranquilla → Ciénaga → Santa Marta ── */
  { name:"Primax Soledad",           marca:"Primax",   ruta:"Ruta 90 — Soledad", municipio:"Soledad",           dept:"Atlántico",         lat:10.912, lng:-74.773, servicios:"ACPM · Corriente · Extra · GNV · Serviteca · Lavadero" },
  { name:"Esso Ciénaga",             marca:"Esso",     ruta:"Ruta 90 — Ciénaga", municipio:"Ciénaga",           dept:"Magdalena",         lat:11.006, lng:-74.249, servicios:"ACPM · Corriente · Minimarket · Parqueadero 24h" },
  /* ── RUTA 45 — Bogotá → Girardot → Espinal → Ibagué ── */
  { name:"Biomax Girardot",          marca:"Biomax",   ruta:"Ruta 45 — Girardot",municipio:"Girardot",           dept:"Cundinamarca",      lat: 4.303, lng:-74.804, servicios:"ACPM · Corriente · Extra · GNV · Taller · Restaurante" },
  { name:"Terpel Espinal",           marca:"Terpel",   ruta:"Ruta 45 — Espinal", municipio:"Espinal",           dept:"Tolima",            lat: 4.153, lng:-74.886, servicios:"ACPM · Corriente · Lavadero · Minimarket · Parqueadero" },
  { name:"Primax Ibagué Sur",        marca:"Primax",   ruta:"Ruta 45 — Ibagué",  municipio:"Ibagué",            dept:"Tolima",            lat: 4.397, lng:-75.219, servicios:"ACPM · Corriente · Extra · GNV · Serviteca · Restaurante 24h" },
  /* ── RUTA 25 SUR — Cali → Popayán → Pasto → Ipiales ── */
  { name:"Biomax Popayán",           marca:"Biomax",   ruta:"Ruta 25 — Popayán", municipio:"Popayán",           dept:"Cauca",             lat: 2.442, lng:-76.607, servicios:"ACPM · Corriente · Extra · Taller · Restaurante" },
  { name:"Esso Pasto Norte",         marca:"Esso",     ruta:"Ruta 25 — Pasto",   municipio:"Pasto",             dept:"Nariño",            lat: 1.252, lng:-77.281, servicios:"ACPM · Corriente · Minimarket · Lavadero · Serviteca" },
  { name:"Terpel Ipiales",           marca:"Terpel",   ruta:"Ruta 25 — Ipiales", municipio:"Ipiales",           dept:"Nariño",            lat: 0.829, lng:-77.646, servicios:"ACPM · Corriente · Extra — frontera Ecuador · Restaurante 24h" },
  /* ── RUTA 40/23 — Bogotá → Villavicencio → Llanos ── */
  { name:"Primax Villavicencio",     marca:"Primax",   ruta:"Ruta 40 — Villavicencio",municipio:"Villavicencio", dept:"Meta",             lat: 4.149, lng:-73.634, servicios:"ACPM · Corriente · Extra · GNV · Serviteca · Restaurante" },
  { name:"Biomax Granada Meta",      marca:"Biomax",   ruta:"Ruta 40 — Granada", municipio:"Granada",           dept:"Meta",              lat: 3.540, lng:-73.709, servicios:"ACPM · Corriente · Minimarket · Taller · Parqueadero 24h" },
  /* ── RUTA 25/45 — Puerto Boyacá → Honda ── */
  { name:"Terpel Puerto Boyacá",     marca:"Terpel",   ruta:"Ruta 45 — Puerto Boyacá",municipio:"Puerto Boyacá",dept:"Boyacá",            lat: 5.976, lng:-74.590, servicios:"ACPM · Corriente · GNV · Taller pesado · Parqueadero · Restaurante" },
  /* ── RUTA 62 — Bucaramanga → Costa Caribe (interior) ── */
  { name:"Primax Gamarra",           marca:"Primax",   ruta:"Ruta 62 — Gamarra", municipio:"Gamarra",           dept:"Cesar",             lat: 8.327, lng:-73.747, servicios:"ACPM · Corriente · Cruce Ruta 55/62 · Minimarket" },
  /* ── RUTA 45A — Montería ── */
  { name:"Esso Montería",            marca:"Esso",     ruta:"Ruta 25 — Montería",municipio:"Montería",          dept:"Córdoba",           lat: 8.758, lng:-75.886, servicios:"ACPM · Corriente · Extra · GNV · Serviteca · Restaurante" },
  /* ── RUTA 90 — Zona Bananera / Fundación ── */
  { name:"Biomax Fundación",         marca:"Biomax",   ruta:"Ruta 90 — Fundación",municipio:"Fundación",        dept:"Magdalena",         lat:10.524, lng:-74.186, servicios:"ACPM · Corriente · Minimarket · Lavadero · Parqueadero" },
  /* ── RUTA 45A — Arboletes (Urabá) ── */
  { name:"Terpel Arboletes",         marca:"Terpel",   ruta:"Ruta 25 — Arboletes",municipio:"Arboletes",        dept:"Antioquia",         lat: 8.857, lng:-76.422, servicios:"ACPM · Corriente · Taller · Parqueadero · Zona costal" },
];

/* ── PUENTES ESTRATÉGICOS ── */
interface PuenteEstrategico { name: string; ruta: string; municipio: string; dept: string; lat: number; lng: number; longitud?: string; nota?: string; }
const PUENTES_ESTRATEGICOS: PuenteEstrategico[] = [
  { name:"Puente Pumarejo",              ruta:"Ruta 90",    municipio:"Barranquilla/Soledad",dept:"Atlántico",        lat:10.924, lng:-74.793, longitud:"1.5 km", nota:"Conector Costa Atlántica — cierre aisla región" },
  { name:"Viaducto César Gaviria Trujillo",ruta:"Ruta 40", municipio:"Pereira",            dept:"Risaralda",         lat: 4.820, lng:-75.700, longitud:"726 m",  nota:"Eje Cafetero — estratégico Cali-Medellín" },
  { name:"Puente Hisgaura",              ruta:"Ruta 55",    municipio:"Charalá",            dept:"Santander",         lat: 6.290, lng:-73.198, longitud:"646 m",  nota:"Puente colgante sobre Río Chicamocha" },
  { name:"Puente La Libertad",           ruta:"Ruta 45A",   municipio:"Puerto Salgar",      dept:"Cundinamarca",      lat: 5.464, lng:-74.648, longitud:"320 m",  nota:"Cruce Río Magdalena — corredor Bogotá-Medellín" },
  { name:"Puente El Alambrado",          ruta:"Ruta 25",    municipio:"Zarzal",             dept:"Valle del Cauca",   lat: 4.022, lng:-75.726, longitud:"280 m",  nota:"Corredor Cali-Pereira sobre Río La Vieja" },
  { name:"Puente Santander (frontera)",  ruta:"Ruta 55",    municipio:"Villa del Rosario",  dept:"Norte de Santander",lat: 7.842, lng:-72.474, longitud:"312 m",  nota:"Puente internacional Cúcuta-San Cristóbal (VE)" },
  { name:"Puente Guillermo Gaviria",     ruta:"Ruta 45A",   municipio:"Copacabana",         dept:"Antioquia",         lat: 6.356, lng:-75.509, longitud:"450 m",  nota:"Acceso norte Medellín sobre Río Medellín" },
  { name:"Puente Berrío",                ruta:"Ruta 45",    municipio:"Puerto Berrío",      dept:"Antioquia",         lat: 6.490, lng:-74.404, longitud:"270 m",  nota:"Cruce Magdalena — corredor central" },
  { name:"Puente La Honda",              ruta:"Ruta 45",    municipio:"Honda",              dept:"Tolima",            lat: 5.207, lng:-74.741, longitud:"296 m",  nota:"Cruce Magdalena — confluencia rutas 45/46" },
  { name:"Puente Navarro",               ruta:"Ruta 25",    municipio:"Cali",               dept:"Valle del Cauca",   lat: 3.432, lng:-76.522, longitud:"240 m",  nota:"Acceso sur Cali sobre Río Cauca" },
  { name:"Puente Juanchito",             ruta:"Ruta 25",    municipio:"Palmira",            dept:"Valle del Cauca",   lat: 3.443, lng:-76.447, longitud:"320 m",  nota:"Cali-Palmira sobre Río Cauca" },
  { name:"Puente Belalcázar",            ruta:"Ruta 25",    municipio:"Belalcázar",         dept:"Caldas",            lat: 5.031, lng:-75.730, longitud:"260 m",  nota:"Cruce Río Cauca — zona cafetera" },
  { name:"Puente El Cable",              ruta:"Ruta 62",    municipio:"La Dorada",          dept:"Caldas",            lat: 5.455, lng:-74.668, longitud:"180 m",  nota:"Paso Magdalena en La Dorada" },
  { name:"Puente Apiay",                 ruta:"Ruta 40",    municipio:"Villavicencio",      dept:"Meta",              lat: 4.081, lng:-73.584, longitud:"200 m",  nota:"Salida llanos — zona estratégica operaciones" },
  { name:"Puente Nus",                   ruta:"Ruta 62",    municipio:"Maceo",              dept:"Antioquia",         lat: 6.546, lng:-74.778, longitud:"220 m",  nota:"Corredor Medellín-Costa sobre Río Nus" },
  { name:"Puente Vélez",                 ruta:"Ruta 45A",   municipio:"Vélez",              dept:"Santander",         lat: 6.013, lng:-73.682, longitud:"195 m",  nota:"Cruce Río Suárez — corredor oriental" },
  { name:"Puente Sogamoso",              ruta:"Ruta 55",    municipio:"Sogamoso",           dept:"Boyacá",            lat: 5.715, lng:-72.929, longitud:"185 m",  nota:"Corredor Bogotá-Cúcuta sobre Río Chicamocha" },
  { name:"Puente Rumichaca",             ruta:"Ruta 25",    municipio:"Ipiales",            dept:"Nariño",            lat: 0.830, lng:-77.648, longitud:"110 m",  nota:"Puente internacional — frontera Ecuador" },
  { name:"Puente Simón Bolívar (Urabá)", ruta:"Ruta 25",    municipio:"Turbo",              dept:"Antioquia",         lat: 8.094, lng:-76.728, longitud:"250 m",  nota:"Acceso Urabá — zona de alta sensibilidad" },
  { name:"Puente Magangué",              ruta:"Ruta 25",    municipio:"Magangué",           dept:"Bolívar",           lat: 9.239, lng:-74.755, longitud:"290 m",  nota:"Cruce Magdalena — corredor central norte" },
  { name:"Viaducto Peñas Blancas",       ruta:"Ruta 45A",   municipio:"Puerto Nare",        dept:"Antioquia",         lat: 6.200, lng:-74.591, longitud:"310 m",  nota:"Autopista Ríonegro-Medellín, zona viaductos" },
  { name:"Puente Buga",                  ruta:"Ruta 25",    municipio:"Guadalajara de Buga",dept:"Valle del Cauca",   lat: 3.901, lng:-76.299, longitud:"210 m",  nota:"Cruce Río Cauca en corredor Cali-Bogotá" },
];

/* ── INFRAESTRUCTURA PETROLERA / OLEODUCTOS ── */
interface PuntoOleoducto { name: string; tipo: string; operador: string; municipio: string; dept: string; lat: number; lng: number; nota?: string; }
const OLEODUCTOS: PuntoOleoducto[] = [
  { name:"Refinería de Barrancabermeja",    tipo:"Refinería",           operador:"Ecopetrol",    municipio:"Barrancabermeja",   dept:"Santander",         lat: 7.063, lng:-73.864, nota:"Principal refinería Colombia — 250.000 bpd" },
  { name:"Refinería Reficar Cartagena",     tipo:"Refinería",           operador:"Reficar/Ecopetrol",municipio:"Cartagena",     dept:"Bolívar",           lat:10.371, lng:-75.509, nota:"250.000 bpd — exportación caribe" },
  { name:"Estación Caño Limón",             tipo:"Campo / Estación",    operador:"Ecopetrol/Oxy", municipio:"Arauca",           dept:"Arauca",            lat: 6.940, lng:-70.974, nota:"Campo Caño Limón — oleoducto a Coveñas" },
  { name:"Estación Araguaney",              tipo:"Estación de bombeo",  operador:"Cenit",        municipio:"Trinidad",          dept:"Casanare",          lat: 5.428, lng:-71.663, nota:"Corredor petrolero Llanos Orientales" },
  { name:"Estación Apiay",                  tipo:"Estación de bombeo",  operador:"Ecopetrol",    municipio:"Villavicencio",     dept:"Meta",              lat: 4.082, lng:-73.583, nota:"Campo Apiay — Meta oil corridor" },
  { name:"Estación Vasconia",               tipo:"Nodo multimodal",     operador:"Cenit",        municipio:"Puerto Boyacá",     dept:"Boyacá",            lat: 5.960, lng:-74.585, nota:"Centro de operaciones oleoductos centrales" },
  { name:"Terminal Coveñas",                tipo:"Terminal marítima",   operador:"Cenit",        municipio:"Coveñas",           dept:"Sucre",             lat: 9.401, lng:-75.694, nota:"Principal terminal exportación petróleo" },
  { name:"Estación Orito",                  tipo:"Campo / Estación",    operador:"Ecopetrol",    municipio:"Orito",             dept:"Putumayo",          lat: 0.671, lng:-76.877, nota:"Campo Orito — oleoducto Trasandino" },
  { name:"Puerto Salgar (Poliducto)",        tipo:"Terminal",            operador:"Cenit",        municipio:"Puerto Salgar",     dept:"Cundinamarca",      lat: 5.460, lng:-74.650, nota:"Nodo poliducto Barrancabermeja-Bogotá" },
  { name:"Estación Ayacucho",               tipo:"Estación de bombeo",  operador:"Cenit",        municipio:"San Roque",         dept:"Antioquia",         lat: 6.483, lng:-74.917, nota:"Corredor oleoducto hacia Costa Atlántica" },
  { name:"Estación El Porvenir",            tipo:"Estación de bombeo",  operador:"Cenit",        municipio:"Riosucio",          dept:"Chocó",             lat: 7.428, lng:-77.121, nota:"Oleoducto Colombia — costa Pacífica" },
  { name:"Terminal Buenaventura Cenit",     tipo:"Terminal marítima",   operador:"Cenit",        municipio:"Buenaventura",      dept:"Valle del Cauca",   lat: 3.891, lng:-77.032, nota:"Terminal exportación Pacífico" },
  { name:"Estación Tibú",                   tipo:"Campo / Estación",    operador:"Ecopetrol",    municipio:"Tibú",              dept:"Norte de Santander",lat: 8.666, lng:-72.730, nota:"Campo Tibú — oleoducto norte" },
  { name:"El Limón (Km 0 Caño Limón-Coveñas)",tipo:"Cabecera oleoducto",operador:"Cenit",      municipio:"Toledo",            dept:"Norte de Santander",lat: 8.052, lng:-72.933, nota:"Inicio oleoducto 770 km — blanco frecuente ELN" },
  { name:"Pozos Colorados (terminal GLP)",  tipo:"Terminal GLP",        operador:"Promigas",     municipio:"Santa Marta",       dept:"Magdalena",         lat:11.216, lng:-74.168, nota:"Terminal gas licuado costa caribe" },
];

/* ── MUNICIPIOS PDET (Programas de Desarrollo con Enfoque Territorial) ── */
interface MunicipioPDET { name: string; subregion: string; dept: string; lat: number; lng: number; riesgo: "Crítico"|"Alto"|"Medio"; }
const MUNICIPIOS_PDET: MunicipioPDET[] = [
  /* ── PACÍFICO MEDIO ── */
  { name:"Tumaco",               subregion:"Pacífico Nariñense",     dept:"Nariño",            lat: 1.801, lng:-78.762, riesgo:"Crítico" },
  { name:"Barbacoas",            subregion:"Pacífico Nariñense",     dept:"Nariño",            lat: 1.671, lng:-78.143, riesgo:"Crítico" },
  { name:"Timbiquí",             subregion:"Pacífico Caucano",       dept:"Cauca",             lat: 2.771, lng:-77.663, riesgo:"Crítico" },
  { name:"López de Micay",       subregion:"Pacífico Caucano",       dept:"Cauca",             lat: 2.886, lng:-77.232, riesgo:"Crítico" },
  { name:"El Charco",            subregion:"Pacífico Nariñense",     dept:"Nariño",            lat: 2.484, lng:-78.112, riesgo:"Alto" },
  { name:"Olaya Herrera",        subregion:"Pacífico Nariñense",     dept:"Nariño",            lat: 2.041, lng:-78.397, riesgo:"Alto" },
  /* ── CHOCÓ ── */
  { name:"Riosucio",             subregion:"Chocó",                  dept:"Chocó",             lat: 7.428, lng:-77.121, riesgo:"Crítico" },
  { name:"Bojayá",               subregion:"Chocó",                  dept:"Chocó",             lat: 5.833, lng:-76.866, riesgo:"Crítico" },
  { name:"Carmen del Darién",    subregion:"Chocó",                  dept:"Chocó",             lat: 7.368, lng:-76.720, riesgo:"Crítico" },
  { name:"El Litoral del San Juan",subregion:"Chocó",                dept:"Chocó",             lat: 4.675, lng:-77.225, riesgo:"Alto" },
  /* ── ANTIOQUIA ── */
  { name:"Ituango",              subregion:"Bajo Cauca / Nordeste",  dept:"Antioquia",         lat: 7.166, lng:-75.764, riesgo:"Crítico" },
  { name:"Tarazá",               subregion:"Bajo Cauca",             dept:"Antioquia",         lat: 7.873, lng:-75.398, riesgo:"Crítico" },
  { name:"Valdivia",             subregion:"Bajo Cauca / Nordeste",  dept:"Antioquia",         lat: 7.151, lng:-75.436, riesgo:"Crítico" },
  { name:"El Bagre",             subregion:"Bajo Cauca",             dept:"Antioquia",         lat: 7.594, lng:-74.813, riesgo:"Alto" },
  { name:"Zaragoza",             subregion:"Bajo Cauca",             dept:"Antioquia",         lat: 7.489, lng:-74.869, riesgo:"Alto" },
  { name:"Cáceres",              subregion:"Bajo Cauca",             dept:"Antioquia",         lat: 7.588, lng:-75.346, riesgo:"Alto" },
  { name:"Remedios",             subregion:"Nordeste Antioqueño",    dept:"Antioquia",         lat: 7.033, lng:-74.696, riesgo:"Alto" },
  { name:"Mutatá",               subregion:"Urabá",                  dept:"Antioquia",         lat: 7.243, lng:-76.428, riesgo:"Alto" },
  { name:"Dabeiba",              subregion:"Urabá",                  dept:"Antioquia",         lat: 7.001, lng:-76.262, riesgo:"Alto" },
  /* ── BOLÍVAR / CÓRDOBA ── */
  { name:"San Pablo",            subregion:"Sur de Bolívar",         dept:"Bolívar",           lat: 8.328, lng:-73.852, riesgo:"Crítico" },
  { name:"Santa Rosa del Sur",   subregion:"Sur de Bolívar",         dept:"Bolívar",           lat: 7.959, lng:-74.043, riesgo:"Crítico" },
  { name:"Montecristo",          subregion:"Sur de Bolívar",         dept:"Bolívar",           lat: 8.295, lng:-74.471, riesgo:"Alto" },
  /* ── NORTE DE SANTANDER ── */
  { name:"Tibú",                 subregion:"Catatumbo",              dept:"Norte de Santander",lat: 8.666, lng:-72.730, riesgo:"Crítico" },
  { name:"El Tarra",             subregion:"Catatumbo",              dept:"Norte de Santander",lat: 8.574, lng:-73.087, riesgo:"Crítico" },
  { name:"Convención",           subregion:"Catatumbo",              dept:"Norte de Santander",lat: 8.468, lng:-73.187, riesgo:"Crítico" },
  { name:"Teorama",              subregion:"Catatumbo",              dept:"Norte de Santander",lat: 8.477, lng:-73.265, riesgo:"Alto" },
  { name:"San Calixto",          subregion:"Catatumbo",              dept:"Norte de Santander",lat: 8.400, lng:-73.173, riesgo:"Alto" },
  /* ── PUTUMAYO / CAQUETÁ ── */
  { name:"Puerto Asís",          subregion:"Putumayo",               dept:"Putumayo",          lat: 0.507, lng:-76.502, riesgo:"Crítico" },
  { name:"Valle del Guamuez",    subregion:"Putumayo",               dept:"Putumayo",          lat: 0.434, lng:-76.909, riesgo:"Crítico" },
  { name:"Orito",                subregion:"Putumayo",               dept:"Putumayo",          lat: 0.671, lng:-76.877, riesgo:"Alto" },
  { name:"San Vicente del Caguán",subregion:"Caguán-Piedemonte",     dept:"Caquetá",           lat: 2.107, lng:-74.767, riesgo:"Crítico" },
  { name:"Cartagena del Chairá", subregion:"Caguán-Piedemonte",      dept:"Caquetá",           lat: 1.347, lng:-74.863, riesgo:"Alto" },
  /* ── META / GUAVIARE ── */
  { name:"Vista Hermosa",        subregion:"Macarena-Guaviare",      dept:"Meta",              lat: 3.121, lng:-73.741, riesgo:"Crítico" },
  { name:"La Macarena",          subregion:"Macarena-Guaviare",      dept:"Meta",              lat: 2.179, lng:-73.789, riesgo:"Crítico" },
  { name:"Mapiripán",            subregion:"Macarena-Guaviare",      dept:"Meta",              lat: 2.896, lng:-72.143, riesgo:"Crítico" },
  { name:"San José del Guaviare",subregion:"Macarena-Guaviare",      dept:"Guaviare",          lat: 2.568, lng:-72.641, riesgo:"Alto" },
];

/* ── RIESGO MINAS ANTIPERSONAL (AICMA/Descontamina Colombia) ── */
interface ZonaMinasAP { name: string; dept: string; lat: number; lng: number; nivel: "Crítico"|"Alto"|"Medio"; eventos?: number; }
const ZONAS_MINAS_AP: ZonaMinasAP[] = [
  { name:"Ituango",           dept:"Antioquia",         lat: 7.166, lng:-75.764, nivel:"Crítico", eventos:142 },
  { name:"Briceño",           dept:"Antioquia",         lat: 7.210, lng:-75.559, nivel:"Crítico", eventos:98  },
  { name:"Tarazá",            dept:"Antioquia",         lat: 7.873, lng:-75.398, nivel:"Crítico", eventos:87  },
  { name:"Valdivia",          dept:"Antioquia",         lat: 7.151, lng:-75.436, nivel:"Crítico", eventos:76  },
  { name:"San Carlos",        dept:"Antioquia",         lat: 6.186, lng:-74.999, nivel:"Alto",    eventos:64  },
  { name:"Remedios",          dept:"Antioquia",         lat: 7.033, lng:-74.696, nivel:"Alto",    eventos:58  },
  { name:"Dabeiba",           dept:"Antioquia",         lat: 7.001, lng:-76.262, nivel:"Alto",    eventos:52  },
  { name:"Tibú",              dept:"Norte de Santander",lat: 8.666, lng:-72.730, nivel:"Crítico", eventos:115 },
  { name:"El Tarra",          dept:"Norte de Santander",lat: 8.574, lng:-73.087, nivel:"Crítico", eventos:93  },
  { name:"Teorama",           dept:"Norte de Santander",lat: 8.477, lng:-73.265, nivel:"Alto",    eventos:71  },
  { name:"Convención",        dept:"Norte de Santander",lat: 8.468, lng:-73.187, nivel:"Alto",    eventos:54  },
  { name:"San Vicente del Caguán",dept:"Caquetá",       lat: 2.107, lng:-74.767, nivel:"Crítico", eventos:108 },
  { name:"Cartagena del Chairá",dept:"Caquetá",         lat: 1.347, lng:-74.863, nivel:"Alto",    eventos:77  },
  { name:"Puerto Rico",       dept:"Caquetá",           lat: 1.911, lng:-75.162, nivel:"Alto",    eventos:61  },
  { name:"La Macarena",       dept:"Meta",              lat: 2.179, lng:-73.789, nivel:"Crítico", eventos:119 },
  { name:"Vista Hermosa",     dept:"Meta",              lat: 3.121, lng:-73.741, nivel:"Crítico", eventos:84  },
  { name:"El Castillo",       dept:"Meta",              lat: 3.556, lng:-73.687, nivel:"Alto",    eventos:59  },
  { name:"San José del Guaviare",dept:"Guaviare",       lat: 2.568, lng:-72.641, nivel:"Alto",    eventos:66  },
  { name:"El Retorno",        dept:"Guaviare",          lat: 2.319, lng:-72.627, nivel:"Medio",   eventos:38  },
  { name:"Tumaco",            dept:"Nariño",            lat: 1.801, lng:-78.762, nivel:"Crítico", eventos:102 },
  { name:"Barbacoas",         dept:"Nariño",            lat: 1.671, lng:-78.143, nivel:"Crítico", eventos:88  },
  { name:"Ricaurte",          dept:"Nariño",            lat: 1.210, lng:-78.012, nivel:"Alto",    eventos:56  },
  { name:"Riosucio",          dept:"Chocó",             lat: 7.428, lng:-77.121, nivel:"Crítico", eventos:97  },
  { name:"Bojayá",            dept:"Chocó",             lat: 5.833, lng:-76.866, nivel:"Alto",    eventos:67  },
  { name:"Valle del Guamuez", dept:"Putumayo",          lat: 0.434, lng:-76.909, nivel:"Crítico", eventos:111 },
  { name:"Puerto Asís",       dept:"Putumayo",          lat: 0.507, lng:-76.502, nivel:"Alto",    eventos:73  },
  { name:"Orito",             dept:"Putumayo",          lat: 0.671, lng:-76.877, nivel:"Alto",    eventos:60  },
  { name:"Samaná",            dept:"Caldas",            lat: 5.480, lng:-74.997, nivel:"Medio",   eventos:34  },
  { name:"San Luis",          dept:"Antioquia",         lat: 6.038, lng:-74.905, nivel:"Medio",   eventos:41  },
  { name:"Murindó",           dept:"Antioquia",         lat: 6.979, lng:-76.745, nivel:"Alto",    eventos:55  },
];

/* ── CENTROS PENITENCIARIOS INPEC ── */
interface CentroINPEC { name: string; ciudad: string; dept: string; lat: number; lng: number; capacidad?: number; tel?: string; }
const CENTROS_INPEC: CentroINPEC[] = [
  { name:"La Picota (COMEB)",            ciudad:"Bogotá",       dept:"Bogotá D.C.",     lat: 4.566, lng:-74.104, capacidad:4800, tel:"(601) 782-5600" },
  { name:"La Modelo (EPMSC Bogotá)",     ciudad:"Bogotá",       dept:"Bogotá D.C.",     lat: 4.671, lng:-74.096, capacidad:5200, tel:"(601) 437-9070" },
  { name:"El Buen Pastor (Bogotá)",      ciudad:"Bogotá",       dept:"Bogotá D.C.",     lat: 4.638, lng:-74.093, capacidad:1200, tel:"(601) 222-3060" },
  { name:"La Dorada La 40 (EPMSC)",      ciudad:"Bogotá",       dept:"Bogotá D.C.",     lat: 4.598, lng:-74.086, capacidad:2000, tel:"(601) 410-1212" },
  { name:"Bellavista (EPMSC Medellín)",  ciudad:"Medellín",     dept:"Antioquia",       lat: 6.271, lng:-75.549, capacidad:4600, tel:"(604) 233-2066" },
  { name:"Cómbita (ERON Alta Seguridad)",ciudad:"Cómbita",      dept:"Boyacá",          lat: 5.755, lng:-73.347, capacidad:1200, tel:"(608) 738-6700" },
  { name:"El Palogordo (ERON)",          ciudad:"Girón",        dept:"Santander",       lat: 7.070, lng:-73.171, capacidad:2100, tel:"(607) 681-2424" },
  { name:"Valledupar (Alta Seguridad)",  ciudad:"Valledupar",   dept:"Cesar",           lat:10.453, lng:-73.230, capacidad:2200, tel:"(605) 580-0060" },
  { name:"Palmira (ERON)",              ciudad:"Palmira",       dept:"Valle del Cauca", lat: 3.531, lng:-76.307, capacidad:1800, tel:"(602) 272-2808" },
  { name:"EPMSC Cali (Villa Hermosa)",   ciudad:"Cali",         dept:"Valle del Cauca", lat: 3.431, lng:-76.530, capacidad:2500, tel:"(602) 550-0707" },
  { name:"Jamundí (ERON)",              ciudad:"Jamundí",       dept:"Valle del Cauca", lat: 3.265, lng:-76.535, capacidad:1500, tel:"(602) 517-7777" },
  { name:"Popayán (ERON)",              ciudad:"Popayán",       dept:"Cauca",           lat: 2.445, lng:-76.609, capacidad:900,  tel:"(602) 824-0606" },
  { name:"EPMSC Barranquilla",          ciudad:"Barranquilla",  dept:"Atlántico",       lat:10.985, lng:-74.806, capacidad:2100, tel:"(605) 380-0001" },
  { name:"Ternera (EPMSC Cartagena)",   ciudad:"Cartagena",     dept:"Bolívar",         lat:10.393, lng:-75.499, capacidad:1800, tel:"(605) 670-3030" },
  { name:"Montería (EPMSC)",            ciudad:"Montería",      dept:"Córdoba",         lat: 8.763, lng:-75.880, capacidad:1200, tel:"(604) 789-0909" },
  { name:"Cúcuta (EPMSC El Rodeo)",     ciudad:"Cúcuta",        dept:"Norte de Santander",lat: 7.882, lng:-72.502, capacidad:1900, tel:"(607) 573-4040" },
  { name:"Villavicencio (EPMSC)",       ciudad:"Villavicencio", dept:"Meta",            lat: 4.140, lng:-73.628, capacidad:1100, tel:"(608) 662-2020" },
  { name:"Ibagué (EPMSC)",             ciudad:"Ibagué",        dept:"Tolima",          lat: 4.430, lng:-75.247, capacidad:900,  tel:"(608) 261-5050" },
  { name:"Pereira (EPMSC)",            ciudad:"Pereira",       dept:"Risaralda",       lat: 4.807, lng:-75.693, capacidad:1200, tel:"(606) 335-1515" },
  { name:"Manizales (EPMSC La Blanca)", ciudad:"Manizales",     dept:"Caldas",          lat: 5.059, lng:-75.507, capacidad:800,  tel:"(606) 872-0505" },
  { name:"Neiva (EPMSC La Picaleña)",   ciudad:"Neiva",         dept:"Huila",           lat: 2.932, lng:-75.288, capacidad:900,  tel:"(608) 872-4040" },
  { name:"Florencia (EPMSC)",          ciudad:"Florencia",     dept:"Caquetá",         lat: 1.616, lng:-75.613, capacidad:700,  tel:"(608) 435-1212" },
  { name:"Santa Marta (EPMSC)",        ciudad:"Santa Marta",   dept:"Magdalena",       lat:11.235, lng:-74.192, capacidad:800,  tel:"(605) 420-1616" },
  { name:"Tunja (EPMSC)",              ciudad:"Tunja",         dept:"Boyacá",          lat: 5.534, lng:-73.365, capacidad:750,  tel:"(608) 740-0404" },
  { name:"Armenia (EPMSC)",            ciudad:"Armenia",       dept:"Quindío",         lat: 4.534, lng:-75.670, capacidad:700,  tel:"(606) 747-0303" },
  { name:"Pasto (EPMSC La Paz)",        ciudad:"Pasto",         dept:"Nariño",          lat: 1.213, lng:-77.281, capacidad:900,  tel:"(602) 723-3535" },
];

/* ── ZONAS MINERAS ACTIVAS ── */
interface ZonaMinera { name: string; mineral: string; tipo: "Legal"|"Ilegal"|"Mixto"; dept: string; lat: number; lng: number; nota?: string; }
const ZONAS_MINERAS: ZonaMinera[] = [
  { name:"El Bagre / Zaragoza / Nechí",  mineral:"Oro",    tipo:"Mixto",  dept:"Antioquia",         lat: 7.530, lng:-74.830, nota:"Triángulo minero — alta presencia grupos armados" },
  { name:"Segovia / Remedios",           mineral:"Oro",    tipo:"Mixto",  dept:"Antioquia",         lat: 7.078, lng:-74.718, nota:"Explotación legal + ilegal — conflicto activo" },
  { name:"Caucasia / Tarazá",            mineral:"Oro",    tipo:"Mixto",  dept:"Antioquia",         lat: 7.931, lng:-75.297, nota:"Minería aluvial Bajo Cauca — extorsión" },
  { name:"Ituango",                      mineral:"Oro",    tipo:"Ilegal", dept:"Antioquia",         lat: 7.166, lng:-75.764, nota:"Minería ilegal — financiación grupos armados" },
  { name:"Muzo",                         mineral:"Esmeralda",tipo:"Legal",dept:"Boyacá",            lat: 5.534, lng:-74.112, nota:"Capital esmeraldas — 90% producción mundial" },
  { name:"Coscuez / Chivor",             mineral:"Esmeralda",tipo:"Legal",dept:"Boyacá",            lat: 5.635, lng:-73.889, nota:"Zona esmeraldífera oriente boyacense" },
  { name:"Tibú / El Tarra",              mineral:"Carbón", tipo:"Mixto",  dept:"Norte de Santander",lat: 8.620, lng:-72.908, nota:"Cuenca carbonífera Catatumbo — activo conflicto" },
  { name:"Barrancas / La Jagua",         mineral:"Carbón", tipo:"Legal",  dept:"Cesar/La Guajira",  lat:10.787, lng:-72.797, nota:"Minas El Cerrejón y Pribbenow — exportación" },
  { name:"El Cerrejón",                  mineral:"Carbón", tipo:"Legal",  dept:"La Guajira",        lat:11.029, lng:-72.674, nota:"Mayor mina carbón cielo abierto Latinoamérica" },
  { name:"Puerto Nariño (Amazonas)",     mineral:"Oro",    tipo:"Ilegal", dept:"Amazonas",          lat:-3.769, lng:-70.383, nota:"Minería ilegal zonas de frontera" },
  { name:"Istmina / Tadó",              mineral:"Oro",    tipo:"Mixto",  dept:"Chocó",             lat: 5.162, lng:-76.672, nota:"Chocó — mayor producción oro Colombia" },
  { name:"Quibdó / Río Atrato",         mineral:"Oro",    tipo:"Mixto",  dept:"Chocó",             lat: 5.696, lng:-76.641, nota:"Minería fluvial — impacto ambiental severo" },
  { name:"Tumaco / Barbacoas",          mineral:"Oro",    tipo:"Ilegal", dept:"Nariño",            lat: 1.730, lng:-78.452, nota:"Minería ilegal — grupos armados" },
  { name:"Buenaventura (Dagua)",        mineral:"Oro",    tipo:"Ilegal", dept:"Valle del Cauca",   lat: 3.745, lng:-77.025, nota:"Zona serranía — presencia irregular" },
  { name:"Puerto Libertador / Montelíbano",mineral:"Carbón/Níquel",tipo:"Legal",dept:"Córdoba",   lat: 7.888, lng:-75.792, nota:"Cerro Matoso — mayor productor níquel LATAM" },
  { name:"La Dorada / Puerto Salgar",   mineral:"Oro",    tipo:"Ilegal", dept:"Caldas/Cundinamarca",lat: 5.468, lng:-74.659, nota:"Minería aluvial Río Magdalena" },
  { name:"San José del Guaviare",       mineral:"Oro",    tipo:"Ilegal", dept:"Guaviare",          lat: 2.568, lng:-72.641, nota:"Minería ilegal Amazonia" },
  { name:"Vistahermosa / La Macarena",  mineral:"Oro",    tipo:"Ilegal", dept:"Meta",              lat: 2.650, lng:-73.765, nota:"Minería ilegal zona PDET — alta tensión" },
];

/* ── DEPÓSITOS HABILITADOS DIAN ── */
interface DepositoDIAN { name: string; operador: string; ciudad: string; dept: string; lat: number; lng: number; tipo: string; tel?: string; }
const DEPOSITOS_DIAN: DepositoDIAN[] = [
  { name:"Almaviva El Dorado Bogotá",       operador:"Almaviva",     ciudad:"Bogotá",       dept:"Bogotá D.C.",     lat: 4.699, lng:-74.138, tipo:"Aéreo — carga general y perecederos",  tel:"(601) 413-5900" },
  { name:"Almaviva Zona Franca Bogotá",     operador:"Almaviva",     ciudad:"Bogotá",       dept:"Bogotá D.C.",     lat: 4.691, lng:-74.153, tipo:"Zona franca — almacenaje aduanero",    tel:"(601) 413-5910" },
  { name:"Almaviva Medellín (Rionegro)",    operador:"Almaviva",     ciudad:"Rionegro",     dept:"Antioquia",       lat: 6.165, lng:-75.421, tipo:"Aéreo — carga internacional",           tel:"(604) 569-0050" },
  { name:"Almaviva Barranquilla",           operador:"Almaviva",     ciudad:"Barranquilla", dept:"Atlántico",       lat:10.976, lng:-74.808, tipo:"Portuario — carga marítima",           tel:"(605) 379-1200" },
  { name:"Almaviva Buenaventura",           operador:"Almaviva",     ciudad:"Buenaventura", dept:"Valle del Cauca", lat: 3.887, lng:-77.027, tipo:"Portuario — contenedores",             tel:"(602) 240-1100" },
  { name:"Almaviva Cali (Palmaseca)",       operador:"Almaviva",     ciudad:"Palmira",      dept:"Valle del Cauca", lat: 3.546, lng:-76.389, tipo:"Aéreo — carga y perecederos",          tel:"(602) 665-1200" },
  { name:"Almagrario Bogotá El Dorado",     operador:"Almagrario",   ciudad:"Bogotá",       dept:"Bogotá D.C.",     lat: 4.701, lng:-74.141, tipo:"Aéreo — valorables y especiales",     tel:"(601) 266-1800" },
  { name:"Almagrario Barranquilla Puerto",  operador:"Almagrario",   ciudad:"Barranquilla", dept:"Atlántico",       lat:10.963, lng:-74.803, tipo:"Portuario — granel y carga general",  tel:"(605) 379-0500" },
  { name:"Almagrario Cartagena",            operador:"Almagrario",   ciudad:"Cartagena",    dept:"Bolívar",         lat:10.388, lng:-75.488, tipo:"Portuario — contenedores, granel",    tel:"(605) 693-1100" },
  { name:"Almagrario Buenaventura",         operador:"Almagrario",   ciudad:"Buenaventura", dept:"Valle del Cauca", lat: 3.883, lng:-77.030, tipo:"Portuario — contenedores",            tel:"(602) 240-1050" },
  { name:"Alpopular Bogotá El Dorado",      operador:"Alpopular",    ciudad:"Bogotá",       dept:"Bogotá D.C.",     lat: 4.700, lng:-74.143, tipo:"Aéreo — carga general y courier",     tel:"(601) 266-2300" },
  { name:"Alpopular Barranquilla",          operador:"Alpopular",    ciudad:"Barranquilla", dept:"Atlántico",       lat:10.972, lng:-74.806, tipo:"Portuario — almacenaje y distribución",tel:"(605) 379-0600" },
  { name:"Alpopular Cartagena Puerto",      operador:"Alpopular",    ciudad:"Cartagena",    dept:"Bolívar",         lat:10.391, lng:-75.485, tipo:"Portuario — carga general",            tel:"(605) 693-1200" },
  { name:"Depósito SPRBUN Buenaventura",    operador:"SPRBUN",       ciudad:"Buenaventura", dept:"Valle del Cauca", lat: 3.886, lng:-77.026, tipo:"Portuario habilitado — contenedores", tel:"(602) 240-1000" },
  { name:"Depósito Contecar Cartagena",     operador:"Contecar",     ciudad:"Cartagena",    dept:"Bolívar",         lat:10.365, lng:-75.503, tipo:"Portuario habilitado — contenedores", tel:"(605) 693-9100" },
  { name:"DHL Global Forwarding Bogotá",    operador:"DHL",          ciudad:"Bogotá",       dept:"Bogotá D.C.",     lat: 4.703, lng:-74.146, tipo:"Aéreo habilitado — courier y carga",  tel:"(601) 800-0345" },
];

/* ── CULTIVOS ILÍCITOS — SIMCI / UNODC ── */
interface CultivoIlicito { name: string; dept: string; lat: number; lng: number; cultivo: "Coca"|"Amapola"|"Cannabis"; hectareas: number; tendencia: "↑"|"↓"|"→"; }
const CULTIVOS_ILICITOS: CultivoIlicito[] = [
  /* ── Nariño (Región 1 del país) ── */
  { name:"Tumaco",                dept:"Nariño",            lat: 1.801, lng:-78.762, cultivo:"Coca",    hectareas:37890, tendencia:"↑" },
  { name:"Barbacoas",             dept:"Nariño",            lat: 1.671, lng:-78.143, cultivo:"Coca",    hectareas:15600, tendencia:"↑" },
  { name:"Ricaurte",              dept:"Nariño",            lat: 1.210, lng:-78.012, cultivo:"Coca",    hectareas:11800, tendencia:"→" },
  { name:"El Charco",             dept:"Nariño",            lat: 2.484, lng:-78.112, cultivo:"Coca",    hectareas:12400, tendencia:"↑" },
  { name:"Olaya Herrera",         dept:"Nariño",            lat: 2.041, lng:-78.397, cultivo:"Coca",    hectareas:11200, tendencia:"↑" },
  { name:"Magüí Payán",           dept:"Nariño",            lat: 1.838, lng:-77.586, cultivo:"Coca",    hectareas:10200, tendencia:"→" },
  { name:"La Tola",               dept:"Nariño",            lat: 2.006, lng:-78.279, cultivo:"Coca",    hectareas: 4900, tendencia:"→" },
  /* ── Norte de Santander / Catatumbo ── */
  { name:"Tibú",                  dept:"Norte de Santander",lat: 8.666, lng:-72.730, cultivo:"Coca",    hectareas:31200, tendencia:"↑" },
  { name:"Convención",            dept:"Norte de Santander",lat: 8.468, lng:-73.187, cultivo:"Coca",    hectareas:12700, tendencia:"↑" },
  { name:"El Tarra",              dept:"Norte de Santander",lat: 8.574, lng:-73.087, cultivo:"Coca",    hectareas: 9400, tendencia:"↑" },
  { name:"Teorama",               dept:"Norte de Santander",lat: 8.477, lng:-73.265, cultivo:"Coca",    hectareas: 7100, tendencia:"→" },
  /* ── Putumayo ── */
  { name:"Valle del Guamuez",     dept:"Putumayo",          lat: 0.434, lng:-76.909, cultivo:"Coca",    hectareas:22400, tendencia:"↑" },
  { name:"San Miguel",            dept:"Putumayo",          lat: 0.293, lng:-76.893, cultivo:"Coca",    hectareas:16800, tendencia:"↑" },
  { name:"Puerto Asís",           dept:"Putumayo",          lat: 0.507, lng:-76.502, cultivo:"Coca",    hectareas:14200, tendencia:"→" },
  { name:"Orito",                 dept:"Putumayo",          lat: 0.671, lng:-76.877, cultivo:"Coca",    hectareas: 8900, tendencia:"↓" },
  /* ── Meta / Guaviare / Caquetá ── */
  { name:"La Macarena",           dept:"Meta",              lat: 2.179, lng:-73.789, cultivo:"Coca",    hectareas:18900, tendencia:"↑" },
  { name:"Mapiripán",             dept:"Meta",              lat: 2.896, lng:-72.143, cultivo:"Coca",    hectareas:12300, tendencia:"→" },
  { name:"Vista Hermosa",         dept:"Meta",              lat: 3.121, lng:-73.741, cultivo:"Coca",    hectareas: 9700, tendencia:"↓" },
  { name:"San José del Guaviare", dept:"Guaviare",          lat: 2.568, lng:-72.641, cultivo:"Coca",    hectareas:13400, tendencia:"↑" },
  { name:"El Retorno",            dept:"Guaviare",          lat: 2.319, lng:-72.627, cultivo:"Coca",    hectareas: 8200, tendencia:"→" },
  { name:"Calamar",               dept:"Guaviare",          lat: 1.963, lng:-72.636, cultivo:"Coca",    hectareas: 7800, tendencia:"→" },
  { name:"San Vicente del Caguán",dept:"Caquetá",           lat: 2.107, lng:-74.767, cultivo:"Coca",    hectareas: 5400, tendencia:"↓" },
  { name:"Puerto Rico",           dept:"Caquetá",           lat: 1.911, lng:-75.162, cultivo:"Coca",    hectareas: 7600, tendencia:"→" },
  { name:"Cartagena del Chairá",  dept:"Caquetá",           lat: 1.347, lng:-74.863, cultivo:"Coca",    hectareas: 6800, tendencia:"→" },
  /* ── Cauca ── */
  { name:"Timbiquí",              dept:"Cauca",             lat: 2.771, lng:-77.663, cultivo:"Coca",    hectareas: 9800, tendencia:"↑" },
  { name:"López de Micay",        dept:"Cauca",             lat: 2.886, lng:-77.232, cultivo:"Coca",    hectareas: 8700, tendencia:"↑" },
  /* ── Antioquia ── */
  { name:"Ituango",               dept:"Antioquia",         lat: 7.166, lng:-75.764, cultivo:"Coca",    hectareas: 7200, tendencia:"↑" },
  { name:"Tarazá",                dept:"Antioquia",         lat: 7.873, lng:-75.398, cultivo:"Coca",    hectareas: 4800, tendencia:"→" },
  { name:"Briceño",               dept:"Antioquia",         lat: 7.210, lng:-75.559, cultivo:"Coca",    hectareas: 5300, tendencia:"→" },
  /* ── Bolívar ── */
  { name:"San Pablo",             dept:"Bolívar",           lat: 8.328, lng:-73.852, cultivo:"Coca",    hectareas: 8100, tendencia:"↑" },
  { name:"Santa Rosa del Sur",    dept:"Bolívar",           lat: 7.959, lng:-74.043, cultivo:"Coca",    hectareas: 6400, tendencia:"→" },
  /* ── Chocó ── */
  { name:"Riosucio",              dept:"Chocó",             lat: 7.428, lng:-77.121, cultivo:"Coca",    hectareas: 6900, tendencia:"↑" },
  { name:"Bojayá",                dept:"Chocó",             lat: 5.833, lng:-76.866, cultivo:"Coca",    hectareas: 4200, tendencia:"→" },
  /* ── Amapola — Cauca/Nariño ── */
  { name:"Páez (Belalcázar)",     dept:"Cauca",             lat: 2.612, lng:-75.989, cultivo:"Amapola", hectareas:  890, tendencia:"↓" },
  { name:"Samaniego",             dept:"Nariño",            lat: 1.339, lng:-77.595, cultivo:"Amapola", hectareas:  640, tendencia:"↓" },
];

/* ── GRUPOS ARMADOS — PRESENCIA POR SUBREGIÓN ── */
interface GrupoArmado { name: string; grupo: string; subregion: string; dept: string; lat: number; lng: number; frente?: string; nivel: "Dominante"|"Alta presencia"|"Presencia"; }
const GRUPOS_ARMADOS: GrupoArmado[] = [
  /* ── ELN ── */
  { name:"ELN — Arauca",              grupo:"ELN", subregion:"Arauca",               dept:"Arauca",            lat: 6.540, lng:-71.000, frente:"Domingo Laín Sáenz",         nivel:"Dominante" },
  { name:"ELN — Catatumbo",           grupo:"ELN", subregion:"Catatumbo",            dept:"Norte de Santander",lat: 8.330, lng:-73.000, frente:"Camilo Torres Restrepo",     nivel:"Dominante" },
  { name:"ELN — Sur de Bolívar",      grupo:"ELN", subregion:"Sur de Bolívar",       dept:"Bolívar",           lat: 8.000, lng:-74.200, frente:"Héroes y Mártires de Santa Rosa",nivel:"Alta presencia" },
  { name:"ELN — Chocó",               grupo:"ELN", subregion:"Chocó",                dept:"Chocó",             lat: 7.000, lng:-76.900, frente:"Ernesto Che Guevara",        nivel:"Dominante" },
  { name:"ELN — Cauca",               grupo:"ELN", subregion:"Cauca",                dept:"Cauca",             lat: 2.700, lng:-76.900, frente:"Manuel Vásquez Castaño",     nivel:"Alta presencia" },
  { name:"ELN — Bajo Cauca Ant.",     grupo:"ELN", subregion:"Bajo Cauca",           dept:"Antioquia",         lat: 7.500, lng:-75.300, frente:"Resistencia Cimarrona",      nivel:"Alta presencia" },
  { name:"ELN — Norte de Santander",  grupo:"ELN", subregion:"Ocaña/Sardinata",      dept:"Norte de Santander",lat: 8.250, lng:-73.200, frente:"Camilo Torres",             nivel:"Alta presencia" },
  { name:"ELN — Nariño",              grupo:"ELN", subregion:"Pacífico Nariñense",   dept:"Nariño",            lat: 1.900, lng:-78.400, frente:"Comuneros del Sur",          nivel:"Alta presencia" },
  /* ── FARC-EMC (Estado Mayor Central) ── */
  { name:"FARC-EMC — Putumayo",       grupo:"FARC-EMC", subregion:"Putumayo",        dept:"Putumayo",          lat: 0.650, lng:-76.800, frente:"Frente 48",                  nivel:"Dominante" },
  { name:"FARC-EMC — Caquetá",        grupo:"FARC-EMC", subregion:"Caguán",          dept:"Caquetá",           lat: 1.500, lng:-74.800, frente:"Frente 49",                  nivel:"Dominante" },
  { name:"FARC-EMC — Meta/Guaviare",  grupo:"FARC-EMC", subregion:"Macarena-Guaviare",dept:"Meta",            lat: 2.500, lng:-73.500, frente:"Bloque Oriental",            nivel:"Dominante" },
  { name:"FARC-EMC — Nariño",         grupo:"FARC-EMC", subregion:"Pacífico Nariñense",dept:"Nariño",         lat: 1.800, lng:-78.500, frente:"Frente 2 Carolina Ramírez",  nivel:"Dominante" },
  { name:"FARC-EMC — Cauca",          grupo:"FARC-EMC", subregion:"Pacífico Caucano", dept:"Cauca",           lat: 2.800, lng:-77.200, frente:"Frente 30 / Frente 6",       nivel:"Alta presencia" },
  { name:"FARC-EMC — Chocó",          grupo:"FARC-EMC", subregion:"Chocó norte",      dept:"Chocó",           lat: 7.400, lng:-76.700, frente:"Frente 5",                   nivel:"Alta presencia" },
  { name:"FARC-EMC — Vichada",        grupo:"FARC-EMC", subregion:"Llanos Orientales",dept:"Vichada",         lat: 4.400, lng:-70.100, frente:"Jorge Briceño",              nivel:"Alta presencia" },
  /* ── Clan del Golfo (AGC/Gaitanistas) ── */
  { name:"Clan del Golfo — Urabá",    grupo:"Clan del Golfo", subregion:"Urabá",       dept:"Antioquia",       lat: 7.600, lng:-76.800, frente:"Bloque Urabá",               nivel:"Dominante" },
  { name:"Clan del Golfo — Córdoba",  grupo:"Clan del Golfo", subregion:"Montería/Montelíbano",dept:"Córdoba",lat: 8.500, lng:-75.500, frente:"Bloque Córdoba",             nivel:"Dominante" },
  { name:"Clan del Golfo — Bajo Cauca",grupo:"Clan del Golfo",subregion:"Bajo Cauca",  dept:"Antioquia",       lat: 7.900, lng:-74.900, frente:"Bloque Bajo Cauca",          nivel:"Alta presencia" },
  { name:"Clan del Golfo — Chocó",    grupo:"Clan del Golfo", subregion:"Chocó",       dept:"Chocó",           lat: 6.500, lng:-77.200, frente:"Bloque Pacífico",            nivel:"Alta presencia" },
  { name:"Clan del Golfo — Nariño",   grupo:"Clan del Golfo", subregion:"Pacífico Nariñense",dept:"Nariño",    lat: 2.500, lng:-78.200, frente:"Bloque Pacífico Sur",        nivel:"Presencia" },
  { name:"Clan del Golfo — Norte Santander",grupo:"Clan del Golfo",subregion:"Catatumbo",dept:"Norte de Santander",lat: 8.500, lng:-73.200, frente:"Bloque Catatumbo",     nivel:"Presencia" },
  { name:"Clan del Golfo — Sur de Bolívar",grupo:"Clan del Golfo",subregion:"Sur de Bolívar",dept:"Bolívar",  lat: 8.300, lng:-74.100, frente:"Bloque Sur de Bolívar",     nivel:"Presencia" },
  /* ── Segunda Marquetalia ── */
  { name:"2a Marquetalia — Nariño",   grupo:"2a Marquetalia", subregion:"Pacífico Nariñense",dept:"Nariño",   lat: 1.200, lng:-77.800, frente:"Frente Comuneros del Sur",   nivel:"Alta presencia" },
  { name:"2a Marquetalia — Cauca",    grupo:"2a Marquetalia", subregion:"Cauca interior",   dept:"Cauca",     lat: 2.100, lng:-76.500, frente:"Frente Sur",                 nivel:"Alta presencia" },
  { name:"2a Marquetalia — Venezuela (frontera)",grupo:"2a Marquetalia",subregion:"Norte de Santander",dept:"Norte de Santander",lat: 7.880, lng:-72.500, frente:"Frente Rodrigo Cadete",nivel:"Presencia" },
];

/* ── CORREDORES VIALES ESTRATÉGICOS ── */
interface Corredor { key: string; name: string; ruta: string; desc: string; waypoints: [number,number][]; }
const CORREDORES: Corredor[] = [
  { key:"bog-med",  name:"Bogotá → Medellín",          ruta:"Ruta 45A",  desc:"Autopista del Café — corredor más transitado del país",
    waypoints:[[4.711,-74.072],[4.820,-74.350],[5.055,-74.605],[5.207,-74.741],[5.455,-74.668],[5.510,-74.982],[5.730,-75.598],[5.912,-75.617],[6.253,-75.563]] },
  { key:"bog-bar",  name:"Bogotá → Barranquilla",       ruta:"Ruta 45",   desc:"Troncal del Magdalena — corredor norte hacia Costa Atlántica",
    waypoints:[[4.711,-74.072],[5.207,-74.741],[5.455,-74.668],[6.490,-74.404],[7.594,-74.813],[7.990,-75.198],[8.757,-75.884],[9.301,-75.393],[10.393,-75.499],[10.963,-74.799]] },
  { key:"bog-cuc",  name:"Bogotá → Cúcuta",             ruta:"Ruta 55",   desc:"Troncal del Oriente — eje Bogotá-Bucaramanga-Venezuela",
    waypoints:[[4.711,-74.072],[5.534,-73.365],[5.830,-73.020],[5.727,-72.928],[6.700,-72.733],[7.130,-73.128],[7.370,-72.650],[7.890,-72.500]] },
  { key:"bog-vll",  name:"Bogotá → Villavicencio",      ruta:"Ruta 40",   desc:"Corredor hacia Llanos Orientales — petróleo y agroindustria",
    waypoints:[[4.711,-74.072],[4.140,-73.628],[3.700,-73.700],[3.545,-73.718],[4.322,-72.074]] },
  { key:"med-cal",  name:"Medellín → Cali",             ruta:"Ruta 25N",  desc:"Corredor interurbano Eje Cafetero — alta densidad de carga",
    waypoints:[[6.253,-75.563],[5.912,-75.617],[5.730,-75.598],[4.813,-75.694],[4.534,-75.670],[4.080,-76.200],[3.901,-76.299],[3.432,-76.522]] },
  { key:"cal-bun",  name:"Cali → Buenaventura",         ruta:"Ruta 25B",  desc:"Puerto Pacífico — corredor de exportación más crítico",
    waypoints:[[3.432,-76.522],[3.600,-76.700],[3.745,-76.873],[3.882,-77.021]] },
  { key:"cal-ecu",  name:"Cali → Ipiales (Ecuador)",    ruta:"Ruta 25S",  desc:"Corredor frontera sur — Cali-Pasto-Ipiales",
    waypoints:[[3.432,-76.522],[2.444,-76.608],[1.613,-77.060],[1.213,-77.281],[0.830,-77.648]] },
  { key:"med-cta",  name:"Medellín → Cartagena",        ruta:"Ruta 62",   desc:"Corredor Medellín-Costa vía Caucasia",
    waypoints:[[6.253,-75.563],[6.356,-75.509],[6.490,-74.404],[7.488,-74.869],[7.990,-75.198],[8.757,-75.884],[10.393,-75.499]] },
  { key:"cta-bar",  name:"Cartagena → Santa Marta",     ruta:"Ruta 90",   desc:"Transversal Caribe — corredor costero",
    waypoints:[[10.393,-75.499],[10.963,-74.799],[11.243,-74.192],[11.544,-72.908]] },
  { key:"bog-ibg",  name:"Bogotá → Ibagué → Cali",     ruta:"Ruta 40W",  desc:"Ruta del Sol alternativa — Bogotá sur hacia Valle",
    waypoints:[[4.711,-74.072],[4.430,-75.247],[3.432,-76.522]] },
];

/* ── UTILIDADES GEOESPACIALES ── */
function haversineDist(lat1:number,lng1:number,lat2:number,lng2:number):number {
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function minDistToCorridor(lat:number,lng:number,wpts:[number,number][]):number {
  return Math.min(...wpts.map(([rlat,rlng])=>haversineDist(lat,lng,rlat,rlng)));
}

/* ── AEROPUERTOS CIVILES Y DE CARGA ── */
interface Aeropuerto { name: string; codigo: string; ciudad: string; dept: string; lat: number; lng: number; tipo: string; pista?: string; carga: boolean; }
const AEROPUERTOS: Aeropuerto[] = [
  { name:"El Dorado",                   codigo:"BOG", ciudad:"Bogotá",          dept:"Bogotá D.C.",       lat: 4.702, lng:-74.147, tipo:"Internacional",  pista:"3800 m",  carga:true  },
  { name:"José María Córdova",          codigo:"MDE", ciudad:"Rionegro",        dept:"Antioquia",         lat: 6.164, lng:-75.423, tipo:"Internacional",  pista:"3558 m",  carga:true  },
  { name:"Alfonso Bonilla Aragón",      codigo:"CLO", ciudad:"Cali",            dept:"Valle del Cauca",   lat: 3.543, lng:-76.382, tipo:"Internacional",  pista:"3000 m",  carga:true  },
  { name:"Ernesto Cortissoz",           codigo:"BAQ", ciudad:"Barranquilla",    dept:"Atlántico",         lat:10.890, lng:-74.781, tipo:"Internacional",  pista:"2997 m",  carga:true  },
  { name:"Rafael Núñez",                codigo:"CTG", ciudad:"Cartagena",       dept:"Bolívar",           lat:10.443, lng:-75.513, tipo:"Internacional",  pista:"2600 m",  carga:true  },
  { name:"Palonegro",                   codigo:"BGA", ciudad:"Bucaramanga",     dept:"Santander",         lat: 7.132, lng:-73.185, tipo:"Nacional",       pista:"2200 m",  carga:false },
  { name:"Camilo Daza",                 codigo:"CUC", ciudad:"Cúcuta",          dept:"Norte de Santander",lat: 7.928, lng:-72.512, tipo:"Internacional",  pista:"2600 m",  carga:true  },
  { name:"Simón Bolívar",               codigo:"SMR", ciudad:"Santa Marta",     dept:"Magdalena",         lat:11.120, lng:-74.231, tipo:"Nacional",       pista:"1800 m",  carga:false },
  { name:"Los Garzones",                codigo:"MTR", ciudad:"Montería",        dept:"Córdoba",           lat: 8.823, lng:-75.826, tipo:"Nacional",       pista:"1800 m",  carga:false },
  { name:"El Caraño",                   codigo:"UIB", ciudad:"Quibdó",          dept:"Chocó",             lat: 5.696, lng:-76.641, tipo:"Nacional",       pista:"1200 m",  carga:false },
  { name:"Antonio Nariño",              codigo:"PSO", ciudad:"Pasto",           dept:"Nariño",            lat: 1.396, lng:-77.288, tipo:"Nacional",       pista:"1800 m",  carga:false },
  { name:"Perales",                     codigo:"IBE", ciudad:"Ibagué",          dept:"Tolima",            lat: 4.427, lng:-75.133, tipo:"Nacional",       pista:"1400 m",  carga:false },
  { name:"Benito Salas",                codigo:"NVA", ciudad:"Neiva",           dept:"Huila",             lat: 2.951, lng:-75.294, tipo:"Nacional",       pista:"1800 m",  carga:false },
  { name:"Matecaña",                    codigo:"PEI", ciudad:"Pereira",         dept:"Risaralda",         lat: 4.813, lng:-75.740, tipo:"Nacional",       pista:"1700 m",  carga:false },
  { name:"La Nubia",                    codigo:"MZL", ciudad:"Manizales",       dept:"Caldas",            lat: 5.029, lng:-75.467, tipo:"Nacional",       pista:"1530 m",  carga:false },
  { name:"El Edén",                     codigo:"AXM", ciudad:"Armenia",         dept:"Quindío",           lat: 4.453, lng:-75.765, tipo:"Nacional",       pista:"1805 m",  carga:false },
  { name:"Vásquez Cobo",                codigo:"LET", ciudad:"Leticia",         dept:"Amazonas",          lat:-4.193, lng:-69.943, tipo:"Internacional",  pista:"1900 m",  carga:false },
  { name:"Gustavo Rojas Pinilla",       codigo:"ADZ", ciudad:"San Andrés",      dept:"San Andrés",        lat:12.584, lng:-81.711, tipo:"Internacional",  pista:"2100 m",  carga:false },
  { name:"Yariguíes",                   codigo:"EJA", ciudad:"Barrancabermeja", dept:"Santander",         lat: 7.024, lng:-73.808, tipo:"Nacional",       pista:"1800 m",  carga:false },
  { name:"Alfonso López Pumarejo",      codigo:"VUP", ciudad:"Valledupar",      dept:"Cesar",             lat:10.435, lng:-73.249, tipo:"Nacional",       pista:"1940 m",  carga:false },
  { name:"Guillermo León Valencia",     codigo:"PPN", ciudad:"Popayán",         dept:"Cauca",             lat: 2.454, lng:-76.610, tipo:"Nacional",       pista:"1500 m",  carga:false },
  { name:"Almirante Padilla",           codigo:"RCH", ciudad:"Riohacha",        dept:"La Guajira",        lat:11.527, lng:-72.926, tipo:"Nacional",       pista:"1600 m",  carga:false },
];

/* ── ZONAS FRANCAS PERMANENTES ── */
interface ZonaFranca { name: string; ciudad: string; dept: string; lat: number; lng: number; area: string; tel?: string; }
const ZONAS_FRANCAS: ZonaFranca[] = [
  { name:"Zona Franca de Bogotá",         ciudad:"Bogotá",       dept:"Bogotá D.C.",     lat: 4.690, lng:-74.155, area:"322 ha",  tel:"(601) 423-5100" },
  { name:"Zona Franca de Occidente",      ciudad:"Cali",         dept:"Valle del Cauca", lat: 3.489, lng:-76.455, area:"210 ha",  tel:"(602) 680-2020" },
  { name:"Zona Franca de Barranquilla",   ciudad:"Barranquilla", dept:"Atlántico",       lat:10.923, lng:-74.795, area:"97 ha",   tel:"(605) 340-1600" },
  { name:"Zona Franca de Cartagena",      ciudad:"Cartagena",    dept:"Bolívar",         lat:10.390, lng:-75.490, area:"115 ha",  tel:"(605) 693-9200" },
  { name:"Zona Franca Rionegro (AEROCAFE)",ciudad:"Rionegro",   dept:"Antioquia",       lat: 6.166, lng:-75.413, area:"88 ha",   tel:"(604) 569-0020" },
  { name:"Zona Franca de Cúcuta",         ciudad:"Cúcuta",       dept:"Norte de Santander",lat: 7.905, lng:-72.496, area:"76 ha", tel:"(607) 577-5020" },
  { name:"Zona Franca La Cayena",         ciudad:"Medellín",     dept:"Antioquia",       lat: 6.266, lng:-75.592, area:"46 ha",   tel:"(604) 444-5000" },
  { name:"Zona Franca de Palmaseca",      ciudad:"Palmira",      dept:"Valle del Cauca", lat: 3.548, lng:-76.390, area:"75 ha",   tel:"(602) 665-0044" },
  { name:"Zona Franca Urabá",             ciudad:"Apartadó",     dept:"Antioquia",       lat: 7.879, lng:-76.627, area:"60 ha",   tel:"(604) 828-0220" },
  { name:"Zona Franca de Santander",      ciudad:"Bucaramanga",  dept:"Santander",       lat: 7.085, lng:-73.116, area:"55 ha",   tel:"(607) 698-0100" },
  { name:"Zona Franca de Pereira",        ciudad:"Pereira",      dept:"Risaralda",       lat: 4.834, lng:-75.699, area:"42 ha",   tel:"(606) 315-1100" },
];

/* ── PUERTOS FLUVIALES ── */
interface PuertoFluvial { name: string; rio: string; municipio: string; dept: string; lat: number; lng: number; tipo: string; tel?: string; }
const PUERTOS_FLUVIALES: PuertoFluvial[] = [
  { name:"Puerto Salgar",          rio:"Río Magdalena",  municipio:"Puerto Salgar",     dept:"Cundinamarca",      lat: 5.467, lng:-74.653, tipo:"Carga / Paso",      tel:"(601) 858-1100" },
  { name:"Puerto La Dorada",       rio:"Río Magdalena",  municipio:"La Dorada",         dept:"Caldas",            lat: 5.451, lng:-74.668, tipo:"Carga / Graneles",   tel:"(606) 853-1500" },
  { name:"Puerto Berrío",          rio:"Río Magdalena",  municipio:"Puerto Berrío",     dept:"Antioquia",         lat: 6.490, lng:-74.404, tipo:"Carga / Petróleo",   tel:"(604) 851-2020" },
  { name:"Puerto de Barrancabermeja",rio:"Río Magdalena",municipio:"Barrancabermeja",   dept:"Santander",         lat: 7.065, lng:-73.856, tipo:"Petróleo / Industrial",tel:"(607) 622-5000" },
  { name:"Puerto Colombia (Bca.)", rio:"Río Magdalena",  municipio:"Barrancabermeja",   dept:"Santander",         lat: 7.058, lng:-73.861, tipo:"Carbón / Carga",     tel:"(607) 622-6000" },
  { name:"Puerto Boyacá",          rio:"Río Magdalena",  municipio:"Puerto Boyacá",     dept:"Boyacá",            lat: 5.976, lng:-74.591, tipo:"Carga / Ganado",     tel:"(608) 648-1500" },
  { name:"Muelle Contecar",        rio:"Bahía Cartagena",municipio:"Cartagena",         dept:"Bolívar",           lat:10.365, lng:-75.503, tipo:"Contenedores",       tel:"(605) 693-9000" },
  { name:"SPR Cartagena",          rio:"Bahía Cartagena",municipio:"Cartagena",         dept:"Bolívar",           lat:10.393, lng:-75.489, tipo:"Carga General",      tel:"(605) 693-7000" },
  { name:"Puerto de Barranquilla", rio:"Río Magdalena",  municipio:"Barranquilla",      dept:"Atlántico",         lat:10.962, lng:-74.804, tipo:"Multimodal / Gran Puerto",tel:"(605) 379-0044" },
  { name:"Puerto de Buenaventura", rio:"Bahía Buenaventura",municipio:"Buenaventura",   dept:"Valle del Cauca",   lat: 3.885, lng:-77.029, tipo:"Contenedores / Carga",tel:"(602) 240-0344" },
  { name:"Muelle Magangué",        rio:"Río Magdalena",  municipio:"Magangué",          dept:"Bolívar",           lat: 9.240, lng:-74.752, tipo:"Pasajeros / Carga",  tel:"(605) 689-2200" },
  { name:"Puerto López",           rio:"Río Meta",       municipio:"Puerto López",      dept:"Meta",              lat: 4.085, lng:-72.956, tipo:"Carga / Llanera",    tel:"(608) 673-2200" },
  { name:"Puerto Carreño",         rio:"Río Orinoco",    municipio:"Puerto Carreño",    dept:"Vichada",           lat: 6.187, lng:-67.486, tipo:"Frontera Venezuela",  tel:"(608) 565-0500" },
  { name:"Puerto Asís",            rio:"Río Putumayo",   municipio:"Puerto Asís",       dept:"Putumayo",          lat: 0.507, lng:-76.502, tipo:"Carga / Fluvial",    tel:"(608) 433-0200" },
  { name:"Leticia (Amazonas)",     rio:"Río Amazonas",   municipio:"Leticia",           dept:"Amazonas",          lat:-4.213, lng:-69.942, tipo:"Internacional — Brasil/Perú",tel:"(608) 592-7100" },
  { name:"Mompox",                 rio:"Río Magdalena",  municipio:"Mompox",            dept:"Bolívar",           lat: 9.239, lng:-74.433, tipo:"Pasajeros / Turismo", tel:"(605) 685-5100" },
];

/* ── PUNTOS DE CONTROL DIAN ── */
interface PuntoDIAN { name: string; tipo: string; municipio: string; dept: string; lat: number; lng: number; tel?: string; frontera?: boolean; }
const PUNTOS_DIAN: PuntoDIAN[] = [
  { name:"DIAN Bogotá — Aeropuerto El Dorado", tipo:"Aduana Aérea",       municipio:"Bogotá",       dept:"Bogotá D.C.",       lat: 4.698, lng:-74.140, tel:"(601) 546-3400", frontera:false },
  { name:"DIAN Bogotá — Dirección Seccional",  tipo:"Fiscalización",      municipio:"Bogotá",       dept:"Bogotá D.C.",       lat: 4.650, lng:-74.088, tel:"(601) 307-1400", frontera:false },
  { name:"DIAN Medellín — Seccional",          tipo:"Fiscalización",      municipio:"Medellín",     dept:"Antioquia",         lat: 6.236, lng:-75.576, tel:"(604) 511-4600", frontera:false },
  { name:"DIAN Cali — Seccional",              tipo:"Fiscalización",      municipio:"Cali",         dept:"Valle del Cauca",   lat: 3.439, lng:-76.523, tel:"(602) 886-0700", frontera:false },
  { name:"DIAN Barranquilla — Puerto",         tipo:"Aduana Marítima",    municipio:"Barranquilla", dept:"Atlántico",         lat:10.978, lng:-74.810, tel:"(605) 379-0070", frontera:false },
  { name:"DIAN Cartagena — Puerto",            tipo:"Aduana Marítima",    municipio:"Cartagena",    dept:"Bolívar",           lat:10.394, lng:-75.486, tel:"(605) 693-9300", frontera:false },
  { name:"DIAN Buenaventura — Puerto",         tipo:"Aduana Marítima",    municipio:"Buenaventura", dept:"Valle del Cauca",   lat: 3.888, lng:-77.025, tel:"(602) 240-4040", frontera:false },
  { name:"DIAN Ipiales — Rumichaca",           tipo:"Aduana Terrestre",   municipio:"Ipiales",      dept:"Nariño",            lat: 0.830, lng:-77.647, tel:"(602) 773-0700", frontera:true  },
  { name:"DIAN Cúcuta — Villa del Rosario",    tipo:"Aduana Terrestre",   municipio:"Villa del Rosario",dept:"Norte de Santander",lat: 7.845, lng:-72.471, tel:"(607) 583-1200", frontera:true  },
  { name:"DIAN Arauca — Frontera Venezuela",   tipo:"Aduana Terrestre",   municipio:"Arauca",       dept:"Arauca",            lat: 7.090, lng:-70.758, tel:"(607) 885-1500", frontera:true  },
  { name:"DIAN Leticia — Frontera Brasil/Perú",tipo:"Aduana Fluvial",     municipio:"Leticia",      dept:"Amazonas",          lat:-4.207, lng:-69.940, tel:"(608) 592-7400", frontera:true  },
  { name:"DIAN Bucaramanga — Seccional",       tipo:"Fiscalización",      municipio:"Bucaramanga",  dept:"Santander",         lat: 7.113, lng:-73.120, tel:"(607) 633-7500", frontera:false },
  { name:"DIAN Santa Marta — Puerto",          tipo:"Aduana Marítima",    municipio:"Santa Marta",  dept:"Magdalena",         lat:11.247, lng:-74.198, tel:"(605) 431-2200", frontera:false },
  { name:"DIAN Valledupar — Seccional",        tipo:"Fiscalización",      municipio:"Valledupar",   dept:"Cesar",             lat:10.477, lng:-73.253, tel:"(605) 574-1800", frontera:false },
];

/* ── CRUZ ROJA Y DEFENSA CIVIL ── */
interface EmergenciaHumanitaria { name: string; org: string; ciudad: string; dept: string; lat: number; lng: number; tel?: string; }
const EMERGENCIAS_HUMANITARIAS: EmergenciaHumanitaria[] = [
  { name:"Cruz Roja Colombiana — Bogotá",        org:"Cruz Roja",     ciudad:"Bogotá",       dept:"Bogotá D.C.",     lat: 4.627, lng:-74.065, tel:"(601) 437-6339" },
  { name:"Cruz Roja Colombiana — Medellín",      org:"Cruz Roja",     ciudad:"Medellín",     dept:"Antioquia",       lat: 6.244, lng:-75.570, tel:"(604) 285-1010" },
  { name:"Cruz Roja Colombiana — Cali",          org:"Cruz Roja",     ciudad:"Cali",         dept:"Valle del Cauca", lat: 3.440, lng:-76.533, tel:"(602) 880-5454" },
  { name:"Cruz Roja Colombiana — Barranquilla",  org:"Cruz Roja",     ciudad:"Barranquilla", dept:"Atlántico",       lat:10.989, lng:-74.806, tel:"(605) 379-2020" },
  { name:"Cruz Roja Colombiana — Cartagena",     org:"Cruz Roja",     ciudad:"Cartagena",    dept:"Bolívar",         lat:10.400, lng:-75.504, tel:"(605) 664-7070" },
  { name:"Cruz Roja Colombiana — Bucaramanga",   org:"Cruz Roja",     ciudad:"Bucaramanga",  dept:"Santander",       lat: 7.114, lng:-73.114, tel:"(607) 634-0303" },
  { name:"Cruz Roja Colombiana — Cúcuta",        org:"Cruz Roja",     ciudad:"Cúcuta",       dept:"Norte de Santander",lat: 7.891, lng:-72.508, tel:"(607) 571-2233" },
  { name:"Cruz Roja Colombiana — Ibagué",        org:"Cruz Roja",     ciudad:"Ibagué",       dept:"Tolima",          lat: 4.432, lng:-75.243, tel:"(608) 261-2020" },
  { name:"Cruz Roja Colombiana — Pereira",       org:"Cruz Roja",     ciudad:"Pereira",      dept:"Risaralda",       lat: 4.812, lng:-75.696, tel:"(606) 325-0505" },
  { name:"Cruz Roja Colombiana — Manizales",     org:"Cruz Roja",     ciudad:"Manizales",    dept:"Caldas",          lat: 5.064, lng:-75.511, tel:"(606) 884-0202" },
  { name:"Cruz Roja Colombiana — Neiva",         org:"Cruz Roja",     ciudad:"Neiva",        dept:"Huila",           lat: 2.932, lng:-75.294, tel:"(608) 871-1530" },
  { name:"Cruz Roja Colombiana — Pasto",         org:"Cruz Roja",     ciudad:"Pasto",        dept:"Nariño",          lat: 1.214, lng:-77.279, tel:"(602) 723-5150" },
  { name:"Cruz Roja Colombiana — Villavicencio", org:"Cruz Roja",     ciudad:"Villavicencio",dept:"Meta",            lat: 4.149, lng:-73.633, tel:"(608) 671-4040" },
  { name:"Cruz Roja Colombiana — Santa Marta",   org:"Cruz Roja",     ciudad:"Santa Marta",  dept:"Magdalena",       lat:11.240, lng:-74.198, tel:"(605) 422-3030" },
  { name:"Defensa Civil — Bogotá",               org:"Defensa Civil", ciudad:"Bogotá",       dept:"Bogotá D.C.",     lat: 4.648, lng:-74.073, tel:"(601) 342-1400" },
  { name:"Defensa Civil — Medellín",             org:"Defensa Civil", ciudad:"Medellín",     dept:"Antioquia",       lat: 6.248, lng:-75.573, tel:"(604) 251-1616" },
  { name:"Defensa Civil — Cali",                 org:"Defensa Civil", ciudad:"Cali",         dept:"Valle del Cauca", lat: 3.436, lng:-76.530, tel:"(602) 889-3030" },
  { name:"Defensa Civil — Barranquilla",         org:"Defensa Civil", ciudad:"Barranquilla", dept:"Atlántico",       lat:10.995, lng:-74.813, tel:"(605) 378-1515" },
  { name:"Defensa Civil — Bucaramanga",          org:"Defensa Civil", ciudad:"Bucaramanga",  dept:"Santander",       lat: 7.110, lng:-73.117, tel:"(607) 634-6060" },
  { name:"Defensa Civil — Villavicencio",        org:"Defensa Civil", ciudad:"Villavicencio",dept:"Meta",            lat: 4.145, lng:-73.638, tel:"(608) 671-2525" },
];

/* ── TALLERES DE MECÁNICA PESADA ── */
interface TallerPesado { name: string; ruta: string; municipio: string; dept: string; lat: number; lng: number; servicios: string; tel?: string; }
const TALLERES_PESADOS: TallerPesado[] = [
  { name:"Servitruck Norte",          ruta:"Ruta 45A — Km 14",   municipio:"Bogotá (salida N)",dept:"Bogotá D.C.",      lat: 4.780, lng:-74.022, servicios:"Diésel · Frenos · Grúa · Latonería",  tel:"(601) 668-5050" },
  { name:"Diesel Center Villeta",     ruta:"Ruta 45A — Km 72",   municipio:"Villeta",          dept:"Cundinamarca",     lat: 5.008, lng:-74.470, servicios:"Motor · Frenos · Grúa 24h",           tel:"(601) 857-0202" },
  { name:"Taller Camiones Puerto Salgar",ruta:"Ruta 45A — Km 131",municipio:"Puerto Salgar",   dept:"Cundinamarca",     lat: 5.469, lng:-74.652, servicios:"Motor · Caja · Diferencial · Grúa",   tel:"(601) 858-2020" },
  { name:"Mecánica Pesada La Dorada", ruta:"Ruta 45 — Km 187",   municipio:"La Dorada",        dept:"Caldas",           lat: 5.455, lng:-74.671, servicios:"Motor · Frenos · Grúa · Latonería",   tel:"(606) 853-3030" },
  { name:"Taller Autopista P. Berrío",ruta:"Ruta 45 — Km 246",   municipio:"Puerto Berrío",    dept:"Antioquia",        lat: 6.490, lng:-74.403, servicios:"Diésel · Frenos · Turbo · Grúa 24h", tel:"(604) 851-4040" },
  { name:"Cisneros Diesel & Grúa",   ruta:"Ruta 45 — Km 290",   municipio:"Cisneros",         dept:"Antioquia",        lat: 6.537, lng:-74.984, servicios:"Motor · Turbo · Diferencial · Grúa",  tel:"(604) 831-0101" },
  { name:"Taller Caucasia Pesados",   ruta:"Ruta 25 — Caucasia",  municipio:"Caucasia",         dept:"Antioquia",        lat: 7.992, lng:-75.197, servicios:"Motor · Frenos · Grúa · Latonería",   tel:"(604) 838-4040" },
  { name:"Mecánica Buga Industrial",  ruta:"Ruta 25 — Buga",      municipio:"Guadalajara de Buga",dept:"Valle del Cauca",lat: 3.904, lng:-76.302, servicios:"Motor · Caja · Frenos · Soldadura",   tel:"(602) 228-5050" },
  { name:"Taller Cartago Pesados",    ruta:"Ruta 25 — Cartago",   municipio:"Cartago",          dept:"Valle del Cauca", lat: 4.750, lng:-75.914, servicios:"Diésel · Turbo · Frenos · Grúa",      tel:"(602) 212-6060" },
  { name:"La Pintada Diesel Center",  ruta:"Ruta 40 — La Pintada",municipio:"La Pintada",       dept:"Antioquia",        lat: 5.742, lng:-75.595, servicios:"Motor · Frenos · Grúa · Refrigeración", tel:"(604) 847-1100" },
  { name:"Taller Girardot Autopista", ruta:"Ruta 45 — Girardot",  municipio:"Girardot",         dept:"Cundinamarca",     lat: 4.304, lng:-74.807, servicios:"Motor · Caja · Grúa 24h · Soldadura", tel:"(601) 833-4040" },
  { name:"Espinal Mecánica Pesada",   ruta:"Ruta 45 — Espinal",   municipio:"Espinal",          dept:"Tolima",           lat: 4.156, lng:-74.888, servicios:"Motor · Frenos · Diferencial · Grúa", tel:"(608) 248-4040" },
  { name:"Taller Tunja Pesados",      ruta:"Ruta 55 — Tunja",     municipio:"Tunja",            dept:"Boyacá",           lat: 5.542, lng:-73.361, servicios:"Motor · Frenos · Eje · Grúa 24h",    tel:"(608) 740-5050" },
  { name:"Duitama Diesel & Servicio", ruta:"Ruta 55 — Duitama",   municipio:"Duitama",          dept:"Boyacá",           lat: 5.830, lng:-73.032, servicios:"Motor · Turbo · Frenos · Grúa",      tel:"(608) 760-4040" },
  { name:"Taller BGA Norte Pesados",  ruta:"Ruta 55 — Bucaramanga",municipio:"Bucaramanga",     dept:"Santander",        lat: 7.167, lng:-73.112, servicios:"Diésel · Turbo · Grúa · Latonería",  tel:"(607) 634-8080" },
  { name:"Barranca Taller Industrial",ruta:"Ruta 45 — Barrancabermeja",municipio:"Barrancabermeja",dept:"Santander",    lat: 7.068, lng:-73.858, servicios:"Motor · Caja · Frenos · Grúa 24h",   tel:"(607) 622-9090" },
  { name:"Taller Cúcuta Pesados",     ruta:"Ruta 55 — Cúcuta",    municipio:"Cúcuta",           dept:"Norte de Santander",lat: 7.894, lng:-72.510, servicios:"Motor · Frenos · Grúa · Frontera VE", tel:"(607) 583-7070" },
  { name:"Aguachica Diesel & Grúa",   ruta:"Ruta 55 — Aguachica",  municipio:"Aguachica",        dept:"Cesar",            lat: 8.312, lng:-73.614, servicios:"Motor · Turbo · Frenos · Grúa 24h", tel:"(607) 565-5050" },
  { name:"Taller Sincelejo Autopista",ruta:"Ruta 25 — Sincelejo",  municipio:"Sincelejo",        dept:"Sucre",            lat: 9.305, lng:-75.399, servicios:"Motor · Frenos · Diferencial · Grúa", tel:"(605) 282-6060" },
  { name:"Taller Montería Pesados",   ruta:"Ruta 25 — Montería",   municipio:"Montería",         dept:"Córdoba",          lat: 8.760, lng:-75.887, servicios:"Diésel · Frenos · Grúa · Soldadura",  tel:"(604) 782-5050" },
  { name:"Popayán Diesel Center",     ruta:"Ruta 25 — Popayán",    municipio:"Popayán",          dept:"Cauca",            lat: 2.445, lng:-76.609, servicios:"Motor · Turbo · Frenos · Grúa",      tel:"(602) 824-7070" },
  { name:"Ipiales Taller Pesados",    ruta:"Ruta 25 — Ipiales",    municipio:"Ipiales",          dept:"Nariño",           lat: 0.831, lng:-77.648, servicios:"Motor · Frenos · Grúa — frontera EC", tel:"(602) 773-5050" },
  { name:"Taller Villavicencio Diesel",ruta:"Ruta 40 — Villavicencio",municipio:"Villavicencio", dept:"Meta",             lat: 4.152, lng:-73.636, servicios:"Motor · Caja · Grúa · Latonería",    tel:"(608) 671-8080" },
  { name:"Taller Palmira Industrial", ruta:"Ruta 25 — Palmira",    municipio:"Palmira",          dept:"Valle del Cauca", lat: 3.523, lng:-76.304, servicios:"Motor · Turbo · Frenos · Grúa 24h",  tel:"(602) 274-7070" },
];

/* ── TERMINALES DE CARGA Y LOGÍSTICA ── */
interface TerminalCarga { name: string; operador: string; ciudad: string; dept: string; lat: number; lng: number; servicios: string; tel?: string; }
const TERMINALES_CARGA: TerminalCarga[] = [
  { name:"Terminal de Carga El Dorado",     operador:"AEROCIVIL",  ciudad:"Bogotá",       dept:"Bogotá D.C.",     lat: 4.699, lng:-74.142, servicios:"Aéreo · Frío · Valorables · 24h",       tel:"(601) 266-2000" },
  { name:"Centro Logístico TCC Bogotá",     operador:"TCC",        ciudad:"Bogotá",       dept:"Bogotá D.C.",     lat: 4.728, lng:-74.097, servicios:"Carga seca · Express · Distribución",    tel:"(601) 743-8777" },
  { name:"Bodega Suppla Bogotá",            operador:"Suppla",     ciudad:"Bogotá",       dept:"Bogotá D.C.",     lat: 4.717, lng:-74.082, servicios:"Almacenaje · Frío · Retail · 3PL",       tel:"(601) 413-5600" },
  { name:"Terminal DHL Bogotá",             operador:"DHL",        ciudad:"Bogotá",       dept:"Bogotá D.C.",     lat: 4.703, lng:-74.147, servicios:"Express · Aduanas · Internacional",       tel:"(601) 800-0345" },
  { name:"Bodega DEPRISA / Avianca",        operador:"Avianca",    ciudad:"Bogotá",       dept:"Bogotá D.C.",     lat: 4.698, lng:-74.146, servicios:"Aéreo · Nacional e Internacional · 24h", tel:"(601) 587-7575" },
  { name:"Centro de Carga Medellín",        operador:"TCC",        ciudad:"Medellín",     dept:"Antioquia",       lat: 6.173, lng:-75.432, servicios:"Distribución · Express · Almacenaje",    tel:"(604) 511-7700" },
  { name:"Bodega Suppla Medellín",          operador:"Suppla",     ciudad:"Medellín",     dept:"Antioquia",       lat: 6.209, lng:-75.548, servicios:"Almacenaje · Frío · 3PL · Distribución", tel:"(604) 448-4040" },
  { name:"Terminal de Carga Cali",          operador:"AEROCIVIL",  ciudad:"Cali",         dept:"Valle del Cauca", lat: 3.548, lng:-76.391, servicios:"Aéreo · Frío · Valorables",              tel:"(602) 266-2000" },
  { name:"Centro Logístico TCC Cali",       operador:"TCC",        ciudad:"Cali",         dept:"Valle del Cauca", lat: 3.450, lng:-76.530, servicios:"Distribución · Express · Almacenaje",    tel:"(602) 800-9190" },
  { name:"Puerto Seco Barranquilla",        operador:"SPRB",       ciudad:"Barranquilla", dept:"Atlántico",       lat:10.990, lng:-74.803, servicios:"Contenedores · Aduana · Bodegaje",        tel:"(605) 379-0060" },
  { name:"Centro Logístico TCC Barranquilla",operador:"TCC",       ciudad:"Barranquilla", dept:"Atlántico",       lat:10.978, lng:-74.810, servicios:"Carga seca · Distribución Costa",        tel:"(605) 385-9191" },
  { name:"Puerto Contecar Cartagena",       operador:"Contecar",   ciudad:"Cartagena",    dept:"Bolívar",         lat:10.365, lng:-75.503, servicios:"Contenedores · RORO · 24h",               tel:"(605) 693-9000" },
  { name:"Terminal Buenaventura (TCBUEN)",  operador:"TCBUEN",     ciudad:"Buenaventura", dept:"Valle del Cauca", lat: 3.885, lng:-77.028, servicios:"Contenedores · Granel · Refrigerado",    tel:"(602) 240-0100" },
  { name:"Centro Logístico Carga Pereira",  operador:"Enco",       ciudad:"Pereira",      dept:"Risaralda",       lat: 4.815, lng:-75.698, servicios:"Distribución Eje Cafetero · Express",    tel:"(606) 313-0808" },
  { name:"Terminal de Carga Cúcuta",        operador:"TCC",        ciudad:"Cúcuta",       dept:"Norte de Santander",lat: 7.893, lng:-72.511, servicios:"Frontera VE · Distribución NE",       tel:"(607) 577-8585" },
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

export function MapIntelligence({ dark = true }: { dark?: boolean }) {
  const [activeLayer, setActiveLayer] = useState<LayerKey>("grupos");
  const [showTelegramAlerts, setShowTelegramAlerts] = useState(true);
  const [showBlockades,  setShowBlockades]  = useState(true);
  const [showPeajes,     setShowPeajes]     = useState(false);
  const [showPolicia,    setShowPolicia]    = useState(false);
  const [showHospitales, setShowHospitales] = useState(false);
  const [showEjercito,   setShowEjercito]   = useState(false);
  const [showFAC,        setShowFAC]        = useState(false);
  const [showArmada,     setShowArmada]     = useState(false);
  const [showBomberos,   setShowBomberos]   = useState(false);
  const [showBasculas,   setShowBasculas]   = useState(false);
  const [showHoteles,          setShowHoteles]          = useState(false);
  const [showHotelesCarretera, setShowHotelesCarretera] = useState(false);
  const [showEstaciones,       setShowEstaciones]       = useState(false);
  const [showAeropuertos,      setShowAeropuertos]      = useState(false);
  const [showZonasFrancas,     setShowZonasFrancas]     = useState(false);
  const [showPuertosFluviales, setShowPuertosFluviales] = useState(false);
  const [showDIAN,             setShowDIAN]             = useState(false);
  const [showCruzRoja,         setShowCruzRoja]         = useState(false);
  const [showTalleres,         setShowTalleres]         = useState(false);
  const [showTerminales,       setShowTerminales]       = useState(false);
  const [showPuentes,          setShowPuentes]          = useState(false);
  const [showOleoductos,       setShowOleoductos]       = useState(false);
  const [showPDET,             setShowPDET]             = useState(false);
  const [showMinasAP,          setShowMinasAP]          = useState(false);
  const [showINPEC,            setShowINPEC]            = useState(false);
  const [showMineras,          setShowMineras]          = useState(false);
  const [showDepositosDIAN,    setShowDepositosDIAN]    = useState(false);
  const [showCultivos,         setShowCultivos]         = useState(false);
  const [showGruposArmados,    setShowGruposArmados]    = useState(false);
  const [showRutaBunBog,       setShowRutaBunBog]       = useState(true);
  const [activeUserRoutes,     setActiveUserRoutes]     = useState<{ route: UserRoute; points: RoutePoint[] }[]>([]);

  // ── BUSCADOR DE MUNICIPIO ──
  const [searchQ,     setSearchQ]     = useState('');
  const [searchRes,   setSearchRes]   = useState<{place_id:number;display_name:string;lat:string;lon:string}[]>([]);
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [flyTarget,   setFlyTarget]   = useState<[number,number]|null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // ── BRIEFING DE CORREDOR ──
  const [showBriefing,    setShowBriefing]    = useState(false);
  const [corridorKey,     setCorridorKey]     = useState('bog-med');
  const [corridorBuffer,  setCorridorBuffer]  = useState(50);
  const [briefingData,    setBriefingData]    = useState<ReturnType<typeof buildBriefing>|null>(null);

  const [basemap, setBasemap] = useState<BasemapKey>("dark");
  const [panelOpen, setPanelOpen] = useState(true);
  const [geoData, setGeoData] = useState<any>(null);

  // ── BUSCADOR handler ──
  function handleSearch(q:string) {
    setSearchQ(q);
    clearTimeout(searchTimer.current);
    if(q.length<3){ setSearchRes([]); return; }
    searchTimer.current = setTimeout(async()=>{
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q+' Colombia')}&format=json&limit=5&accept-language=es`,{headers:{'Accept-Language':'es'}});
        const d = await r.json();
        setSearchRes(d);
      } catch{}
    },500);
  }

  // ── BRIEFING builder ──
  function buildBriefing(cKey:string, buf:number) {
    const cor = CORREDORES.find(c=>c.key===cKey)!;
    const w = (lat:number,lng:number)=>minDistToCorridor(lat,lng,cor.waypoints)<=buf;
    return {
      corredor:cor, buffer:buf, generadoEn: new Date().toLocaleString('es-CO'),
      peajes:        PEAJES.filter(p=>w(p.lat,p.lng)),
      policia:       POLICIA_CARRETERAS.filter(p=>w(p.lat,p.lng)),
      hospitales:    HOSPITALES.filter(h=>w(h.lat,h.lng)),
      bomberos:      BOMBEROS.filter(b=>w(b.lat,b.lng)),
      basculas:      BASCULAS_INVIAS.filter(b=>w(b.lat,b.lng)),
      hotelEstr:     HOTELES_ESTRATEGICOS.filter(h=>w(h.lat,h.lng)),
      hotelCtra:     HOTELES_CARRETERA.filter(h=>w(h.lat,h.lng)),
      estaciones:    ESTACIONES_SERVICIO.filter(e=>w(e.lat,e.lng)),
      talleres:      TALLERES_PESADOS.filter(t=>w(t.lat,t.lng)),
      terminales:    TERMINALES_CARGA.filter(t=>w(t.lat,t.lng)),
      aeropuertos:   AEROPUERTOS.filter(a=>w(a.lat,a.lng)),
      zonasFrancas:  ZONAS_FRANCAS.filter(z=>w(z.lat,z.lng)),
      puertos:       PUERTOS_FLUVIALES.filter(p=>w(p.lat,p.lng)),
      dian:          PUNTOS_DIAN.filter(d=>w(d.lat,d.lng)),
      cruzRoja:      EMERGENCIAS_HUMANITARIAS.filter(e=>w(e.lat,e.lng)),
      puentes:       PUENTES_ESTRATEGICOS.filter(p=>w(p.lat,p.lng)),
      oleoductos:    OLEODUCTOS.filter(o=>w(o.lat,o.lng)),
      pdet:          MUNICIPIOS_PDET.filter(m=>w(m.lat,m.lng)),
      minasAP:       ZONAS_MINAS_AP.filter(z=>w(z.lat,z.lng)),
      inpec:         CENTROS_INPEC.filter(c=>w(c.lat,c.lng)),
      mineras:       ZONAS_MINERAS.filter(z=>w(z.lat,z.lng)),
      depositosDIAN: DEPOSITOS_DIAN.filter(d=>w(d.lat,d.lng)),
      cultivos:      CULTIVOS_ILICITOS.filter(c=>w(c.lat,c.lng)),
      grupos:        GRUPOS_ARMADOS.filter(g=>w(g.lat,g.lng)),
    };
  }

  // ── FlyController (child de MapContainer) ──
  function FlyController({ target }:{ target:[number,number]|null }) {
    const map = useMap();
    useEffect(()=>{ if(target) map.flyTo(target,12,{animate:true,duration:1.5}); },[target,map]);
    return null;
  }

  const { data: blockades = [] } = useGetBlockades(undefined, { query: { refetchInterval: 60000 } });
  const { data: telegramAlerts = [] } = useGetTelegramAlerts({ query: { refetchInterval: 60000 } });
  const telegramWithCoords = (telegramAlerts as TelegramAlert[]).filter(a => a.lat != null && a.lng != null);
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
    { key:"telegram",   label:"Alertas Telegram @notiabel", icon:AlertTriangle, color:"#f97316", active:showTelegramAlerts, toggle:()=>setShowTelegramAlerts(p=>!p), count:telegramWithCoords.length },
    { key:"bloqueos",   label:"Bloqueos activos",        icon:MapPin,     color:"#ef4444", active:showBlockades,  toggle:()=>setShowBlockades(p=>!p),  count:blockades.filter((b:any)=>b.lat&&b.lng).length },
    { key:"peajes",     label:"Peajes",                  icon:Car,        color:"#f59e0b", active:showPeajes,     toggle:()=>setShowPeajes(p=>!p),      count:PEAJES.length },
    { key:"policia",    label:"Policía de Carreteras",   icon:Shield,     color:"#3b82f6", active:showPolicia,    toggle:()=>setShowPolicia(p=>!p),     count:POLICIA_CARRETERAS.length },
    { key:"hospitales", label:"Hospitales de Referencia",icon:Hospital,   color:"#10b981", active:showHospitales, toggle:()=>setShowHospitales(p=>!p), count:HOSPITALES.length },
    { key:"ejercito",   label:"Ejército Nacional",       icon:Shield,     color:"#84cc16", active:showEjercito,   toggle:()=>setShowEjercito(p=>!p),   count:EJERCITO.length },
    { key:"fac",        label:"Fuerza Aérea Colombiana", icon:Building2,  color:"#38bdf8", active:showFAC,        toggle:()=>setShowFAC(p=>!p),         count:FUERZA_AEREA.length },
    { key:"armada",     label:"Armada Nacional",         icon:MapPin,     color:"#818cf8", active:showArmada,     toggle:()=>setShowArmada(p=>!p),      count:ARMADA.length },
    { key:"bomberos",   label:"Cuerpos de Bomberos",     icon:AlertTriangle, color:"#fb923c", active:showBomberos,toggle:()=>setShowBomberos(p=>!p),    count:BOMBEROS.length },
    { key:"basculas",   label:"Básculas de Pesaje INVIAS",icon:Car,          color:"#e879f9", active:showBasculas, toggle:()=>setShowBasculas(p=>!p),   count:BASCULAS.length },
    { key:"hoteles",    label:"Hoteles Estratégicos",      icon:MapPin,       color:"#fbbf24", active:showHoteles,          toggle:()=>setShowHoteles(p=>!p),          count:HOTELES.length },
    { key:"hotelctra",  label:"Hoteles de Carretera",       icon:MapPin,       color:"#34d399", active:showHotelesCarretera, toggle:()=>setShowHotelesCarretera(p=>!p), count:HOTELES_CARRETERA.length },
    { key:"estaciones",  label:"Estaciones de Servicio",     icon:MapPin,       color:"#f97316", active:showEstaciones,       toggle:()=>setShowEstaciones(p=>!p),        count:ESTACIONES_SERVICIO.length },
    { key:"aeropuertos", label:"Aeropuertos",                icon:MapPin,       color:"#22d3ee", active:showAeropuertos,      toggle:()=>setShowAeropuertos(p=>!p),       count:AEROPUERTOS.length },
    { key:"zonasfr",     label:"Zonas Francas",              icon:Building2,    color:"#6366f1", active:showZonasFrancas,     toggle:()=>setShowZonasFrancas(p=>!p),      count:ZONAS_FRANCAS.length },
    { key:"puertosfl",   label:"Puertos Fluviales",          icon:MapPin,       color:"#0ea5e9", active:showPuertosFluviales, toggle:()=>setShowPuertosFluviales(p=>!p),  count:PUERTOS_FLUVIALES.length },
    { key:"dian",        label:"Puntos de Control DIAN",     icon:Shield,       color:"#eab308", active:showDIAN,             toggle:()=>setShowDIAN(p=>!p),              count:PUNTOS_DIAN.length },
    { key:"cruzroja",    label:"Cruz Roja / Defensa Civil",  icon:AlertTriangle,color:"#fb7185", active:showCruzRoja,         toggle:()=>setShowCruzRoja(p=>!p),          count:EMERGENCIAS_HUMANITARIAS.length },
    { key:"talleres",    label:"Talleres Mecánica Pesada",   icon:Car,          color:"#94a3b8", active:showTalleres,         toggle:()=>setShowTalleres(p=>!p),          count:TALLERES_PESADOS.length },
    { key:"terminales",  label:"Terminales de Carga",        icon:Building2,    color:"#d97706", active:showTerminales,       toggle:()=>setShowTerminales(p=>!p),        count:TERMINALES_CARGA.length },
    { key:"puentes",     label:"Puentes Estratégicos",       icon:AlertTriangle,color:"#64748b", active:showPuentes,          toggle:()=>setShowPuentes(p=>!p),           count:PUENTES_ESTRATEGICOS.length },
    { key:"oleoductos",  label:"Infraestructura Petrolera",  icon:AlertTriangle,color:"#92400e", active:showOleoductos,       toggle:()=>setShowOleoductos(p=>!p),        count:OLEODUCTOS.length },
    { key:"pdet",        label:"Municipios PDET",            icon:AlertTriangle,color:"#fb923c", active:showPDET,             toggle:()=>setShowPDET(p=>!p),              count:MUNICIPIOS_PDET.length },
    { key:"minasap",     label:"Riesgo Minas Antipersonal",  icon:AlertTriangle,color:"#dc2626", active:showMinasAP,          toggle:()=>setShowMinasAP(p=>!p),           count:ZONAS_MINAS_AP.length },
    { key:"inpec",       label:"Centros Penitenciarios INPEC",icon:Building2,   color:"#6b7280", active:showINPEC,            toggle:()=>setShowINPEC(p=>!p),             count:CENTROS_INPEC.length },
    { key:"mineras",     label:"Zonas Mineras Activas",      icon:AlertTriangle,color:"#ca8a04", active:showMineras,          toggle:()=>setShowMineras(p=>!p),           count:ZONAS_MINERAS.length },
    { key:"depositosdian",label:"Depósitos Habilitados DIAN",icon:Building2,   color:"#8b5cf6", active:showDepositosDIAN,    toggle:()=>setShowDepositosDIAN(p=>!p),     count:DEPOSITOS_DIAN.length },
    { key:"cultivos",     label:"Cultivos Ilícitos SIMCI",   icon:AlertTriangle,color:"#16a34a",active:showCultivos,          toggle:()=>setShowCultivos(p=>!p),          count:CULTIVOS_ILICITOS.length },
    { key:"gruposarmados",label:"Grupos Armados — Presencia", icon:Shield,      color:"#b91c1c", active:showGruposArmados,    toggle:()=>setShowGruposArmados(p=>!p),     count:GRUPOS_ARMADOS.length },
    { key:"rutabunbog",   label:"Ruta Buenaventura→Bogotá",  icon:Truck,        color:"#f59e0b", active:showRutaBunBog,       toggle:()=>setShowRutaBunBog(p=>!p),        count:PUNTOS_CRITICOS_BUN_BOG.length },
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
  const hotelIcon      = makeIcon("🏨", "rgba(251,191,36,0.92)",  "#fbbf24", 22);
  const hotelCtraIcon  = makeIcon("🛏", "rgba(52,211,153,0.92)",  "#34d399", 22);
  const estacionIcon      = makeIcon("⛽", "rgba(249,115,22,0.92)",  "#f97316", 22);
  const aeropuertoIcon    = makeIcon("✈", "rgba(34,211,238,0.92)",  "#22d3ee", 22);
  const zonaFrancaIcon    = makeIcon("🏭","rgba(99,102,241,0.92)",  "#6366f1", 22);
  const puertoFluvialIcon = makeIcon("🚢","rgba(14,165,233,0.92)",  "#0ea5e9", 22);
  const dianIcon          = makeIcon("🛃","rgba(234,179,8,0.92)",   "#eab308", 22);
  const cruzRojaIcon      = makeIcon("✚", "rgba(251,113,133,0.92)", "#fb7185", 22);
  const tallerIcon        = makeIcon("🔧","rgba(148,163,184,0.92)", "#94a3b8", 22);
  const terminalIcon      = makeIcon("📦","rgba(217,119,6,0.92)",   "#d97706", 22);
  const puenteIcon        = makeIcon("🌉","rgba(100,116,139,0.92)","#64748b", 22);
  const oleoductoIcon     = makeIcon("🛢","rgba(146,64,14,0.92)",  "#92400e", 22);
  const pdetIcon          = makeIcon("🕊","rgba(251,146,60,0.92)", "#fb923c", 22);
  const minasApIcon       = makeIcon("💣","rgba(220,38,38,0.92)",  "#dc2626", 22);
  const inpecIcon         = makeIcon("🔒","rgba(107,114,128,0.92)","#6b7280", 22);
  const mineraIcon        = makeIcon("⛏","rgba(202,138,4,0.92)",  "#ca8a04", 22);
  const depositoDianIcon  = makeIcon("🏛","rgba(139,92,246,0.92)", "#8b5cf6", 22);
  const cultivoIcon       = makeIcon("🌿","rgba(22,163,74,0.92)",  "#16a34a", 24);
  const grupoArmadoIcon   = makeIcon("⚔","rgba(185,28,28,0.92)",  "#b91c1c", 24);

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

        {/* Alertas Telegram @notiabel */}
        {showTelegramAlerts && telegramWithCoords.map((a: TelegramAlert) => {
          const typeColors: Record<string,string> = { accidente:"#ef4444", cierre:"#f59e0b", trancon:"#f97316", manifestacion:"#a855f7" };
          const typeEmoji: Record<string,string> = { accidente:"🚨", cierre:"🚫", trancon:"🚦", manifestacion:"📢" };
          const c = typeColors[a.eventType] ?? "#94a3b8";
          const emoji = typeEmoji[a.eventType] ?? "⚠️";
          const radius = a.severity === "alto" ? 10 : a.severity === "medio" ? 8 : 6;
          const minutesAgo = Math.round((Date.now() - new Date(a.createdAt).getTime()) / 60000);
          const timeLabel = minutesAgo < 60 ? `hace ${minutesAgo} min` : `hace ${Math.round(minutesAgo/60)}h`;
          return (
            <CircleMarker key={a.id} center={[a.lat!, a.lng!]} radius={radius}
              pathOptions={{ color:c, fillColor:c, fillOpacity:0.88, weight:2 }}>
              <Popup className="dark-popup">
                <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:210 }}>
                  <div style={{ fontWeight:700,color:c,marginBottom:6,fontSize:14 }}>
                    {emoji} {a.eventType.charAt(0).toUpperCase()+a.eventType.slice(1)}
                    <span style={{ fontSize:11,fontWeight:400,color:"#64748b",marginLeft:6 }}>@notiabel</span>
                  </div>
                  {a.locationText && <div style={{ marginBottom:4 }}><span style={{ color:"#94a3b8" }}>📍 </span>{a.locationText}</div>}
                  <div style={{ fontSize:11,color:"#94a3b8",marginBottom:6,lineHeight:1.5 }}>{a.rawText.slice(0,120)}{a.rawText.length>120?"…":""}</div>
                  <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                    <span style={{ background: a.severity==="alto"?"#7f1d1d":a.severity==="medio"?"#78350f":"#1a2e1a", color: a.severity==="alto"?"#fca5a5":a.severity==="medio"?"#fcd34d":"#86efac", padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:700,textTransform:"uppercase" }}>{a.severity}</span>
                    <span style={{ fontSize:11,color:"#64748b" }}>{timeLabel}</span>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

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

        <FlyController target={flyTarget} />

        {/* ── RUTAS DE USUARIO CARGADAS DESDE BD ── */}
        {activeUserRoutes.map(({ route, points }, ri) => {
          const ROUTE_COLORS = ["#f59e0b","#22d3ee","#a78bfa","#34d399","#fb923c"];
          const lineColor = ROUTE_COLORS[ri % ROUTE_COLORS.length];
          const waypoints = points.map(p => [p.lat, p.lng] as [number, number]);
          return (
            <React.Fragment key={`user-route-${route.id}`}>
              <Polyline positions={waypoints} pathOptions={{ color: lineColor, weight: 3, opacity: 0.9, dashArray: "7 4" }} />
              {points.map((p, pi) => {
                const color = p.tipo === "PUNTO CRITICO" ? "#ef4444"
                  : p.tipo === "CUERPOS DE AGUA" ? "#38bdf8"
                  : p.tipo === "INFRAESTRUCTURA Y EQUIPAMIENTO" ? "#a78bfa"
                  : p.tipo === "CENTRO POBLADO" ? "#34d399"
                  : "#94a3b8";
                const r = p.riesgo >= 5 ? 7 : p.riesgo >= 4 ? 5 : 4;
                return (
                  <CircleMarker key={`ur-${route.id}-${pi}`} center={[p.lat, p.lng]} radius={r}
                    pathOptions={{ color, fillColor: color, fillOpacity: 0.88, weight: 1.5 }}>
                    <Popup>
                      <div style={{ minWidth: 220, fontFamily: "sans-serif" }}>
                        <div style={{ fontSize: 10, letterSpacing: 1, color: lineColor, fontWeight: 700, marginBottom: 2 }}>{route.name}</div>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>#{p.n} — {p.nombre}</div>
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>{p.mun}, {p.dept}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                          <span style={{ background: p.tipo === "PUNTO CRITICO" ? "#fee2e2" : "#f3e8ff", color: p.tipo === "PUNTO CRITICO" ? "#dc2626" : "#7e22ce", padding: "2px 7px", borderRadius: 10, fontSize: 10, fontWeight: 600 }}>{p.tipo}</span>
                          <span style={{ background: p.riesgo >= 5 ? "#fee2e2" : p.riesgo >= 4 ? "#fef3c7" : "#f0fdf4", color: p.riesgo >= 5 ? "#dc2626" : p.riesgo >= 4 ? "#d97706" : "#16a34a", padding: "2px 7px", borderRadius: 10, fontSize: 10, fontWeight: 700 }}>Riesgo: {p.riesgo}</span>
                        </div>
                        {p.desc && <div style={{ fontSize: 11, marginBottom: 4 }}><b>Descripción:</b> {p.desc}</div>}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11, marginBottom: 4 }}>
                          <div>⛰ <b>{p.alt} msnm</b></div>
                          <div>🚗 <b>{p.vel} km/h</b></div>
                        </div>
                        {p.controles && <div style={{ fontSize: 10, color: "#475569" }}><b>Controles:</b> {p.controles}</div>}
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </React.Fragment>
          );
        })}

        {/* ── RUTA REAL: BUENAVENTURA → BOGOTÁ ── */}
        {showRutaBunBog && (<>
          {/* Polilínea de la ruta */}
          <Polyline
            positions={WAYPOINTS_BUN_BOG}
            pathOptions={{ color:"#f59e0b", weight:3, opacity:0.85, dashArray:"6 4" }}
          />
          {/* Puntos críticos como CircleMarkers (fuera del cluster para no mezclar) */}
          {PUNTOS_CRITICOS_BUN_BOG.map((p,i)=>{
            const color = p.tipo==="PUNTO CRITICO" ? "#ef4444"
              : p.tipo==="CUERPOS DE AGUA" ? "#38bdf8"
              : p.tipo==="INFRAESTRUCTURA Y EQUIPAMIENTO" ? "#a78bfa"
              : p.tipo==="CENTRO POBLADO" ? "#34d399"
              : p.tipo==="ZONA AGRICOLA" ? "#86efac"
              : p.tipo==="AREAS NATURALES PROTEGIDAS" ? "#4ade80"
              : "#94a3b8";
            const r = p.riesgo>=5 ? 7 : p.riesgo>=4 ? 5 : 4;
            return (
              <CircleMarker key={`bun-bog-${i}`} center={[p.coord[0],p.coord[1]]} radius={r}
                pathOptions={{ color, fillColor:color, fillOpacity:0.9, weight:1.5 }}>
                <Popup>
                  <div style={{ minWidth:220, fontFamily:"sans-serif" }}>
                    <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>#{p.n} — {p.nombre}</div>
                    <div style={{ fontSize:11, color:"#64748b", marginBottom:6 }}>{p.mun}, {p.dept}</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:6 }}>
                      <span style={{ background: p.tipo==="PUNTO CRITICO"?"#fee2e2":p.tipo==="CUERPOS DE AGUA"?"#e0f2fe":"#f3e8ff", color: p.tipo==="PUNTO CRITICO"?"#dc2626":p.tipo==="CUERPOS DE AGUA"?"#0369a1":"#7e22ce", padding:"2px 7px", borderRadius:10, fontSize:10, fontWeight:600 }}>{p.tipo}</span>
                      <span style={{ background: p.riesgo>=5?"#fee2e2":p.riesgo>=4?"#fef3c7":"#f0fdf4", color: p.riesgo>=5?"#dc2626":p.riesgo>=4?"#d97706":"#16a34a", padding:"2px 7px", borderRadius:10, fontSize:10, fontWeight:700 }}>Riesgo: {p.riesgo}</span>
                    </div>
                    {p.desc&&<div style={{ fontSize:11, marginBottom:4 }}><b>Descripción:</b> {p.desc}</div>}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4, fontSize:11, marginBottom:4 }}>
                      <div>⛰ Altimetría: <b>{p.alt} msnm</b></div>
                      <div>🚗 Velocidad: <b>{p.vel} km/h</b></div>
                    </div>
                    {p.controles&&<div style={{ fontSize:10, color:"#475569" }}><b>Controles:</b> {p.controles}</div>}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </>)}

        {/* ══ MARKER CLUSTER GROUP — agrupa todos los marcadores punto ══ */}
        <MarkerClusterGroup chunkedLoading maxClusterRadius={50} showCoverageOnHover={false}>

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

        {/* ── AEROPUERTOS ── */}
        {showAeropuertos&&AEROPUERTOS.map((a,i)=>(
          <Marker key={`aero-${i}`} position={[a.lat,a.lng]} icon={aeropuertoIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:220 }}>
                <div style={{ fontWeight:700,color:"#22d3ee",marginBottom:6 }}>✈ {a.name} ({a.codigo})</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Ciudad</td><td style={{ textAlign:"right" }}>{a.ciudad}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Dpto.</td><td style={{ textAlign:"right" }}>{a.dept}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Tipo</td><td style={{ textAlign:"right",color:"#22d3ee",fontWeight:600 }}>{a.tipo}</td></tr>
                  {a.pista&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Pista</td><td style={{ textAlign:"right" }}>{a.pista}</td></tr>}
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Carga aérea</td><td style={{ textAlign:"right",fontWeight:700,color:a.carga?"#22d3ee":"#64748b" }}>{a.carga?"✔ Sí":"No"}</td></tr>
                </table>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── ZONAS FRANCAS ── */}
        {showZonasFrancas&&ZONAS_FRANCAS.map((z,i)=>(
          <Marker key={`zf-${i}`} position={[z.lat,z.lng]} icon={zonaFrancaIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:210 }}>
                <div style={{ fontWeight:700,color:"#6366f1",marginBottom:6 }}>🏭 {z.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Ciudad</td><td style={{ textAlign:"right" }}>{z.ciudad}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Dpto.</td><td style={{ textAlign:"right" }}>{z.dept}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Área</td><td style={{ textAlign:"right",color:"#6366f1",fontWeight:600 }}>{z.area}</td></tr>
                  {z.tel&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Teléfono</td><td style={{ textAlign:"right" }}>{z.tel}</td></tr>}
                </table>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── PUERTOS FLUVIALES ── */}
        {showPuertosFluviales&&PUERTOS_FLUVIALES.map((p,i)=>(
          <Marker key={`pf-${i}`} position={[p.lat,p.lng]} icon={puertoFluvialIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:220 }}>
                <div style={{ fontWeight:700,color:"#0ea5e9",marginBottom:6 }}>🚢 {p.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Río / Bahía</td><td style={{ textAlign:"right",color:"#0ea5e9",fontWeight:600 }}>{p.rio}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Municipio</td><td style={{ textAlign:"right" }}>{p.municipio}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Dpto.</td><td style={{ textAlign:"right" }}>{p.dept}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Tipo</td><td style={{ textAlign:"right",fontSize:11 }}>{p.tipo}</td></tr>
                  {p.tel&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Tel.</td><td style={{ textAlign:"right" }}>{p.tel}</td></tr>}
                </table>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── PUNTOS DIAN ── */}
        {showDIAN&&PUNTOS_DIAN.map((d,i)=>(
          <Marker key={`dian-${i}`} position={[d.lat,d.lng]} icon={dianIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:225 }}>
                <div style={{ fontWeight:700,color:"#eab308",marginBottom:6 }}>🛃 {d.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Tipo</td><td style={{ textAlign:"right",color:"#eab308",fontWeight:600 }}>{d.tipo}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Municipio</td><td style={{ textAlign:"right" }}>{d.municipio}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Dpto.</td><td style={{ textAlign:"right" }}>{d.dept}</td></tr>
                  {d.frontera&&<tr><td colSpan={2} style={{ color:"#ef4444",fontWeight:700,fontSize:11,paddingTop:4 }}>⚠ Punto de control fronterizo</td></tr>}
                  {d.tel&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Tel.</td><td style={{ textAlign:"right" }}>{d.tel}</td></tr>}
                </table>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── CRUZ ROJA / DEFENSA CIVIL ── */}
        {showCruzRoja&&EMERGENCIAS_HUMANITARIAS.map((c,i)=>(
          <Marker key={`cr-${i}`} position={[c.lat,c.lng]} icon={cruzRojaIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:210 }}>
                <div style={{ fontWeight:700,color:"#fb7185",marginBottom:6 }}>✚ {c.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Organización</td><td style={{ textAlign:"right",color:"#fb7185",fontWeight:600 }}>{c.org}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Ciudad</td><td style={{ textAlign:"right" }}>{c.ciudad}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Dpto.</td><td style={{ textAlign:"right" }}>{c.dept}</td></tr>
                  {c.tel&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Emergencias</td><td style={{ textAlign:"right",color:"#fb7185",fontWeight:700,fontSize:14 }}>{c.tel}</td></tr>}
                </table>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── TALLERES MECÁNICA PESADA ── */}
        {showTalleres&&TALLERES_PESADOS.map((t,i)=>(
          <Marker key={`tal-${i}`} position={[t.lat,t.lng]} icon={tallerIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:220 }}>
                <div style={{ fontWeight:700,color:"#94a3b8",marginBottom:6 }}>🔧 {t.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Ruta</td><td style={{ textAlign:"right",fontSize:11,color:"#94a3b8" }}>{t.ruta}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Municipio</td><td style={{ textAlign:"right" }}>{t.municipio}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Dpto.</td><td style={{ textAlign:"right" }}>{t.dept}</td></tr>
                  <tr><td colSpan={2} style={{ borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:4,fontSize:11,color:"#64748b" }}>{t.servicios}</td></tr>
                  {t.tel&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Tel.</td><td style={{ textAlign:"right",color:"#94a3b8",fontWeight:600 }}>{t.tel}</td></tr>}
                </table>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── TERMINALES DE CARGA ── */}
        {showTerminales&&TERMINALES_CARGA.map((t,i)=>(
          <Marker key={`term-${i}`} position={[t.lat,t.lng]} icon={terminalIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:225 }}>
                <div style={{ fontWeight:700,color:"#d97706",marginBottom:6 }}>📦 {t.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Operador</td><td style={{ textAlign:"right",color:"#d97706",fontWeight:600 }}>{t.operador}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Ciudad</td><td style={{ textAlign:"right" }}>{t.ciudad}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Dpto.</td><td style={{ textAlign:"right" }}>{t.dept}</td></tr>
                  <tr><td colSpan={2} style={{ borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:4,fontSize:11,color:"#64748b" }}>{t.servicios}</td></tr>
                  {t.tel&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Tel.</td><td style={{ textAlign:"right" }}>{t.tel}</td></tr>}
                </table>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── PUENTES ESTRATÉGICOS ── */}
        {showPuentes&&PUENTES_ESTRATEGICOS.map((p,i)=>(
          <Marker key={`pte-${i}`} position={[p.lat,p.lng]} icon={puenteIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:230 }}>
                <div style={{ fontWeight:700,color:"#94a3b8",marginBottom:6 }}>🌉 {p.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Ruta</td><td style={{ textAlign:"right",fontWeight:700,color:"#64748b" }}>{p.ruta}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Municipio</td><td style={{ textAlign:"right" }}>{p.municipio}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Departamento</td><td style={{ textAlign:"right" }}>{p.dept}</td></tr>
                  {p.longitud&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Longitud</td><td style={{ textAlign:"right",fontWeight:600 }}>{p.longitud}</td></tr>}
                  {p.nota&&<tr><td colSpan={2} style={{ borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:5,color:"#f59e0b",fontSize:12 }}>⚠ {p.nota}</td></tr>}
                </table>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── INFRAESTRUCTURA PETROLERA / OLEODUCTOS ── */}
        {showOleoductos&&OLEODUCTOS.map((o,i)=>(
          <Marker key={`oil-${i}`} position={[o.lat,o.lng]} icon={oleoductoIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:230 }}>
                <div style={{ fontWeight:700,color:"#92400e",marginBottom:6 }}>🛢 {o.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Tipo</td><td style={{ textAlign:"right",fontWeight:700,color:"#d97706" }}>{o.tipo}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Operador</td><td style={{ textAlign:"right" }}>{o.operador}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Municipio</td><td style={{ textAlign:"right" }}>{o.municipio}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Departamento</td><td style={{ textAlign:"right" }}>{o.dept}</td></tr>
                  {o.nota&&<tr><td colSpan={2} style={{ borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:5,color:"#f59e0b",fontSize:12 }}>ℹ {o.nota}</td></tr>}
                </table>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── MUNICIPIOS PDET ── */}
        {showPDET&&MUNICIPIOS_PDET.map((m,i)=>(
          <Marker key={`pdet-${i}`} position={[m.lat,m.lng]} icon={pdetIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:220 }}>
                <div style={{ fontWeight:700,color:"#fb923c",marginBottom:6 }}>🕊 {m.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Subregión PDET</td><td style={{ textAlign:"right",fontSize:11,color:"#fb923c" }}>{m.subregion}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Departamento</td><td style={{ textAlign:"right" }}>{m.dept}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Nivel de riesgo</td><td style={{ textAlign:"right",fontWeight:700,color:m.riesgo==="Crítico"?"#ef4444":m.riesgo==="Alto"?"#f97316":"#eab308" }}>{m.riesgo}</td></tr>
                </table>
                <div style={{ marginTop:6,fontSize:11,color:"#64748b" }}>Programa Desarrollo con Enfoque Territorial — Acuerdo de Paz 2016</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── RIESGO MINAS ANTIPERSONAL ── */}
        {showMinasAP&&ZONAS_MINAS_AP.map((z,i)=>(
          <Marker key={`map-${i}`} position={[z.lat,z.lng]} icon={minasApIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:220 }}>
                <div style={{ fontWeight:700,color:"#dc2626",marginBottom:6 }}>💣 {z.name} — Alerta MAP/MUSE</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Departamento</td><td style={{ textAlign:"right" }}>{z.dept}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Nivel de riesgo</td><td style={{ textAlign:"right",fontWeight:700,color:z.nivel==="Crítico"?"#ef4444":z.nivel==="Alto"?"#f97316":"#eab308" }}>{z.nivel}</td></tr>
                  {z.eventos&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Eventos acumulados</td><td style={{ textAlign:"right",fontWeight:700,color:"#ef4444" }}>{z.eventos}</td></tr>}
                </table>
                <div style={{ marginTop:6,fontSize:11,color:"#ef4444" }}>Fuente: AICMA / Descontamina Colombia</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── CENTROS PENITENCIARIOS INPEC ── */}
        {showINPEC&&CENTROS_INPEC.map((c,i)=>(
          <Marker key={`inpec-${i}`} position={[c.lat,c.lng]} icon={inpecIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:230 }}>
                <div style={{ fontWeight:700,color:"#9ca3af",marginBottom:6 }}>🔒 {c.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Ciudad</td><td style={{ textAlign:"right" }}>{c.ciudad}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Departamento</td><td style={{ textAlign:"right" }}>{c.dept}</td></tr>
                  {c.capacidad&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Capacidad</td><td style={{ textAlign:"right",fontWeight:700 }}>{c.capacidad.toLocaleString()} internos</td></tr>}
                  {c.tel&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Tel.</td><td style={{ textAlign:"right" }}>{c.tel}</td></tr>}
                </table>
                <div style={{ marginTop:6,fontSize:11,color:"#64748b" }}>INPEC — Instituto Nacional Penitenciario</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── ZONAS MINERAS ACTIVAS ── */}
        {showMineras&&ZONAS_MINERAS.map((z,i)=>(
          <Marker key={`min-${i}`} position={[z.lat,z.lng]} icon={mineraIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:230 }}>
                <div style={{ fontWeight:700,color:"#ca8a04",marginBottom:6 }}>⛏ {z.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Mineral</td><td style={{ textAlign:"right",fontWeight:700,color:"#fbbf24" }}>{z.mineral}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Tipo</td><td style={{ textAlign:"right",color:z.tipo==="Ilegal"?"#ef4444":z.tipo==="Mixto"?"#f97316":"#22d3ee",fontWeight:600 }}>{z.tipo}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Departamento</td><td style={{ textAlign:"right" }}>{z.dept}</td></tr>
                  {z.nota&&<tr><td colSpan={2} style={{ borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:5,color:"#f59e0b",fontSize:11 }}>{z.nota}</td></tr>}
                </table>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── DEPÓSITOS HABILITADOS DIAN ── */}
        {showDepositosDIAN&&DEPOSITOS_DIAN.map((d,i)=>(
          <Marker key={`dep-${i}`} position={[d.lat,d.lng]} icon={depositoDianIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:240 }}>
                <div style={{ fontWeight:700,color:"#8b5cf6",marginBottom:6 }}>🏛 {d.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Operador</td><td style={{ textAlign:"right",fontWeight:700,color:"#a78bfa" }}>{d.operador}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Ciudad</td><td style={{ textAlign:"right" }}>{d.ciudad}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Departamento</td><td style={{ textAlign:"right" }}>{d.dept}</td></tr>
                  <tr><td colSpan={2} style={{ borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:5,fontSize:11,color:"#a78bfa" }}>{d.tipo}</td></tr>
                  {d.tel&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Tel.</td><td style={{ textAlign:"right" }}>{d.tel}</td></tr>}
                </table>
                <div style={{ marginTop:6,fontSize:11,color:"#64748b" }}>Depósito habilitado DIAN — Almacenaje bajo control aduanero</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── ESTACIONES DE SERVICIO ── */}
        {showEstaciones&&ESTACIONES_SERVICIO.map((e,i)=>(
          <Marker key={`est-${i}`} position={[e.lat,e.lng]} icon={estacionIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:230 }}>
                <div style={{ fontWeight:700,color:"#f97316",marginBottom:6 }}>⛽ {e.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Marca</td><td style={{ textAlign:"right",fontWeight:700,color:"#f97316" }}>{e.marca}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Ruta</td><td style={{ textAlign:"right",fontSize:11 }}>{e.ruta}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Municipio</td><td style={{ textAlign:"right" }}>{e.municipio}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Dpto.</td><td style={{ textAlign:"right" }}>{e.dept}</td></tr>
                  <tr><td colSpan={2} style={{ borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:5,marginTop:4 }}>
                    <div style={{ fontSize:11,color:"#64748b",lineHeight:1.5 }}>{e.servicios}</div>
                  </td></tr>
                </table>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── HOTELES DE CARRETERA ── */}
        {showHotelesCarretera&&HOTELES_CARRETERA.map((h,i)=>(
          <Marker key={`hctra-${i}`} position={[h.lat,h.lng]} icon={hotelCtraIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:220 }}>
                <div style={{ fontWeight:700,color:"#34d399",marginBottom:6 }}>🛏 {h.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Ruta</td><td style={{ textAlign:"right",fontSize:11,color:"#34d399",fontWeight:600 }}>{h.ruta}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Municipio</td><td style={{ textAlign:"right" }}>{h.municipio}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Dpto.</td><td style={{ textAlign:"right" }}>{h.dept}</td></tr>
                  {h.address&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Dirección</td><td style={{ textAlign:"right",fontSize:11 }}>{h.address}</td></tr>}
                  {h.tel&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Teléfono</td><td style={{ textAlign:"right",color:"#34d399",fontWeight:600 }}>{h.tel}</td></tr>}
                  {h.servicios&&<tr><td colSpan={2} style={{ color:"#64748b",fontSize:11,paddingTop:4,borderTop:"1px solid rgba(255,255,255,0.08)" }}>{h.servicios}</td></tr>}
                </table>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── HOTELES ESTRATÉGICOS ── */}
        {showHoteles&&HOTELES.map((h,i)=>(
          <Marker key={`hotel-${i}`} position={[h.lat,h.lng]} icon={hotelIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:220 }}>
                <div style={{ fontWeight:700,color:"#fbbf24",marginBottom:6 }}>🏨 {h.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Categoría</td><td style={{ textAlign:"right",color:"#fbbf24",fontWeight:700 }}>{"★".repeat(h.stars)}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Cadena</td><td style={{ textAlign:"right" }}>{h.cadena}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Ciudad</td><td style={{ textAlign:"right" }}>{h.ciudad}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Dpto.</td><td style={{ textAlign:"right" }}>{h.dept}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Dirección</td><td style={{ textAlign:"right",fontSize:11 }}>{h.address}</td></tr>
                  {h.tel&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Teléfono</td><td style={{ textAlign:"right",color:"#fbbf24",fontWeight:600 }}>{h.tel}</td></tr>}
                </table>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── CULTIVOS ILÍCITOS SIMCI ── */}
        {showCultivos&&CULTIVOS_ILICITOS.map((c,i)=>(
          <Marker key={`cult-${i}`} position={[c.lat,c.lng]} icon={cultivoIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:230 }}>
                <div style={{ fontWeight:700,color:"#16a34a",marginBottom:6 }}>🌿 {c.name}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Cultivo</td><td style={{ textAlign:"right",fontWeight:700,color:"#22c55e" }}>{c.cultivo}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Departamento</td><td style={{ textAlign:"right" }}>{c.dept}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Área SIMCI</td><td style={{ textAlign:"right",fontWeight:700,color:"#ef4444" }}>{c.hectareas.toLocaleString()} ha</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Tendencia</td><td style={{ textAlign:"right",fontWeight:700,color:c.tendencia==="↑"?"#ef4444":c.tendencia==="↓"?"#22c55e":"#f59e0b",fontSize:16 }}>{c.tendencia}</td></tr>
                </table>
                <div style={{ marginTop:6,fontSize:11,color:"#64748b" }}>Fuente: SIMCI — UNODC / Gobierno de Colombia</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── GRUPOS ARMADOS — PRESENCIA ── */}
        {showGruposArmados&&GRUPOS_ARMADOS.map((g,i)=>{
          const colGrupo = g.grupo==="ELN"?"#dc2626":g.grupo==="FARC-EMC"?"#7c3aed":g.grupo==="Clan del Golfo"?"#d97706":"#64748b";
          return (
          <Marker key={`ga-${i}`} position={[g.lat,g.lng]} icon={grupoArmadoIcon}>
            <Popup className="dark-popup">
              <div style={{ fontFamily:"sans-serif",fontSize:13,color:"#e2e8f0",minWidth:240 }}>
                <div style={{ fontWeight:700,color:colGrupo,marginBottom:6 }}>⚔ {g.grupo}</div>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Subregión</td><td style={{ textAlign:"right",fontSize:11,color:colGrupo }}>{g.subregion}</td></tr>
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Departamento</td><td style={{ textAlign:"right" }}>{g.dept}</td></tr>
                  {g.frente&&<tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Frente / Bloque</td><td style={{ textAlign:"right",fontSize:11,fontStyle:"italic" }}>{g.frente}</td></tr>}
                  <tr><td style={{ color:"#94a3b8",padding:"2px 0" }}>Nivel</td><td style={{ textAlign:"right",fontWeight:700,color:g.nivel==="Dominante"?"#ef4444":g.nivel==="Alta presencia"?"#f97316":"#eab308" }}>{g.nivel}</td></tr>
                </table>
                <div style={{ marginTop:6,fontSize:11,color:"#64748b" }}>Fuente: FIP / INDEPAZ / MinDefensa — Inteligencia de situación</div>
              </div>
            </Popup>
          </Marker>
          );
        })}

        </MarkerClusterGroup>
        {/* ══ FIN MARKER CLUSTER GROUP ══ */}

      </MapContainer>

      {/* ── BUSCADOR DE MUNICIPIO ── */}
      <div style={{ position:"absolute",top:88,left:16,zIndex:1000,width:280 }}>
        <div style={{ display:"flex",alignItems:"center",background:"rgba(7,12,21,0.93)",backdropFilter:"blur(12px)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,padding:"6px 12px",gap:8 }}>
          <span style={{ fontSize:16 }}>🔍</span>
          <input
            value={searchQ}
            onChange={e=>{ handleSearch(e.target.value); setSearchOpen(true); }}
            onFocus={()=>setSearchOpen(true)}
            placeholder="Buscar municipio..."
            style={{ background:"transparent",border:"none",outline:"none",color:"#e2e8f0",fontSize:13,flex:1,fontFamily:"sans-serif" }}
          />
          {searchQ&&<button onClick={()=>{setSearchQ('');setSearchRes([]);}} style={{ background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:14 }}>✕</button>}
        </div>
        {searchOpen&&searchRes.length>0&&(
          <div style={{ marginTop:4,background:"rgba(7,12,21,0.96)",backdropFilter:"blur(12px)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,overflow:"hidden" }}>
            {searchRes.map(r=>{
              const parts = r.display_name.split(',');
              const label = parts.slice(0,2).join(',').trim();
              return(
                <div key={r.place_id} onClick={()=>{
                  setFlyTarget([parseFloat(r.lat),parseFloat(r.lon)]);
                  setSearchQ(label); setSearchRes([]); setSearchOpen(false);
                }} style={{ padding:"8px 14px",cursor:"pointer",borderBottom:"1px solid rgba(255,255,255,0.06)",fontSize:12,color:"#cbd5e1",transition:"background 0.15s" }}
                  onMouseEnter={e=>(e.currentTarget.style.background="rgba(0,212,255,0.08)")}
                  onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
                >
                  <div style={{ fontWeight:600,color:"#e2e8f0" }}>{parts[0]?.trim()}</div>
                  <div style={{ color:"#64748b",fontSize:11 }}>{parts[1]?.trim()}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── GESTOR DE RUTAS DE USUARIO ── */}
      <RouteManager onRoutesChange={setActiveUserRoutes} />

      {/* ── BOTÓN BRIEFING DE CORREDOR ── */}
      <div style={{ position:"absolute",bottom:24,left:16,zIndex:1000 }}>
        <button onClick={()=>{ setBriefingData(buildBriefing(corridorKey,corridorBuffer)); setShowBriefing(true); }}
          style={{ display:"flex",alignItems:"center",gap:8,background:"rgba(7,12,21,0.93)",backdropFilter:"blur(12px)",border:"1px solid rgba(0,212,255,0.3)",borderRadius:10,padding:"10px 16px",color:"#00d4ff",cursor:"pointer",fontFamily:"sans-serif",fontSize:13,fontWeight:600 }}>
          🛣️ Briefing de Corredor
        </button>
      </div>

      {/* ── MODAL BRIEFING DE CORREDOR ── */}
      {showBriefing&&briefingData&&(
        <div style={{ position:"absolute",inset:0,zIndex:2000,display:"flex" }}>
          {/* overlay semitransparente */}
          <div style={{ position:"absolute",inset:0,background:"rgba(0,0,0,0.55)" }} onClick={()=>setShowBriefing(false)}/>
          {/* panel deslizante */}
          <div style={{ position:"relative",marginLeft:"auto",width:520,maxWidth:"95vw",height:"100%",background:"#070c15",borderLeft:"1px solid rgba(0,212,255,0.2)",overflowY:"auto",fontFamily:"sans-serif" }}>
            {/* CABECERA */}
            <div style={{ background:"rgba(0,212,255,0.07)",borderBottom:"1px solid rgba(0,212,255,0.15)",padding:"20px 24px" }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
                <div>
                  <div style={{ fontSize:10,letterSpacing:2,color:"#00d4ff",fontWeight:700,marginBottom:4 }}>SAFENODE · APRECIACIÓN DE SITUACIÓN — CORREDOR</div>
                  <div style={{ fontSize:20,fontWeight:700,color:"#e2e8f0" }}>{briefingData.corredor.name}</div>
                  <div style={{ fontSize:12,color:"#64748b",marginTop:2 }}>{briefingData.corredor.ruta} · {briefingData.corredor.desc}</div>
                </div>
                <button onClick={()=>setShowBriefing(false)} style={{ background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:20,padding:4 }}>✕</button>
              </div>
              {/* selector de corredor */}
              <div style={{ display:"flex",gap:8,marginTop:14,flexWrap:"wrap" }}>
                {CORREDORES.map(c=>(
                  <button key={c.key} onClick={()=>{ setCorridorKey(c.key); setBriefingData(buildBriefing(c.key,corridorBuffer)); }}
                    style={{ fontSize:10,padding:"4px 10px",borderRadius:20,border:`1px solid ${c.key===corridorKey?"#00d4ff":"rgba(255,255,255,0.12)"}`,background:c.key===corridorKey?"rgba(0,212,255,0.12)":"transparent",color:c.key===corridorKey?"#00d4ff":"#94a3b8",cursor:"pointer",fontWeight:c.key===corridorKey?700:400 }}>
                    {c.name.split(' → ')[0]}→{c.name.split(' → ')[1]}
                  </button>
                ))}
              </div>
              {/* buffer */}
              <div style={{ display:"flex",alignItems:"center",gap:10,marginTop:10 }}>
                <span style={{ fontSize:11,color:"#64748b" }}>Radio de búsqueda:</span>
                {[25,50,75,100].map(b=>(
                  <button key={b} onClick={()=>{ setCorridorBuffer(b); setBriefingData(buildBriefing(corridorKey,b)); }}
                    style={{ fontSize:10,padding:"3px 8px",borderRadius:6,border:`1px solid ${b===corridorBuffer?"#f59e0b":"rgba(255,255,255,0.1)"}`,background:b===corridorBuffer?"rgba(245,158,11,0.15)":"transparent",color:b===corridorBuffer?"#f59e0b":"#64748b",cursor:"pointer" }}>
                    {b} km
                  </button>
                ))}
                <span style={{ fontSize:10,color:"#334155",marginLeft:"auto" }}>Gen: {briefingData.generadoEn}</span>
              </div>
            </div>

            {/* RESUMEN EJECUTIVO */}
            <div style={{ padding:"16px 24px",borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize:11,letterSpacing:1,color:"#475569",fontWeight:700,marginBottom:12 }}>RESUMEN EJECUTIVO</div>
              {(()=>{
                const b=briefingData;
                const risks=[
                  { label:"Grupos Armados",  n:b.grupos.length,  color:"#ef4444", icon:"⚔" },
                  { label:"Minas Antipersonal",n:b.minasAP.length,color:"#dc2626", icon:"💣" },
                  { label:"Cultivos Ilícitos",n:b.cultivos.length,color:"#16a34a", icon:"🌿" },
                  { label:"Municipios PDET",  n:b.pdet.length,    color:"#fb923c", icon:"🕊" },
                  { label:"Oleoductos/Infraestr.",n:b.oleoductos.length,color:"#92400e",icon:"🛢" },
                ];
                const support=[
                  { label:"Policía",   n:b.policia.length,   icon:"P",  color:"#3b82f6" },
                  { label:"Hospitales",n:b.hospitales.length,icon:"H",  color:"#10b981" },
                  { label:"Bomberos",  n:b.bomberos.length,  icon:"🔥", color:"#fb923c" },
                  { label:"Est. Servicio",n:b.estaciones.length,icon:"⛽",color:"#f97316"},
                  { label:"Talleres",  n:b.talleres.length,  icon:"🔧", color:"#94a3b8" },
                  { label:"Hotels",    n:b.hotelCtra.length+b.hotelEstr.length,icon:"🏨",color:"#fbbf24"},
                ];
                return(
                  <div>
                    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12 }}>
                      {risks.map(r=>(
                        <div key={r.label} style={{ display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.03)",borderRadius:8,padding:"8px 12px",border:`1px solid ${r.n>0?r.color+"40":"rgba(255,255,255,0.05)"}` }}>
                          <span style={{ fontSize:14 }}>{r.icon}</span>
                          <div>
                            <div style={{ fontSize:18,fontWeight:700,color:r.n>0?r.color:"#475569" }}>{r.n}</div>
                            <div style={{ fontSize:10,color:"#64748b" }}>{r.label}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                      {support.map(s=>(
                        <div key={s.label} style={{ display:"flex",alignItems:"center",gap:4,background:"rgba(255,255,255,0.03)",borderRadius:6,padding:"4px 8px",border:"1px solid rgba(255,255,255,0.07)" }}>
                          <span style={{ fontSize:12 }}>{s.icon}</span>
                          <span style={{ fontSize:11,color:"#94a3b8" }}>{s.label}: </span>
                          <span style={{ fontSize:11,fontWeight:700,color:s.n>0?s.color:"#475569" }}>{s.n}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* SECCIONES DE RIESGO */}
            {[
              { title:"FACTORES DE RIESGO", items:[
                { label:"Grupos Armados",icon:"⚔",color:"#ef4444",rows:briefingData.grupos.map(g=>`${g.grupo} — ${g.subregion} (${g.nivel})`) },
                { label:"Riesgo Minas Antipersonal",icon:"💣",color:"#dc2626",rows:briefingData.minasAP.map(z=>`${z.name} (${z.dept}) — ${z.nivel}${z.eventos?` · ${z.eventos} eventos`:''}`) },
                { label:"Cultivos Ilícitos SIMCI",icon:"🌿",color:"#16a34a",rows:briefingData.cultivos.map(c=>`${c.name} — ${c.cultivo} ${c.hectareas.toLocaleString()} ha ${c.tendencia}`) },
                { label:"Municipios PDET",icon:"🕊",color:"#fb923c",rows:briefingData.pdet.map(m=>`${m.name} (${m.dept}) — ${m.riesgo}`) },
                { label:"Infraestructura Petrolera",icon:"🛢",color:"#92400e",rows:briefingData.oleoductos.map(o=>`${o.name} — ${o.tipo}`) },
              ]},
              { title:"INFRAESTRUCTURA DE APOYO", items:[
                { label:"Policía de Carreteras",icon:"P",color:"#3b82f6",rows:briefingData.policia.map(p=>`${p.name} (${p.municipio})`) },
                { label:"Hospitales de Referencia",icon:"H",color:"#10b981",rows:briefingData.hospitales.map(h=>`${h.name} (${h.ciudad}) · ${h.tel}`) },
                { label:"Bomberos",icon:"🔥",color:"#fb923c",rows:briefingData.bomberos.map(b=>`${b.name} (${b.municipio})`) },
                { label:"Estaciones de Servicio",icon:"⛽",color:"#f97316",rows:briefingData.estaciones.map(e=>`${e.name} — ${e.ruta}`) },
                { label:"Talleres Mecánica Pesada",icon:"🔧",color:"#94a3b8",rows:briefingData.talleres.map(t=>`${t.name} (${t.municipio})`) },
                { label:"Hoteles Estratégicos",icon:"🏨",color:"#fbbf24",rows:briefingData.hotelEstr.map(h=>`${h.name} — ${'★'.repeat(h.stars)} (${h.ciudad})`) },
                { label:"Hoteles de Carretera",icon:"🛏",color:"#34d399",rows:briefingData.hotelCtra.map(h=>`${h.name} (${h.municipio})`) },
              ]},
              { title:"INFRAESTRUCTURA LOGÍSTICA", items:[
                { label:"Peajes",icon:"$",color:"#f59e0b",rows:briefingData.peajes.map(p=>`${p.name} — ${p.ruta}`) },
                { label:"Básculas INVIAS",icon:"⚖",color:"#e879f9",rows:briefingData.basculas.map(b=>`${b.name} (${b.municipio})`) },
                { label:"Puentes Estratégicos",icon:"🌉",color:"#64748b",rows:briefingData.puentes.map(p=>`${p.name} — ${p.ruta}`) },
                { label:"Terminales de Carga",icon:"📦",color:"#d97706",rows:briefingData.terminales.map(t=>`${t.name} — ${t.operador}`) },
                { label:"Aeropuertos",icon:"✈",color:"#22d3ee",rows:briefingData.aeropuertos.map(a=>`${a.name} (${a.codigo}) — ${a.tipo}`) },
                { label:"Control DIAN",icon:"🛃",color:"#eab308",rows:briefingData.dian.map(d=>`${d.name} (${d.municipio})`) },
                { label:"Depósitos DIAN",icon:"🏛",color:"#8b5cf6",rows:briefingData.depositosDIAN.map(d=>`${d.name} — ${d.operador}`) },
              ]},
            ].map(section=>(
              <div key={section.title} style={{ padding:"16px 24px",borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize:10,letterSpacing:1,color:"#475569",fontWeight:700,marginBottom:10 }}>{section.title}</div>
                {section.items.filter(it=>it.rows.length>0).map(it=>(
                  <div key={it.label} style={{ marginBottom:10 }}>
                    <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:4 }}>
                      <span style={{ fontSize:12 }}>{it.icon}</span>
                      <span style={{ fontSize:11,fontWeight:700,color:it.color }}>{it.label}</span>
                      <span style={{ fontSize:10,background:`${it.color}22`,color:it.color,padding:"1px 6px",borderRadius:10 }}>{it.rows.length}</span>
                    </div>
                    {it.rows.map((row,ri)=>(
                      <div key={ri} style={{ fontSize:11,color:"#94a3b8",paddingLeft:18,lineHeight:1.7,borderLeft:`2px solid ${it.color}33` }}>• {row}</div>
                    ))}
                  </div>
                ))}
                {section.items.filter(it=>it.rows.length>0).length===0&&(
                  <div style={{ fontSize:12,color:"#334155",fontStyle:"italic" }}>Sin registros dentro del radio de {briefingData.buffer} km</div>
                )}
              </div>
            ))}
            <div style={{ padding:"12px 24px",fontSize:11,color:"#1e293b",textAlign:"center" }}>SafeNode S.A.S. · Inteligencia Logística · {briefingData.generadoEn}</div>
          </div>
        </div>
      )}

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
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:"rgba(255,255,255,0.35)", marginBottom:8 }}>
            Superposiciones <span style={{ color:"rgba(255,255,255,0.2)", fontWeight:400, textTransform:"none" }}>({OVERLAYS.length})</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:310, overflowY:"auto", paddingRight:2 }}>
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
        {(showPeajes||showPolicia||showHospitales||showBlockades||showEjercito||showFAC||showArmada||showBomberos||showBasculas||showHoteles||showHotelesCarretera||showEstaciones||showTelegramAlerts)&&(
          <div style={{ padding:"10px 14px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"rgba(255,255,255,0.35)",marginBottom:8 }}>Símbolos activos</div>
            <div style={{ display:"flex",flexDirection:"column",gap:5 }}>
              {showTelegramAlerts&&<div style={{ display:"flex",flexDirection:"column",gap:3,marginBottom:2 }}>
                <div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:12,height:12,borderRadius:"50%",background:"#ef4444",border:"2px solid #ef4444" }} /><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>🚨 Accidente @notiabel</span></div>
                <div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:12,height:12,borderRadius:"50%",background:"#f59e0b",border:"2px solid #f59e0b" }} /><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>🚫 Cierre de vía @notiabel</span></div>
                <div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:12,height:12,borderRadius:"50%",background:"#f97316",border:"2px solid #f97316" }} /><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>🚦 Trancón @notiabel</span></div>
                <div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:12,height:12,borderRadius:"50%",background:"#a855f7",border:"2px solid #a855f7" }} /><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>📢 Manifestación @notiabel</span></div>
              </div>}
              {showBlockades&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:12,height:12,borderRadius:"50%",background:"#ef4444",border:"2px solid #ef4444" }} /><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Bloqueo activo</span></div>}
              {showPeajes&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(245,158,11,0.9)",border:"2px solid #f59e0b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#fff" }}>$</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Peaje INVIAS/ANI</span></div>}
              {showPolicia&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(59,130,246,0.9)",border:"2px solid #3b82f6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#fff" }}>P</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Policía Carreteras</span></div>}
              {showHospitales&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(16,185,129,0.9)",border:"2px solid #10b981",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff" }}>✚</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Hospital referencia</span></div>}
              {showEjercito&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(132,204,22,0.92)",border:"2px solid #84cc16",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff" }}>★</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Ejército — Brigada/Batallón</span></div>}
              {showFAC&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(56,189,248,0.92)",border:"2px solid #38bdf8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff" }}>✈</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>FAC — Base / CACOM</span></div>}
              {showArmada&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(129,140,248,0.92)",border:"2px solid #818cf8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff" }}>⚓</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Armada — Base Naval/Fluvial</span></div>}
              {showBomberos&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(251,146,60,0.92)",border:"2px solid #fb923c",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11 }}>🔥</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Cuerpo de Bomberos — 119</span></div>}
              {showBasculas&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(232,121,249,0.92)",border:"2px solid #e879f9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff" }}>⚖</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Báscula de Pesaje INVIAS</span></div>}
              {showHoteles&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(251,191,36,0.92)",border:"2px solid #fbbf24",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>🏨</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Hotel Estratégico 4★–5★</span></div>}
              {showHotelesCarretera&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(52,211,153,0.92)",border:"2px solid #34d399",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>🛏</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Hotel de Carretera / Transportadores</span></div>}
              {showEstaciones&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(249,115,22,0.92)",border:"2px solid #f97316",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>⛽</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Estación de Servicio</span></div>}
              {showAeropuertos&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(34,211,238,0.92)",border:"2px solid #22d3ee",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>✈</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Aeropuerto Civil / Carga</span></div>}
              {showZonasFrancas&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(99,102,241,0.92)",border:"2px solid #6366f1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>🏭</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Zona Franca Permanente</span></div>}
              {showPuertosFluviales&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(14,165,233,0.92)",border:"2px solid #0ea5e9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>🚢</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Puerto Fluvial / Marítimo</span></div>}
              {showDIAN&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(234,179,8,0.92)",border:"2px solid #eab308",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>🛃</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Control DIAN — Aduana</span></div>}
              {showCruzRoja&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(251,113,133,0.92)",border:"2px solid #fb7185",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff" }}>✚</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Cruz Roja / Defensa Civil</span></div>}
              {showTalleres&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(148,163,184,0.92)",border:"2px solid #94a3b8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>🔧</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Taller Mecánica Pesada</span></div>}
              {showTerminales&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(217,119,6,0.92)",border:"2px solid #d97706",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>📦</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Terminal de Carga / Logística</span></div>}
              {showPuentes&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(100,116,139,0.92)",border:"2px solid #64748b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>🌉</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Puente Estratégico — Ruta nacional</span></div>}
              {showOleoductos&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(146,64,14,0.92)",border:"2px solid #92400e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>🛢</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Infraestructura Petrolera / Oleoducto</span></div>}
              {showPDET&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(251,146,60,0.92)",border:"2px solid #fb923c",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>🕊</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Municipio PDET — Post-conflicto</span></div>}
              {showMinasAP&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(220,38,38,0.92)",border:"2px solid #dc2626",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>💣</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Riesgo Minas Antipersonal (AICMA)</span></div>}
              {showINPEC&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(107,114,128,0.92)",border:"2px solid #6b7280",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>🔒</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Centro Penitenciario INPEC</span></div>}
              {showMineras&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(202,138,4,0.92)",border:"2px solid #ca8a04",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>⛏</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Zona Minera Activa — Legal / Ilegal</span></div>}
              {showDepositosDIAN&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(139,92,246,0.92)",border:"2px solid #8b5cf6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>🏛</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Depósito Habilitado DIAN</span></div>}
              {showCultivos&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(22,163,74,0.92)",border:"2px solid #16a34a",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>🌿</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Cultivos Ilícitos — SIMCI/UNODC</span></div>}
              {showGruposArmados&&<div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:18,height:18,borderRadius:"50%",background:"rgba(185,28,28,0.92)",border:"2px solid #b91c1c",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>⚔</div><span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Grupos Armados — ELN / FARC-EMC / Clan</span></div>}
              {showRutaBunBog&&<div style={{ display:"flex",alignItems:"center",gap:8 }}>
                <div style={{ width:28,height:4,background:"#f59e0b",borderRadius:2,marginLeft:4 }}/>
                <span style={{ fontSize:11,color:"rgba(255,255,255,0.6)" }}>Ruta Buenaventura→Bogotá (175 puntos)</span>
              </div>}
              {showRutaBunBog&&<div style={{ display:"flex",gap:8,flexWrap:"wrap",paddingLeft:4 }}>
                {[["#ef4444","Punto crítico"],["#38bdf8","Cuerpo de agua"],["#a78bfa","Infraestructura"],["#34d399","Centro poblado"]].map(([c,l])=>(
                  <div key={l} style={{ display:"flex",alignItems:"center",gap:4 }}>
                    <div style={{ width:10,height:10,borderRadius:"50%",background:c }}/>
                    <span style={{ fontSize:10,color:"rgba(255,255,255,0.5)" }}>{l}</span>
                  </div>
                ))}
              </div>}
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
