// Fonts available in the ad designer, social creator and brand kits. All are
// self-hosted (via @fontsource) and licensed under the SIL Open Font License.

export interface FontInfo {
  family: string;
  category: "sans" | "serif" | "display" | "arabic";
  weights: number[];
  arabic: boolean;
}

export const FONTS: FontInfo[] = [
  { family: "Inter Variable", category: "sans", weights: [400, 500, 600, 700, 800], arabic: false },
  { family: "Montserrat", category: "sans", weights: [400, 600, 700, 800], arabic: false },
  { family: "Poppins", category: "sans", weights: [400, 600, 700, 800], arabic: false },
  { family: "Outfit", category: "sans", weights: [400, 600, 700, 800], arabic: false },
  { family: "Space Grotesk", category: "sans", weights: [400, 500, 700], arabic: false },
  { family: "Playfair Display", category: "serif", weights: [400, 600, 700, 800], arabic: false },
  { family: "Cormorant Garamond", category: "serif", weights: [400, 600, 700], arabic: false },
  { family: "DM Serif Display", category: "serif", weights: [400], arabic: false },
  { family: "Instrument Serif", category: "serif", weights: [400], arabic: false },
  { family: "Bebas Neue", category: "display", weights: [400], arabic: false },
  { family: "Archivo Black", category: "display", weights: [400], arabic: false },
  { family: "Cairo", category: "arabic", weights: [400, 600, 700, 800], arabic: true },
  { family: "Tajawal", category: "arabic", weights: [400, 500, 700, 800], arabic: true },
  { family: "IBM Plex Sans Arabic", category: "arabic", weights: [400, 500, 600, 700], arabic: true },
  { family: "El Messiri", category: "arabic", weights: [400, 600, 700], arabic: true },
  { family: "Amiri", category: "arabic", weights: [400, 700], arabic: true },
  { family: "Lalezar", category: "arabic", weights: [400], arabic: true },
];

export const FONT_FAMILIES = FONTS.map((f) => f.family);

export function fontInfo(family: string): FontInfo {
  return FONTS.find((f) => f.family === family) ?? FONTS[0];
}

/** Picks the closest available weight for a font. */
export function nearestWeight(family: string, weight: number) {
  const ws = fontInfo(family).weights;
  return ws.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), ws[0]);
}

export function containsArabic(text: string) {
  return /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(text);
}

/** CSS font stack with an Arabic fallback so mixed-language text always renders. */
export function fontStack(family: string) {
  return `"${family}", "Cairo", "IBM Plex Sans Arabic", system-ui, sans-serif`;
}
