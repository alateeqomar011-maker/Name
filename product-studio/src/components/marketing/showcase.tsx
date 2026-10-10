"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BeforeAfter } from "@/components/app/before-after";
import { SAMPLES } from "@/lib/samples";
import { cn } from "@/lib/utils";

/** Hero showcase: real before/after outputs from the Vitrine pipeline. */
export function TransformationShowcase() {
  const [s, setS] = useState(0);
  const [r, setR] = useState(0);
  const [auto, setAuto] = useState(true);
  const sample = SAMPLES[s];
  const render = sample.renders[r % sample.renders.length];
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!auto) return;
    timer.current = setInterval(() => {
      setR((x) => {
        const next = x + 1;
        if (next >= SAMPLES[s].renders.length) {
          setS((y) => (y + 1) % SAMPLES.length);
          return 0;
        }
        return next;
      });
    }, 3200);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [auto, s]);

  // Preload the next images.
  useEffect(() => {
    for (const x of sample.renders) {
      const img = new Image();
      img.src = x.src;
    }
  }, [sample]);

  return (
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[40px] bg-[radial-gradient(circle_at_30%_20%,rgba(109,91,255,0.18),transparent_60%),radial-gradient(circle_at_80%_80%,rgba(255,122,89,0.18),transparent_55%)] blur-2xl" />
      <div className="rounded-[28px] border border-line bg-surface p-3 shadow-lift">
        <BeforeAfter before={sample.before} after={render.src} aspect={4 / 5} beforeLabel="Phone photo" afterLabel={render.name} className="rounded-[20px]" />
        <div className="mt-3 flex items-center gap-2 px-1">
          <Sparkles className="size-4 shrink-0 text-iris-500" />
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto" onPointerDown={() => setAuto(false)}>
            {sample.renders.map((x, i) => (
              <button
                key={x.style}
                onClick={() => {
                  setAuto(false);
                  setR(i);
                }}
                className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition", i === r % sample.renders.length ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:border-line-strong")}
              >
                {x.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-center gap-2">
        {SAMPLES.map((x, i) => (
          <button
            key={x.id}
            onClick={() => {
              setAuto(false);
              setS(i);
              setR(0);
            }}
            className={cn("size-14 overflow-hidden rounded-2xl border-2 bg-white transition", i === s ? "border-iris-500 shadow-glow" : "border-transparent opacity-70 hover:opacity-100")}
            aria-label={x.name}
            title={x.name}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={x.before} alt="" className="size-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
