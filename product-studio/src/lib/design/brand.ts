import { FONT_FAMILIES } from "@/lib/fonts";
import type { BrandStyle } from "./types";

export interface BrandKitRow {
  id: string;
  name: string;
  data: {
    palette?: { name: string; hex: string; role: string }[];
    typography?: { heading?: string; body?: string };
    [k: string]: unknown;
  };
}

function luminance(hex: string) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function readableOn(bg: string) {
  return luminance(bg) > 0.4 ? "#141414" : "#ffffff";
}

/** Converts a saved brand kit into colors and fonts the templates understand. */
export function brandStyleFromKit(kit: BrandKitRow | null | undefined): Partial<BrandStyle> | null {
  if (!kit) return null;
  const palette = kit.data.palette ?? [];
  const byRole = (role: string) => palette.find((p) => p.role === role)?.hex;
  const primary = byRole("primary") ?? palette[0]?.hex;
  const background = byRole("background") ?? byRole("neutral") ?? "#ffffff";
  const accent = byRole("accent") ?? byRole("secondary") ?? primary;
  const secondary = byRole("secondary") ?? accent;
  const valid = (f?: string) => (f && FONT_FAMILIES.includes(f) ? f : undefined);
  return {
    primary,
    accent,
    secondary: luminance(background) > 0.4 ? "#4b4b55" : "#d8d8e0",
    background,
    text: readableOn(background),
    headingFont: valid(kit.data.typography?.heading),
    bodyFont: valid(kit.data.typography?.body),
    ...(secondary ? {} : {}),
  };
}
