import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { assetDto } from "@/server/assets";
import { requireAuth } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { assets, copies, generations, projects } from "@/server/db/schema";
import { generationDto } from "@/server/generations";
import { json, parseJson, route } from "@/server/http";
import { deleteProject, getProject, projectDto } from "@/server/projects";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  const project = await getProject(auth.workspace.id, id);
  const db = await getDb();
  const [assetRows, genRows, copyRows] = await Promise.all([
    db.select().from(assets).where(and(eq(assets.projectId, id), eq(assets.workspaceId, auth.workspace.id))).orderBy(desc(assets.createdAt)),
    db.select().from(generations).where(and(eq(generations.projectId, id), eq(generations.workspaceId, auth.workspace.id))).orderBy(desc(generations.createdAt)).limit(50),
    db.select().from(copies).where(and(eq(copies.projectId, id), eq(copies.workspaceId, auth.workspace.id))).orderBy(desc(copies.createdAt)).limit(50),
  ]);
  return json({
    project: projectDto(project),
    assets: assetRows.map(assetDto),
    generations: genRows.map(generationDto),
    copies: copyRows.map((c) => ({
      id: c.id,
      kind: c.kind,
      title: c.title,
      language: c.language,
      tone: c.tone,
      favorite: c.favorite,
      data: c.data,
      createdAt: c.createdAt.toISOString(),
    })),
  });
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  folderId: z.string().max(64).nullable().optional(),
  favorite: z.boolean().optional(),
  coverAssetId: z.string().max(64).optional(),
  product: z
    .object({
      name: z.string().trim().max(160).optional(),
      brand: z.string().trim().max(120).optional(),
      category: z.string().trim().max(120).optional(),
      price: z.string().trim().max(40).optional(),
      currency: z.string().trim().max(10).optional(),
      facts: z.string().trim().max(4000).optional(),
      audience: z.string().trim().max(300).optional(),
      keywords: z.string().trim().max(300).optional(),
    })
    .optional(),
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  const project = await getProject(auth.workspace.id, id);
  const body = await parseJson(req, patchSchema);
  const db = await getDb();
  if (body.coverAssetId) {
    const a = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.id, body.coverAssetId), eq(assets.projectId, id)))
      .limit(1);
    if (!a[0]) delete body.coverAssetId;
  }
  const [updated] = await db
    .update(projects)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.folderId !== undefined ? { folderId: body.folderId } : {}),
      ...(body.favorite !== undefined ? { favorite: body.favorite } : {}),
      ...(body.coverAssetId ? { coverAssetId: body.coverAssetId } : {}),
      ...(body.product ? { product: { ...project.product, ...body.product } } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(projects.id, id), eq(projects.workspaceId, auth.workspace.id)))
    .returning();
  return json({ project: projectDto(updated) });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  await deleteProject(auth.workspace.id, id);
  return json({ ok: true });
});
