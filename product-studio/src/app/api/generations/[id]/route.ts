import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { generations } from "@/server/db/schema";
import { generationDto } from "@/server/generations";
import { json, notFound, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  const db = await getDb();
  const rows = await db
    .select()
    .from(generations)
    .where(and(eq(generations.id, id), eq(generations.workspaceId, auth.workspace.id)))
    .limit(1);
  if (!rows[0]) throw notFound("Generation not found.");
  return json({ generation: generationDto(rows[0]) });
});
