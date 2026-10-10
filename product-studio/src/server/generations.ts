import "server-only";
import { and, eq } from "drizzle-orm";
import { GENERATION_TYPES, type GenerationType } from "@/lib/generation-types";
import { getPlan } from "@/lib/plans";
import type { AuthContext } from "./auth/session";
import { unavailableReason } from "./capabilities";
import { chargeCredits } from "./credits";
import { getDb } from "./db";
import { generations, projects, type Generation } from "./db/schema";
import { HttpError, notFound, rateLimit } from "./http";
import { newId } from "./ids";
import { enqueue, workerId } from "./jobs/queue";

export interface CreateGenerationInput {
  type: GenerationType;
  projectId?: string | null;
  params: Record<string, unknown>;
  /** Override for per-unit pricing (e.g. number of variations). */
  cost?: number;
  parentId?: string | null;
  provider?: string | null;
}

/**
 * Validates availability and plan access, charges credits and queues the job —
 * all-or-nothing: if charging fails no job is created.
 */
export async function createGeneration(auth: AuthContext, input: CreateGenerationInput): Promise<Generation> {
  const info = GENERATION_TYPES[input.type];
  if (!info) throw new HttpError(400, "Unknown generation type.");

  const reason = unavailableReason(input.type);
  if (reason) throw new HttpError(503, reason, "service_unavailable");

  const plan = getPlan(auth.workspace.plan);
  if (info.advanced && !plan.limits.advancedTools) {
    throw new HttpError(403, `${info.label} is part of the Pro and Business plans.`, "upgrade_required", {
      requiredPlan: "pro",
    });
  }

  rateLimit(`gen:${auth.user.id}`, 40, 60_000);

  const db = await getDb();
  if (input.projectId) {
    const p = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.workspaceId, auth.workspace.id)))
      .limit(1);
    if (!p[0]) throw notFound("Project not found.");
  }

  const cost = input.cost ?? info.cost;
  const id = newId("gen");
  const gen = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(generations)
      .values({
        id,
        workspaceId: auth.workspace.id,
        projectId: input.projectId ?? null,
        userId: auth.user.id,
        parentId: input.parentId ?? null,
        type: input.type,
        status: "queued",
        params: input.params,
        creditsCharged: cost,
        provider: input.provider ?? null,
        workerId: workerId(),
        heartbeatAt: new Date(),
        stage: "Queued",
      })
      .returning();
    await chargeCredits(
      { workspaceId: auth.workspace.id, userId: auth.user.id, amount: cost, generationId: id, note: info.label },
      tx,
    );
    return row;
  });
  enqueue(gen.id, input.type);
  return gen;
}

export function generationDto(g: Generation) {
  return {
    id: g.id,
    type: g.type,
    status: g.status,
    progress: g.progress,
    stage: g.stage,
    projectId: g.projectId,
    params: g.params,
    result: g.result,
    error: g.error,
    creditsCharged: g.creditsCharged,
    refunded: g.refunded,
    provider: g.provider,
    createdAt: g.createdAt.toISOString(),
    finishedAt: g.finishedAt?.toISOString() ?? null,
  };
}

export type GenerationDto = ReturnType<typeof generationDto>;
