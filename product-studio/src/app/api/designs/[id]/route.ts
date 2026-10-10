import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { designs } from "@/server/db/schema";
import { designDto, getDesign } from "@/server/designs";
import { json, parseJson, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  return json({ design: designDto(await getDesign(auth.workspace.id, id), true) });
});

const schema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  favorite: z.boolean().optional(),
  folderId: z.string().max(64).nullable().optional(),
  formatId: z.string().max(40).optional(),
  width: z.number().int().min(100).max(4096).optional(),
  height: z.number().int().min(100).max(4096).optional(),
  doc: z.record(z.string(), z.unknown()).optional(),
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  await getDesign(auth.workspace.id, id);
  const body = await parseJson(req, schema);
  if (body.doc && JSON.stringify(body.doc).length > 500_000) throw new Error("Design too large");
  const db = await getDb();
  const [row] = await db
    .update(designs)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(designs.id, id), eq(designs.workspaceId, auth.workspace.id)))
    .returning();
  return json({ design: designDto(row, false) });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  const db = await getDb();
  await db.delete(designs).where(and(eq(designs.id, id), eq(designs.workspaceId, auth.workspace.id)));
  return json({ ok: true });
});
