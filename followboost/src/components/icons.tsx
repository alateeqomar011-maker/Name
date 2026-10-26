import { useId } from 'react';
import { getPlatform, type PlatformId } from '../lib/platforms';

export function PlatformGlyph({ id, size = 18 }: { id: PlatformId; size?: number }) {
  const platform = getPlatform(id);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
      <path d={platform.icon.path} />
    </svg>
  );
}

/** Brand-tinted rounded tile holding the platform mark. */
export function PlatformBadge({ id, size = 36 }: { id: PlatformId; size?: number }) {
  const platform = getPlatform(id);
  return (
    <span
      className="platform-badge"
      style={{ width: size, height: size, color: platform.tint, ['--tint' as string]: platform.tint }}
      aria-hidden
    >
      <PlatformGlyph id={id} size={Math.round(size * 0.5)} />
    </span>
  );
}

export function LogoMark({ size = 32 }: { size?: number }) {
  // Unique per instance: a gradient defined inside a hidden copy (the sidebar on phones) would not paint.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="0.55" stopColor="#a855f7" />
          <stop offset="1" stopColor="#d946ef" />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="16" y1="0" x2="16" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id}-bg)`} />
      <rect width="32" height="16" rx="9" fill={`url(#${id}-shine)`} />
      <path
        d="M9 21.5l5.2-5.2 3.3 3.3L23 14"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M18.6 13.4H23.6V18.4" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="logo">
      <LogoMark />
      <span className="logo-word">
        FollowBoost <span className="logo-ai">AI</span>
      </span>
    </span>
  );
}
