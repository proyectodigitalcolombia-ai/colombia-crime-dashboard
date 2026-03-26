declare module "react-simple-maps" {
  import { ComponentType, SVGProps, MouseEvent } from "react";

  export interface ProjectionConfig {
    scale?: number;
    center?: [number, number];
    rotate?: [number, number, number];
    parallels?: [number, number];
  }

  export interface ComposableMapProps {
    projection?: string;
    projectionConfig?: ProjectionConfig;
    width?: number;
    height?: number;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }

  export interface GeographiesProps {
    geography: string | object;
    children: (args: { geographies: any[] }) => React.ReactNode;
  }

  export interface GeographyProps extends Omit<SVGProps<SVGPathElement>, "onMouseEnter" | "onMouseMove" | "onMouseLeave"> {
    geography: any;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: {
      default?: React.CSSProperties & { outline?: string; filter?: string };
      hover?: React.CSSProperties & { outline?: string; cursor?: string };
      pressed?: React.CSSProperties & { outline?: string };
    };
    onMouseEnter?: (event: React.MouseEvent<SVGPathElement>) => void;
    onMouseMove?: (event: React.MouseEvent<SVGPathElement>) => void;
    onMouseLeave?: (event: React.MouseEvent<SVGPathElement>) => void;
    onClick?: (event: React.MouseEvent<SVGPathElement>) => void;
  }

  export const ComposableMap: ComponentType<ComposableMapProps>;
  export const Geographies: ComponentType<GeographiesProps>;
  export const Geography: ComponentType<GeographyProps>;
  export const Marker: ComponentType<any>;
  export const Line: ComponentType<any>;
  export const Sphere: ComponentType<any>;
  export const Graticule: ComponentType<any>;
}
