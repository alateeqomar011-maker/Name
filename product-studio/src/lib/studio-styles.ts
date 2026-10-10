// Catalog of studio scene styles. Procedural styles are rendered locally by the
// compositing engine (exact product preservation, no external service). AI
// styles generate a photographic scene around the product with an image model,
// then the original product pixels are composited back on top.

export type StyleCategory =
  | "marketplace"
  | "minimal"
  | "luxury"
  | "colorful"
  | "texture"
  | "seasonal"
  | "outdoor"
  | "lifestyle";

export type ShadowKind = "contact" | "soft" | "drop" | "hard" | "none";
export type Layout = "standing" | "floating" | "flatlay";
export type AspectId = "1:1" | "4:5" | "3:4" | "2:3" | "9:16" | "16:9" | "3:2";

export interface StudioStyle {
  id: string;
  name: string;
  category: StyleCategory;
  kind: "procedural" | "ai";
  description: string;
  /** CSS background used for the style thumbnail in the picker. */
  swatch: string;
  shadow: ShadowKind;
  reflection?: boolean;
  /** Palette options; variation N uses palette N % length. */
  palettes?: string[][];
  /** Prompt for AI scene styles. */
  prompt?: string;
  /** Product fill relative to the canvas (0-1). */
  fill?: number;
  /** Product baseline (0-1 from top) for standing layouts. */
  baseline?: number;
}

export const ASPECTS: Record<AspectId, { w: number; h: number; label: string }> = {
  "1:1": { w: 1, h: 1, label: "Square 1:1" },
  "4:5": { w: 4, h: 5, label: "Portrait 4:5" },
  "3:4": { w: 3, h: 4, label: "Portrait 3:4" },
  "2:3": { w: 2, h: 3, label: "Portrait 2:3" },
  "9:16": { w: 9, h: 16, label: "Story 9:16" },
  "16:9": { w: 16, h: 9, label: "Landscape 16:9" },
  "3:2": { w: 3, h: 2, label: "Landscape 3:2" },
};

export function canvasSize(aspect: AspectId, longEdge: number) {
  const a = ASPECTS[aspect] ?? ASPECTS["1:1"];
  if (a.w >= a.h) {
    return { width: longEdge, height: Math.round((longEdge * a.h) / a.w) };
  }
  return { width: Math.round((longEdge * a.w) / a.h), height: longEdge };
}

export const STYLE_CATEGORIES: { id: StyleCategory; label: string }[] = [
  { id: "marketplace", label: "Marketplace" },
  { id: "minimal", label: "Minimalist" },
  { id: "luxury", label: "Luxury" },
  { id: "colorful", label: "Colorful" },
  { id: "texture", label: "Textures" },
  { id: "seasonal", label: "Seasonal" },
  { id: "outdoor", label: "Outdoor · AI" },
  { id: "lifestyle", label: "Lifestyle · AI" },
];

