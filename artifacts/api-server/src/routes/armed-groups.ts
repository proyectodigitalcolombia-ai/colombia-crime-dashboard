import { Router } from "express";
import { requireAuth } from "./auth";

const router = Router();

export interface GroupPresence {
  department: string;
  level: "alta" | "media" | "baja";
}

export interface ArmedGroup {
  id: string;
  name: string;
  shortName: string;
  color: string;
  description: string;
  activities: string[];
  logisticsRisk: "critical" | "high" | "medium" | "low";
  riskNote: string;
  annualIncidents: Record<string, number>;
  presence: GroupPresence[];
}

/*
 * Datos basados en:
 *  - INDEPAZ — Informe de Conflicto Armado 2024
 *  - FIP — Cómo va la paz 2024
 *  - CERAC — Base de Datos de Conflicto Armado Colombia
 *  - OCHA Colombia — Informes Humanitarios 2024
 *
 * Fuente oficial: https://indepaz.org.co / https://ideaspaz.org
 * Próxima actualización prevista: Q1 2026 (datos definitivos 2025)
 */
let ARMED_GROUPS: ArmedGroup[] = [
  {
    id: "eln",
    name: "ELN — Ejército de Liberación Nacional",
    shortName: "ELN",
    color: "#ef4444",
    description:
      "Principal guerrilla activa del país. Fuerte en fronteras con Venezuela y en el Pacífico. Principal amenaza para infraestructura petrolera y corredores logísticos del noroccidente.",
    activities: [
      "Extorsión a flotas de transporte",
      "Piratería terrestre",
      "Secuestro extorsivo",
      "Atentados a oleoductos",
      "Minería ilegal",
      "Bloqueos viales",
    ],
    logisticsRisk: "critical",
    riskNote:
      "Controla corredores clave: Arauca–Cúcuta (ruta Venezuela), Chocó–Urabá (acceso a puertos Pacífico). Cobra 'vacunas' sistemáticas a transportadores. Frecuentes bloqueos en vías terciarias.",
    annualIncidents: { "2022": 920, "2023": 880, "2024": 845, "2025": 810, "2026": 195 },
    presence: [
      { department: "Arauca", level: "alta" },
      { department: "Norte de Santander", level: "alta" },
      { department: "Chocó", level: "alta" },
      { department: "Antioquia", level: "media" },
      { department: "Bolívar", level: "media" },
      { department: "Nariño", level: "media" },
      { department: "La Guajira", level: "media" },
      { department: "Cesar", level: "media" },
      { department: "Sucre", level: "media" },
      { department: "Cundinamarca", level: "baja" },
      { department: "Santander", level: "baja" },
      { department: "Boyacá", level: "baja" },
      { department: "Córdoba", level: "baja" },
    ],
  },
  {
    id: "farc_emc",
    name: "FARC-EP — Estado Mayor Central (EMC)",
    shortName: "EMC / FARC",
    color: "#f59e0b",
    description:
      "Mayor facción disidente de las FARC. Domina corredores de narcotráfico en el sur y oriente. Declarados organización terrorista por el gobierno colombiano en 2023.",
    activities: [
      "Narcotráfico",
      "Extorsión a transportadores",
      "Piratería terrestre",
      "Reclutamiento forzado",
      "Minería ilegal",
      "Control de pasos fronterizos",
    ],
    logisticsRisk: "critical",
    riskNote:
      "Controla rutas Bogotá–Villavicencio (Meta), corredor Tumaco–frontera Ecuador. Extorsión sistemática a vehículos de carga pesada en el sur del país.",
    annualIncidents: { "2022": 380, "2023": 420, "2024": 395, "2025": 370, "2026": 88 },
    presence: [
      { department: "Meta", level: "alta" },
      { department: "Caquetá", level: "alta" },
      { department: "Putumayo", level: "alta" },
      { department: "Cauca", level: "alta" },
      { department: "Guaviare", level: "alta" },
      { department: "Nariño", level: "media" },
      { department: "Vichada", level: "media" },
      { department: "Amazonas", level: "media" },
      { department: "Vaupés", level: "baja" },
      { department: "Córdoba", level: "baja" },
      { department: "Tolima", level: "baja" },
      { department: "Huila", level: "baja" },
    ],
  },
  {
    id: "segunda_marquetalia",
    name: "Segunda Marquetalia — Iván Márquez",
    shortName: "2ª Marquetalia",
    color: "#a855f7",
    description:
      "Segunda facción disidente de las FARC. Activa en frontera con Ecuador y Venezuela. En diálogos intermitentes con el gobierno. Control de pasos fronterizos informales y corredores de coca.",
    activities: [
      "Narcotráfico",
      "Extorsión",
      "Tráfico de personas",
      "Control de pasos fronterizos",
    ],
    logisticsRisk: "high",
    riskNote:
      "Principal riesgo en el corredor Nariño–Putumayo hacia Ecuador. Controla pasos informales Rumichaca y Mataje. Afecta exportaciones por Tumaco.",
    annualIncidents: { "2022": 230, "2023": 265, "2024": 240, "2025": 215, "2026": 51 },
    presence: [
      { department: "Nariño", level: "alta" },
      { department: "Cauca", level: "media" },
      { department: "Putumayo", level: "media" },
      { department: "Meta", level: "baja" },
      { department: "Valle del Cauca", level: "baja" },
      { department: "Vichada", level: "baja" },
    ],
  },
  {
    id: "clan_golfo",
    name: "Clan del Golfo — AGC",
    shortName: "Clan del Golfo",
    color: "#10b981",
    description:
      "Mayor organización de crimen organizado del país. Controla tráfico de cocaína hacia Europa y Centroamérica desde puertos del Caribe. Fuerte en Urabá y la Costa.",
    activities: [
      "Narcotráfico",
      "Tráfico de personas",
      "Extorsión a transportadores",
      "Piratería terrestre",
      "Control de puertos",
      "Lavado de activos",
    ],
    logisticsRisk: "high",
    riskNote:
      "Controla puertos de Turbo y Montería. Extorsión a camioneros en Córdoba y Urabá. Riesgo en la ruta Bogotá–Costa Caribe. Influencia en terminales marítimos de Buenaventura.",
    annualIncidents: { "2022": 290, "2023": 315, "2024": 308, "2025": 290, "2026": 72 },
    presence: [
      { department: "Antioquia", level: "alta" },
      { department: "Chocó", level: "alta" },
      { department: "Córdoba", level: "alta" },
      { department: "Sucre", level: "media" },
      { department: "Bolívar", level: "media" },
      { department: "La Guajira", level: "media" },
      { department: "Atlántico", level: "media" },
      { department: "Valle del Cauca", level: "baja" },
      { department: "Magdalena", level: "baja" },
      { department: "Cesar", level: "baja" },
    ],
  },
  {
    id: "pandillas",
    name: "Organizaciones Criminales Locales",
    shortName: "Combos / Pandillas",
    color: "#64748b",
    description:
      "Bandas criminales urbanas. Principal amenaza en hurtos a personas y comercio en zonas metropolitanas. Operan como satélites de los grupos mayores para distribución local.",
    activities: [
      "Hurto a comercios",
      "Microtráfico",
      "Extorsión local",
      "Hurto a personas",
      "Sicariato",
    ],
    logisticsRisk: "medium",
    riskNote:
      "Riesgo concentrado en perímetros urbanos de Bogotá, Medellín, Cali y Barranquilla. Menor impacto en rutas intermunicipales pero alto en zonas de cargue/descargue.",
    annualIncidents: { "2022": 1850, "2023": 1920, "2024": 1780, "2025": 1650, "2026": 390 },
    presence: [
      { department: "Bogotá D.C.", level: "alta" },
      { department: "Valle del Cauca", level: "alta" },
      { department: "Antioquia", level: "alta" },
      { department: "Atlántico", level: "media" },
      { department: "Bolívar", level: "media" },
      { department: "Norte de Santander", level: "media" },
      { department: "Nariño", level: "media" },
      { department: "Córdoba", level: "baja" },
      { department: "Santander", level: "baja" },
    ],
  },
];

