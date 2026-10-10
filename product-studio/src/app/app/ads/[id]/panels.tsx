"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Circle,
  Copy,
  Eye,
  EyeOff,
  ImagePlus,
  Lock,
  Minus,
  Square,
  Star,
  Trash2,
  Type,
  Unlock,
} from "lucide-react";
import { useRef } from "react";
import { useApp } from "@/components/app/app-provider";
import { BrandKitSelect, ProjectImagePicker } from "@/components/design/pickers";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Segmented, Slider, Switch } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import type { AssetDto } from "@/lib/client/api";
import type { BrandKitRow } from "@/lib/design/brand";
import { TEMPLATES } from "@/lib/design/templates";
import type { DesignDoc, ImageLayer, Layer, ShapeLayer, TextLayer, TextRole } from "@/lib/design/types";
import { FONTS } from "@/lib/fonts";
import { cn } from "@/lib/utils";

let n = 0;
export const newLayerId = (p: string) => `${p}${Date.now().toString(36)}${(n++).toString(36)}`;

const SWATCHES = ["#111111", "#ffffff", "#6d5bff", "#ff7a59", "#ff3d3d", "#ffd84d", "#1b2a4a", "#e9c46a", "#0f766e", "#f4eee6"];

export function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const hex = value.startsWith("#") && value.length >= 7 ? value.slice(0, 7) : "#000000";
  return (
    <div>
      {label && <p className="mb-1.5 text-[13px] font-medium text-ink-2">{label}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="relative size-7 cursor-pointer overflow-hidden rounded-lg border border-line" style={{ background: value }} title="Custom color">
          <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
        </label>
        {SWATCHES.map((c) => (
          <button key={c} onClick={() => onChange(c)} className={cn("size-5 rounded-md border border-black/10", value === c && "ring-2 ring-iris-500 ring-offset-1")} style={{ background: c }} aria-label={c} />
        ))}
      </div>
    </div>
  );
}

const TEXT_PRESETS: { role: TextRole; label: string; text: string; size: number; weight: number; bg?: TextLayer["bg"] }[] = [
  { role: "headline", label: "Headline", text: "Your headline", size: 0.08, weight: 800 },
  { role: "subheadline", label: "Subheadline", text: "A short supporting line", size: 0.035, weight: 500 },
  { role: "body", label: "Body text", text: "Add a few words about your product", size: 0.028, weight: 400 },
  { role: "cta", label: "Button", text: "Shop now", size: 0.032, weight: 700, bg: { color: "#111111", radius: 999, padX: 0.9, padY: 0.55 } },
  { role: "badge", label: "Discount badge", text: "-30%", size: 0.05, weight: 800, bg: { color: "#ff3d3d", radius: 999, padX: 0.3, padY: 0.3, shape: "burst" } },
  { role: "price", label: "Price", text: "$49", size: 0.07, weight: 800 },
];

