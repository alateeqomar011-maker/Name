"use client";

import { MoveHorizontal } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Draggable before/after comparison. Both images are letterboxed into the same frame. */
export function BeforeAfter({
  before,
  after,
  aspect,
  className,
  beforeLabel = "Before",
  afterLabel = "After",
  checker,
  style,
}: {
  before: string;
  after: string;
  aspect: number;
  className?: string;
  beforeLabel?: string;
  afterLabel?: string;
  checker?: boolean;
  style?: React.CSSProperties;
}) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const move = useCallback((clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  }, []);

  return (
    <div
      ref={ref}
      className={cn("relative w-full touch-none overflow-hidden rounded-2xl bg-subtle select-none", className)}
      style={{ aspectRatio: aspect, ...style }}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        move(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && move(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 5));
        if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + 5));
      }}
      tabIndex={0}
      role="slider"
      aria-label="Before and after comparison"
      aria-valuenow={Math.round(pos)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt="After" className={cn("absolute inset-0 size-full object-contain", checker && "bg-checker")} draggable={false} />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <div className="absolute inset-0 bg-[#e9e8e4]" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt="Before" className="absolute inset-0 size-full object-contain" draggable={false} />
      </div>
      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
        <div className="absolute inset-y-0 -left-px w-0.5 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" />
        <div className="absolute top-1/2 -left-5 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-lift">
          <MoveHorizontal className="size-4" />
        </div>
      </div>
      <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-ink/70 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-ink backdrop-blur">
        {afterLabel}
      </span>
    </div>
  );
}
