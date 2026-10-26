import {
  siFacebook,
  siInstagram,
  siPinterest,
  siThreads,
  siTiktok,
  siTwitch,
  siX,
  siYoutube,
  type SimpleIcon,
} from 'simple-icons';

export type PlatformId =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'x'
  | 'facebook'
  | 'twitch'
  | 'threads'
  | 'pinterest';

interface ExtraRule {
  test: (value: string) => boolean;
  message: string;
}

export interface Platform {
  id: PlatformId;
  name: string;
  icon: SimpleIcon;
  /** Brand tint used for the small icon tile, tuned to read on the dark UI. */
  tint: string;
  /** What the platform calls an audience member, plural. */
  audienceNoun: string;
  min: number;
  max: number;
  allowed: RegExp;
  allowedLabel: string;
  extra: ExtraRule[];
  hosts: string[];
  placeholder: string;
  profileUrl: (username: string) => string;
}

const noEdgePeriod: ExtraRule = {
  test: (v) => !v.startsWith('.') && !v.endsWith('.'),
  message: "can't start or end with a period",
};
const noDoublePeriod: ExtraRule = {
  test: (v) => !v.includes('..'),
  message: "can't contain two periods in a row",
};

export const PLATFORMS: Platform[] = [
  {
    id: 'instagram',
    name: 'Instagram',
    icon: siInstagram,
    tint: '#ff4f8b',
    audienceNoun: 'followers',
    min: 1,
    max: 30,
    allowed: /^[a-z0-9._]+$/,
    allowedLabel: 'letters, numbers, periods and underscores',
    extra: [noEdgePeriod, noDoublePeriod],
    hosts: ['instagram.com', 'instagr.am'],
    placeholder: 'yourname',
    profileUrl: (u) => `instagram.com/${u}`,
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: siTiktok,
    tint: '#f2f2f7',
    audienceNoun: 'followers',
    min: 2,
    max: 24,
    allowed: /^[a-z0-9._]+$/,
    allowedLabel: 'letters, numbers, periods and underscores',
    extra: [{ test: (v) => !v.endsWith('.'), message: "can't end with a period" }],
    hosts: ['tiktok.com'],
    placeholder: 'yourname',
    profileUrl: (u) => `tiktok.com/@${u}`,
  },
  {
    id: 'youtube',
    name: 'YouTube',
    icon: siYoutube,
    tint: '#ff4b4b',
    audienceNoun: 'subscribers',
    min: 3,
    max: 30,
    allowed: /^[a-z0-9._-]+$/,
    allowedLabel: 'letters, numbers, periods, hyphens and underscores',
    extra: [noEdgePeriod],
    hosts: ['youtube.com', 'youtu.be'],
    placeholder: 'yourchannel',
    profileUrl: (u) => `youtube.com/@${u}`,
  },
  {
    id: 'x',
    name: 'X',
    icon: siX,
    tint: '#f2f2f7',
    audienceNoun: 'followers',
    min: 1,
    max: 15,
    allowed: /^[a-z0-9_]+$/,
    allowedLabel: 'letters, numbers and underscores',
    extra: [],
    hosts: ['x.com', 'twitter.com'],
    placeholder: 'yourname',
    profileUrl: (u) => `x.com/${u}`,
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: siFacebook,
    tint: '#4c8dff',
    audienceNoun: 'followers',
    min: 5,
    max: 50,
    allowed: /^[a-z0-9.]+$/,
    allowedLabel: 'letters, numbers and periods',
    extra: [noEdgePeriod, noDoublePeriod],
    hosts: ['facebook.com', 'fb.com'],
    placeholder: 'your.page',
    profileUrl: (u) => `facebook.com/${u}`,
  },
  {
    id: 'twitch',
    name: 'Twitch',
    icon: siTwitch,
    tint: '#a970ff',
    audienceNoun: 'followers',
    min: 4,
    max: 25,
    allowed: /^[a-z0-9_]+$/,
    allowedLabel: 'letters, numbers and underscores',
    extra: [{ test: (v) => !v.startsWith('_'), message: "can't start with an underscore" }],
    hosts: ['twitch.tv'],
    placeholder: 'yourchannel',
    profileUrl: (u) => `twitch.tv/${u}`,
  },
  {
    id: 'threads',
    name: 'Threads',
    icon: siThreads,
    tint: '#f2f2f7',
    audienceNoun: 'followers',
    min: 1,
    max: 30,
    allowed: /^[a-z0-9._]+$/,
    allowedLabel: 'letters, numbers, periods and underscores',
    extra: [noEdgePeriod, noDoublePeriod],
    hosts: ['threads.net', 'threads.com'],
    placeholder: 'yourname',
    profileUrl: (u) => `threads.net/@${u}`,
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    icon: siPinterest,
    tint: '#ff4d5e',
    audienceNoun: 'followers',
    min: 3,
    max: 30,
    allowed: /^[a-z0-9_]+$/,
    allowedLabel: 'letters, numbers and underscores',
    extra: [],
    hosts: ['pinterest.com', 'pin.it'],
    placeholder: 'yourname',
    profileUrl: (u) => `pinterest.com/${u}`,
  },
];

