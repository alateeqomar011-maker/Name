"use client";

import { ChevronDown, Lock, Palette, PlugZap, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app/app-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Badge, Segmented, Slider } from "@/components/ui/misc";
import { assetUrl } from "@/lib/client/api";
import { tintPalette } from "@/lib/color";
import { GENERATION_TYPES, studioCost } from "@/lib/generation-types";
import { STUDIO_STYLES, STYLE_CATEGORIES, type AspectId, type Layout, type ShadowKind, type StyleCategory } from "@/lib/studio-styles";
import { cn } from "@/lib/utils";

export interface StudioRequest {
  type: "studio" | "scene";
  params: Record<string, unknown>;
  cost: number;
}

const ASPECT_OPTIONS: { value: AspectId; label: string }[] = [
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5" },
  { value: "9:16", label: "9:16" },
  { value: "16:9", label: "16:9" },
];

const TINTS = ["#f1e4d3", "#e8d5ff", "#cfe8ff", "#d4f0e0", "#ffd9d1", "#fff1b8", "#1d2a4d", "#2d1b2e"];

export function StylePanel({
  cutoutId,
  defaultLayout,
  suggested,
  busy,
  onGenerate,
  initialStyle,
}: {
  cutoutId: string | null;
  defaultLayout: Layout;
  suggested: string[];
  busy: boolean;
  onGenerate: (req: StudioRequest) => void;
  initialStyle?: string;
}) {
  const { me } = useApp();
  const [mode, setMode] = useState<"studio" | "ai">("studio");
  const firstStyle = initialStyle ?? suggested.find((s) => !s.startsWith("ai-")) ?? "studio-white";
  const [styleId, setStyleId] = useState(firstStyle);
  const [category, setCategory] = useState<StyleCategory | "suggested">(() =>
    suggested.includes(firstStyle) && !initialStyle ? "suggested" : (STUDIO_STYLES.find((s) => s.id === firstStyle)?.category ?? "minimal"),
  );
  const [aiStyleId, setAiStyleId] = useState("ai-kitchen");
  const [customPrompt, setCustomPrompt] = useState("");
  const [aspect, setAspect] = useState<AspectId>("1:1");
  const [layout, setLayout] = useState<Layout>(defaultLayout);
  const maxVariations = me?.workspace.limits.maxVariations ?? 2;
  const [variations, setVariations] = useState(Math.min(4, maxVariations));
  const [aiVariations, setAiVariations] = useState(1);
  const [advanced, setAdvanced] = useState(false);
  const [shadow, setShadow] = useState<ShadowKind | "auto">("auto");
  const [strength, setStrength] = useState(1);
  const [reflection, setReflection] = useState<"auto" | "on" | "off">("auto");
  const [scale, setScale] = useState(1);
  const [light, setLight] = useState<"-1" | "0" | "1">("0");
  const [tint, setTint] = useState<string | null>(null);
  const [startVariation, setStartVariation] = useState(0);

  useEffect(() => setLayout(defaultLayout), [defaultLayout]);
  useEffect(() => setVariations((v) => Math.min(v, maxVariations)), [maxVariations]);

  const caps = me?.capabilities;
  const procedural = STUDIO_STYLES.filter((s) => s.kind === "procedural");
  const aiStyles = STUDIO_STYLES.filter((s) => s.kind === "ai");
  const visible = useMemo(() => {
    if (category === "suggested") return procedural.filter((s) => suggested.includes(s.id));
    return procedural.filter((s) => s.category === category);
  }, [category, procedural, suggested]);
  const style = STUDIO_STYLES.find((s) => s.id === styleId);
  const cost = mode === "studio" ? studioCost(variations) : GENERATION_TYPES.scene.cost * aiVariations;

  const generate = () => {
    if (mode === "studio") {
      const palette = tint && style?.palettes?.[0] ? tintPalette(style.palettes[startVariation % style.palettes.length] ?? style.palettes[0], tint) : undefined;
      onGenerate({
        type: "studio",
        cost,
        params: {
          styleId,
          aspect,
          layout,
          variations,
          startVariation,
          palette,
          scale: scale !== 1 ? scale : undefined,
          shadow: shadow === "auto" ? undefined : shadow,
          shadowStrength: strength !== 1 ? strength : undefined,
          reflection: reflection === "auto" ? undefined : reflection === "on",
          lightSide: Number(light),
          cutoutAssetId: cutoutId,
        },
      });
      setStartVariation((s) => s + variations);
    } else {
      onGenerate({
        type: "scene",
        cost,
        params: {
          styleId: customPrompt.trim() ? undefined : aiStyleId,
          customPrompt: customPrompt.trim() || undefined,
          aspect,
          layout,
          variations: aiVariations,
          cutoutAssetId: cutoutId,
        },
      });
    }
  };

  const thumb = cutoutId ? assetUrl(cutoutId, 240) : null;

  return (
    <div className="flex flex-col gap-5">
      <Segmented
        value={mode}
        onChange={setMode}
        className="w-full"
        options={[
          { value: "studio", label: <span className="flex items-center justify-center gap-1.5"><Palette className="size-3.5" /> Studio styles</span> },
          { value: "ai", label: <span className="flex items-center justify-center gap-1.5"><Wand2 className="size-3.5" /> AI scenes</span> },
        ]}
      />

      {mode === "studio" ? (
        <>
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {suggested.some((s) => !s.startsWith("ai-")) && (
              <Chip active={category === "suggested"} onClick={() => setCategory("suggested")}>
                <Sparkles className="size-3" /> For you
              </Chip>
            )}
            {STYLE_CATEGORIES.filter((c) => !["outdoor", "lifestyle"].includes(c.id)).map((c) => (
              <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
                {c.label}
              </Chip>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {visible.map((s) => (
              <StyleTile key={s.id} name={s.name} swatch={s.swatch} thumb={thumb} active={styleId === s.id} onClick={() => setStyleId(s.id)} />
            ))}
          </div>
          {style && <p className="-mt-2 text-xs leading-relaxed text-muted">{style.description}</p>}
        </>
      ) : (
        <>
          {!caps?.aiScenes && (
            <div className="flex gap-3 rounded-2xl border border-warning/20 bg-warning-soft p-3.5 text-[13px] text-warning">
              <PlugZap className="mt-0.5 size-4 shrink-0" />
              <p>
                AI scene generation isn&apos;t connected on this server, so these scenes can&apos;t be generated yet. Studio styles work fully offline.
              </p>
            </div>
          )}
          <div className={cn("grid grid-cols-3 gap-2.5", !caps?.aiScenes && "opacity-60")}>
            {aiStyles.map((s) => (
              <StyleTile
                key={s.id}
                name={s.name}
                swatch={s.swatch}
                thumb={thumb}
                active={!customPrompt.trim() && aiStyleId === s.id}
                onClick={() => {
                  setAiStyleId(s.id);
                  setCustomPrompt("");
                }}
                ai
              />
            ))}
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-medium">Or describe a scene</p>
            <Textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              maxLength={400}
              placeholder="e.g. on a wet black stone in a misty forest at dawn"
              className="min-h-20 text-[13px]"
            />
          </div>
          <p className="text-xs leading-relaxed text-muted">
            The AI builds the environment around your product. Your original product pixels are layered back on top, so labels and logos stay exactly as photographed.
          </p>
        </>
      )}

      <div className="grid gap-4 border-t border-line pt-5">
        <Row label="Format">
          <Segmented size="sm" value={aspect} onChange={setAspect} options={ASPECT_OPTIONS} />
        </Row>
        <Row label="Placement">
          <Segmented
            size="sm"
            value={layout}
            onChange={setLayout}
            options={[
              { value: "standing", label: "Standing" },
              { value: "floating", label: "Floating" },
              { value: "flatlay", label: "Flat lay" },
            ]}
          />
        </Row>
        <Row label="Variations">
          {mode === "studio" ? (
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => n <= maxVariations && setVariations(n)}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg text-[13px] font-medium transition",
                    variations === n ? "bg-ink text-white" : "bg-subtle text-ink-2 hover:bg-line",
                    n > maxVariations && "cursor-not-allowed opacity-40",
                  )}
                  title={n > maxVariations ? "More variations with a paid plan" : undefined}
                >
                  {n > maxVariations ? <Lock className="size-3" /> : n}
                </button>
              ))}
            </div>
          ) : (
            <Segmented size="sm" value={String(aiVariations)} onChange={(v) => setAiVariations(Number(v))} options={[{ value: "1", label: "1" }, { value: "2", label: "2" }]} />
          )}
        </Row>
      </div>

      {mode === "studio" && (
        <div className="rounded-2xl border border-line">
          <button className="flex w-full items-center justify-between px-4 py-3 text-[13px] font-medium" onClick={() => setAdvanced((a) => !a)}>
            Lighting, shadow & color
            <ChevronDown className={cn("size-4 text-faint transition", advanced && "rotate-180")} />
          </button>
          {advanced && (
            <div className="grid gap-4 border-t border-line px-4 py-4">
              <Row label="Backdrop tint">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setTint(null)}
                    className={cn("h-6 rounded-full border px-2 text-[11px]", !tint ? "border-ink bg-ink text-white" : "border-line text-muted")}
                  >
                    Style
                  </button>
                  {TINTS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setTint(c)}
                      className={cn("size-6 rounded-full border border-black/10 transition", tint === c && "ring-2 ring-iris-500 ring-offset-2")}
                      style={{ background: c }}
                      aria-label={`Tint ${c}`}
                    />
                  ))}
                  <label className="relative size-6 cursor-pointer overflow-hidden rounded-full border border-dashed border-line-strong" title="Custom color">
                    <input type="color" className="absolute inset-0 size-full cursor-pointer opacity-0" onChange={(e) => setTint(e.target.value)} />
                    <span className="flex size-full items-center justify-center text-[11px] text-muted">+</span>
                  </label>
                </div>
              </Row>
              <Row label="Shadow">
                <select className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px]" value={shadow} onChange={(e) => setShadow(e.target.value as ShadowKind | "auto")}>
                  <option value="auto">Style default</option>
                  <option value="contact">Contact</option>
                  <option value="soft">Soft cast</option>
                  <option value="hard">Hard (sunlight)</option>
                  <option value="drop">Drop</option>
                  <option value="none">None</option>
                </select>
              </Row>
              <Row label="Shadow strength">
                <div className="w-36">
                  <Slider value={strength} onChange={setStrength} min={0.2} max={1.6} step={0.1} label="Shadow strength" />
                </div>
              </Row>
              <Row label="Light from">
                <Segmented size="sm" value={light} onChange={setLight} options={[{ value: "-1", label: "Left" }, { value: "0", label: "Front" }, { value: "1", label: "Right" }]} />
              </Row>
              <Row label="Reflection">
                <Segmented size="sm" value={reflection} onChange={setReflection} options={[{ value: "auto", label: "Auto" }, { value: "on", label: "On" }, { value: "off", label: "Off" }]} />
              </Row>
              <Row label="Product size">
                <div className="w-36">
                  <Slider value={scale} onChange={setScale} min={0.6} max={1.4} step={0.05} label="Product size" />
                </div>
              </Row>
            </div>
          )}
        </div>
      )}

      <Button
        size="lg"
        variant="accent"
        className="w-full"
        loading={busy}
        disabled={!cutoutId || (mode === "ai" && !caps?.aiScenes)}
        onClick={generate}
        icon={<Sparkles className="size-4" />}
      >
        Generate {mode === "studio" ? `${variations} ${variations === 1 ? "image" : "images"}` : `AI scene${aiVariations > 1 ? "s" : ""}`}
        <span className="ml-1 rounded-md bg-white/20 px-1.5 py-0.5 text-xs">{cost} cr</span>
      </Button>
      {!cutoutId && <p className="-mt-3 text-center text-xs text-muted">Available once the background is removed.</p>}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition",
        active ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:border-line-strong",
      )}
    >
      {children}
    </button>
  );
}

function StyleTile({
  name,
  swatch,
  thumb,
  active,
  onClick,
  ai,
}: {
  name: string;
  swatch: string;
  thumb: string | null;
  active: boolean;
  onClick: () => void;
  ai?: boolean;
}) {
  return (
    <button onClick={onClick} className="group text-left" aria-pressed={active}>
      <div
        className={cn(
          "relative aspect-square overflow-hidden rounded-xl border transition",
          active ? "border-transparent ring-2 ring-iris-500 ring-offset-2" : "border-line group-hover:border-line-strong",
        )}
        style={{ background: swatch }}
      >
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="absolute inset-x-[18%] bottom-[12%] h-[62%] w-[64%] object-contain drop-shadow-[0_6px_6px_rgba(0,0,0,0.25)]" />
        )}
        {ai && (
          <span className="absolute top-1.5 left-1.5">
            <Badge tone="dark" className="px-1.5 text-[9px]">AI</Badge>
          </span>
        )}
      </div>
      <p className={cn("mt-1.5 truncate text-[11.5px]", active ? "font-semibold text-ink" : "text-muted")}>{name}</p>
    </button>
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
