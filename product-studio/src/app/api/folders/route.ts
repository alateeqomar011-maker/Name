import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { folders } from "@/server/db/schema";
import { json, parseJson, route } from "@/server/http";
import { newId } from "@/server/ids";

export const GET = route(async () => {
  const auth = await requireAuth();
  const db = await getDb();
  const rows = await db.select().from(folders).where(eq(folders.workspaceId, auth.workspace.id)).orderBy(asc(folders.name));
  return json({ items: rows.map((f) => ({ id: f.id, name: f.name })) });
});

const schema = z.object({ name: z.string().trim().min(1).max(60) });

export const POST = route(async (req) => {
  const auth = await requireAuth();
  const { name } = await parseJson(req, schema);
  const db = await getDb();
  const id = newId("fld");
  await db.insert(folders).values({ id, workspaceId: auth.workspace.id, name });
  return json({ folder: { id, name } }, { status: 201 });
});
