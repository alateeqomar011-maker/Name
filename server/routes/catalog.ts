// Discovery endpoints: search, profiles, home rails and recommendations.

import { type Request, type Response, Router } from 'express';
import { CATEGORIES, isCategory } from '../../shared/categories.ts';
import type { Character, CharacterSummary, Era, SearchParams } from '../../shared/types.ts';
import { attachUser } from '../auth.ts';
import { allCharacters, getCharacter, recommend, related, search, summarize } from '../catalog/catalog.ts';
import { all } from '../db.ts';

export const catalogRouter = Router();

const REGIONS = ['arab', 'gulf', 'latam', 'europe', 'africa', 'asia', 'northamerica'];
const ERAS: Era[] = ['active', 'legend', 'historical', 'rising'];
const SORTS = ['popular', 'trending', 'new', 'name'];

/** Public profile: strips provider voice ids and licence references. */
export function publicProfile(c: Character) {
  return {
    ...summarize(c),
    aliases: c.aliases,
    traits: c.traits,
    catchphrases: c.catchphrases,
    topics: c.topics,
    voice: {
      pitch: c.voice.pitch,
      rate: c.voice.rate,
      energy: c.voice.energy,
      accent: c.voice.accent,
      licensed: Boolean(c.voice.authorized && c.voice.licenseRef),
    },
    likenessDetail: {
      status: c.likeness.status,
      provider: c.likeness.status === 'licensed' ? c.likeness.provider : undefined,
    },
  };
}

catalogRouter.get('/characters', (req: Request, res: Response) => {
  const q = req.query;
  const params: SearchParams = {
    q: typeof q.q === 'string' ? q.q.slice(0, 100) : undefined,
    category: typeof q.category === 'string' && isCategory(q.category) ? q.category : '',
    country: typeof q.country === 'string' ? q.country.slice(0, 8) : undefined,
    language: typeof q.language === 'string' ? q.language.slice(0, 5) : undefined,
    region: typeof q.region === 'string' && REGIONS.includes(q.region) ? (q.region as SearchParams['region']) : '',
    era: typeof q.era === 'string' && ERAS.includes(q.era as Era) ? (q.era as Era) : '',
    sort: typeof q.sort === 'string' && SORTS.includes(q.sort) ? (q.sort as SearchParams['sort']) : undefined,
    offset: Number(q.offset ?? 0) || 0,
    limit: Number(q.limit ?? 24) || 24,
  };
  res.json(search(params));
});

catalogRouter.get('/characters/:id', (req: Request, res: Response) => {
  const c = getCharacter(String(req.params.id));
  if (!c) return void res.status(404).json({ error: 'not_found' });
  res.json({ character: publicProfile(c), related: related(c.id, 12) });
});

catalogRouter.post('/characters/batch', (req: Request, res: Response) => {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).slice(0, 60).map(String) : [];
  res.json({ items: ids.map((id) => getCharacter(id)).filter((c): c is Character => Boolean(c)).map(publicProfile) });
});

catalogRouter.get('/categories', (_req: Request, res: Response) => {
  const counts: Record<string, number> = {};
  for (const c of allCharacters()) counts[c.category] = (counts[c.category] ?? 0) + 1;
  res.json({ categories: CATEGORIES.map((c) => ({ id: c.id, label: c.label, labelAr: c.labelAr, count: counts[c.id] ?? 0 })) });
});

interface Rail {
  id: string;
  title: string;
  titleAr?: string;
  kind?: 'hero' | 'standard' | 'wide';
  items: CharacterSummary[];
}

catalogRouter.get('/home', attachUser, (req: Request, res: Response) => {
  const userId = req.user?.id;
  const rails: Rail[] = [];
  const top = (p: SearchParams, limit = 18) => search({ ...p, limit }).items;

  rails.push({ id: 'trending', title: 'Trending now', titleAr: 'الأكثر رواجاً', kind: 'hero', items: top({ sort: 'trending' }, 12) });

  if (userId) {
    const fav = all<{ character_id: string }>('SELECT character_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC LIMIT 30', userId).map((r) => r.character_id);
    const talked = all<{ character_ids: string }>('SELECT character_ids FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20', userId)
      .flatMap((r) => JSON.parse(r.character_ids) as string[]);
    const recent = [...new Set(talked)].map((id) => getCharacter(id)).filter((c): c is Character => Boolean(c));
    if (recent.length) rails.push({ id: 'recent', title: 'Call again', titleAr: 'اتصل مجدداً', items: recent.slice(0, 12).map(summarize) });
    const seeds = [...new Set([...fav, ...talked])];
    const recs = recommend(seeds, new Set(seeds), 18);
    if (recs.length) rails.push({ id: 'for-you', title: 'Picked for you', titleAr: 'مختارات لك', items: recs });
  }

  const freshCutoff = Date.now() - 60 * 86400_000;
  const fresh = top({ sort: 'new' }, 30).filter((c) => Date.parse(c.addedAt) >= freshCutoff);
  if (fresh.length >= 4) rails.push({ id: 'new', title: 'Recently added', titleAr: 'أضيف حديثاً', items: fresh.slice(0, 18) });
  rails.push({ id: 'football', title: 'Football icons', titleAr: 'أساطير كرة القدم', items: top({ category: 'football', sort: 'trending' }) });
  rails.push({ id: 'arab', title: 'Arab & Gulf stars', titleAr: 'نجوم العرب والخليج', items: top({ region: 'arab', sort: 'popular' }) });
  rails.push({ id: 'mma', title: 'Fighters: UFC, MMA & boxing', titleAr: 'المقاتلون', items: [...top({ category: 'mma' }, 12), ...top({ category: 'boxing' }, 6)].sort((a, b) => b.popularity - a.popularity) });
  rails.push({ id: 'creators', title: 'YouTubers & streamers', titleAr: 'صناع المحتوى', items: [...top({ category: 'creators' }, 14), ...top({ category: 'gaming' }, 4)] });
  rails.push({ id: 'actors', title: 'Movie stars', titleAr: 'نجوم السينما', items: top({ category: 'actors' }) });
  rails.push({ id: 'music', title: 'Music superstars', titleAr: 'نجوم الموسيقى', items: top({ category: 'music' }) });
  rails.push({ id: 'basketball', title: 'Hoops legends', titleAr: 'نجوم كرة السلة', items: top({ category: 'basketball' }) });
  rails.push({ id: 'legends', title: 'Legends & historical minds', titleAr: 'أساطير وعقول خالدة', items: [...top({ category: 'history' }, 10), ...top({ category: 'science' }, 8)].sort((a, b) => b.popularity - a.popularity) });
  rails.push({ id: 'rising', title: 'Rising names', titleAr: 'نجوم صاعدة', items: top({ era: 'rising' }, 12).concat(top({ category: 'creators', sort: 'new' }, 6)) });
  rails.push({ id: 'comedy', title: 'Make me laugh', titleAr: 'الضحك', items: top({ category: 'comedy' }) });

  res.json({ rails: rails.filter((r) => r.items.length) });
});
