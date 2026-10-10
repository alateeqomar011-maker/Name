import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { brandKits } from "@/server/db/schema";
import { json, notFound, parseJson, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  const body = await parseJson(req, schema);
  if (body.data && JSON.stringify(body.data).length > 100_000) throw new Error("Brand kit too large");
  const db = await getDb();
  const [row] = await db
    .update(brandKits)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(brandKits.id, id), eq(brandKits.workspaceId, auth.workspace.id)))
    .returning();
  if (!row) throw notFound();
  return json({ ok: true });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  const db = await getDb();
  await db.delete(brandKits).where(and(eq(brandKits.id, id), eq(brandKits.workspaceId, auth.workspace.id)));
  return json({ ok: true });
});
