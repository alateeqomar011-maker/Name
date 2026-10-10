import "server-only";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import { assets, copies, designs, generations, projects, type Project } from "./db/schema";
import { notFound } from "./http";
import { clearRenditionCache } from "./imaging/renditions";
import { storage } from "./storage";

export function projectDto(p: Project, extra?: { assetCount?: number }) {
  return {
    id: p.id,
    name: p.name,
    folderId: p.folderId,
    favorite: p.favorite,
    product: p.product,
    analysis: p.analysis,
    originalAssetId: p.originalAssetId,
    cutoutAssetId: p.cutoutAssetId,
    coverAssetId: p.coverAssetId ?? p.originalAssetId,
    coverUrl: p.coverAssetId || p.originalAssetId ? `/api/assets/${p.coverAssetId ?? p.originalAssetId}/file?w=640` : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    assetCount: extra?.assetCount,
  };
}

export type ProjectDto = ReturnType<typeof projectDto>;

export async function getProject(workspaceId: string, id: string): Promise<Project> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.workspaceId, workspaceId)))
    .limit(1);
  if (!rows[0]) throw notFound("Project not found.");
  return rows[0];
}

export async function listProjects(
  workspaceId: string,
  opts: { q?: string; folderId?: string | null; favorite?: boolean; limit?: number; offset?: number },
) {
  const db = await getDb();
  const where = [eq(projects.workspaceId, workspaceId)];
  if (opts.q) {
    const like = `%${opts.q.replace(/[%_]/g, "")}%`;
    where.push(or(ilike(projects.name, like), sql`${projects.product}->>'brand' ilike ${like}`, sql`${projects.product}->>'category' ilike ${like}`)!);
  }
  if (opts.folderId) where.push(eq(projects.folderId, opts.folderId));
  if (opts.favorite) where.push(eq(projects.favorite, true));
  const rows = await db
    .select()
    .from(projects)
    .where(and(...where))
    .orderBy(desc(projects.updatedAt))
    .limit(Math.min(100, opts.limit ?? 30))
    .offset(opts.offset ?? 0);
  const counts = rows.length
    ? await db
        .select({ projectId: assets.projectId, n: sql<number>`count(*)` })
        .from(assets)
        .where(inArray(assets.projectId, rows.map((r) => r.id)))
        .groupBy(assets.projectId)
    : [];
  const byId = new Map(counts.map((c) => [c.projectId, Number(c.n)]));
  return rows.map((p) => projectDto(p, { assetCount: byId.get(p.id) ?? 0 }));
}

export async function deleteProject(workspaceId: string, id: string) {
  const db = await getDb();
  await getProject(workspaceId, id);
  const files = await db
    .select({ id: assets.id, key: assets.storageKey })
    .from(assets)
    .where(and(eq(assets.projectId, id), eq(assets.workspaceId, workspaceId)));
  await db.transaction(async (tx) => {
    await tx.delete(assets).where(and(eq(assets.projectId, id), eq(assets.workspaceId, workspaceId)));
    await tx.delete(copies).where(and(eq(copies.projectId, id), eq(copies.workspaceId, workspaceId)));
    await tx.delete(designs).where(and(eq(designs.projectId, id), eq(designs.workspaceId, workspaceId)));
    await tx
      .update(generations)
      .set({ projectId: null })
      .where(and(eq(generations.projectId, id), eq(generations.workspaceId, workspaceId)));
    await tx.delete(projects).where(and(eq(projects.id, id), eq(projects.workspaceId, workspaceId)));
  });
  for (const f of files) {
    await storage().delete(f.key).catch(() => {});
    await clearRenditionCache(f.id).catch(() => {});
  }
}