export function getPlatform(id: PlatformId): Platform {
  return PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[0];
}

export function isPlatformId(value: unknown): value is PlatformId {
  return typeof value === 'string' && PLATFORMS.some((p) => p.id === value);
}

/**
 * Handles that belong to platforms or are reserved system names. They pass the
 * format check (so the form accepts them) but the request's screening stage
 * rejects them, which is what a real service would do server-side.
 */
const RESERVED = new Set([
  'admin',
  'administrator',
  'support',
  'help',
  'root',
  'system',
  'official',
  'instagram',
  'tiktok',
  'youtube',
  'facebook',
  'twitch',
  'threads',
  'pinterest',
  'twitter',
  'meta',
  'null',
  'undefined',
]);

export function isReservedHandle(username: string): boolean {
  return RESERVED.has(username.toLowerCase());
}

export type UsernameCheck =
  | { ok: true; value: string }
  | { ok: false; error: string };

/** A link with a scheme, or a bare domain followed by a path (so "john.doe" stays a username). */
const URL_LIKE = /^(https?:\/\/|([a-z0-9-]+\.)+[a-z]{2,}\/)/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const YOUTUBE_PREFIXES = new Set(['c', 'user', 'channel']);

/** Turns a pasted profile link into its username, or explains why it can't. */
function fromProfileUrl(raw: string, platform: Platform): UsernameCheck {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: "That link couldn't be read. Enter just the username instead." };
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|vm)\./, '');
  if (!platform.hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
    return {
      ok: false,
      error: `That link isn't from ${platform.name}. Paste a ${platform.name} profile link or just the username.`,
    };
  }
  const segments = url.pathname.split('/').filter(Boolean);
  let segment = segments[0] ?? '';
  if (platform.id === 'youtube' && YOUTUBE_PREFIXES.has(segment.toLowerCase())) {
    segment = segments[1] ?? '';
  }
  if (!segment) {
    return { ok: false, error: `That link doesn't include a ${platform.name} username.` };
  }
  return { ok: true, value: decodeURIComponent(segment).replace(/^@/, '') };
}

/**
 * Validates and normalizes a public username for a platform. Accepts "@name",
 * "name" or a profile link. Only formats are checked: nothing is looked up.
 */
export function validateUsername(input: string, platformId: PlatformId): UsernameCheck {
  const platform = getPlatform(platformId);
  const raw = input.trim();

  if (!raw) return { ok: false, error: 'Enter a username to continue.' };

  const looksLikeUrl = URL_LIKE.test(raw);
  if (/\bpass(word|wd)?\b/i.test(raw) || (!looksLikeUrl && raw.includes(':'))) {
    return {
      ok: false,
      error:
        'That looks like it may include a password. FollowBoost only needs your public username. Never share your password.',
    };
  }
  if (!looksLikeUrl && EMAIL.test(raw)) {
    return { ok: false, error: 'That looks like an email address. Enter your public username instead.' };
  }

  let candidate = raw;
  if (looksLikeUrl) {
    const fromUrl = fromProfileUrl(raw, platform);
    if (!fromUrl.ok) return fromUrl;
    candidate = fromUrl.value;
  }

  candidate = candidate.replace(/^@/, '');
  if (/\s/.test(candidate)) return { ok: false, error: "Usernames can't contain spaces." };
  if (candidate.includes('@')) return { ok: false, error: 'Use a single @ at the start, or leave it out.' };

  const value = candidate.toLowerCase();
  if (!value) return { ok: false, error: 'Enter a username to continue.' };
  if (value.length < platform.min || value.length > platform.max) {
    const range = platform.min === 1 ? `up to ${platform.max}` : `${platform.min}–${platform.max}`;
    return { ok: false, error: `${platform.name} usernames are ${range} characters long.` };
  }
  if (!platform.allowed.test(value)) {
    return { ok: false, error: `${platform.name} usernames can only use ${platform.allowedLabel}.` };
  }
  for (const rule of platform.extra) {
    if (!rule.test(value)) return { ok: false, error: `${platform.name} usernames ${rule.message}.` };
  }
  return { ok: true, value };
}
