// Platform-specific canvas formats used by the ad designer and social creator.

export type PlatformId =
  | "instagram"
  | "tiktok"
  | "snapchat"
  | "facebook"
  | "x"
  | "pinterest"
  | "linkedin"
  | "youtube"
  | "web";

export interface Format {
  id: string;
  platform: PlatformId;
  name: string;
  width: number;
  height: number;
  /** Safe-zone insets (fraction of height) where platform UI overlays content. */
  safeTop?: number;
  safeBottom?: number;
}

export const PLATFORMS: Record<PlatformId, { name: string; color: string }> = {
  instagram: { name: "Instagram", color: "#E1306C" },
  tiktok: { name: "TikTok", color: "#111111" },
  snapchat: { name: "Snapchat", color: "#F7D800" },
  facebook: { name: "Facebook", color: "#1877F2" },
  x: { name: "X", color: "#0F1419" },
  pinterest: { name: "Pinterest", color: "#E60023" },
  linkedin: { name: "LinkedIn", color: "#0A66C2" },
  youtube: { name: "YouTube", color: "#FF0000" },
  web: { name: "Web & Store", color: "#6D5BFF" },
};

export const FORMATS: Format[] = [
  { id: "ig-square", platform: "instagram", name: "Square post", width: 1080, height: 1080 },
  { id: "ig-portrait", platform: "instagram", name: "Portrait post", width: 1080, height: 1350 },
  { id: "ig-story", platform: "instagram", name: "Story", width: 1080, height: 1920, safeTop: 0.12, safeBottom: 0.18 },
  { id: "ig-reel-cover", platform: "instagram", name: "Reels cover", width: 1080, height: 1920, safeTop: 0.12, safeBottom: 0.22 },
  { id: "tt-video-cover", platform: "tiktok", name: "Video cover", width: 1080, height: 1920, safeTop: 0.1, safeBottom: 0.25 },
  { id: "tt-ad", platform: "tiktok", name: "In-feed ad", width: 1080, height: 1920, safeTop: 0.1, safeBottom: 0.25 },
  { id: "sc-story", platform: "snapchat", name: "Story / Snap ad", width: 1080, height: 1920, safeTop: 0.1, safeBottom: 0.18 },
  { id: "fb-feed", platform: "facebook", name: "Feed post", width: 1080, height: 1080 },
  { id: "fb-landscape", platform: "facebook", name: "Link / landscape ad", width: 1200, height: 628 },
  { id: "fb-cover", platform: "facebook", name: "Page cover", width: 1640, height: 624 },
  { id: "x-post", platform: "x", name: "Post image", width: 1600, height: 900 },
  { id: "pin-standard", platform: "pinterest", name: "Standard pin", width: 1000, height: 1500 },
  { id: "li-post", platform: "linkedin", name: "Feed post", width: 1200, height: 1200 },
  { id: "li-landscape", platform: "linkedin", name: "Landscape post", width: 1200, height: 627 },
  { id: "yt-thumb", platform: "youtube", name: "Thumbnail", width: 1280, height: 720 },
  { id: "web-banner", platform: "web", name: "Store hero banner", width: 1920, height: 720 },
  { id: "web-sale", platform: "web", name: "Sale banner", width: 1200, height: 400 },
  { id: "web-poster", platform: "web", name: "Promo poster (A-ratio)", width: 1414, height: 2000 },
];

export const FORMAT_MAP: Record<string, Format> = Object.fromEntries(FORMATS.map((f) => [f.id, f]));

export function getFormat(id: string): Format {
  return FORMAT_MAP[id] ?? FORMATS[0];
}

export type Orientation = "square" | "portrait" | "tall" | "landscape" | "wide";

export function orientationOf(width: number, height: number): Orientation {
  const r = width / height;
  if (r > 2.2) return "wide";
  if (r > 1.15) return "landscape";
  if (r >= 0.87) return "square";
  if (r >= 0.62) return "portrait";
  return "tall";
}
