// Client-safe color helpers (HSL tinting for custom backdrop colors).

export function hexToHsl(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hue = 0;
  if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  return [hue * 60, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Re-colors a style palette toward a target color while keeping each entry's
 * lightness, so the style's lighting structure is preserved.
 */
export function tintPalette(palette: string[], target: string): string[] {
  const [th, ts, tl] = hexToHsl(target);
  const [, , firstL] = hexToHsl(palette[0] ?? target);
  return palette.map((c, i) => {
    const [, s, l] = hexToHsl(c);
    // Very light/dark entries keep their lightness; the main tone follows the picked color.
    const newL = i === 0 && l > 0.15 && l < 0.97 ? tl * 0.6 + l * 0.4 : l + (tl - firstL) * 0.25;
    const newS = Math.min(1, s * 0.3 + ts * 0.85);
    return hslToHex(th, newS, Math.max(0, Math.min(1, newL)));
  });
}
