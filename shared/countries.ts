export type Region = 'arab' | 'gulf' | 'latam' | 'europe' | 'africa' | 'asia' | 'northamerica' | 'oceania';

interface CountryRow {
  name: string;
  nameAr: string;
  regions: Region[];
  langs: string[];
}

// Countries that appear in the catalogue. Regions drive the "Arab & Gulf stars" style rails and filters.
const ROWS: Record<string, CountryRow> = {
  SA: { name: 'Saudi Arabia', nameAr: 'السعودية', regions: ['arab', 'gulf', 'asia'], langs: ['ar', 'en'] },
  AE: { name: 'United Arab Emirates', nameAr: 'الإمارات', regions: ['arab', 'gulf', 'asia'], langs: ['ar', 'en'] },
  QA: { name: 'Qatar', nameAr: 'قطر', regions: ['arab', 'gulf', 'asia'], langs: ['ar', 'en'] },
  KW: { name: 'Kuwait', nameAr: 'الكويت', regions: ['arab', 'gulf', 'asia'], langs: ['ar', 'en'] },
  BH: { name: 'Bahrain', nameAr: 'البحرين', regions: ['arab', 'gulf', 'asia'], langs: ['ar', 'en'] },
  OM: { name: 'Oman', nameAr: 'عُمان', regions: ['arab', 'gulf', 'asia'], langs: ['ar', 'en'] },
  IQ: { name: 'Iraq', nameAr: 'العراق', regions: ['arab', 'asia'], langs: ['ar', 'en'] },
  JO: { name: 'Jordan', nameAr: 'الأردن', regions: ['arab', 'asia'], langs: ['ar', 'en'] },
  LB: { name: 'Lebanon', nameAr: 'لبنان', regions: ['arab', 'asia'], langs: ['ar', 'en', 'fr'] },
  SY: { name: 'Syria', nameAr: 'سوريا', regions: ['arab', 'asia'], langs: ['ar', 'en'] },
  PS: { name: 'Palestine', nameAr: 'فلسطين', regions: ['arab', 'asia'], langs: ['ar', 'en'] },
  YE: { name: 'Yemen', nameAr: 'اليمن', regions: ['arab', 'asia'], langs: ['ar', 'en'] },
  EG: { name: 'Egypt', nameAr: 'مصر', regions: ['arab', 'africa'], langs: ['ar', 'en'] },
  MA: { name: 'Morocco', nameAr: 'المغرب', regions: ['arab', 'africa'], langs: ['ar', 'fr', 'en'] },
  DZ: { name: 'Algeria', nameAr: 'الجزائر', regions: ['arab', 'africa'], langs: ['ar', 'fr', 'en'] },
  TN: { name: 'Tunisia', nameAr: 'تونس', regions: ['arab', 'africa'], langs: ['ar', 'fr', 'en'] },
  LY: { name: 'Libya', nameAr: 'ليبيا', regions: ['arab', 'africa'], langs: ['ar', 'en'] },
  SD: { name: 'Sudan', nameAr: 'السودان', regions: ['arab', 'africa'], langs: ['ar', 'en'] },
  IR: { name: 'Iran', nameAr: 'إيران', regions: ['asia'], langs: ['fa', 'en'] },
  TR: { name: 'Türkiye', nameAr: 'تركيا', regions: ['europe', 'asia'], langs: ['tr', 'en'] },
  PT: { name: 'Portugal', nameAr: 'البرتغال', regions: ['europe'], langs: ['pt', 'en', 'es'] },
  ES: { name: 'Spain', nameAr: 'إسبانيا', regions: ['europe'], langs: ['es', 'en'] },
  FR: { name: 'France', nameAr: 'فرنسا', regions: ['europe'], langs: ['fr', 'en'] },
  DE: { name: 'Germany', nameAr: 'ألمانيا', regions: ['europe'], langs: ['de', 'en'] },
  IT: { name: 'Italy', nameAr: 'إيطاليا', regions: ['europe'], langs: ['it', 'en'] },
  GB: { name: 'United Kingdom', nameAr: 'المملكة المتحدة', regions: ['europe'], langs: ['en'] },
  IE: { name: 'Ireland', nameAr: 'أيرلندا', regions: ['europe'], langs: ['en'] },
  NL: { name: 'Netherlands', nameAr: 'هولندا', regions: ['europe'], langs: ['nl', 'en'] },
  BE: { name: 'Belgium', nameAr: 'بلجيكا', regions: ['europe'], langs: ['nl', 'fr', 'en'] },
  NO: { name: 'Norway', nameAr: 'النرويج', regions: ['europe'], langs: ['no', 'en'] },
  SE: { name: 'Sweden', nameAr: 'السويد', regions: ['europe'], langs: ['sv', 'en'] },
  DK: { name: 'Denmark', nameAr: 'الدنمارك', regions: ['europe'], langs: ['da', 'en'] },
  MC: { name: 'Monaco', nameAr: 'موناكو', regions: ['europe'], langs: ['fr', 'en'] },
  HU: { name: 'Hungary', nameAr: 'المجر', regions: ['europe'], langs: ['hu', 'en'] },
  CH: { name: 'Switzerland', nameAr: 'سويسرا', regions: ['europe'], langs: ['de', 'fr', 'en'] },
  AT: { name: 'Austria', nameAr: 'النمسا', regions: ['europe'], langs: ['de', 'en'] },
  PL: { name: 'Poland', nameAr: 'بولندا', regions: ['europe'], langs: ['pl', 'en'] },
  CZ: { name: 'Czechia', nameAr: 'التشيك', regions: ['europe'], langs: ['cs', 'en'] },
  HR: { name: 'Croatia', nameAr: 'كرواتيا', regions: ['europe'], langs: ['hr', 'en'] },
  RS: { name: 'Serbia', nameAr: 'صربيا', regions: ['europe'], langs: ['sr', 'en'] },
  SI: { name: 'Slovenia', nameAr: 'سلوفينيا', regions: ['europe'], langs: ['sl', 'en'] },
  GR: { name: 'Greece', nameAr: 'اليونان', regions: ['europe'], langs: ['el', 'en'] },
  UA: { name: 'Ukraine', nameAr: 'أوكرانيا', regions: ['europe'], langs: ['uk', 'en'] },
  RU: { name: 'Russia', nameAr: 'روسيا', regions: ['europe', 'asia'], langs: ['ru', 'en'] },
  GE: { name: 'Georgia', nameAr: 'جورجيا', regions: ['europe', 'asia'], langs: ['ka', 'en', 'es'] },
  AM: { name: 'Armenia', nameAr: 'أرمينيا', regions: ['europe', 'asia'], langs: ['hy', 'ru', 'en'] },
  KG: { name: 'Kyrgyzstan', nameAr: 'قيرغيزستان', regions: ['asia'], langs: ['ky', 'ru', 'en'] },
  KZ: { name: 'Kazakhstan', nameAr: 'كازاخستان', regions: ['asia'], langs: ['kk', 'ru', 'en'] },
  US: { name: 'United States', nameAr: 'الولايات المتحدة', regions: ['northamerica'], langs: ['en'] },
  CA: { name: 'Canada', nameAr: 'كندا', regions: ['northamerica'], langs: ['en', 'fr'] },
  MX: { name: 'Mexico', nameAr: 'المكسيك', regions: ['latam', 'northamerica'], langs: ['es', 'en'] },
  PR: { name: 'Puerto Rico', nameAr: 'بورتوريكو', regions: ['latam', 'northamerica'], langs: ['es', 'en'] },
  BB: { name: 'Barbados', nameAr: 'باربادوس', regions: ['latam', 'northamerica'], langs: ['en'] },
  JM: { name: 'Jamaica', nameAr: 'جامايكا', regions: ['latam', 'northamerica'], langs: ['en'] },
  BR: { name: 'Brazil', nameAr: 'البرازيل', regions: ['latam'], langs: ['pt', 'en', 'es'] },
  AR: { name: 'Argentina', nameAr: 'الأرجنتين', regions: ['latam'], langs: ['es', 'en'] },
  CO: { name: 'Colombia', nameAr: 'كولومبيا', regions: ['latam'], langs: ['es', 'en'] },
  UY: { name: 'Uruguay', nameAr: 'الأوروغواي', regions: ['latam'], langs: ['es', 'en'] },
  CL: { name: 'Chile', nameAr: 'تشيلي', regions: ['latam'], langs: ['es', 'en'] },
  PE: { name: 'Peru', nameAr: 'بيرو', regions: ['latam'], langs: ['es', 'en'] },
  VE: { name: 'Venezuela', nameAr: 'فنزويلا', regions: ['latam'], langs: ['es', 'en'] },
  NG: { name: 'Nigeria', nameAr: 'نيجيريا', regions: ['africa'], langs: ['en'] },
  GH: { name: 'Ghana', nameAr: 'غانا', regions: ['africa'], langs: ['en'] },
  SN: { name: 'Senegal', nameAr: 'السنغال', regions: ['africa'], langs: ['fr', 'en'] },
  CI: { name: "Côte d'Ivoire", nameAr: 'ساحل العاج', regions: ['africa'], langs: ['fr', 'en'] },
  CM: { name: 'Cameroon', nameAr: 'الكاميرون', regions: ['africa'], langs: ['fr', 'en'] },
  KE: { name: 'Kenya', nameAr: 'كينيا', regions: ['africa'], langs: ['en', 'sw'] },
  ET: { name: 'Ethiopia', nameAr: 'إثيوبيا', regions: ['africa'], langs: ['am', 'en'] },
  ZA: { name: 'South Africa', nameAr: 'جنوب أفريقيا', regions: ['africa'], langs: ['en', 'af'] },
  SO: { name: 'Somalia', nameAr: 'الصومال', regions: ['africa', 'arab'], langs: ['so', 'ar', 'en'] },
  IN: { name: 'India', nameAr: 'الهند', regions: ['asia'], langs: ['hi', 'en'] },
  PK: { name: 'Pakistan', nameAr: 'باكستان', regions: ['asia'], langs: ['ur', 'en'] },
  CN: { name: 'China', nameAr: 'الصين', regions: ['asia'], langs: ['zh', 'en'] },
  HK: { name: 'Hong Kong', nameAr: 'هونغ كونغ', regions: ['asia'], langs: ['zh', 'en'] },
  TW: { name: 'Taiwan', nameAr: 'تايوان', regions: ['asia'], langs: ['zh', 'en'] },
  JP: { name: 'Japan', nameAr: 'اليابان', regions: ['asia'], langs: ['ja', 'en'] },
  KR: { name: 'South Korea', nameAr: 'كوريا الجنوبية', regions: ['asia'], langs: ['ko', 'en'] },
  TH: { name: 'Thailand', nameAr: 'تايلاند', regions: ['asia'], langs: ['th', 'en'] },
  PH: { name: 'Philippines', nameAr: 'الفلبين', regions: ['asia'], langs: ['en', 'tl'] },
  MY: { name: 'Malaysia', nameAr: 'ماليزيا', regions: ['asia'], langs: ['ms', 'en'] },
  ID: { name: 'Indonesia', nameAr: 'إندونيسيا', regions: ['asia'], langs: ['id', 'en'] },
  AU: { name: 'Australia', nameAr: 'أستراليا', regions: ['oceania'], langs: ['en'] },
  NZ: { name: 'New Zealand', nameAr: 'نيوزيلندا', regions: ['oceania'], langs: ['en'] },
  // Historical states/regions
  GR_ANC: { name: 'Ancient Greece', nameAr: 'اليونان القديمة', regions: ['europe'], langs: ['en', 'el'] },
  IT_ANC: { name: 'Ancient Rome', nameAr: 'روما القديمة', regions: ['europe'], langs: ['en', 'it'] },
  EG_ANC: { name: 'Ancient Egypt', nameAr: 'مصر القديمة', regions: ['arab', 'africa'], langs: ['en', 'ar'] },
  MN: { name: 'Mongolia', nameAr: 'منغوليا', regions: ['asia'], langs: ['mn', 'en'] },
  UZ: { name: 'Uzbekistan', nameAr: 'أوزبكستان', regions: ['asia'], langs: ['uz', 'ru', 'en'] },
};

