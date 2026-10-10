import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { copies } from "@/server/db/schema";
import { json, notFound, parseJson, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  favorite: z.boolean().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  folderId: z.string().max(64).nullable().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  const body = await parseJson(req, schema);
  if (body.data && JSON.stringify(body.data).length > 200_000) throw new Error("Content too large");
  const db = await getDb();
  const [row] = await db
    .update(copies)
    .set(body)
    .where(and(eq(copies.id, id), eq(copies.workspaceId, auth.workspace.id)))
    .returning();
  if (!row) throw notFound();
  return json({ ok: true });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  const db = await getDb();
  await db.delete(copies).where(and(eq(copies.id, id), eq(copies.workspaceId, auth.workspace.id)));
  return json({ ok: true });
});
