import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getPlan } from "@/lib/plans";
import { requireAuth } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { brandKits, generations } from "@/server/db/schema";
import { validateGeneration } from "@/server/generation-params";
import { createGeneration, generationDto } from "@/server/generations";
import { HttpError, json, parseJson, route } from "@/server/http";

export const GET = route(async (req) => {
  const auth = await requireAuth();
  const url = new URL(req.url);
  const db = await getDb();
  const where = [eq(generations.workspaceId, auth.workspace.id)];
  const projectId = url.searchParams.get("projectId");
  if (projectId) where.push(eq(generations.projectId, projectId));
  const type = url.searchParams.get("type");
  if (type) where.push(inArray(generations.type, type.split(",").slice(0, 10)));
  const rows = await db
    .select()
    .from(generations)
    .where(and(...where))
    .orderBy(desc(generations.createdAt))
    .limit(Math.min(100, Number(url.searchParams.get("limit") ?? 40)));
  return json({ items: rows.map(generationDto) });
});

const schema = z.object({
  type: z.string().max(30),
  projectId: z.string().max(64).nullable().optional(),
  params: z.record(z.string(), z.unknown()).default({}),
});

export const POST = route(async (req) => {
  const auth = await requireAuth();
  const body = await parseJson(req, schema);
  const { type, params, cost } = validateGeneration(auth, body.type, body.params);

  if (type === "brand_kit") {
    const limit = getPlan(auth.workspace.plan).limits.brandKits;
    if (limit === 0) {
      throw new HttpError(403, "Brand kits are part of the Pro and Business plans.", "upgrade_required", { requiredPlan: "pro" });
    }
    if (limit > 0) {
      const db = await getDb();
      const [{ value }] = await db.select({ value: count() }).from(brandKits).where(eq(brandKits.workspaceId, auth.workspace.id));
      if (Number(value) >= limit) {
        throw new HttpError(403, `Your plan includes ${limit} brand kit. Delete it or upgrade to Business for unlimited kits.`, "upgrade_required", {
          requiredPlan: "business",
        });
      }
    }
  }

  const needsProject = !["brand_kit", "bundle"].includes(type);
  if (needsProject && !body.projectId) throw new HttpError(400, "Choose a product first.");
  const gen = await createGeneration(auth, { type, projectId: body.projectId ?? null, params, cost });
  return json({ generation: generationDto(gen) }, { status: 201 });
});
