import { CATEGORY_MAP } from '../../shared/categories.ts';
import { country, LANGUAGE_NAMES } from '../../shared/countries.ts';
import type { CategoryId, CharacterSummary } from '../../shared/types.ts';
import type { AvatarProfile } from '../avatar/types.ts';
import type { Key, T } from '../i18n/index.tsx';

export function toAvatarProfile(c: Pick<CharacterSummary, 'id' | 'name' | 'gender' | 'colors' | 'look' | 'environment'>): AvatarProfile {
  return { id: c.id, name: c.name, gender: c.gender, colors: c.colors, look: c.look, environment: c.environment };
}

export function displayName(c: { name: string; nameAr?: string }, lang: string): string {
  return lang === 'ar' && c.nameAr ? c.nameAr : c.name;
}

export function countryLabel(code: string, lang: string): string {
  const c = country(code);
  return `${c.flag} ${lang === 'ar' ? c.nameAr : c.name}`;
}

export function categoryLabel(id: CategoryId, t: T): string {
  return t(`cat.${id}` as Key) || CATEGORY_MAP[id].label;
}

export function languageLabel(code: string): string {
  return LANGUAGE_NAMES[code]?.native ?? code.toUpperCase();
}

export function mmss(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function relativeDate(iso: string, lang: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  try {
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    if (diff < 3600) return rtf.format(-Math.max(1, Math.round(diff / 60)), 'minute');
    if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
    if (diff < 86400 * 7) return rtf.format(-Math.round(diff / 86400), 'day');
  } catch {
    /* fall through */
  }
  return d.toLocaleDateString(lang);
}

export function download(filename: string, content: string, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

/** Short name for compact lists: "Neymar Jr." → "Neymar", "Lionel Messi" → "Messi". */
export function shortName(c: { name: string; nameAr?: string }, lang: string): string {
  const full = displayName(c, lang);
  const parts = full.replace(/\b(jr|sr)\.?$/i, '').trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}
