"use client";

// Loads every designer font (all subsets incl. Arabic via unicode-range) and
// waits for the faces a design uses before drawing to canvas.
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/montserrat/800.css";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/poppins/800.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/outfit/800.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/playfair-display/800.css";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/700.css";
import "@fontsource/dm-serif-display/400.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/archivo-black/400.css";
import "@fontsource/cairo/400.css";
import "@fontsource/cairo/600.css";
import "@fontsource/cairo/700.css";
import "@fontsource/cairo/800.css";
import "@fontsource/tajawal/400.css";
import "@fontsource/tajawal/500.css";
import "@fontsource/tajawal/700.css";
import "@fontsource/tajawal/800.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "@fontsource/el-messiri/400.css";
import "@fontsource/el-messiri/600.css";
import "@fontsource/el-messiri/700.css";
import "@fontsource/amiri/400.css";
import "@fontsource/amiri/700.css";
import "@fontsource/lalezar/400.css";
import { nearestWeight } from "@/lib/fonts";

const loaded = new Set<string>();

export async function ensureFonts(list: { family: string; weight: number; sample?: string }[]) {
  const jobs: Promise<unknown>[] = [];
  for (const f of list) {
    const w = nearestWeight(f.family, f.weight);
    const sample = f.sample || "Aa";
    const key = `${f.family}|${w}|${/[؀-ۿ]/.test(sample) ? "ar" : "la"}`;
    if (loaded.has(key)) continue;
    loaded.add(key);
    jobs.push(document.fonts.load(`${w} 48px "${f.family}"`, sample).catch(() => undefined));
    if (/[؀-ۿ]/.test(sample)) jobs.push(document.fonts.load(`700 48px "Cairo"`, sample).catch(() => undefined));
  }
  await Promise.all(jobs);
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadAssetImage(id: string, w = 2048): Promise<HTMLImageElement> {
  const key = `${id}@${w}`;
  if (!imageCache.has(key)) {
    imageCache.set(
      key,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => resolve(img);
        img.onerror = () => {
          imageCache.delete(key);
          reject(new Error(`Couldn't load image ${id}`));
        };
        // Ids starting with "/" are public URLs (e.g. landing-page samples).
        img.src = id.startsWith("/") ? id : `/api/assets/${id}/file?w=${w}`;
      }),
    );
  }
  return imageCache.get(key)!;
}

export async function loadImages(ids: string[], w = 2048) {
  const map = new Map<string, HTMLImageElement>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        map.set(id, await loadAssetImage(id, w));
      } catch {
        /* missing images render as placeholders */
      }
    }),
  );
  return map;
}
