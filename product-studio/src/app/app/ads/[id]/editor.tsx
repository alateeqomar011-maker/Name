"use client";

import { ArrowLeft, Check, ChevronDown, Cloud, Copy, Download, Images, Layers, Loader2, PanelLeft, Redo2, SlidersHorizontal, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/app/app-provider";
import { ContentForm } from "@/components/design/content-form";
import { DesignCanvas } from "@/components/design/design-canvas";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Card, EmptyState, Segmented, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api, useApi } from "@/lib/client/api";
import { brandStyleFromKit, type BrandKitRow } from "@/lib/design/brand";
import { createDesign, exportAndDownload, exportDesign, type SavedDesign } from "@/lib/design/export";
import { applyContent, buildFromTemplate, contentOf } from "@/lib/design/templates";
import type { DesignDoc, ImageLayer, Layer } from "@/lib/design/types";
import { FORMATS, FORMAT_MAP, PLATFORMS } from "@/lib/formats";
import { cn } from "@/lib/utils";
import { AddPanel, BackgroundEditor, Inspector, LayersPanel, newLayerId } from "./panels";

type Handle = "nw" | "ne" | "sw" | "se";
interface Drag {
  mode: "move" | Handle;
  id: string;
  startU: number;
  startV: number;
  start: Layer;
  before: DesignDoc;
  moved: boolean;
}

