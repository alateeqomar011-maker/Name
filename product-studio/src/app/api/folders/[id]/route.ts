import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { assets, copies, designs, folders, projects } from "@/server/db/schema";
import { json, parseJson, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ name: z.string().trim().min(1).max(60) });

export const PATCH = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  const { name } = await parseJson(req, schema);
  const db = await getDb();
  await db.update(folders).set({ name }).where(and(eq(folders.id, id), eq(folders.workspaceId, auth.workspace.id)));
  return json({ ok: true });
});

/** Deleting a folder keeps its contents (they move back to "All"). */
export const DELETE = route<Ctx>(async (_req, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  const db = await getDb();
  await db.transaction(async (tx) => {
    for (const table of [projects, assets, copies, designs]) {
      await tx
        .update(table)
        .set({ folderId: null })
        .where(and(eq(table.folderId, id), eq(table.workspaceId, auth.workspace.id)));
    }
    await tx.delete(folders).where(and(eq(folders.id, id), eq(folders.workspaceId, auth.workspace.id)));
  });
  return json({ ok: true });
});
