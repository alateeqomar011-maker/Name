import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <defs>
        <linearGradient id="vt-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6d5bff" />
          <stop offset="0.55" stopColor="#9b5cff" />
          <stop offset="1" stopColor="#ff7a59" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="#0c0c14" />
      <path d="M16 5.5 26.5 16 16 26.5 5.5 16Z" fill="url(#vt-g)" />
      <path d="M16 11.2 20.8 16 16 20.8 11.2 16Z" fill="#0c0c14" />
    </svg>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className={cn("font-display text-[26px] leading-none tracking-tight", light ? "text-white" : "text-ink")}>Vitrine</span>
    </span>
  );
}
