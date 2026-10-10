import "server-only";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { DB } from "../db";
import { generations, type Generation } from "../db/schema";
import { refundGenerationCredits } from "../credits";

const STALE_MS = 2 * 60 * 1000;

/** Marks a generation as failed and refunds its credits exactly once. */
export async function failGeneration(db: DB, gen: Pick<Generation, "id" | "workspaceId">, message: string) {
  await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(generations).where(eq(generations.id, gen.id)).for("update");
    if (!cur || cur.status === "succeeded" || cur.status === "failed" || cur.status === "canceled") return;
    if (!cur.refunded) await refundGenerationCredits(cur.workspaceId, cur.id, tx);
    await tx
      .update(generations)
      .set({ status: "failed", error: message, refunded: true, finishedAt: new Date() })
      .where(eq(generations.id, gen.id));
  });
}

/**
 * Jobs whose owning process stopped heartbeating (crash, restart, deploy) are
 * failed and refunded so users never lose credits to infrastructure issues.
 */
export async function recoverInterruptedJobs(db: DB) {
  const cutoff = new Date(Date.now() - STALE_MS);
  const stale = await db
    .select({ id: generations.id, workspaceId: generations.workspaceId })
    .from(generations)
    .where(
      and(
        inArray(generations.status, ["queued", "running"]),
        or(isNull(generations.heartbeatAt), lt(generations.heartbeatAt, cutoff)),
      ),
    );
  for (const gen of stale) {
    await failGeneration(db, gen, "This job was interrupted by a server restart. Your credits were refunded.");
  }
  if (stale.length) console.log(`[jobs] recovered ${stale.length} interrupted job(s)`);
}
