import { useQuery } from "@tanstack/react-query";

export const DEPT_COORDS: Record<string, [number, number]> = {
  "Bogotá D.C.":         [4.71, -74.07],
  "Cundinamarca":        [4.71, -74.07],
  "Antioquia":           [6.25, -75.56],
  "Valle del Cauca":     [3.43, -76.52],
  "Atlántico":           [10.96, -74.79],
  "Bolívar":             [10.39, -75.51],
  "Santander":           [7.13, -73.13],
  "Córdoba":             [8.75, -75.89],
  "Norte de Santander":  [7.89, -72.50],
  "Cauca":               [2.44, -76.61],
  "Nariño":              [1.21, -77.28],
  "Tolima":              [4.44, -75.24],
  "Boyacá":              [5.53, -73.36],
  "Huila":               [2.93, -75.28],
  "Caldas":              [5.07, -75.52],
  "Risaralda":           [4.81, -75.69],
  "Quindío":             [4.53, -75.68],
  "Meta":                [4.14, -73.63],
  "Cesar":               [10.47, -73.25],
  "La Guajira":          [11.54, -72.91],
  "Magdalena":           [11.24, -74.19],
  "Sucre":               [9.30, -75.40],
  "Chocó":               [5.69, -76.65],
  "Arauca":              [7.09, -70.76],
  "Casanare":            [5.33, -72.39],
  "Caquetá":             [1.62, -75.61],
  "Putumayo":            [1.22, -76.65],
  "Guaviare":            [2.57, -72.65],
  "Vichada":             [4.99, -67.91],
  "Guainía":             [3.86, -67.92],
  "Vaupés":              [1.18, -70.22],
  "Amazonas":            [-4.19, -69.94],
};

export interface WeatherInfo {
  temp: number;
  precipitation: number;
  weatherCode: number;
  condition: string;
  icon: string;
  alert: boolean;
}

function decodeWMO(code: number): { condition: string; icon: string; alert: boolean } {
  if (code === 0)           return { condition: "Despejado",      icon: "☀️",  alert: false };
  if (code <= 2)            return { condition: "Parcial",        icon: "⛅",  alert: false };
  if (code === 3)           return { condition: "Nublado",        icon: "☁️",  alert: false };
  if (code <= 48)           return { condition: "Neblina",        icon: "🌫️", alert: true  };
  if (code <= 57)           return { condition: "Llovizna",       icon: "🌦️", alert: false };
  if (code <= 65)           return { condition: "Lluvia",         icon: "🌧️", alert: code >= 63 };
  if (code <= 67)           return { condition: "Lluvia+Hielo",   icon: "🌨️", alert: true  };
  if (code <= 77)           return { condition: "Nieve",          icon: "❄️",  alert: true  };
  if (code <= 82)           return { condition: "Aguacero",       icon: "🌧️", alert: code >= 81 };
  if (code <= 84)           return { condition: "Aguacero fuerte",icon: "⛈️", alert: true  };
  if (code <= 94)           return { condition: "Tormenta",       icon: "⛈️", alert: true  };
  return                           { condition: "Tormenta eléct.",icon: "🌩️", alert: true  };
}

export function useWeather(departments: string[]) {
  const depts = departments.filter(d => DEPT_COORDS[d]);
  return useQuery<Record<string, WeatherInfo>>({
    queryKey: ["weather", depts],
    queryFn: async () => {
      const results: Record<string, WeatherInfo> = {};
      await Promise.all(
        depts.map(async dept => {
          const [lat, lon] = DEPT_COORDS[dept];
          try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,weathercode&timezone=America%2FBogota`;
            const res = await fetch(url);
            if (!res.ok) return;
            const data = await res.json();
            const { temperature_2m, precipitation, weathercode } = data.current;
            const decoded = decodeWMO(weathercode);
            results[dept] = {
              temp: Math.round(temperature_2m),
              precipitation: Math.round(precipitation * 10) / 10,
              weatherCode: weathercode,
              ...decoded,
            };
          } catch { /* skip if network issue */ }
        })
      );
      return results;
    },
    staleTime: 10 * 60 * 1000,
    enabled: depts.length > 0,
  });
}
