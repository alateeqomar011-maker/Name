import { accentOf, hsl, hueOf, mix } from './color.ts';
import type { AvatarProfile } from './types.ts';

export interface Palette {
  skinHi: string;
  skin: string;
  skinMid: string;
  skinLo: string;
  skinDeep: string;
  hair: string;
  hairHi: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  accent: string;
  rim: string;
  lip: string;
  lipDark: string;
  mouth: string;
  teeth: string;
  sclera: string;
  iris: string;
  irisRing: string;
  cloth: string;
  clothShade: string;
  gold: string;
}

/**
 * The avatar is a stylised "holographic" bust: a luminous, cool-toned figure rather than a
 * depiction of anyone's real skin, face or likeness. Brand colours drive clothing and lighting.
 */
export function paletteFor(p: AvatarProfile): Palette {
  const [c1, c2] = p.colors;
  const accent = accentOf(c1, accentOf(c2));
  const brandHue = hueOf(accent);
  // Mostly cyan-blue, nudged slightly toward the brand hue for variety.
  let h = 205 + (((brandHue - 205 + 540) % 360) - 180) * 0.18;
  h = (h + 360) % 360;
  const hairHue = (h + 10) % 360;
  const tone = p.look.hairTone ?? 'dark';
  const hair =
    tone === 'light'
      ? hsl(45, 55, 74)
      : tone === 'grey'
        ? hsl(hairHue, 12, 70)
        : tone === 'color'
          ? hsl(hueOf(accentOf(c2, accent)), 75, 58)
          : hsl(hairHue, 38, 17);
  const hairHi =
    tone === 'light' ? hsl(48, 70, 88) : tone === 'grey' ? hsl(hairHue, 15, 86) : tone === 'color' ? hsl(hueOf(accentOf(c2, accent)), 85, 75) : hsl(hairHue, 45, 34);
  return {
    skinHi: hsl(h, 55, 94),
    skin: hsl(h, 42, 82),
    skinMid: hsl(h, 34, 68),
    skinLo: hsl(h, 32, 50),
    skinDeep: hsl(h, 38, 33),
    hair,
    hairHi,
    primary: c1,
    primaryDark: mix(c1, '#05070c', 0.55),
    primaryLight: mix(c1, '#ffffff', 0.25),
    secondary: c2,
    accent,
    rim: mix(accent, '#ffffff', 0.25),
    lip: hsl(350, 34, 66),
    lipDark: hsl(348, 30, 52),
    mouth: hsl(345, 45, 12),
    teeth: hsl(h, 30, 96),
    sclera: hsl(h, 40, 97),
    iris: hsl((brandHue + 360) % 360, 55, 26),
    irisRing: hsl(brandHue, 70, 52),
    cloth: hsl(h, 20, 95),
    clothShade: hsl(h, 18, 78),
    gold: '#e7c46a',
  };
}
