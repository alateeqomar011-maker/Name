"use client";

import { CheckSquare, Download, FileText, Folder, FolderPlus, Images, MoreHorizontal, Package, Pencil, Search, Star, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "@/components/app/app-provider";
import { AssetTile } from "@/components/app/asset-tile";
import { CopyButton } from "@/components/app/copy-button";
import { ProjectCard } from "@/components/app/project-card";
import { PageHeader } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Badge, EmptyState, Segmented, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api, downloadZip, useApi, type AssetDto, type ProjectDto } from "@/lib/client/api";
import type { CampaignOutput, DescriptionOutput, SocialOutput } from "@/lib/copy-schemas";
import { cn, timeAgo } from "@/lib/utils";

type Tab = "images" | "texts" | "products";
type Item = AssetDto & { projectName?: string | null };

const KIND_FILTERS = [
  { value: "all", label: "All" },
  { value: "render", label: "Studio" },
  { value: "cutout", label: "Cut-outs" },
  { value: "ad,social", label: "Ads & social" },
  { value: "mockup", label: "Mockups" },
  { value: "bundle", label: "Bundles" },
  { value: "enhanced,upscaled", label: "Enhanced" },
  { value: "angle", label: "AI angles" },
];

interface CopyRow {
  id: string;
  kind: string;
  title: string;
  language: string;
  tone: string | null;
  favorite: boolean;
  folderId: string | null;
  projectName: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export function Gallery() {
  const toast = useToast();
  const { handleError } = useApp();
  const [tab, setTab] = useState<Tab>("images");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [favorite, setFavorite] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [newFolder, setNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTo, setMoveTo] = useState("");
  const [openCopy, setOpenCopy] = useState<CopyRow | null>(null);

  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (favorite) qs.set("favorite", "1");
  if (folder) qs.set("folder", folder);
  const { data: folders, mutate: mutateFolders } = useApi<{ items: { id: string; name: string }[] }>("/api/folders");
  const assetsKey = tab === "images" ? `/api/assets?${new URLSearchParams({ ...Object.fromEntries(qs), ...(kind !== "all" ? { kind } : {}), limit: "120" })}` : null;
  const { data: assets, mutate: mutateAssets, isLoading: loadingAssets } = useApi<{ items: Item[]; hasMore: boolean }>(assetsKey);
  const { data: copies, mutate: mutateCopies } = useApi<{ items: CopyRow[] }>(tab === "texts" ? `/api/copies?${qs}` : null);
  const { data: projects, mutate: mutateProjects } = useApi<{ items: ProjectDto[] }>(tab === "products" ? `/api/projects?limit=100&${qs}` : null);

  const pickedIds = useMemo(() => [...picked], [picked]);
  const togglePick = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const bulk = async (action: "favorite" | "delete" | "download" | "move") => {
    try {
      if (action === "download") {
        await downloadZip(pickedIds);
        return;
      }
      if (action === "delete" && !confirm(`Delete ${pickedIds.length} images permanently?`)) return;
      for (const id of pickedIds) {
        if (action === "favorite") await api(`/api/assets/${id}`, { method: "PATCH", json: { favorite: true } });
        if (action === "delete") await api(`/api/assets/${id}`, { method: "DELETE" });
        if (action === "move") await api(`/api/assets/${id}`, { method: "PATCH", json: { folderId: moveTo || null } });
      }
      toast.success(action === "delete" ? "Deleted" : action === "move" ? "Moved" : "Added to favorites");
      setPicked(new Set());
      setMoveOpen(false);
      mutateAssets();
    } catch (err) {
      handleError(err, "Action failed");
    }
  };

  return (
    <div>
      <PageHeader title="Gallery" description="Everything you've created — searchable, organized in folders, and ready to download." />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="grid content-start gap-1">
          <button onClick={() => setFolder(null)} className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-sm", !folder ? "bg-surface font-semibold shadow-soft" : "text-muted hover:bg-white/60")}>
            <Images className="size-4" /> All
          </button>
          {folders?.items.map((f) => (
            <div key={f.id} className={cn("group flex items-center rounded-xl", folder === f.id ? "bg-surface shadow-soft" : "hover:bg-white/60")}>
              <button onClick={() => setFolder(f.id)} className={cn("flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-sm", folder === f.id ? "font-semibold" : "text-muted")}>
                <Folder className="size-4 shrink-0" /> <span className="truncate">{f.name}</span>
              </button>
              <Menu trigger={<button className="mr-1 rounded-lg p-1 text-faint opacity-0 group-hover:opacity-100" aria-label="Folder actions"><MoreHorizontal className="size-4" /></button>}>
                <MenuItem icon={<Pencil />} onSelect={async () => { const name = prompt("Rename folder", f.name); if (name?.trim()) { await api(`/api/folders/${f.id}`, { method: "PATCH", json: { name } }); mutateFolders(); } }}>Rename</MenuItem>
                <MenuItem icon={<Trash2 />} danger onSelect={async () => { if (confirm(`Delete folder "${f.name}"? Its contents stay in your gallery.`)) { await api(`/api/folders/${f.id}`, { method: "DELETE" }); if (folder === f.id) setFolder(null); mutateFolders(); } }}>Delete folder</MenuItem>
              </Menu>
            </div>
          ))}
          <button onClick={() => setNewFolder(true)} className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-iris-600 hover:bg-iris-50">
            <FolderPlus className="size-4" /> New folder
          </button>
        </aside>

        <div className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Segmented
              value={tab}
              onChange={(t) => { setTab(t); setSelecting(false); setPicked(new Set()); }}
              options={[
                { value: "images", label: <span className="flex items-center gap-1.5"><Images className="size-3.5" /> Images</span> },
                { value: "texts", label: <span className="flex items-center gap-1.5"><FileText className="size-3.5" /> Texts</span> },
                { value: "products", label: <span className="flex items-center gap-1.5"><Package className="size-3.5" /> Products</span> },
              ]}
            />
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by product, style or title" className="pl-9" />
            </div>
            <Button variant={favorite ? "soft" : "secondary"} size="md" icon={<Star className={cn("size-4", favorite && "fill-current")} />} onClick={() => setFavorite((f) => !f)}>
              Favorites
            </Button>
          </div>

          {tab === "images" && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
                  {KIND_FILTERS.map((k) => (
                    <button key={k.value} onClick={() => setKind(k.value)} className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-medium", kind === k.value ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2")}>
                      {k.label}
                    </button>
                  ))}
                </div>
                <Button size="sm" variant={selecting ? "soft" : "ghost"} icon={<CheckSquare className="size-4" />} onClick={() => { setSelecting((s) => !s); setPicked(new Set()); }}>
                  {selecting ? "Done" : "Select"}
                </Button>
              </div>
              {selecting && picked.size > 0 && (
                <div className="sticky top-20 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-2.5 shadow-lift">
                  <span className="px-2 text-sm font-semibold">{picked.size} selected</span>
                  <div className="flex-1" />
                  <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={() => bulk("download")}>Download ZIP</Button>
                  <Button size="sm" variant="secondary" icon={<Folder className="size-4" />} onClick={() => setMoveOpen(true)}>Move</Button>
                  <Button size="sm" variant="secondary" icon={<Star className="size-4" />} onClick={() => bulk("favorite")}>Favorite</Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => bulk("delete")}>Delete</Button>
                  <button onClick={() => setPicked(new Set())} className="rounded-lg p-1.5 text-muted hover:bg-subtle" aria-label="Clear selection"><X className="size-4" /></button>
                </div>
              )}
              {loadingAssets ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="aspect-[5/6]" />)}</div>
              ) : assets?.items.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {assets.items.map((a) => (
                    <div key={a.id} className="relative">
                      <AssetTile
                        asset={a}
                        showProject
                        selected={picked.has(a.id)}
                        onSelect={() => (selecting ? togglePick(a.id) : window.open(`/api/assets/${a.id}/file?w=2048`, "_blank"))}
                        onChange={() => mutateAssets()}
                      />
                      {selecting && (
                        <span className={cn("pointer-events-none absolute bottom-12 left-2 flex size-5 items-center justify-center rounded-md border-2", picked.has(a.id) ? "border-iris-500 bg-iris-500 text-white" : "border-white bg-white/70")}>
                          {picked.has(a.id) && <CheckSquare className="size-3" />}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={<Images className="size-6" />} title={q || favorite || folder || kind !== "all" ? "Nothing matches these filters" : "Your gallery is empty"} description="Generated studio photos, ads, social posts and mockups appear here." />
              )}
            </>
          )}

          {tab === "texts" && (
            copies?.items.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {copies.items.map((c) => (
                  <button key={c.id} onClick={() => setOpenCopy(c)} className="rounded-2xl border border-line bg-surface p-4 text-left shadow-soft transition hover:shadow-lift">
                    <div className="flex items-center gap-2">
                      <Badge tone="iris">{c.kind.replace("_", " ")}</Badge>
                      <Badge tone={c.language === "ar" ? "gold" : "neutral"}>{c.language.toUpperCase()}</Badge>
                      {c.favorite && <Star className="size-3.5 fill-gold-400 text-gold-400" />}
                      <span className="ml-auto text-xs text-faint">{timeAgo(c.createdAt)}</span>
                    </div>
                    <p className="mt-2.5 line-clamp-1 font-semibold" dir="auto">{c.title}</p>
                    <p className="text-xs text-muted">{c.projectName ?? "Workspace"}</p>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState icon={<FileText className="size-6" />} title="No saved texts" description="Descriptions, captions, ad copy and campaigns you generate are saved here." />
            )
          )}

          {tab === "products" && (
            projects?.items.length ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {projects.items.map((p) => <ProjectCard key={p.id} project={p} onChange={() => mutateProjects()} />)}
              </div>
            ) : (
              <EmptyState icon={<Package className="size-6" />} title="No products here" description="Upload products in the Photo Studio." />
            )
          )}
        </div>
      </div>

      <Dialog open={newFolder} onOpenChange={setNewFolder} title="New folder" size="sm" footer={
        <Button onClick={async () => { if (!folderName.trim()) return; await api("/api/folders", { method: "POST", json: { name: folderName } }); setFolderName(""); setNewFolder(false); mutateFolders(); }}>Create</Button>
      }>
        <Input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="e.g. Summer campaign" autoFocus maxLength={60} />
      </Dialog>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen} title={`Move ${picked.size} images`} size="sm" footer={<Button onClick={() => bulk("move")}>Move</Button>}>
        <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
          <option value="">No folder</option>
          {folders?.items.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
      </Dialog>

      <Dialog open={Boolean(openCopy)} onOpenChange={(o) => !o && setOpenCopy(null)} title={openCopy?.title ?? ""} description={openCopy ? `${openCopy.kind.replace("_", " ")} · ${openCopy.projectName ?? ""}` : undefined} size="lg"
        footer={openCopy && (
          <>
            <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={async () => { if (confirm("Delete this text?")) { await api(`/api/copies/${openCopy.id}`, { method: "DELETE" }); setOpenCopy(null); mutateCopies(); } }}>Delete</Button>
            <Button variant="secondary" icon={<Star className="size-4" />} onClick={async () => { await api(`/api/copies/${openCopy.id}`, { method: "PATCH", json: { favorite: !openCopy.favorite } }); setOpenCopy({ ...openCopy, favorite: !openCopy.favorite }); mutateCopies(); }}>{openCopy.favorite ? "Unfavorite" : "Favorite"}</Button>
          </>
        )}>
        {openCopy && <CopyPreview copy={openCopy} />}
      </Dialog>
    </div>
  );
}

