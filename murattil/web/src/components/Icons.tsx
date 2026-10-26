// Minimal line icons (24px grid, stroke = currentColor).
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const S = (props: P & { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props} />
);

export const IHome = (p: P) => <S {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></S>;
export const IBook = (p: P) => <S {...p}><path d="M12 6.5C10 5 7.5 4.5 4 4.8v13.5c3.5-.3 6 .2 8 1.7 2-1.5 4.5-2 8-1.7V4.8c-3.5-.3-6 .2-8 1.7Z" /><path d="M12 6.5V20" /></S>;
export const IUsers = (p: P) => <S {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 14.2c1.7.6 2.7 2.2 3 4.8" /></S>;
export const IWave = (p: P) => <S {...p}><path d="M3 12h1.5M6.5 8v8M10 5v14M13.5 9v6M17 6.5v11M20.5 11v2" /></S>;
export const IMic = (p: P) => <S {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></S>;
export const IFolder = (p: P) => <S {...p}><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h9A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z" /></S>;
export const IChart = (p: P) => <S {...p}><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" /></S>;
export const IGear = (p: P) => <S {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></S>;
export const IMore = (p: P) => <S {...p}><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></S>;
export const IPlay = (p: P) => <S {...p} fill="currentColor" stroke="none"><path d="M7 4.8v14.4c0 .8.9 1.3 1.6.8l11-7.2a1 1 0 0 0 0-1.6l-11-7.2C7.9 3.5 7 4 7 4.8Z" /></S>;
export const IPause = (p: P) => <S {...p} fill="currentColor" stroke="none"><rect x="6" y="4.5" width="4" height="15" rx="1.2" /><rect x="14" y="4.5" width="4" height="15" rx="1.2" /></S>;
export const INext = (p: P) => <S {...p}><path d="m6 5 9 7-9 7Z" fill="currentColor" /><path d="M18 5v14" /></S>;
export const IPrev = (p: P) => <S {...p}><path d="m18 5-9 7 9 7Z" fill="currentColor" /><path d="M6 5v14" /></S>;
export const IStop = (p: P) => <S {...p} fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2" /></S>;
export const IRepeat = (p: P) => <S {...p}><path d="M17 2.5 20.5 6 17 9.5" /><path d="M3.5 11.5V10a4 4 0 0 1 4-4h13" /><path d="M7 21.5 3.5 18 7 14.5" /><path d="M20.5 12.5V14a4 4 0 0 1-4 4h-13" /></S>;
export const IHeart = (p: P) => <S {...p}><path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10Z" /></S>;
export const IBookmark = (p: P) => <S {...p}><path d="M6 3.5h12v17l-6-4-6 4Z" /></S>;
export const IDownload = (p: P) => <S {...p}><path d="M12 3.5v12M7 11l5 5 5-5M4 20.5h16" /></S>;
export const ITrash = (p: P) => <S {...p}><path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13.5h10L18 7" /></S>;
export const IUpload = (p: P) => <S {...p}><path d="M12 15.5v-12M7 8l5-5 5 5M4 20.5h16" /></S>;
export const IInfo = (p: P) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.2" /></S>;
export const IAlert = (p: P) => <S {...p}><path d="M12 3.5 2.5 20h19Z" /><path d="M12 10v4.5M12 17.2v.2" /></S>;
export const ICheck = (p: P) => <S {...p}><path d="m4.5 12.5 5 5 10-11" /></S>;
export const ISparkle = (p: P) => <S {...p}><path d="M12 3c.5 4.2 2.8 6.5 7 7-4.2.5-6.5 2.8-7 7-.5-4.2-2.8-6.5-7-7 4.2-.5 6.5-2.8 7-7Z" /><path d="M19 15.5c.2 1.6 1 2.4 2.5 2.5-1.5.2-2.3 1-2.5 2.5-.2-1.5-1-2.3-2.5-2.5 1.5-.1 2.3-.9 2.5-2.5Z" /></S>;
export const IStar8 = (p: P) => <S {...p}><path d="m12 2 2.8 4.2 4.9-1-1 4.9L22 12l-4.2 2.8 1 4.9-4.9-1L12 22l-2.8-4.2-4.9 1 1-4.9L2 12l4.2-2.8-1-4.9 4.9 1Z" /></S>;
export const ISearch = (p: P) => <S {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.3-4.3" /></S>;
export const IEdit = (p: P) => <S {...p}><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17Z" /></S>;
export const ISliders = (p: P) => <S {...p}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></S>;
export const IShield = (p: P) => <S {...p}><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6Z" /><path d="m8.8 12 2.2 2.2 4.4-4.4" /></S>;
export const IArrow = (p: P) => <S {...p}><path d="M5 12h14M13 6l6 6-6 6" /></S>;
export const ISpeed = (p: P) => <S {...p}><path d="M4.5 17a8 8 0 1 1 15 0" /><path d="m12 13 3.5-4" /></S>;
