import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "../db";
import { memberships, sessions, users, workspaces, type User, type Workspace } from "../db/schema";
import { env } from "../env";
import { forbidden, unauthorized } from "../http";
import { newToken, sha256 } from "../ids";
import { ensureCreditPeriod } from "../credits";

export const SESSION_COOKIE = "vitrine_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

export type Role = "owner" | "admin" | "member";

export interface AuthContext {
  user: Pick<User, "id" | "email" | "name" | "preferences" | "createdAt" | "defaultWorkspaceId">;
  workspace: Workspace;
  role: Role;
  sessionId: string;
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.appUrl.startsWith("https://"),
    path: "/",
    expires,
  };
}

export async function createSession(userId: string, workspaceId: string | null, req?: Request) {
  const db = await getDb();
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id: sha256(token),
    userId,
    workspaceId,
    userAgent: req?.headers.get("user-agent")?.slice(0, 300) ?? null,
    ip: req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    expiresAt,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
}

export async function destroyOtherSessions(userId: string, keepSessionId: string) {
  const db = await getDb();
  const all = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
  for (const s of all) {
    if (s.id !== keepSessionId) await db.delete(sessions).where(eq(sessions.id, s.id));
  }
}

/** Resolves the signed-in user and active workspace (memoized per request). */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const sid = sha256(token);
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sid), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  // Resolve the active workspace, falling back to the user's default one.
  const candidates = [row.session.workspaceId, row.user.defaultWorkspaceId].filter(Boolean) as string[];
  let ws: Workspace | undefined;
  let role: Role | undefined;
  for (const wsId of candidates) {
    const m = await db
      .select({ ws: workspaces, role: memberships.role })
      .from(memberships)
      .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
      .where(and(eq(memberships.workspaceId, wsId), eq(memberships.userId, row.user.id)))
      .limit(1);
    if (m[0]) {
      ws = m[0].ws;
      role = m[0].role as Role;
      break;
    }
  }
  if (!ws) {
    const m = await db
      .select({ ws: workspaces, role: memberships.role })
      .from(memberships)
      .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
      .where(eq(memberships.userId, row.user.id))
      .limit(1);
    if (!m[0]) return null;
    ws = m[0].ws;
    role = m[0].role as Role;
  }

  // Sliding expiration.
  if (row.session.expiresAt.getTime() - Date.now() < SESSION_TTL_MS - REFRESH_AFTER_MS) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, sid));
    try {
      jar.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
    } catch {
      // Cookies are read-only while rendering Server Components; the DB expiry is what matters.
    }
  }

  ws = await ensureCreditPeriod(ws);
  const { passwordHash: _ph, ...user } = row.user;
  void _ph;
  return { user, workspace: ws, role: role ?? "member", sessionId: sid };
});

/** For route handlers: returns the auth context or throws 401. */
export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw unauthorized();
  return auth;
}

export function requireRole(auth: AuthContext, roles: Role[]) {
  if (!roles.includes(auth.role)) throw forbidden("Only workspace owners and admins can do this.");
}

/** For pages: redirects to the login page when signed out. */
export async function requirePageAuth(next = "/app"): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect(`/login?next=${encodeURIComponent(next)}`);
  return auth;
}
