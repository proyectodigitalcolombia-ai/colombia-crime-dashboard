import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { jsPDF } from "jspdf";
import {
  useGetNationalMonthly,
  useGetCrimesByDepartment,
  useGetBlockades,
} from "@workspace/api-client-react";
import { Building2, Upload, Download, Palette, User, Mail, Phone, FileText, CheckCircle2, RefreshCw, Globe, Sparkles, AlertTriangle } from "lucide-react";
import safeNodeLogoUrl from "../assets/safenode-logo.png";
import { useAuth, type UserConfig } from "@/context/AuthContext";

const LS_KEY = "colombia_report_config_v2";

interface ReportConfig {
  companyName: string;
  companySubtitle: string;
  analystName: string;
  analystEmail: string;
  analystPhone: string;
  primaryColor: string;
  logoDataUrl: string;
  footerDisclaimer: string;
}

const DEFAULTS: ReportConfig = {
  companyName: "SafeNode S.A.S.",
  companySubtitle: "Inteligencia en Seguridad Logística y Transporte",
  analystName: "Analista de Seguridad",
  analystEmail: "seguridad@safenode.com.co",
  analystPhone: "+57 300 000 0000",
  primaryColor: "#00bcd4",
  logoDataUrl: "",
  footerDisclaimer: "Documento confidencial — uso exclusivo interno.",
};

