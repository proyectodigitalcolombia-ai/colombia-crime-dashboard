import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { RouteMapBuilder } from "./RouteMapBuilder";
import {
  useGetCrimesByDepartment,
  useGetCrimeTypes,
  useGetBlockades,
  useCreateBlockade,
  useDeleteBlockade,
  getGetBlockadesQueryKey,
} from "@workspace/api-client-react";
import type { Blockade } from "@workspace/api-client-react";
import {
  Shield, Truck, MapPin, ChevronRight,
  Moon, Radio, CloudRain, Users, Ban, Plus, X, Clock, BarChart2, FileText,
  AlertTriangle, RefreshCw, ExternalLink, Globe, Sparkles, CheckCircle2,
} from "lucide-react";
import { jsPDF } from "jspdf";
import { useWeather } from "@/hooks/useWeather";
import { useRoadConditions, useRoadConditionsByDepartment, useRefreshRoadConditions } from "@/hooks/useRoadConditions";

const GEO_URL =
  "https://gist.githubusercontent.com/john-guerra/43c7656821069d00dcbc/raw/be6a6e239cd5b5b803c6e7c2ec405b793a9064dd/colombia.geo.json";

const E = {
  bg: "#070c15", panel: "#0c1220", border: "rgba(255,255,255,0.07)",
  cyan: "#00d4ff", amber: "#f59e0b", red: "#ef4444", emerald: "#10b981",
  orange: "#f97316", purple: "#a855f7", pink: "#ec4899", textDim: "rgba(255,255,255,0.45)",
};

/* ══════════════════════════════════════════════════════════════════
   DATOS BASE POR DEPARTAMENTO
   ══════════════════════════════════════════════════════════════════ */

const NIGHT_RISK: Record<string, number> = {
  "Bogotá D.C.": 55,    "Cundinamarca": 70,   "Boyacá": 65,
  "Antioquia": 72,       "Caldas": 60,          "Risaralda": 58,
  "Quindío": 55,         "Valle del Cauca": 68, "Cauca": 75,
  "Nariño": 78,          "Tolima": 72,          "Huila": 68,
  "Meta": 80,            "Casanare": 75,        "Arauca": 82,
  "Santander": 65,       "Norte de Santander": 70, "Bolívar": 62,
  "Atlántico": 50,       "Córdoba": 65,         "Sucre": 60,
  "Cesar": 68,           "Magdalena": 65,       "La Guajira": 60,
  "Chocó": 75,           "Caquetá": 80,         "Putumayo": 82,
  "Guaviare": 78,        "Vichada": 70,         "Guainía": 65,
  "Vaupés": 70,          "Amazonas": 60,
};

const ARMED_GROUPS: Record<string, { level: number; groups: string[] }> = {
  "Bogotá D.C.":       { level: 0, groups: [] },
  "Cundinamarca":      { level: 1, groups: ["Disidencias FARC"] },
  "Boyacá":            { level: 1, groups: ["ELN"] },
  "Antioquia":         { level: 2, groups: ["Clan del Golfo", "Disidencias FARC"] },
  "Caldas":            { level: 1, groups: ["Disidencias FARC"] },
  "Risaralda":         { level: 1, groups: ["Disidencias FARC"] },
  "Quindío":           { level: 0, groups: [] },
  "Valle del Cauca":   { level: 2, groups: ["Disidencias FARC", "Clan del Golfo"] },
  "Cauca":             { level: 3, groups: ["Estado Mayor Central", "ELN"] },
  "Nariño":            { level: 3, groups: ["Estado Mayor Central", "ELN"] },
  "Tolima":            { level: 2, groups: ["Disidencias FARC"] },
  "Huila":             { level: 2, groups: ["Disidencias FARC"] },
  "Meta":              { level: 2, groups: ["Estado Mayor Central"] },
  "Casanare":          { level: 2, groups: ["Disidencias FARC"] },
  "Arauca":            { level: 3, groups: ["ELN", "Disidencias FARC"] },
  "Santander":         { level: 1, groups: ["ELN"] },
  "Norte de Santander":{ level: 2, groups: ["ELN", "Clan del Golfo"] },
  "Bolívar":           { level: 2, groups: ["Clan del Golfo", "ELN"] },
  "Atlántico":         { level: 1, groups: ["Clan del Golfo"] },
  "Córdoba":           { level: 3, groups: ["Clan del Golfo"] },
  "Sucre":             { level: 2, groups: ["Clan del Golfo"] },
  "Cesar":             { level: 2, groups: ["Clan del Golfo", "ELN"] },
  "Magdalena":         { level: 2, groups: ["Clan del Golfo"] },
  "La Guajira":        { level: 1, groups: ["Clan del Golfo"] },
  "Chocó":             { level: 3, groups: ["Clan del Golfo", "ELN"] },
  "Caquetá":           { level: 3, groups: ["Estado Mayor Central"] },
  "Putumayo":          { level: 3, groups: ["Estado Mayor Central"] },
  "Guaviare":          { level: 2, groups: ["Estado Mayor Central"] },
  "Vichada":           { level: 1, groups: ["Disidencias FARC"] },
  "Guainía":           { level: 1, groups: ["Disidencias FARC"] },
  "Vaupés":            { level: 1, groups: ["Disidencias FARC"] },
  "Amazonas":          { level: 0, groups: [] },
};

const CELL_SIGNAL: Record<string, "good" | "partial" | "poor"> = {
  "Bogotá D.C.": "good",    "Cundinamarca": "good",   "Boyacá": "partial",
  "Antioquia": "good",       "Caldas": "partial",      "Risaralda": "good",
  "Quindío": "good",         "Valle del Cauca": "good","Cauca": "partial",
  "Nariño": "partial",       "Tolima": "partial",      "Huila": "partial",
  "Meta": "partial",         "Casanare": "partial",    "Arauca": "poor",
  "Santander": "good",       "Norte de Santander": "partial", "Bolívar": "partial",
  "Atlántico": "good",       "Córdoba": "partial",     "Sucre": "partial",
  "Cesar": "partial",        "Magdalena": "partial",   "La Guajira": "partial",
  "Chocó": "poor",           "Caquetá": "poor",        "Putumayo": "poor",
  "Guaviare": "poor",        "Vichada": "poor",        "Guainía": "poor",
  "Vaupés": "poor",          "Amazonas": "poor",
};

const ROAD_CONDITION: Record<string, { score: "good" | "regular" | "difficult"; notes: string }> = {
  "Bogotá D.C.":       { score: "good",      notes: "Acceso urbano controlado" },
  "Cundinamarca":      { score: "regular",   notes: "Tramo La Vega: curvas y neblina" },
  "Boyacá":            { score: "regular",   notes: "Alto de Sote: deslizamientos en lluvias" },
  "Antioquia":         { score: "regular",   notes: "Túnel de Occidente: restricciones de altura" },
  "Caldas":            { score: "difficult", notes: "Vía Neira-Irra: derrumbes frecuentes" },
  "Risaralda":         { score: "good",      notes: "Doble calzada en buen estado" },
  "Quindío":           { score: "good",      notes: "Autopista del Café en buen estado" },
  "Valle del Cauca":   { score: "good",      notes: "Mayores desvíos en zonas rurales" },
  "Cauca":             { score: "difficult", notes: "Bloqueos frecuentes. Vía Popayán-Piendamó: alto riesgo" },
  "Nariño":            { score: "difficult", notes: "Vía Rumichaca: neblina y deslizamientos" },
  "Tolima":            { score: "regular",   notes: "Zona de Fresno: curvas pronunciadas" },
  "Huila":             { score: "regular",   notes: "Vía Neiva-Mocoa: tramos sin pavimentar" },
  "Meta":              { score: "good",      notes: "Llano abierto, atención en neblina de madrugada" },
  "Casanare":          { score: "regular",   notes: "Tramos sin doble calzada, vigilancia reducida" },
  "Arauca":            { score: "difficult", notes: "Vías en mal estado, sin doble calzada" },
  "Santander":         { score: "good",      notes: "Ruta del Sol en buen estado general" },
  "Norte de Santander":{ score: "regular",   notes: "Tramo Cúcuta-Tibú: zona de conflicto" },
  "Bolívar":           { score: "regular",   notes: "Transición Mompox: barcazas en temporada seca" },
  "Atlántico":         { score: "good",      notes: "Acceso a puertos en buen estado" },
  "Córdoba":           { score: "regular",   notes: "Accesos rurales en mal estado en invierno" },
  "Sucre":             { score: "regular",   notes: "Inundaciones frecuentes en temporada" },
  "Cesar":             { score: "good",      notes: "Troncal del Caribe en buen estado" },
  "Magdalena":         { score: "regular",   notes: "Zona de Santa Marta: tráfico portuario alto" },
  "La Guajira":        { score: "regular",   notes: "Accesos secundarios sin pavimentar" },
  "Chocó":             { score: "difficult", notes: "Sin vías primarias pavimentadas en mayoría" },
  "Caquetá":           { score: "difficult", notes: "Vías en mal estado, lluvias frecuentes" },
  "Putumayo":          { score: "difficult", notes: "Tramos inestables, deslizamientos frecuentes" },
  "Guaviare":          { score: "difficult", notes: "Acceso principalmente fluvial o aéreo" },
  "Vichada":           { score: "difficult", notes: "Sin vías primarias" },
  "Guainía":           { score: "difficult", notes: "Sin vías primarias" },
  "Vaupés":            { score: "difficult", notes: "Sin vías terrestres principales" },
  "Amazonas":          { score: "difficult", notes: "Acceso fluvial/aéreo únicamente" },
};

/* ══════════════════════════════════════════════════════════════════
   BLOQUEOS VIALES COMUNITARIOS
   Fuentes: INVIAS, Policía de Carreteras, medios regionales
   Nivel: 0=ninguno, 1=esporádico, 2=frecuente, 3=muy frecuente/activo
   ══════════════════════════════════════════════════════════════════ */

const BLOCKADE_HISTORY: Record<string, { level: number; avgDurationHours: number; hotspot: string; lastEvent: string; cause: string }> = {
  "Bogotá D.C.":       { level: 0, avgDurationHours: 0,  hotspot: "N/A",                               lastEvent: "Sin registro", cause: "" },
  "Cundinamarca":      { level: 1, avgDurationHours: 4,  hotspot: "Vía Bogotá-Girardot km 40",         lastEvent: "Nov 2025",     cause: "Protestas comunidades campesinas" },
  "Boyacá":            { level: 1, avgDurationHours: 6,  hotspot: "Cruce de Chiquinquirá",             lastEvent: "Oct 2025",     cause: "Paro minero" },
  "Antioquia":         { level: 2, avgDurationHours: 12, hotspot: "Vía Medellín-Quibdó (El Tigre)",    lastEvent: "Ene 2026",     cause: "Comunidades indígenas y campesinas" },
  "Caldas":            { level: 1, avgDurationHours: 5,  hotspot: "Ruta Manizales-Chinchiná",          lastEvent: "Sep 2025",     cause: "Reclamos comunidad caficultora" },
  "Risaralda":         { level: 1, avgDurationHours: 3,  hotspot: "Vía Pereira-Armenia",               lastEvent: "Ago 2025",     cause: "Manifestaciones transportistas" },
  "Quindío":           { level: 0, avgDurationHours: 0,  hotspot: "N/A",                               lastEvent: "Sin registro", cause: "" },
  "Valle del Cauca":   { level: 2, avgDurationHours: 18, hotspot: "Vía Cali-Buenaventura km 50-80",    lastEvent: "Feb 2026",     cause: "Comunidades afro y portuarios" },
  "Cauca":             { level: 3, avgDurationHours: 72, hotspot: "Panamericana km 1-60 (Piendamó-Santander)", lastEvent: "Mar 2026", cause: "Comunidades indígenas NASA — histórico persistente" },
  "Nariño":            { level: 2, avgDurationHours: 36, hotspot: "Vía Pasto-Rumichaca, acceso frontera", lastEvent: "Feb 2026",   cause: "Protestas cocaleras y paros regionales" },
  "Tolima":            { level: 2, avgDurationHours: 10, hotspot: "Vía Ibagué-Espinal",                lastEvent: "Nov 2025",     cause: "Paro arrocero / cañero" },
  "Huila":             { level: 1, avgDurationHours: 8,  hotspot: "Vía Neiva-La Plata",                lastEvent: "Oct 2025",     cause: "Comunidades campesinas" },
  "Meta":              { level: 1, avgDurationHours: 5,  hotspot: "Vía al Llano km 55 (Pipiral)",      lastEvent: "Dic 2025",     cause: "Accidentes + paro transportadores" },
  "Casanare":          { level: 1, avgDurationHours: 6,  hotspot: "Ruta Yopal-Aguazul",                lastEvent: "Sep 2025",     cause: "Protestas sector petrolero" },
  "Arauca":            { level: 2, avgDurationHours: 48, hotspot: "Vía Arauca-Tame",                   lastEvent: "Ene 2026",     cause: "Paros armados ELN / cierres de orden público" },
  "Santander":         { level: 1, avgDurationHours: 4,  hotspot: "Ruta del Sol tramo II",             lastEvent: "Oct 2025",     cause: "Manifestaciones sector agropecuario" },
  "Norte de Santander":{ level: 2, avgDurationHours: 24, hotspot: "Vía Ocaña-Cúcuta, Tibú-Convención",lastEvent: "Feb 2026",     cause: "Paros cocaleros / cierres de orden público" },
  "Bolívar":           { level: 1, avgDurationHours: 8,  hotspot: "Troncal de Occidente km 90-120",    lastEvent: "Nov 2025",     cause: "Comunidades mineras" },
  "Atlántico":         { level: 1, avgDurationHours: 3,  hotspot: "Autopista Barranquilla-Cartagena",  lastEvent: "Ago 2025",     cause: "Manifestaciones transportistas" },
  "Córdoba":           { level: 2, avgDurationHours: 16, hotspot: "Vía Montería-Planeta Rica",         lastEvent: "Ene 2026",     cause: "Paros campesinos y ganaderos" },
  "Sucre":             { level: 1, avgDurationHours: 6,  hotspot: "Troncal Occidental sector Sincelejo",lastEvent: "Sep 2025",    cause: "Protestas agropecuarias" },
  "Cesar":             { level: 1, avgDurationHours: 5,  hotspot: "Ruta Valledupar-Bosconia",          lastEvent: "Oct 2025",     cause: "Sector minero-carbonero" },
  "Magdalena":         { level: 1, avgDurationHours: 4,  hotspot: "Troncal Caribe zona bananera",      lastEvent: "Nov 2025",     cause: "Paro bananero / comunidades" },
  "La Guajira":        { level: 1, avgDurationHours: 8,  hotspot: "Vía Riohacha-Maicao",               lastEvent: "Dic 2025",     cause: "Comunidades Wayuu / contrabandistas" },
  "Chocó":             { level: 2, avgDurationHours: 48, hotspot: "Vía Quibdó-Medellín (El Tigre)",    lastEvent: "Feb 2026",     cause: "Comunidades afro + paros armados" },
  "Caquetá":           { level: 2, avgDurationHours: 36, hotspot: "Vía Florencia-Neiva",               lastEvent: "Ene 2026",     cause: "Paros cocaleros / orden público" },
  "Putumayo":          { level: 2, avgDurationHours: 30, hotspot: "Vía Mocoa-Puerto Asís",             lastEvent: "Feb 2026",     cause: "Protestas cocaleras / paro petrolero" },
  "Guaviare":          { level: 1, avgDurationHours: 12, hotspot: "Vía San José-Villavicencio",        lastEvent: "Sep 2025",     cause: "Paros colonos / orden público" },
  "Vichada":           { level: 0, avgDurationHours: 0,  hotspot: "N/A",                               lastEvent: "Sin registro", cause: "" },
  "Guainía":           { level: 0, avgDurationHours: 0,  hotspot: "N/A",                               lastEvent: "Sin registro", cause: "" },
  "Vaupés":            { level: 0, avgDurationHours: 0,  hotspot: "N/A",                               lastEvent: "Sin registro", cause: "" },
  "Amazonas":          { level: 0, avgDurationHours: 0,  hotspot: "N/A",                               lastEvent: "Sin registro", cause: "" },
};

