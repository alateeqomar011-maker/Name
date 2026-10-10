"use client";

import { FolderInput, ImageIcon, MoreHorizontal, Pencil, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { api, useApi, type ProjectDto } from "@/lib/client/api";
import { cn, timeAgo } from "@/lib/utils";

export function ProjectCard({ project, onChange }: { project: ProjectDto; onChange?: () => void }) {
  const toast = useToast();
  const [rename, setRename] = useState(false);
  const [move, setMove] = useState(false);
  const [name, setName] = useState(project.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: folders } = useApi<{ items: { id: string; name: string }[] }>(move ? "/api/folders" : null);
  const [folderId, setFolderId] = useState(project.folderId ?? "");

  const patch = async (body: Record<string, unknown>) => {
    await api(`/api/projects/${project.id}`, { method: "PATCH", json: body });
    onChange?.();
  };

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-line bg-surface shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
      <Link href={`/app/studio/${project.id}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-subtle">
          {project.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={project.coverUrl} alt={project.name} loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-[1.03]" />
          ) : (
            <div className="flex size-full items-center justify-center text-faint">
              <ImageIcon className="size-8" />
            </div>
          )}
        </div>
        <div className="px-3.5 pt-3 pb-3.5">
          <p className="truncate text-sm font-semibold">{project.name}</p>
          <p className="mt-0.5 text-xs text-muted">
            {project.assetCount !== undefined ? `${project.assetCount} images · ` : ""}
            {timeAgo(project.updatedAt)}
          </p>
        </div>
      </Link>
      <button
        onClick={() => patch({ favorite: !project.favorite })}
        className={cn(
          "absolute top-2.5 left-2.5 flex size-8 items-center justify-center rounded-full bg-white/90 shadow-soft backdrop-blur transition",
          project.favorite ? "text-gold-400 opacity-100" : "text-faint opacity-0 group-hover:opacity-100 hover:text-ink",
        )}
        aria-label={project.favorite ? "Remove from favorites" : "Add to favorites"}
      >
        <Star className={cn("size-4", project.favorite && "fill-current")} />
      </button>
      <div className="absolute top-2.5 right-2.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <Menu
          trigger={
            <button className="flex size-8 items-center justify-center rounded-full bg-white/90 text-ink-2 shadow-soft backdrop-blur" aria-label="Project actions">
              <MoreHorizontal className="size-4" />
            </button>
          }
        >
          <MenuItem icon={<Pencil />} onSelect={() => setRename(true)}>
            Rename
          </MenuItem>
          <MenuItem icon={<FolderInput />} onSelect={() => setMove(true)}>
            Move to folder
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 />} danger onSelect={() => setConfirmDelete(true)}>
            Delete project
          </MenuItem>
        </Menu>
      </div>

      <Dialog
        open={rename}
        onOpenChange={setRename}
        title="Rename project"
        size="sm"
        footer={
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await patch({ name });
              setBusy(false);
              setRename(false);
            }}
          >
            Save
          </Button>
        }
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={120} />
      </Dialog>

      <Dialog
        open={move}
        onOpenChange={setMove}
        title="Move to folder"
        size="sm"
        footer={
          <Button
            onClick={async () => {
              await patch({ folderId: folderId || null });
              setMove(false);
              toast.success("Project moved");
            }}
          >
            Move
          </Button>
        }
      >
        <Select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
          <option value="">No folder</option>
          {folders?.items.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
        {folders && !folders.items.length && <p className="mt-2 text-xs text-muted">Create folders from the Gallery.</p>}
      </Dialog>

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this project?"
        description="The original photo and every image and text generated for it will be permanently deleted."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                await api(`/api/projects/${project.id}`, { method: "DELETE" });
                setBusy(false);
                setConfirmDelete(false);
                toast.success("Project deleted");
                onChange?.();
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}
