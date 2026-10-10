// Design document model for the ad designer and social creator. All geometry is
// relative to the canvas (0-1) so a design renders identically at any resolution.

export interface DesignBackground {
  type: "solid" | "gradient" | "image";
  color: string;
  color2?: string;
  /** Gradient angle in degrees. */
  angle?: number;
  assetId?: string;
  /** Darkening/tinting overlay for image backgrounds. */
  overlay?: { color: string; opacity: number };
}

export interface LayerBase {
  id: string;
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
  hidden?: boolean;
}

export interface ImageLayer extends LayerBase {
  type: "image";
  assetId: string;
  fit: "contain" | "cover";
  shadow?: boolean;
  radius?: number;
  role?: "product" | "photo" | "logo";
}

export type TextRole = "headline" | "subheadline" | "price" | "oldPrice" | "cta" | "badge" | "tagline" | "brand" | "body";

export interface TextLayer extends LayerBase {
  type: "text";
  text: string;
  role?: TextRole;
  font: string;
  weight: number;
  /** Font size as a fraction of canvas width. */
  size: number;
  color: string;
  align: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  lineHeight: number;
  letterSpacing?: number;
  uppercase?: boolean;
  italic?: boolean;
  strike?: boolean;
  /** Shrink the font until the text fits the box. */
  autoFit?: boolean;
  /** Pill / box behind the text (CTA buttons, badges). */
  bg?: { color: string; radius: number; padX: number; padY: number; shape?: "box" | "circle" | "burst" };
  shadow?: { color: string; blur: number; y: number };
}

export interface ShapeLayer extends LayerBase {
  type: "shape";
  shape: "rect" | "circle" | "line" | "burst" | "arch";
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
}

export type Layer = ImageLayer | TextLayer | ShapeLayer;

export interface DesignDoc {
  version: 1;
  templateId?: string;
  background: DesignBackground;
  layers: Layer[];
}

export interface AdContent {
  headline: string;
  subheadline?: string;
  cta?: string;
  badge?: string;
  price?: string;
  oldPrice?: string;
  tagline?: string;
  brand?: string;
}

export interface BrandStyle {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  headingFont: string;
  bodyFont: string;
}
