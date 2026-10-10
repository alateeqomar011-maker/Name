"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { designAssetIds, designFonts, renderDesign, type ImageMap } from "@/lib/design/render";
import { ensureFonts, loadImages } from "@/lib/design/fonts-client";
import type { DesignDoc } from "@/lib/design/types";
import { cn } from "@/lib/utils";

export interface DesignCanvasHandle {
  canvas: HTMLCanvasElement | null;
}

/**
 * Renders a design at display size (with devicePixelRatio for crispness).
 * Fonts and images are loaded before drawing.
 */
export const DesignCanvas = forwardRef<
  DesignCanvasHandle,
  { doc: DesignDoc; width: number; height: number; displayWidth: number; className?: string; onReady?: () => void }
>(function DesignCanvas({ doc, width, height, displayWidth, className, onReady }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [images, setImages] = useState<ImageMap>(new Map());
  const [fontsReady, setFontsReady] = useState(0);
  useImperativeHandle(ref, () => ({ canvas: canvas.current }), []);

  const ids = designAssetIds(doc).join(",");
  useEffect(() => {
    let alive = true;
    loadImages(ids ? ids.split(",") : []).then((m) => alive && setImages(m));
    return () => {
      alive = false;
    };
  }, [ids]);

  const fontKey = designFonts(doc)
    .map((f) => `${f.family}${f.weight}${/[؀-ۿ]/.test(f.sample) ? "ar" : ""}`)
    .join("|");
  useEffect(() => {
    let alive = true;
    ensureFonts(designFonts(doc)).then(() => alive && setFontsReady((n) => n + 1));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontKey]);

  const displayHeight = (displayWidth * height) / width;
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(displayWidth * dpr);
    const ph = Math.round(displayHeight * dpr);
    if (c.width !== pw) c.width = pw;
    if (c.height !== ph) c.height = ph;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    renderDesign(ctx, doc, pw, ph, images);
    onReady?.();
  }, [doc, images, fontsReady, displayWidth, displayHeight, onReady]);

  return <canvas ref={canvas} className={cn("block", className)} style={{ width: displayWidth, height: displayHeight }} />;
});

/** Renders a design at full resolution and returns a PNG blob. */
export async function renderDesignBlob(doc: DesignDoc, width: number, height: number): Promise<Blob> {
  await ensureFonts(designFonts(doc));
  const images = await loadImages(designAssetIds(doc), 2048);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  renderDesign(ctx, doc, width, height, images);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Render failed"))), "image/png"));
}
