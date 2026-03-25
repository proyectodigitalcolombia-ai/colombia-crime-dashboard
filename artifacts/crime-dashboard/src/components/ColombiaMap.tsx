import { useState, useMemo } from "react";
import * as d3Scale from "d3-scale-chromatic";
import { DepartmentStats } from "@workspace/api-client-react";

// Approximated paths for Colombian Departments (very simplified for illustrative purposes)
const DEPARTMENTS = [
  { id: "AMA", name: "Amazonas", path: "M 200,400 L 250,450 L 280,420 L 250,380 Z", x: 230, y: 410 },
  { id: "ANT", name: "Antioquia", path: "M 100,150 L 150,150 L 150,200 L 100,200 Z", x: 125, y: 175 },
  { id: "ARA", name: "Arauca", path: "M 200,180 L 250,180 L 250,220 L 200,220 Z", x: 225, y: 200 },
  { id: "ATL", name: "Atlántico", path: "M 120,50 L 140,50 L 140,70 L 120,70 Z", x: 130, y: 60 },
  { id: "BOL", name: "Bolívar", path: "M 120,70 L 150,70 L 150,130 L 120,130 Z", x: 135, y: 100 },
  { id: "BOY", name: "Boyacá", path: "M 170,180 L 200,180 L 200,220 L 170,220 Z", x: 185, y: 200 },
  { id: "CAL", name: "Caldas", path: "M 130,180 L 170,180 L 170,200 L 130,200 Z", x: 150, y: 190 },
  { id: "CAQ", name: "Caquetá", path: "M 150,300 L 200,300 L 200,350 L 150,350 Z", x: 175, y: 325 },
  { id: "CAS", name: "Casanare", path: "M 200,220 L 250,220 L 250,260 L 200,260 Z", x: 225, y: 240 },
  { id: "CAU", name: "Cauca", path: "M 80,260 L 120,260 L 120,300 L 80,300 Z", x: 100, y: 280 },
  { id: "CES", name: "Cesar", path: "M 150,70 L 180,70 L 180,120 L 150,120 Z", x: 165, y: 95 },
  { id: "CHO", name: "Chocó", path: "M 70,150 L 100,150 L 100,240 L 70,240 Z", x: 85, y: 195 },
  { id: "COR", name: "Córdoba", path: "M 140,100 L 160,100 L 160,150 L 140,150 Z", x: 150, y: 125 },
  { id: "CUN", name: "Cundinamarca", path: "M 150,200 L 180,200 L 180,240 L 150,240 Z", x: 165, y: 220 },
  { id: "GUA", name: "Guainía", path: "M 250,260 L 300,260 L 300,300 L 250,300 Z", x: 275, y: 280 },
  { id: "GUV", name: "Guaviare", path: "M 200,260 L 250,260 L 250,300 L 200,300 Z", x: 225, y: 280 },
  { id: "HUI", name: "Huila", path: "M 120,260 L 150,260 L 150,300 L 120,300 Z", x: 135, y: 280 },
  { id: "LAG", name: "La Guajira", path: "M 160,20 L 200,20 L 200,70 L 160,70 Z", x: 180, y: 45 },
  { id: "MAG", name: "Magdalena", path: "M 140,50 L 170,50 L 170,100 L 140,100 Z", x: 155, y: 75 },
  { id: "MET", name: "Meta", path: "M 180,240 L 240,240 L 240,280 L 180,280 Z", x: 210, y: 260 },
  { id: "NAR", name: "Nariño", path: "M 60,300 L 100,300 L 100,340 L 60,340 Z", x: 80, y: 320 },
  { id: "NSA", name: "Norte de Santander", path: "M 170,130 L 200,130 L 200,170 L 170,170 Z", x: 185, y: 150 },
  { id: "PUT", name: "Putumayo", path: "M 100,320 L 150,320 L 150,360 L 100,360 Z", x: 125, y: 340 },
  { id: "QUI", name: "Quindío", path: "M 125,200 L 140,200 L 140,215 L 125,215 Z", x: 132, y: 207 },
  { id: "RIS", name: "Risaralda", path: "M 120,190 L 135,190 L 135,205 L 120,205 Z", x: 127, y: 197 },
  { id: "SAP", name: "San Andrés y Providencia", path: "M 30,30 L 50,30 L 50,50 L 30,50 Z", x: 40, y: 40 },
  { id: "SAN", name: "Santander", path: "M 160,150 L 190,150 L 190,190 L 160,190 Z", x: 175, y: 170 },
  { id: "SUC", name: "Sucre", path: "M 130,80 L 150,80 L 150,110 L 130,110 Z", x: 140, y: 95 },
  { id: "TOL", name: "Tolima", path: "M 130,220 L 160,220 L 160,260 L 130,260 Z", x: 145, y: 240 },
  { id: "VAC", name: "Valle del Cauca", path: "M 90,210 L 120,210 L 120,260 L 90,260 Z", x: 105, y: 235 },
  { id: "VAU", name: "Vaupés", path: "M 230,300 L 280,300 L 280,350 L 230,350 Z", x: 255, y: 325 },
  { id: "VIC", name: "Vichada", path: "M 250,200 L 310,200 L 310,260 L 250,260 Z", x: 280, y: 230 },
  { id: "BOG", name: "Bogotá, D.C.", path: "M 165,220 L 175,220 L 175,230 L 165,230 Z", x: 170, y: 225 },
];