export function AddPanel({
  doc,
  projectId,
  onAdd,
  onApplyTemplate,
  onApplyBrand,
  kitId,
  onBackground,
}: {
  doc: DesignDoc;
  projectId: string | null;
  onAdd: (l: Layer) => void;
  onApplyTemplate: (id: string) => void;
  onApplyBrand: (kit: BrandKitRow | null) => void;
  kitId: string | null;
  onBackground: (bg: DesignDoc["background"]) => void;
}) {
  const { handleError } = useApp();
  const toast = useToast();
  const logoInput = useRef<HTMLInputElement>(null);
  const font = (doc.layers.find((l) => l.type === "text") as TextLayer | undefined)?.font ?? "Inter Variable";
  const addText = (p: (typeof TEXT_PRESETS)[number]) =>
    onAdd({
      id: newLayerId("t"),
      type: "text",
      role: p.role,
      text: p.text,
      font,
      weight: p.weight,
      size: p.size,
      color: p.bg ? "#ffffff" : "#111111",
      align: "center",
      valign: "middle",
      lineHeight: 1.1,
      autoFit: true,
      bg: p.bg,
      x: 0.2,
      y: 0.4,
      w: 0.6,
      h: p.role === "headline" ? 0.14 : p.role === "badge" ? 0.16 : 0.07,
    });
  const addShape = (shape: ShapeLayer["shape"]) =>
    onAdd({
      id: newLayerId("s"),
      type: "shape",
      shape,
      fill: shape === "line" ? "#111111" : "#6d5bff",
      x: 0.35,
      y: shape === "line" ? 0.5 : 0.35,
      w: 0.3,
      h: shape === "line" ? 0.004 : 0.3,
      radius: shape === "rect" ? 0.02 : undefined,
    });
  const addImage = (a: Pick<AssetDto, "id" | "width" | "height">, role: ImageLayer["role"] = "product") => {
    const ar = a.width / a.height;
    const w = 0.5;
    onAdd({ id: newLayerId("i"), type: "image", assetId: a.id, fit: "contain", shadow: role === "product", role, x: 0.25, y: 0.25, w, h: Math.min(0.6, w / ar) });
  };

  return (
    <div className="grid gap-6">
      <section>
        <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Layouts</p>
        <div className="grid grid-cols-3 gap-2">
          {TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => onApplyTemplate(t.id)} className="group text-left" title={t.description}>
              <div className={cn("aspect-square rounded-xl border transition group-hover:border-line-strong", doc.templateId === t.id ? "ring-2 ring-iris-500 ring-offset-1" : "border-line")} style={{ background: t.preview }} />
              <p className="mt-1 truncate text-[11px] text-muted">{t.name}</p>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-faint">Switching layout keeps your text and product.</p>
      </section>
      <section>
        <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Brand kit</p>
        <BrandKitSelect value={kitId} onChange={onApplyBrand} />
        {!kitId && <p className="mt-1 text-[11px] text-faint">Create brand kits in AI Tools to apply your colors and fonts.</p>}
      </section>
      <section>
        <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Text</p>
        <div className="grid grid-cols-2 gap-1.5">
          {TEXT_PRESETS.map((p) => (
            <button key={p.role} onClick={() => addText(p)} className="flex items-center gap-2 rounded-xl border border-line px-2.5 py-2 text-left text-xs font-medium hover:border-line-strong">
              <Type className="size-3.5 text-faint" /> {p.label}
            </button>
          ))}
        </div>
      </section>
      <section>
        <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Shapes</p>
        <div className="flex gap-1.5">
          {(
            [
              ["rect", <Square key="r" className="size-4" />],
              ["circle", <Circle key="c" className="size-4" />],
              ["line", <Minus key="l" className="size-4" />],
              ["burst", <Star key="b" className="size-4" />],
              ["arch", <span key="a" className="block h-4 w-3.5 rounded-t-full border-2 border-current" />],
            ] as const
          ).map(([s, icon]) => (
            <button key={s} onClick={() => addShape(s)} className="flex size-10 items-center justify-center rounded-xl border border-line text-ink-2 hover:border-line-strong" aria-label={`Add ${s}`}>
              {icon}
            </button>
          ))}
        </div>
      </section>
      <section>
        <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Images</p>
        <ProjectImagePicker projectId={projectId} value={null} onChange={(a) => addImage(a)} />
        <input
          ref={logoInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const form = new FormData();
            form.append("file", file);
            form.append("kind", "logo");
            try {
              const res = await fetch("/api/uploads", { method: "POST", body: form });
              const body = await res.json();
              if (!res.ok) throw new Error(body?.error?.message ?? "Upload failed");
              addImage(body.asset, "logo");
              toast.success("Logo added");
            } catch (err) {
              handleError(err, "Couldn't upload");
            }
          }}
        />
        <Button size="sm" variant="secondary" className="mt-2 w-full" icon={<ImagePlus className="size-4" />} onClick={() => logoInput.current?.click()}>
          Upload logo or image
        </Button>
      </section>
      <section>
        <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Background</p>
        <BackgroundEditor value={doc.background} onChange={onBackground} projectId={projectId} />
      </section>
    </div>
  );
}

export function BackgroundEditor({
  value,
  onChange,
  projectId,
}: {
  value: DesignDoc["background"];
  onChange: (bg: DesignDoc["background"]) => void;
  projectId: string | null;
}) {
  return (
    <div className="grid gap-3">
      <Segmented
        size="sm"
        className="w-full"
        value={value.type}
        onChange={(type) => onChange({ ...value, type, color2: value.color2 ?? "#ffffff", angle: value.angle ?? 180 })}
        options={[
          { value: "solid", label: "Solid" },
          { value: "gradient", label: "Gradient" },
          { value: "image", label: "Photo" },
        ]}
      />
      <ColorInput label={value.type === "gradient" ? "From" : "Color"} value={value.color} onChange={(color) => onChange({ ...value, color })} />
      {value.type === "gradient" && (
        <>
          <ColorInput label="To" value={value.color2 ?? "#ffffff"} onChange={(color2) => onChange({ ...value, color2 })} />
          <Field label="Angle">
            <Slider value={value.angle ?? 180} onChange={(angle) => onChange({ ...value, angle })} min={0} max={360} step={15} label="Gradient angle" />
          </Field>
        </>
      )}
      {value.type === "image" && (
        <>
          <ProjectImagePicker projectId={projectId} value={value.assetId ?? null} kinds={["render", "scene", "enhanced", "upscaled", "original"]} onChange={(a) => onChange({ ...value, assetId: a.id })} />
          <Field label="Darken">
            <Slider
              value={value.overlay?.opacity ?? 0}
              onChange={(opacity) => onChange({ ...value, overlay: { color: "#000000", opacity } })}
              min={0}
              max={0.7}
              step={0.05}
              label="Darken background"
            />
          </Field>
        </>
      )}
    </div>
  );
}

