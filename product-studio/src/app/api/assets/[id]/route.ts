import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { assetDto, getAsset } from "@/server/assets";
import { requireAuth } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { assets, projects } from "@/server/db/schema";
import { json, parseJson, route } from "@/server/http";
import { clearRenditionCache } from "@/server/imaging/renditions";
import { storage } from "@/server/storage";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  return json({ asset: assetDto(await getAsset(auth.workspace.id, id)) });
});

const schema = z.object({
  favorite: z.boolean().optional(),
  folderId: z.string().max(64).nullable().optional(),
  label: z.string().trim().max(120).optional(),
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  await getAsset(auth.workspace.id, id);
  const body = await parseJson(req, schema);
  const db = await getDb();
  const [row] = await db
    .update(assets)
    .set(body)
    .where(and(eq(assets.id, id), eq(assets.workspaceId, auth.workspace.id)))
    .returning();
  return json({ asset: assetDto(row) });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  const asset = await getAsset(auth.workspace.id, id);
  const db = await getDb();
  await db.delete(assets).where(and(eq(assets.id, id), eq(assets.workspaceId, auth.workspace.id)));
  // Keep projects consistent if a referenced image is removed.
  if (asset.projectId) {
    const [p] = await db.select().from(projects).where(eq(projects.id, asset.projectId)).limit(1);
    if (p) {
      const patch: Partial<typeof p> = {};
      if (p.coverAssetId === id) patch.coverAssetId = p.originalAssetId === id ? null : p.originalAssetId;
      if (p.cutoutAssetId === id) patch.cutoutAssetId = null;
      if (p.originalAssetId === id) patch.originalAssetId = null;
      if (Object.keys(patch).length) await db.update(projects).set(patch).where(eq(projects.id, p.id));
    }
  }
  await storage().delete(asset.storageKey).catch(() => {});
  await clearRenditionCache(id).catch(() => {});
  return json({ ok: true });
});