function plainText(copy: CopyRow): string {
  const d = copy.data;
  if (copy.kind === "description") {
    const x = d as unknown as DescriptionOutput;
    return [x.titles[0], "", x.description, "", ...x.features.map((f) => `• ${f}`)].join("\n");
  }
  if (copy.kind === "social") {
    const x = d as unknown as SocialOutput;
    return x.posts.map((p) => `[${p.platform}]\n${p.caption}\n${p.hashtags.join(" ")}`).join("\n\n");
  }
  if (copy.kind === "campaign") {
    const x = d as unknown as CampaignOutput;
    return [x.name, x.tagline, "", x.bigIdea, "", ...x.schedule.map((s) => `Day ${s.day} · ${s.platform}: ${s.caption}`)].join("\n");
  }
  if (copy.kind === "ad_copy") {
    const x = d as { variants?: { headline: string; subheadline: string; cta: string }[] };
    return (x.variants ?? []).map((v) => `${v.headline}\n${v.subheadline}\n${v.cta}`).join("\n\n");
  }
  return JSON.stringify(d, null, 2);
}

function CopyPreview({ copy }: { copy: CopyRow }) {
  const text = plainText(copy);
  return (
    <div>
      <div className="mb-2 flex justify-end"><CopyButton text={text} label="Copy text" /></div>
      <pre dir="auto" className="rounded-2xl bg-subtle p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap">{text}</pre>
    </div>
  );
}
