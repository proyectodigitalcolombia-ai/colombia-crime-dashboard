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
      "Estructura guerrillera de mayor trayectoria operacional activa en el territorio nacional. Su despliegue se concentra en corredores de frontera con Venezuela y zonas de valor estratégico para las economías ilegales. En 2024, el ELN amplió su área de influencia de 99 a 167 municipios en 17 departamentos, con presencia sostenida en áreas de infraestructura crítica de hidrocarburos y principales ejes de conectividad logística del noroccidente del país. Aproximadamente el 50% de su fuerza opera en territorio venezolano o en la zona fronteriza colombo-venezolana, en articulación con el régimen de ese país.",
    activities: [
      "Extorsión sistemática a flotas de transporte",
      "Piratería terrestre en corredores críticos",
      "Secuestro extorsivo y desaparición forzada",
      "Atentados a infraestructura de hidrocarburos",
      "Paros armados y bloqueos viales",
      "Minería ilegal de oro y coltán",
      "Reclutamiento forzado en zonas rurales",
    ],
    logisticsRisk: "critical",
    riskNote:
      "Ejerce control territorial sobre los corredores Arauca–Cúcuta–frontera venezolana y el eje Chocó–Urabá–puertos del Pacífico. El cobro de 'vacunas' a vehículos de transporte de carga y la declaración de paros armados constituyen la amenaza directa más significativa para las operaciones logísticas en sus áreas de influencia. Se registran bloqueos periódicos en vías secundarias y terciarias que afectan la conectividad con zonas de producción agroindustrial y corredores de exportación. Las operaciones con origen o destino en Arauca, Norte de Santander y Chocó requieren evaluación especial de riesgo previo al despacho.",
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
      "Mayor estructura disidente de las FARC-EP, que rechazó el Acuerdo de Paz de 2016 y continuó operaciones armadas. Declarada organización terrorista por el Gobierno Nacional en 2023. Entre 2023 y 2024 amplió su accionar de 56 a 113 municipios, dominando los corredores estratégicos de producción y tráfico de clorhidrato de cocaína en el sur y oriente del país. Mantiene articulación con carteles mexicanos del narcotráfico para la exportación de estupefacientes, operando como eje central del negocio criminal más lucrativo del país.",
    activities: [
      "Narcotráfico con proyección internacional",
      "Extorsión a vehículos de carga pesada",
      "Piratería terrestre en corredores del sur",
      "Reclutamiento forzado en comunidades rurales",
      "Control de pasos fronterizos informales",
      "Minería ilegal y economías ilegales complementarias",
    ],
    logisticsRisk: "critical",
    riskNote:
      "Ejerce control sobre los corredores Bogotá–Villavicencio (departamento del Meta) y Tumaco–frontera Ecuador (Nariño–Putumayo). Practica la extorsión sistemática a vehículos de carga pesada en el sur del país, siendo el piedemonte llanero y el Pacífico sur sus zonas de mayor actividad extorsiva. Las operaciones con destino a los puertos de Tumaco y las rutas de abastecimiento del Meta y Caquetá requieren monitoreo permanente y actualización de la matriz de riesgo en ruta ante la posibilidad de retenciones e imposición de 'vacunas'.",
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
      "Segunda facción disidente de las FARC-EP, surgida tras el rompimiento del cese al fuego bilateral en 2019. Mantiene articulación operacional con el régimen venezolano a través de corredores en la frontera colombo-venezolana, utilizando territorio venezolano como retaguardia estratégica. Su área de influencia se concentra en departamentos fronterizos del Pacífico sur y la Amazonia, con control de pasos informales y rutas primarias de exportación de clorhidrato de cocaína hacia Ecuador y Perú. Se encuentra en proceso de diálogos intermitentes con el Gobierno Nacional.",
    activities: [
      "Narcotráfico hacia Ecuador y Perú",
      "Extorsión a operadores logísticos fronterizos",
      "Tráfico de personas y migrantes irregulares",
      "Control de pasos fronterizos informales",
      "Cobro de 'peajes' ilegales en vías rurales",
    ],
    logisticsRisk: "high",
    riskNote:
      "Área de riesgo crítico: corredor Nariño–Putumayo con proyección hacia Ecuador. Ejerce control sobre los pasos informales en la zona del río Naya y puntos de cruce fronterizo no oficiales. Las operaciones logísticas con origen o destino en Tumaco y municipios del bajo Putumayo deben ser objeto de evaluación especial de riesgo, dada la capacidad de esta estructura para imponer restricciones de movilidad y cobros ilegales a vehículos de carga.",
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
      "Organización armada ilegal de mayor despliegue territorial del país, con presencia activa en más de 211 municipios. Su objetivo estratégico central es el enriquecimiento ilícito mediante la producción y comercialización de clorhidrato de cocaína hacia mercados de Europa y Norteamérica, en alianza con el cartel mexicano de Sinaloa. Ejerce control sobre zonas portuarias del Caribe y amplias áreas rurales de la Costa Atlántica. Ha escalado significativamente su accionar en Buenaventura (Pacífico), generando una suerte de reestructuración del control territorial urbano y portuario en esa ciudad estratégica para el comercio exterior colombiano.",
    activities: [
      "Narcotráfico con proyección transnacional (Europa, USA)",
      "Extorsión a transportadores de carga y conductores",
      "Piratería terrestre en Costa Atlántica y Córdoba",
      "Control de zonas portuarias (Turbo, Buenaventura)",
      "Tráfico de personas y lavado de activos",
      "Asesinatos selectivos y toques de queda en áreas urbanas",
    ],
    logisticsRisk: "high",
    riskNote:
      "Ejerce influencia sobre los puertos de Turbo, Montería y terminales de Buenaventura. La extorsión a camioneros y conductores en Córdoba, Urabá y la Costa Atlántica representa una amenaza directa y permanente para las operaciones de transporte terrestre de carga. Se identifican riesgos específicos en la ruta Bogotá–Costa Caribe (Ruta del Sol), tramos Aguachica–Curumaní y Carmen de Bolívar–Bosconia. En Buenaventura, su disputa territorial con el ELN y estructuras GAPF ha generado bloqueos portuarios y restricciones de movilidad con impacto directo sobre operaciones de exportación e importación.",
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
      "Estructuras criminales de orden local que operan como satélites de las grandes organizaciones armadas ilegales (GAO), ejecutando actividades de distribución de narcóticos a escala urbana, extorsión a pequeños y medianos comercios, hurtos de alto impacto y sicariato. Su actuación se concentra en los grandes centros urbanos del país. El incremento de acciones terroristas de los GAO ha generado, en muchos casos, el desplazamiento de estas estructuras menores hacia áreas periurbanas y zonas industriales, ampliando el riesgo para las operaciones logísticas de distribución y última milla.",
    activities: [
      "Hurto a comercios y bodegas de almacenamiento",
      "Microtráfico y distribución urbana de narcóticos",
      "Extorsión a pequeñas y medianas empresas",
      "Hurto de vehículos y carga en zonas de descargue",
      "Sicariato y control de territorios urbanos",
    ],
    logisticsRisk: "medium",
    riskNote:
      "El riesgo operacional se concentra en los perímetros urbanos y zonas de cargue y descargue de mercancías en Bogotá (Soacha, Bosa, Kennedy), Medellín (Valle de Aburrá, Itagüí), Cali (Palmira, Yumbo) y Barranquilla. Aunque su impacto en rutas intermunicipales es relativamente menor frente a los GAO, representan la principal amenaza para la integridad de conductores y la seguridad de la carga en operaciones de distribución urbana de última milla. Se recomienda protocolos de verificación en zonas de cargue nocturno y planificación de rutas internas en áreas metropolitanas.",
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
