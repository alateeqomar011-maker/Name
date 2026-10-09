import type { ScenarioId } from '../../shared/types.ts';

export interface Room {
  id: string;
  title: Record<'en' | 'ar' | 'es' | 'pt', string>;
  ids: string[];
  scenario: ScenarioId;
  topic?: string;
}

export const ROOMS: Room[] = [
  {
    id: 'ultimate',
    title: { en: 'The Ultimate Hangout', ar: 'السهرة الأسطورية', es: 'La quedada definitiva', pt: 'O rolê definitivo' },
    ids: ['cristiano-ronaldo', 'lionel-messi', 'neymar-jr', 'mrbeast', 'ishowspeed'],
    scenario: 'hangout',
  },
  {
    id: 'goat',
    title: { en: 'Football GOAT Debate', ar: 'نقاش الأعظم في كرة القدم', es: 'Debate del GOAT del fútbol', pt: 'Debate do GOAT do futebol' },
    ids: ['cristiano-ronaldo', 'lionel-messi', 'pele', 'diego-maradona'],
    scenario: 'debate',
    topic: 'Who is the greatest footballer of all time?',
  },
  {
    id: 'octagon',
    title: { en: 'Octagon Roundtable', ar: 'طاولة الأوكتاغون', es: 'Mesa redonda del octágono', pt: 'Mesa redonda do octógono' },
    ids: ['khabib-nurmagomedov', 'islam-makhachev', 'charles-oliveira', 'ilia-topuria'],
    scenario: 'press',
  },
  {
    id: 'creators',
    title: { en: 'Creator Chaos', ar: 'فوضى صناع المحتوى', es: 'Caos de creadores', pt: 'Caos dos criadores' },
    ids: ['mrbeast', 'ishowspeed', 'kai-cenat', 'ksi'],
    scenario: 'funny',
  },
  {
    id: 'arab-legends',
    title: { en: 'Arab Football Legends', ar: 'أساطير الكرة العربية', es: 'Leyendas árabes del fútbol', pt: 'Lendas árabes do futebol' },
    ids: ['mohamed-salah', 'mohamed-aboutrika', 'salem-al-dawsari', 'riyad-mahrez', 'achraf-hakimi'],
    scenario: 'hangout',
  },
  {
    id: 'hoops',
    title: { en: 'Hoops GOAT Debate', ar: 'نقاش أعظم لاعب سلة', es: 'Debate del GOAT del básquet', pt: 'Debate do GOAT do basquete' },
    ids: ['michael-jordan', 'lebron-james', 'stephen-curry'],
    scenario: 'debate',
    topic: 'Who is the greatest basketball player ever?',
  },
  {
    id: 'genius',
    title: { en: 'Genius Hour', ar: 'ساعة العباقرة', es: 'La hora de los genios', pt: 'Hora dos gênios' },
    ids: ['albert-einstein', 'nikola-tesla', 'marie-curie', 'ibn-sina'],
    scenario: 'hangout',
  },
  {
    id: 'tarab',
    title: { en: 'Tarab Majlis', ar: 'مجلس الطرب', es: 'Majlis de tarab', pt: 'Majlis de tarab' },
    ids: ['amr-diab', 'nancy-ajram', 'kadim-al-sahir', 'hussain-al-jassmi'],
    scenario: 'hangout',
  },
  {
    id: 'comedy',
    title: { en: 'Comedy Night', ar: 'ليلة الكوميديا', es: 'Noche de comedia', pt: 'Noite de comédia' },
    ids: ['kevin-hart', 'rowan-atkinson', 'trevor-noah', 'bassem-youssef'],
    scenario: 'funny',
  },
];
