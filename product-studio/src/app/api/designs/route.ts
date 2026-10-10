import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { designs } from "@/server/db/schema";
import { designDto } from "@/server/designs";
import { json, parseJson, route } from "@/server/http";
import { newId } from "@/server/ids";
import { getProject } from "@/server/projects";

export const GET = route(async (req) => {
  const auth = await requireAuth();
  const url = new URL(req.url);
  const db = await getDb();
  const where = [eq(designs.workspaceId, auth.workspace.id)];
  const projectId = url.searchParams.get("projectId");
  if (projectId) where.push(eq(designs.projectId, projectId));
  const rows = await db
    .select()
    .from(designs)
    .where(and(...where))
    .orderBy(desc(designs.updatedAt))
    .limit(100);
  return json({ items: rows.map((d) => designDto(d, false)) });
});

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  formatId: z.string().max(40),
  width: z.number().int().min(100).max(4096),
  height: z.number().int().min(100).max(4096),
  projectId: z.string().max(64).nullable().optional(),
  doc: z.record(z.string(), z.unknown()),
});

export const POST = route(async (req) => {
  const auth = await requireAuth();
  const body = await parseJson(req, schema);
  if (JSON.stringify(body.doc).length > 500_000) throw new Error("Design too large");
  if (body.projectId) await getProject(auth.workspace.id, body.projectId);
  const db = await getDb();
  const [row] = await db
    .insert(designs)
    .values({
      id: newId("dsn"),
      workspaceId: auth.workspace.id,
      projectId: body.projectId ?? null,
      createdBy: auth.user.id,
      name: body.name,
      formatId: body.formatId,
      width: body.width,
      height: body.height,
      doc: body.doc,
    })
    .returning();
  return json({ design: designDto(row, true) }, { status: 201 });
});
