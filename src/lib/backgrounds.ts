// Per-character call background preferences: a virtual set or the user's own image.

import type { EnvironmentId } from '../../shared/types.ts';
import { accentOf } from '../avatar/color.ts';
import { drawEnvironmentStatic, ENVIRONMENT_LABELS } from '../avatar/environments.ts';

export const ENVIRONMENTS = Object.keys(ENVIRONMENT_LABELS) as EnvironmentId[];

export function getEnvPref(characterId: string, fallback: EnvironmentId): EnvironmentId | 'custom' {
  try {
    const v = localStorage.getItem(`sc.env.${characterId}`);
    if (v === 'custom' && localStorage.getItem(`sc.bg.${characterId}`)) return 'custom';
    if (v && v in ENVIRONMENT_LABELS) return v as EnvironmentId;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function setEnvPref(characterId: string, env: EnvironmentId | 'custom'): void {
  try {
    localStorage.setItem(`sc.env.${characterId}`, env);
  } catch {
    /* ignore */
  }
}

export function loadCustomBackground(characterId: string): Promise<HTMLImageElement | null> {
  let data: string | null = null;
  try {
    data = localStorage.getItem(`sc.bg.${characterId}`);
  } catch {
    data = null;
  }
  if (!data) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = data!;
  });
}

/** Downscales the chosen image and keeps it on this device only. */
export async function saveCustomBackground(characterId: string, file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', 0.82);
    try {
      localStorage.setItem(`sc.bg.${characterId}`, data);
    } catch {
      /* too large for storage: keep for this session only */
    }
    setEnvPref(characterId, 'custom');
    const out = new Image();
    out.src = data;
    await out.decode().catch(() => undefined);
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const thumbCache = new Map<string, string>();

export function environmentThumb(env: EnvironmentId, colors: [string, string]): string {
  const key = `${env}|${colors.join()}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = 220;
  canvas.height = 138;
  const ctx = canvas.getContext('2d')!;
  drawEnvironmentStatic(ctx, env, canvas.width, canvas.height, { accent: accentOf(colors[0]), secondary: colors[1] === '#ffffff' ? colors[0] : colors[1] }, 7);
  const url = canvas.toDataURL('image/jpeg', 0.8);
  thumbCache.set(key, url);
  return url;
}