/* ── Corredores ── */
interface Corridor {
  id: string; name: string; shortName: string; via: string;
  departments: string[]; icon: string;
}

const CORRIDORS: Corridor[] = [
  { id: "bog-med",  name: "Bogotá → Medellín",                  shortName: "Bog · Med",      via: "Ruta 60 / Autopista Medellín",         departments: ["Bogotá D.C.", "Cundinamarca", "Boyacá", "Caldas", "Antioquia"],                        icon: "🔴" },
  { id: "bog-cali", name: "Bogotá → Cali",                     shortName: "Bog · Cali",     via: "Ruta 40 / Autopista Panamericana",     departments: ["Bogotá D.C.", "Cundinamarca", "Tolima", "Quindío", "Valle del Cauca"],                    icon: "🟡" },
  { id: "bog-baq",  name: "Bogotá → Barranquilla / Cartagena", shortName: "Bog · Costa",    via: "Ruta del Sol (Ruta 45A)",              departments: ["Bogotá D.C.", "Cundinamarca", "Boyacá", "Santander", "Bolívar", "Atlántico"],             icon: "🔵" },
  { id: "bog-buc",  name: "Bogotá → Bucaramanga",               shortName: "Bog · Buc",      via: "Ruta del Sol Tramo I-II",              departments: ["Bogotá D.C.", "Cundinamarca", "Boyacá", "Santander"],                                    icon: "🟢" },
  { id: "bog-cuc",  name: "Bogotá → Cúcuta",                    shortName: "Bog · Cúcuta",   via: "Ruta 45A / Ruta 55",                   departments: ["Bogotá D.C.", "Cundinamarca", "Boyacá", "Santander", "Norte de Santander"],               icon: "🟤" },
  { id: "bog-vil",  name: "Bogotá → Villavicencio / Llanos",    shortName: "Bog · Llanos",   via: "Ruta 40 / Vía al Llano",               departments: ["Bogotá D.C.", "Cundinamarca", "Meta"],                                                   icon: "🟠" },
  { id: "bog-pas",  name: "Bogotá → Pasto / Ipiales",           shortName: "Bog · Sur",      via: "Ruta 25 / Panamericana Sur",           departments: ["Bogotá D.C.", "Cundinamarca", "Tolima", "Huila", "Cauca", "Nariño"],                      icon: "🟣" },
  { id: "med-baq",  name: "Medellín → Barranquilla",            shortName: "Med · Costa",    via: "Ruta 62 / Troncal Occidental",         departments: ["Antioquia", "Córdoba", "Sucre", "Bolívar", "Atlántico"],                                  icon: "⚪" },
  { id: "med-cali", name: "Medellín → Cali",                    shortName: "Med · Cali",     via: "Ruta 25 / Autopista del Café",         departments: ["Antioquia", "Risaralda", "Quindío", "Valle del Cauca"],                                   icon: "🔶" },
  { id: "cali-bue", name: "Cali → Buenaventura (Puerto)",       shortName: "Cali · Puerto",  via: "Ruta 40 / Vía Pacífico",               departments: ["Valle del Cauca"],                                                                        icon: "🔷" },
  { id: "bog-yop",  name: "Bogotá → Yopal / Casanare",          shortName: "Bog · Casanare", via: "Ruta 40 / Marginal del Llano",         departments: ["Bogotá D.C.", "Cundinamarca", "Boyacá", "Casanare"],                                      icon: "🟫" },
  { id: "baq-bog",  name: "Barranquilla → Bogotá",              shortName: "Costa · Bog",    via: "Ruta del Sol completa",                departments: ["Atlántico", "Bolívar", "Cesar", "Santander", "Boyacá", "Cundinamarca", "Bogotá D.C."],    icon: "⭐" },
];

/* ── Helpers ── */
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[,.]/g, "").toLowerCase().trim();
}
const BOGOTA_ALIASES = new Set(["bogota dc","bogota d.c.","bogota","santa fe de bogota"]);
function normKey(s: string): string { const n = normalize(s); return BOGOTA_ALIASES.has(n) ? "bogota dc" : n; }
function normGeo(raw: string): string { const n = normalize(raw); return BOGOTA_ALIASES.has(n) ? "bogota dc" : n; }

function pirataRisk(count: number): { label: string; color: string; bg: string } {
  if (count === 0)  return { label: "SIN DATOS",  color: "#6b7280", bg: "rgba(107,114,128,0.12)" };
  if (count < 5)    return { label: "BAJO",        color: E.emerald,  bg: "rgba(16,185,129,0.12)" };
  if (count < 20)   return { label: "MODERADO",    color: E.amber,    bg: "rgba(245,158,11,0.12)" };
  if (count < 60)   return { label: "ALTO",        color: E.orange,   bg: "rgba(249,115,22,0.12)" };
  return             { label: "CRÍTICO",     color: E.red,      bg: "rgba(239,68,68,0.12)" };
}
function pirataFill(count: number): string {
  if (count === 0) return "#192438"; if (count < 5) return "#1a6a50";
  if (count < 20) return "#c07a00"; if (count < 60) return "#c04000";
  return "#cc1000";
}
function nightLabel(pct: number): { label: string; color: string } {
  if (pct < 55) return { label: `${pct}% — Bajo`,       color: E.emerald };
  if (pct < 68) return { label: `${pct}% — Moderado`,   color: E.amber };
  if (pct < 78) return { label: `${pct}% — Alto`,       color: E.orange };
  return          { label: `${pct}% — Muy alto`,   color: E.red };
}
function armedLabel(level: number): { label: string; color: string } {
  if (level === 0) return { label: "Sin presencia",  color: E.emerald };
  if (level === 1) return { label: "Baja",           color: "#8bc34a" };
  if (level === 2) return { label: "Moderada",       color: E.amber };
  return            { label: "Alta",            color: E.red };
}
function signalLabel(s: "good"|"partial"|"poor"): { label: string; color: string } {
  if (s === "good")    return { label: "Buena cobertura",   color: E.emerald };
  if (s === "partial") return { label: "Cobertura parcial", color: E.amber };
  return                { label: "Sin cobertura",      color: E.red };
}
function roadLabel(s: "good"|"regular"|"difficult"): { label: string; color: string } {
  if (s === "good")    return { label: "Buen estado",    color: E.emerald };
  if (s === "regular") return { label: "Estado regular", color: E.amber };
  return                { label: "Difícil / cierre",color: E.red };
}
function blockadeLabel(level: number): { label: string; color: string; bg: string } {
  if (level === 0) return { label: "Sin registro",   color: E.emerald, bg: "rgba(16,185,129,0.1)" };
  if (level === 1) return { label: "Esporádico",     color: E.amber,   bg: "rgba(245,158,11,0.1)" };
  if (level === 2) return { label: "Frecuente",      color: E.orange,  bg: "rgba(249,115,22,0.1)" };
  return            { label: "Muy frecuente",   color: E.red,     bg: "rgba(239,68,68,0.1)" };
}
const CAUSE_LABELS: Record<string, string> = {
  comunidad:       "🏘 Comunidad / Exigencias locales",
  protesta_social: "✊ Protesta Social",
  paro_camionero:  "🚛 Paro Camionero",
  grupos_ilegales: "⚔ Grupos ilegales / paro armado",
  otro:            "📌 Otro motivo",
};
const STATUS_LABELS: Record<BlockadeRecord["status"], { label: string; color: string }> = {
  activo:       { label: "ACTIVO",       color: E.red },
  levantado:    { label: "LEVANTADO",    color: E.emerald },
  intermitente: { label: "INTERMITENTE", color: E.amber },
};

function compositeScore(dept: string, pirataCount: number): number {
  const pScore = Math.min(pirataCount / 80, 1) * 35;
  const aScore = (ARMED_GROUPS[dept]?.level ?? 0) / 3 * 25;
  const nScore = ((NIGHT_RISK[dept] ?? 60) - 50) / 35 * 15;
  const rScore = ROAD_CONDITION[dept]?.score === "difficult" ? 10 : ROAD_CONDITION[dept]?.score === "regular" ? 5 : 0;
  const bScore = (BLOCKADE_HISTORY[dept]?.level ?? 0) / 3 * 15;
  return Math.min(100, Math.round(pScore + aScore + nScore + rScore + bScore));
}
function compositeLabel(score: number): { label: string; color: string; bg: string } {
  if (score < 20) return { label: "BAJO",     color: E.emerald, bg: "rgba(16,185,129,0.12)" };
  if (score < 45) return { label: "MODERADO", color: E.amber,   bg: "rgba(245,158,11,0.12)" };
  if (score < 70) return { label: "ALTO",     color: E.orange,  bg: "rgba(249,115,22,0.12)" };
  return           { label: "CRÍTICO",  color: E.red,     bg: "rgba(239,68,68,0.12)"  };
}

function buildRecommendations(corridor: Corridor, pirataMap: Record<string, number>, userBlockades: BlockadeRecord[]): string[] {
  const recs: string[] = [];
  const nightMax     = Math.max(...corridor.departments.map(d => NIGHT_RISK[d] ?? 60));
  const armedMax     = Math.max(...corridor.departments.map(d => ARMED_GROUPS[d]?.level ?? 0));
  const roadDiff     = corridor.departments.some(d => ROAD_CONDITION[d]?.score === "difficult");
  const poorSig      = corridor.departments.some(d => CELL_SIGNAL[d] === "poor");
  const blockadeMax  = Math.max(...corridor.departments.map(d => BLOCKADE_HISTORY[d]?.level ?? 0));
  const totalPirata  = corridor.departments.reduce((s, d) => s + (pirataMap[normKey(d)] ?? 0), 0);
  const activeBlocks = userBlockades.filter(b => b.corridorId === corridor.id && b.status === "activo");

  if (activeBlocks.length > 0) recs.push(`🚨 HAY ${activeBlocks.length} BLOQUEO(S) ACTIVO(S) REGISTRADO(S) EN ESTE CORREDOR — verificar antes de salir`);
  if (nightMax >= 75) recs.push("⛔ Evitar tránsito entre 10 PM y 5 AM — alta incidencia nocturna en este corredor");
  if (nightMax >= 60 && nightMax < 75) recs.push("⚠ Reducir velocidad y mantener comunicación constante en horario nocturno");
  if (armedMax >= 3) recs.push("🚨 Coordinar con la Policía Nacional antes de transitar — presencia alta de grupos armados");
  if (armedMax === 2) recs.push("📋 Registrar el despacho en la Policía de Carreteras (DIJIN) antes de salir");
  if (blockadeMax >= 3) recs.push("🛑 Consultar estado de vía en INVIAS y redes de transportadores — corredor con bloqueos muy frecuentes");
  if (blockadeMax === 2) recs.push("📞 Contactar asociaciones de transportadores locales para alertas de bloqueos en ruta");
  if (totalPirata >= 30) recs.push("🛡 Considerar escolta de seguridad privada para cargas de valor alto");
  if (totalPirata >= 10) recs.push("📡 Activar GPS con reporte en tiempo real y monitoreo desde centro de control");
  if (roadDiff) recs.push("🔧 Verificar condición vial con INVIAS antes del viaje — riesgo de cierres por derrumbes");
  if (poorSig) recs.push("📻 Llevar radio de comunicación — hay tramos sin cobertura celular en este corredor");
  if (recs.length === 0) recs.push("✅ Corredor de bajo riesgo compuesto. Mantener protocolos estándar de seguridad");
  return recs;
}

