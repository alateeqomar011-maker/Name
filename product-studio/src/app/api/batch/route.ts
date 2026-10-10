import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { GENERATION_TYPES } from "@/lib/generation-types";
import { getPlan } from "@/lib/plans";
import { ASPECTS, STYLE_MAP, type AspectId } from "@/lib/studio-styles";
import { requireAuth } from "@/server/auth/session";
import { unavailableReason } from "@/server/capabilities";
import { getDb } from "@/server/db";
import { projects } from "@/server/db/schema";
import { createGeneration, generationDto } from "@/server/generations";
import { HttpError, json, parseJson, route } from "@/server/http";

const schema = z.object({
  projectIds: z.array(z.string().max(64)).min(1).max(100),
  styleId: z.string().refine((s) => STYLE_MAP[s]?.kind === "procedural", "Unknown studio style"),
  aspect: z.enum(Object.keys(ASPECTS) as [AspectId, ...AspectId[]]),
  layout: z.enum(["standing", "floating", "flatlay"]),
});

/** Batch processing: background removal + one studio render for each photo. */
export const POST = route(async (req) => {
  const auth = await requireAuth();
  const body = await parseJson(req, schema);
  const plan = getPlan(auth.workspace.plan);
  if (plan.limits.batchMaxItems === 0) {
    throw new HttpError(403, "Batch processing is part of the Business plan.", "upgrade_required", { requiredPlan: "business" });
  }
  if (body.projectIds.length > plan.limits.batchMaxItems) {
    throw new HttpError(422, `Your plan processes up to ${plan.limits.batchMaxItems} photos per batch.`);
  }
  const reason = unavailableReason("cutout");
  if (reason) throw new HttpError(503, reason, "service_unavailable");
  const db = await getDb();
  const rows = await db
    .select({ id: projects.id, originalAssetId: projects.originalAssetId })
    .from(projects)
    .where(and(eq(projects.workspaceId, auth.workspace.id), inArray(projects.id, body.projectIds)));
  const items = rows.filter((r) => r.originalAssetId).map((r) => ({ projectId: r.id, originalAssetId: r.originalAssetId! }));
  if (!items.length) throw new HttpError(400, "None of these products has a photo to process.");
  const perItemCost = GENERATION_TYPES.cutout.cost + GENERATION_TYPES.studio.cost;
  const gen = await createGeneration(auth, {
    type: "batch",
    params: { items, styleId: body.styleId, aspect: body.aspect, layout: body.layout, perItemCost },
    cost: items.length * perItemCost,
  });
  return json({ generation: generationDto(gen) }, { status: 201 });
});