export function Inspector({
  layer,
  onChange,
  onDelete,
  onDuplicate,
  onMove,
  projectId,
  textRef,
}: {
  layer: Layer;
  onChange: (patch: Partial<Layer>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (dir: 1 | -1) => void;
  projectId: string | null;
  textRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold capitalize">{layer.type === "text" ? (layer.role ?? "Text") : layer.type === "image" ? (layer.role ?? "Image") : layer.shape}</p>
        <div className="flex gap-0.5">
          <IconBtn label="Bring forward" onClick={() => onMove(1)}><ArrowUp className="size-4" /></IconBtn>
          <IconBtn label="Send backward" onClick={() => onMove(-1)}><ArrowDown className="size-4" /></IconBtn>
          <IconBtn label="Duplicate" onClick={onDuplicate}><Copy className="size-4" /></IconBtn>
          <IconBtn label={layer.locked ? "Unlock" : "Lock"} onClick={() => onChange({ locked: !layer.locked })}>{layer.locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}</IconBtn>
          <IconBtn label="Delete" onClick={onDelete} danger><Trash2 className="size-4" /></IconBtn>
        </div>
      </div>

      {layer.type === "text" && <TextInspector layer={layer} onChange={onChange as (p: Partial<TextLayer>) => void} textRef={textRef} />}
      {layer.type === "image" && (
        <div className="grid gap-3">
          <ProjectImagePicker projectId={projectId} value={layer.assetId} onChange={(a) => onChange({ assetId: a.id } as Partial<ImageLayer>)} />
          <Row label="Fit">
            <Segmented size="sm" value={layer.fit} onChange={(fit) => onChange({ fit } as Partial<ImageLayer>)} options={[{ value: "contain", label: "Fit" }, { value: "cover", label: "Fill" }]} />
          </Row>
          <Row label="Drop shadow">
            <Switch checked={Boolean(layer.shadow)} onCheckedChange={(shadow) => onChange({ shadow } as Partial<ImageLayer>)} />
          </Row>
          <Row label="Corner radius">
            <div className="w-32"><Slider value={layer.radius ?? 0} onChange={(radius) => onChange({ radius } as Partial<ImageLayer>)} min={0} max={0.1} step={0.005} label="Corner radius" /></div>
          </Row>
        </div>
      )}
      {layer.type === "shape" && (
        <div className="grid gap-3">
          <ColorInput label="Fill" value={layer.fill.startsWith("linear:") ? "#000000" : layer.fill} onChange={(fill) => onChange({ fill } as Partial<ShapeLayer>)} />
          {layer.shape === "rect" && (
            <Row label="Corner radius">
              <div className="w-32"><Slider value={layer.radius ?? 0} onChange={(radius) => onChange({ radius } as Partial<ShapeLayer>)} min={0} max={0.2} step={0.005} label="Corner radius" /></div>
            </Row>
          )}
        </div>
      )}
      <Row label="Opacity">
        <div className="w-32"><Slider value={layer.opacity ?? 1} onChange={(opacity) => onChange({ opacity })} min={0.05} max={1} step={0.05} label="Opacity" /></div>
      </Row>
    </div>
  );
}

function TextInspector({ layer, onChange, textRef }: { layer: TextLayer; onChange: (p: Partial<TextLayer>) => void; textRef?: React.RefObject<HTMLTextAreaElement | null> }) {
  const font = FONTS.find((f) => f.family === layer.font) ?? FONTS[0];
  return (
    <div className="grid gap-3">
      <Textarea ref={textRef} value={layer.text} onChange={(e) => onChange({ text: e.target.value })} rows={3} dir="auto" className="text-[15px]" />
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <Select value={layer.font} onChange={(e) => onChange({ font: e.target.value })}>
          {(["sans", "serif", "display", "arabic"] as const).map((cat) => (
            <optgroup key={cat} label={cat === "arabic" ? "Arabic" : cat[0].toUpperCase() + cat.slice(1)}>
              {FONTS.filter((f) => f.category === cat).map((f) => (
                <option key={f.family} value={f.family}>
                  {f.family.replace(" Variable", "")}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <Select value={String(layer.weight)} onChange={(e) => onChange({ weight: Number(e.target.value) })}>
          {font.weights.map((w) => (
            <option key={w} value={w}>
              {w === 400 ? "Regular" : w === 500 ? "Medium" : w === 600 ? "Semibold" : w === 700 ? "Bold" : "Black"}
            </option>
          ))}
        </Select>
      </div>
      <Row label="Size">
        <div className="w-36"><Slider value={layer.size} onChange={(size) => onChange({ size })} min={0.012} max={0.25} step={0.002} label="Font size" /></div>
      </Row>
      <ColorInput label="Color" value={layer.color} onChange={(color) => onChange({ color })} />
      <Row label="Align">
        <Segmented
          size="sm"
          value={layer.align}
          onChange={(align) => onChange({ align })}
          options={[
            { value: "left", label: <AlignLeft className="size-3.5" /> },
            { value: "center", label: <AlignCenter className="size-3.5" /> },
            { value: "right", label: <AlignRight className="size-3.5" /> },
          ]}
        />
      </Row>
      <Row label="Line height">
        <div className="w-32"><Slider value={layer.lineHeight} onChange={(lineHeight) => onChange({ lineHeight })} min={0.8} max={1.8} step={0.02} label="Line height" /></div>
      </Row>
      <Row label="Letter spacing">
        <div className="w-32"><Slider value={layer.letterSpacing ?? 0} onChange={(letterSpacing) => onChange({ letterSpacing })} min={-0.05} max={0.4} step={0.01} label="Letter spacing" /></div>
      </Row>
      <Row label="UPPERCASE">
        <Switch checked={Boolean(layer.uppercase)} onCheckedChange={(uppercase) => onChange({ uppercase })} />
      </Row>
      <Row label="Shrink to fit box">
        <Switch checked={layer.autoFit !== false} onCheckedChange={(autoFit) => onChange({ autoFit })} />
      </Row>
      <Row label="Background">
        <Switch
          checked={Boolean(layer.bg)}
          onCheckedChange={(on) => onChange({ bg: on ? { color: "#111111", radius: 999, padX: 0.9, padY: 0.55 } : undefined })}
        />
      </Row>
      {layer.bg && (
        <>
          <ColorInput label="Background color" value={layer.bg.color} onChange={(color) => onChange({ bg: { ...layer.bg!, color } })} />
          <Row label="Shape">
            <Segmented
              size="sm"
              value={layer.bg.shape ?? "box"}
              onChange={(shape) => onChange({ bg: { ...layer.bg!, shape } })}
              options={[
                { value: "box", label: "Pill" },
                { value: "circle", label: "Circle" },
                { value: "burst", label: "Burst" },
              ]}
            />
          </Row>
        </>
      )}
      <Row label="Text shadow">
        <Switch checked={Boolean(layer.shadow)} onCheckedChange={(on) => onChange({ shadow: on ? { color: "rgba(0,0,0,0.35)", blur: 0.012, y: 0.004 } : undefined })} />
      </Row>
    </div>
  );
}

export function LayersPanel({
  doc,
  selected,
  onSelect,
  onToggle,
}: {
  doc: DesignDoc;
  selected: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string, patch: Partial<Layer>) => void;
}) {
  return (
    <div className="grid gap-1">
      {[...doc.layers].reverse().map((l) => (
        <div key={l.id} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs", selected === l.id ? "bg-iris-50 text-iris-700" : "hover:bg-subtle")}>
          <button className="min-w-0 flex-1 truncate text-left" onClick={() => onSelect(l.id)}>
            {l.type === "text" ? `T · ${l.text.slice(0, 24)}` : l.type === "image" ? `Image · ${l.role ?? ""}` : `Shape · ${l.shape}`}
          </button>
          <button onClick={() => onToggle(l.id, { hidden: !l.hidden })} aria-label="Toggle visibility" className="text-faint hover:text-ink">
            {l.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-ink-2">{label}</span>
      {children}
    </div>
  );
}

function IconBtn({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className={cn("flex size-8 items-center justify-center rounded-lg text-muted hover:bg-subtle", danger ? "hover:text-danger" : "hover:text-ink")}>
      {children}
    </button>
  );
}