interface ColombiaMapProps {
  data: DepartmentStats[];
}

export function ColombiaMap({ data }: ColombiaMapProps) {
  const [hoveredDept, setHoveredDept] = useState<{ name: string; count: number; x: number; y: number } | null>(null);

  const maxCount = useMemo(() => {
    return Math.max(...data.map((d) => d.totalCount), 1);
  }, [data]);

  const getColor = (departmentName: string) => {
    const deptData = data.find((d) => d.department.toLowerCase() === departmentName.toLowerCase());
    if (!deptData) return "#e5e7eb"; // gray-200
    
    // Scale from 0 to 1
    const value = deptData.totalCount / maxCount;
    // interpolateOrRd goes from light orange to dark red.
    // We can also use interpolatePuBuGn or interpolateBlues as requested "azul claro a rojo oscuro"
    // D3 doesn't have a direct blue to red, so we'll do a simple custom scale or use interpolateOrRd.
    // Let's use interpolateReds for heat.
    return d3Scale.interpolateReds(value);
  };

  const handleMouseEnter = (dept: typeof DEPARTMENTS[0], e: React.MouseEvent) => {
    const deptData = data.find((d) => d.department.toLowerCase() === dept.name.toLowerCase());
    setHoveredDept({
      name: dept.name,
      count: deptData?.totalCount || 0,
      x: dept.x,
      y: dept.y,
    });
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <svg viewBox="0 0 350 500" className="w-full max-h-[400px] object-contain drop-shadow-sm">
        {DEPARTMENTS.map((dept) => (
          <path
            key={dept.id}
            d={dept.path}
            fill={getColor(dept.name)}
            stroke="#ffffff"
            strokeWidth="1"
            className="transition-colors duration-200 hover:opacity-80 cursor-pointer"
            onMouseEnter={(e) => handleMouseEnter(dept, e)}
            onMouseLeave={() => setHoveredDept(null)}
          />
        ))}
        {/* Simple Legend */}
        <g transform="translate(20, 450)">
          <text x="0" y="-5" fontSize="10" fill="#6b7280">Menos</text>
          <rect x="0" y="0" width="15" height="10" fill={d3Scale.interpolateReds(0.1)} />
          <rect x="15" y="0" width="15" height="10" fill={d3Scale.interpolateReds(0.3)} />
          <rect x="30" y="0" width="15" height="10" fill={d3Scale.interpolateReds(0.5)} />
          <rect x="45" y="0" width="15" height="10" fill={d3Scale.interpolateReds(0.7)} />
          <rect x="60" y="0" width="15" height="10" fill={d3Scale.interpolateReds(0.9)} />
          <text x="80" y="8" fontSize="10" fill="#6b7280">Más</text>
        </g>
      </svg>

      {hoveredDept && (
        <div
          className="absolute pointer-events-none bg-black/80 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap transform -translate-x-1/2 -translate-y-full"
          style={{
            left: `${(hoveredDept.x / 350) * 100}%`,
            top: `${(hoveredDept.y / 500) * 100}%`,
          }}
        >
          <div className="font-bold">{hoveredDept.name}</div>
          <div>{hoveredDept.count.toLocaleString()} casos</div>
        </div>
      )}
    </div>
  );
}