export const COUNTRY_CODES = Object.keys(ROWS);

export function country(code: string): CountryRow & { code: string; flag: string } {
  const row = ROWS[code] ?? { name: code, nameAr: code, regions: [], langs: ['en'] };
  return { ...row, code, flag: flagEmoji(code) };
}

export function flagEmoji(code: string): string {
  const base = code.slice(0, 2).toUpperCase();
  if (code.endsWith('_ANC')) return '🏛️';
  if (!/^[A-Z]{2}$/.test(base)) return '🌐';
  return String.fromCodePoint(...[...base].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

export function countryRegions(code: string): Region[] {
  return ROWS[code]?.regions ?? [];
}

export function defaultLanguages(code: string): string[] {
  return ROWS[code]?.langs ?? ['en'];
}

export const LANGUAGE_NAMES: Record<string, { name: string; native: string; bcp47: string }> = {
  en: { name: 'English', native: 'English', bcp47: 'en-US' },
  ar: { name: 'Arabic', native: 'العربية', bcp47: 'ar-SA' },
  es: { name: 'Spanish', native: 'Español', bcp47: 'es-ES' },
  pt: { name: 'Portuguese', native: 'Português', bcp47: 'pt-BR' },
  fr: { name: 'French', native: 'Français', bcp47: 'fr-FR' },
  de: { name: 'German', native: 'Deutsch', bcp47: 'de-DE' },
  it: { name: 'Italian', native: 'Italiano', bcp47: 'it-IT' },
  tr: { name: 'Turkish', native: 'Türkçe', bcp47: 'tr-TR' },
  ru: { name: 'Russian', native: 'Русский', bcp47: 'ru-RU' },
  hi: { name: 'Hindi', native: 'हिन्दी', bcp47: 'hi-IN' },
  ur: { name: 'Urdu', native: 'اردو', bcp47: 'ur-PK' },
  zh: { name: 'Chinese', native: '中文', bcp47: 'zh-CN' },
  ja: { name: 'Japanese', native: '日本語', bcp47: 'ja-JP' },
  ko: { name: 'Korean', native: '한국어', bcp47: 'ko-KR' },
  nl: { name: 'Dutch', native: 'Nederlands', bcp47: 'nl-NL' },
  pl: { name: 'Polish', native: 'Polski', bcp47: 'pl-PL' },
  id: { name: 'Indonesian', native: 'Bahasa Indonesia', bcp47: 'id-ID' },
  fa: { name: 'Persian', native: 'فارسی', bcp47: 'fa-IR' },
  sv: { name: 'Swedish', native: 'Svenska', bcp47: 'sv-SE' },
  uk: { name: 'Ukrainian', native: 'Українська', bcp47: 'uk-UA' },
};

/** Languages offered for calls and captions. */
export const CALL_LANGUAGES = ['en', 'ar', 'es', 'pt', 'fr', 'de', 'it', 'tr', 'ru', 'hi', 'ur', 'zh', 'ja', 'ko', 'nl', 'id'];

export function bcp47(lang: string): string {
  return LANGUAGE_NAMES[lang]?.bcp47 ?? lang;
}
