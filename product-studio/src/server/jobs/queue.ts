import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { GENERATION_TYPES, type GenerationType } from "@/lib/generation-types";
import { getDb } from "../db";
import { generations, type Generation } from "../db/schema";
import { newId } from "../ids";
import { JobError } from "./errors";
import { failGeneration } from "./recovery";

export { JobError };

// In-process job runner with two lanes: "cpu" for local image processing and
// "net" for calls to external AI APIs. Job state lives in the database; the
// owning process heartbeats its jobs so another instance can recover them if
// this one dies (see recovery.ts).

export interface JobContext {
  generation: Generation;
  params: Record<string, unknown>;
  progress: (pct: number, stage?: string) => Promise<void>;
}

export interface JobOutput {
  result: Record<string, unknown>;
  provider?: string;
}

export type JobHandler = (ctx: JobContext) => Promise<JobOutput>;

const LANES = { cpu: 2, net: 6 } as const;
type Lane = keyof typeof LANES;

interface QueueState {
  workerId: string;
  pending: Record<Lane, string[]>;
  running: Record<Lane, Set<string>>;
  heartbeat?: ReturnType<typeof setInterval>;
}

const g = globalThis as unknown as { __vitrineQueue?: QueueState };

function state(): QueueState {
  if (!g.__vitrineQueue) {
    g.__vitrineQueue = {
      workerId: newId("wrk", 10),
      pending: { cpu: [], net: [] },
      running: { cpu: new Set(), net: new Set() },
    };
  }
  return g.__vitrineQueue;
}

export function workerId() {
  return state().workerId;
}

export function enqueue(generationId: string, type: GenerationType) {
  const s = state();
  const lane: Lane = GENERATION_TYPES[type]?.queue ?? "net";
  s.pending[lane].push(generationId);
  startHeartbeat();
  void pump(lane);
}

function startHeartbeat() {
  const s = state();
  if (s.heartbeat) return;
  s.heartbeat = setInterval(async () => {
    const ids = [...s.pending.cpu, ...s.pending.net, ...s.running.cpu, ...s.running.net];
    if (!ids.length) return;
    try {
      const db = await getDb();
      await db
        .update(generations)
        .set({ heartbeatAt: new Date() })
        .where(and(inArray(generations.id, ids), eq(generations.workerId, s.workerId)));
    } catch (err) {
      console.error("[jobs] heartbeat failed", err);
    }
  }, 20_000);
  s.heartbeat.unref?.();
}

async function pump(lane: Lane) {
  const s = state();
  while (s.running[lane].size < LANES[lane] && s.pending[lane].length) {
    const id = s.pending[lane].shift()!;
    s.running[lane].add(id);
    void run(id).finally(() => {
      s.running[lane].delete(id);
      void pump(lane);
    });
  }
}

async function run(id: string) {
  const db = await getDb();
  const [gen] = await db
    .update(generations)
    .set({ status: "running", startedAt: new Date(), heartbeatAt: new Date(), progress: 2 })
    .where(and(eq(generations.id, id), eq(generations.status, "queued")))
    .returning();
  if (!gen) return; // canceled or already handled

  let lastWrite = 0;
  const progress = async (pct: number, stage?: string) => {
    const now = Date.now();
    if (now - lastWrite < 250 && pct < 100) return;
    lastWrite = now;
    await db
      .update(generations)
      .set({ progress: Math.max(0, Math.min(99, Math.round(pct))), stage: stage ?? undefined, heartbeatAt: new Date() })
      .where(eq(generations.id, id));
  };

  try {
    const { handlers } = await import("./handlers");
    const handler = handlers[gen.type as GenerationType];
    if (!handler) throw new Error(`No handler for generation type "${gen.type}"`);
    const out = await handler({ generation: gen, params: gen.params, progress });
    await db
      .update(generations)
      .set({
        status: "succeeded",
        progress: 100,
        stage: "Done",
        result: out.result,
        provider: out.provider ?? gen.provider,
        finishedAt: new Date(),
      })
      .where(eq(generations.id, id));
  } catch (err) {
    const message = userFacingError(err);
    console.error(`[jobs] ${gen.type} ${id} failed:`, err);
    await failGeneration(db, gen, message);
  }
}

function userFacingError(err: unknown): string {
  if (err instanceof JobError) return err.message;
  if (err instanceof Error && (err as Error & { expose?: boolean }).expose) return err.message;
  return "The generation failed unexpectedly. Your credits were refunded — please try again.";
}
