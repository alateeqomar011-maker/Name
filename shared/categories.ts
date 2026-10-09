import type { CategoryId, EnvironmentId, Outfit } from './types.ts';

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  labelAr: string;
  environment: EnvironmentId;
  outfit: Outfit;
  /** Palette used when a character doesn't define brand colours. */
  palette: [string, string][];
  /** Short description of the professional world, used in persona prompts. */
  world: string;
}

export const CATEGORIES: CategoryMeta[] = [
  {
    id: 'football',
    label: 'Football',
    labelAr: 'كرة القدم',
    environment: 'stadium',
    outfit: 'jersey',
    palette: [['#1e88e5', '#ffffff'], ['#e53935', '#ffd54f'], ['#43a047', '#ffffff'], ['#8e24aa', '#ffd54f']],
    world: 'professional football (soccer)',
  },
  {
    id: 'mma',
    label: 'UFC & MMA',
    labelAr: 'الفنون القتالية المختلطة',
    environment: 'octagon',
    outfit: 'tee',
    palette: [['#d32f2f', '#212121'], ['#ff6f00', '#212121'], ['#c62828', '#ffd600']],
    world: 'mixed martial arts and the UFC',
  },
  {
    id: 'boxing',
    label: 'Boxing',
    labelAr: 'الملاكمة',
    environment: 'ring',
    outfit: 'tracksuit',
    palette: [['#b71c1c', '#ffd700'], ['#1a237e', '#ffd700'], ['#004d40', '#ffd700']],
    world: 'professional boxing',
  },
  {
    id: 'wrestling',
    label: 'Wrestling',
    labelAr: 'المصارعة',
    environment: 'ring',
    outfit: 'tank',
    palette: [['#6a1b9a', '#ffd600'], ['#c62828', '#ffffff'], ['#212121', '#ff1744']],
    world: 'professional wrestling and sports entertainment',
  },
  {
    id: 'basketball',
    label: 'Basketball',
    labelAr: 'كرة السلة',
    environment: 'court',
    outfit: 'jersey',
    palette: [['#552583', '#fdb927'], ['#1d428a', '#ffc72c'], ['#ce1141', '#000000'], ['#007a33', '#ffffff']],
    world: 'professional basketball',
  },
  {
    id: 'athletes',
    label: 'Sports icons',
    labelAr: 'نجوم الرياضة',
    environment: 'track',
    outfit: 'tracksuit',
    palette: [['#00897b', '#ffffff'], ['#f4511e', '#212121'], ['#3949ab', '#ffffff']],
    world: 'elite sport',
  },
  {
    id: 'creators',
    label: 'YouTubers & streamers',
    labelAr: 'صناع المحتوى',
    environment: 'studio',
    outfit: 'hoodie',
    palette: [['#ff1744', '#00e5ff'], ['#7c4dff', '#00e676'], ['#ff9100', '#2979ff']],
    world: 'online video, streaming and creator culture',
  },
  {
    id: 'gaming',
    label: 'Gamers & esports',
    labelAr: 'الألعاب والرياضات الإلكترونية',
    environment: 'gaming',
    outfit: 'hoodie',
    palette: [['#00e5ff', '#d500f9'], ['#76ff03', '#212121'], ['#ff3d00', '#2962ff']],
    world: 'competitive gaming and esports',
  },
  {
    id: 'actors',
    label: 'Actors & movie stars',
    labelAr: 'الممثلون ونجوم السينما',
    environment: 'film',
    outfit: 'suit',
    palette: [['#ffb300', '#212121'], ['#90a4ae', '#263238'], ['#d4af37', '#1b1b1b']],
    world: 'film and television acting',
  },
  {
    id: 'music',
    label: 'Singers & musicians',
    labelAr: 'المطربون والموسيقيون',
    environment: 'stage',
    outfit: 'jacket',
    palette: [['#ec407a', '#7e57c2'], ['#26c6da', '#ab47bc'], ['#ffca28', '#ef5350']],
    world: 'music, recording and live performance',
  },
  {
    id: 'comedy',
    label: 'Comedians',
    labelAr: 'الكوميديون',
    environment: 'comedy',
    outfit: 'jacket',
    palette: [['#ff7043', '#ffd54f'], ['#29b6f6', '#ffee58'], ['#ab47bc', '#ffca28']],
    world: 'stand-up and comedy',
  },
  {
    id: 'history',
    label: 'Historical figures',
    labelAr: 'شخصيات تاريخية',
    environment: 'hall',
    outfit: 'robe',
    palette: [['#c9a227', '#3e2723'], ['#8d6e63', '#efebe9'], ['#b08d57', '#263238']],
    world: 'history',
  },
  {
    id: 'science',
    label: 'Scientists & explorers',
    labelAr: 'العلماء والمستكشفون',
    environment: 'lab',
    outfit: 'labcoat',
    palette: [['#00b0ff', '#e0f7fa'], ['#1de9b6', '#004d40'], ['#536dfe', '#e8eaf6']],
    world: 'science, research and exploration',
  },
  {
    id: 'business',
    label: 'Entrepreneurs',
    labelAr: 'رواد الأعمال',
    environment: 'office',
    outfit: 'suit',
    palette: [['#26a69a', '#eceff1'], ['#5c6bc0', '#eceff1'], ['#78909c', '#ffd54f']],
    world: 'business, technology and entrepreneurship',
  },
];

export const CATEGORY_MAP: Record<CategoryId, CategoryMeta> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<CategoryId, CategoryMeta>;

export function isCategory(id: string): id is CategoryId {
  return id in CATEGORY_MAP;
}
