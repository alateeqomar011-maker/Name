import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { requireAuth } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { copies, projects } from "@/server/db/schema";
import { json, route } from "@/server/http";

export const GET = route(async (req) => {
  const auth = await requireAuth();
  const url = new URL(req.url);
  const db = await getDb();
  const where = [eq(copies.workspaceId, auth.workspace.id)];
  const kind = url.searchParams.get("kind");
  if (kind) where.push(inArray(copies.kind, kind.split(",") as never[]));
  const projectId = url.searchParams.get("projectId");
  if (projectId) where.push(eq(copies.projectId, projectId));
  if (url.searchParams.get("favorite") === "1") where.push(eq(copies.favorite, true));
  const folder = url.searchParams.get("folder");
  if (folder) where.push(eq(copies.folderId, folder));
  const q = url.searchParams.get("q")?.trim().slice(0, 100);
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    where.push(or(ilike(copies.title, like), ilike(projects.name, like))!);
  }
  const rows = await db
    .select({ copy: copies, projectName: projects.name })
    .from(copies)
    .leftJoin(projects, eq(projects.id, copies.projectId))
    .where(and(...where))
    .orderBy(desc(copies.createdAt))
    .limit(Math.min(100, Number(url.searchParams.get("limit") ?? 50)));
  return json({
    items: rows.map(({ copy: c, projectName }) => ({
      id: c.id,
      kind: c.kind,
      title: c.title,
      language: c.language,
      tone: c.tone,
      favorite: c.favorite,
      folderId: c.folderId,
      projectId: c.projectId,
      projectName,
      data: c.data,
      createdAt: c.createdAt.toISOString(),
    })),
  });
});
