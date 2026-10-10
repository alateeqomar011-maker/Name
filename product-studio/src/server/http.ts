import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { env } from "./env";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, code = "bad_request") => new HttpError(400, msg, code);
export const unauthorized = (msg = "Please sign in to continue.") => new HttpError(401, msg, "unauthorized");
export const forbidden = (msg = "You don't have access to this resource.") => new HttpError(403, msg, "forbidden");
export const notFound = (msg = "Not found.") => new HttpError(404, msg, "not_found");

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json(
      { error: { message: err.message, code: err.code, ...err.details } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const where = first?.path?.length ? `${first.path.join(".")}: ` : "";
    return NextResponse.json(
      { error: { message: `${where}${first?.message ?? "Invalid input"}`, code: "validation_error" } },
      { status: 422 },
    );
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json(
    { error: { message: "Something went wrong on our side. Please try again.", code: "internal_error" } },
    { status: 500 },
  );
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/**
 * Wraps a route handler with error handling and a same-origin check for
 * state-changing requests (CSRF defense in addition to SameSite cookies).
 */
export function route<C = unknown>(handler: Handler<C>, opts: { skipOriginCheck?: boolean } = {}): Handler<C> {
  return async (req, ctx) => {
    try {
      if (!opts.skipOriginCheck && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        assertSameOrigin(req);
      }
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) {
    // Browsers always send Origin on cross-site POSTs; same-origin fetches from
    // older browsers may omit it. Fall back to Sec-Fetch-Site when available.
    const site = req.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") throw forbidden("Cross-site request blocked.");
    return;
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden("Invalid origin.");
  }
  const appHost = new URL(env.appUrl).host;
  if (originHost !== host && originHost !== appHost) throw forbidden("Cross-site request blocked.");
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
  return schema.parse(body);
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

// ── Simple fixed-window rate limiter (per process) ───────────────────────

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return;
  }
  b.count += 1;
  if (b.count > limit) {
    const secs = Math.ceil((b.resetAt - now) / 1000);
    throw new HttpError(429, `Too many requests. Please try again in ${secs}s.`, "rate_limited");
  }
}