function userToConfig(u: UserConfig): Partial<ReportConfig> {
  return {
    companyName:      u.companyName      || DEFAULTS.companyName,
    companySubtitle:  u.companySubtitle  || DEFAULTS.companySubtitle,
    analystName:      u.analystName      || DEFAULTS.analystName,
    analystEmail:     u.analystEmail     || DEFAULTS.analystEmail,
    analystPhone:     u.analystPhone     || DEFAULTS.analystPhone,
    primaryColor:     u.primaryColor     || DEFAULTS.primaryColor,
    footerDisclaimer: u.footerDisclaimer || DEFAULTS.footerDisclaimer,
  };
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function isLight(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 155;
}

function darken(hex: string, amount = 40): [number, number, number] {
  const { r, g, b } = hexToRgb(hex);
  return [Math.max(0, r - amount), Math.max(0, g - amount), Math.max(0, b - amount)];
}

/* ─── Language support ─── */
type LangCode = "es" | "en" | "fr" | "pt" | "de" | "ko";

interface LangOption { code: LangCode; flag: string; label: string }
const LANG_OPTIONS: LangOption[] = [
  { code: "es", flag: "🇨🇴", label: "Español" },
  { code: "en", flag: "🇺🇸", label: "English" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "pt", flag: "🇧🇷", label: "Português" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "ko", flag: "🇰🇷", label: "한국어" },
];

interface T {
  months: string[];
  monthsFull: string[];
  /* cover */
  confidential: string;
  situationBadge: string;
  envLine: string;
  reportTitle: string;
  impactLine1: string;
  impactLine2: string;
  period: string;
  sourceLine: string;
  classification: string;
  /* header/footer */
  headerSub: (year: number) => string;
  pageLabel: string;
  generatedLabel: string;
  /* section headers */
  hdr2: string;
  hdr3: string;
  hdr4: (prevY: number, curY: number) => string;
  hdr5: string;
  hdr6: string;
  /* page 2 */
  apreciacionTitle: string;
  sec1Title: string;
  sec1Para: (year: number, total: string, company: string) => string;
  kpi1Label: string; kpi1Sub: (year: number) => string;
  kpi2Label: string; kpi2Cases: string;
  kpi3Label: string; kpi3Cases: string;
  kpi4Label: string; kpi4Ok: string; kpi4Alert: string;
  sec11Title: string;
  stat1: string; stat2: string; stat3: string; stat4: string;
  of32: string;
  /* page 3 */
  sec2Title: string;
  sec2Para: (year: number) => string;
  deptTableH: string[];
  sec21Title: string;
  /* page 4 */
  sec3Title: string;
  sec3Para: (year: number) => string;
  typeTableH: string[];
  sec31Title: string;
  /* page 5 */
  registered: string;
  variation: string;
  increase: string;
  decrease: string;
  sec41Title: string;
  sec42Title: string;
  colMes: string; colDiff: string; colVar: string; colTrend: string;
  trendUp: string; trendDown: string; trendFlat: string;
  nd: string;
  interpIncrease: (year: number, prevY: number, abs: string, pct: string) => string;
  interpDecrease: (year: number, prevY: number, abs: string, pct: string) => string;
  noDataPrev: (year: number) => string;
  /* page 6 */
  blockadeAlert: (n: number) => string;
  blockadeOk: string;
  blkTableH: string[];
  active: string;
  conclusionsTitle: string;
  conclusionsSubtitle: string;
  concl1: (year: number, total: string, depts: number) => string;
  concl2: (dept: string, cases: string, pct: string) => string;
  concl3: (crime: string, cases: string) => string;
  concl4: (month: string, cases: string) => string;
  concl5Alert: (n: number) => string;
  concl5Ok: string;
  concl6: string;
  elaboratedBy: string;
  /* page 7 (AI) */
  sec6Title: string;
  sec6Heading: string;
  sec61Title: string;
  sec62Title: string;
  sec63Title: string;
  sec64Title: string;
  affectedDepts: string;
  riesgo: string;
  aiNote: (name: string) => string;
  /* filename prefix */
  filePrefix: string;
}

const TRANS: Record<LangCode, T> = {
  es: {
    months: ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"],
    monthsFull: ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"],
    confidential: "CONFIDENCIAL",
    situationBadge: "APRECIACIÓN DE SITUACIÓN DE SEGURIDAD",
    envLine: "EL AMBIENTE OPERACIONAL DE LA SEGURIDAD",
    reportTitle: "INFORME GERENCIAL",
    impactLine1: "Y SU IMPACTO EN LAS OPERACIONES LOGÍSTICAS",
    impactLine2: "Y DE TRANSPORTE TERRESTRE DE CARGA",
    period: "Período",
    sourceLine: "Fuente: Policía Nacional de Colombia — AICRI  ·  INDEPAZ  ·  FIP  ·  CERAC",
    classification: "CLASIFICACIÓN: CONFIDENCIAL — USO EXCLUSIVO INTERNO",
    headerSub: (y) => `Informe Gerencial de Seguridad — ${y}`,
    pageLabel: "Pág.",
    generatedLabel: "Generado:",
    hdr2: "APRECIACIÓN DE SITUACIÓN — AMBIENTE OPERACIONAL",
    hdr3: "2. Ambiente Operacional — Incidencia Departamental",
    hdr4: (p, c) => `4. Análisis Comparativo del Ambiente Operacional: ${p} vs ${c}`,
    hdr5: "5. Bloqueos Viales — CONCLUSIONES Y LINEAMIENTOS ESTRATÉGICOS",
    hdr6: "6. Fuente Documental — Análisis de Inteligencia",
    apreciacionTitle: "APRECIACIÓN DE SITUACIÓN",
    sec1Title: "1.  Situación General.",
    sec1Para: (year, total, company) => `El ambiente socio-económico y de seguridad en Colombia durante el período ${year} registra ${total} eventos delictivos de acuerdo con los datos estadísticos de la Policía Nacional — Sistema AICRI. El análisis de esta información, elaborado para ${company}, tiene como propósito brindar elementos de juicio para la toma de decisiones estratégicas en materia de seguridad logística y transporte terrestre de carga. Los factores determinantes del ambiente operacional de seguridad en el período incluyen: la actividad de los Grupos Armados Organizados (GAO) en corredores estratégicos de movilidad, la piratería terrestre en accesos a los principales centros urbanos y puertos, y el comportamiento de los delitos de alto impacto social en los departamentos de mayor incidencia.`,
    kpi1Label: "TOTAL DELITOS REGISTRADOS", kpi1Sub: (y) => `Año ${y}`,
    kpi2Label: "DEPTO. MAYOR INCIDENCIA", kpi2Cases: "casos",
    kpi3Label: "DELITO MÁS FRECUENTE", kpi3Cases: "casos",
    kpi4Label: "BLOQUEOS VIALES ACTIVOS", kpi4Ok: "Sin bloqueos activos", kpi4Alert: "⚠ Verificar corredores",
    sec11Title: "1.1  Indicadores de Incidencia del Período",
    stat1: "Departamentos con datos", stat2: "Tipos de delito analizados", stat3: "Meses con registros", stat4: "Promedio mensual",
    of32: "de 32",
    sec2Title: "2.  Ambiente operacional de la seguridad — Incidencia por departamento.",
    sec2Para: (year) => `El siguiente análisis departamental de incidencia delictiva para el período ${year} constituye un elemento esencial para la evaluación del riesgo compuesto en los principales corredores de movilidad del país. La concentración de eventos delictivos por departamento permite priorizar esquemas de seguridad diferenciados y determinar los niveles de protección requeridos para las operaciones logísticas y de transporte terrestre de carga según la región de destino u origen.`,
    deptTableH: ["#", "DEPARTAMENTO", "TOTAL CASOS", "% NAL."],
    sec21Title: "2.1  Comparativo visual — Top 10 departamentos",
    sec3Title: "3.  Modalidades delictivas — Delitos de alto impacto para el transporte terrestre de carga.",
    sec3Para: (year) => `En general, se observa para el período ${year} un comportamiento diferenciado por modalidad delictiva. Entre los delitos de mayor impacto directo para las operaciones logísticas y de transporte terrestre, la piratería terrestre y el hurto de vehículos constituyen los de mayor criticidad operacional, seguidos por la extorsión a conductores en tramos de alta incidencia de grupos armados ilegales. Los datos estadísticos siguientes deberán ser correlacionados con el análisis de presencia de GAO por departamento para determinar el riesgo compuesto en cada corredor de movilidad.`,
    typeTableH: ["#", "TIPO DE DELITO", "TOTAL CASOS", "% DEL TOTAL"],
    sec31Title: "3.1  Tendencia mensual — Factores estacionales y del conflicto",
    registered: "delitos registrados",
    variation: "Variación",
    increase: "aumento interanual",
    decrease: "reducción interanual",
    sec41Title: "4.1  Variación del ambiente operacional — Evolución mensual comparativa",
    sec42Title: "4.2  Detalle mensual",
    colMes: "MES", colDiff: "DIFERENCIA", colVar: "VARIACIÓN", colTrend: "TENDENCIA",
    trendUp: "(+) Alza", trendDown: "(-) Baja", trendFlat: "(=) Estable",
    nd: "N/D",
    interpIncrease: (y, p, abs, pct) => `El análisis comparativo del período ${y} frente a ${p} evidencia un incremento de ${abs} eventos delictivos, representando una variación positiva del ${pct}%. Este comportamiento deberá ser especialmente considerado en la revisión de los planes de contingencia y en la actualización de la matriz de riesgo en ruta. Se recomienda reforzar los esquemas de seguridad motorizados y el monitoreo en tiempo real en los corredores con mayor concentración de incidentes.`,
    interpDecrease: (y, p, abs, pct) => `El análisis comparativo del período ${y} frente a ${p} evidencia una reducción de ${abs} eventos delictivos, representando una variación del -${pct}%. No obstante, la reducción en delitos de alto impacto social puede estar asociada al incremento de acciones de carácter terrorista por parte de grupos armados ilegales, aspecto que deberá ser especialmente considerado en las previsiones del ambiente operacional de seguridad logística.`,
    noDataPrev: (y) => `No hay datos disponibles para el año ${y} para realizar la comparación.`,
    blockadeAlert: (n) => `[!]  ${n} BLOQUEO(S) ACTIVO(S) — Verificar corredores antes de despachar carga`,
    blockadeOk: "[OK]  Sin bloqueos viales activos al momento de este informe",
    blkTableH: ["DEPARTAMENTO", "UBICACIÓN", "FECHA", "CAUSA", "ESTADO"],
    active: "ACTIVO",
    conclusionsTitle: "CONCLUSIONES.",
    conclusionsSubtitle: "Lineamientos estratégicos de gestión de seguridad logística:",
    concl1: (y, total, depts) => `Situación general: El período ${y} registra un total de ${total} eventos delictivos en Colombia, con datos disponibles para ${depts} departamentos. El análisis determina que la mayor concentración de incidencia se mantiene en los principales centros urbanos y corredores de conectividad logística interregional.`,
    concl2: (dept, cases, pct) => `Departamento de mayor incidencia: ${dept} concentra ${cases} casos, representando el ${pct}% del total nacional. Los planes de seguridad con operaciones en este departamento deberán considerar un nivel de riesgo compuesto elevado y contar con esquemas de escolta o monitoreo reforzado.`,
    concl3: (crime, cases) => `Delito de mayor impacto logístico: "${crime}" es el tipo delictivo predominante con ${cases} casos. Se recomienda actualizar los procedimientos operativos de seguridad en instalaciones, vehículos y zonas de cargue/descargue conforme a esta tipología.`,
    concl4: (month, cases) => `Período de mayor concentración: El mes de ${month} registró el pico más alto del período con ${cases} eventos. Este comportamiento estacional deberá ser considerado en la planificación de recursos de seguridad para períodos equivalentes en el siguiente año.`,
    concl5Alert: (n) => `ALERTA OPERACIONAL: Se registran ${n} bloqueo(s) vial(es) activo(s) al momento de la generación del presente informe. Es imperativo validar rutas alternativas y coordinar con la central de monitoreo antes de programar cualquier despacho en los corredores afectados.`,
    concl5Ok: "Estado de corredores: No se registran bloqueos viales activos al momento de este informe. Las condiciones de circulación en los corredores monitoreados son normales. Se mantiene la recomendación de monitoreo permanente ante la posibilidad de paros armados por parte de grupos armados ilegales.",
    concl6: "Recomendación estratégica: Se recomienda la revisión semanal del presente informe, la actualización permanente de la matriz de riesgo en ruta, y la implementación de un esquema de monitoreo 24/7 en la Central de Tráfico, con ajuste de los planes de despacho según la evolución del ambiente operacional de seguridad en los corredores de interés.",
    elaboratedBy: "Elaborado por:",
    sec6Title: "6. Fuente Documental — Análisis de Inteligencia",
    sec6Heading: "6.  Análisis de Documento Gubernamental — Apreciación de Inteligencia.",
    sec61Title: "6.1  Resumen ejecutivo.",
    sec62Title: "6.2  Hallazgos relevantes para operaciones logísticas.",
    sec63Title: "6.3  Amenazas identificadas.",
    sec64Title: "6.4  Recomendación operacional para gestión de transporte y logística.",
    affectedDepts: "Departamentos afectados:",
    riesgo: "RIESGO",
    aiNote: (name) => `[Análisis generado por IA (Claude) sobre el documento: ${name}]`,
    filePrefix: "informe_seguridad",
  },
  en: {
    months: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
    monthsFull: ["January","February","March","April","May","June","July","August","September","October","November","December"],
    confidential: "CONFIDENTIAL",
    situationBadge: "SECURITY SITUATION ASSESSMENT",
    envLine: "THE SECURITY OPERATIONAL ENVIRONMENT",
    reportTitle: "EXECUTIVE REPORT",
    impactLine1: "AND ITS IMPACT ON LOGISTICS OPERATIONS",
    impactLine2: "AND ROAD FREIGHT TRANSPORTATION",
    period: "Period",
    sourceLine: "Source: National Police of Colombia — AICRI  ·  INDEPAZ  ·  FIP  ·  CERAC",
    classification: "CLASSIFICATION: CONFIDENTIAL — FOR INTERNAL USE ONLY",
    headerSub: (y) => `Executive Security Report — ${y}`,
    pageLabel: "Page",
    generatedLabel: "Generated:",
    hdr2: "SITUATION ASSESSMENT — OPERATIONAL ENVIRONMENT",
    hdr3: "2. Operational Environment — Departmental Incidence",
    hdr4: (p, c) => `4. Comparative Operational Analysis: ${p} vs ${c}`,
    hdr5: "5. Road Blockades — CONCLUSIONS & STRATEGIC GUIDELINES",
    hdr6: "6. Documentary Source — Intelligence Analysis",
    apreciacionTitle: "SITUATION ASSESSMENT",
    sec1Title: "1.  General Situation.",
    sec1Para: (year, total, company) => `The socio-economic and security environment in Colombia during the ${year} period recorded ${total} criminal events according to statistical data from the National Police — AICRI System. This analysis, prepared for ${company}, aims to provide decision-support elements for strategic decision-making in logistics security and road freight transportation. The key determining factors of the security operational environment during this period include: the activity of Organized Armed Groups (GAO) in strategic mobility corridors, terrestrial piracy at access points to major urban centers and ports, and the behavior of high-impact crimes in the most affected departments.`,
    kpi1Label: "TOTAL REGISTERED CRIMES", kpi1Sub: (y) => `Year ${y}`,
    kpi2Label: "HIGHEST INCIDENCE DEPT.", kpi2Cases: "cases",
    kpi3Label: "MOST FREQUENT CRIME", kpi3Cases: "cases",
    kpi4Label: "ACTIVE ROAD BLOCKADES", kpi4Ok: "No active blockades", kpi4Alert: "⚠ Verify corridors",
    sec11Title: "1.1  Period Incidence Indicators",
    stat1: "Departments with data", stat2: "Crime types analyzed", stat3: "Months with records", stat4: "Monthly average",
    of32: "of 32",
    sec2Title: "2.  Security operational environment — Departmental incidence.",
    sec2Para: (year) => `The following departmental analysis of criminal incidence for the ${year} period constitutes an essential element for the compound risk assessment of the country's main mobility corridors. The concentration of criminal events by department allows security schemes to be prioritized and the required protection levels to be determined for logistics and road freight operations based on the destination or origin region.`,
    deptTableH: ["#", "DEPARTMENT", "TOTAL CASES", "% NAT."],
    sec21Title: "2.1  Visual comparison — Top 10 departments",
    sec3Title: "3.  Criminal patterns — High-impact crimes for road freight transportation.",
    sec3Para: (year) => `In general, a differentiated pattern by criminal modality is observed for the ${year} period. Among the crimes with the greatest direct impact on logistics and road freight operations, terrestrial piracy and vehicle theft represent the highest operational criticality, followed by extortion of drivers on road sections with high illegal armed group activity. The following statistical data should be cross-referenced with the GAO presence analysis by department to determine the compound risk in each mobility corridor.`,
    typeTableH: ["#", "CRIME TYPE", "TOTAL CASES", "% OF TOTAL"],
    sec31Title: "3.1  Monthly trend — Seasonal and conflict factors",
    registered: "crimes recorded",
    variation: "Variation",
    increase: "year-on-year increase",
    decrease: "year-on-year decrease",
    sec41Title: "4.1  Operational environment variation — Monthly comparative evolution",
    sec42Title: "4.2  Monthly detail",
    colMes: "MONTH", colDiff: "DIFFERENCE", colVar: "VARIATION", colTrend: "TREND",
    trendUp: "(+) Rise", trendDown: "(-) Drop", trendFlat: "(=) Stable",
    nd: "N/A",
    interpIncrease: (y, p, abs, pct) => `The comparative analysis of the ${y} period versus ${p} shows an increase of ${abs} criminal events, representing a positive variation of ${pct}%. This behavior should be especially considered when reviewing contingency plans and updating the route risk matrix. It is recommended to reinforce motorized security schemes and real-time monitoring in corridors with the highest incident concentration.`,
    interpDecrease: (y, p, abs, pct) => `The comparative analysis of the ${y} period versus ${p} shows a reduction of ${abs} criminal events, representing a variation of -${pct}%. However, the reduction in high-impact crimes may be associated with an increase in terrorist actions by illegal armed groups, an aspect that should be especially considered in logistics security operational environment forecasts.`,
    noDataPrev: (y) => `No data available for the year ${y} to perform the comparison.`,
    blockadeAlert: (n) => `[!]  ${n} ACTIVE ROAD BLOCKADE(S) — Verify corridors before dispatching cargo`,
    blockadeOk: "[OK]  No active road blockades at the time of this report",
    blkTableH: ["DEPARTMENT", "LOCATION", "DATE", "CAUSE", "STATUS"],
    active: "ACTIVE",
    conclusionsTitle: "CONCLUSIONS.",
    conclusionsSubtitle: "Strategic logistics security management guidelines:",
    concl1: (y, total, depts) => `General situation: The ${y} period records a total of ${total} criminal events in Colombia, with data available for ${depts} departments. The analysis determines that the highest concentration of incidence remains in the main urban centers and inter-regional logistics connectivity corridors.`,
    concl2: (dept, cases, pct) => `Highest incidence department: ${dept} concentrates ${cases} cases, representing ${pct}% of the national total. Security plans with operations in this department should consider a high compound risk level and include escort or reinforced monitoring schemes.`,
    concl3: (crime, cases) => `Greatest logistics-impact crime: "${crime}" is the predominant crime type with ${cases} cases. It is recommended to update operational security procedures in facilities, vehicles, and loading/unloading areas according to this typology.`,
    concl4: (month, cases) => `Peak concentration period: The month of ${month} recorded the highest peak of the period with ${cases} events. This seasonal behavior should be considered in security resource planning for equivalent periods in the following year.`,
    concl5Alert: (n) => `OPERATIONAL ALERT: ${n} active road blockade(s) registered at the time this report was generated. It is imperative to validate alternative routes and coordinate with the monitoring center before scheduling any dispatches on affected corridors.`,
    concl5Ok: "Corridor status: No active road blockades registered at the time of this report. Traffic conditions on monitored corridors are normal. Permanent monitoring is recommended given the possibility of armed stoppages by illegal armed groups.",
    concl6: "Strategic recommendation: Weekly review of this report is recommended, along with permanent updating of the route risk matrix and implementation of a 24/7 monitoring scheme at the Traffic Control Center, with dispatch plans adjusted according to the evolution of the security operational environment in corridors of interest.",
    elaboratedBy: "Prepared by:",
    sec6Title: "6. Documentary Source — Intelligence Analysis",
    sec6Heading: "6.  Government Document Analysis — Intelligence Assessment.",
    sec61Title: "6.1  Executive summary.",
    sec62Title: "6.2  Relevant findings for logistics operations.",
    sec63Title: "6.3  Identified threats.",
    sec64Title: "6.4  Operational recommendation for transport and logistics management.",
    affectedDepts: "Affected departments:",
    riesgo: "RISK",
    aiNote: (name) => `[AI-generated analysis (Claude) on document: ${name}]`,
    filePrefix: "security_report",
  },
  fr: {
    months: ["Jan","Fév","Mar","Avr","Mai","Jui","Jul","Aoû","Sep","Oct","Nov","Déc"],
    monthsFull: ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"],
    confidential: "CONFIDENTIEL",
    situationBadge: "APPRÉCIATION DE LA SITUATION DE SÉCURITÉ",
    envLine: "L'ENVIRONNEMENT OPÉRATIONNEL DE SÉCURITÉ",
    reportTitle: "RAPPORT EXÉCUTIF",
    impactLine1: "ET SON IMPACT SUR LES OPÉRATIONS LOGISTIQUES",
    impactLine2: "ET LE TRANSPORT ROUTIER DE MARCHANDISES",
    period: "Période",
    sourceLine: "Source: Police Nationale de Colombie — AICRI  ·  INDEPAZ  ·  FIP  ·  CERAC",
    classification: "CLASSIFICATION: CONFIDENTIEL — USAGE INTERNE EXCLUSIF",
    headerSub: (y) => `Rapport Exécutif de Sécurité — ${y}`,
    pageLabel: "Page",
    generatedLabel: "Généré:",
    hdr2: "APPRÉCIATION DE SITUATION — ENVIRONNEMENT OPÉRATIONNEL",
    hdr3: "2. Environnement Opérationnel — Incidence Départementale",
    hdr4: (p, c) => `4. Analyse Comparative de l'Environnement Opérationnel: ${p} vs ${c}`,
    hdr5: "5. Blocages Routiers — CONCLUSIONS ET LIGNES DIRECTRICES STRATÉGIQUES",
    hdr6: "6. Source Documentaire — Analyse de Renseignement",
    apreciacionTitle: "APPRÉCIATION DE SITUATION",
    sec1Title: "1.  Situation Générale.",
    sec1Para: (year, total, company) => `L'environnement socio-économique et sécuritaire en Colombie durant la période ${year} enregistre ${total} événements criminels selon les données statistiques de la Police Nationale — Système AICRI. L'analyse de ces informations, élaborée pour ${company}, vise à fournir des éléments d'appréciation pour la prise de décisions stratégiques en matière de sécurité logistique et de transport routier de marchandises. Les facteurs déterminants de l'environnement opérationnel de sécurité durant cette période comprennent: l'activité des Groupes Armés Organisés (GAO) dans les corridors stratégiques de mobilité, la piraterie terrestre aux accès des principaux centres urbains et ports, et le comportement des crimes à fort impact social dans les départements les plus touchés.`,
    kpi1Label: "TOTAL CRIMES ENREGISTRÉS", kpi1Sub: (y) => `Année ${y}`,
    kpi2Label: "DÉPT. INCIDENCE MAXIMALE", kpi2Cases: "cas",
    kpi3Label: "CRIME LE PLUS FRÉQUENT", kpi3Cases: "cas",
    kpi4Label: "BLOCAGES ROUTIERS ACTIFS", kpi4Ok: "Aucun blocage actif", kpi4Alert: "⚠ Vérifier corridors",
    sec11Title: "1.1  Indicateurs d'Incidence de la Période",
    stat1: "Départements avec données", stat2: "Types de crimes analysés", stat3: "Mois avec enregistrements", stat4: "Moyenne mensuelle",
    of32: "sur 32",
    sec2Title: "2.  Environnement opérationnel de sécurité — Incidence par département.",
    sec2Para: (year) => `L'analyse départementale suivante de l'incidence criminelle pour la période ${year} constitue un élément essentiel pour l'évaluation du risque composé des principaux corridors de mobilité du pays. La concentration d'événements criminels par département permet de prioriser des dispositifs de sécurité différenciés et de déterminer les niveaux de protection requis pour les opérations logistiques et de transport routier selon la région de destination ou d'origine.`,
    deptTableH: ["#", "DÉPARTEMENT", "TOTAL CAS", "% NAT."],
    sec21Title: "2.1  Comparaison visuelle — Top 10 départements",
    sec3Title: "3.  Modalités criminelles — Crimes à fort impact pour le transport routier de marchandises.",
    sec3Para: (year) => `En général, un comportement différencié par modalité criminelle est observé pour la période ${year}. Parmi les crimes ayant le plus fort impact direct sur les opérations logistiques et le transport routier, la piraterie terrestre et le vol de véhicules présentent la criticité opérationnelle la plus élevée, suivis par l'extorsion de conducteurs sur des tronçons à forte présence de groupes armés illégaux. Les données statistiques suivantes devront être corrélées avec l'analyse de présence des GAO par département pour déterminer le risque composé de chaque corridor de mobilité.`,
    typeTableH: ["#", "TYPE DE CRIME", "TOTAL CAS", "% DU TOTAL"],
    sec31Title: "3.1  Tendance mensuelle — Facteurs saisonniers et du conflit",
    registered: "crimes enregistrés",
    variation: "Variation",
    increase: "augmentation annuelle",
    decrease: "réduction annuelle",
    sec41Title: "4.1  Variation de l'environnement opérationnel — Évolution mensuelle comparative",
    sec42Title: "4.2  Détail mensuel",
    colMes: "MOIS", colDiff: "DIFFÉRENCE", colVar: "VARIATION", colTrend: "TENDANCE",
    trendUp: "(+) Hausse", trendDown: "(-) Baisse", trendFlat: "(=) Stable",
    nd: "N/D",
    interpIncrease: (y, p, abs, pct) => `L'analyse comparative de la période ${y} par rapport à ${p} révèle une augmentation de ${abs} événements criminels, représentant une variation positive de ${pct}%. Ce comportement devra être particulièrement pris en compte lors de la révision des plans de contingence et de la mise à jour de la matrice de risque en itinéraire. Il est recommandé de renforcer les dispositifs de sécurité motorisés et la surveillance en temps réel dans les corridors à plus forte concentration d'incidents.`,
    interpDecrease: (y, p, abs, pct) => `L'analyse comparative de la période ${y} par rapport à ${p} révèle une réduction de ${abs} événements criminels, représentant une variation de -${pct}%. Cependant, la réduction des crimes à fort impact social peut être associée à une augmentation des actions terroristes de la part de groupes armés illégaux, un aspect qui devra être particulièrement pris en compte dans les prévisions de l'environnement opérationnel de sécurité logistique.`,
    noDataPrev: (y) => `Aucune donnée disponible pour l'année ${y} pour effectuer la comparaison.`,
    blockadeAlert: (n) => `[!]  ${n} BLOCAGE(S) ROUTIER(S) ACTIF(S) — Vérifier les corridors avant tout envoi`,
    blockadeOk: "[OK]  Aucun blocage routier actif au moment de ce rapport",
    blkTableH: ["DÉPARTEMENT", "LOCALISATION", "DATE", "CAUSE", "STATUT"],
    active: "ACTIF",
    conclusionsTitle: "CONCLUSIONS.",
    conclusionsSubtitle: "Lignes directrices stratégiques de gestion de sécurité logistique:",
    concl1: (y, total, depts) => `Situation générale: La période ${y} enregistre un total de ${total} événements criminels en Colombie, avec des données disponibles pour ${depts} départements. L'analyse détermine que la plus forte concentration d'incidence se maintient dans les principaux centres urbains et corridors de connectivité logistique interrégionale.`,
    concl2: (dept, cases, pct) => `Département à incidence maximale: ${dept} concentre ${cases} cas, représentant ${pct}% du total national. Les plans de sécurité avec des opérations dans ce département devront considérer un niveau de risque composé élevé et disposer de dispositifs d'escorte ou de surveillance renforcée.`,
    concl3: (crime, cases) => `Crime à plus fort impact logistique: "${crime}" est le type de crime prédominant avec ${cases} cas. Il est recommandé de mettre à jour les procédures opérationnelles de sécurité dans les installations, véhicules et zones de chargement/déchargement conformément à cette typologie.`,
    concl4: (month, cases) => `Période de plus forte concentration: Le mois de ${month} a enregistré le pic le plus élevé de la période avec ${cases} événements. Ce comportement saisonnier devra être pris en compte dans la planification des ressources de sécurité pour des périodes équivalentes de l'année suivante.`,
    concl5Alert: (n) => `ALERTE OPÉRATIONNELLE: ${n} blocage(s) routier(s) actif(s) enregistré(s) au moment de la génération de ce rapport. Il est impératif de valider des itinéraires alternatifs et de coordonner avec le centre de surveillance avant de programmer tout envoi sur les corridors affectés.`,
    concl5Ok: "État des corridors: Aucun blocage routier actif enregistré au moment de ce rapport. Les conditions de circulation sur les corridors surveillés sont normales. La surveillance permanente est recommandée compte tenu de la possibilité d'arrêts armés de la part de groupes armés illégaux.",
    concl6: "Recommandation stratégique: La révision hebdomadaire de ce rapport est recommandée, ainsi que la mise à jour permanente de la matrice de risque en itinéraire et la mise en œuvre d'un dispositif de surveillance 24h/24 et 7j/7 au Centre de Contrôle du Trafic, avec ajustement des plans d'envoi selon l'évolution de l'environnement opérationnel de sécurité dans les corridors d'intérêt.",
    elaboratedBy: "Préparé par:",
    sec6Title: "6. Source Documentaire — Analyse de Renseignement",
    sec6Heading: "6.  Analyse de Document Gouvernemental — Appréciation de Renseignement.",
    sec61Title: "6.1  Résumé exécutif.",
    sec62Title: "6.2  Résultats pertinents pour les opérations logistiques.",
    sec63Title: "6.3  Menaces identifiées.",
    sec64Title: "6.4  Recommandation opérationnelle pour la gestion du transport et de la logistique.",
    affectedDepts: "Départements concernés:",
    riesgo: "RISQUE",
    aiNote: (name) => `[Analyse générée par IA (Claude) sur le document: ${name}]`,
    filePrefix: "rapport_securite",
  },
  pt: {
    months: ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"],
    monthsFull: ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"],
    confidential: "CONFIDENCIAL",
    situationBadge: "APRECIAÇÃO DA SITUAÇÃO DE SEGURANÇA",
    envLine: "O AMBIENTE OPERACIONAL DE SEGURANÇA",
    reportTitle: "RELATÓRIO GERENCIAL",
    impactLine1: "E SEU IMPACTO NAS OPERAÇÕES LOGÍSTICAS",
    impactLine2: "E NO TRANSPORTE RODOVIÁRIO DE CARGA",
    period: "Período",
    sourceLine: "Fonte: Polícia Nacional da Colômbia — AICRI  ·  INDEPAZ  ·  FIP  ·  CERAC",
    classification: "CLASSIFICAÇÃO: CONFIDENCIAL — USO EXCLUSIVO INTERNO",
    headerSub: (y) => `Relatório Gerencial de Segurança — ${y}`,
    pageLabel: "Pág.",
    generatedLabel: "Gerado:",
    hdr2: "APRECIAÇÃO DE SITUAÇÃO — AMBIENTE OPERACIONAL",
    hdr3: "2. Ambiente Operacional — Incidência Departamental",
    hdr4: (p, c) => `4. Análise Comparativa do Ambiente Operacional: ${p} vs ${c}`,
    hdr5: "5. Bloqueios Viários — CONCLUSÕES E DIRETRIZES ESTRATÉGICAS",
    hdr6: "6. Fonte Documental — Análise de Inteligência",
    apreciacionTitle: "APRECIAÇÃO DE SITUAÇÃO",
    sec1Title: "1.  Situação Geral.",
    sec1Para: (year, total, company) => `O ambiente socioeconômico e de segurança na Colômbia durante o período ${year} registra ${total} eventos criminais de acordo com os dados estatísticos da Polícia Nacional — Sistema AICRI. A análise dessas informações, elaborada para ${company}, tem como objetivo fornecer elementos de avaliação para a tomada de decisões estratégicas em matéria de segurança logística e transporte rodoviário de carga. Os fatores determinantes do ambiente operacional de segurança no período incluem: a atividade dos Grupos Armados Organizados (GAO) em corredores estratégicos de mobilidade, a pirataria terrestre nos acessos aos principais centros urbanos e portos, e o comportamento dos crimes de alto impacto social nos departamentos de maior incidência.`,
    kpi1Label: "TOTAL CRIMES REGISTRADOS", kpi1Sub: (y) => `Ano ${y}`,
    kpi2Label: "DEPTO. MAIOR INCIDÊNCIA", kpi2Cases: "casos",
    kpi3Label: "CRIME MAIS FREQUENTE", kpi3Cases: "casos",
    kpi4Label: "BLOQUEIOS VIÁRIOS ATIVOS", kpi4Ok: "Sem bloqueios ativos", kpi4Alert: "⚠ Verificar corredores",
    sec11Title: "1.1  Indicadores de Incidência do Período",
    stat1: "Departamentos com dados", stat2: "Tipos de crime analisados", stat3: "Meses com registros", stat4: "Média mensal",
    of32: "de 32",
    sec2Title: "2.  Ambiente operacional de segurança — Incidência por departamento.",
    sec2Para: (year) => `A análise departamental de incidência criminal a seguir para o período ${year} constitui um elemento essencial para a avaliação de risco composto nos principais corredores de mobilidade do país. A concentração de eventos criminais por departamento permite priorizar esquemas de segurança diferenciados e determinar os níveis de proteção necessários para as operações logísticas e de transporte rodoviário de carga conforme a região de destino ou origem.`,
    deptTableH: ["#", "DEPARTAMENTO", "TOTAL CASOS", "% NAC."],
    sec21Title: "2.1  Comparativo visual — Top 10 departamentos",
    sec3Title: "3.  Modalidades criminais — Crimes de alto impacto para o transporte rodoviário de carga.",
    sec3Para: (year) => `Em geral, observa-se para o período ${year} um comportamento diferenciado por modalidade criminal. Entre os crimes de maior impacto direto nas operações logísticas e de transporte rodoviário, a pirataria terrestre e o furto de veículos constituem os de maior criticidade operacional, seguidos da extorsão de motoristas em trechos de alta incidência de grupos armados ilegais. Os dados estatísticos a seguir deverão ser correlacionados com a análise de presença de GAO por departamento para determinar o risco composto em cada corredor de mobilidade.`,
    typeTableH: ["#", "TIPO DE CRIME", "TOTAL CASOS", "% DO TOTAL"],
    sec31Title: "3.1  Tendência mensal — Fatores sazonais e do conflito",
    registered: "crimes registrados",
    variation: "Variação",
    increase: "aumento anual",
    decrease: "redução anual",
    sec41Title: "4.1  Variação do ambiente operacional — Evolução mensal comparativa",
    sec42Title: "4.2  Detalhamento mensal",
    colMes: "MÊS", colDiff: "DIFERENÇA", colVar: "VARIAÇÃO", colTrend: "TENDÊNCIA",
    trendUp: "(+) Alta", trendDown: "(-) Baixa", trendFlat: "(=) Estável",
    nd: "N/D",
    interpIncrease: (y, p, abs, pct) => `A análise comparativa do período ${y} em relação a ${p} evidencia um incremento de ${abs} eventos criminais, representando uma variação positiva de ${pct}%. Esse comportamento deverá ser especialmente considerado na revisão dos planos de contingência e na atualização da matriz de risco em rota. Recomenda-se reforçar os esquemas de segurança motorizados e o monitoramento em tempo real nos corredores com maior concentração de incidentes.`,
    interpDecrease: (y, p, abs, pct) => `A análise comparativa do período ${y} em relação a ${p} evidencia uma redução de ${abs} eventos criminais, representando uma variação de -${pct}%. No entanto, a redução nos crimes de alto impacto social pode estar associada ao aumento de ações de caráter terrorista por parte de grupos armados ilegais, aspecto que deverá ser especialmente considerado nas previsões do ambiente operacional de segurança logística.`,
    noDataPrev: (y) => `Não há dados disponíveis para o ano ${y} para realizar a comparação.`,
    blockadeAlert: (n) => `[!]  ${n} BLOQUEIO(S) VIÁRIO(S) ATIVO(S) — Verificar corredores antes de despachar carga`,
    blockadeOk: "[OK]  Sem bloqueios viários ativos no momento deste relatório",
    blkTableH: ["DEPARTAMENTO", "LOCALIZAÇÃO", "DATA", "CAUSA", "SITUAÇÃO"],
    active: "ATIVO",
    conclusionsTitle: "CONCLUSÕES.",
    conclusionsSubtitle: "Diretrizes estratégicas de gestão de segurança logística:",
    concl1: (y, total, depts) => `Situação geral: O período ${y} registra um total de ${total} eventos criminais na Colômbia, com dados disponíveis para ${depts} departamentos. A análise determina que a maior concentração de incidência mantém-se nos principais centros urbanos e corredores de conectividade logística inter-regional.`,
    concl2: (dept, cases, pct) => `Departamento de maior incidência: ${dept} concentra ${cases} casos, representando ${pct}% do total nacional. Os planos de segurança com operações neste departamento deverão considerar um nível de risco composto elevado e contar com esquemas de escolta ou monitoramento reforçado.`,
    concl3: (crime, cases) => `Crime de maior impacto logístico: "${crime}" é o tipo criminal predominante com ${cases} casos. Recomenda-se atualizar os procedimentos operacionais de segurança em instalações, veículos e zonas de carga/descarga conforme esta tipologia.`,
    concl4: (month, cases) => `Período de maior concentração: O mês de ${month} registrou o pico mais alto do período com ${cases} eventos. Esse comportamento sazonal deverá ser considerado no planejamento de recursos de segurança para períodos equivalentes no ano seguinte.`,
    concl5Alert: (n) => `ALERTA OPERACIONAL: ${n} bloqueio(s) viário(s) ativo(s) registrado(s) no momento da geração deste relatório. É imperativo validar rotas alternativas e coordenar com a central de monitoramento antes de programar qualquer despacho nos corredores afetados.`,
    concl5Ok: "Estado dos corredores: Nenhum bloqueio viário ativo registrado no momento deste relatório. As condições de circulação nos corredores monitorados são normais. Mantém-se a recomendação de monitoramento permanente ante a possibilidade de paralisações armadas por parte de grupos armados ilegais.",
    concl6: "Recomendação estratégica: Recomenda-se a revisão semanal deste relatório, a atualização permanente da matriz de risco em rota e a implementação de um esquema de monitoramento 24/7 na Central de Tráfego, com ajuste dos planos de despacho conforme a evolução do ambiente operacional de segurança nos corredores de interesse.",
    elaboratedBy: "Elaborado por:",
    sec6Title: "6. Fonte Documental — Análise de Inteligência",
    sec6Heading: "6.  Análise de Documento Governamental — Apreciação de Inteligência.",
    sec61Title: "6.1  Resumo executivo.",
    sec62Title: "6.2  Achados relevantes para operações logísticas.",
    sec63Title: "6.3  Ameaças identificadas.",
    sec64Title: "6.4  Recomendação operacional para gestão de transporte e logística.",
    affectedDepts: "Departamentos afetados:",
    riesgo: "RISCO",
    aiNote: (name) => `[Análise gerada por IA (Claude) sobre o documento: ${name}]`,
    filePrefix: "relatorio_seguranca",
  },
  de: {
    months: ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"],
    monthsFull: ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"],
    confidential: "VERTRAULICH",
    situationBadge: "SICHERHEITSLAGEBEURTEILUNG",
    envLine: "DAS OPERATIVE SICHERHEITSUMFELD",
    reportTitle: "GESCHÄFTSBERICHT",
    impactLine1: "UND SEINE AUSWIRKUNGEN AUF LOGISTIKOPERATIONEN",
    impactLine2: "UND DEN STRAßENGÜTERVERKEHR",
    period: "Zeitraum",
    sourceLine: "Quelle: Nationale Polizei Kolumbiens — AICRI  ·  INDEPAZ  ·  FIP  ·  CERAC",
    classification: "EINSTUFUNG: VERTRAULICH — NUR FÜR INTERNEN GEBRAUCH",
    headerSub: (y) => `Sicherheitsgeschäftsbericht — ${y}`,
    pageLabel: "Seite",
    generatedLabel: "Erstellt:",
    hdr2: "LAGEBEURTEILUNG — OPERATIVES UMFELD",
    hdr3: "2. Operatives Umfeld — Departementale Inzidenz",
    hdr4: (p, c) => `4. Vergleichende Lageanalyse: ${p} vs ${c}`,
    hdr5: "5. Straßensperren — SCHLUSSFOLGERUNGEN & STRATEGISCHE RICHTLINIEN",
    hdr6: "6. Dokumentarquelle — Geheimdienstanalyse",
    apreciacionTitle: "LAGEBEURTEILUNG",
    sec1Title: "1.  Allgemeine Lage.",
    sec1Para: (year, total, company) => `Das sozioökonomische und sicherheitspolitische Umfeld in Kolumbien verzeichnete im Zeitraum ${year} ${total} Straftaten gemäß den Statistikdaten der Nationalen Polizei — AICRI-System. Diese für ${company} erstellte Analyse soll Entscheidungsgrundlagen für strategische Entscheidungen im Bereich Logistiksicherheit und Straßengüterverkehr liefern. Die maßgeblichen Faktoren des sicherheitspolitischen Operationsumfelds in diesem Zeitraum umfassen: die Aktivität der Organisierten Bewaffneten Gruppen (GAO) in strategischen Mobilitätskorridoren, terrestrische Piraterie an Zugangspunkten zu wichtigen Stadtzentren und Häfen sowie das Verhalten von Straftaten mit hoher sozialer Auswirkung in den am stärksten betroffenen Departements.`,
    kpi1Label: "STRAFTATEN GESAMT", kpi1Sub: (y) => `Jahr ${y}`,
    kpi2Label: "DEPT. HÖCHSTE INZIDENZ", kpi2Cases: "Fälle",
    kpi3Label: "HÄUFIGSTE STRAFTAT", kpi3Cases: "Fälle",
    kpi4Label: "AKTIVE STRAßENSPERREN", kpi4Ok: "Keine aktiven Sperren", kpi4Alert: "⚠ Korridore prüfen",
    sec11Title: "1.1  Inzidenzindikatoren des Zeitraums",
    stat1: "Departements mit Daten", stat2: "Straftatentypen analysiert", stat3: "Monate mit Aufzeichnungen", stat4: "Monatlicher Durchschnitt",
    of32: "von 32",
    sec2Title: "2.  Sicherheitsbetriebsumfeld — Inzidenz nach Departement.",
    sec2Para: (year) => `Die folgende departementale Analyse der Kriminalitätsinzidenz für den Zeitraum ${year} ist ein wesentliches Element für die zusammengesetzte Risikobewertung der wichtigsten Mobilitätskorridore des Landes. Die Konzentration krimineller Ereignisse nach Departement ermöglicht die Priorisierung differenzierter Sicherheitsschemata und die Bestimmung der erforderlichen Schutzgrade für Logistik- und Güterverkehrsoperationen je nach Ziel- oder Herkunftsregion.`,
    deptTableH: ["#", "DEPARTEMENT", "GESAMTFÄLLE", "% NAT."],
    sec21Title: "2.1  Visueller Vergleich — Top 10 Departements",
    sec3Title: "3.  Kriminelle Muster — Hochwertstraftaten für den Güterverkehr.",
    sec3Para: (year) => `Im Allgemeinen ist für den Zeitraum ${year} ein differenziertes Muster nach Kriminalitätsart zu beobachten. Unter den Straftaten mit dem größten direkten Einfluss auf Logistik- und Straßengüterverkehrsoperationen sind terrestrische Piraterie und Fahrzeugdiebstahl die kritischsten, gefolgt von der Erpressung von Fahrern auf Streckenabschnitten mit hoher Aktivität illegaler bewaffneter Gruppen. Die folgenden Statistikdaten sollten mit der Analyse der GAO-Präsenz nach Departement korreliert werden, um das zusammengesetzte Risiko in jedem Mobilitätskorridor zu bestimmen.`,
    typeTableH: ["#", "STRAFTATENTYP", "GESAMTFÄLLE", "% GESAMT"],
    sec31Title: "3.1  Monatliche Entwicklung — Saisonale und Konfliktfaktoren",
    registered: "erfasste Straftaten",
    variation: "Variation",
    increase: "jährlicher Anstieg",
    decrease: "jährliche Reduktion",
    sec41Title: "4.1  Variation des Operationsumfelds — Monatliche Vergleichsentwicklung",
    sec42Title: "4.2  Monatliches Detail",
    colMes: "MONAT", colDiff: "DIFFERENZ", colVar: "VARIATION", colTrend: "TENDENZ",
    trendUp: "(+) Anstieg", trendDown: "(-) Rückgang", trendFlat: "(=) Stabil",
    nd: "N/V",
    interpIncrease: (y, p, abs, pct) => `Die Vergleichsanalyse des Zeitraums ${y} gegenüber ${p} zeigt einen Anstieg von ${abs} Straftaten und entspricht einer positiven Variation von ${pct}%. Dieses Verhalten sollte bei der Überprüfung der Notfallpläne und der Aktualisierung der StreckenrisikoMatrix besonders berücksichtigt werden. Es wird empfohlen, motorisierte Sicherheitsschemata und die Echtzeitüberwachung in Korridoren mit der höchsten Vorfallskonzentration zu verstärken.`,
    interpDecrease: (y, p, abs, pct) => `Die Vergleichsanalyse des Zeitraums ${y} gegenüber ${p} zeigt eine Reduktion von ${abs} Straftaten und entspricht einer Variation von -${pct}%. Die Reduzierung von Straftaten mit hohem sozialen Einfluss kann jedoch mit einer Zunahme terroristischer Aktionen illegaler bewaffneter Gruppen verbunden sein, was bei den Prognosen des Betriebsumfelds der Logistiksicherheit besonders berücksichtigt werden sollte.`,
    noDataPrev: (y) => `Keine Daten für das Jahr ${y} verfügbar, um den Vergleich durchzuführen.`,
    blockadeAlert: (n) => `[!]  ${n} AKTIVE STRAßENSPERRE(N) — Korridore vor Versand überprüfen`,
    blockadeOk: "[OK]  Keine aktiven Straßensperren zum Zeitpunkt dieses Berichts",
    blkTableH: ["DEPARTEMENT", "STANDORT", "DATUM", "URSACHE", "STATUS"],
    active: "AKTIV",
    conclusionsTitle: "SCHLUSSFOLGERUNGEN.",
    conclusionsSubtitle: "Strategische Richtlinien für das Logistiksicherheitsmanagement:",
    concl1: (y, total, depts) => `Allgemeine Lage: Der Zeitraum ${y} verzeichnet insgesamt ${total} Straftaten in Kolumbien, mit Daten für ${depts} Departements. Die Analyse bestimmt, dass die höchste Inzidenzkonzentration in den wichtigsten städtischen Zentren und interregionalen Logistikverbindungskorridoren verbleibt.`,
    concl2: (dept, cases, pct) => `Departement mit höchster Inzidenz: ${dept} konzentriert ${cases} Fälle, was ${pct}% des nationalen Gesamts entspricht. Sicherheitspläne für Operationen in diesem Departement sollten ein hohes zusammengesetztes Risikoniveau berücksichtigen und über Eskorte- oder verstärkte Überwachungsschemata verfügen.`,
    concl3: (crime, cases) => `Straftat mit größtem logistischen Einfluss: "${crime}" ist der vorherrschende Straftatentyp mit ${cases} Fällen. Es wird empfohlen, die operativen Sicherheitsverfahren in Einrichtungen, Fahrzeugen und Be-/Entladezonen entsprechend dieser Typologie zu aktualisieren.`,
    concl4: (month, cases) => `Zeitraum höchster Konzentration: Der Monat ${month} verzeichnete den höchsten Spitzenwert des Zeitraums mit ${cases} Ereignissen. Dieses saisonale Verhalten sollte bei der Planung von Sicherheitsressourcen für entsprechende Zeiträume im nächsten Jahr berücksichtigt werden.`,
    concl5Alert: (n) => `BETRIEBSALARM: ${n} aktive Straßensperren zum Zeitpunkt der Erstellung dieses Berichts. Alternative Routen müssen validiert und mit der Überwachungszentrale koordiniert werden, bevor Sendungen auf betroffenen Korridoren geplant werden.`,
    concl5Ok: "Korridor-Status: Keine aktiven Straßensperren zum Zeitpunkt dieses Berichts. Die Verkehrsbedingungen auf den überwachten Korridoren sind normal. Dauerhafte Überwachung wird angesichts der Möglichkeit bewaffneter Stopps durch illegale bewaffnete Gruppen empfohlen.",
    concl6: "Strategische Empfehlung: Wöchentliche Überprüfung dieses Berichts wird empfohlen, sowie die ständige Aktualisierung der Streckenrisikomatrix und die Implementierung eines 24/7-Überwachungsschemas in der Verkehrszentrale mit Anpassung der Versandpläne entsprechend der Entwicklung des Sicherheitsbetriebsumfelds in relevanten Korridoren.",
    elaboratedBy: "Erstellt von:",
    sec6Title: "6. Dokumentarquelle — Geheimdienstanalyse",
    sec6Heading: "6.  Regierungsdokument-Analyse — Geheimdienstbeurteilung.",
    sec61Title: "6.1  Zusammenfassung.",
    sec62Title: "6.2  Relevante Erkenntnisse für Logistikoperationen.",
    sec63Title: "6.3  Identifizierte Bedrohungen.",
    sec64Title: "6.4  Betriebsempfehlung für Transport- und Logistikmanagement.",
    affectedDepts: "Betroffene Departements:",
    riesgo: "RISIKO",
    aiNote: (name) => `[KI-generierte Analyse (Claude) zum Dokument: ${name}]`,
    filePrefix: "sicherheitsbericht",
  },
  ko: {
    months: ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"],
    monthsFull: ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"],
    confidential: "기밀",
    situationBadge: "SECURITY SITUATION ASSESSMENT",
    envLine: "THE SECURITY OPERATIONAL ENVIRONMENT",
    reportTitle: "경영 보고서",
    impactLine1: "물류 운영에 미치는 영향",
    impactLine2: "및 육상 화물 운송",
    period: "기간",
    sourceLine: "출처: 콜롬비아 국가경찰 — AICRI  ·  INDEPAZ  ·  FIP  ·  CERAC",
    classification: "분류: 기밀 — 내부 전용",
    headerSub: (y) => `Executive Security Report — ${y}`,
    pageLabel: "페이지",
    generatedLabel: "생성:",
    hdr2: "SITUATION ASSESSMENT — OPERATIONAL ENVIRONMENT",
    hdr3: "2. 운영 환경 — 지역별 발생 현황",
    hdr4: (p, c) => `4. 운영 환경 비교 분석: ${p} vs ${c}`,
    hdr5: "5. 도로 봉쇄 — 결론 및 전략 지침",
    hdr6: "6. 문서 출처 — 정보 분석",
    apreciacionTitle: "상황 평가",
    sec1Title: "1.  일반 상황.",
    sec1Para: (year, total, company) => `${year}년 콜롬비아의 사회경제적·안보 환경에서는 국가경찰 AICRI 시스템 통계 데이터에 따라 ${total}건의 범죄 사건이 기록되었습니다. ${company}를 위해 작성된 이 분석은 물류 보안 및 육상 화물 운송 분야의 전략적 의사결정을 위한 판단 근거를 제공하는 것을 목적으로 합니다. 해당 기간 보안 운영 환경의 주요 결정 요인에는 전략적 이동 회랑에서의 조직 무장 단체(GAO) 활동, 주요 도시 센터 및 항구 접근로에서의 육상 해적 행위, 발생률이 높은 지역에서의 고영향 범죄 행태가 포함됩니다.`,
    kpi1Label: "총 등록 범죄 건수", kpi1Sub: (y) => `${y}년`,
    kpi2Label: "최고 발생 지역", kpi2Cases: "건",
    kpi3Label: "가장 빈번한 범죄", kpi3Cases: "건",
    kpi4Label: "활성 도로 봉쇄", kpi4Ok: "활성 봉쇄 없음", kpi4Alert: "⚠ 회랑 확인 필요",
    sec11Title: "1.1  기간별 발생 지표",
    stat1: "데이터가 있는 지역", stat2: "분석된 범죄 유형", stat3: "기록이 있는 월", stat4: "월 평균",
    of32: "/ 32",
    sec2Title: "2.  보안 운영 환경 — 지역별 발생 현황.",
    sec2Para: (year) => `${year}년 기간에 대한 다음 지역별 범죄 발생 분석은 국가 주요 이동 회랑의 복합 위험 평가를 위한 필수 요소입니다. 지역별 범죄 사건 집중도는 차별화된 보안 계획을 우선순위화하고, 목적지 또는 출발지 지역에 따른 물류 및 도로 화물 운송 작업에 필요한 보호 수준을 결정할 수 있게 합니다.`,
    deptTableH: ["#", "지역", "총 건수", "% 전국"],
    sec21Title: "2.1  시각적 비교 — 상위 10개 지역",
    sec3Title: "3.  범죄 유형 — 육상 화물 운송에 고영향 범죄.",
    sec3Para: (year) => `일반적으로 ${year}년 기간에는 범죄 유형별로 차별화된 양상이 관찰됩니다. 물류 및 도로 운송 운영에 가장 직접적인 영향을 미치는 범죄 중 육상 해적 행위와 차량 절도가 운영 위험성이 가장 높으며, 불법 무장 단체 활동이 높은 구간에서의 운전자 갈취가 뒤를 잇습니다. 다음 통계 데이터는 각 이동 회랑의 복합 위험을 결정하기 위해 지역별 GAO 존재 분석과 상관 분석해야 합니다.`,
    typeTableH: ["#", "범죄 유형", "총 건수", "% 전체"],
    sec31Title: "3.1  월별 추세 — 계절적 및 분쟁 요인",
    registered: "건 등록",
    variation: "변동",
    increase: "연간 증가",
    decrease: "연간 감소",
    sec41Title: "4.1  운영 환경 변동 — 월별 비교 추이",
    sec42Title: "4.2  월별 세부 사항",
    colMes: "월", colDiff: "차이", colVar: "변동", colTrend: "추세",
    trendUp: "(+) 상승", trendDown: "(-) 하락", trendFlat: "(=) 안정",
    nd: "N/A",
    interpIncrease: (y, p, abs, pct) => `${y}년과 ${p}년을 비교한 분석에서 ${abs}건의 범죄 사건이 증가하여 ${pct}%의 긍정적 변동을 나타냈습니다. 이 추세는 비상 계획 검토와 경로 위험 매트릭스 업데이트 시 특히 고려해야 합니다. 사건 집중도가 높은 회랑에서 전동 보안 계획과 실시간 모니터링을 강화할 것을 권장합니다.`,
    interpDecrease: (y, p, abs, pct) => `${y}년과 ${p}년을 비교한 분석에서 ${abs}건의 범죄 사건이 감소하여 -${pct}%의 변동을 나타냈습니다. 그러나 고영향 사회 범죄의 감소는 불법 무장 단체의 테러 행위 증가와 관련될 수 있으며, 이는 물류 보안 운영 환경 예측 시 특히 고려해야 할 사항입니다.`,
    noDataPrev: (y) => `비교를 위한 ${y}년 데이터가 없습니다.`,
    blockadeAlert: (n) => `[!]  ${n}건의 활성 도로 봉쇄 — 화물 발송 전 회랑 확인 필요`,
    blockadeOk: "[OK]  이 보고서 작성 시점에 활성 도로 봉쇄 없음",
    blkTableH: ["지역", "위치", "날짜", "원인", "상태"],
    active: "활성",
    conclusionsTitle: "결론.",
    conclusionsSubtitle: "물류 보안 관리 전략 지침:",
    concl1: (y, total, depts) => `일반 상황: ${y}년은 콜롬비아에서 총 ${total}건의 범죄 사건을 기록하며 ${depts}개 지역의 데이터를 보유하고 있습니다. 분석에 따르면 발생률의 가장 높은 집중도는 주요 도시 중심지와 지역 간 물류 연결 회랑에서 유지됩니다.`,
    concl2: (dept, cases, pct) => `최고 발생 지역: ${dept}은(는) ${cases}건으로 전국 총계의 ${pct}%를 차지합니다. 이 지역에서 운영하는 보안 계획은 높은 복합 위험 수준을 고려하고 호위 또는 강화된 모니터링 계획을 갖추어야 합니다.`,
    concl3: (crime, cases) => `물류 최대 영향 범죄: "${crime}"은(는) ${cases}건으로 주요 범죄 유형입니다. 이 유형에 따라 시설, 차량, 적재/하역 구역의 운영 보안 절차를 업데이트할 것을 권장합니다.`,
    concl4: (month, cases) => `최고 집중 기간: ${month}은(는) ${cases}건으로 기간 내 최고 정점을 기록했습니다. 이 계절적 행태는 다음 해 동일 기간의 보안 자원 계획 수립 시 고려해야 합니다.`,
    concl5Alert: (n) => `운영 경보: 이 보고서 생성 시점에 ${n}건의 활성 도로 봉쇄가 기록되었습니다. 영향받은 회랑에서 발송을 계획하기 전에 대체 경로를 확인하고 모니터링 센터와 조정하는 것이 필수적입니다.`,
    concl5Ok: "회랑 상태: 이 보고서 작성 시점에 활성 도로 봉쇄가 없습니다. 모니터링 중인 회랑의 교통 상황은 정상입니다. 불법 무장 단체의 무장 중단 가능성에 대비한 지속적 모니터링이 권장됩니다.",
    concl6: "전략적 권고사항: 이 보고서의 주간 검토, 경로 위험 매트릭스의 지속적 업데이트, 관심 회랑의 보안 운영 환경 발전에 따른 발송 계획 조정과 함께 교통 관제 센터에서 24/7 모니터링 계획을 시행할 것을 권장합니다.",
    elaboratedBy: "작성자:",
    sec6Title: "6. 문서 출처 — 정보 분석",
    sec6Heading: "6.  정부 문서 분석 — 정보 평가.",
    sec61Title: "6.1  요약.",
    sec62Title: "6.2  물류 운영 관련 주요 발견사항.",
    sec63Title: "6.3  확인된 위협.",
    sec64Title: "6.4  운송 및 물류 관리를 위한 운영 권고사항.",
    affectedDepts: "영향 지역:",
    riesgo: "위험",
    aiNote: (name) => `[AI (Claude) 분석 문서: ${name}]`,
    filePrefix: "security_report_ko",
  },
};

interface Props { dark?: boolean; user?: UserConfig | null }

export function ReportGenerator({ dark = true, user = null }: Props) {
  const { updateConfig: saveToServer } = useAuth();
  const [config, setConfig] = useState<ReportConfig>(DEFAULTS);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [year, setYear] = useState(2026);
  const [lang, setLang] = useState<LangCode>("es");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfAnalyzing, setPdfAnalyzing] = useState(false);
  const [pdfAnalysis, setPdfAnalysis] = useState<any>(null);
  const [pdfError, setPdfError] = useState("");
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [defaultLogo, setDefaultLogo] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  /* Debounce: avoid resetting form while user is actively typing */
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editingRef = useRef(false);

  const panelBg   = dark ? "#0c1220" : "#ffffff";
  const textMain  = dark ? "#e2eaf4" : "#1a2a3a";
  const textMuted = dark ? "rgba(255,255,255,0.45)" : "#64748b";
  const borderC   = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const inputBg   = dark ? "rgba(255,255,255,0.04)" : "#f8fafc";

  useEffect(() => {
    /* Skip reset while user is actively typing in the form */
    if (editingRef.current) return;
    setConfig(prev => {
      let base = { ...DEFAULTS, ...prev };
      try { const s = localStorage.getItem(LS_KEY); if (s) { const p = JSON.parse(s); if (p.logoDataUrl) base.logoDataUrl = p.logoDataUrl; } } catch { /* ignore */ }
      if (user) return { ...base, ...userToConfig(user) };
      return base;
    });
  }, [user]);

  useEffect(() => {
    fetch(safeNodeLogoUrl)
      .then(r => { if (!r.ok) throw new Error("logo not found"); return r.blob(); })
      .then(blob => {
        const reader = new FileReader();
        reader.onload = () => setDefaultLogo(reader.result as string);
        reader.readAsDataURL(blob);
      })
      .catch(() => { /* logo not available */ });
  }, []);

  const activeLogoDisplay = config.logoDataUrl || defaultLogo || safeNodeLogoUrl;
  const activeLogoForPdf  = config.logoDataUrl || defaultLogo;
  const activeLogo = activeLogoDisplay;

  function updateConfig(patch: Partial<ReportConfig>) {
    editingRef.current = true;
    setConfig(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(LS_KEY, JSON.stringify({ logoDataUrl: next.logoDataUrl })); } catch { /* ignore */ }
      const { logoDataUrl: _logo, ...serverPatch } = patch;
      if (Object.keys(serverPatch).length > 0) {
        /* Debounce: save to server 1.5 s after last keystroke to avoid re-render loop */
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          saveToServer(serverPatch)
            .catch(() => { /* silent */ })
            .finally(() => { editingRef.current = false; });
        }, 1500);
      }
      return next;
    });
  }

  const { data: monthlyData = [] } = useGetNationalMonthly({ year });
  const { data: prevMonthlyData = [] } = useGetNationalMonthly({ year: year - 1 });
  const { data: deptData    = [] } = useGetCrimesByDepartment({ year });
  const { data: allBlockades = [] } = useGetBlockades();

  const totalCrimes = useMemo(() => monthlyData.reduce((s: number, d: any) => s + d.count, 0), [monthlyData]);
  const prevTotalCrimes = useMemo(() => prevMonthlyData.reduce((s: number, d: any) => s + d.count, 0), [prevMonthlyData]);
  const prevMonthlyTrend = useMemo(() => {
    const m: Record<number, number> = {};
    for (const d of prevMonthlyData) m[d.month] = (m[d.month] ?? 0) + d.count;
    return Array.from({ length: 12 }, (_, i) => ({ month: i + 1, count: m[i + 1] ?? 0 }));
  }, [prevMonthlyData]);

  const topDepts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of deptData as any[]) m[d.department] = (m[d.department] ?? 0) + d.totalCount;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [deptData]);

  const crimeTypeSummary = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of monthlyData) m[d.crimeTypeName] = (m[d.crimeTypeName] ?? 0) + d.count;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [monthlyData]);

  const monthlyTrend = useMemo(() => {
    const m: Record<number, number> = {};
    for (const d of monthlyData) m[d.month] = (m[d.month] ?? 0) + d.count;
    return Array.from({ length: 12 }, (_, i) => ({ month: i + 1, count: m[i + 1] ?? 0 }));
  }, [monthlyData]);

  const activeBlockades = useMemo(() => (Array.isArray(allBlockades) ? allBlockades : []).filter((b: any) => b.status === "activo"), [allBlockades]);

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateConfig({ logoDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  }

  function handlePdfSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfFile(file);
    setPdfAnalysis(null);
    setPdfError("");
  }

  const handlePdfAnalyze = useCallback(async () => {
    if (!pdfFile) return;
    setPdfAnalyzing(true);
    setPdfError("");
    setPdfAnalysis(null);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] ?? "");
        };
        reader.onerror = () => reject(new Error("No se pudo leer el archivo PDF"));
        reader.readAsDataURL(pdfFile);
      });
      const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
      const resp = await fetch(`${BASE}/api/analyze/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pdfBase64: b64, lang }),
      });
      const data = await resp.json();
      if (!resp.ok) { setPdfError(data.error || "Error al analizar el PDF"); return; }
      setPdfAnalysis(data);
    } catch (e: any) {
      setPdfError(e.message || "Error de red");
    } finally {
      setPdfAnalyzing(false);
    }
  }, [pdfFile, lang]);

  const generatePDF = useCallback(async () => {
    if (totalCrimes === 0) return;
    setGenerating(true);
    setGenerated(false);

    try {
      const t = TRANS[lang];
      const MONTHS = t.months;
      const MONTHS_FULL = t.monthsFull;

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = 210, H = 297;
      const margin = 20, indent = 5;
      const pri = hexToRgb(config.primaryColor);
      const onPri: [number, number, number] = isLight(config.primaryColor) ? [10, 10, 10] : [255, 255, 255];

      const now = new Date();
      const dateStr = now.toLocaleDateString(
        lang === "es" ? "es-CO" : lang === "en" ? "en-US" : lang === "fr" ? "fr-FR" : lang === "pt" ? "pt-BR" : lang === "de" ? "de-DE" : "ko-KR",
        { year: "numeric", month: "long", day: "numeric" }
      );

      /* ── Helpers ── */
      function setDraw(hex: string) {
        const { r, g, b } = hexToRgb(hex);
        doc.setDrawColor(r, g, b);
      }

      function justifyPara(text: string, x: number, y: number, maxW: number, lineH: number, bottomPad: number): number {
        const lines = doc.splitTextToSize(text, maxW) as string[];
        doc.setFontSize(8.5);
        lines.forEach((line, i) => {
          if (i === lines.length - 1) { doc.text(line, x, y + i * lineH); return; }
          const words = line.split(" ");
          if (words.length <= 1) { doc.text(line, x, y + i * lineH); return; }
          const lineW = doc.getTextWidth(line);
          const extraSpace = (maxW - lineW) / (words.length - 1);
          let cx = x;
          words.forEach((word, wi) => {
            doc.text(word, cx, y + i * lineH);
            cx += doc.getTextWidth(word) + doc.getTextWidth(" ") + extraSpace;
          });
        });
        return y + lines.length * lineH + bottomPad;
      }

      function pageHeader(title: string, pageNum: number) {
        doc.setFillColor(pri.r, pri.g, pri.b);
        doc.rect(0, 0, W, 14, "F");
        doc.setFontSize(8); doc.setFont("helvetica", "bold");
        doc.setTextColor(onPri[0], onPri[1], onPri[2]);
        doc.text(config.companyName.toUpperCase(), margin, 9);
        doc.setFont("helvetica", "normal");
        doc.text(t.headerSub(year), W / 2, 9, { align: "center" });
        doc.text(`${t.pageLabel} ${pageNum}`, W - margin, 9, { align: "right" });
        doc.setFontSize(10); doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 30, 50);
        doc.text(title, margin, 21);
        doc.setDrawColor(pri.r, pri.g, pri.b); doc.setLineWidth(0.4);
        doc.line(margin, 24, W - margin, 24);
      }

      function pageFooter() {
        doc.setFontSize(7); doc.setTextColor(160, 160, 160);
        doc.text(config.footerDisclaimer, margin, H - 6);
        doc.text(`${t.generatedLabel} ${dateStr}  ·  ${config.analystName}`, W - margin, H - 6, { align: "right" });
      }

      function sectionHeading(text: string, y: number): number {
        doc.setFillColor(pri.r, pri.g, pri.b);
        doc.setGState(new (doc as any).GState({ opacity: 0.08 }));
        doc.roundedRect(margin, y, W - margin * 2, 8, 1, 1, "F");
        doc.setGState(new (doc as any).GState({ opacity: 1 }));
        doc.setFontSize(10); doc.setFont("helvetica", "bold");
        doc.setTextColor(pri.r, pri.g, pri.b);
        doc.text(text, margin + indent, y + 4);
        return y + 12;
      }

      function drawTable(headers: string[], rows: string[][], colWidths: number[], startY: number, rowH: number): number {
        const tableW = colWidths.reduce((a, b) => a + b, 0);
        let y = startY;
        const startYOrig = startY;
        /* header row */
        doc.setFillColor(pri.r, pri.g, pri.b);
        doc.rect(margin, y, tableW, rowH, "F");
        doc.setFontSize(8); doc.setFont("helvetica", "bold");
        doc.setTextColor(onPri[0], onPri[1], onPri[2]);
        let x = margin;
        headers.forEach((h, hi) => {
          doc.text(h, x + 2, y + rowH - 1);
          x += colWidths[hi];
        });
        y += rowH;
        rows.forEach((row, ri) => {
          if (ri % 2 === 0) {
            doc.setFillColor(245, 248, 255);
            doc.setGState(new (doc as any).GState({ opacity: 0.5 }));
            doc.rect(margin, y, tableW, rowH, "F");
            doc.setGState(new (doc as any).GState({ opacity: 1 }));
          }
          doc.setFontSize(8); doc.setFont("helvetica", ri === 0 ? "bold" : "normal");
          doc.setTextColor(50, 50, 70);
          x = margin;
          row.forEach((cell, ci) => {
            const lines = doc.splitTextToSize(cell, colWidths[ci] - 4) as string[];
            doc.text(lines[0], x + 2, y + rowH - 1);
            x += colWidths[ci];
          });
          y += rowH;
        });
        /* outer border */
        setDraw(config.primaryColor); doc.setLineWidth(0.5);
        doc.rect(margin, startYOrig, tableW, y - startYOrig, "S");
        return y + 4;
      }

      /* ══════════════════════════════════════
         PAGE 1 — COVER
         ══════════════════════════════════════ */
      const navyR = 13, navyG = 27, navyB = 49;
      doc.setFillColor(navyR, navyG, navyB);
      doc.rect(0, 0, W, H, "F");
      doc.setFillColor(pri.r, pri.g, pri.b);
      doc.rect(0, 0, W, 6, "F");
      doc.setFillColor(pri.r, pri.g, pri.b);
      doc.setGState(new (doc as any).GState({ opacity: 0.85 }));
      doc.rect(0, H - 44, W, 44, "F");
      doc.setGState(new (doc as any).GState({ opacity: 1 }));

      const logoSrc = activeLogoForPdf;
      if (logoSrc) {
        try {
          const fmt = logoSrc.startsWith("data:image/png") ? "PNG" : "JPEG";
          const logoW = 52, logoH = 52;
          doc.addImage(logoSrc, fmt, (W - logoW) / 2, 18, logoW, logoH);
        } catch { /* skip corrupt logo */ }
      }

      doc.setFillColor(pri.r, pri.g, pri.b);
      doc.setGState(new (doc as any).GState({ opacity: 0.07 }));
      doc.circle(W + 10, 50, 80, "F");
      doc.circle(-10, H - 80, 60, "F");
      doc.setGState(new (doc as any).GState({ opacity: 1 }));

      /* CONFIDENTIAL stamp */
      doc.setFillColor(180, 20, 20);
      doc.setGState(new (doc as any).GState({ opacity: 0.85 }));
      doc.roundedRect(W - margin - 36, 10, 36, 10, 1.5, 1.5, "F");
      doc.setGState(new (doc as any).GState({ opacity: 1 }));
      doc.setFontSize(6.5); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
      doc.text(t.confidential, W - margin - 18, 17, { align: "center" });

      doc.setFontSize(7); doc.setFont("helvetica", "normal");
      doc.setTextColor(pri.r, pri.g, pri.b);
      doc.setGState(new (doc as any).GState({ opacity: 0.85 }));
      doc.text(t.situationBadge, W / 2, 83, { align: "center" });
      doc.setGState(new (doc as any).GState({ opacity: 1 }));

      doc.setFontSize(13); doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.setGState(new (doc as any).GState({ opacity: 0.65 }));
      doc.text(t.envLine, W / 2, 96, { align: "center" });
      doc.setGState(new (doc as any).GState({ opacity: 1 }));

      doc.setFontSize(26); doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(t.reportTitle, W / 2, 112, { align: "center" });

      doc.setFontSize(13); doc.setFont("helvetica", "bold");
      doc.setGState(new (doc as any).GState({ opacity: 0.75 }));
      doc.text(t.impactLine1, W / 2, 123, { align: "center" });
      doc.text(t.impactLine2, W / 2, 131, { align: "center" });
      doc.setGState(new (doc as any).GState({ opacity: 1 }));

      doc.setDrawColor(pri.r, pri.g, pri.b); doc.setLineWidth(0.8);
      doc.line(35, 138, W - 35, 138);

      doc.setFontSize(18); doc.setFont("helvetica", "bold");
      doc.setTextColor(pri.r, pri.g, pri.b);
      doc.text(`Colombia · ${t.period} ${year}`, W / 2, 151, { align: "center" });

      doc.setFontSize(13); doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(config.companyName.toUpperCase(), W / 2, 172, { align: "center" });
      doc.setFontSize(9); doc.setFont("helvetica", "normal");
      doc.setTextColor(pri.r, pri.g, pri.b);
      doc.setGState(new (doc as any).GState({ opacity: 0.9 }));
      doc.text(config.companySubtitle, W / 2, 180, { align: "center" });
      doc.setGState(new (doc as any).GState({ opacity: 1 }));

      doc.setTextColor(navyR, navyG, navyB);
      doc.setFontSize(9); doc.setFont("helvetica", "bold");
      doc.text(dateStr.toUpperCase(), W / 2, H - 33, { align: "center" });
      doc.setFontSize(8); doc.setFont("helvetica", "normal");
      doc.text(`${config.analystName}  ·  ${config.analystEmail}  ·  ${config.analystPhone}`, W / 2, H - 24, { align: "center" });
      doc.setFontSize(7);
      doc.text(t.sourceLine, W / 2, H - 16, { align: "center" });
      doc.setFontSize(6.5);
      doc.text(t.classification, W / 2, H - 8, { align: "center" });

      /* ══════════════════════════════════════
         PAGE 2 — SITUATION SUMMARY
         ══════════════════════════════════════ */
      doc.addPage();
      pageHeader(t.hdr2, 2);
      pageFooter();
      let y = 30;

      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 30, 50);
      doc.text(t.apreciacionTitle, W / 2, y, { align: "center" }); y += 8;

      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(pri.r, pri.g, pri.b);
      { const tl = doc.splitTextToSize(t.sec1Title, W - margin * 2); doc.text(tl, margin, y); y += tl.length * 5.5; }
      doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 70);

      y = justifyPara(
        t.sec1Para(year, totalCrimes.toLocaleString("es-CO"), config.companyName),
        margin + indent, y, W - margin * 2 - indent, 5, 4
      );

      const kpis = [
        { label: t.kpi1Label, value: totalCrimes.toLocaleString("es-CO"), sub: t.kpi1Sub(year), icon: "▼" },
        { label: t.kpi2Label, value: topDepts[0]?.[0] ?? "—",             sub: `${topDepts[0]?.[1]?.toLocaleString("es-CO") ?? "—"} ${t.kpi2Cases}`, icon: "📍" },
        { label: t.kpi3Label, value: (crimeTypeSummary[0]?.[0] ?? "—").split(" ").slice(0, 3).join(" "), sub: `${crimeTypeSummary[0]?.[1]?.toLocaleString("es-CO") ?? "—"} ${t.kpi3Cases}`, icon: "!" },
        { label: t.kpi4Label, value: String(activeBlockades.length), sub: activeBlockades.length > 0 ? t.kpi4Alert : t.kpi4Ok, icon: "🛑" },
      ];

      const kpiW = (W - margin * 2 - 8) / 2;
      const kpiH = 26;
      kpis.forEach((kpi, i) => {
        const kx = margin + (i % 2) * (kpiW + 8);
        const ky = y + Math.floor(i / 2) * (kpiH + 6);
        doc.setFillColor(pri.r, pri.g, pri.b);
        doc.roundedRect(kx, ky, kpiW, kpiH, 2, 2, "F");
        doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...onPri);
        doc.setGState(new (doc as any).GState({ opacity: 0.75 }));
        doc.text(kpi.label, kx + 5, ky + 6);
        doc.setGState(new (doc as any).GState({ opacity: 1 }));
        doc.setFontSize(16); doc.setFont("helvetica", "bold");
        const valParts = doc.splitTextToSize(kpi.value, kpiW - 10);
        doc.text(valParts[0], kx + 5, ky + 16);
        doc.setFontSize(7); doc.setFont("helvetica", "normal");
        doc.setGState(new (doc as any).GState({ opacity: 0.8 }));
        doc.text(kpi.sub, kx + 5, ky + 22);
        doc.setGState(new (doc as any).GState({ opacity: 1 }));
      });
      y += 2 * (kpiH + 6) + 10;

      y = sectionHeading(t.sec11Title, y);
      const quickStats = [
        [t.stat1, `${topDepts.length} ${t.of32}`],
        [t.stat2, String(crimeTypeSummary.length)],
        [t.stat3, String(monthlyTrend.filter(m => m.count > 0).length)],
        [t.stat4, Math.round(totalCrimes / Math.max(1, monthlyTrend.filter(m => m.count > 0).length)).toLocaleString("es-CO")],
      ];
      const sw = (W - margin * 2 - 12) / 4;
      quickStats.forEach(([lbl, val], i) => {
        const sx = margin + i * (sw + 4);
        doc.setFillColor(245, 248, 255);
        doc.setDrawColor(pri.r, pri.g, pri.b); doc.setLineWidth(0.3);
        doc.roundedRect(sx, y, sw, 16, 1.5, 1.5, "FD");
        doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(pri.r, pri.g, pri.b);
        doc.text(val, sx + sw / 2, y + 9, { align: "center" });
        doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 110, 130);
        doc.text(lbl.toUpperCase(), sx + sw / 2, y + 14, { align: "center" });
      });

      /* ══════════════════════════════════════
         PAGE 3 — DEPARTMENTAL RANKING
         ══════════════════════════════════════ */
      doc.addPage();
      pageHeader(t.hdr3, 3);
      pageFooter();
      y = 30;

      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(pri.r, pri.g, pri.b);
      { const tl = doc.splitTextToSize(t.sec2Title, W - margin * 2); doc.text(tl, margin, y); y += tl.length * 5.5; }
      doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 70);
      y = justifyPara(t.sec2Para(year), margin + indent, y, W - margin * 2 - indent, 5, 4);

      const maxDeptCount = topDepts[0]?.[1] ?? 1;
      const deptCols = [8, 118, 30, 14];
      y = drawTable(
        t.deptTableH,
        topDepts.map(([dept, count], i) => [
          String(i + 1).padStart(2, "0"),
          dept,
          count.toLocaleString("es-CO"),
          `${((count / totalCrimes) * 100).toFixed(1)}%`,
        ]),
        deptCols, y, 7
      );

      y = sectionHeading(t.sec21Title, y);
      const barMaxW = W - margin * 2 - 45;
      const barH = 5.5;
      topDepts.slice(0, 10).forEach(([dept, count], i) => {
        const bW = (count / maxDeptCount) * barMaxW;
        const by = y + i * (barH + 2);
        doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 70);
        doc.text(dept.length > 18 ? dept.slice(0, 17) + "…" : dept, margin, by + barH - 1);
        doc.setFillColor(235, 240, 250);
        doc.roundedRect(margin + 44, by, barMaxW, barH, 1, 1, "F");
        doc.setFillColor(pri.r, pri.g, pri.b);
        doc.roundedRect(margin + 44, by, Math.max(bW, 2), barH, 1, 1, "F");
        doc.setFontSize(6.5); doc.setTextColor(80, 80, 100);
        doc.text(count.toLocaleString("es-CO"), margin + 44 + barMaxW + 2, by + barH - 1);
      });

      /* ══════════════════════════════════════
         PAGE 4 — CRIME TYPES + TREND
         ══════════════════════════════════════ */
      doc.addPage();
      pageHeader(`3. ${lang === "es" ? "Modalidades Delictivas" : lang === "en" ? "Crime Patterns" : lang === "fr" ? "Modalités Criminelles" : lang === "pt" ? "Modalidades Criminais" : lang === "de" ? "Straftatentypen" : "범죄 유형"} — ${lang === "es" ? "Delitos de Alto Impacto" : lang === "en" ? "High-Impact Crimes" : lang === "fr" ? "Crimes à Fort Impact" : lang === "pt" ? "Crimes de Alto Impacto" : lang === "de" ? "Schwere Straftaten" : "고영향 범죄"}`, 4);
      pageFooter();
      y = 30;

      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(pri.r, pri.g, pri.b);
      { const tl = doc.splitTextToSize(t.sec3Title, W - margin * 2); doc.text(tl, margin, y); y += tl.length * 5.5; }
      doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 70);
      y = justifyPara(t.sec3Para(year), margin + indent, y, W - margin * 2 - indent, 5, 4);

      const typeCols = [10, 98, 30, 32];
      y = drawTable(
        t.typeTableH,
        crimeTypeSummary.map(([name, count], i) => [
          String(i + 1).padStart(2, "0"),
          name,
          count.toLocaleString("es-CO"),
          `${((count / totalCrimes) * 100).toFixed(1)}%`,
        ]),
        typeCols, y, 7
      );
      y += 4;

      y = sectionHeading(t.sec31Title, y);
      doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 70);

      const chartH2 = 45;
      const chartW2 = W - margin * 2;
      const barW2 = chartW2 / 12;
      const maxCount2 = Math.max(...monthlyTrend.map(m => m.count), 1);

      doc.setFillColor(247, 250, 255);
      doc.setDrawColor(220, 225, 240); doc.setLineWidth(0.3);
      doc.roundedRect(margin, y, chartW2, chartH2 + 14, 2, 2, "FD");

      monthlyTrend.forEach(({ month, count }) => {
        if (count === 0) return;
        const bh = (count / maxCount2) * chartH2;
        const bx = margin + (month - 1) * barW2 + barW2 * 0.1;
        const by2 = y + chartH2 - bh;
        const bw = barW2 * 0.8;
        doc.setFillColor(pri.r, pri.g, pri.b);
        doc.setGState(new (doc as any).GState({ opacity: 0.85 }));
        doc.roundedRect(bx, by2, bw, bh, 1, 1, "F");
        doc.setGState(new (doc as any).GState({ opacity: 1 }));
        if (bh > 8) {
          doc.setFontSize(5); doc.setFont("helvetica", "bold"); doc.setTextColor(...onPri);
          doc.text(count > 999 ? `${(count / 1000).toFixed(1)}k` : String(count), bx + barW2 / 2, by2 + 5, { align: "center" });
        }
        doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 110, 130);
        doc.text(MONTHS[month - 1], bx + barW2 / 2, y + chartH2 + 8, { align: "center" });
      });

      /* ══════════════════════════════════════
         PAGE 5 — YEAR-OVER-YEAR COMPARISON
         ══════════════════════════════════════ */
      doc.addPage();
      pageHeader(t.hdr4(year - 1, year), 5);
      pageFooter();
      y = 30;

      if (prevTotalCrimes > 0) {
        const pctChange = ((totalCrimes - prevTotalCrimes) / prevTotalCrimes) * 100;
        const increased = pctChange >= 0;

        const kpiW = (W - margin * 2 - 8) / 3;
        const kpis5 = [
          { label: String(year - 1), value: prevTotalCrimes.toLocaleString("es-CO"), sub: t.registered },
          { label: String(year),     value: totalCrimes.toLocaleString("es-CO"),     sub: t.registered },
          { label: t.variation,      value: `${increased ? "+" : ""}${pctChange.toFixed(1)}%`, sub: increased ? t.increase : t.decrease },
        ];
        kpis5.forEach((k, i) => {
          const kx = margin + i * (kpiW + 4);
          const isVar = i === 2;
          doc.setFillColor(isVar ? (increased ? 220 : 16) : pri.r, isVar ? (increased ? 38 : 185) : pri.g, isVar ? (increased ? 38 : 129) : pri.b);
          doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
          doc.roundedRect(kx, y, kpiW, 22, 2, 2, "F");
          doc.setGState(new (doc as any).GState({ opacity: 1 }));
          doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(80, 90, 110);
          doc.text(k.label.toUpperCase(), kx + kpiW / 2, y + 6, { align: "center" });
          doc.setFontSize(14); doc.setFont("helvetica", "bold");
          doc.setTextColor(isVar ? (increased ? 180 : 5) : pri.r, isVar ? (increased ? 20 : 120) : pri.g, isVar ? 20 : pri.b);
          doc.text(k.value, kx + kpiW / 2, y + 14, { align: "center" });
          doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 110, 130);
          doc.text(k.sub, kx + kpiW / 2, y + 20, { align: "center" });
        });
        y += 30;

        y = sectionHeading(t.sec41Title, y);
        const dualChartW = W - margin * 2;
        const dualChartH = 45;
        const maxVal = Math.max(...monthlyTrend.map(m => m.count), ...prevMonthlyTrend.map(m => m.count), 1);
        const slotW = dualChartW / 12;
        const barPairW = slotW * 0.72;

        doc.setFillColor(247, 250, 255);
        doc.setDrawColor(220, 225, 240); doc.setLineWidth(0.3);
        doc.roundedRect(margin, y, dualChartW, dualChartH + 14, 2, 2, "FD");

        for (let i = 0; i < 12; i++) {
          const prevCount = prevMonthlyTrend[i].count;
          const currCount = monthlyTrend[i].count;
          const slotX = margin + i * slotW;
          const halfW = barPairW / 2 - 0.5;
          if (prevCount > 0) {
            const bh = (prevCount / maxVal) * dualChartH;
            doc.setFillColor(180, 190, 210); doc.setGState(new (doc as any).GState({ opacity: 0.8 }));
            doc.roundedRect(slotX + (slotW - barPairW) / 2, y + dualChartH - bh, halfW, bh, 0.5, 0.5, "F");
            doc.setGState(new (doc as any).GState({ opacity: 1 }));
          }
          if (currCount > 0) {
            const bh = (currCount / maxVal) * dualChartH;
            doc.setFillColor(pri.r, pri.g, pri.b); doc.setGState(new (doc as any).GState({ opacity: 0.9 }));
            doc.roundedRect(slotX + (slotW - barPairW) / 2 + halfW + 1, y + dualChartH - bh, halfW, bh, 0.5, 0.5, "F");
            doc.setGState(new (doc as any).GState({ opacity: 1 }));
          }
          doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 110, 130);
          doc.text(MONTHS[i], slotX + slotW / 2, y + dualChartH + 6, { align: "center" });
        }
        y += dualChartH + 20;

        doc.setFillColor(180, 190, 210); doc.rect(margin, y, 8, 4, "F");
        doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(80, 90, 110);
        doc.text(String(year - 1), margin + 10, y + 3.5);
        doc.setFillColor(pri.r, pri.g, pri.b); doc.rect(margin + 30, y, 8, 4, "F");
        doc.text(String(year), margin + 40, y + 3.5);
        y += 12;

        y = sectionHeading(t.sec42Title, y);
        const compCols = [18, 30, 30, 30, 30, 32];
        y = drawTable(
          [t.colMes, `${lang === "de" ? "STRAFTATEN" : lang === "ko" ? "범죄" : lang === "fr" ? "CRIMES" : lang === "pt" ? "CRIMES" : lang === "en" ? "CRIMES" : "DELITOS"} ${year - 1}`, `${lang === "de" ? "STRAFTATEN" : lang === "ko" ? "범죄" : lang === "fr" ? "CRIMES" : lang === "pt" ? "CRIMES" : lang === "en" ? "CRIMES" : "DELITOS"} ${year}`, t.colDiff, t.colVar, t.colTrend],
          MONTHS.map((mo, i) => {
            const p = prevMonthlyTrend[i].count;
            const c = monthlyTrend[i].count;
            const diff = c - p;
            const pct = p > 0 ? ((diff / p) * 100).toFixed(1) + "%" : t.nd;
            const trend = diff > 0 ? t.trendUp : diff < 0 ? t.trendDown : t.trendFlat;
            return [mo, p.toLocaleString("es-CO"), c.toLocaleString("es-CO"), (diff >= 0 ? "+" : "") + diff.toLocaleString("es-CO"), pct, trend];
          }),
          compCols, y, 6.5,
        );
        y += 6;

        const absDiff = Math.abs(totalCrimes - prevTotalCrimes);
        const interp = increased
          ? t.interpIncrease(year, year - 1, absDiff.toLocaleString("es-CO"), Math.abs(pctChange).toFixed(1))
          : t.interpDecrease(year, year - 1, absDiff.toLocaleString("es-CO"), Math.abs(pctChange).toFixed(1));
        doc.setFontSize(8.5); doc.setFont("helvetica", "italic"); doc.setTextColor(60, 70, 90);
        y = justifyPara(interp, margin + indent, y, W - margin * 2 - indent, 5, 3);
      } else {
        doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(120, 130, 150);
        doc.text(t.noDataPrev(year - 1), margin, y);
      }

      /* ══════════════════════════════════════
         PAGE 6 — BLOCKADES + CONCLUSIONS
         ══════════════════════════════════════ */
      doc.addPage();
      pageHeader(t.hdr5, 6);
      pageFooter();
      y = 30;

      if (activeBlockades.length > 0) {
        doc.setFillColor(220, 38, 38); doc.setGState(new (doc as any).GState({ opacity: 0.12 }));
        doc.roundedRect(margin, y, W - margin * 2, 10, 2, 2, "F");
        doc.setGState(new (doc as any).GState({ opacity: 1 }));
        doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(180, 20, 20);
        doc.text(t.blockadeAlert(activeBlockades.length), margin + indent, y + 7);
        y += 14;

        const blkCols = [36, 56, 24, 30, 24];
        y = drawTable(
          t.blkTableH,
          activeBlockades.map((b: any) => [
            b.department,
            b.location,
            b.date ?? "—",
            (b.cause ?? "—").replace(/_/g, " "),
            t.active,
          ]),
          blkCols, y, 7
        );
        y += 4;
      } else {
        doc.setFillColor(16, 185, 129); doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
        doc.roundedRect(margin, y, W - margin * 2, 10, 2, 2, "F");
        doc.setGState(new (doc as any).GState({ opacity: 1 }));
        doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(5, 120, 80);
        doc.text(t.blockadeOk, margin + indent, y + 7);
        y += 16;
      }

      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 30, 50);
      doc.text(t.conclusionsTitle, W / 2, y, { align: "center" }); y += 6;
      doc.setDrawColor(pri.r, pri.g, pri.b); doc.setLineWidth(0.5);
      doc.line(margin + 20, y, W - margin - 20, y); y += 5;
      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(pri.r, pri.g, pri.b);
      doc.text(t.conclusionsSubtitle, margin, y); y += 6;
      doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 70);
      const peakMo = monthlyTrend.reduce((a, b) => a.count >= b.count ? a : b, monthlyTrend[0]);
      const conclusions = [
        t.concl1(year, totalCrimes.toLocaleString("es-CO"), topDepts.length),
        t.concl2(topDepts[0]?.[0] ?? "—", topDepts[0]?.[1]?.toLocaleString("es-CO") ?? "—", topDepts[0] ? ((topDepts[0][1] / totalCrimes) * 100).toFixed(1) : "0"),
        t.concl3(crimeTypeSummary[0]?.[0] ?? "—", crimeTypeSummary[0]?.[1]?.toLocaleString("es-CO") ?? "—"),
        peakMo?.count > 0 ? t.concl4(MONTHS_FULL[peakMo.month - 1], peakMo.count.toLocaleString("es-CO")) : null,
        activeBlockades.length > 0 ? t.concl5Alert(activeBlockades.length) : t.concl5Ok,
        t.concl6,
      ].filter(Boolean) as string[];

      conclusions.forEach((c) => {
        const isAlert = c.startsWith("ALERTA") || c.startsWith("OPERATIONAL ALERT") || c.startsWith("ALERTE") || c.startsWith("BETRIEB") || c.startsWith("운영 경보");
        const [title, ...rest] = c.split(": ");
        const hasTitle = rest.length > 0;

        doc.setFillColor(isAlert ? 200 : pri.r, isAlert ? 20 : pri.g, isAlert ? 20 : pri.b);
        doc.circle(margin + 1.5, y + 2.5, 1.5, "F");

        if (hasTitle) {
          doc.setFontSize(8.5); doc.setFont("helvetica", "bold");
          doc.setTextColor(isAlert ? 150 : 30, isAlert ? 20 : 30, isAlert ? 20 : 50);
          doc.text(`${title}:`, margin + indent, y + 3);
          const titleW = doc.getTextWidth(`${title}: `);
          doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 70);
          const bodyText = rest.join(": ");
          const firstLineW = W - margin * 2 - indent - titleW;
          const firstBodyLines = doc.splitTextToSize(bodyText, firstLineW);
          if (firstBodyLines.length === 1) {
            doc.text(firstBodyLines[0], margin + indent + titleW, y + 3);
            y += 7;
          } else {
            doc.text(firstBodyLines[0], margin + indent + titleW, y + 3);
            const remaining = bodyText.slice(firstBodyLines[0].length).trim();
            y = justifyPara(remaining, margin + indent, y + 8, W - margin * 2 - indent, 4.5, 2);
          }
        } else {
          doc.setFontSize(8.5); doc.setFont("helvetica", isAlert ? "bold" : "normal");
          doc.setTextColor(isAlert ? 150 : 50, isAlert ? 20 : 50, isAlert ? 20 : 70);
          y = justifyPara(c, margin + indent, y + 3, W - margin * 2 - indent, 4.5, 3);
        }
      });

      y += 10;
      doc.setFontSize(8); doc.setFont("helvetica", "italic"); doc.setTextColor(80, 90, 110);
      doc.text(t.elaboratedBy, margin, y); y += 6;
      doc.setDrawColor(pri.r, pri.g, pri.b); doc.setLineWidth(0.4);
      doc.line(margin, y, margin + 72, y); y += 5;
      doc.setFont("helvetica", "bold"); doc.setTextColor(30, 30, 50); doc.setFontSize(9);
      doc.text(config.analystName, margin, y);
      doc.setFont("helvetica", "normal"); doc.setTextColor(100, 110, 130); doc.setFontSize(7.5);
      doc.text(`${config.analystEmail}  ·  ${config.analystPhone}`, margin, y + 5);
      doc.text(dateStr, margin, y + 10);
      doc.setFontSize(7); doc.setFont("helvetica", "italic");
      doc.text(t.sourceLine, margin, y + 16);

      /* ══════════════════════════════════════
         OPTIONAL PAGE 7 — AI DOCUMENT ANALYSIS
         ══════════════════════════════════════ */
      if (pdfAnalysis) {
        doc.addPage();
        pageHeader(t.sec6Title, 7);
        pageFooter();
        let yp = 26;

        const riskColor = pdfAnalysis.riesgoLogistico === "ALTO"
          ? { r:180, g:30, b:30 } : pdfAnalysis.riesgoLogistico === "MEDIO"
          ? { r:180, g:120, b:10 } : { r:20, g:130, b:80 };

        doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(pri.r, pri.g, pri.b);
        { const tl = doc.splitTextToSize(t.sec6Heading, W - margin * 2); doc.text(tl, margin, yp); yp += tl.length * 5.5; }

        doc.setFillColor(245, 247, 252);
        doc.rect(margin, yp, W - margin * 2, 22, "F");
        doc.setDrawColor(220, 225, 240); doc.setLineWidth(0.3);
        doc.rect(margin, yp, W - margin * 2, 22, "S");
        doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 30, 50);
        doc.text(doc.splitTextToSize(pdfAnalysis.titulo || "Documento sin título", W - margin * 2 - 20), margin + 4, yp + 6);
        doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(80, 90, 110);
        doc.text(`${t.sourceLine.split(":")[0]}: ${pdfAnalysis.fuente || "—"}${pdfAnalysis.fechaDocumento ? `  ·  ${pdfAnalysis.fechaDocumento}` : ""}`, margin + 4, yp + 14);
        doc.setFillColor(riskColor.r, riskColor.g, riskColor.b);
        doc.roundedRect(W - margin - 36, yp + 5, 34, 12, 2, 2, "F");
        doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
        doc.text(`${t.riesgo} ${pdfAnalysis.riesgoLogistico}`, W - margin - 34, yp + 13);
        yp += 28;

        doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(pri.r, pri.g, pri.b);
        { const tl = doc.splitTextToSize(t.sec61Title, W - margin * 2); doc.text(tl, margin, yp); yp += tl.length * 5.5; }
        doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 70);
        yp = justifyPara(pdfAnalysis.resumen || "", margin + indent, yp, W - margin * 2 - indent, 5, 6);

        if (pdfAnalysis.hallazgos?.length > 0) {
          doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(pri.r, pri.g, pri.b);
          { const tl = doc.splitTextToSize(t.sec62Title, W - margin * 2); doc.text(tl, margin, yp); yp += tl.length * 5.5; }
          doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 70);
          (pdfAnalysis.hallazgos as string[]).forEach(h => {
            doc.setFillColor(pri.r, pri.g, pri.b); doc.circle(margin + 1.5, yp + 2, 1.5, "F");
            yp = justifyPara(h, margin + indent, yp, W - margin * 2 - indent, 4.5, 3);
          });
          yp += 2;
        }

        if (pdfAnalysis.amenazasIdentificadas?.length > 0) {
          doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(pri.r, pri.g, pri.b);
          { const tl = doc.splitTextToSize(t.sec63Title, W - margin * 2); doc.text(tl, margin, yp); yp += tl.length * 5.5; }
          doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 70);
          (pdfAnalysis.amenazasIdentificadas as string[]).forEach(a => {
            doc.setFillColor(180, 30, 30); doc.circle(margin + 1.5, yp + 2, 1.5, "F");
            yp = justifyPara(a, margin + indent, yp, W - margin * 2 - indent, 4.5, 3);
          });
          yp += 2;
        }

        if (pdfAnalysis.departamentosAfectados?.length > 0) {
          doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80, 90, 110);
          doc.text(t.affectedDepts, margin, yp); yp += 5;
          doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 70);
          doc.text((pdfAnalysis.departamentosAfectados as string[]).join("  ·  "), margin + indent, yp); yp += 7;
        }

        if (pdfAnalysis.recomendacionOperacional) {
          doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(pri.r, pri.g, pri.b);
          { const tl = doc.splitTextToSize(t.sec64Title, W - margin * 2); doc.text(tl, margin, yp); yp += tl.length * 5.5; }
          doc.setFillColor(245, 247, 252); doc.rect(margin, yp, W - margin * 2, 2, "F");
          yp += 4;
          doc.setFontSize(8.5); doc.setFont("helvetica", "italic"); doc.setTextColor(60, 70, 90);
          yp = justifyPara(pdfAnalysis.recomendacionOperacional, margin + indent, yp, W - margin * 2 - indent, 5, 4);
        }

        doc.setFontSize(7); doc.setFont("helvetica", "italic"); doc.setTextColor(150, 160, 180);
        doc.text(t.aiNote(pdfFile?.name || "adjunto"), margin, yp + 8);
      }

      const filename = `${t.filePrefix}_${config.companyName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}_${year}.pdf`;
      doc.save(filename);
      setGenerated(true);
      setTimeout(() => setGenerated(false), 4000);
    } catch (err) {
      console.error("PDF generation error:", err);
    } finally {
      setGenerating(false);
    }
  }, [config, year, lang, totalCrimes, prevTotalCrimes, topDepts, crimeTypeSummary, monthlyTrend, prevMonthlyTrend, activeBlockades, pdfAnalysis, pdfFile]);

  /* ── UI styles ── */
  const S = {
    section: { background: panelBg, border: `1px solid ${borderC}`, borderRadius: "12px", padding: "18px 20px" } as React.CSSProperties,
    label: { fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: textMuted, marginBottom: "5px", display: "block" },
    input: { width: "100%", background: inputBg, border: `1px solid ${borderC}`, borderRadius: "6px", padding: "8px 11px", fontSize: "13px", color: textMain, outline: "none", boxSizing: "border-box" as const } as React.CSSProperties,
    field: { display: "flex", flexDirection: "column" as const, gap: "4px", flex: 1 },
    row: { display: "flex", gap: "12px" } as React.CSSProperties,
    sectionTitle: { fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: textMuted, marginBottom: "14px", display: "flex", alignItems: "center", gap: "6px" } as React.CSSProperties,
  };

  const PRESETS = ["#00bcd4","#0d1b31","#006b87","#0066cc","#00897b","#5e35b1","#e53935","#f57c00","#2e7d32","#37474f"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* ── Header ── */}
      <div style={{ background: dark?"linear-gradient(135deg,#0c1628,#0e1f38)":"linear-gradient(135deg,#e8f4ff,#dbeafe)", border:`1px solid ${dark?"rgba(99,102,241,0.2)":"rgba(99,102,241,0.15)"}`, borderRadius:"12px", padding:"14px 18px", display:"flex", alignItems:"center", gap:"12px" }}>
        <div style={{ width:36, height:36, borderRadius:"10px", background:"rgba(99,102,241,0.15)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <FileText style={{ width:18, height:18, color:"#6366f1" }} />
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:"13px", fontWeight:700, color:textMain }}>Informe Gerencial PDF — Personalizable por Cliente</div>
          <div style={{ fontSize:"11px", color:textMuted, marginTop:"2px" }}>Configure el branding de su empresa · El PDF se genera localmente y se descarga listo para enviar</div>
        </div>
        <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
          <label style={{ fontSize:"10px", color:textMuted, fontWeight:600 }}>AÑO</label>
          <select value={year} onChange={e => setYear(+e.target.value)} style={{ ...S.input, width:"90px", padding:"5px 8px", fontSize:"12px", cursor:"pointer" }}>
            {[2026,2025,2024,2023,2022,2021,2020].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>

        {/* LEFT: Company data */}
        <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
          <div style={S.section}>
            <div style={S.sectionTitle}><Building2 size={12} /> Datos de la Empresa</div>
            <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
              <div style={S.field}>
                <label style={S.label}>Nombre de la empresa</label>
                <input style={S.input} value={config.companyName} onChange={e => updateConfig({ companyName: e.target.value })} placeholder="Transportes del Norte S.A.S." />
              </div>
              <div style={S.field}>
                <label style={S.label}>Subtítulo / Sector</label>
                <input style={S.input} value={config.companySubtitle} onChange={e => updateConfig({ companySubtitle: e.target.value })} placeholder="Logística y Transporte de Carga" />
              </div>
              <div style={S.field}>
                <label style={S.label}>Pie de página / Confidencialidad</label>
                <textarea rows={2} style={{ ...S.input, resize:"none" }} value={config.footerDisclaimer} onChange={e => updateConfig({ footerDisclaimer: e.target.value })} />
              </div>
            </div>
          </div>

          <div style={S.section}>
            <div style={S.sectionTitle}><User size={12} /> Analista / Firmante</div>
            <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
              <div style={S.field}>
                <label style={S.label}>Nombre completo</label>
                <input style={S.input} value={config.analystName} onChange={e => updateConfig({ analystName: e.target.value })} placeholder="Ing. Ana Martínez" />
              </div>
              <div style={S.row}>
                <div style={S.field}>
                  <label style={S.label}><Mail size={9} style={{ display:"inline", marginRight:"3px" }} />Email</label>
                  <input style={S.input} value={config.analystEmail} onChange={e => updateConfig({ analystEmail: e.target.value })} placeholder="analista@empresa.com" />
                </div>
                <div style={S.field}>
                  <label style={S.label}><Phone size={9} style={{ display:"inline", marginRight:"3px" }} />Teléfono</label>
                  <input style={S.input} value={config.analystPhone} onChange={e => updateConfig({ analystPhone: e.target.value })} placeholder="+57 310 000 0000" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Logo + color */}
        <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
          <div style={S.section}>
            <div style={S.sectionTitle}><Upload size={12} /> Logo de la Empresa</div>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{ border:`2px dashed ${dark?"rgba(255,255,255,0.12)":"rgba(0,0,0,0.12)"}`, borderRadius:"10px", padding:"22px", textAlign:"center", cursor:"pointer", background:dark?"rgba(255,255,255,0.02)":"#f8fafc" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = config.primaryColor)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = dark?"rgba(255,255,255,0.12)":"rgba(0,0,0,0.12)")}
            >
              {activeLogo ? (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"8px" }}>
                  <img src={activeLogo} alt="Logo" style={{ maxHeight:"72px", maxWidth:"180px", objectFit:"contain", borderRadius:"6px" }} />
                  <span style={{ fontSize:"11px", color:textMuted }}>
                    {config.logoDataUrl ? "Logo personalizado · clic para cambiar" : "Logo SafeNode (por defecto) · clic para reemplazar"}
                  </span>
                </div>
              ) : (
                <>
                  <Upload style={{ width:26, height:26, color:textMuted, margin:"0 auto 8px" }} />
                  <div style={{ fontSize:"12px", fontWeight:600, color:textMain }}>Subir logo de empresa</div>
                  <div style={{ fontSize:"11px", color:textMuted, marginTop:"4px" }}>PNG o JPG — aparece en la portada del PDF</div>
                </>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" style={{ display:"none" }} onChange={handleLogoUpload} />
            {config.logoDataUrl && (
              <button onClick={() => updateConfig({ logoDataUrl:"" })} style={{ marginTop:"6px", fontSize:"10px", color:"#ef4444", background:"transparent", border:"none", cursor:"pointer" }}>✕ Restaurar logo SafeNode</button>
            )}
          </div>

          <div style={S.section}>
            <div style={S.sectionTitle}><Palette size={12} /> Color Corporativo</div>
            <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
              <div style={{ display:"flex", gap:"7px", flexWrap:"wrap" }}>
                {PRESETS.map(c => (
                  <button key={c} onClick={() => updateConfig({ primaryColor:c })} title={c}
                    style={{ width:30, height:30, borderRadius:"7px", background:c, cursor:"pointer", border:config.primaryColor===c?"3px solid white":"2px solid transparent", boxSizing:"border-box", boxShadow:config.primaryColor===c?`0 0 0 2px ${c}`:"none", transition:"all 0.15s" }} />
                ))}
              </div>
              <div style={S.field}>
                <label style={S.label}>Color personalizado (hex)</label>
                <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                  <input type="color" value={config.primaryColor} onChange={e => updateConfig({ primaryColor:e.target.value })}
                    style={{ width:38, height:34, borderRadius:"6px", border:`1px solid ${borderC}`, cursor:"pointer", padding:"2px", background:"none" }} />
                  <input style={{ ...S.input, flex:1 }} value={config.primaryColor} onChange={e => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) updateConfig({ primaryColor:e.target.value }); }} />
                  <div style={{ width:56, height:34, borderRadius:"6px", background:config.primaryColor, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <span style={{ fontSize:"8px", fontWeight:700, color:isLight(config.primaryColor)?"#000":"#fff" }}>MUESTRA</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PDF document analysis */}
      <div style={{ background:dark?"rgba(0,212,255,0.04)":"rgba(0,212,255,0.03)", border:`1px solid ${dark?"rgba(0,212,255,0.18)":"rgba(0,212,255,0.15)"}`, borderRadius:"12px", padding:"14px 18px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"8px" }}>
          <FileText style={{ width:14, height:14, color:"#00d4ff" }} />
          <span style={{ fontSize:"11px", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"#00d4ff" }}>Fuente Documental — PDF Gubernamental</span>
          <span style={{ marginLeft:"auto", fontSize:"9px", color:textMuted, background:"rgba(0,212,255,0.07)", padding:"2px 7px", borderRadius:"4px", fontStyle:"italic" }}>IA</span>
        </div>
        <div style={{ fontSize:"11px", color:textMuted, marginBottom:"12px", lineHeight:1.5 }}>
          Suba un documento oficial (UNODC, Policía Nacional, Ministerio de Defensa, Procuraduría, INVIAS, etc.) y la IA generará un análisis de inteligencia que se incluirá como sección adicional en el PDF.
        </div>
        <input ref={pdfInputRef} type="file" accept=".pdf" onChange={handlePdfSelect} style={{ display:"none" }} />
        <div style={{ display:"flex", gap:"8px", alignItems:"center", flexWrap:"wrap" }}>
          <button
            onClick={() => pdfInputRef.current?.click()}
            style={{ display:"flex", alignItems:"center", gap:"6px", padding:"7px 14px", fontSize:"11px", fontWeight:700, borderRadius:"6px", cursor:"pointer", background:dark?"rgba(255,255,255,0.06)":"#f1f5f9", border:`1px solid ${dark?"rgba(255,255,255,0.12)":"rgba(0,0,0,0.12)"}`, color:textMain }}>
            <Upload style={{ width:11, height:11 }} />
            {pdfFile ? pdfFile.name.slice(0, 28) + (pdfFile.name.length > 28 ? "…" : "") : "Seleccionar PDF…"}
          </button>
          {pdfFile && (
            <button
              onClick={handlePdfAnalyze}
              disabled={pdfAnalyzing}
              style={{ display:"flex", alignItems:"center", gap:"6px", padding:"7px 14px", fontSize:"11px", fontWeight:700, borderRadius:"6px", cursor:pdfAnalyzing?"wait":"pointer", background:"rgba(0,212,255,0.12)", border:"1px solid rgba(0,212,255,0.3)", color:"#00d4ff" }}>
              {pdfAnalyzing ? <><RefreshCw style={{ width:10, height:10, animation:"spin 1s linear infinite" }} /> Analizando…</> : <><Sparkles style={{ width:10, height:10 }} /> Analizar documento</>}
            </button>
          )}
          {pdfAnalysis && (
            <button onClick={() => { setPdfFile(null); setPdfAnalysis(null); if(pdfInputRef.current) pdfInputRef.current.value=""; }}
              style={{ fontSize:"10px", color:textMuted, background:"transparent", border:`1px solid ${dark?"rgba(255,255,255,0.1)":"rgba(0,0,0,0.1)"}`, borderRadius:"5px", padding:"4px 8px", cursor:"pointer" }}>
              Quitar
            </button>
          )}
        </div>
        {pdfError && (
          <div style={{ marginTop:"10px", fontSize:"10px", color:"#ef4444", display:"flex", alignItems:"center", gap:"5px" }}>
            <AlertTriangle style={{ width:10, height:10 }} /> {pdfError}
          </div>
        )}
        {pdfAnalysis && (
          <div style={{ marginTop:"12px", background:dark?"rgba(0,212,255,0.05)":"rgba(0,212,255,0.04)", border:`1px solid rgba(0,212,255,0.18)`, borderRadius:"8px", padding:"12px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"8px" }}>
              <CheckCircle2 style={{ width:12, height:12, color:"#10b981" }} />
              <span style={{ fontSize:"11px", fontWeight:700, color:"#10b981" }}>Análisis completado — se incluirá en el PDF como sección adicional</span>
              <span style={{ marginLeft:"auto", fontSize:"9px", fontWeight:700, color: pdfAnalysis.riesgoLogistico==="ALTO"?"#ef4444": pdfAnalysis.riesgoLogistico==="MEDIO"?"#f59e0b":"#10b981", background: pdfAnalysis.riesgoLogistico==="ALTO"?"rgba(239,68,68,0.12)": pdfAnalysis.riesgoLogistico==="MEDIO"?"rgba(245,158,11,0.12)":"rgba(16,185,129,0.12)", padding:"2px 8px", borderRadius:"4px" }}>
                RIESGO {pdfAnalysis.riesgoLogistico}
              </span>
            </div>
            <div style={{ fontSize:"11px", fontWeight:700, color:textMain, marginBottom:"2px" }}>{pdfAnalysis.titulo}</div>
            <div style={{ fontSize:"10px", color:textMuted, marginBottom:"8px" }}>{pdfAnalysis.fuente}{pdfAnalysis.fechaDocumento ? ` · ${pdfAnalysis.fechaDocumento}` : ""}</div>
            <div style={{ fontSize:"11px", color:textMuted, lineHeight:1.5, marginBottom:"8px" }}>{pdfAnalysis.resumen}</div>
            {pdfAnalysis.departamentosAfectados?.length > 0 && (
              <div style={{ fontSize:"10px", color:"#00d4ff" }}>Departamentos: {pdfAnalysis.departamentosAfectados.join(", ")}</div>
            )}
          </div>
        )}
      </div>

      {/* Preview summary */}
      <div style={{ background:dark?"rgba(99,102,241,0.06)":"rgba(99,102,241,0.04)", border:`1px solid ${dark?"rgba(99,102,241,0.2)":"rgba(99,102,241,0.12)"}`, borderRadius:"12px", padding:"14px 18px" }}>
        <div style={{ fontSize:"11px", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"#6366f1", marginBottom:"10px" }}>
          Contenido del PDF · {year} · {totalCrimes.toLocaleString("es-CO")} delitos · {pdfAnalysis ? "6" : "5"} páginas
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:"8px" }}>
          {[
            ["Portada","Logo + branding corporativo"],
            ["Resumen Ejecutivo","4 KPIs + estadísticas clave"],
            ["Ranking Deptal.","Top 12 depts. con gráfico"],
            ["Tipos + Tendencia","Tabla + gráfico de barras"],
            ["Bloqueos + Conclusiones","Alertas + recomendaciones"],
          ].map(([title,detail]) => (
            <div key={title} style={{ background:dark?"rgba(255,255,255,0.025)":"#fff", border:`1px solid ${dark?"rgba(99,102,241,0.1)":"rgba(99,102,241,0.08)"}`, borderRadius:"7px", padding:"9px 11px" }}>
              <div style={{ fontSize:"10px", fontWeight:700, color:"#6366f1", marginBottom:"3px" }}>{title}</div>
              <div style={{ fontSize:"10px", color:textMuted }}>{detail}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Language selector */}
      <div style={{ background:dark?"rgba(255,255,255,0.025)":"rgba(0,0,0,0.02)", border:`1px solid ${borderC}`, borderRadius:"12px", padding:"14px 18px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"12px" }}>
          <Globe style={{ width:13, height:13, color:textMuted }} />
          <span style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:textMuted }}>Idioma del Informe PDF</span>
        </div>
        <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
          {LANG_OPTIONS.map(opt => {
            const active = lang === opt.code;
            return (
              <button
                key={opt.code}
                onClick={() => setLang(opt.code)}
                style={{
                  display: "flex", alignItems: "center", gap: "7px",
                  padding: "7px 14px", borderRadius: "8px", cursor: "pointer",
                  fontSize: "12px", fontWeight: active ? 700 : 500,
                  border: active ? `1.5px solid ${config.primaryColor}` : `1px solid ${borderC}`,
                  background: active ? `${config.primaryColor}22` : (dark ? "rgba(255,255,255,0.04)" : "#f8fafc"),
                  color: active ? config.primaryColor : textMain,
                  transition: "all 0.15s",
                  boxShadow: active ? `0 0 0 1px ${config.primaryColor}44` : "none",
                }}
              >
                <span style={{ fontSize:"16px", lineHeight:1 }}>{opt.flag}</span>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
        {lang === "ko" && (
          <div style={{ marginTop:"10px", fontSize:"10px", color:textMuted, display:"flex", alignItems:"center", gap:"5px" }}>
            <AlertTriangle style={{ width:10, height:10 }} />
            한국어 PDF는 유니코드 지원 뷰어(Adobe Acrobat, Chrome)에서 최적으로 표시됩니다.
          </div>
        )}
      </div>

      {/* Generate button */}
      <button
        onClick={generatePDF}
        disabled={generating || totalCrimes === 0}
        style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"10px", padding:"15px 28px", borderRadius:"10px", cursor:generating?"wait":"pointer", fontSize:"14px", fontWeight:700, letterSpacing:"0.04em", background:generated?"#10b981":config.primaryColor, color:generated?"#fff":(isLight(config.primaryColor)?"#000":"#fff"), border:"none", boxShadow:`0 4px 22px ${config.primaryColor}55`, opacity:(generating||totalCrimes===0)?0.6:1, transition:"all 0.2s" }}
      >
        {generated
          ? <><CheckCircle2 size={18} /> PDF descargado exitosamente</>
          : generating
          ? <><RefreshCw size={18} className="animate-spin" /> Generando PDF…</>
          : <><Download size={18} /> Generar Informe PDF — {LANG_OPTIONS.find(o => o.code === lang)?.flag} {LANG_OPTIONS.find(o => o.code === lang)?.label}</>
        }
      </button>
      {totalCrimes === 0 && <div style={{ textAlign:"center", fontSize:"12px", color:textMuted, marginTop:"-8px" }}>Cargando datos del año {year}…</div>}
    </div>
  );
}
