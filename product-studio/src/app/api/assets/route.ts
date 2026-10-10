import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { assetDto } from "@/server/assets";
import { requireAuth } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { assets, projects } from "@/server/db/schema";
import { json, route } from "@/server/http";

const OUTPUT_KINDS = ["render", "enhanced", "upscaled", "angle", "mockup", "bundle", "ad", "social", "cutout"];

export const GET = route(async (req) => {
  const auth = await requireAuth();
  const url = new URL(req.url);
  const db = await getDb();
  const where = [eq(assets.workspaceId, auth.workspace.id)];
  const kind = url.searchParams.get("kind");
  if (kind && kind !== "all") where.push(inArray(assets.kind, kind.split(",").slice(0, 10) as never[]));
  else where.push(inArray(assets.kind, OUTPUT_KINDS as never[]));
  if (url.searchParams.get("favorite") === "1") where.push(eq(assets.favorite, true));
  const folder = url.searchParams.get("folder");
  if (folder) where.push(eq(assets.folderId, folder));
  const projectId = url.searchParams.get("projectId");
  if (projectId) where.push(eq(assets.projectId, projectId));
  const q = url.searchParams.get("q")?.trim().slice(0, 100);
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    where.push(or(ilike(assets.label, like), ilike(projects.name, like), sql`${assets.meta}->>'styleName' ilike ${like}`)!);
  }
  const limit = Math.min(120, Number(url.searchParams.get("limit") ?? 60));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
  const rows = await db
    .select({ asset: assets, projectName: projects.name })
    .from(assets)
    .leftJoin(projects, eq(projects.id, assets.projectId))
    .where(and(...where))
    .orderBy(desc(assets.createdAt))
    .limit(limit + 1)
    .offset(offset);
  return json({
    items: rows.slice(0, limit).map((r) => ({ ...assetDto(r.asset), projectName: r.projectName })),
    hasMore: rows.length > limit,
  });
});