let lastUpdated = new Date().toISOString();
let dataSource = "INDEPAZ 2024 / FIP 2024 / CERAC (estimados)";

// GET /api/armed-groups — lista todos los grupos con sus datos completos
router.get("/armed-groups", (_req, res) => {
  res.json({
    groups: ARMED_GROUPS,
    meta: {
      lastUpdated,
      dataSource,
      note: "Datos estimados basados en informes públicos de INDEPAZ, FIP y CERAC. Actualización trimestral.",
      totalGroups: ARMED_GROUPS.length,
      totalIncidents2024: ARMED_GROUPS.reduce(
        (s, g) => s + (g.annualIncidents["2024"] ?? 0),
        0
      ),
    },
  });
});

// GET /api/armed-groups/by-department — presencia agregada por departamento
router.get("/armed-groups/by-department", (_req, res) => {
  const deptMap: Record<string, { groups: { groupId: string; groupName: string; shortName: string; color: string; level: "alta" | "media" | "baja" }[]; maxRisk: string }> = {};

  const riskOrder = { critical: 4, high: 3, medium: 2, low: 1 };

  for (const group of ARMED_GROUPS) {
    for (const p of group.presence) {
      if (!deptMap[p.department]) deptMap[p.department] = { groups: [], maxRisk: "low" };
      deptMap[p.department].groups.push({
        groupId: group.id,
        groupName: group.name,
        shortName: group.shortName,
        color: group.color,
        level: p.level,
      });
      const groupRiskVal = riskOrder[group.logisticsRisk] ?? 0;
      const currentMaxVal = riskOrder[deptMap[p.department].maxRisk as keyof typeof riskOrder] ?? 0;
      if (groupRiskVal > currentMaxVal) deptMap[p.department].maxRisk = group.logisticsRisk;
    }
  }

  const result = Object.entries(deptMap).map(([department, data]) => ({
    department,
    groups: data.groups,
    groupCount: data.groups.length,
    maxRisk: data.maxRisk,
    highPresenceCount: data.groups.filter(g => g.level === "alta").length,
  })).sort((a, b) => b.groupCount - a.groupCount);

  res.json(result);
});

// POST /api/armed-groups/update — actualiza los datos (requiere autenticación)
router.post("/armed-groups/update", requireAuth, (req, res) => {
  try {
    const { groups, source, note } = req.body as {
      groups?: ArmedGroup[];
      source?: string;
      note?: string;
    };
    if (!groups || !Array.isArray(groups) || groups.length === 0) {
      res.status(400).json({ error: "Se requiere el campo 'groups' con al menos un grupo." });
      return;
    }
    ARMED_GROUPS = groups;
    lastUpdated = new Date().toISOString();
    if (source) dataSource = source;
    console.log(`Armed groups data updated by admin. Source: ${source ?? "no especificado"}. Note: ${note ?? ""}`);
    res.json({
      ok: true,
      message: `Datos actualizados correctamente. ${groups.length} grupos cargados.`,
      lastUpdated,
      dataSource,
    });
  } catch (err) {
    res.status(500).json({ error: "Error al actualizar los datos." });
  }
});

export default router;