/* ══════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ══════════════════════════════════════════════════════════════════ */
interface Props { dark?: boolean }

interface FormData {
  corridorId: string; department: string; date: string;
  cause: string; location: string;
  durationHours: number | null; status: string; notes: string; reporter: string;
}
const EMPTY_FORM = (corridorId = "", department = ""): FormData => ({
  corridorId, department, date: new Date().toISOString().split("T")[0],
  cause: "comunidad", location: "", durationHours: null, status: "activo", notes: "", reporter: "",
});

export function RouteAnalyzer({ dark = true }: Props) {
  const queryClient = useQueryClient();
  const [selectedCorridor, setSelectedCorridor] = useState<Corridor | null>(null);
  const [activeView,       setActiveView]        = useState<"pirateria" | "compuesto">("compuesto");
  const [activeTab,        setActiveTab]         = useState<"risk" | "mapaVial" | "blockades">("risk");
  const [hovered,          setHovered]           = useState<{ name: string; pirataCount: number; score: number; ex: number; ey: number } | null>(null);
  const [showForm,         setShowForm]          = useState(false);
  const [formData,         setFormData]          = useState<FormData>(EMPTY_FORM());
  const [formError,        setFormError]         = useState("");
  const [urlInput,         setUrlInput]          = useState("");
  const [urlLoading,       setUrlLoading]        = useState(false);
  const [urlResult,        setUrlResult]         = useState<{ count: number; message: string } | null>(null);
  const [urlInserted,      setUrlInserted]       = useState<any[]>([]);
  const [urlError,         setUrlError]          = useState("");
  const [customRouteMode,  setCustomRouteMode]   = useState(false);
  const [customDepts,      setCustomDepts]       = useState<string[]>([]);

  const { data: weatherMap = {} } = useWeather(selectedCorridor?.departments ?? []);
  const { conditions: officialClosures, meta: rcMeta, isLoading: rcLoading } =
    useRoadConditionsByDepartment(selectedCorridor?.departments ?? []);
  const refreshRcMutation = useRefreshRoadConditions();

  /* ── Real road conditions (all depts) from policia.gov.co cache ── */
  const { data: allRoadData } = useRoadConditions();
  const realRoadDeptMap = useMemo<Record<string, "good" | "regular" | "difficult">>(() => {
    const m: Record<string, "good" | "regular" | "difficult"> = {};
    for (const c of allRoadData?.conditions ?? []) {
      const dept = c.department;
      if (!dept) continue;
      const cur = m[dept];
      const next = c.conditionCode === "cierre_total" ? "difficult"
                 : c.conditionCode === "cierre_parcial" || c.conditionCode === "desvio" ? "regular"
                 : "good";
      if (!cur || next === "difficult" || (next === "regular" && cur === "good")) m[dept] = next;
    }
    return m;
  }, [allRoadData]);

  /* ── Armed groups from API (refreshed every 4h) ── */
  const BASE_URL_RAW = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  const { data: armedGroupsApi } = useQuery<{ groups: { shortName: string; presence: { department: string; level: string }[] }[] }>({
    queryKey: ["armed-groups"],
    queryFn: () => fetch(`${BASE_URL_RAW}/api/armed-groups`, { credentials: "include" }).then(r => r.json()),
    staleTime: 1000 * 60 * 60 * 4,
  });
  const armedDeptMap = useMemo<Record<string, { level: number; groups: string[] }>>(() => {
    if (!armedGroupsApi?.groups?.length) return ARMED_GROUPS;
    const m: Record<string, { level: number; groups: string[] }> = {};
    for (const grp of armedGroupsApi.groups) {
      for (const p of grp.presence) {
        if (!m[p.department]) m[p.department] = { level: 0, groups: [] };
        const lvl = p.level === "alta" ? 3 : p.level === "media" ? 2 : 1;
        if (lvl > m[p.department].level) m[p.department].level = lvl;
        if (!m[p.department].groups.includes(grp.shortName)) m[p.department].groups.push(grp.shortName);
      }
    }
    return m;
  }, [armedGroupsApi]);

  const panelBg   = dark ? E.panel   : "#ffffff";
  const textMain  = dark ? "#e2eaf4" : "#1a2a3a";
  const textMuted = dark ? E.textDim : "#64748b";
  const borderC   = dark ? E.border  : "rgba(0,0,0,0.07)";

  const { data: crimeTypesRaw = [] } = useGetCrimeTypes();
  const pirataId = useMemo(
    () => (crimeTypesRaw as any[]).find((c: any) => normalize(c.name).includes("pirateria"))?.id,
    [crimeTypesRaw],
  );
  const { data: deptDataRaw = [] } = useGetCrimesByDepartment({ year: 2026, crimeType: pirataId ?? undefined });

  const pirataMap = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const row of deptDataRaw as any[]) { const k = normKey(row.department); m[k] = (m[k] ?? 0) + row.totalCount; }
    return m;
  }, [deptDataRaw]);

  /* ── Blockades from DB (fetches all; filter client-side per corridor) ── */
  const { data: allBlockades = [] } = useGetBlockades(undefined, {
    query: { refetchInterval: 30000 },
  });

  const createBlockadeMutation = useCreateBlockade({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBlockadesQueryKey() });
        setShowForm(false);
        setFormData(EMPTY_FORM());
        setActiveTab("blockades");
      },
    },
  });

  const deleteBlockadeMutation = useDeleteBlockade({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBlockadesQueryKey() }),
    },
  });

  const [regeocoding, setRegeocoding] = useState<Set<number>>(new Set());
  const [regeocodeDone, setRegeocodeDone] = useState<Set<number>>(new Set());

  const handleRegeocode = useCallback(async (id: number) => {
    setRegeocoding(prev => new Set(prev).add(id));
    try {
      const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
      const resp = await fetch(`${BASE}/api/blockades/${id}/regeocode`, {
        method: "PATCH",
        credentials: "include",
      });
      if (resp.ok) {
        await queryClient.invalidateQueries({ queryKey: getGetBlockadesQueryKey() });
        setRegeocodeDone(prev => new Set(prev).add(id));
        setTimeout(() => setRegeocodeDone(prev => { const s = new Set(prev); s.delete(id); return s; }), 3000);
      }
    } finally {
      setRegeocoding(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }, [queryClient]);

  const handleUrlImport = useCallback(async () => {
    if (!urlInput.trim()) return;
    setUrlLoading(true);
    setUrlError("");
    setUrlResult(null);
    try {
      const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
      const resp = await fetch(`${BASE}/api/blockades/from-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) { setUrlError(data.error || "Error al procesar la URL"); return; }
      setUrlResult({ count: data.inserted?.length ?? 0, message: data.message });
      setUrlInserted(data.inserted ?? []);
      if ((data.inserted?.length ?? 0) > 0) {
        queryClient.invalidateQueries({ queryKey: getGetBlockadesQueryKey() });
        setUrlInput("");
      }
    } catch (e: any) {
      setUrlError(e.message || "Error de red");
    } finally {
      setUrlLoading(false);
    }
  }, [urlInput, queryClient]);

  const userBlockades: Blockade[] = Array.isArray(allBlockades) ? allBlockades as Blockade[] : [];

  /* ── Real blockade level per dept from DB ── */
  const blockadeDeptMap = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const blk of userBlockades) {
      if (blk.status === "activo") m[blk.department] = (m[blk.department] ?? 0) + 1;
      else if (blk.status === "intermitente" && !m[blk.department]) m[blk.department] = 0.5 as number;
    }
    return m;
  }, [userBlockades]);

  /* ── Unified score function using real data ── */
  const scoreForDept = useCallback((dept: string, pirataCount: number): number => {
    const pScore = Math.min(pirataCount / 80, 1) * 35;
    const aScore = (armedDeptMap[dept]?.level ?? 0) / 3 * 25;
    const nScore = ((NIGHT_RISK[dept] ?? 60) - 50) / 35 * 15;
    const roadScore = realRoadDeptMap[dept] ?? ROAD_CONDITION[dept]?.score ?? "regular";
    const rScore = roadScore === "difficult" ? 10 : roadScore === "regular" ? 5 : 0;
    const blkLvl = blockadeDeptMap[dept] !== undefined
      ? Math.min(3, Math.ceil(blockadeDeptMap[dept]))
      : 0;
    const bScore = blkLvl / 3 * 15;
    return Math.min(100, Math.round(pScore + aScore + nScore + rScore + bScore));
  }, [armedDeptMap, blockadeDeptMap, realRoadDeptMap]);

  const routeSet = useMemo(() => !selectedCorridor ? new Set<string>() : new Set(selectedCorridor.departments.map(d => normKey(d))), [selectedCorridor]);

  const routeStats = useMemo(() => {
    if (!selectedCorridor) return { total: 0, avgScore: 0 };
    const total    = selectedCorridor.departments.reduce((s, d) => s + (pirataMap[normKey(d)] ?? 0), 0);
    const avgScore = Math.round(selectedCorridor.departments.reduce((s, d) => s + scoreForDept(d, pirataMap[normKey(d)] ?? 0), 0) / selectedCorridor.departments.length);
    return { total, avgScore };
  }, [selectedCorridor, pirataMap, scoreForDept]);

  const recommendations = useMemo(() => {
    if (!selectedCorridor) return [];
    const nightMax   = Math.max(...selectedCorridor.departments.map(d => NIGHT_RISK[d] ?? 60));
    const armedMax   = Math.max(...selectedCorridor.departments.map(d => armedDeptMap[d]?.level ?? 0));
    const roadDiff   = selectedCorridor.departments.some(d => (realRoadDeptMap[d] ?? ROAD_CONDITION[d]?.score) === "difficult");
    const poorSig    = selectedCorridor.departments.some(d => CELL_SIGNAL[d] === "poor");
    const blkActive  = userBlockades.filter(b => b.corridorId === selectedCorridor.id && b.status === "activo");
    const totalPirat = selectedCorridor.departments.reduce((s, d) => s + (pirataMap[normKey(d)] ?? 0), 0);
    const recs: string[] = [];
    if (blkActive.length > 0) recs.push(`🚨 HAY ${blkActive.length} BLOQUEO(S) ACTIVO(S) REGISTRADO(S) EN ESTE CORREDOR — verificar antes de salir`);
    if (nightMax >= 75) recs.push("⛔ Evitar tránsito entre 10 PM y 5 AM — alta incidencia nocturna en este corredor");
    if (nightMax >= 60 && nightMax < 75) recs.push("⚠ Reducir velocidad y mantener comunicación constante en horario nocturno");
    if (armedMax >= 3) recs.push("🔴 Presencia crítica de grupos armados — consultar inteligencia actualizada antes del despacho");
    if (armedMax === 2) recs.push("🟠 Grupos armados con actividad media en el corredor — vigilancia reforzada");
    if (roadDiff) recs.push("🔧 Vías en condición difícil o cierre oficial — verificar INVIAS y Policía de Carreteras");
    if (poorSig) recs.push("📵 Zonas sin señal celular — llevar radio satelital o plan de contingencia offline");
    if (totalPirat > 150) recs.push("🚛 Alta concentración de piratería terrestre — convoy recomendado");
    else if (totalPirat > 60) recs.push("🚛 Incidencia moderada de piratería — reforzar seguimiento GPS en tránsito");
    if (recs.length === 0) recs.push("✅ Corredor sin alertas críticas activas — mantener protocolos estándar");
    return recs;
  }, [selectedCorridor, armedDeptMap, blockadeDeptMap, realRoadDeptMap, userBlockades, pirataMap]);

  const corridorBlockades = useMemo(() =>
    selectedCorridor ? userBlockades.filter(b => b.corridorId === selectedCorridor.id) : [],
    [selectedCorridor, userBlockades],
  );

  function corridorCardRisk(c: Corridor) {
    const total = c.departments.reduce((s, d) => s + (pirataMap[normKey(d)] ?? 0), 0);
    return pirataRisk(total / c.departments.length);
  }

  function getMapFill(dept: string, onRoute: boolean): string {
    if (!onRoute) return dark ? "#131e2e" : "#c8d8e8";
    const count = pirataMap[normKey(dept)] ?? 0;
    if (activeView === "pirateria") return pirataFill(count);
    const score = scoreForDept(dept, count);
    if (score < 20) return "#1a6a50"; if (score < 45) return "#c07a00";
    if (score < 70) return "#c04000"; return "#cc1000";
  }

  /* ── Canonical dept lookup for custom route builder ── */
  const ALL_DEPT_KEYS = Object.keys(ARMED_GROUPS);
  function findCanonicalDept(rawGeo: string): string {
    const n = normGeo(rawGeo);
    return ALL_DEPT_KEYS.find(k => normKey(k) === n) ?? rawGeo;
  }

  const generatePDF = useCallback(() => {
    if (!selectedCorridor) return;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const cyan = [0, 180, 220] as [number, number, number];
    const pink = [220, 60, 140] as [number, number, number];
    const dark2 = [20, 30, 50] as [number, number, number];
    const gray  = [100, 110, 130] as [number, number, number];
    const W = 210, margin = 14;
    let y = 0;

    /* Header */
    doc.setFillColor(...dark2);
    doc.rect(0, 0, W, 30, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text("INFORME DE RIESGO DE CORREDOR", margin, 12);
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.setTextColor(...cyan);
    doc.text("Sistema de Gestión de Piratería Terrestre — Colombia 2026", margin, 20);
    doc.setTextColor(160, 170, 190);
    doc.text(`Generado: ${new Date().toLocaleString("es-CO", { dateStyle: "full", timeStyle: "short" })}`, margin, 26);
    y = 38;

    /* Corridor name + score */
    doc.setTextColor(...dark2);
    doc.setFontSize(13); doc.setFont("helvetica", "bold");
    doc.text(selectedCorridor.name, margin, y);
    const scoreLabel = compositeLabel(routeStats.avgScore);
    doc.setFontSize(10); doc.setTextColor(...cyan);
    doc.text(`Score compuesto: ${routeStats.avgScore}/100  ·  Piratería 2026: ${routeStats.total} casos`, margin, y + 7);
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.setTextColor(...gray);
    doc.text(`Nivel general: ${scoreLabel.label}  ·  Departamentos: ${selectedCorridor.departments.join(" → ")}`, margin, y + 14);
    y += 24;

    /* Active blockades banner */
    const activeBlks2 = corridorBlockades.filter(b => b.status === "activo");
    if (activeBlks2.length > 0) {
      doc.setFillColor(180, 30, 100);
      doc.roundedRect(margin, y, W - margin * 2, 9, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9); doc.setFont("helvetica", "bold");
      doc.text(`[!]  ${activeBlks2.length} BLOQUEO(S) ACTIVO(S) REGISTRADO(S) EN ESTE CORREDOR`, margin + 3, y + 6);
      y += 14;
    }

    /* Divider */
    doc.setDrawColor(...cyan);
    doc.setLineWidth(0.4);
    doc.line(margin, y, W - margin, y);
    y += 6;

    /* Risk factors table header */
    doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...dark2);
    doc.text("FACTORES DE RIESGO POR DEPARTAMENTO", margin, y);
    y += 7;

    const headers = ["Departamento", "Score", "Piratería", "Noc.", "G.Arm.", "Señal", "Vía"];
    const colX = [margin, margin+40, margin+62, margin+84, margin+104, margin+122, margin+140];

    doc.setFontSize(7); doc.setFont("helvetica", "bold");
    doc.setFillColor(230, 240, 250); doc.rect(margin, y, W - margin * 2, 7, "F");
    headers.forEach((h, i) => { doc.setTextColor(50, 70, 100); doc.text(h, colX[i], y + 5); });
    y += 9;

    selectedCorridor.departments.forEach((dept, idx) => {
      const count = pirataMap[normKey(dept)] ?? 0;
      const score = scoreForDept(dept, count);
      const clabel = compositeLabel(score);
      const night  = nightLabel(NIGHT_RISK[dept] ?? 60);
      const armed  = armedLabel(armedDeptMap[dept]?.level ?? 0);
      const signal = signalLabel(CELL_SIGNAL[dept] ?? "partial");
      const road   = roadLabel((realRoadDeptMap[dept] ?? ROAD_CONDITION[dept]?.score) ?? "regular");
      const rowBg  = idx % 2 === 0 ? [250, 252, 255] as [number,number,number] : [255, 255, 255] as [number,number,number];
      doc.setFillColor(...rowBg); doc.rect(margin, y, W - margin * 2, 7, "F");
      doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(...dark2);
      doc.text(dept.length > 18 ? dept.slice(0, 17) + "…" : dept, colX[0], y + 5);
      doc.setTextColor(0, 120, 180); doc.text(`${score}/100`, colX[1], y + 5);
      doc.setTextColor(...dark2);
      doc.text(count > 0 ? `${count}` : "–", colX[2], y + 5);
      doc.text(night.label,  colX[3], y + 5);
      doc.text(armed.label,  colX[4], y + 5);
      doc.text(signal.label, colX[5], y + 5);
      doc.text(road.label,   colX[6], y + 5);
      y += 8;
      if (y > 260) { doc.addPage(); y = 20; }
    });
    y += 4;

    /* Recommendations */
    doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...dark2);
    doc.text("RECOMENDACIONES OPERACIONALES", margin, y);
    y += 6;
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    recommendations.forEach((rec, i) => {
      const lines = doc.splitTextToSize(`${i + 1}. ${rec}`, W - margin * 2 - 4);
      doc.setTextColor(...gray);
      doc.text(lines, margin + 2, y);
      y += lines.length * 5 + 2;
      if (y > 260) { doc.addPage(); y = 20; }
    });

    /* Registered blockades */
    if (corridorBlockades.length > 0) {
      y += 4;
      doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...pink);
      doc.text("BLOQUEOS REGISTRADOS POR OPERADORES", margin, y);
      y += 7;
      doc.setFontSize(8); doc.setFont("helvetica", "normal");
      corridorBlockades.forEach(blk => {
        doc.setTextColor(...dark2);
        doc.text(`• ${blk.department} — ${blk.location}`, margin + 2, y);
        doc.setTextColor(...gray);
        doc.text(`  Estado: ${blk.status} | Fecha: ${blk.date} | Causa: ${CAUSE_LABELS[blk.cause]}`, margin + 4, y + 5);
        if (blk.notes) { doc.text(`  Nota: ${blk.notes}`, margin + 4, y + 10); y += 5; }
        y += 12;
        if (y > 265) { doc.addPage(); y = 20; }
      });
    }

    /* Footer */
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFontSize(7); doc.setTextColor(160, 170, 190);
      doc.text(`Informe confidencial — Sistema de Piratería Terrestre Colombia · Pág. ${p}/${pages}`, margin, 292);
    }

    doc.save(`riesgo_${selectedCorridor.id}_${new Date().toISOString().split("T")[0]}.pdf`);
  }, [selectedCorridor, routeStats, pirataMap, recommendations, corridorBlockades]);

  const submitBlockade = useCallback(() => {
    if (!formData.corridorId) return setFormError("Seleccione un corredor.");
    if (!formData.department) return setFormError("Indique el departamento afectado.");
    if (!formData.location.trim()) return setFormError("Describa el punto / sector de cierre.");
    setFormError("");
    if (selectedCorridor?.id !== formData.corridorId) {
      const c = CORRIDORS.find(c => c.id === formData.corridorId);
      if (c) setSelectedCorridor(c);
    }
    createBlockadeMutation.mutate({
      corridorId:    formData.corridorId,
      department:    formData.department,
      date:          formData.date,
      cause:         formData.cause as any,
      location:      formData.location,
      durationHours: formData.durationHours,
      status:        formData.status as any,
      notes:         formData.notes || null,
      reporter:      formData.reporter || null,
    });
  }, [formData, selectedCorridor, createBlockadeMutation]);

  const inputStyle: React.CSSProperties = {
    width: "100%", background: dark ? "#0e1828" : "#f1f5f9",
    border: `1px solid ${borderC}`, borderRadius: "6px", padding: "7px 10px",
    fontSize: "12px", color: textMain, outline: "none", boxSizing: "border-box",
  };
  const selectStyle: React.CSSProperties = {
    ...inputStyle, cursor: "pointer",
    /* Force solid bg so browser-native option list text is readable */
    backgroundColor: dark ? "#0e1828" : "#f8fafc",
    color: textMain,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

      {/* ── Header ── */}
      <div style={{ background: dark ? "linear-gradient(135deg,#0c1628,#0e1f38)" : "linear-gradient(135deg,#e8f4ff,#dbeafe)", border: `1px solid ${dark?"rgba(239,68,68,0.2)":"rgba(239,68,68,0.15)"}`, borderRadius: "12px", padding: "12px 16px", display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ width: 34, height: 34, borderRadius: "9px", background: "rgba(239,68,68,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Truck style={{ width: 16, height: 16, color: E.red }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: textMain }}>Gestión de Riesgo en Corredores de Carga — Colombia 2026</div>
          <div style={{ fontSize: "11px", color: textMuted, marginTop: "2px" }}>
            Piratería terrestre · Grupos armados · Riesgo nocturno · Condición vial · Señal celular · Bloqueos comunitarios
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {selectedCorridor && (
            <>
              <button onClick={() => { setSelectedCorridor(null); setActiveTab("risk"); }} style={{ fontSize: "11px", color: textMuted, background: "transparent", border: `1px solid ${borderC}`, borderRadius: "6px", padding: "5px 10px", cursor: "pointer" }}>
                ← Cambiar ruta
              </button>
              <button onClick={generatePDF} title="Exportar PDF" style={{ fontSize: "11px", fontWeight: 700, color: E.cyan, background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.25)", borderRadius: "6px", padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                <FileText style={{ width: 11, height: 11 }} /> PDF
              </button>
            </>
          )}
          {!selectedCorridor && (
            <button
              onClick={() => { setCustomRouteMode(p => !p); setCustomDepts([]); }}
              style={{ fontSize: "11px", fontWeight: 700, color: E.cyan, background: customRouteMode ? "rgba(0,212,255,0.18)" : "rgba(0,212,255,0.07)", border: `1px solid ${customRouteMode ? "rgba(0,212,255,0.4)" : "rgba(0,212,255,0.2)"}`, borderRadius: "6px", padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
              <MapPin style={{ width: 11, height: 11 }} /> {customRouteMode ? "Cancelar Ruta" : "Trazar Ruta Manual"}
            </button>
          )}
          <button onClick={() => { setShowForm(true); setFormData(EMPTY_FORM(selectedCorridor?.id ?? "")); }} style={{ fontSize: "11px", fontWeight: 700, color: E.pink, background: "rgba(236,72,153,0.1)", border: "1px solid rgba(236,72,153,0.25)", borderRadius: "6px", padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
            <Plus style={{ width: 11, height: 11 }} /> Registrar Bloqueo
          </button>
        </div>
      </div>

      {/* ── URL NEWS IMPORT — top-level, always visible ── */}
      <div style={{ background: panelBg, border: `1px solid rgba(0,212,255,0.25)`, borderRadius: "12px", padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <Globe style={{ width: 13, height: 13, color: E.cyan }} />
          <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: E.cyan }}>
            Importar Bloqueos Viales desde Noticias Web
          </span>
          <span style={{ marginLeft: "auto", fontSize: "9px", color: textMuted, background: "rgba(0,212,255,0.07)", padding: "2px 7px", borderRadius: "4px", fontStyle: "italic" }}>IA</span>
        </div>
        <div style={{ fontSize: "11px", color: textMuted, marginBottom: "10px", lineHeight: 1.5 }}>
          Pegue un enlace de noticias sobre cierres viales (ANSV, El Tiempo, W Radio, medios regionales) y la IA extraerá los bloqueos automáticamente.
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
          <input
            type="url"
            placeholder="https://www.ansv.gov.co/noticias/cierre-via..."
            value={urlInput}
            onChange={e => { setUrlInput(e.target.value); setUrlResult(null); setUrlError(""); }}
            onKeyDown={e => e.key === "Enter" && !urlLoading && handleUrlImport()}
            disabled={urlLoading}
            style={{
              flex: 1, padding: "7px 10px", fontSize: "11px", borderRadius: "6px",
              background: dark ? "#0e1828" : "#f1f5f9",
              border: `1px solid ${urlError ? E.red : dark ? "rgba(0,212,255,0.2)" : "rgba(0,0,0,0.12)"}`,
              color: textMain, outline: "none",
            }}
          />
          <button
            onClick={handleUrlImport}
            disabled={urlLoading || !urlInput.trim()}
            style={{
              padding: "7px 14px", fontSize: "11px", fontWeight: 700, borderRadius: "6px",
              cursor: urlLoading || !urlInput.trim() ? "not-allowed" : "pointer",
              background: urlLoading || !urlInput.trim() ? "rgba(0,212,255,0.06)" : "rgba(0,212,255,0.14)",
              border: `1px solid ${urlLoading || !urlInput.trim() ? "rgba(0,212,255,0.1)" : "rgba(0,212,255,0.3)"}`,
              color: E.cyan, display: "flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap",
            }}>
            {urlLoading
              ? <><RefreshCw style={{ width: 10, height: 10, animation: "spin 1s linear infinite" }} /> Analizando...</>
              : <><Sparkles style={{ width: 10, height: 10 }} /> Analizar URL</>}
          </button>
        </div>
        {urlError && (
          <div style={{ marginTop: "8px", fontSize: "10px", color: E.red, display: "flex", alignItems: "center", gap: "5px" }}>
            <AlertTriangle style={{ width: 10, height: 10 }} /> {urlError}
          </div>
        )}
        {urlResult && (
          <div style={{ marginTop: "8px", fontSize: "10px", display: "flex", alignItems: "center", gap: "5px", color: urlResult.count > 0 ? E.emerald : textMuted, fontWeight: urlResult.count > 0 ? 600 : 400 }}>
            <CheckCircle2 style={{ width: 10, height: 10 }} /> {urlResult.message}
          </div>
        )}
        {urlInserted.length > 0 && (
          <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ fontSize: "9px", fontWeight: 700, color: textMuted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Bloqueos extraídos — seleccione un corredor para verlos en el mapa
            </div>
            {urlInserted.map((b: any, i: number) => {
              const corridor = CORRIDORS.find(c => c.id === b.corridorId);
              const statusColor = b.status === "activo" ? E.red : b.status === "intermitente" ? E.amber : E.emerald;
              const statusLabel = b.status === "activo" ? "Activo" : b.status === "intermitente" ? "Intermitente" : "Levantado";
              return (
                <div key={b.id ?? i} style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.15)", borderRadius: "8px", padding: "8px 10px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "10px", fontWeight: 700, color: textMain }}>
                      {corridor ? `${corridor.icon} ${corridor.shortName}` : b.corridorId} — {b.department}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <span style={{ fontSize: "9px", fontWeight: 700, color: statusColor, background: `${statusColor}20`, padding: "1px 6px", borderRadius: "4px" }}>
                        {statusLabel}
                      </span>
                      {corridor && (
                        <button
                          onClick={() => setSelectedCorridor(corridor)}
                          style={{ fontSize: "9px", fontWeight: 700, color: E.cyan, background: "rgba(0,212,255,0.12)", border: "1px solid rgba(0,212,255,0.25)", borderRadius: "4px", padding: "1px 6px", cursor: "pointer" }}>
                          Ver en mapa
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: "10px", color: textMuted }}>📍 {b.location}</div>
                  {b.notes && <div style={{ fontSize: "9px", color: textMuted, fontStyle: "italic", lineHeight: 1.4 }}>{b.notes}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── GESTIÓN DE BLOQUEOS — lista global ── */}
      <div style={{ background: panelBg, border: `1px solid rgba(236,72,153,0.25)`, borderRadius: "12px", padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
          <Ban style={{ width: 13, height: 13, color: E.pink }} />
          <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: E.pink }}>
            Gestión de Bloqueos Registrados
          </span>
          <span style={{ marginLeft: "auto", fontSize: "10px", fontWeight: 700, color: E.pink, background: "rgba(236,72,153,0.12)", padding: "2px 8px", borderRadius: "10px" }}>
            {userBlockades.length} total
          </span>
        </div>
        {/* Leyenda de fuentes */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "10px", paddingBottom: "10px", borderBottom: `1px solid ${borderC}` }}>
          {[
            { label: "Manual", color: textMuted, desc: "Registrado por operador · Sin expiración" },
            { label: "IA·URL", color: "#a78bfa", desc: "Importado de URL de noticia · Expira 72h" },
            { label: "RSS·Auto", color: E.cyan, desc: "Detectado automáticamente · Expira 48h" },
          ].map(s => (
            <span key={s.label} title={s.desc} style={{ fontSize: "9px", fontWeight: 700, color: s.color, background: `${s.color}15`, padding: "2px 8px", borderRadius: "4px", border: `1px solid ${s.color}30`, cursor: "default" }}>{s.label}</span>
          ))}
          <span style={{ fontSize: "9px", color: textMuted, marginLeft: "auto" }}>⏱ = tiempo hasta auto-cierre</span>
        </div>
        {userBlockades.length === 0 ? (
          <div style={{ textAlign: "center", color: textMuted, fontSize: "12px", padding: "16px 0" }}>
            No hay bloqueos registrados.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "320px", overflowY: "auto" }}>
            {[...userBlockades].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(blk => {
              const corridor = CORRIDORS.find(c => c.id === blk.corridorId);
              const statusColor = blk.status === "activo" ? E.red : blk.status === "intermitente" ? E.amber : E.emerald;
              const src = (blk as any).source ?? "manual";
              const srcLabel = src === "news_rss" ? "RSS·Auto" : src === "news_import" ? "IA·URL" : "Manual";
              const srcColor = src === "news_rss" ? E.cyan : src === "news_import" ? "#a78bfa" : textMuted;
              const exp = (blk as any).expiresAt ? new Date((blk as any).expiresAt) : null;
              const hoursLeft = exp ? Math.max(0, Math.round((exp.getTime() - Date.now()) / 3600000)) : null;
              const expLabel = hoursLeft === null ? "Permanente" : hoursLeft <= 0 ? "Expirando…" : `${hoursLeft}h`;
              const expColor = hoursLeft === null ? textMuted : hoursLeft <= 6 ? E.red : hoursLeft <= 24 ? E.amber : "#10b981";
              return (
                <div key={blk.id} style={{ background: dark ? "rgba(236,72,153,0.04)" : "#fff5f9", border: `1px solid ${dark ? "rgba(236,72,153,0.12)" : "rgba(236,72,153,0.12)"}`, borderRadius: "8px", padding: "9px 12px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: textMain }}>{blk.department}</span>
                      <span style={{ fontSize: "10px", color: textMuted }}>·</span>
                      <span style={{ fontSize: "11px", color: textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "160px" }}>{blk.location}</span>
                      <span style={{ fontSize: "9px", fontWeight: 700, color: statusColor, background: `${statusColor}18`, padding: "1px 6px", borderRadius: "4px" }}>{blk.status}</span>
                      <span style={{ fontSize: "9px", fontWeight: 700, color: srcColor, background: `${srcColor}15`, padding: "1px 6px", borderRadius: "4px", border: `1px solid ${srcColor}30` }}>{srcLabel}</span>
                      <span style={{ fontSize: "9px", fontWeight: 700, color: expColor, background: `${expColor}15`, padding: "1px 6px", borderRadius: "4px" }} title={exp ? `Expira: ${exp.toLocaleString("es-CO")}` : "Sin expiración"}>⏱ {expLabel}</span>
                    </div>
                    <div style={{ fontSize: "10px", color: textMuted, marginTop: "3px" }}>
                      {corridor ? `${corridor.icon} ${corridor.name}` : blk.corridorId} · {blk.date}
                      {blk.reporter && ` · ${blk.reporter}`}
                    </div>
                  </div>
                  {/* Regeocode button */}
                  <button
                    onClick={() => handleRegeocode(blk.id)}
                    disabled={regeocoding.has(blk.id)}
                    title={blk.lat != null ? "Coordenadas OK — clic para recalcular" : "Sin coordenadas GPS — clic para geocodificar"}
                    style={{ background: "transparent", border: "none", cursor: regeocoding.has(blk.id) ? "wait" : "pointer", color: regeocodeDone.has(blk.id) ? "#10b981" : blk.lat != null ? "#00d4ff" : "#f59e0b", padding: "4px", borderRadius: "4px", flexShrink: 0, opacity: regeocoding.has(blk.id) ? 0.5 : 1 }}
                  >
                    {regeocoding.has(blk.id)
                      ? <RefreshCw style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />
                      : <MapPin style={{ width: 13, height: 13 }} />}
                  </button>
                  {/* Delete button */}
                  <button
                    onClick={() => deleteBlockadeMutation.mutate(blk.id)}
                    title="Eliminar bloqueo"
                    style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "6px", cursor: "pointer", color: E.red, padding: "5px 8px", fontSize: "10px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}
                  >
                    <X style={{ width: 11, height: 11 }} /> Eliminar
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── REGISTER BLOCKADE MODAL ── */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: dark ? "#0c1220" : "#fff", border: `1px solid ${dark?"rgba(236,72,153,0.3)":borderC}`, borderRadius: "14px", padding: "20px 22px", width: "100%", maxWidth: "480px", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            {/* Modal header */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <Ban style={{ width: 16, height: 16, color: E.pink }} />
              <span style={{ fontSize: "13px", fontWeight: 700, color: textMain, flex: 1 }}>Registrar Bloqueo Vial</span>
              <button onClick={() => setShowForm(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: textMuted, display: "flex" }}><X style={{ width: 16, height: 16 }} /></button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {/* Corridor */}
              <div>
                <label style={{ fontSize: "10px", fontWeight: 700, color: textMuted, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Corredor Vial *</label>
                <select value={formData.corridorId} onChange={e => { const c = CORRIDORS.find(x => x.id === e.target.value); setFormData(p => ({ ...p, corridorId: e.target.value, department: c?.departments[0] ?? "" })); }} style={selectStyle}>
                  <option value="">— Seleccione corredor —</option>
                  {CORRIDORS.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>

              {/* Department */}
              <div>
                <label style={{ fontSize: "10px", fontWeight: 700, color: textMuted, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Departamento afectado *</label>
                <select value={formData.department} onChange={e => setFormData(p => ({ ...p, department: e.target.value }))} style={selectStyle}>
                  <option value="">— Seleccione —</option>
                  {(formData.corridorId ? (CORRIDORS.find(c => c.id === formData.corridorId)?.departments ?? []) : []).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* Location */}
              <div>
                <label style={{ fontSize: "10px", fontWeight: 700, color: textMuted, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Punto / Sector de cierre *</label>
                <input type="text" placeholder="Ej: Panamericana km 38 sector Piendamó" value={formData.location} onChange={e => setFormData(p => ({ ...p, location: e.target.value }))} style={inputStyle} />
              </div>

              {/* Date + Cause row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div>
                  <label style={{ fontSize: "10px", fontWeight: 700, color: textMuted, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Fecha</label>
                  <input type="date" value={formData.date} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: "10px", fontWeight: 700, color: textMuted, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Estado</label>
                  <select value={formData.status} onChange={e => setFormData(p => ({ ...p, status: e.target.value as any }))} style={selectStyle}>
                    <option value="activo">🔴 Activo</option>
                    <option value="intermitente">🟡 Intermitente</option>
                    <option value="levantado">🟢 Levantado</option>
                  </select>
                </div>
              </div>

              {/* Cause + Duration */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div>
                  <label style={{ fontSize: "10px", fontWeight: 700, color: textMuted, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Causa</label>
                  <select value={formData.cause} onChange={e => setFormData(p => ({ ...p, cause: e.target.value as any }))} style={selectStyle}>
                    {Object.entries(CAUSE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "10px", fontWeight: 700, color: textMuted, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Duración (horas)</label>
                  <input type="number" min={1} placeholder="Aprox." value={formData.durationHours ?? ""} onChange={e => setFormData(p => ({ ...p, durationHours: e.target.value ? Number(e.target.value) : null }))} style={inputStyle} />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label style={{ fontSize: "10px", fontWeight: 700, color: textMuted, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Observaciones</label>
                <textarea placeholder="Información adicional: desvío alternativo, tipo de vehículos afectados, fuente..." value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} style={{ ...inputStyle, resize: "vertical", minHeight: "60px", fontFamily: "inherit" }} />
              </div>

              {/* Reporter */}
              <div>
                <label style={{ fontSize: "10px", fontWeight: 700, color: textMuted, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Reportado por</label>
                <input type="text" placeholder="Empresa / operador / nombre" value={formData.reporter} onChange={e => setFormData(p => ({ ...p, reporter: e.target.value }))} style={inputStyle} />
              </div>

              {formError && <div style={{ fontSize: "11px", color: E.red, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "6px", padding: "7px 10px" }}>{formError}</div>}

              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", paddingTop: "4px" }}>
                <button onClick={() => setShowForm(false)} style={{ fontSize: "12px", color: textMuted, background: "transparent", border: `1px solid ${borderC}`, borderRadius: "7px", padding: "7px 16px", cursor: "pointer" }}>Cancelar</button>
                <button onClick={submitBlockade} style={{ fontSize: "12px", fontWeight: 700, color: "#fff", background: E.pink, border: "none", borderRadius: "7px", padding: "7px 18px", cursor: "pointer" }}>Registrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CUSTOM ROUTE BUILDER (Leaflet + OSRM) ── */}
      {customRouteMode && !selectedCorridor && (
        <RouteMapBuilder dark={dark} userBlockades={userBlockades} pirataMap={pirataMap} />
      )}
      {false && (() => {
        const crDepts  = customDepts; // canonical names
        const crScore  = crDepts.length > 0
          ? Math.round(crDepts.reduce((s, d) => s + scoreForDept(d, pirataMap[normKey(d)] ?? 0), 0) / crDepts.length)
          : 0;
        const crLabel  = compositeLabel(crScore);
        const crPirata = crDepts.reduce((s, d) => s + (pirataMap[normKey(d)] ?? 0), 0);
        const crArmed  = Math.max(0, ...crDepts.map(d => armedDeptMap[d]?.level ?? 0));
        const crNight  = Math.max(0, ...crDepts.map(d => NIGHT_RISK[d] ?? 60));
        const crBlocksBD = userBlockades.filter(b =>
          crDepts.some(d => normKey(d) === normKey(b.department ?? "")) && b.status === "activo"
        );
        function toggleDept(rawGeo: string) {
          const canonical = findCanonicalDept(rawGeo);
          setCustomDepts(prev => {
            const idx = prev.findIndex(d => normKey(d) === normKey(canonical));
            return idx >= 0 ? prev.filter((_, i) => i !== idx) : [...prev, canonical];
          });
        }
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

            {/* Instruction banner */}
            <div style={{ background: dark ? "rgba(0,212,255,0.06)" : "rgba(3,105,161,0.05)", border: `1px solid rgba(0,212,255,0.18)`, borderRadius: "10px", padding: "10px 14px", fontSize: "11px", color: textMuted, lineHeight: 1.5 }}>
              🗺️ <strong style={{ color: textMain }}>Trazador de Ruta Manual</strong> — Haga clic en los departamentos en el orden que recorrerá la ruta. Clic nuevamente para quitar un departamento.
              {crDepts.length > 0 && (
                <button onClick={() => setCustomDepts([])} style={{ marginLeft: "10px", fontSize: "10px", color: E.red, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "5px", padding: "2px 8px", cursor: "pointer" }}>
                  Limpiar ruta
                </button>
              )}
            </div>

            {/* Route breadcrumb strip */}
            {crDepts.length > 0 && (
              <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "10px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                <MapPin style={{ width: 11, height: 11, color: E.cyan, flexShrink: 0 }} />
                {crDepts.map((d, i) => {
                  const s = scoreForDept(d, pirataMap[normKey(d)] ?? 0);
                  const l = compositeLabel(s);
                  return (
                    <div key={d} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                      <span style={{ fontSize: "9px", fontWeight: 800, color: "#fff", background: i === 0 ? E.emerald : i === crDepts.length - 1 ? E.cyan : l.color, borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontSize: "10px", fontWeight: 600, color: textMain, padding: "2px 6px", background: `${l.color}18`, border: `1px solid ${l.color}33`, borderRadius: "4px" }}>{d}</span>
                      {i < crDepts.length - 1 && <ChevronRight style={{ width: 9, height: 9, color: textMuted }} />}
                    </div>
                  );
                })}
                <span style={{ marginLeft: "auto", fontSize: "9px", color: textMuted }}>{crDepts.length} departamento{crDepts.length !== 1 ? "s" : ""} en ruta</span>
              </div>
            )}

            {/* Interactive map */}
            <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "12px", overflow: "hidden", position: "relative" }}>
              <div style={{ padding: "8px 14px 0", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted }}>
                Mapa Interactivo — haga clic para agregar departamentos a la ruta
              </div>
              <ComposableMap projection="geoMercator" projectionConfig={{ scale: 1800, center: [-73.5, 4.0] }} style={{ width: "100%", height: "380px", background: dark ? "#0a1220" : "#c0d8ee" }}>
                <Geographies geography={GEO_URL}>
                  {({ geographies }: { geographies: any[] }) => geographies.map((geo: any) => {
                    const rawName: string = geo.properties.NOMBRE_DPT || geo.properties.DPTO_CNMBR || geo.properties.name || "";
                    const canonical = findCanonicalDept(rawName);
                    const idx = crDepts.findIndex(d => normKey(d) === normKey(canonical));
                    const onRoute = idx >= 0;
                    const score = scoreForDept(canonical, pirataMap[normKey(canonical)] ?? 0);
                    let fill: string;
                    if (onRoute) fill = E.cyan;
                    else { fill = getMapFill(rawName, false); }
                    return (
                      <Geography key={geo.rsmKey} geography={geo}
                        fill={fill}
                        stroke={onRoute ? "rgba(255,255,255,0.9)" : (dark ? "rgba(40,80,140,0.25)" : "rgba(80,120,180,0.2)")}
                        strokeWidth={onRoute ? 1.8 : 0.45}
                        onClick={() => toggleDept(rawName)}
                        onMouseEnter={e => setHovered({ name: rawName, pirataCount: pirataMap[normKey(rawName)] ?? 0, score, ex: (e as any).clientX, ey: (e as any).clientY })}
                        onMouseLeave={() => setHovered(null)}
                        style={{
                          default: { outline: "none" },
                          hover:   { outline: "none", cursor: "crosshair", filter: "brightness(1.4)" },
                          pressed: { outline: "none", filter: "brightness(0.85)" },
                        }}
                      />
                    );
                  })}
                </Geographies>
              </ComposableMap>
              {/* Order badges overlay - show numbered labels */}
              {hovered && (
                <div style={{ position: "absolute", top: "50px", right: "14px", background: dark ? "rgba(10,16,30,0.95)" : "rgba(255,255,255,0.97)", border: `1px solid ${borderC}`, borderRadius: "7px", padding: "7px 10px", fontSize: "11px", pointerEvents: "none" }}>
                  <div style={{ fontWeight: 700, color: textMain, marginBottom: "3px" }}>{hovered.name}</div>
                  <div style={{ fontSize: "10px", color: compositeLabel(hovered.score).color, fontWeight: 600 }}>
                    Riesgo: {compositeLabel(hovered.score).label} · {hovered.score}/100
                  </div>
                  <div style={{ fontSize: "10px", color: textMuted }}>
                    Piratería: {hovered.pirataCount} casos · Grupos: {armedLabel(armedDeptMap[hovered.name]?.level ?? 0).label}
                  </div>
                </div>
              )}
            </div>

            {/* Risk analysis - only when 2+ depts selected */}
            {crDepts.length >= 2 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
                <div style={{ background: panelBg, border: `1px solid ${crLabel.color}44`, borderRadius: "10px", padding: "12px 14px" }}>
                  <div style={{ fontSize: "9px", fontWeight: 700, color: textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Riesgo Compuesto</div>
                  <div style={{ fontSize: "22px", fontWeight: 800, color: crLabel.color, lineHeight: 1 }}>{crScore}<span style={{ fontSize: "11px", fontWeight: 500, color: textMuted }}>/100</span></div>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: crLabel.color, marginTop: "3px" }}>{crLabel.label}</div>
                </div>
                <div style={{ background: panelBg, border: `1px solid rgba(239,68,68,0.25)`, borderRadius: "10px", padding: "12px 14px" }}>
                  <div style={{ fontSize: "9px", fontWeight: 700, color: textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Piratería Terrestre</div>
                  <div style={{ fontSize: "22px", fontWeight: 800, color: E.red, lineHeight: 1 }}>{crPirata}</div>
                  <div style={{ fontSize: "10px", color: textMuted, marginTop: "3px" }}>casos en ruta 2026</div>
                </div>
                <div style={{ background: panelBg, border: `1px solid rgba(245,158,11,0.25)`, borderRadius: "10px", padding: "12px 14px" }}>
                  <div style={{ fontSize: "9px", fontWeight: 700, color: textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Grupos Armados</div>
                  <div style={{ fontSize: "22px", fontWeight: 800, color: armedLabel(crArmed).color, lineHeight: 1 }}>{armedLabel(crArmed).label}</div>
                  <div style={{ fontSize: "10px", color: textMuted, marginTop: "3px" }}>presencia más alta en ruta</div>
                </div>
                <div style={{ background: panelBg, border: `1px solid rgba(0,212,255,0.2)`, borderRadius: "10px", padding: "12px 14px" }}>
                  <div style={{ fontSize: "9px", fontWeight: 700, color: textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Riesgo Nocturno</div>
                  <div style={{ fontSize: "22px", fontWeight: 800, color: nightLabel(crNight).color, lineHeight: 1 }}>{crNight}%</div>
                  <div style={{ fontSize: "10px", color: textMuted, marginTop: "3px" }}>incidencia nocturna máx.</div>
                </div>
              </div>
            )}

            {/* Active blockades for custom route */}
            {crDepts.length >= 2 && crBlocksBD.length > 0 && (
              <div style={{ background: panelBg, border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "12px 14px" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: E.red, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>
                  🚨 {crBlocksBD.length} Bloqueo{crBlocksBD.length > 1 ? "s" : ""} Activo{crBlocksBD.length > 1 ? "s" : ""} en esta Ruta
                </div>
                {crBlocksBD.map(b => (
                  <div key={b.id} style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginBottom: "6px", paddingBottom: "6px", borderBottom: `1px solid ${borderC}` }}>
                    <span style={{ fontSize: "9px", fontWeight: 700, color: E.red, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "3px", padding: "2px 6px", whiteSpace: "nowrap" }}>ACTIVO</span>
                    <div>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: textMain }}>{b.department} — {b.location}</div>
                      <div style={{ fontSize: "10px", color: textMuted }}>{CAUSE_LABELS[b.cause ?? ""] ?? b.cause} · {b.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recommendations */}
            {crDepts.length >= 2 && (() => {
              const recs: string[] = [];
              if (crBlocksBD.length > 0) recs.push(`🚨 HAY ${crBlocksBD.length} BLOQUEO(S) ACTIVO(S) EN ESTA RUTA — verificar antes de salir`);
              if (crNight >= 75) recs.push("⛔ Evitar tránsito entre 10 PM y 5 AM — alta incidencia nocturna en ruta");
              if (crNight >= 60 && crNight < 75) recs.push("⚠ Reducir velocidad y mantener comunicación constante en horario nocturno");
              if (crArmed >= 3) recs.push("🚨 Coordinar con la Policía Nacional antes de transitar — presencia alta de grupos armados");
              if (crArmed === 2) recs.push("📋 Registrar el despacho en la Policía de Carreteras (DIJIN) antes de salir");
              if (crPirata >= 30) recs.push("🛡 Considerar escolta de seguridad privada para cargas de valor alto");
              if (crPirata >= 10) recs.push("📡 Activar GPS con reporte en tiempo real y monitoreo desde centro de control");
              if (recs.length === 0) recs.push("✅ Ruta de bajo riesgo compuesto. Mantener protocolos estándar de seguridad");
              return (
                <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "10px", padding: "12px 14px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>📋 Recomendaciones para esta Ruta</div>
                  {recs.map((r, i) => (
                    <div key={i} style={{ fontSize: "11px", color: textMain, lineHeight: 1.6, padding: "3px 0", borderBottom: i < recs.length - 1 ? `1px solid ${borderC}` : "none" }}>{r}</div>
                  ))}
                </div>
              );
            })()}

          </div>
        );
      })()}

      {/* ── CORRIDOR GRID ── */}
      {!customRouteMode && !selectedCorridor && (
        <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "12px", padding: "14px 16px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted, marginBottom: "10px" }}>Seleccione un Corredor Vial</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(255px, 1fr))", gap: "7px" }}>
            {CORRIDORS.map(corridor => {
              const risk       = corridorCardRisk(corridor);
              const armedMax   = Math.max(...corridor.departments.map(d => armedDeptMap[d]?.level ?? 0));
              const nightMax   = Math.max(...corridor.departments.map(d => NIGHT_RISK[d] ?? 60));
              const blockadeMax= userBlockades.filter(b => b.corridorId === corridor.id).length;
              const activeBlks = userBlockades.filter(b => b.corridorId === corridor.id && b.status === "activo").length;
              return (
                <button key={corridor.id} onClick={() => setSelectedCorridor(corridor)}
                  style={{ background: dark ? "rgba(255,255,255,0.02)" : "#f8fafc", border: `1px solid ${dark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.08)"}`, borderRadius: "8px", padding: "10px 12px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: "9px" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = dark?"rgba(0,212,255,0.06)":"rgba(59,130,246,0.05)"; (e.currentTarget as HTMLElement).style.borderColor = dark?"rgba(0,212,255,0.22)":"rgba(59,130,246,0.22)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = dark?"rgba(255,255,255,0.02)":"#f8fafc"; (e.currentTarget as HTMLElement).style.borderColor = dark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.08)"; }}
                >
                  <span style={{ fontSize: "15px", flexShrink: 0 }}>{corridor.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: textMain, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{corridor.name}</div>
                    <div style={{ fontSize: "10px", color: textMuted, marginTop: "1px" }}>{corridor.via}</div>
                    <div style={{ display: "flex", gap: "3px", marginTop: "4px", flexWrap: "wrap" }}>
                      {armedMax >= 2   && <span style={{ fontSize: "8px", color: E.red,    background: "rgba(239,68,68,0.12)",    borderRadius: "3px", padding: "1px 5px", fontWeight: 700 }}>⚔ ARMADOS</span>}
                      {nightMax >= 75  && <span style={{ fontSize: "8px", color: E.amber,  background: "rgba(245,158,11,0.12)",  borderRadius: "3px", padding: "1px 5px", fontWeight: 700 }}>🌙 NOCTURNO</span>}
                      {corridor.departments.some(d => (realRoadDeptMap[d] ?? ROAD_CONDITION[d]?.score) === "difficult") && <span style={{ fontSize: "8px", color: E.orange, background: "rgba(249,115,22,0.12)", borderRadius: "3px", padding: "1px 5px", fontWeight: 700 }}>🔧 VÍA</span>}
                      {blockadeMax >= 1 && <span style={{ fontSize: "8px", color: E.pink,  background: "rgba(236,72,153,0.12)",  borderRadius: "3px", padding: "1px 5px", fontWeight: 700 }}>🛑 {blockadeMax} BLOQUEO{blockadeMax>1?"S":""}</span>}
                      {activeBlks > 0  && <span style={{ fontSize: "8px", color: "#fff",   background: E.red,                    borderRadius: "3px", padding: "1px 5px", fontWeight: 700 }}>🔴 {activeBlks} ACTIVO{activeBlks>1?"S":""}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px", flexShrink: 0 }}>
                    <span style={{ fontSize: "9px", fontWeight: 700, color: risk.color, background: risk.bg, padding: "2px 6px", borderRadius: "4px" }}>{risk.label}</span>
                    <span style={{ fontSize: "9px", color: textMuted }}>{corridor.departments.length} depts</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ROUTE DETAIL ── */}
      {selectedCorridor && (() => {
        const overallScore = compositeLabel(routeStats.avgScore);
        const activeBlks   = corridorBlockades.filter(b => b.status === "activo").length;
        return (
          <>
            {/* Route header */}
            <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "12px", padding: "12px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "16px" }}>{selectedCorridor.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: textMain }}>{selectedCorridor.name}</div>
                  <div style={{ fontSize: "10px", color: textMuted }}>{selectedCorridor.via}</div>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <div style={{ background: overallScore.bg, border: `1px solid ${overallScore.color}40`, borderRadius: "7px", padding: "6px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: "9px", color: textMuted, fontWeight: 600, letterSpacing: "0.07em" }}>RIESGO COMPUESTO</div>
                    <div style={{ fontSize: "13px", fontWeight: 800, color: overallScore.color }}>{overallScore.label} · {routeStats.avgScore}/100</div>
                  </div>
                  <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "7px", padding: "6px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: "9px", color: textMuted, fontWeight: 600, letterSpacing: "0.07em" }}>PIRATERÍA 2026</div>
                    <div style={{ fontSize: "13px", fontWeight: 800, color: E.red }}>{routeStats.total} casos</div>
                  </div>
                  {activeBlks > 0 && (
                    <div style={{ background: "rgba(236,72,153,0.1)", border: "1px solid rgba(236,72,153,0.3)", borderRadius: "7px", padding: "6px 12px", textAlign: "center", cursor: "pointer" }} onClick={() => setActiveTab("blockades")}>
                      <div style={{ fontSize: "9px", color: textMuted, fontWeight: 600, letterSpacing: "0.07em" }}>BLOQUEOS ACTIVOS</div>
                      <div style={{ fontSize: "13px", fontWeight: 800, color: E.pink }}>{activeBlks} registrado{activeBlks>1?"s":""}</div>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                <MapPin style={{ width: 10, height: 10, color: textMuted, flexShrink: 0 }} />
                {selectedCorridor.departments.map((dept, i) => (
                  <div key={dept} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 600, padding: "1px 7px", borderRadius: "3px", color: (i===0||i===selectedCorridor.departments.length-1)?E.cyan:textMain, background: (i===0||i===selectedCorridor.departments.length-1)?"rgba(0,212,255,0.1)":"transparent" }}>{dept}</span>
                    {i < selectedCorridor.departments.length - 1 && <ChevronRight style={{ width: 9, height: 9, color: textMuted }} />}
                  </div>
                ))}
              </div>
            </div>

            {/* Tab + view toggles */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {([["risk","📊 Análisis de Riesgo"],["mapaVial","🗺️ Mapa Vial"],["blockades","🛑 Bloqueos Comunitarios"]] as const).map(([id, label]) => (
                <button key={id} onClick={() => setActiveTab(id)} style={{ padding: "6px 14px", fontSize: "11px", fontWeight: 600, border: `1px solid ${activeTab===id?E.pink:borderC}`, borderRadius: "7px", background: activeTab===id?"rgba(236,72,153,0.1)":"transparent", color: activeTab===id?E.pink:textMuted, cursor: "pointer" }}>
                  {label}
                  {id === "mapaVial" && corridorBlockades.filter(b=>b.status==="activo"||b.status==="intermitente").length > 0 && (
                    <span style={{ marginLeft: "5px", background: E.red, color: "#fff", borderRadius: "10px", padding: "1px 6px", fontSize: "9px" }}>
                      {corridorBlockades.filter(b=>b.status==="activo"||b.status==="intermitente").length}
                    </span>
                  )}
                  {id === "blockades" && (corridorBlockades.length > 0 || officialClosures.length > 0) && (
                    <span style={{ marginLeft: "5px", background: officialClosures.some(c=>c.conditionCode==="cierre_total") ? E.red : E.pink, color: "#fff", borderRadius: "10px", padding: "1px 6px", fontSize: "9px" }}>
                      {corridorBlockades.length + officialClosures.length}
                    </span>
                  )}
                </button>
              ))}
              {activeTab === "risk" && (
                <div style={{ marginLeft: "auto", display: "flex", gap: "5px" }}>
                  {([["compuesto","🎯 Compuesto"],["pirateria","🚛 Piratería"]] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setActiveView(id)} style={{ padding: "6px 12px", fontSize: "10px", fontWeight: 600, border: `1px solid ${activeView===id?E.cyan:borderC}`, borderRadius: "7px", background: activeView===id?"rgba(0,212,255,0.1)":"transparent", color: activeView===id?E.cyan:textMuted, cursor: "pointer" }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── MAPA VIAL TAB — Leaflet + bloqueos automáticos ── */}
            {activeTab === "mapaVial" && (
              <RouteMapBuilder
                dark={dark}
                userBlockades={userBlockades}
                pirataMap={pirataMap}
                corridorDepts={selectedCorridor.departments}
              />
            )}

            {/* ── RISK TAB ── */}
            {activeTab === "risk" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  {/* Map */}
                  <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "12px", overflow: "hidden", position: "relative" }}>
                    <div style={{ padding: "10px 14px 0", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted }}>Mapa del Corredor</div>
                    <ComposableMap projection="geoMercator" projectionConfig={{ scale: 1800, center: [-73.5, 4.0] }} style={{ width: "100%", height: "320px", background: dark?"#0a1220":"#c0d8ee" }}>
                      <Geographies geography={GEO_URL}>
                        {({ geographies }: { geographies: any[] }) => geographies.map((geo: any) => {
                          const rawName: string = geo.properties.NOMBRE_DPT || geo.properties.DPTO_CNMBR || geo.properties.name || "";
                          const geoNorm = normGeo(rawName);
                          const onRoute = routeSet.has(geoNorm);
                          const count   = pirataMap[geoNorm] ?? 0;
                          const score   = scoreForDept(rawName, count);
                          return (
                            <Geography key={geo.rsmKey} geography={geo}
                              fill={getMapFill(rawName, onRoute)}
                              stroke={onRoute?"rgba(0,212,255,0.65)":(dark?"rgba(40,80,140,0.25)":"rgba(80,120,180,0.2)")}
                              strokeWidth={onRoute ? 1.6 : 0.45}
                              style={{
                                default: { outline: "none", filter: onRoute && score >= 70 && dark ? "drop-shadow(0 0 5px rgba(255,40,0,0.5))" : "none" },
                                hover:   { outline: "none", stroke: "rgba(200,220,255,0.85)", strokeWidth: 1.8, cursor: "crosshair" },
                                pressed: { outline: "none" },
                              }}
                              onMouseEnter={(e: React.MouseEvent) => setHovered({ name: rawName, pirataCount: count, score, ex: e.clientX, ey: e.clientY })}
                              onMouseMove={(e: React.MouseEvent) => setHovered(prev => prev ? { ...prev, ex: e.clientX, ey: e.clientY } : prev)}
                              onMouseLeave={() => setHovered(null)}
                            />
                          );
                        })}
                      </Geographies>
                    </ComposableMap>
                    <div style={{ position: "absolute", bottom: 8, left: 8, background: dark?"rgba(8,14,26,0.92)":"rgba(240,247,255,0.92)", border: `1px solid ${borderC}`, borderRadius: "5px", padding: "5px 8px", backdropFilter: "blur(8px)" }}>
                      {[["#cc1000","Crítico"],["#c04000","Alto"],["#c07a00","Moderado"],["#1a6a50","Bajo"]].map(([color,label]) => (
                        <div key={label} style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "2px" }}>
                          <div style={{ width: 8, height: 8, borderRadius: "2px", background: color, flexShrink: 0 }} />
                          <span style={{ fontSize: "8px", color: textMuted }}>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Per-dept matrix */}
                  <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "12px", padding: "12px 14px", display: "flex", flexDirection: "column" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted, marginBottom: "10px" }}>Factores de Riesgo por Departamento</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", overflowY: "auto", maxHeight: "300px" }}>
                      {selectedCorridor.departments.map((dept, i) => {
                        const count   = pirataMap[normKey(dept)] ?? 0;
                        const score   = scoreForDept(dept, count);
                        const clabel  = compositeLabel(score);
                        const night   = nightLabel(NIGHT_RISK[dept] ?? 60);
                        const armed   = armedLabel(armedDeptMap[dept]?.level ?? 0);
                        const signal  = signalLabel(CELL_SIGNAL[dept] ?? "partial");
                        const realRoad = realRoadDeptMap[dept] ?? ROAD_CONDITION[dept]?.score ?? "regular";
                        const road    = roadLabel(realRoad);
                        const deptActiveBlks = userBlockades.filter(b => b.department === dept && b.status === "activo").length;
                        const deptAllBlks    = userBlockades.filter(b => b.department === dept);
                        const blkLvl  = deptActiveBlks >= 2 ? 3 : deptActiveBlks === 1 ? 2 : deptAllBlks.some(b => b.status === "intermitente") ? 1 : 0;
                        const blkLbl  = blockadeLabel(blkLvl);
                        const isEnd   = i === 0 || i === selectedCorridor.departments.length - 1;
                        return (
                          <div key={dept} style={{ background: dark?(isEnd?"rgba(0,212,255,0.04)":"rgba(255,255,255,0.02)"):(isEnd?"rgba(59,130,246,0.04)":"#f8fafc"), border: `1px solid ${isEnd?"rgba(0,212,255,0.15)":borderC}`, borderRadius: "7px", padding: "8px 10px" }}>
                            {(() => {
                              const wx = weatherMap[dept];
                              const wxAlertColor = wx?.alert ? E.amber : (dark ? "rgba(255,255,255,0.4)" : "#6b7280");
                              return (
                                <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "6px" }}>
                                  <span style={{ fontSize: "10px", fontWeight: 700, color: "rgba(255,255,255,0.18)", fontFamily: "monospace" }}>{String(i+1).padStart(2,"0")}</span>
                                  <span style={{ fontSize: "11px", fontWeight: 700, color: isEnd?E.cyan:textMain, flex: 1 }}>
                                    {dept}
                                    {i === 0 && <span style={{ fontSize: "8px", marginLeft: "5px", color: E.cyan }}>ORIGEN</span>}
                                    {i === selectedCorridor.departments.length - 1 && <span style={{ fontSize: "8px", marginLeft: "5px", color: E.cyan }}>DESTINO</span>}
                                  </span>
                                  {wx && (
                                    <span title={`${wx.condition}${wx.precipitation > 0 ? ` · ${wx.precipitation}mm` : ""}`} style={{ fontSize: "9px", color: wxAlertColor, background: wx.alert ? "rgba(245,158,11,0.12)" : (dark?"rgba(255,255,255,0.05)":"rgba(0,0,0,0.05)"), border: `1px solid ${wx.alert ? "rgba(245,158,11,0.35)" : borderC}`, borderRadius: "4px", padding: "1px 5px", whiteSpace: "nowrap", cursor: "default" }}>
                                      {wx.icon} {wx.temp}°C{wx.precipitation > 0 ? ` · ${wx.precipitation}mm` : ""}
                                    </span>
                                  )}
                                  <span style={{ fontSize: "10px", fontWeight: 800, color: clabel.color, fontFamily: "monospace" }}>{score}</span>
                                  <span style={{ fontSize: "9px", fontWeight: 700, color: clabel.color, background: clabel.bg, padding: "1px 6px", borderRadius: "4px" }}>{clabel.label}</span>
                                </div>
                              );
                            })()}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px" }}>
                              {[
                                { Icon: Truck,      label: "Piratería",    value: count > 0 ? `${count} casos` : "Sin datos", color: pirataRisk(count).color },
                                { Icon: Moon,       label: "Riesgo noche", value: night.label,  color: night.color },
                                { Icon: Users,      label: "G. Armados",   value: armed.label,  color: armed.color },
                                { Icon: Radio,      label: "Señal",        value: signal.label, color: signal.color },
                                { Icon: CloudRain,  label: "Vía",          value: road.label,   color: road.color },
                                { Icon: Ban,        label: "Bloqueos",     value: blkLbl.label, color: blkLbl.color },
                              ].map(({ Icon, label, value, color }) => (
                                <div key={label} style={{ background: dark?"rgba(255,255,255,0.025)":"rgba(0,0,0,0.03)", borderRadius: "4px", padding: "4px 7px", display: "flex", alignItems: "center", gap: "5px" }}>
                                  <Icon style={{ width: 10, height: 10, color, flexShrink: 0 }} />
                                  <span style={{ fontSize: "9px", color: textMuted, flexShrink: 0 }}>{label}:</span>
                                  <span style={{ fontSize: "9px", fontWeight: 600, color, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
                                </div>
                              ))}
                            </div>
                            {(armedDeptMap[dept]?.groups?.length ?? 0) > 0 && <div style={{ marginTop: "4px", fontSize: "9px", color: E.red, opacity: 0.8 }}>⚔ {armedDeptMap[dept].groups.join(", ")}</div>}
                            {deptActiveBlks > 0 && <div style={{ marginTop: "2px", fontSize: "9px", color: E.red, opacity: 0.9 }}>🔴 {deptActiveBlks} bloqueo{deptActiveBlks>1?"s":""} activo{deptActiveBlks>1?"s":""} en BD</div>}
                            <div style={{ marginTop: "2px", fontSize: "9px", color: textMuted, opacity: 0.75 }}>🛣 {realRoadDeptMap[dept] ? `Cierre oficial (policia.gov.co)` : ROAD_CONDITION[dept]?.notes}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Recommendations */}
                <div style={{ background: dark?"rgba(168,85,247,0.06)":"rgba(168,85,247,0.04)", border: `1px solid ${dark?"rgba(168,85,247,0.2)":"rgba(168,85,247,0.15)"}`, borderRadius: "12px", padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <Shield style={{ width: 14, height: 14, color: E.purple }} />
                    <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: E.purple }}>Recomendaciones Operacionales</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {recommendations.map((rec, i) => (
                      <div key={i} style={{ fontSize: "12px", color: textMain, padding: "7px 10px", background: dark?"rgba(255,255,255,0.02)":"#f8fafc", border: `1px solid ${borderC}`, borderRadius: "6px" }}>{rec}</div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── BLOCKADES TAB ── */}
            {activeTab === "blockades" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

                {/* Bloqueos reales agrupados por departamento */}
                {(() => {
                  const deptMap: Record<string, typeof userBlockades> = {};
                  userBlockades.forEach(blk => {
                    if (!selectedCorridor || !selectedCorridor.departments.includes(blk.department)) return;
                    if (!deptMap[blk.department]) deptMap[blk.department] = [];
                    deptMap[blk.department].push(blk);
                  });
                  const depts = Object.keys(deptMap).sort((a, b) =>
                    deptMap[b].filter(x => x.status === "activo").length - deptMap[a].filter(x => x.status === "activo").length
                  );
                  return (
                    <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "12px", padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                        <BarChart2 style={{ width: 13, height: 13, color: E.pink }} />
                        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: E.pink }}>
                          Bloqueos por Departamento — {selectedCorridor?.name}
                        </span>
                        <span style={{ marginLeft: "auto", fontSize: "9px", fontWeight: 700, color: E.pink, background: "rgba(236,72,153,0.12)", padding: "2px 7px", borderRadius: "8px" }}>
                          {userBlockades.filter(b => selectedCorridor?.departments.includes(b.department)).length} en corredor
                        </span>
                      </div>
                      {depts.length === 0 ? (
                        <div style={{ textAlign: "center", color: textMuted, fontSize: "12px", padding: "20px 0" }}>
                          <Ban style={{ width: 24, height: 24, opacity: 0.2, display: "block", margin: "0 auto 8px" }} />
                          Sin bloqueos registrados en este corredor.<br />
                          <span style={{ fontSize: "10px" }}>El monitor RSS detectará nuevos eventos automáticamente.</span>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {depts.map(dept => {
                            const blks = deptMap[dept];
                            const activos = blks.filter(b => b.status === "activo");
                            const interms = blks.filter(b => b.status === "intermitente");
                            const last = blks.reduce((a, b) => new Date(b.updatedAt) > new Date(a.updatedAt) ? b : a);
                            const srcColors: Record<string, string> = { news_rss: E.cyan, news_import: "#a78bfa", manual: textMuted };
                            return (
                              <div key={dept} style={{ background: dark?"rgba(255,255,255,0.025)":"#f8fafc", border: `1px solid ${activos.length > 0 ? "rgba(239,68,68,0.3)" : borderC}`, borderRadius: "8px", padding: "10px 12px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                                  <span style={{ fontSize: "11px", fontWeight: 700, color: textMain, flex: 1 }}>{dept}</span>
                                  {activos.length > 0 && <span style={{ fontSize: "9px", fontWeight: 700, color: E.red, background: "rgba(239,68,68,0.12)", padding: "2px 7px", borderRadius: "4px" }}>🔴 {activos.length} ACTIVO{activos.length > 1 ? "S" : ""}</span>}
                                  {interms.length > 0 && <span style={{ fontSize: "9px", fontWeight: 700, color: E.amber, background: "rgba(245,158,11,0.12)", padding: "2px 7px", borderRadius: "4px" }}>🟡 {interms.length} INTERM.</span>}
                                  {activos.length === 0 && interms.length === 0 && <span style={{ fontSize: "9px", fontWeight: 700, color: "#10b981", background: "rgba(16,185,129,0.12)", padding: "2px 7px", borderRadius: "4px" }}>✅ Levantados</span>}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                  {blks.slice(0, 4).map(blk => {
                                    const src = (blk as any).source ?? "manual";
                                    const exp = (blk as any).expiresAt ? new Date((blk as any).expiresAt) : null;
                                    const hoursLeft = exp ? Math.max(0, Math.round((exp.getTime() - Date.now()) / 3600000)) : null;
                                    const statusColor = blk.status === "activo" ? E.red : blk.status === "intermitente" ? E.amber : "#10b981";
                                    return (
                                      <div key={blk.id} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px" }}>
                                        <span style={{ color: statusColor, flexShrink: 0 }}>●</span>
                                        <span style={{ color: textMain, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{blk.location}</span>
                                        <span style={{ color: srcColors[src] ?? textMuted, fontSize: "8px", fontWeight: 700, background: `${srcColors[src] ?? textMuted}15`, padding: "1px 5px", borderRadius: "3px", flexShrink: 0 }}>{src === "news_rss" ? "RSS" : src === "news_import" ? "IA" : "OP"}</span>
                                        {hoursLeft !== null && <span style={{ fontSize: "8px", color: hoursLeft <= 6 ? E.red : hoursLeft <= 24 ? E.amber : "#10b981", flexShrink: 0 }}>⏱{hoursLeft}h</span>}
                                        <span style={{ fontSize: "9px", color: textMuted, flexShrink: 0 }}>{blk.date}</span>
                                      </div>
                                    );
                                  })}
                                  {blks.length > 4 && <div style={{ fontSize: "9px", color: textMuted }}>+{blks.length - 4} más</div>}
                                </div>
                                <div style={{ fontSize: "9px", color: textMuted, marginTop: "5px" }}>
                                  <Clock style={{ width: 8, height: 8, display: "inline", marginRight: "3px" }} />
                                  Último: {new Date(last.updatedAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── OFFICIAL POLICE ROAD CONDITIONS ── */}
                <div style={{ background: panelBg, border: `1px solid ${dark?"rgba(239,68,68,0.25)":borderC}`, borderRadius: "12px", padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
                    <AlertTriangle style={{ width: 13, height: 13, color: E.red, flexShrink: 0 }} />
                    <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: E.red }}>Cierres Oficiales — Policía Nacional</span>
                    <a href="https://www.policia.gov.co/estado-de-las-vias" target="_blank" rel="noopener noreferrer"
                       style={{ marginLeft: "auto", fontSize: "9px", color: E.cyan, textDecoration: "none", display: "flex", alignItems: "center", gap: "3px", flexShrink: 0 }}>
                      <ExternalLink style={{ width: 9, height: 9 }} /> policia.gov.co
                    </a>
                    <button
                      onClick={() => refreshRcMutation.mutate()}
                      disabled={refreshRcMutation.isPending || rcLoading}
                      title="Actualizar ahora"
                      style={{ background: "transparent", border: `1px solid ${borderC}`, borderRadius: "5px", padding: "3px 7px", cursor: "pointer", color: textMuted, display: "flex", alignItems: "center", gap: "3px", fontSize: "9px" }}>
                      <RefreshCw style={{ width: 9, height: 9, animation: (refreshRcMutation.isPending || rcLoading) ? "spin 1s linear infinite" : "none" }} />
                      {rcMeta?.fetchedAt ? `Act. ${new Date(rcMeta.fetchedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}` : "Actualizar"}
                    </button>
                  </div>

                  {/* Error banner */}
                  {rcMeta?.error && (
                    <div style={{ fontSize: "10px", color: E.amber, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "6px", padding: "6px 10px", marginBottom: "8px" }}>
                      ⚠️ {rcMeta.error} — Mostrando datos de última actualización disponible.
                    </div>
                  )}

                  {rcLoading ? (
                    <div style={{ textAlign: "center", color: textMuted, fontSize: "12px", padding: "20px 0" }}>Consultando policia.gov.co…</div>
                  ) : officialClosures.length === 0 ? (
                    <div style={{ textAlign: "center", color: textMuted, fontSize: "12px", padding: "20px 0", border: `1px dashed ${borderC}`, borderRadius: "8px" }}>
                      <div style={{ fontSize: "20px", marginBottom: "6px" }}>✅</div>
                      <div style={{ fontWeight: 600, color: dark ? "#e2eaf4" : "#1a2a3a" }}>Sin cierres oficiales reportados</div>
                      <div style={{ fontSize: "10px", marginTop: "3px" }}>para los departamentos de este corredor · Fuente se actualiza diariamente</div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {officialClosures.map((c, i) => {
                        const isTotalClosure = c.conditionCode === "cierre_total";
                        const accentColor = isTotalClosure ? E.red : E.amber;
                        return (
                          <div key={i} style={{ background: dark ? `${accentColor}08` : "#fff", border: `1px solid ${accentColor}30`, borderRadius: "8px", padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "6px" }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: "11px", fontWeight: 700, color: textMain, lineHeight: 1.3 }}>{c.via || "Vía sin nombre"}</div>
                                <div style={{ fontSize: "10px", color: textMuted, marginTop: "2px" }}>{c.department}{c.sector && c.sector !== "Sin Sector" ? ` · ${c.sector}` : ""}{c.km ? ` · ${c.km}` : ""}</div>
                              </div>
                              <span style={{ fontSize: "8px", fontWeight: 700, color: accentColor, background: `${accentColor}18`, padding: "2px 7px", borderRadius: "4px", flexShrink: 0, whiteSpace: "nowrap" }}>
                                {c.condition}
                              </span>
                            </div>
                            <div style={{ fontSize: "10px", color: textMuted, marginBottom: "3px" }}>
                              <span style={{ color: accentColor, fontWeight: 600 }}>Motivo:</span> {c.reason || "No especificado"}
                            </div>
                            {c.alternativeRoute && c.alternativeRoute !== "No aplica" && c.alternativeRoute !== "N/A" && (
                              <div style={{ fontSize: "10px", color: E.emerald, marginBottom: "3px" }}>
                                🔀 <span style={{ fontWeight: 600 }}>Vía alterna:</span> {c.alternativeRoute}
                              </div>
                            )}
                            <div style={{ display: "flex", gap: "12px", fontSize: "10px", color: textMuted, marginTop: "4px", flexWrap: "wrap" }}>
                              {c.startDate && <span>📅 Desde: <span style={{ color: textMain }}>{c.startDate.split(" - ").pop()?.trim() || c.startDate}</span></span>}
                              {c.indefinite
                                ? <span style={{ color: E.red, fontWeight: 700 }}>🔴 Cierre indefinido</span>
                                : c.endDate && <span>⏱ Hasta: <span style={{ color: textMain }}>{c.endDate.split(" - ").pop()?.trim() || c.endDate}</span></span>
                              }
                              {c.responsibleEntity && c.responsibleEntity !== "N/A" && (
                                <span>🏛 <span style={{ color: textMain }}>{c.responsibleEntity}</span></span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ fontSize: "9px", color: textMuted, textAlign: "right", marginTop: "2px" }}>
                        {officialClosures.length} cierre{officialClosures.length !== 1 ? "s" : ""} en este corredor · Fuente: policia.gov.co · Actualización diaria
                      </div>
                    </div>
                  )}
                </div>

                {/* User-registered blockades */}
                <div style={{ background: panelBg, border: `1px solid ${dark?"rgba(236,72,153,0.2)":borderC}`, borderRadius: "12px", padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                    <Ban style={{ width: 13, height: 13, color: E.pink }} />
                    <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: E.pink }}>Bloqueos Registrados por Operadores</span>
                    <button onClick={() => { setShowForm(true); setFormData(EMPTY_FORM(selectedCorridor.id, selectedCorridor.departments[0])); }} style={{ marginLeft: "auto", fontSize: "10px", fontWeight: 700, color: E.pink, background: "rgba(236,72,153,0.1)", border: "1px solid rgba(236,72,153,0.25)", borderRadius: "5px", padding: "4px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                      <Plus style={{ width: 10, height: 10 }} /> Nuevo registro
                    </button>
                  </div>
                  {corridorBlockades.length === 0 ? (
                    <div style={{ textAlign: "center", color: textMuted, fontSize: "12px", padding: "24px 0", border: `1px dashed ${borderC}`, borderRadius: "8px" }}>
                      <Ban style={{ width: 20, height: 20, color: E.pink, opacity: 0.3, margin: "0 auto 8px" }} />
                      <div>No hay bloqueos registrados para este corredor.</div>
                      <div style={{ fontSize: "11px", marginTop: "4px", opacity: 0.7 }}>Use el botón "Registrar Bloqueo" para reportar un cierre activo.</div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {corridorBlockades.map(blk => {
                        const statusInfo = STATUS_LABELS[blk.status];
                        return (
                          <div key={blk.id} style={{ background: dark?"rgba(236,72,153,0.04)":"#fff5f9", border: `1px solid ${dark?"rgba(236,72,153,0.15)":"rgba(236,72,153,0.15)"}`, borderRadius: "8px", padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                              <span style={{ fontSize: "11px", fontWeight: 700, color: textMain, flex: 1 }}>{blk.department} — {blk.location}</span>
                              <span style={{ fontSize: "8px", fontWeight: 700, color: statusInfo.color, background: `${statusInfo.color}18`, padding: "2px 7px", borderRadius: "4px" }}>{statusInfo.label}</span>
                              {/* Geo status indicator + recalculate button */}
                              <button
                                onClick={() => handleRegeocode(blk.id)}
                                disabled={regeocoding.has(blk.id)}
                                title={blk.lat != null ? "Coordenadas OK — clic para recalcular" : "Sin coordenadas — clic para geocodificar"}
                                style={{ background: "transparent", border: "none", cursor: regeocoding.has(blk.id) ? "wait" : "pointer", color: regeocodeDone.has(blk.id) ? "#10b981" : blk.lat != null ? "#00d4ff" : "#f59e0b", display: "flex", padding: "2px", opacity: regeocoding.has(blk.id) ? 0.5 : 1 }}
                              >
                                {regeocoding.has(blk.id)
                                  ? <RefreshCw style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />
                                  : <MapPin style={{ width: 11, height: 11 }} />}
                              </button>
                              <button onClick={() => deleteBlockadeMutation.mutate(blk.id)} title="Eliminar" style={{ background: "transparent", border: "none", cursor: "pointer", color: textMuted, display: "flex", padding: "2px" }}>
                                <X style={{ width: 11, height: 11 }} />
                              </button>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px 10px", fontSize: "10px" }}>
                              <div style={{ color: textMuted }}>📅 <span style={{ color: textMain }}>{blk.date}</span></div>
                              <div style={{ color: textMuted }}>⏱ <span style={{ color: textMain }}>{blk.durationHours ? `~${blk.durationHours}h` : "Indefinido"}</span></div>
                              <div style={{ color: textMuted }}>👤 <span style={{ color: textMain }}>{blk.reporter || "Anónimo"}</span></div>
                            </div>
                            <div style={{ marginTop: "5px", fontSize: "10px", color: textMuted }}>Causa: <span style={{ color: E.pink }}>{CAUSE_LABELS[blk.cause]}</span></div>
                            {blk.notes && <div style={{ marginTop: "4px", fontSize: "10px", color: textMuted, fontStyle: "italic" }}>{blk.notes}</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        );
      })()}

      {/* Tooltip */}
      {hovered && (
        <div style={{ position: "fixed", left: hovered.ex + 14, top: hovered.ey - 10, zIndex: 9999, pointerEvents: "none", background: dark?"rgba(8,14,26,0.97)":"rgba(255,255,255,0.97)", border: `1px solid ${borderC}`, borderRadius: "8px", padding: "10px 13px", backdropFilter: "blur(12px)", boxShadow: "0 4px 24px rgba(0,0,0,0.5)", minWidth: 160 }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: dark?"#e2eaf4":"#1a2a3a", marginBottom: "6px", textTransform: "capitalize" }}>
            {hovered.name.toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())}
          </div>
          {[
            { label: "Piratería 2026",    value: `${hovered.pirataCount} casos`, color: pirataRisk(hovered.pirataCount).color },
            { label: "Riesgo compuesto",  value: `${hovered.score}/100`,         color: compositeLabel(hovered.score).color },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: "10px", marginBottom: "3px" }}>
              <span style={{ fontSize: "10px", color: textMuted }}>{label}</span>
              <span style={{ fontSize: "11px", fontWeight: 700, color, fontFamily: "monospace" }}>{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