export function DesignEditor({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const { handleError } = useApp();
  const { data, error } = useApi<{ design: SavedDesign }>(`/api/designs/${id}`);
  const [doc, setDoc] = useState<DesignDoc | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<"add" | "text" | "layers">("add");
  const [mobilePanel, setMobilePanel] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");
  const [exporting, setExporting] = useState(false);
  const [kit, setKit] = useState<BrandKitRow | null>(null);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  const [resizeOpen, setResizeOpen] = useState(false);
  const past = useRef<DesignDoc[]>([]);
  const future = useRef<DesignDoc[]>([]);
  const drag = useRef<Drag | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const savedDoc = useRef<string>("");
  const [stageSize, setStageSize] = useState({ w: 600, h: 600 });

  const design = data?.design;
  useEffect(() => {
    if (design?.doc && !doc) {
      setDoc(design.doc);
      setName(design.name);
      savedDoc.current = JSON.stringify(design.doc);
    }
  }, [design, doc]);

  // Fit the canvas to the stage.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setStageSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [design]);

  const W = design?.width ?? 1080;
  const H = design?.height ?? 1080;
  const scale = Math.min((stageSize.w - 32) / W, (stageSize.h - 32) / H);
  const dispW = Math.max(120, Math.floor(W * scale));
  const dispH = Math.floor((dispW * H) / W);

  const commit = useCallback((next: DesignDoc, before?: DesignDoc) => {
    setDoc((cur) => {
      const base = before ?? cur;
      if (base) past.current.push(base);
      if (past.current.length > 100) past.current.shift();
      future.current = [];
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    setDoc((cur) => {
      if (cur) future.current.push(cur);
      return prev;
    });
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    setDoc((cur) => {
      if (cur) past.current.push(cur);
      return next;
    });
  }, []);

  const updateLayer = useCallback(
    (lid: string, patch: Partial<Layer>) => {
      if (!doc) return;
      commit({ ...doc, layers: doc.layers.map((l) => (l.id === lid ? ({ ...l, ...patch } as Layer) : l)) });
    },
    [commit, doc],
  );

  // Autosave.
  useEffect(() => {
    if (!doc || !design) return;
    const json = JSON.stringify(doc);
    if (json === savedDoc.current) return;
    setSaveState("dirty");
    const t = setTimeout(async () => {
      setSaveState("saving");
      try {
        await api(`/api/designs/${design.id}`, { method: "PATCH", json: { doc } });
        savedDoc.current = json;
        setSaveState("saved");
      } catch (err) {
        setSaveState("dirty");
        handleError(err, "Couldn't save the design");
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [doc, design, handleError]);

  const selectedLayer = doc?.layers.find((l) => l.id === selected) ?? null;

  const removeSelected = useCallback(() => {
    if (!doc || !selected) return;
    commit({ ...doc, layers: doc.layers.filter((l) => l.id !== selected) });
    setSelected(null);
  }, [commit, doc, selected]);

  const duplicateSelected = useCallback(() => {
    if (!doc || !selectedLayer) return;
    const copy = { ...selectedLayer, id: newLayerId("d"), x: Math.min(0.95, selectedLayer.x + 0.03), y: Math.min(0.95, selectedLayer.y + 0.03) } as Layer;
    commit({ ...doc, layers: [...doc.layers, copy] });
    setSelected(copy.id);
  }, [commit, doc, selectedLayer]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "Escape") {
        setSelected(null);
      } else if (selectedLayer && !selectedLayer.locked && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 0.02 : 0.004;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        updateLayer(selectedLayer.id, { x: selectedLayer.x + dx, y: selectedLayer.y + dy });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [duplicateSelected, redo, removeSelected, selected, selectedLayer, undo, updateLayer]);

  const toUV = (e: React.PointerEvent) => {
    const r = overlay.current!.getBoundingClientRect();
    return { u: (e.clientX - r.left) / r.width, v: (e.clientY - r.top) / r.height };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!doc) return;
    const handle = (e.target as HTMLElement).dataset.handle as Handle | undefined;
    const { u, v } = toUV(e);
    let target = handle ? selectedLayer : null;
    if (!target) {
      for (let i = doc.layers.length - 1; i >= 0; i--) {
        const l = doc.layers[i];
        if (l.hidden) continue;
        if (u >= l.x && u <= l.x + l.w && v >= l.y && v <= l.y + Math.max(l.h, 0.01)) {
          target = l;
          break;
        }
      }
    }
    if (!target) {
      setSelected(null);
      return;
    }
    setSelected(target.id);
    if (target.locked) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { mode: handle ?? "move", id: target.id, startU: u, startV: v, start: target, before: doc, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !doc) return;
    const { u, v } = toUV(e);
    const du = u - d.startU;
    const dv = v - d.startV;
    if (!d.moved && Math.abs(du) + Math.abs(dv) < 0.003) return;
    d.moved = true;
    const s = d.start;
    let next: Partial<Layer>;
    if (d.mode === "move") {
      let x = s.x + du;
      let y = s.y + dv;
      const cx = x + s.w / 2;
      const cy = y + s.h / 2;
      const snapV = Math.abs(cx - 0.5) < 0.012;
      const snapH = Math.abs(cy - 0.5) < 0.012;
      if (snapV) x = 0.5 - s.w / 2;
      if (snapH) y = 0.5 - s.h / 2;
      setGuides({ v: snapV, h: snapH });
      next = { x, y };
    } else {
      const keepAspect = s.type === "image" ? !e.shiftKey : e.shiftKey;
      let { x, y, w, h } = s;
      if (d.mode.includes("e")) w = Math.max(0.02, s.w + du);
      if (d.mode.includes("w")) {
        w = Math.max(0.02, s.w - du);
        x = s.x + s.w - w;
      }
      if (d.mode.includes("s")) h = Math.max(0.005, s.h + dv);
      if (d.mode.includes("n")) {
        h = Math.max(0.005, s.h - dv);
        y = s.y + s.h - h;
      }
      if (keepAspect) {
        const ratio = s.h / s.w;
        h = w * ratio;
        if (d.mode.includes("n")) y = s.y + s.h - h;
      }
      next = { x, y, w, h };
    }
    setDoc({ ...doc, layers: doc.layers.map((l) => (l.id === d.id ? ({ ...l, ...next } as Layer) : l)) });
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setGuides({ v: false, h: false });
    if (d?.moved && doc) {
      past.current.push(d.before);
      future.current = [];
    }
  };

  const productLayer = doc?.layers.find((l) => l.type === "image" && l.role === "product") as ImageLayer | undefined;

  const applyTemplate = (tid: string, brandKit: BrandKitRow | null = kit) => {
    if (!doc) return;
    const content = contentOf(doc);
    const photoId = doc.background.type === "image" ? doc.background.assetId : null;
    const next = buildFromTemplate(tid, {
      W,
      H,
      content,
      brand: brandStyleFromKit(brandKit),
      productAssetId: productLayer?.assetId ?? null,
      photoAssetId: photoId ?? (tid === "photo" ? productLayer?.assetId : null),
      rtl: /[؀-ۿ]/.test(content.headline),
    });
    commit({ ...next, templateId: tid });
    setSelected(null);
  };

  const download = async (format: "png" | "jpeg") => {
    if (!doc || !design) return;
    setExporting(true);
    try {
      await exportAndDownload(design, doc, "ad", format);
      toast.success("Export ready", "Also saved to your gallery.");
    } catch (err) {
      handleError(err, "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const saveToGallery = async () => {
    if (!doc || !design) return;
    setExporting(true);
    try {
      await exportDesign(design, doc, "ad", { thumbnail: true });
      toast.success("Saved to gallery");
    } catch (err) {
      handleError(err, "Couldn't save");
    } finally {
      setExporting(false);
    }
  };

  const resizeTo = async (formatId: string) => {
    if (!doc || !design) return;
    const f = FORMAT_MAP[formatId];
    const content = contentOf(doc);
    const next = buildFromTemplate(doc.templateId ?? "spotlight", {
      W: f.width,
      H: f.height,
      content,
      brand: brandStyleFromKit(kit),
      productAssetId: productLayer?.assetId ?? null,
      photoAssetId: doc.background.type === "image" ? doc.background.assetId : null,
      rtl: /[؀-ۿ]/.test(content.headline),
    });
    try {
      const created = await createDesign({
        name: `${name} · ${f.name}`,
        formatId: f.id,
        width: f.width,
        height: f.height,
        projectId: design.projectId,
        doc: { ...next, templateId: doc.templateId },
      });
      setResizeOpen(false);
      router.push(`/app/ads/${created.id}`);
    } catch (err) {
      handleError(err, "Couldn't create the resized copy");
    }
  };

  const content = useMemo(() => (doc ? contentOf(doc) : null), [doc]);

  if (error) return <EmptyState title="Design not found" description="It may have been deleted." action={<Link href="/app/ads" className="font-semibold text-iris-600">Back to designs</Link>} />;
  if (!design || !doc) return <Skeleton className="h-[70vh]" />;

  const format = FORMAT_MAP[design.formatId];
  const selBox = selectedLayer ? { left: selectedLayer.x * dispW, top: selectedLayer.y * dispH, width: selectedLayer.w * dispW, height: Math.max(selectedLayer.h * dispH, 4) } : null;

  const sidePanel = (
    <div className="grid gap-4">
      <Segmented
        size="sm"
        className="w-full"
        value={panel}
        onChange={setPanel}
        options={[
          { value: "add", label: <span className="flex items-center gap-1"><Images className="size-3.5" /> Design</span> },
          { value: "text", label: <span className="flex items-center gap-1"><SlidersHorizontal className="size-3.5" /> Copy</span> },
          { value: "layers", label: <span className="flex items-center gap-1"><Layers className="size-3.5" /> Layers</span> },
        ]}
      />
      {panel === "add" && (
        <AddPanel
          doc={doc}
          projectId={design.projectId}
          kitId={kit?.id ?? null}
          onAdd={(l) => {
            commit({ ...doc, layers: [...doc.layers, l] });
            setSelected(l.id);
          }}
          onApplyTemplate={(tid) => applyTemplate(tid)}
          onApplyBrand={(k) => {
            setKit(k);
            applyTemplate(doc.templateId ?? "spotlight", k);
          }}
          onBackground={(bg) => commit({ ...doc, background: bg })}
        />
      )}
      {panel === "text" && content && (
        <ContentForm value={content} onChange={(c) => commit(applyContent(doc, c))} projectId={design.projectId} compact />
      )}
      {panel === "layers" && (
        <LayersPanel doc={doc} selected={selected} onSelect={setSelected} onToggle={(lid, patch) => updateLayer(lid, patch)} />
      )}
    </div>
  );

  return (
    <div className="-mx-4 -my-6 flex min-h-[calc(100dvh-56px)] flex-col sm:-mx-6 lg:-mx-8 lg:-my-8 lg:h-[calc(100dvh-64px)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2 sm:px-4">
        <IconButton label="Back to designs" onClick={() => router.push("/app/ads")}>
          <ArrowLeft className="size-5" />
        </IconButton>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== design.name && api(`/api/designs/${design.id}`, { method: "PATCH", json: { name: name.trim() } })}
          className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 text-sm font-semibold outline-none hover:bg-subtle focus:bg-subtle sm:max-w-xs"
          aria-label="Design name"
        />
        <span className="hidden text-xs text-muted md:inline">
          {format ? `${PLATFORMS[format.platform].name} ${format.name}` : ""} · {W}×{H}
        </span>
        <span className="flex items-center gap-1 text-xs text-faint">
          {saveState === "saving" ? <Loader2 className="size-3.5 animate-spin" /> : saveState === "saved" ? <Check className="size-3.5" /> : <Cloud className="size-3.5" />}
          <span className="hidden sm:inline">{saveState === "saving" ? "Saving" : saveState === "saved" ? "Saved" : "Unsaved"}</span>
        </span>
        <div className="flex-1" />
        <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={!past.current.length}>
          <Undo2 className="size-4" />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!future.current.length}>
          <Redo2 className="size-4" />
        </IconButton>
        <IconButton label="Panels" className="lg:hidden" onClick={() => setMobilePanel(true)}>
          <PanelLeft className="size-4" />
        </IconButton>
        <Button size="sm" variant="secondary" icon={<Copy className="size-4" />} onClick={() => setResizeOpen(true)} className="hidden sm:inline-flex">
          Resize
        </Button>
        <Menu
          trigger={
            <Button size="sm" variant="primary" loading={exporting} icon={<Download className="size-4" />}>
              Export <ChevronDown className="size-3.5" />
            </Button>
          }
        >
          <MenuLabel>Download</MenuLabel>
          <MenuItem onSelect={() => download("png")}>PNG · {W}×{H}</MenuItem>
          <MenuItem onSelect={() => download("jpeg")}>JPG · {W}×{H}</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={saveToGallery}>Save to gallery only</MenuItem>
        </Menu>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="scrollbar-thin hidden w-[300px] shrink-0 overflow-y-auto border-r border-line bg-surface p-4 lg:block">{sidePanel}</aside>

        <div ref={stage} className="relative min-h-[60vh] min-w-0 flex-1 overflow-hidden bg-[#ebeae6] lg:min-h-0" onPointerDown={(e) => e.target === stage.current && setSelected(null)}>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative shadow-lift" style={{ width: dispW, height: dispH }}>
              <DesignCanvas doc={doc} width={W} height={H} displayWidth={dispW} />
              <div
                ref={overlay}
                className="absolute inset-0 touch-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onDoubleClick={() => selectedLayer?.type === "text" && textRef.current?.focus()}
              >
                {format?.safeTop && (
                  <>
                    <div className="pointer-events-none absolute inset-x-0 top-0 border-b border-dashed border-white/50 bg-black/5" style={{ height: format.safeTop * dispH }} />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-dashed border-white/50 bg-black/5" style={{ height: (format.safeBottom ?? 0) * dispH }} />
                  </>
                )}
                {guides.v && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-coral-500" />}
                {guides.h && <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-coral-500" />}
                {selBox && (
                  <div className={cn("absolute border-2", selectedLayer?.locked ? "border-faint" : "border-iris-500")} style={selBox}>
                    {!selectedLayer?.locked &&
                      (["nw", "ne", "sw", "se"] as Handle[]).map((h) => (
                        <span
                          key={h}
                          data-handle={h}
                          className="absolute size-3 rounded-full border-2 border-iris-500 bg-white"
                          style={{
                            left: h.includes("w") ? -7 : undefined,
                            right: h.includes("e") ? -7 : undefined,
                            top: h.includes("n") ? -7 : undefined,
                            bottom: h.includes("s") ? -7 : undefined,
                            cursor: h === "nw" || h === "se" ? "nwse-resize" : "nesw-resize",
                          }}
                        />
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <aside className="scrollbar-thin hidden w-[300px] shrink-0 overflow-y-auto border-l border-line bg-surface p-4 lg:block">
          {selectedLayer ? (
            <Inspector
              layer={selectedLayer}
              projectId={design.projectId}
              textRef={textRef}
              onChange={(patch) => updateLayer(selectedLayer.id, patch)}
              onDelete={removeSelected}
              onDuplicate={duplicateSelected}
              onMove={(dir) => {
                const idx = doc.layers.findIndex((l) => l.id === selectedLayer.id);
                const to = Math.max(0, Math.min(doc.layers.length - 1, idx + dir));
                const layers = [...doc.layers];
                layers.splice(to, 0, layers.splice(idx, 1)[0]);
                commit({ ...doc, layers });
              }}
            />
          ) : (
            <div className="grid gap-4">
              <p className="text-sm font-semibold">Background</p>
              <BackgroundEditor value={doc.background} onChange={(bg) => commit({ ...doc, background: bg })} projectId={design.projectId} />
              <p className="text-xs text-muted">Click any element on the canvas to edit it. Drag to move, use the corner handles to resize. Hold Shift to resize text freely.</p>
            </div>
          )}
        </aside>
      </div>

      {/* Mobile: panels in a sheet */}
      <Dialog open={mobilePanel} onOpenChange={setMobilePanel} title="Design tools" size="md">
        {selectedLayer ? (
          <Inspector
            layer={selectedLayer}
            projectId={design.projectId}
            onChange={(patch) => updateLayer(selectedLayer.id, patch)}
            onDelete={() => {
              removeSelected();
              setMobilePanel(false);
            }}
            onDuplicate={duplicateSelected}
            onMove={() => {}}
          />
        ) : (
          sidePanel
        )}
      </Dialog>

      <Dialog open={resizeOpen} onOpenChange={setResizeOpen} title="Resize for another format" description="Creates a copy laid out for the new size. This design stays unchanged." size="lg">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {FORMATS.filter((f) => f.id !== design.formatId).map((f) => (
            <button key={f.id} onClick={() => resizeTo(f.id)} className="rounded-xl border border-line p-3 text-left hover:border-iris-300">
              <p className="text-xs font-semibold">{PLATFORMS[f.platform].name}</p>
              <p className="text-xs text-muted">
                {f.name} · {f.width}×{f.height}
              </p>
            </button>
          ))}
        </div>
      </Dialog>
    </div>
  );
}

export function EditorCard({ children }: { children: React.ReactNode }) {
  return <Card className="p-4">{children}</Card>;
}