export const STUDIO_STYLES: StudioStyle[] = [
  // ── Marketplace ────────────────────────────────────────────────────────
  {
    id: "marketplace-white",
    name: "Marketplace White",
    category: "marketplace",
    kind: "procedural",
    description: "Pure #FFFFFF background, product fills 85% — ready for Amazon, Noon and Shopify listings.",
    swatch: "#ffffff",
    shadow: "contact",
    palettes: [["#ffffff"]],
    fill: 0.85,
  },
  {
    id: "transparent",
    name: "Transparent PNG",
    category: "marketplace",
    kind: "procedural",
    description: "Clean cut-out on a transparent background for your own layouts.",
    swatch: "repeating-conic-gradient(#e5e5e5 0% 25%, #fff 0% 50%) 50% / 16px 16px",
    shadow: "none",
    fill: 0.88,
  },
  // ── Minimal ────────────────────────────────────────────────────────────
  {
    id: "studio-white",
    name: "Studio Sweep",
    category: "minimal",
    kind: "procedural",
    description: "Soft off-white seamless sweep with a gentle floor fade and natural contact shadow.",
    swatch: "linear-gradient(180deg,#f4f4f2 0%,#e9e9e6 62%,#f7f7f5 100%)",
    shadow: "soft",
    palettes: [
      ["#f5f5f3", "#e6e6e2"],
      ["#f6f3ee", "#e7e1d7"],
      ["#f1f4f6", "#dfe5ea"],
      ["#f7f2f2", "#eadfdf"],
    ],
  },
  {
    id: "soft-gray",
    name: "Gallery Gray",
    category: "minimal",
    kind: "procedural",
    description: "Mid-gray seamless with a soft spotlight behind the product.",
    swatch: "radial-gradient(circle at 50% 40%,#e3e4e6 0%,#c4c6ca 60%,#b3b5b9 100%)",
    shadow: "soft",
    palettes: [
      ["#d9dadd", "#b7b9bd"],
      ["#d6d3cf", "#b5afa8"],
      ["#d3d8db", "#aab2b8"],
    ],
  },
  {
    id: "paper-sand",
    name: "Sand Paper",
    category: "minimal",
    kind: "procedural",
    description: "Warm beige backdrop with fine paper grain — calm, organic, editorial.",
    swatch: "linear-gradient(180deg,#eadfce 0%,#dccbb3 100%)",
    shadow: "soft",
    palettes: [
      ["#ece2d2", "#d9c7ad"],
      ["#e9e0d6", "#d2c3b2"],
      ["#e6dccb", "#cdbb9c"],
    ],
  },
  // ── Luxury ─────────────────────────────────────────────────────────────
  {
    id: "noir-gloss",
    name: "Noir Gloss",
    category: "luxury",
    kind: "procedural",
    description: "Deep black studio, warm spotlight and a mirror-gloss floor reflection.",
    swatch: "radial-gradient(circle at 50% 38%,#4a3b2a 0%,#141210 45%,#060606 100%)",
    shadow: "contact",
    reflection: true,
    palettes: [
      ["#0b0b0c", "#e8b86a"],
      ["#0a0b0f", "#9fb8ff"],
      ["#0d0a0b", "#ff9a8a"],
    ],
  },
  {
    id: "champagne",
    name: "Champagne",
    category: "luxury",
    kind: "procedural",
    description: "Gold-washed gradient with soft glow and a satin reflection.",
    swatch: "radial-gradient(circle at 50% 35%,#fbf1dc 0%,#e7cf9f 45%,#b8915a 100%)",
    shadow: "contact",
    reflection: true,
    palettes: [
      ["#f6e7c8", "#c9a466"],
      ["#f3e3d3", "#c39a7a"],
      ["#efe6d6", "#b5a07a"],
    ],
  },
  {
    id: "marble",
    name: "Marble Pedestal",
    category: "luxury",
    kind: "procedural",
    description: "Veined white marble pedestal against a soft stone wall.",
    swatch: "linear-gradient(180deg,#ece9e4 0%,#ece9e4 60%,#f8f7f5 60%,#dcd8d2 100%)",
    shadow: "contact",
    palettes: [
      ["#ebe7e1", "#f7f5f2", "#8d8780"],
      ["#e4e1dc", "#f3f1ee", "#6f6a66"],
      ["#e9e2dc", "#f6efe9", "#a08a78"],
    ],
  },
  {
    id: "velvet",
    name: "Velvet Spotlight",
    category: "luxury",
    kind: "procedural",
    description: "Rich jewel-tone backdrop with a theatrical spotlight.",
    swatch: "radial-gradient(circle at 50% 40%,#2f6b56 0%,#123528 55%,#07150f 100%)",
    shadow: "contact",
    reflection: true,
    palettes: [
      ["#0f3a2c", "#3f8f72"],
      ["#3b0f1c", "#a23d57"],
      ["#141a3d", "#4a5bb8"],
      ["#2b1838", "#8a55a8"],
    ],
  },
  // ── Colorful ───────────────────────────────────────────────────────────
  {
    id: "pastel-podium",
    name: "Pastel Podium",
    category: "colorful",
    kind: "procedural",
    description: "Trendy 3D podium with an arch backdrop in soft pastel tones.",
    swatch: "linear-gradient(180deg,#f7d9d0 0%,#f7d9d0 55%,#f2c6b8 55%,#f2c6b8 100%)",
    shadow: "contact",
    palettes: [
      ["#f8ddd4", "#f0bfae", "#fbe9e3"],
      ["#dcd6f7", "#b9aef0", "#ece9fc"],
      ["#d3eee3", "#a7dcc6", "#e8f7f1"],
      ["#fbeac0", "#f4d27e", "#fdf4dc"],
      ["#d4e6f7", "#a9cbee", "#e9f2fb"],
    ],
  },
  {
    id: "color-pop",
    name: "Color Pop",
    category: "colorful",
    kind: "procedural",
    description: "Bold duotone gradient with a glowing halo — made for scroll-stopping ads.",
    swatch: "linear-gradient(135deg,#ff4f8b 0%,#ff9a3c 100%)",
    shadow: "drop",
    reflection: true,
    palettes: [
      ["#ff4f8b", "#ff9a3c"],
      ["#5b5bff", "#20d6c7"],
      ["#8a2be2", "#ff5fa2"],
      ["#00b3ff", "#7cff8a"],
      ["#ff6a3d", "#ffd23d"],
    ],
  },
  {
    id: "sunlit-shadows",
    name: "Sunlit Window",
    category: "colorful",
    kind: "procedural",
    description: "Warm wall with soft window-light shadows falling across the scene.",
    swatch: "linear-gradient(120deg,#f3dcc0 0%,#f3dcc0 40%,#e2c3a0 40%,#e2c3a0 48%,#f3dcc0 48%)",
    shadow: "soft",
    palettes: [
      ["#f2dcc2", "#dcb994"],
      ["#efe3d3", "#d1bea5"],
      ["#f1d9cf", "#d6aea0"],
      ["#e4e6dc", "#bfc4b0"],
    ],
  },
  {
    id: "geometric",
    name: "Color Blocks",
    category: "colorful",
    kind: "procedural",
    description: "Playful geometric shapes in a coordinated palette.",
    swatch: "radial-gradient(circle at 70% 35%,#ffcf5c 0 22%,transparent 23%),linear-gradient(180deg,#7fb7ff 0%,#7fb7ff 60%,#5f9df0 60%)",
    shadow: "contact",
    palettes: [
      ["#8dbcff", "#ffcf5c", "#ff7d6b", "#5f9df0"],
      ["#ffb3c7", "#ffe28a", "#8ad1b6", "#f58fab"],
      ["#b7a6ff", "#ffd0a6", "#7ee0d0", "#9b88f0"],
    ],
  },
  // ── Textures ───────────────────────────────────────────────────────────
  {
    id: "concrete",
    name: "Concrete",
    category: "texture",
    kind: "procedural",
    description: "Industrial micro-concrete surface with crisp directional light.",
    swatch: "linear-gradient(180deg,#b9b8b5 0%,#a3a29f 100%)",
    shadow: "hard",
    palettes: [
      ["#bcbbb8", "#9e9d9a"],
      ["#c4beb6", "#a39b90"],
      ["#9fa4a8", "#80868b"],
    ],
  },
  {
    id: "wood-table",
    name: "Oak Table",
    category: "texture",
    kind: "procedural",
    description: "Natural oak tabletop with a softly blurred wall behind.",
    swatch: "linear-gradient(180deg,#e9e3da 0%,#e9e3da 55%,#b98b5e 55%,#9c6e45 100%)",
    shadow: "soft",
    palettes: [
      ["#ebe5dc", "#b88a5c", "#8a5d36"],
      ["#e3e6e8", "#c9a27a", "#9b7650"],
      ["#efe9e1", "#8f6643", "#5f3f24"],
    ],
  },
  {
    id: "linen",
    name: "Linen",
    category: "texture",
    kind: "procedural",
    description: "Soft woven linen texture — great for cosmetics, candles and home goods.",
    swatch: "linear-gradient(180deg,#efe9df 0%,#e2d9cb 100%)",
    shadow: "soft",
    palettes: [
      ["#efe8dd", "#ddd2c1"],
      ["#e8ecef", "#d2d9de"],
      ["#f1e6e3", "#dfcdc8"],
    ],
  },
  // ── Seasonal ───────────────────────────────────────────────────────────
  {
    id: "ramadan-nights",
    name: "Ramadan Nights",
    category: "seasonal",
    kind: "procedural",
    description: "Midnight blue with a golden crescent and warm lantern glow.",
    swatch: "radial-gradient(circle at 75% 25%,#f5d48a 0 6%,transparent 7%),linear-gradient(180deg,#14204a 0%,#0a1230 100%)",
    shadow: "contact",
    reflection: true,
    palettes: [
      ["#0f1a42", "#e9c46a"],
      ["#1a1033", "#e9b86a"],
      ["#0b2a2a", "#e6c77a"],
    ],
  },
  {
    id: "holiday-glow",
    name: "Holiday Glow",
    category: "seasonal",
    kind: "procedural",
    description: "Festive deep tones with golden bokeh lights.",
    swatch: "radial-gradient(circle at 30% 30%,#ffd98a 0 5%,transparent 6%),radial-gradient(circle at 70% 45%,#ffd98a 0 4%,transparent 5%),linear-gradient(180deg,#5b0f1a 0%,#2a060c 100%)",
    shadow: "contact",
    reflection: true,
    palettes: [
      ["#5a0f19", "#ffd27a"],
      ["#0f3b25", "#ffd27a"],
      ["#141414", "#ffd27a"],
    ],
  },
  {
    id: "winter-frost",
    name: "Winter Frost",
    category: "seasonal",
    kind: "procedural",
    description: "Icy blue gradient with drifting snow bokeh.",
    swatch: "linear-gradient(180deg,#dfeefe 0%,#a9c8ec 100%)",
    shadow: "soft",
    palettes: [
      ["#e3f0fd", "#9fc0e8"],
      ["#eef1f7", "#b6bfd6"],
    ],
  },
  {
    id: "summer-sun",
    name: "Summer Sun",
    category: "seasonal",
    kind: "procedural",
    description: "Sun-drenched coral and yellow with crisp hard shadows.",
    swatch: "radial-gradient(circle at 72% 28%,#fff1a8 0 14%,transparent 15%),linear-gradient(180deg,#ffb37a 0%,#ff8a6a 100%)",
    shadow: "hard",
    palettes: [
      ["#ffb47c", "#ff8466", "#fff0a6"],
      ["#7fd6ff", "#3fb3f0", "#fff3b0"],
      ["#ffd36e", "#ffae4a", "#fff7d1"],
    ],
  },
  {
    id: "autumn-amber",
    name: "Autumn Amber",
    category: "seasonal",
    kind: "procedural",
    description: "Terracotta and amber tones with a cozy glow.",
    swatch: "radial-gradient(circle at 50% 40%,#f2a65a 0%,#b5562d 60%,#6e2d17 100%)",
    shadow: "soft",
    palettes: [
      ["#c8642f", "#f2b56b"],
      ["#8f3f22", "#e39a55"],
    ],
  },
  {
    id: "spring-bloom",
    name: "Spring Bloom",
    category: "seasonal",
    kind: "procedural",
    description: "Fresh blush and mint with soft petal-like circles.",
    swatch: "radial-gradient(circle at 25% 30%,#ffd1dc 0 12%,transparent 13%),radial-gradient(circle at 78% 62%,#c9f0dc 0 14%,transparent 15%),linear-gradient(180deg,#fff4f6 0%,#fde3ea 100%)",
    shadow: "soft",
    palettes: [
      ["#fff3f5", "#ffc9d6", "#c8efd9"],
      ["#f4fff7", "#bfeccf", "#ffd9e3"],
    ],
  },
  {
    id: "black-friday",
    name: "Black Friday",
    category: "seasonal",
    kind: "procedural",
    description: "High-contrast black with electric accent light for sale campaigns.",
    swatch: "radial-gradient(circle at 50% 45%,#ff3b5c 0%,#3b0a12 35%,#000 70%)",
    shadow: "contact",
    reflection: true,
    palettes: [
      ["#000000", "#ff3b5c"],
      ["#000000", "#ffd400"],
      ["#000000", "#3bd1ff"],
    ],
  },
  {
    id: "valentine",
    name: "Valentine",
    category: "seasonal",
    kind: "procedural",
    description: "Romantic rose gradient with soft glowing hearts.",
    swatch: "linear-gradient(180deg,#ffd6de 0%,#ff8fa7 100%)",
    shadow: "soft",
    palettes: [
      ["#ffdbe2", "#ff8fa6"],
      ["#ffe6ea", "#e8798f"],
    ],
  },
  // ── Outdoor (AI) ───────────────────────────────────────────────────────
  {
    id: "ai-garden",
    name: "Garden Morning",
    category: "outdoor",
    kind: "ai",
    description: "Weathered garden table, soft morning sun, lush blurred greenery.",
    swatch: "linear-gradient(180deg,#bcd7a6 0%,#7fa66a 55%,#c9b08a 55%,#a88b62 100%)",
    shadow: "none",
    prompt:
      "a weathered wooden garden table outdoors in soft morning sunlight, lush green garden softly blurred in the background, dappled light",
  },
  {
    id: "ai-beach",
    name: "Golden Beach",
    category: "outdoor",
    kind: "ai",
    description: "Smooth sand at golden hour with the ocean softly out of focus.",
    swatch: "linear-gradient(180deg,#ffd9a0 0%,#f3b27a 40%,#7fb6c9 40%,#7fb6c9 55%,#e9cfa2 55%)",
    shadow: "none",
    prompt:
      "smooth fine sand on a beach at golden hour, calm ocean and horizon softly blurred in the background, warm sunlight, gentle long shadows",
  },
  {
    id: "ai-mountain",
    name: "Mountain Ledge",
    category: "outdoor",
    kind: "ai",
    description: "Flat granite ledge with misty mountains at sunrise.",
    swatch: "linear-gradient(180deg,#f5c9a8 0%,#9aa7c1 50%,#5f6773 50%,#8b8f96 100%)",
    shadow: "none",
    prompt:
      "a flat granite rock ledge in the mountains at sunrise, misty mountain ridges softly blurred in the background, crisp clean air, warm rim light",
  },
  {
    id: "ai-poolside",
    name: "Poolside",
    category: "outdoor",
    kind: "ai",
    description: "Travertine pool edge with sparkling water and summer light.",
    swatch: "linear-gradient(180deg,#9fe0f0 0%,#47b5d6 50%,#ead9bf 50%,#d9c3a1 100%)",
    shadow: "none",
    prompt:
      "the travertine stone edge of a luxury swimming pool in bright summer sunlight, sparkling turquoise water and caustic light reflections softly blurred behind",
  },
  {
    id: "ai-desert",
    name: "Desert Dunes",
    category: "outdoor",
    kind: "ai",
    description: "Sculpted sand dunes in warm late-afternoon light.",
    swatch: "linear-gradient(180deg,#f7d7b0 0%,#e2a76e 55%,#c98a52 100%)",
    shadow: "none",
    prompt:
      "smooth sculpted desert sand dunes in warm late-afternoon light, a flat sandstone slab in the foreground, clear sky, minimal and serene",
  },
  // ── Lifestyle (AI) ─────────────────────────────────────────────────────
  {
    id: "ai-kitchen",
    name: "Nordic Kitchen",
    category: "lifestyle",
    kind: "ai",
    description: "Bright Scandinavian kitchen counter with natural window light.",
    swatch: "linear-gradient(180deg,#f2f0ec 0%,#e3ded6 55%,#d9d4cc 55%,#cfc8bd 100%)",
    shadow: "none",
    prompt:
      "a bright Scandinavian kitchen counter with a light stone countertop, natural window light, plants and ceramics softly blurred in the background",
  },
  {
    id: "ai-bathroom",
    name: "Marble Vanity",
    category: "lifestyle",
    kind: "ai",
    description: "Elegant marble bathroom vanity — ideal for skincare and beauty.",
    swatch: "linear-gradient(180deg,#e7e4df 0%,#d8d3cc 55%,#f3f1ee 55%,#e2ded8 100%)",
    shadow: "none",
    prompt:
      "an elegant white marble bathroom vanity countertop, soft diffused daylight, towels and a mirror softly blurred in the background, spa atmosphere",
  },
  {
    id: "ai-living",
    name: "Living Room",
    category: "lifestyle",
    kind: "ai",
    description: "Warm modern living room coffee table with cozy ambience.",
    swatch: "linear-gradient(180deg,#d9c9b4 0%,#bfa98d 55%,#8a6a4c 55%,#6f5239 100%)",
    shadow: "none",
    prompt:
      "a modern walnut coffee table in a warm cozy living room, sofa and lamps softly blurred in the background, late afternoon light",
  },
  {
    id: "ai-desk",
    name: "Creator Desk",
    category: "lifestyle",
    kind: "ai",
    description: "Minimal workspace desk with soft daylight.",
    swatch: "linear-gradient(180deg,#e9edf0 0%,#d5dbe0 55%,#c8b49a 55%,#b39c80 100%)",
    shadow: "none",
    prompt:
      "a minimal light oak work desk near a window, soft daylight, a notebook and plant softly blurred in the background, calm productive mood",
  },
  {
    id: "ai-cafe",
    name: "Café Table",
    category: "lifestyle",
    kind: "ai",
    description: "Marble café table with warm bokeh — great for food & drinks.",
    swatch: "radial-gradient(circle at 30% 30%,#ffd28a 0 6%,transparent 7%),linear-gradient(180deg,#5a4636 0%,#3b2d22 55%,#e9e4dd 55%,#d6d0c8 100%)",
    shadow: "none",
    prompt:
      "a round white marble café table, warm cozy café interior with soft golden bokeh lights in the background, evening ambience",
  },
  {
    id: "ai-boutique",
    name: "Luxury Boutique",
    category: "lifestyle",
    kind: "ai",
    description: "High-end boutique display shelf with gallery lighting.",
    swatch: "linear-gradient(180deg,#2c2621 0%,#1b1714 55%,#c9b18a 55%,#a88d63 100%)",
    shadow: "none",
    prompt:
      "a high-end luxury boutique display plinth with brass accents and gallery spotlights, elegant dark interior softly blurred in the background",
  },
  {
    id: "ai-silk",
    name: "Silk Drape",
    category: "lifestyle",
    kind: "ai",
    description: "Flowing silk fabric folds with soft studio light.",
    swatch: "linear-gradient(135deg,#f2d5cf 0%,#e7b8ae 40%,#f6e2dd 60%,#d99f94 100%)",
    shadow: "none",
    prompt:
      "softly flowing champagne-colored silk fabric with elegant folds forming a surface, soft studio lighting, luxurious and minimal",
  },
];

export const STYLE_MAP: Record<string, StudioStyle> = Object.fromEntries(
  STUDIO_STYLES.map((s) => [s.id, s]),
);

export function getStyle(id: string): StudioStyle | undefined {
  return STYLE_MAP[id];
}
